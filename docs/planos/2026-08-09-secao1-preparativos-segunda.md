# Preparativos para segunda-feira (cadastro da recepção) — Plano 1.5

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Deixar o LEO pronto para a secretária da MedCardio se cadastrar sozinha na segunda-feira e trabalhar dentro do local do Dr. Sérgio como recepção — sem esperar o Plano 2.

**Architecture:** A migração do Plano 1 já criou `contas`, `workspaces.contaId` e `vinculos/{contaId}_{uid}` com `papel`. A tranca publicada (`firestore.rules`) só reconhece o **dono** do local, então uma segunda pessoa no mesmo local não enxerga nada. Este plano ensina a tranca a reconhecer **membro da conta** usando exatamente o modelo já migrado — é antecipar um pedaço da fechadura definitiva, não inventar um conceito novo. Mais um script que transforma o cadastro dela em recepção, e os dois links que faltavam na tela de login.

**Tech Stack:** Firestore Security Rules, emulador + `node --test`, firebase-admin (Admin SDK), Next.js 16 / React 19.

## Global Constraints

- Branch `feat/secao1-contas`. **Nunca commitar em `master`.**
- `firestore.rules` é a regra **publicada em produção**. Alterá-la exige rodar `npm run test:rules` verde ANTES de qualquer deploy. Quem publica é o orquestrador, não o implementador — **nenhuma tarefa roda `firebase deploy`**.
- `firestore.rules.definitiva` não se toca neste plano.
- Papéis válidos, exatamente: `'dono'`, `'medico'`, `'recepcao'`.
- `vinculo.locais`: array vazio = todos os locais da conta; preenchido = só aqueles.
- Emulador exige Java 21: `export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"`.
- `node --test <pasta>` não funciona no Windows — aponte o arquivo.
- Nenhum script deste plano escreve em produção sem `--commit` (padrão é ensaio).
- Dados reais em jogo: 208 pacientes, 191 exames. Nenhuma tarefa toca `exames` ou `pacientes`.
- **Não use `git stash` neste repositório** — há um daemon mexendo em arquivos e ele já engoliu edições não commitadas.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `firestore.rules` (modificar) | Passa a reconhecer membro da conta, com limites por papel. |
| `tests/rules/interim.test.mjs` (modificar) | Ganha o bloco E) com os casos da recepção. |
| `scripts/secao1/02-vincular-membro.mjs` (criar) | Converte um cadastro recém-feito em membro (papel + local) e apaga a ilha vazia. Ensaio por padrão. |
| `src/app/login/page.tsx` (modificar) | "Esqueci minha senha" e "reenviar verificação". |
| `package.json` (modificar) | Script `secao1:vincular`. |

---

## Task 1: A tranca passa a reconhecer membro da conta

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/rules/interim.test.mjs`

**Interfaces:**
- Consome: `workspaces.contaId`, `contas.ownerUid`, `vinculos/{contaId}_{uid}` com `papel`, `locais`, `status`.
- Produz: acesso de membro na regra publicada — pré-requisito das Tasks 2 e 3.

- [ ] **Step 1: Escrever os testes primeiro**

Em `tests/rules/interim.test.mjs`, dentro do `before()`, **acrescente** ao final do bloco `withSecurityRulesDisabled` (mantendo tudo que já existe):

```javascript
    // Membros da conta do MedCardio (modelo migrado): recepcao e um 2o medico.
    await setDoc(doc(db, 'profissionais', 'uidRecepcao'), { nome: 'Recepcao', superadmin: false });
    await setDoc(doc(db, 'profissionais', 'uidMedico2'), { nome: 'Medico 2', superadmin: false });
    await setDoc(doc(db, 'vinculos', 'contaMedCardio_uidRecepcao'), {
      contaId: 'contaMedCardio', medicoUid: 'uidRecepcao',
      papel: 'recepcao', locais: [], status: 'ativo',
    });
    await setDoc(doc(db, 'vinculos', 'contaMedCardio_uidMedico2'), {
      contaId: 'contaMedCardio', medicoUid: 'uidMedico2',
      papel: 'medico', locais: [], status: 'ativo',
    });
    await setDoc(doc(db, 'vinculos', 'contaMedCardio_uidInativo'), {
      contaId: 'contaMedCardio', medicoUid: 'uidInativo',
      papel: 'medico', locais: [], status: 'inativo',
    });
