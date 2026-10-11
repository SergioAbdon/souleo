// Pin de fonte da rota /api/emitir (Codex 11/10, item 7): os testes (h)–(h4)
// de emitir-idempotencia provam a trava DADO um hash; este pin prova QUAL
// conteúdo a rota hasheia e que ela recusa requisição sem conteúdo.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rota = fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'app', 'api', 'emitir', 'route.ts'), 'utf8');

describe('/api/emitir — hash do conteúdo que vira PDF (replay só vale pro MESMO conteúdo)', () => {
  test('hasheia o ramo publicado: pdfBase64 tem prioridade sobre pdfHtml (mesma ordem dos ramos de publicação)', () => {
    // Truthiness, NÃO `??`: `pdfBase64: ''` publica o pdfHtml (`if (pdfAnexadoBuf)` usa
    // truthiness) — o hash tem que seguir o MESMO predicado do ramo de publicação (Codex 11/10).
    assert.match(rota, /createHash\('sha256'\)\.update\(pdfBase64 \? pdfBase64 : \(pdfHtml \?\? ''\)\)\.digest\('hex'\)/);
    assert.ok(!/update\(pdfBase64 \?\? pdfHtml/.test(rota), 'nunca `??` aqui: string vazia passaria pelo hash e não pela publicação');
    assert.ok(rota.indexOf('if (pdfAnexadoBuf) {') < rota.indexOf('} else if (pdfHtml) {'), 'rota publica o anexo antes do HTML');
  });
  test('sem pdfHtml nem pdfBase64 → 400 sem_conteudo ANTES da transação', () => {
    const guard = rota.indexOf("motivo: 'sem_conteudo'");
    assert.ok(guard > 0);
    assert.ok(guard < rota.indexOf('await emitirComCobranca('), 'guard tem que vir antes de cobrar');
  });
  test('o hash viaja pra emitirComCobranca e o 409 está no mapa de status', () => {
    assert.match(rota, /emissaoKey, conteudoHash,\s*\}\)/);
    assert.match(rota, /conteudo_divergente: 409/);
  });
});
