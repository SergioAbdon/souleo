// Somente leitura. Nao escreve nada. Responde: o que existe hoje?
import { getDb } from './lib-admin.mjs';

const db = getDb();

async function main() {
  const [profissionais, empresas, workspaces, vinculos, subscriptions] =
    await Promise.all([
      db.collection('profissionais').get(),
      db.collection('empresas').get(),
      db.collection('workspaces').get(),
      db.collection('vinculos').get(),
      db.collection('subscriptions').get(),
    ]);

  console.log('=== CONTAGEM ===');
  for (const [nome, snap] of [
    ['profissionais', profissionais], ['empresas', empresas],
    ['workspaces', workspaces], ['vinculos', vinculos],
    ['subscriptions', subscriptions],
  ]) console.log(`${nome.padEnd(15)} ${snap.size}`);

  console.log('\n=== LOCAIS (workspaces) ===');
  for (const d of workspaces.docs) {
    const w = d.data();
    const exames = await d.ref.collection('exames').count().get();
    const pacientes = await d.ref.collection('pacientes').count().get();
    console.log(
      `${d.id}  tipo=${w.tipo ?? '?'}  nome=${JSON.stringify(w.nomeClinica ?? '')}  ` +
      `owner=${w.ownerUid ?? '-'}  contaId=${w.contaId ?? 'AUSENTE'}  ` +
      `exames=${exames.data().count}  pacientes=${pacientes.data().count}  ` +
      `segredos=[${['feegowToken','ortancUrl','ortancUser','ortancPass'].filter(k => w[k]).join(',') || 'nenhum'}]`
    );
  }

  console.log('\n=== VINCULOS ===');
  for (const d of vinculos.docs) {
    const v = d.data();
    const idDeterministico = /^[A-Za-z0-9]+_[A-Za-z0-9]+$/.test(d.id);
    console.log(
      `${d.id}  medicoUid=${v.medicoUid}  workspaceId=${v.workspaceId ?? '-'}  ` +
      `contaId=${v.contaId ?? 'AUSENTE'}  role=${v.role ?? '-'}  papel=${v.papel ?? 'AUSENTE'}  ` +
      `status=${v.status}  idDeterministico=${idDeterministico}`
    );
  }

  console.log('\n=== ASSINATURAS ===');
  for (const d of subscriptions.docs) {
    const s = d.data();
    console.log(
      `${d.id}  workspaceId=${s.workspaceId ?? '-'}  contaId=${s.contaId ?? 'AUSENTE'}  ` +
      `tipo=${s.tipo}  franquia=${s.franquiaUsada ?? 0}/${s.franquiaMensal ?? '?'}`
    );
  }

  const porWs = {};
  for (const d of subscriptions.docs) {
    const ws = d.data().workspaceId;
    if (ws) (porWs[ws] ??= []).push(d.id);
  }
  const dupes = Object.entries(porWs).filter(([, ids]) => ids.length > 1);
  console.log(dupes.length
    ? `\nATENCAO: assinatura duplicada: ${JSON.stringify(dupes)}`
    : '\nNenhuma assinatura duplicada.');

  console.log('\n=== SUPERADMINS / ADMINROLE ===');
  for (const d of profissionais.docs) {
    const p = d.data();
    if (p.superadmin === true || p.adminRole) {
      console.log(`${d.id}  nome=${JSON.stringify(p.nome ?? '')}  superadmin=${p.superadmin === true}  adminRole=${p.adminRole ?? '-'}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