```

E acrescente ao **final do arquivo** o bloco novo:

```javascript
// ══════════════════════════════════════════════════════════════════
// E) MEMBRO DA CONTA (a recepcao entra segunda-feira)
//    A tranca so reconhecia o dono. Agora reconhece quem tem vinculo
//    ativo na conta do local, com limite por papel.
// ══════════════════════════════════════════════════════════════════
describe('E) membro da conta', () => {
  const RECEPCAO = 'uidRecepcao', MEDICO2 = 'uidMedico2', INATIVO = 'uidInativo';

  test('recepcao ve a fila do local (worklist)', async () => {
    await assertSucceeds(getDocs(collection(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`)));
  });

  test('recepcao cadastra paciente e exame', async () => {
    await assertSucceeds(setDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/pacientes`, 'pacR'), { nome: 'Novo' }));
    await assertSucceeds(setDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'exR'), {
      pacienteNome: 'Novo', status: 'aguardando',
    }));
  });

  test('recepcao le o local (precisa do timbre e do nome da clinica)', async () => {
    await assertSucceeds(getDoc(doc(como(RECEPCAO), 'workspaces', WS_MEDCARDIO)));
  });

  test('recepcao NAO edita o local', async () => {
    await assertFails(updateDoc(doc(como(RECEPCAO), 'workspaces', WS_MEDCARDIO), { nomeClinica: 'X' }));
  });

  test('recepcao NAO le a assinatura (financeiro)', async () => {
    await assertFails(getDoc(doc(como(RECEPCAO), 'subscriptions', 'contaMedCardio')));
    await assertFails(getDoc(doc(como(RECEPCAO), 'subscriptions', 'sub-medcardio')));
  });

  test('recepcao NAO le honorarios nem extratos', async () => {
    await assertFails(getDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/config`, 'honorarios')));
  });

  test('medico da conta le a assinatura e os honorarios', async () => {
    await assertSucceeds(getDoc(doc(como(MEDICO2), 'subscriptions', 'contaMedCardio')));
    await assertSucceeds(getDoc(doc(como(MEDICO2), `workspaces/${WS_MEDCARDIO}/config`, 'honorarios')));
  });

  test('membro le a conta a que pertence', async () => {
    await assertSucceeds(getDoc(doc(como(RECEPCAO), 'contas', 'contaMedCardio')));
  });

  test('vinculo INATIVO nao da acesso a nada', async () => {
    await assertFails(getDoc(doc(como(INATIVO), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1')));
    await assertFails(getDoc(doc(como(INATIVO), 'workspaces', WS_MEDCARDIO)));
    await assertFails(getDoc(doc(como(INATIVO), 'contas', 'contaMedCardio')));
  });

  test('membro da conta A nao alcanca o local da conta B', async () => {
    await assertFails(getDoc(doc(como(RECEPCAO), `workspaces/${WS_OUTRO}`)));
  });

  test('membro nao vira dono reescrevendo o proprio vinculo', async () => {
    await assertFails(updateDoc(doc(como(RECEPCAO), 'vinculos', 'contaMedCardio_uidRecepcao'), { papel: 'dono' }));
  });

  test('estranho sem vinculo continua sem ver nada', async () => {
    await assertFails(getDocs(collection(como(INVASOR), `workspaces/${WS_MEDCARDIO}/exames`)));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
npm run test:rules
```

Esperado: **os testes do bloco E) de sucesso falham** (a regra ainda só conhece o dono). Os de negação passam. Anote quantos falharam.

- [ ] **Step 3: Ensinar a regra a reconhecer membro**

Em `firestore.rules`, logo **depois** da função `donoDaConta`, acrescente:

```javascript
    // ── Membro da conta (modelo migrado em 09/08) ──
    function vincRef(contaId) {
      return /databases/$(database)/documents/vinculos/$(contaId + '_' + uid());
    }
    function membroDaConta(contaId) {
      return auth() && exists(vincRef(contaId))
        && get(vincRef(contaId)).data.status == 'ativo';
    }
    function papelNaConta(contaId) { return get(vincRef(contaId)).data.papel; }

    function contaDoLocal(wsId) {
      return get(/databases/$(database)/documents/workspaces/$(wsId)).data.contaId;
    }
    // Alcanca o local: e dono dele, ou tem vinculo ativo na conta dele e o
    // local esta na lista permitida (lista vazia = todos os locais da conta).
    function alcancaLocal(wsId) {
      return donoDoLocal(wsId)
        || (membroDaConta(contaDoLocal(wsId))
            && (get(vincRef(contaDoLocal(wsId))).data.locais.size() == 0
                || wsId in get(vincRef(contaDoLocal(wsId))).data.locais));
    }
    // Papel de quem assina laudo e ve dinheiro.
    function medicoNoLocal(wsId) {
      return donoDoLocal(wsId)
        || (alcancaLocal(wsId) && papelNaConta(contaDoLocal(wsId)) in ['dono', 'medico']);
    }
```

- [ ] **Step 4: Trocar as regras do local para usar `alcancaLocal`**

Substitua o bloco `match /workspaces/{wsId} { ... }` inteiro por:

```javascript
    match /workspaces/{wsId} {
      // O 3o termo existe porque o app consulta locais por `contaId`. Regra de
      // `list` no Firestore nao filtra: ela precisa ser satisfeita pelos campos
      // que a CONSULTA fixa. Como a consulta fixa `contaId` e nao `ownerUid`,
      // sem este termo o Firestore nega a consulta inteira. (Provado por teste.)
      allow get, list: if superadmin()
                       || (auth() && resource.data.ownerUid == uid())
                       || (auth() && donoDaConta(resource.data.contaId))
                       || (auth() && membroDaConta(resource.data.contaId));
      // Editar o local (timbre, endereco, integracoes) e so do dono.
      allow update:    if superadmin()
                       || (auth() && resource.data.ownerUid == uid() && intacto('ownerUid'));
      allow create:    if auth() && request.resource.data.ownerUid == uid();
      allow delete:    if false;

      // Honorarios e extratos sao dinheiro: medico ou dono, nunca recepcao.
      match /config/{docId}   { allow read, write: if superadmin() || medicoNoLocal(wsId); }
      match /extratos/{docId} { allow read, write: if superadmin() || medicoNoLocal(wsId); }

      // Fila, pacientes e laudos: todo membro que alcanca o local.
      // ponytail: a recepcao ainda pode escrever no conteudo do laudo aqui —
      // a separacao "so o autor edita" e da fechadura definitiva (Plano 2),
      // que ja esta escrita e testada. Aqui o que importa e o isolamento
      // entre clinicas e o financeiro; o resto a tela cobre por enquanto.
      match /{documento=**} {
        allow read, write: if superadmin() || alcancaLocal(wsId);
      }
    }
```

⚠️ A ordem importa: `config` e `extratos` precisam vir **antes** do `{documento=**}`, senão o coringa vence e a recepção lê honorários.

- [ ] **Step 5: Deixar membro ler a conta e a assinatura conforme o papel**

Troque o bloco `match /contas/{contaId}` por:

```javascript
    match /contas/{contaId} {
      allow get, list: if superadmin()
                       || (auth() && resource.data.ownerUid == uid())
                       || membroDaConta(contaId);
      allow write:     if false;
    }
```

E o bloco `match /subscriptions/{subId}` por:

```javascript
    match /subscriptions/{subId} {
      allow get, list: if superadmin()
                       || ('workspaceId' in resource.data && donoDoLocal(resource.data.workspaceId))
                       || ('contaId' in resource.data && donoDaConta(resource.data.contaId))
                       || ('contaId' in resource.data && membroDaConta(resource.data.contaId)
                           && papelNaConta(resource.data.contaId) in ['dono', 'medico']);
      allow create:    if auth() && donoDoLocal(request.resource.data.workspaceId);
      allow update:    if superadmin()
                       || ('workspaceId' in resource.data
                           && donoDoLocal(resource.data.workspaceId) && intacto('workspaceId'));
      allow delete:    if false;
    }
```

⚠️ A assinatura **antiga** (a que tem `workspaceId`) continua só do dono. Isso é proposital: é a que o `/api/emitir` debita, e o médico não-dono não precisa alterá-la.

- [ ] **Step 6: Rodar até passar tudo**

```bash
npm run test:rules
```

Esperado: **todos passam** — os 47 que já existiam mais os 12 novos. Se algum dos 47 antigos quebrar, a mudança afetou comportamento que não devia: relate em vez de adaptar o teste.

Atenção ao limite de 10 `get()` por avaliação: `alcancaLocal` encadeia `contaDoLocal` + `vincRef`. Se aparecer erro de limite, extraia o `contaId` uma vez em vez de chamar `contaDoLocal` repetido.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules tests/rules/interim.test.mjs
git commit -m "feat(seguranca): tranca reconhece membro da conta, com limite por papel"
```

---

## Task 2: Script que transforma um cadastro em membro

**Files:**
- Create: `scripts/secao1/02-vincular-membro.mjs`
- Modify: `package.json`

**Interfaces:**
- Consome: `getDb`, `COMMIT`, `modo` de `scripts/secao1/lib-admin.mjs`; Firebase Auth (Admin SDK) para achar o uid pelo e-mail.
- Produz: `vinculos/{contaId}_{uid}` com papel, e a remoção da "ilha" que o cadastro cria.

- [ ] **Step 1: Escrever o script**

`scripts/secao1/02-vincular-membro.mjs`:

```javascript
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

  // 3. A ilha que o cadastro dela criou (local proprio, vazio)
  const ilhas = await db.collection('workspaces').where('ownerUid', '==', user.uid).get();
  const paraApagar = [];
  for (const ws of ilhas.docs) {
    const [ex, pac] = await Promise.all([
      ws.ref.collection('exames').count().get(),
      ws.ref.collection('pacientes').count().get(),
    ]);
    if (ex.data().count > 0 || pac.data().count > 0) {
      console.log(`Local ${ws.id} do usuario tem ${ex.data().count} exames e ${pac.data().count} pacientes — NAO sera apagado.`);
      continue;
    }
    paraApagar.push(ws.ref);
    const subs = await db.collection('subscriptions').where('workspaceId', '==', ws.id).get();
    subs.docs.forEach(s => paraApagar.push(s.ref));
    const vincs = await db.collection('vinculos').where('workspaceId', '==', ws.id).get();
    vincs.docs.forEach(v => paraApagar.push(v.ref));
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
```

- [ ] **Step 2: Registrar no package.json**

Acrescente em `"scripts"`, preservando o formato do arquivo:

```json
"secao1:vincular": "node --env-file=.env.local scripts/secao1/02-vincular-membro.mjs"
```

- [ ] **Step 3: Provar que o script recusa entrada inválida**

```bash
npm run secao1:vincular
```
Esperado: sai com erro "Faltou argumento" e código 1.

```bash
npm run secao1:vincular -- --email=naoexiste@exemplo.com --conta=xxx --papel=recepcao
```
Esperado: "Nenhum usuario com o e-mail..." e código 1. **Não** deve gravar nada.

```bash
npm run secao1:vincular -- --email=sergio_abdon@yahoo.com.br --conta=xxx --papel=chefe
```
Esperado: "Papel invalido: chefe".

- [ ] **Step 4: Ensaio contra um usuário real, sem gravar**

Use o e-mail do próprio Dr. Sérgio (`sergio_abdon@yahoo.com.br`), que já é dono, só para exercitar o caminho feliz do ensaio:

```bash
npm run secao1:vincular -- --email=sergio_abdon@yahoo.com.br --conta=<contaId do Grupo MedCardio> --papel=medico
```

Descubra o `contaId` com `npm run secao1:inventario`. Esperado: imprime a pessoa, a conta, o que criaria, e termina em "ENSAIO. Nada foi gravado."

⚠️ **NÃO rode com `--commit` nesta tarefa.** O uso real é na segunda-feira, com o e-mail da recepção.

- [ ] **Step 5: Commit**

```bash
git add scripts/secao1/02-vincular-membro.mjs package.json
git commit -m "feat(secao1): script que transforma um cadastro em membro de uma conta"
```

---

## Task 3: "Esqueci minha senha" e "reenviar verificação"

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consome: `sendPasswordResetEmail` e `sendEmailVerification` do `firebase/auth` (recursos nativos, nada de servidor).
- Produz: os dois caminhos de recuperação que faltavam na tela de login.

Contexto: a secretária da clínica criou conta em 22/06, verificou o e-mail e **nunca mais entrou** — não há "esqueci minha senha" no sistema, e quem erra a senha fica trancado do lado de fora para sempre.

- [ ] **Step 1: Importar as duas funções**

Em `src/app/login/page.tsx`, troque o bloco de import do `firebase/auth` por:

```typescript
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
```

- [ ] **Step 2: Estado para o aviso de e-mail não verificado**

Logo depois de `const [sucesso, setSucesso] = useState('');`, acrescente:

```typescript
  // Aparece quando o login é barrado por e-mail não verificado
  const [precisaVerificar, setPrecisaVerificar] = useState(false);
```

- [ ] **Step 3: Marcar o caso de e-mail não verificado**

Em `handleLogin`, dentro do `if (!cred.user.emailVerified)`, **antes** do `await auth.signOut()`, acrescente:

```typescript
        setPrecisaVerificar(true);
```

E, no início da mesma função (logo após `setErro('');`), acrescente:

```typescript
    setSucesso(''); setPrecisaVerificar(false);
```

- [ ] **Step 4: As duas ações**

Acrescente estas duas funções logo depois de `handleLogin`:

```typescript
  // ── Esqueci minha senha ──
  async function handleResetSenha() {
    setErro(''); setSucesso('');
    if (!email) { setErro('Digite seu email no campo acima e clique de novo.'); return; }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSucesso(`Enviamos um link de nova senha para ${email}. Cheque também o spam.`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      // Nao revelamos se o email existe ou nao — dizer "esse email nao existe"
      // entrega a lista de quem usa o sistema para quem estiver testando.
      if (code === 'auth/invalid-email') setErro('Email inválido.');
      else if (code === 'auth/too-many-requests') setErro('Muitas tentativas. Aguarde alguns minutos.');
      else setSucesso(`Se houver conta para ${email}, o link foi enviado. Cheque também o spam.`);
    }
    setLoading(false);
  }

  // ── Reenviar o email de verificação ──
  // Precisa estar autenticado para reenviar: entramos, mandamos, saímos.
  async function handleReenviarVerificacao() {
    setErro(''); setSucesso('');
    if (!email || !senha) { setErro('Preencha email e senha para reenviar a verificação.'); return; }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, senha);
      await sendEmailVerification(cred.user);
      await auth.signOut();
      setSucesso(`Reenviamos a verificação para ${email}. Cheque também o spam.`);
      setPrecisaVerificar(false);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/too-many-requests') setErro('Muitas tentativas. Aguarde alguns minutos.');
      else setErro('Não consegui reenviar. Confira email e senha.');
    }
    setLoading(false);
  }
```

- [ ] **Step 5: Os links na tela**

No formulário de login, logo **depois** do botão "Entrar" (`</button>` do submit) e ainda dentro do `<form>`, acrescente:

```tsx
                <button type="button" onClick={handleResetSenha} disabled={loading}
                  className="w-full text-center text-xs text-[#1E3A5F] hover:underline disabled:opacity-50">
                  Esqueci minha senha
                </button>

                {precisaVerificar && (
                  <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded-lg space-y-2">
                    <p>Seu email ainda não foi verificado. Sem isso não é possível entrar.</p>
                    <button type="button" onClick={handleReenviarVerificacao} disabled={loading}
                      className="font-semibold underline disabled:opacity-50">
                      Reenviar email de verificação
                    </button>
                  </div>
                )}
```

- [ ] **Step 6: Verificar que compila e que a tela sobe**

```bash
npm run typecheck
```
Esperado: sem erro.

```bash
npx eslint src/app/login/page.tsx
```
Esperado: sem erro (aviso é tolerável).

Suba o servidor, confirme que a tela de login renderiza com o link novo, e **derrube o servidor depois**:

```bash
npm run dev
```
Abra `http://localhost:3000/login`, confirme que aparece "Esqueci minha senha" abaixo do botão Entrar. Não dispare o envio de e-mail de verdade — o teste real é com a recepção, na segunda.

- [ ] **Step 7: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(login): esqueci minha senha + reenviar verificacao"
```

---

## Depois deste plano (orquestrador, não implementador)

1. Publicar a tranca nova: `npx firebase deploy --only firestore:rules` — **só com `npm run test:rules` verde**.
2. Levar a tela de login nova para produção (merge na `master`, que deploya na Vercel) — decisão do Dr. Sérgio.
3. Segunda: a recepção se cadastra; rodar `npm run secao1:vincular -- --email=... --conta=... --papel=recepcao --commit`.
