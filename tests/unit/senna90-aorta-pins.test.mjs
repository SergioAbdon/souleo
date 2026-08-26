// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T3 (spec §3 C10): a aorta tinha 11 de 19 fórmulas sem
// teste (arco 100% descoberto, índice cm²/m nunca exercido, WASE
// nunca discriminado). Estes pins gravam o comportamento DE HOJE.
// BASELINE pré-F1 — a F1 muda estes pins deliberadamente (spec §2.2):
// arco vira ≤40/>40 sem sexo, aneurisma raiz/asc vira ≥45, raiz ♀>65
// vira 38. NÃO "corrigir" valores aqui; só fotografar.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  tierRaizAo, tierAoAscendente, tierArcoAo, indiceAortaAltura,
} from '../../src/senna90/calculos/aorta.ts';

const tier = (r) => r.tier;

describe('BASELINE aorta pré-F1 — tierRaizAo (WASE sexo+idade; aneurisma ≥50)', () => {
  // ♂: 38/40/41 por faixa (≤40 · 41-65 · ≥66) — fronteira exata é normal (corte é >)
  test('♂ 30a: 38 normal · 39 ectasia', () => {
    assert.equal(tier(tierRaizAo(38, 'M', null, 30, null)), 'normal');
    assert.equal(tier(tierRaizAo(39, 'M', null, 30, null)), 'ectasia');
  });
  test('♂ 50a: 40 normal · 41 ectasia', () => {
    assert.equal(tier(tierRaizAo(40, 'M', null, 50, null)), 'normal');
    assert.equal(tier(tierRaizAo(41, 'M', null, 50, null)), 'ectasia');
  });
  test('♂ 70a: 41 normal · 42 ectasia', () => {
    assert.equal(tier(tierRaizAo(41, 'M', null, 70, null)), 'normal');
    assert.equal(tier(tierRaizAo(42, 'M', null, 70, null)), 'ectasia');
  });
  // ♀: 35/36/37 — ATENÇÃO: a F1 muda a faixa ≥66 pra 38 (WASE cru 37,5)
  test('♀ 30a: 35 normal · 36 ectasia', () => {
    assert.equal(tier(tierRaizAo(35, 'F', null, 30, null)), 'normal');
    assert.equal(tier(tierRaizAo(36, 'F', null, 30, null)), 'ectasia');
  });
  test('♀ 50a: 36 normal · 37 ectasia', () => {
    assert.equal(tier(tierRaizAo(36, 'F', null, 50, null)), 'normal');
    assert.equal(tier(tierRaizAo(37, 'F', null, 50, null)), 'ectasia');
  });
  test('♀ 70a: 37 normal · 38 ectasia  // F1 → corte vira 38', () => {
    assert.equal(tier(tierRaizAo(37, 'F', null, 70, null)), 'normal');
    assert.equal(tier(tierRaizAo(38, 'F', null, 70, null)), 'ectasia');
  });
  test('aneurisma absoluto HOJE é 50 (49 ectasia · 50 aneurisma)  // F1 → 45', () => {
    assert.equal(tier(tierRaizAo(49, 'M', null, 30, null)), 'ectasia');
    assert.equal(tier(tierRaizAo(50, 'M', null, 30, null)), 'aneurisma');
  });
  test('sexo vazio conta como homem (nº24/C8 — a F1/F2 revisita)', () => {
    assert.equal(tier(tierRaizAo(39, '', null, 50, null)), 'normal');
  });
  test('idade null → rede de segurança Z-score (asc presente) segue ativa', () => {
    // ♂ asc 1.8: previsto = 1.92 + 0.74×1.8 = 3.252 cm, SD 0.19 →
    // 40 mm ⇒ z=(4.0−3.252)/0.19≈3.9 ⇒ acima do normal ⇒ ectasia
    assert.equal(tier(tierRaizAo(40, 'M', 1.8, null, null)), 'ectasia');
  });
});

describe('BASELINE aorta pré-F1 — tierAoAscendente (Chamber 38/35; aneurisma ≥50)', () => {
  test('♂: 38 normal · 39 ectasia · 50 aneurisma', () => {
    assert.equal(tier(tierAoAscendente(38, 'M', null, null)), 'normal');
    assert.equal(tier(tierAoAscendente(39, 'M', null, null)), 'ectasia');
    assert.equal(tier(tierAoAscendente(50, 'M', null, null)), 'aneurisma');
  });
  test('♀: 35 normal · 36 ectasia', () => {
    assert.equal(tier(tierAoAscendente(35, 'F', null, null)), 'normal');
    assert.equal(tier(tierAoAscendente(36, 'F', null, null)), 'ectasia');
  });
});

describe('BASELINE aorta pré-F1 — tierArcoAo (ACR/ACRIN 35/32 · 44/41)  // F1 → ≤40/>40 sem sexo', () => {
  test('♂: 35 normal · 36 ectasia · 43 ectasia · 44 aneurisma', () => {
    assert.equal(tier(tierArcoAo(35, 'M')), 'normal');
    assert.equal(tier(tierArcoAo(36, 'M')), 'ectasia');
    assert.equal(tier(tierArcoAo(43, 'M')), 'ectasia');
    assert.equal(tier(tierArcoAo(44, 'M')), 'aneurisma');
  });
  test('♀: 32 normal · 33 ectasia · 41 aneurisma', () => {
    assert.equal(tier(tierArcoAo(32, 'F')), 'normal');
    assert.equal(tier(tierArcoAo(33, 'F')), 'ectasia');
    assert.equal(tier(tierArcoAo(41, 'F')), 'aneurisma');
  });
  test('arco nunca tem índice', () => {
    const r = tierArcoAo(45, 'M');
    assert.equal(r.indiceCm2m, null);
    assert.equal(r.graveIndice, false);
  });
});

describe('BASELINE — indiceAortaAltura (π·r² em cm² ÷ altura em m, trunc 1)', () => {
  test('45 mm / 160 cm → 9.9 (graveIndice false na fronteira de baixo)', () => {
    assert.equal(indiceAortaAltura(45, 160), 9.9);
    assert.equal(tierRaizAo(45, 'M', null, 30, 160).graveIndice, false);
  });
  test('46 mm / 160 cm → ≥10 ⇒ graveIndice true', () => {
    const idx = indiceAortaAltura(46, 160);
    assert.ok(idx >= 10, `índice=${idx}`);
    assert.equal(tierRaizAo(46, 'M', null, 30, 160).graveIndice, true);
  });
  test('sem altura → null e nunca grave', () => {
    assert.equal(indiceAortaAltura(45, null), null);
    assert.equal(tierRaizAo(50, 'M', null, 30, null).graveIndice, false);
  });
});
