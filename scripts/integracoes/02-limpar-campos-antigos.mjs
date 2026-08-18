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
const CAMPOS_APAGAVEIS = Object.freeze(['feegowToken', 'feegowProcMap', 'ortancUrl', 'ortancUser', 'ortancPass']);
if (CAMPOS_APAGAVEIS.includes('ortancAtivo')) throw new Error('ortancAtivo NUNCA pode entrar em CAMPOS_APAGAVEIS.');

// Campo legado -> onde a migração deveria ter guardado a cópia, e se é
// segredo (privado/*, precisa ter chegado lá antes de apagar a origem —
// senão é perda de dado irreversível) ou dado público (basta o doc
// integracoes/{tipo} existir).
const DESTINO = {
  feegowToken:    { tipo: 'feegow',  segredo: (priv) => typeof priv?.token === 'string' && priv.token !== '' },
  feegowProcMap:  { tipo: 'feegow',  segredo: null },
  ortancUrl:      { tipo: 'orthanc', segredo: null },
  ortancUser:     { tipo: 'orthanc', segredo: (priv) => typeof priv?.user === 'string' && priv.user !== '' },
  ortancPass:     { tipo: 'orthanc', segredo: (priv) => typeof priv?.pass === 'string' && priv.pass !== '' },
};

async function planoParaWorkspace(ws) {
  const w = ws.data();
  const presentes = CAMPOS_APAGAVEIS.filter((c) => w[c] !== undefined);
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
    const { tipo, segredo } = DESTINO[campo];
    if (!integSnaps[tipo].exists) {
      linhas.push(`    ${campo}: integracoes/${tipo} ainda não existe — RECUSANDO apagar (migração não rodou pra este tipo)`);
      continue;
    }
    if (segredo && !segredo(privSnaps[tipo].data())) {
      linhas.push(`    ${campo}: privado/${tipo} não tem a cópia do segredo — RECUSANDO apagar (perda de dado)`);
      continue;
    }
    paraApagar.push(campo);
    linhas.push(`    ${campo}: cópia confirmada em ${segredo ? `privado/${tipo}` : `integracoes/${tipo}`}, apagar`);
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
    console.log('ENSAIO. Nada foi gravado. Rode de novo com --commit para valer.');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
