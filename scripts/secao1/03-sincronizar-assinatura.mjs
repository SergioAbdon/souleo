// Recopia contadores do doc de assinatura ANTIGO (por workspaceId) para o
// NOVO (subscriptions/{contaId}). Rodar NO CUTOVER (deploy do Plano 2A),
// com a clinica parada: depois do deploy, quem debita e o doc novo.
// Ensaio por padrao; --commit grava. Reexecutavel (copia de novo, idempotente).
import { getDb, COMMIT, modo } from './lib-admin.mjs';

const db = getDb();
const CAMPOS = ['franquiaUsada', 'creditosExtras', 'cicloInicio', 'cicloFim'];

async function main() {
  console.log(`MODO: ${modo()}\n`);
  const antigas = await db.collection('subscriptions').get();
  let n = 0;
  for (const d of antigas.docs) {
    const s = d.data();
    const contaId = s._migracaoSecao1Substituida;
    if (!s.workspaceId || !contaId) continue;   // so docs antigos ja substituidos
    const novoRef = db.doc(`subscriptions/${contaId}`);
    const novo = await novoRef.get();
    if (!novo.exists) { console.log(`ATENCAO: ${contaId} nao existe, pulando`); continue; }
    const delta = {};
    for (const c of CAMPOS) if (s[c] !== undefined) delta[c] = s[c];
    console.log(`${d.id} → subscriptions/${contaId}`);
    for (const c of CAMPOS) {
      const de = JSON.stringify(novo.data()[c]?.toDate?.() ?? novo.data()[c] ?? null);
      const para = JSON.stringify(s[c]?.toDate?.() ?? s[c] ?? null);
      console.log(`  ${c.padEnd(15)} ${de} → ${para}`);
    }
    if (COMMIT) { await novoRef.set(delta, { merge: true }); n++; }
  }
  console.log(COMMIT ? `\nGRAVADO: ${n} assinaturas sincronizadas.` : '\nENSAIO. Nada gravado.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
