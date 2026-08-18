// Sub-plano 5, Task 6 — migra credenciais do documento do local
// (workspaces/{wsId}.feegowToken/ortancUrl/ortancUser/ortancPass/feegowProcMap)
// para a entidade nova: workspaces/{wsId}/integracoes/{tipo} (público) e
// workspaces/{wsId}/privado/{tipo} (segredo, `allow read, write: if false`
// nas regras — só o Admin SDK, rodando aqui ou em /api/integracoes, alcança).
//
// ADITIVO: nao apaga nem move nada do documento do local. A limpeza é o
// script 02. Ensaio por padrao. Grava so com --commit.
//
// Ordem de gravação: privado/{tipo} e integracoes/{tipo} vão no MESMO
// writeBatch. A Task 5 mostrou que se integracoes/orthanc.ativo=true existir
// sem privado/orthanc ainda existir, o Wader (ja endurecido) trata como
// "credencial não cadastrada" e para de trazer imagem até o próximo ciclo de
// cache — o Wader se protege dessa janela, mas o script não deveria criá-la
// de propósito. Duas escritas sequenciais (privado antes do público) ainda
// deixariam uma janela real entre elas se o processo caísse no meio; um único
// batch é atômico — ou os dois documentos aparecem juntos, ou nenhum aparece.
import { getDb, COMMIT, modo } from '../secao1/lib-admin.mjs';

const db = getDb();

// Campos legados lidos do documento do local (workspaces/{wsId}).
function legado(w) {
  const feegowToken = typeof w.feegowToken === 'string' && w.feegowToken.trim() !== '' ? w.feegowToken : undefined;
  const ortancUrl = typeof w.ortancUrl === 'string' && w.ortancUrl.trim() !== '' ? w.ortancUrl : undefined;
  const ortancUser = typeof w.ortancUser === 'string' && w.ortancUser.trim() !== '' ? w.ortancUser : undefined;
  const ortancPass = typeof w.ortancPass === 'string' && w.ortancPass.trim() !== '' ? w.ortancPass : undefined;
  const feegowProcMap = (w.feegowProcMap && typeof w.feegowProcMap === 'object' && Object.keys(w.feegowProcMap).length > 0)
    ? w.feegowProcMap
    : undefined;
  const ortancAtivo = w.ortancAtivo === true;
  return { feegowToken, ortancUrl, ortancUser, ortancPass, feegowProcMap, ortancAtivo };
}

// Compara sem nunca imprimir segredo — só diz se bate ou não.
function igual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function planoParaWorkspace(ws) {
  const w = ws.data();
  const { feegowToken, ortancUrl, ortancUser, ortancPass, feegowProcMap, ortancAtivo } = legado(w);

  if (!feegowToken && !ortancUrl && !feegowProcMap) return { qualifica: false, linhas: [] };

  const linhas = [];
  const ops = [];

  const alvoIntegFeegow = ws.ref.collection('integracoes').doc('feegow');
  const alvoIntegOrthanc = ws.ref.collection('integracoes').doc('orthanc');
  const alvoPrivFeegow = ws.ref.collection('privado').doc('feegow');
  const alvoPrivOrthanc = ws.ref.collection('privado').doc('orthanc');

  const [snapIntegFeegow, snapIntegOrthanc, snapPrivFeegow, snapPrivOrthanc] = await Promise.all([
    alvoIntegFeegow.get(), alvoIntegOrthanc.get(), alvoPrivFeegow.get(), alvoPrivOrthanc.get(),
  ]);

  const novoIntegFeegow = { tipo: 'feegow', ativo: !!feegowToken, status: 'nunca_testado', procMap: feegowProcMap ?? {} };
  const novoIntegOrthanc = { tipo: 'orthanc', ativo: ortancAtivo, status: 'nunca_testado', ...(ortancUrl ? { url: ortancUrl } : {}) };

  for (const [nome, snap, alvo, novo, temSegredo] of [
    ['integracoes/feegow', snapIntegFeegow, alvoIntegFeegow, novoIntegFeegow, false],
    ['integracoes/orthanc', snapIntegOrthanc, alvoIntegOrthanc, novoIntegOrthanc, false],
  ]) {
    if (!snap.exists) {
      ops.push({ o: 'criar', ref: alvo, dados: novo });
      linhas.push(`    criar ${nome}`);
    } else if (igual(snap.data(), novo)) {
      linhas.push(`    ${nome}: já existe, igual, pulando`);
    } else {
      linhas.push(`    ${nome}: já existe com conteúdo DIFERENTE, recusando sobrescrever`);
    }
  }

  if (feegowToken) {
    const novo = { token: feegowToken };
    if (!snapPrivFeegow.exists) {
      ops.push({ o: 'criar', ref: alvoPrivFeegow, dados: novo });
      linhas.push('    criar privado/feegow (token presente)');
    } else if (igual(snapPrivFeegow.data(), novo)) {
      linhas.push('    privado/feegow: já existe, igual (token presente), pulando');
    } else {
      linhas.push('    privado/feegow: já existe com conteúdo DIFERENTE (token presente), recusando sobrescrever');
    }
  } else {
    linhas.push('    privado/feegow: sem token no local, pulando');
  }

  if (ortancUser || ortancPass) {
    const novo = { ...(ortancUser ? { user: ortancUser } : {}), ...(ortancPass ? { pass: ortancPass } : {}) };
    if (!snapPrivOrthanc.exists) {
      ops.push({ o: 'criar', ref: alvoPrivOrthanc, dados: novo });
      linhas.push('    criar privado/orthanc (' + [ortancUser && 'user presente', ortancPass && 'senha presente'].filter(Boolean).join(', ') + ')');
    } else if (igual(snapPrivOrthanc.data(), novo)) {
      linhas.push('    privado/orthanc: já existe, igual, pulando');
    } else {
      linhas.push('    privado/orthanc: já existe com conteúdo DIFERENTE, recusando sobrescrever');
    }
  } else {
    linhas.push('    privado/orthanc: sem user/senha no local, pulando');
  }

  return { qualifica: true, linhas, ops };
}

async function main() {
  console.log(`MODO: ${modo()}\n`);

  const workspaces = await db.collection('workspaces').get();
  let totalOps = 0;

  for (const ws of workspaces.docs) {
    const { qualifica, linhas, ops = [] } = await planoParaWorkspace(ws);
    if (!qualifica) continue;
    console.log(`- local ${ws.id} ("${ws.data().nomeClinica ?? ''}"):`);
    for (const l of linhas) console.log(l);
    totalOps += ops.length;

    if (COMMIT && ops.length > 0) {
      const lote = db.batch();
      for (const op of ops) lote.set(op.ref, op.dados);
      await lote.commit();
      console.log(`    GRAVADO: ${ops.length} documento(s) em lote atômico.`);
    }
  }

  console.log(`\n=== ${totalOps} operações de criação identificadas ===`);
  if (!COMMIT) {
    console.log('ENSAIO. Nada foi gravado. Rode de novo com --commit para valer.');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
