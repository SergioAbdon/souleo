// ciclo.ts vira a fonte UNICA do predicado de giro + do significado de
// "vigente" (S7-triade-2b, Ruflo-1). Antes disto, emitir-admin.ts e
// billing.ts tinham o MESMO predicado escrito duas vezes em texto (pin
// cross-file, giro-ciclo-predicado-pin.test.mjs, agora aposentado — os 2
// arquivos importam esta funcao, entao so pode existir 1 predicado).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { podeGirar, proximoCicloFim, vigente } from '../../src/lib/ciclo.ts';

const dia = (n) => n * 864e5;

describe('podeGirar — elegibilidade do giro automatico (E11 opcao D)', () => {
  test('paga, nao-trial, vencida -> gira', () => {
    const agora = new Date(2026, 7, 30);
    const sub = { cicloFim: new Date(2026, 7, 1), franquiaMensal: 600, tipo: 'paid' };
    assert.equal(podeGirar(sub, agora), true);
  });
  test('paga, nao-trial, AINDA no ciclo -> nao gira', () => {
    const agora = new Date(2026, 7, 15);
    const sub = { cicloFim: new Date(2026, 7, 30), franquiaMensal: 600, tipo: 'paid' };
    assert.equal(podeGirar(sub, agora), false);
  });
  test('trial vencido -> NUNCA gira (ADR §3, Direx converte na mao)', () => {
    const agora = new Date(2026, 8, 5);
    const sub = { cicloFim: new Date(2026, 7, 1), franquiaMensal: 600, tipo: 'trial' };
    assert.equal(podeGirar(sub, agora), false);
  });
  test('bloqueada (franquiaMensal:0) vencida -> nao gira', () => {
    const agora = new Date(2026, 8, 5);
    const sub = { cicloFim: new Date(2026, 7, 1), franquiaMensal: 0, tipo: 'paid' };
    assert.equal(podeGirar(sub, agora), false);
  });
  test('sem cicloFim -> nao gira (nao ha "vencido" sem data)', () => {
    assert.equal(podeGirar({ franquiaMensal: 600, tipo: 'paid' }, new Date()), false);
  });
});

describe('proximoCicloFim — loop +30d a partir do cicloFim VELHO', () => {
  test('1 ciclo vencido: avanca exatamente 30 dias', () => {
    const velho = new Date(2026, 7, 1).getTime();
    const agora = new Date(2026, 7, 15).getTime();
    assert.equal(proximoCicloFim(velho, agora), velho + dia(30));
  });
  test('gap de 3 ciclos ausentes: avanca em passos de 30d ate ficar no futuro', () => {
    const velho = new Date(2026, 4, 1).getTime();       // vencido ha meses
    const agora = new Date(2026, 7, 15).getTime();
    const novo = proximoCicloFim(velho, agora);
    assert.ok(novo > agora, 'resultado tem que estar no futuro');
    assert.equal((novo - velho) % dia(30), 0, 'passos sempre de 30 dias a partir do velho, sem escorregar');
  });
});

describe('vigente — "essa assinatura ainda conta como ativa" (dinheiro/churn)', () => {
  test('dentro do ciclo -> vigente', () => {
    const agora = new Date(2026, 7, 15);
    assert.equal(vigente({ cicloFim: new Date(2026, 7, 30), franquiaMensal: 600, tipo: 'paid' }, agora), true);
  });
  test('paga, nao-trial, VENCIDA -> AINDA vigente (gira sozinha no proximo emitir)', () => {
    const agora = new Date(2026, 8, 5);
    assert.equal(vigente({ cicloFim: new Date(2026, 7, 1), franquiaMensal: 600, tipo: 'paid' }, agora), true,
      'MRR/painel nao pode cair sozinho na virada — e exatamente o bug que este teste fecha');
  });
  test('trial VENCIDO -> nao vigente (trial nao gira)', () => {
    const agora = new Date(2026, 8, 5);
    assert.equal(vigente({ cicloFim: new Date(2026, 7, 1), franquiaMensal: 600, tipo: 'trial' }, agora), false);
  });
  test('bloqueada (franquiaMensal:0) vencida -> nao vigente', () => {
    const agora = new Date(2026, 8, 5);
    assert.equal(vigente({ cicloFim: new Date(2026, 7, 1), franquiaMensal: 0, tipo: 'paid' }, agora), false);
  });
  test('sem cicloFim e sem franquia paga -> nao vigente', () => {
    assert.equal(vigente({}, new Date()), false);
  });
  test('paga, nao-trial, SEM cicloFim -> nao vigente (nao gira, nao emite por franquia, sem MRR)', () => {
    assert.equal(vigente({ franquiaMensal: 600, tipo: 'paid' }, new Date()), false,
      'sem cicloFim nao ha ciclo pago pra contar como mensalidade — mesmo com franquia/creditos');
  });
});
