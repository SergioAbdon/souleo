// Transforma um cadastro recem-feito em MEMBRO de uma conta existente.
//
// O cadastro do LEO ainda cria uma "ilha": um local vazio so para a pessoa.
// Enquanto o convite nao existe (Plano 2), este script corrige na mao:
//   1. acha o uid pelo e-mail (Firebase Auth)
//   2. cria vinculos/{contaId}_{uid} com o papel escolhido
//   3. apaga a ilha (local vazio + assinatura + vinculo antigo dela)
//
// Uso:
//   node --env-file=.env.local scripts/secao1/02-vincular-membro.mjs \
//     --email=pessoa@exemplo.com --conta=<contaId> --papel=recepcao [--local=<wsId>] [--commit]
//
// --local pode repetir. Sem --local, a pessoa alcanca todos os locais da conta.
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb, COMMIT, modo } from './lib-admin.mjs';

const db = getDb();
const PAPEIS = ['dono', 'medico', 'recepcao'];

function arg(nome) {
  const p = process.argv.find(a => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : null;
}
function args(nome) {
  return process.argv.filter(a => a.startsWith(`--${nome}=`)).map(a => a.slice(nome.length + 3));
}

async function main() {
  console.log(`MODO: ${modo()}\n`);

  const email = arg('email');
  const contaId = arg('conta');
  const papel = arg('papel');
  const locais = args('local');

  if (!email || !contaId || !papel) {
    console.error('Faltou argumento. Uso:\n  --email=... --conta=... --papel=dono|medico|recepcao [--local=wsId ...] [--commit]');
    process.exit(1);
  }
  if (!PAPEIS.includes(papel)) {
    console.error(`Papel invalido: ${papel}. Use um de: ${PAPEIS.join(', ')}`);
    process.exit(1);
  }

  // 1. Quem e a pessoa
  let user;
  try {
    user = await getAuth().getUserByEmail(email);
  } catch {
    console.error(`Nenhum usuario com o e-mail ${email}. Ela ja se cadastrou e verificou o e-mail?`);
    process.exit(1);
  }
  console.log(`Pessoa:   ${user.displayName ?? '(sem nome)'} <${user.email}>`);
  console.log(`uid:      ${user.uid}`);
  console.log(`e-mail verificado: ${user.emailVerified}`);
  if (!user.emailVerified) console.log('AVISO: e-mail ainda nao verificado — ela nao consegue entrar.');

  // 2. A conta existe?
  const conta = await db.doc(`contas/${contaId}`).get();
  if (!conta.exists) {
    console.error(`Conta ${contaId} nao existe. Rode "npm run secao1:inventario" para ver as contas.`);
    process.exit(1);
  }
  console.log(`Conta:    ${conta.data().nome} (${contaId})\n`);

  // 2b. Os --local informados existem e sao mesmo desta conta?
  for (const wsId of locais) {
    const ws = await db.doc(`workspaces/${wsId}`).get();
    if (!ws.exists) {
      console.error(`Local ${wsId} nao existe. Um typo aqui grava um vinculo que nao da acesso a nada.`);
      process.exit(1);
    }
    if (ws.data().contaId !== contaId) {
      console.error(`Local ${wsId} pertence a conta ${ws.data().contaId ?? '(nenhuma)'}, nao a ${contaId}.`);
      process.exit(1);
    }
  }

  // 2c. Ja existe vinculo dessa pessoa nessa conta? Sobrescrever em silencio
  // trocaria papel e locais sem ninguem perceber.
  const vincExistente = await db.doc(`vinculos/${contaId}_${user.uid}`).get();
  if (vincExistente.exists && !process.argv.includes('--forcar')) {
    const v = vincExistente.data();
    console.error(
      `Ja existe vinculo desta pessoa nesta conta:\n` +
      `  papel=${v.papel}  locais=${JSON.stringify(v.locais)}  status=${v.status}\n` +
      `Se a intencao e MUDAR isso, rode de novo com --forcar.`
    );
    process.exit(1);
  }

  // 3. A ilha que o cadastro dela criou (local proprio, vazio)
  const ilhas = await db.collection('workspaces').where('ownerUid', '==', user.uid).get();
  const paraApagar = [];
  if (ilhas.size > 1) {
    console.log(
      `ATENCAO: esta pessoa e dona de ${ilhas.size} locais (${ilhas.docs.map(d => d.id).join(', ')}).\n` +
      `Nao vou apagar nenhum automaticamente — apagar o local errado nao tem volta.\n` +
      `Apague na mao o que for a ilha e rode este script de novo.`
    );
  } else {
    for (const ws of ilhas.docs) {
      // "Vazio" precisa considerar TODAS as subcolecoes que o app usa: apagar o
      // documento pai no Firestore NAO apaga as subcolecoes, elas viram orfas.
      const contagens = await Promise.all(
        ['exames', 'pacientes', 'config', 'extratos'].map(async (sub) => [
          sub, (await ws.ref.collection(sub).count().get()).data().count,
        ])
      );
      const naoVazias = contagens.filter(([, n]) => n > 0);
      if (naoVazias.length > 0) {
        console.log(
          `Local ${ws.id} NAO sera apagado — tem ${naoVazias.map(([s, n]) => `${n} ${s}`).join(', ')}.`
        );
        continue;
      }
      paraApagar.push(ws.ref);
      const subs = await db.collection('subscriptions').where('workspaceId', '==', ws.id).get();
      subs.docs.forEach(s => paraApagar.push(s.ref));
      const vincs = await db.collection('vinculos').where('workspaceId', '==', ws.id).get();
      vincs.docs.forEach(v => paraApagar.push(v.ref));
    }
  }

  // 4. O vinculo novo
  const vincId = `${contaId}_${user.uid}`;
  const vinculo = {
    id: vincId, contaId, medicoUid: user.uid,
    papel, locais, status: 'ativo',
    criadoEm: FieldValue.serverTimestamp(),
    _vinculadoPorScript: { email, em: new Date().toISOString() },
  };

  console.log('=== O QUE VAI ACONTECER ===');
  console.log(`criar   vinculos/${vincId}  papel=${papel}  locais=${locais.length ? locais.join(',') : '(todos da conta)'}`);
  for (const ref of paraApagar) console.log(`apagar  ${ref.path}`);

  if (!COMMIT) {
    console.log('\nENSAIO. Nada foi gravado. Rode de novo com --commit para valer.');
    return;
  }

  const lote = db.batch();
  lote.set(db.doc(`vinculos/${vincId}`), vinculo);
  for (const ref of paraApagar) lote.delete(ref);
  await lote.commit();
  console.log(`\nGRAVADO: 1 vinculo criado, ${paraApagar.length} documentos apagados.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
