import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { IngestStateStore, MAX_TENTATIVAS_FALHA, StudySignature } from './ingest-state';

// precisaProcessar/setSignature são in-memory; passamos um path em tmp só
// porque o construtor exige um (não chamamos load/flush).
function novoStore(): IngestStateStore {
  return new IngestStateStore(path.join(os.tmpdir(), `wader-test-${Math.random()}.json`));
}

describe('IngestStateStore.precisaProcessar (contrato do Fix B / nSR = instances)', () => {
  it('estudo nunca visto → precisa processar', () => {
    const s = novoStore();
    expect(s.precisaProcessar('e1', 0, 0)).toBe(true);
  });

  it('completo (mesma contagem) → NÃO reprocessa', () => {
    const s = novoStore();
    s.setSignature('e1', { nImg: 9, nSR: 1, matched: true, at: 'x' });
    expect(s.precisaProcessar('e1', 9, 1)).toBe(false);
  });

  it('chegou imagem nova (curImg > nImg) → reprocessa', () => {
    const s = novoStore();
    s.setSignature('e1', { nImg: 9, nSR: 1, matched: true, at: 'x' });
    expect(s.precisaProcessar('e1', 10, 1)).toBe(true);
  });

  it('chegou SR novo (curSR > nSR em INSTANCES) → reprocessa [o bug corrigido]', () => {
    const s = novoStore();
    // nSR agora = nº de instances SR (1). Antes guardava nº de medidas (ex. 34),
    // então curSR=2 nunca passava de 34 e o SR novo era ignorado.
    s.setSignature('e1', { nImg: 9, nSR: 1, matched: true, at: 'x' });
    expect(s.precisaProcessar('e1', 9, 2)).toBe(true);
  });

  it('processou mas não casou (matched=false) → reprocessa', () => {
    const s = novoStore();
    s.setSignature('e1', { nImg: 0, nSR: 0, matched: false, at: 'x' });
    expect(s.precisaProcessar('e1', 9, 1)).toBe(true);
  });

  it('precisaProcessar usa nImgTentadas quando presente (falha permanente não loopa)', () => {
    const s = novoStore();
    s.setSignature('e1', { nImg: 8, nImgTentadas: 9, nSR: 1, matched: true, at: 'x' });
    expect(s.precisaProcessar('e1', 9, 1)).toBe(false); // 9 tentadas = 9 no Orthanc
    expect(s.precisaProcessar('e1', 10, 1)).toBe(true); // chegou imagem nova
  });
});

describe('IngestStateStore — retry limitado de falha transitória (Codex 31/08)', () => {
  const comFalha = (extra: Partial<StudySignature>): StudySignature => ({
    nImg: 8,
    nImgTentadas: 9,
    nImgFalhadas: 1,
    tentativasFalha: 1,
    nSR: 1,
    matched: true,
    at: new Date(Date.now() - 10 * 60_000).toISOString(), // backoff vencido
    ...extra,
  });

  it('falha dentro do teto + backoff vencido → reprocessa e entra na fila de retry', () => {
    const s = novoStore();
    s.setSignature('e1', comFalha({}));
    expect(s.precisaProcessar('e1', 9, 1)).toBe(true);
    expect(s.estudosComRetryPendente()).toEqual(['e1']);
  });

  it('backoff ainda não venceu → segura', () => {
    const s = novoStore();
    s.setSignature('e1', comFalha({ at: new Date().toISOString() }));
    expect(s.precisaProcessar('e1', 9, 1)).toBe(false);
    expect(s.estudosComRetryPendente()).toEqual([]);
  });

  it('teto atingido → desiste (proteção do Achado 9 preservada)', () => {
    const s = novoStore();
    s.setSignature('e1', comFalha({ tentativasFalha: MAX_TENTATIVAS_FALHA }));
    expect(s.precisaProcessar('e1', 9, 1)).toBe(false);
    expect(s.estudosComRetryPendente()).toEqual([]);
  });
});

describe('IngestStateStore.deleteSignature', () => {
  it('remove e persiste', () => {
    const s = novoStore();
    s.setSignature('e1', { nImg: 1, nSR: 0, matched: true, at: 'x' });
    s.deleteSignature('e1');
    expect(s.getSignature('e1')).toBeUndefined();
  });
});
