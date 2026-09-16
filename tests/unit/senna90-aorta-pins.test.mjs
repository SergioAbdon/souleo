// ══════════════════════════════════════════════════════════════════
// Senna93 F1-T1 (spec §2.2): a régua da aorta agora é ACC/AHA 2022 +
// WASE 2022. Estes pins gravam o comportamento NOVO:
//   • raiz/asc: dilatação < 45 · ANEURISMA ≥ 45 · nota cirúrgica ≥ 50
//   • arco: ≤40 normal · >40 dilatado (sem sexo, sem graus, nunca
//     "aneurisma") · nota cirúrgica ≥ 55
//   • raiz ♀ ≥66 anos: corte 38 (WASE cru 37,5 arredonda)
// Os pins pré-F1 (ectasia / aneurisma ≥50 / arco ACR-ACRIN) foram
// substituídos deliberadamente — ver
// docs/planos/2026-08-27-senna93-divergencias-esperadas.md.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  tierRaizAo, tierAoAscendente, tierArcoAo, indiceAortaAltura,
} from '../../src/senna90/calculos/aorta.ts';

const tier = (r) => r.tier;

describe('Senna93 aorta — tierRaizAo (WASE sexo+idade; aneurisma ≥45)', () => {
  // ♂: 38/40/41 por faixa (≤40 · 41-65 · ≥66) — fronteira exata é normal (corte é >)
  test('♂ 30a: 38 normal · 39 dilatacao', () => {
    assert.equal(tier(tierRaizAo(38, 'M', null, 30, null)), 'normal');
    assert.equal(tier(tierRaizAo(39, 'M', null, 30, null)), 'dilatacao');
  });
  test('♂ 50a: 40 normal · 41 dilatacao', () => {
    assert.equal(tier(tierRaizAo(40, 'M', null, 50, null)), 'normal');
    assert.equal(tier(tierRaizAo(41, 'M', null, 50, null)), 'dilatacao');
  });
  test('♂ 70a: 41 normal · 42 dilatacao', () => {
    assert.equal(tier(tierRaizAo(41, 'M', null, 70, null)), 'normal');
    assert.equal(tier(tierRaizAo(42, 'M', null, 70, null)), 'dilatacao');
  });
  // ♀: 35/36/38 — a faixa ≥66 é 38 (WASE cru 37,5) desde a F1
  test('♀ 30a: 35 normal · 36 dilatacao', () => {
    assert.equal(tier(tierRaizAo(35, 'F', null, 30, null)), 'normal');
    assert.equal(tier(tierRaizAo(36, 'F', null, 30, null)), 'dilatacao');
  });
  test('♀ 50a: 36 normal · 37 dilatacao', () => {
    assert.equal(tier(tierRaizAo(36, 'F', null, 50, null)), 'normal');
    assert.equal(tier(tierRaizAo(37, 'F', null, 50, null)), 'dilatacao');
  });
  test('♀ 70a: 38 normal · 39 dilatacao (corte WASE 38)', () => {
    assert.equal(tier(tierRaizAo(38, 'F', null, 70, null)), 'normal');
    assert.equal(tier(tierRaizAo(39, 'F', null, 70, null)), 'dilatacao');
  });
  test('♀ 70a: 37 normal (era dilatação com o corte antigo 37)', () => {
    assert.equal(tier(tierRaizAo(37, 'F', null, 70, null)), 'normal');
  });
  test('aneurisma absoluto é 45 (44 dilatacao · 45 aneurisma)', () => {
    assert.equal(tier(tierRaizAo(44, 'M', null, 30, null)), 'dilatacao');
    assert.equal(tier(tierRaizAo(45, 'M', null, 30, null)), 'aneurisma');
  });
  test('nota cirúrgica raiz/asc: false em 45-49 · true em ≥50', () => {
    assert.equal(tierRaizAo(45, 'M', null, 30, null).notaCirurgica, false);
    assert.equal(tierRaizAo(49, 'M', null, 30, null).notaCirurgica, false);
    assert.equal(tierRaizAo(50, 'M', null, 30, null).notaCirurgica, true);
    assert.equal(tierAoAscendente(50, 'M', null, null).notaCirurgica, true);
  });
  test('49 e 50 são AMBOS aneurisma — 50 só acrescenta a nota cirúrgica', () => {
    assert.equal(tier(tierRaizAo(49, 'M', null, 30, null)), 'aneurisma');
    assert.equal(tier(tierRaizAo(50, 'M', null, 30, null)), 'aneurisma');
  });
  test('sexo vazio conta como homem (nº24/C8 — a F2 revisita)', () => {
    assert.equal(tier(tierRaizAo(39, '', null, 50, null)), 'normal');
  });
  test('idade null → rede de segurança Z-score (asc presente) segue ativa', () => {
    // ♂ asc 1.8: previsto = 1.92 + 0.74×1.8 = 3.252 cm, SD 0.19 →
    // 40 mm ⇒ z=(4.0−3.252)/0.19≈3.9 ⇒ acima do normal ⇒ dilatacao
    assert.equal(tier(tierRaizAo(40, 'M', 1.8, null, null)), 'dilatacao');
  });
});

describe('Senna93 aorta — tierAoAscendente (Chamber 38/35; aneurisma ≥45)', () => {
  test('♂: 38 normal · 39 dilatacao · 45 aneurisma', () => {
    assert.equal(tier(tierAoAscendente(38, 'M', null, null)), 'normal');
    assert.equal(tier(tierAoAscendente(39, 'M', null, null)), 'dilatacao');
    assert.equal(tier(tierAoAscendente(45, 'M', null, null)), 'aneurisma');
    assert.equal(tier(tierAoAscendente(50, 'M', null, null)), 'aneurisma');
  });
  test('♀: 35 normal · 36 dilatacao', () => {
    assert.equal(tier(tierAoAscendente(35, 'F', null, null)), 'normal');
    assert.equal(tier(tierAoAscendente(36, 'F', null, null)), 'dilatacao');
  });
});

describe('Senna93 aorta — tierArcoAo (≤40 normal · >40 dilatado, sem sexo)', () => {
  test('40 normal · 41 dilatacao (mesma régua p/ ♂ e ♀)', () => {
    assert.equal(tier(tierArcoAo(40)), 'normal');
    assert.equal(tier(tierArcoAo(41)), 'dilatacao');
  });
  test('nota cirúrgica do arco: 54 sem nota · 55 com nota', () => {
    assert.equal(tierArcoAo(54).notaCirurgica, false);
    assert.equal(tierArcoAo(55).notaCirurgica, true);
  });
  test('arco NUNCA é aneurisma (sem tabela de normal)', () => {
    for (const mm of [41, 44, 50, 55, 70]) {
      assert.notEqual(tier(tierArcoAo(mm)), 'aneurisma', `arco ${mm} mm`);
    }
  });
  test('arco nunca tem índice', () => {
    const r = tierArcoAo(45);
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
