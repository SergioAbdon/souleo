// Fases 1-3 do plano. ADITIVO: nao apaga nem move nada.
// Ensaio por padrao. Grava so com --commit.
//
// 1. Uma conta por workspace existente (PF por padrao; PJ se workspace.tipo === 'PJ')
// 2. workspace.contaId
// 3. vinculos/{contaId}_{uid} com papel + locais  (os antigos ficam, marcados)
// 4. subscriptions/{contaId}  (a antiga fica, marcada)
import { getDb, COMMIT, modo } from './lib-admin.mjs';
import { FieldValue } from 'firebase-admin/firestore';

const db = getDb();
const MARCA = '_migracaoSecao1';   // marcador reversivel, igual ao usado em maio

function papelDe(vinculo, workspace) {
  if (workspace.ownerUid && vinculo.medicoUid === workspace.ownerUid) return 'dono';
  const role = String(vinculo.role ?? '').toLowerCase();
  if (role === 'assistente' || role === 'recepcao') return 'recepcao';
  return 'medico';
}

async function main() {
  console.log(`MODO: ${modo()}\n`);
  const plano = [];

  const workspaces = await db.collection('workspaces').get();
  const vinculos = await db.collection('vinculos').get();
  const subscriptions = await db.collection('subscriptions').get();

  for (const ws of workspaces.docs) {
    const w = ws.data();

    // `wader-dev` (ambiente de teste do Wader) nao tem dono nem vinculo nem
    // assinatura — nao e cliente, nao vira conta. O Wader fala com ele por
    // Admin SDK, que ignora as regras.
    if (!w.ownerUid) {
      console.log(`- local ${ws.id} ("${w.nomeClinica ?? ''}") sem ownerUid — ambiente de teste, pulando`);
      continue;
    }

    if (w.contaId) {
      console.log(`- local ${ws.id}: ja tem contaId=${w.contaId}, pulando criacao de conta`);
      continue;
    }

    const contaRef = db.collection('contas').doc();
    const conta = {
      id: contaRef.id,
      tipo: w.tipo === 'PJ' ? 'PJ' : 'PF',
      nome: w.nomeClinica || 'Conta',
      ownerUid: w.ownerUid ?? null,
      empresaId: w.empresaId ?? null,
      status: 'ativa',
      criadoEm: FieldValue.serverTimestamp(),
      [MARCA]: { origemWorkspace: ws.id, em: new Date().toISOString() },
    };
    plano.push({ o: 'criar conta', ref: contaRef, dados: conta });
    plano.push({ o: 'marcar local', ref: ws.ref, dados: { contaId: contaRef.id }, merge: true });

    // Vinculos deste workspace
    const doWs = vinculos.docs.filter(v => v.data().workspaceId === ws.id);
    for (const v of doWs) {
      const vd = v.data();
      const novoId = `${contaRef.id}_${vd.medicoUid}`;
      plano.push({
        o: 'criar vinculo', ref: db.collection('vinculos').doc(novoId),
        dados: {
          id: novoId,
          contaId: contaRef.id,
          medicoUid: vd.medicoUid,
          papel: papelDe(vd, w),
          locais: [],                       // vazio = todos os locais da conta
          status: vd.status ?? 'ativo',
          criadoEm: vd.criadoEm ?? FieldValue.serverTimestamp(),
          [MARCA]: { origemVinculo: v.id, roleAntigo: vd.role ?? null },
        },
      });
      plano.push({ o: 'marcar vinculo antigo', ref: v.ref, dados: { [MARCA + 'Substituido']: novoId }, merge: true });
    }

    // Assinatura deste workspace
    const subs = subscriptions.docs.filter(s => s.data().workspaceId === ws.id);
    if (subs.length === 0) {
      console.log(`  ATENCAO: local ${ws.id} nao tem assinatura`);
    } else {
      if (subs.length > 1) console.log(`  ATENCAO: local ${ws.id} tem ${subs.length} assinaturas; usando a primeira (${subs[0].id})`);
      // O `workspaceId` NAO vai para a assinatura nova. Se fosse junto, o
      // getSubscription() atual (where workspaceId == wsId, limit 1) passaria a
      // casar com DOIS documentos e o consumo de franquia cairia ora num, ora
      // noutro. A nova e endereçada por contaId; a origem fica no marcador.
      const { workspaceId: wsOrigem, ...restoSub } = subs[0].data();
      plano.push({
        o: 'criar assinatura', ref: db.collection('subscriptions').doc(contaRef.id),
        dados: {
          ...restoSub, id: contaRef.id, contaId: contaRef.id,
          [MARCA]: { origemSub: subs[0].id, workspaceIdOrigem: wsOrigem },
        },
      });
      plano.push({ o: 'marcar assinatura antiga', ref: subs[0].ref, dados: { [MARCA + 'Substituida']: contaRef.id }, merge: true });
    }
  }

  console.log(`\n=== ${plano.length} operacoes ===`);
  for (const p of plano) console.log(`${p.o.padEnd(24)} ${p.ref.path}`);

  if (!COMMIT) {
    console.log('\nENSAIO. Nada foi gravado. Rode de novo com --commit para valer.');
    return;
  }

  const lote = db.batch();
  for (const p of plano) {
    if (p.merge) lote.set(p.ref, p.dados, { merge: true });
    else lote.set(p.ref, p.dados);
  }
  await lote.commit();
  console.log(`\nGRAVADO: ${plano.length} operacoes em um unico lote atomico.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
