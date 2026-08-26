// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T5 (spec §3 C10): TAPSE/GLS-conclusão/LAVI-bandas/RAVI
// sem pin. BASELINE pré-F1 — inclui pins de CONTRADIÇÕES conhecidas
// (B1: GLS −19 é "reduzido" no achado e "preservada" na conclusão),
// fotografadas de propósito: o diff da F1 mostra a cura.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

const temQueIncluir = (lista, trecho) =>
  assert.ok(lista.some((s) => s.includes(trecho)),
    `esperado trecho "${trecho}" em: ${JSON.stringify(lista, null, 1)}`);
const naoPodeIncluir = (lista, trecho) =>
  assert.ok(!lista.some((s) => s.includes(trecho)),
    `trecho proibido "${trecho}" presente em: ${JSON.stringify(lista, null, 1)}`);

describe('BASELINE TAPSE pré-F1 (F0-T5) — texto diz "VR ≥ 20 mm"  // F1 → "> 17"', () => {
  test('TAPSE 18 com VD preservado: sufixo com o VR ERRADO atual', () => {
    const m = medidasVazias();
    m.sistolica.tapse = 18;
    const r = calcular(m);
    temQueIncluir(r.achados, 'TAPSE= 18 mm (VR ≥ 20 mm)');
  });
});

describe('BASELINE GLS VE pré-F1 — contradição B1 fotografada  // F1 → 3 faixas −18/−16', () => {
  test('GLS −19: achado "reduzido" (corte |20|) E conclusão "preservada" (corte |18|) no MESMO laudo', () => {
    const m = medidasVazias();
    m.camaras.ddve = 50; m.camaras.dsve = 30;   // FE preservada p/ ativar concStrainVE
    m.gerais.sexo = 'M';
    m.sistolica.glsVE = -19;
    const r = calcular(m);
    temQueIncluir(r.achados, 'reduzido');            // strain.ts: |−19| < 20
    temQueIncluir(r.conclusoes, 'preservada');       // conclusoes: |−19| ≥ 18
  });
  test('GLS −21: normal nas duas pontas', () => {
    const m = medidasVazias();
    m.camaras.ddve = 50; m.camaras.dsve = 30; m.gerais.sexo = 'M';
    m.sistolica.glsVE = -21;
    const r = calcular(m);
    temQueIncluir(r.achados, '(VR ≥ -20%)');
    naoPodeIncluir(r.achados, 'reduzido');
  });
});

describe('BASELINE LAVI pré-F1 — j4: >34 leve · ≥42 mod · ≥48 IMP  // F1 → 48 vira moderado', () => {
  const comLavi = (v) => {
    const m = medidasVazias();
    m.diastolica.volAEindex = v;
    return calcular(m).achados;
  };
  test('35 → leve', () => temQueIncluir(comLavi(35), 'leve'));
  test('42 → moderado', () => temQueIncluir(comLavi(42), 'moderado'));
  test('48 → importante (ATUAL; Lang 2015 diz moderado — F1 corrige)', () =>
    temQueIncluir(comLavi(48), 'importante'));
  test('49 → importante', () => temQueIncluir(comLavi(49), 'importante'));
  test('34 → silêncio', () => naoPodeIncluir(comLavi(34), 'Átrio esquerdo aumentado'));
});

describe('BASELINE RAVI (JASE 2025 unificado) — j5: <30 sil · ≤36 leve · ≤41 mod · >41 imp', () => {
  const comRavi = (v) => {
    const m = medidasVazias();
    m.diastolica.volADindex = v;
    return calcular(m).achados;
  };
  test('29 → silêncio', () => naoPodeIncluir(comRavi(29), 'Átrio direito aumentado'));
  test('30 → leve', () => temQueIncluir(comRavi(30), 'leve'));
  test('37 → moderado', () => temQueIncluir(comRavi(37), 'moderado'));
  test('42 → importante', () => temQueIncluir(comRavi(42), 'importante'));
});
