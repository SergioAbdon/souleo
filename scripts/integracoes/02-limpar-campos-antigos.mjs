// Sub-plano 5, Task 6 — apaga do documento do local os campos legados que a
// migração (01-migrar.mjs) já copiou para a entidade nova.
//
// ⚠️ NUNCA apagar `ortancAtivo`. SidebarLaudo.tsx:187 lê esse campo do
// documento do local pra mostrar o botão "Importar DICOM" na tela do laudo A
// QUALQUER MÉDICO; a entidade nova (workspaces/{wsId}/integracoes/orthanc)
// só o dono lê. `ortancAtivo` fica no documento do local DE PROPÓSITO,
// espelhado por salvarIntegracao() a cada save. Por isso a lista de campos
// apagáveis abaixo é FECHADA (nomeada um por um) — nunca um padrão
// "tudo que começa com ortanc", que pegaria ortancAtivo por engano.
import { getDb, COMMIT, modo } from '../secao1/lib-admin.mjs';
import { FieldValue } from 'firebase-admin/firestore';

const db = getDb();

// Lista fechada. NÃO adicionar 'ortancAtivo' aqui.
//
// 'feegowProcMap' FICA DE FORA DESTA RODADA (nao por achado pendente: os dois
// leitores ja migraram — resolverProcMap em src/lib/feegow-admin.ts e
// getProcedimentos em apps/wader/src/adapters/workspace-repo.ts leem
// integracoes/feegow.procMap, nenhum dos dois olha mais o campo antigo do
// documento do local (Task 7)). procMap NÃO é credencial — o objetivo desta
// fase é so tirar segredo do documento do local — mas apagar o campo antigo
// ainda é decisão do Dr. Sérgio, por prudência, até ele confirmar em produção
// que a importação do Feegow continua trazendo os 17 procedimentos de sempre.
// Só depois dessa verificação 'feegowProcMap' entra nesta lista.
const CAMPOS_APAGAVEIS = Object.freeze(['feegowToken', 'ortancUrl', 'ortancUser', 'ortancPass']);
if (CAMPOS_APAGAVEIS.includes('ortancAtivo')) throw new Error('ortancAtivo NUNCA pode entrar em CAMPOS_APAGAVEIS.');

// Campo legado -> onde a migração deveria ter guardado a cópia, e como
// conferir que o VALOR REAL chegou lá (não só que o documento existe —
// achado Critical da revisão: um doc `integracoes/{tipo}` pode existir por
// outro caminho, ex. alguém salvou a tela /integracoes antes da migração
// rodar, com conteúdo diferente do que a migração ia gravar; nesse caso o
// 01 recusa sobrescrever e o valor real nunca chega no destino). Cada campo
// declara `copiaConfirmada(integData, privData, valorLegado)` e confere por
// IGUALDADE com o valor legado — presença no destino não basta: a tela pode
// ter gravado um valor DIFERENTE do que está aqui, e aí apagar a origem
// destrói o valor real. Divergência = recusa (lado seguro): o operador vê a
// linha e decide.
const DESTINO = {
  feegowToken: {
    tipo: 'feegow',
    onde: 'privado/feegow',
    copiaConfirmada: (_integ, priv, legado) => priv?.token === legado,
  },
  ortancUrl: {
    tipo: 'orthanc',
    onde: 'integracoes/orthanc',
    copiaConfirmada: (integ, _priv, legado) => integ?.url === legado,
  },
  ortancUser: {
    tipo: 'orthanc',
    onde: 'privado/orthanc',
    copiaConfirmada: (_integ, priv, legado) => priv?.user === legado,
  },
  ortancPass: {
    tipo: 'orthanc',
    onde: 'privado/orthanc',
    copiaConfirmada: (_integ, priv, legado) => priv?.pass === legado,
  },
};

// Tripwire (junto do de ortancAtivo acima, roda no carregamento do módulo):
// toda entrada da lista de apagáveis tem que ter destino declarado, senão um
// campo novo entra na lista sem ninguém saber como conferir o valor real —
// e o script se recusa a rodar em vez de arriscar apagar sem checar.
for (const campo of CAMPOS_APAGAVEIS) {
  if (typeof DESTINO[campo]?.copiaConfirmada !== 'function') throw new Error(`Campo apagável '${campo}' sem copiaConfirmada em DESTINO — declare tipo, onde e copiaConfirmada antes de rodar.`);
}

async function planoParaWorkspace(ws) {
  const w = ws.data();
  // null e undefined contam igual: LocalModal.tsx grava `null` pra campo
  // vazio (achado Minor da revisão) — um local que salvou o modal com
  // Orthanc em branco não tem nada pra proteger nesse campo.
  const presentes = CAMPOS_APAGAVEIS.filter((c) => w[c] !== undefined && w[c] !== null);
  if (presentes.length === 0) return { qualifica: false, linhas: [] };

  const tiposEnvolvidos = [...new Set(presentes.map((c) => DESTINO[c].tipo))];
  const integSnaps = {};
  const privSnaps = {};
  for (const tipo of tiposEnvolvidos) {
    integSnaps[tipo] = await ws.ref.collection('integracoes').doc(tipo).get();
    privSnaps[tipo] = await ws.ref.collection('privado').doc(tipo).get();
  }

  const linhas = [];
  const paraApagar = [];

  for (const campo of presentes) {
    const { tipo, onde, copiaConfirmada } = DESTINO[campo];
    if (!integSnaps[tipo].exists) {
      linhas.push(`    ${campo}: integracoes/${tipo} ainda não existe — RECUSANDO apagar (migração não rodou pra este tipo)`);
      continue;
    }
    if (!copiaConfirmada(integSnaps[tipo].data(), privSnaps[tipo].data(), w[campo])) {
      linhas.push(`    ${campo}: valor em ${onde} NÃO é igual ao daqui — RECUSANDO apagar (perda de dado)`);
      continue;
    }
    paraApagar.push(campo);
    linhas.push(`    ${campo}: cópia confirmada em ${onde}, apagar`);
  }

  return { qualifica: true, linhas, paraApagar };
}

async function main() {
  console.log(`MODO: ${modo()}\n`);

  const workspaces = await db.collection('workspaces').get();
  let totalCampos = 0;

  for (const ws of workspaces.docs) {
    const { qualifica, linhas, paraApagar = [] } = await planoParaWorkspace(ws);
    if (!qualifica) continue;
    console.log(`- local ${ws.id} ("${ws.data().nomeClinica ?? ''}"):`);
    for (const l of linhas) console.log(l);
    totalCampos += paraApagar.length;

    if (COMMIT && paraApagar.length > 0) {
      const update = {};
      for (const campo of paraApagar) update[campo] = FieldValue.delete();
      await ws.ref.update(update);
      console.log(`    GRAVADO: ${paraApagar.length} campo(s) apagado(s).`);
    }
  }

  console.log(`\n=== ${totalCampos} campos elegíveis para apagar ===`);
  if (!COMMIT) {
    console.log('\nENSAIO. Nada foi gravado.');
    console.log('>>> Pra gravar de valer, rode (o "--" é obrigatório, senão o npm engole a flag):');
    console.log('>>>   npm run integracoes:limpar -- --commit');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
