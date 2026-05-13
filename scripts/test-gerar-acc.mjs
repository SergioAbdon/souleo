// Teste standalone do gerarAccessionNumber — sem framework, roda com `node`.
//
// Uso: node scripts/test-gerar-acc.mjs
//
// PORQUE EM JS E NAO IMPORTA O .ts: o projeto nao tem ts-node/tsx/vitest
// configurado. Em vez de adicionar uma dep so pra um teste de 50 linhas,
// duplico a logica aqui. Se a funcao em src/lib/gerarAccessionNumber.ts
// for alterada, alinhar este arquivo.
//
// Cobertura:
//   1. Formato basico
//   2. Counter global previne colisao em chamadas avulsas
//   3. offsetMs explicito continua funcionando (batch Feegow)
//   4. Misturar chamadas avulsas + batch nao colide
//   5. Stress test 100 chamadas em loop apertado

// ── Replica de src/lib/gerarAccessionNumber.ts ──
let _autoOffsetCounter = 0;

function gerarAccessionNumber(now = new Date(), offsetMs) {
  const eff = offsetMs ?? (_autoOffsetCounter++ * 10);
  const t = eff ? new Date(now.getTime() + eff) : now;
  const dd = String(t.getDate()).padStart(2, '0');
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const aa = String(t.getFullYear()).slice(-2);
  const hh = String(t.getHours()).padStart(2, '0');
  const mi = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  const cc = String(Math.floor(t.getMilliseconds() / 10)).padStart(2, '0');
  return `EX${dd}${mm}${aa}${hh}${mi}${ss}${cc}`;
}

function _resetCounter() { _autoOffsetCounter = 0; }

// ── Helpers de teste ──
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else      { fail++; console.error(`  ✗ ${msg}`); }
}

function test(name, fn) {
  console.log(`\n${name}`);
  _resetCounter();
  fn();
}

// ── Testes ──

test('1. Formato basico', () => {
  const acc = gerarAccessionNumber(new Date('2026-05-12T13:21:59.160Z'));
  assert(acc.length === 16, `comprimento 16 (got ${acc.length}: ${acc})`);
  assert(acc.startsWith('EX'), `prefixo EX (got ${acc})`);
  assert(/^EX\d{14}$/.test(acc), `padrao EX + 14 digitos (got ${acc})`);
});

test('2. Counter global previne colisao em chamadas avulsas', () => {
  const fixedDate = new Date('2026-05-12T13:21:59.000Z');
  const a1 = gerarAccessionNumber(fixedDate);
  const a2 = gerarAccessionNumber(fixedDate);
  const a3 = gerarAccessionNumber(fixedDate);
  assert(a1 !== a2, `2 chamadas avulsas com mesmo Date sao distintas (a1=${a1} a2=${a2})`);
  assert(a2 !== a3, `3 chamadas avulsas com mesmo Date sao distintas`);
  assert(a1 !== a3, `1a e 3a chamadas avulsas sao distintas`);
});

test('3. offsetMs explicito continua funcionando (batch)', () => {
  const baseTime = new Date('2026-05-12T13:21:59.000Z');
  const accs = [];
  for (let i = 0; i < 3; i++) accs.push(gerarAccessionNumber(baseTime, i * 10));
  const unique = new Set(accs);
  assert(unique.size === 3, `3 ACCs distintos em batch i*10 (got ${unique.size}: ${accs.join(',')})`);
});

test('4. Misturar chamadas avulsas + batch nao colide', () => {
  const baseTime = new Date('2026-05-12T13:21:59.000Z');
  const accs = [];
  accs.push(gerarAccessionNumber(baseTime));         // avulsa 1 (counter=0)
  accs.push(gerarAccessionNumber(baseTime, 50));     // batch i=5
  accs.push(gerarAccessionNumber(baseTime));         // avulsa 2 (counter=1)
  accs.push(gerarAccessionNumber(baseTime, 60));     // batch i=6
  const unique = new Set(accs);
  assert(unique.size === accs.length, `mistura nao colide (${unique.size}/${accs.length}: ${accs.join(',')})`);
});

test('5. Stress test 100 chamadas em loop apertado', () => {
  const fixed = new Date('2026-05-12T13:21:59.000Z');
  const accs = [];
  for (let i = 0; i < 100; i++) accs.push(gerarAccessionNumber(fixed));
  const unique = new Set(accs);
  assert(unique.size === 100, `100 chamadas em loop avulso geram 100 ACCs unicos (got ${unique.size})`);
});

test('6. Caso historico (bug 12/05/2026 — 3 chamadas batch simulando)', () => {
  // Simula o batch Feegow de 12/05 com 3 exames (que deveria ter funcionado)
  const baseTime = new Date('2026-05-12T13:21:59.160Z');
  const accs = [];
  for (let i = 0; i < 3; i++) accs.push(gerarAccessionNumber(baseTime, i * 10));
  console.log(`     ACCs gerados: ${accs.join(', ')}`);
  const unique = new Set(accs);
  assert(unique.size === 3, `batch de 3 com i*10 gera 3 ACCs unicos`);
  assert(accs[0] === 'EX12052610215916', `primeiro = EX12052610215916 (got ${accs[0]})`);
  assert(accs[1] === 'EX12052610215917', `segundo  = EX12052610215917 (got ${accs[1]})`);
  assert(accs[2] === 'EX12052610215918', `terceiro = EX12052610215918 (got ${accs[2]})`);
});

// ── Resumo ──
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTADO: ${pass} passou, ${fail} falhou`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
