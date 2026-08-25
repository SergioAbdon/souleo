// Autorizacao da /api/corrigir-laudo: so dono/medico do local corrigem convenio.
// A rota chama resolverPapel(db, wsId, uid) e recusa recepcao/forasteiro.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverPapel, podeCorrigir } from '../../src/lib/exame-admin.ts';
import { substituirCamposAdministrativos, nomeArqDoPdfUrl } from '../../src/lib/correcao-admin.ts';

let db;
const CONTA = 'contaC', WS = 'wsC';
const DONO = 'uidDonoC', MED = 'uidMedC', RITA = 'uidRitaC';

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: DONO });
  for (const [uid, papel] of [[DONO, 'dono'], [MED, 'medico'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
});

describe('autorizacao corrigir-laudo (via resolverPapel)', () => {
  test('dono corrige', async () => assert.equal(await resolverPapel(db, WS, DONO), 'dono'));
  test('medico corrige', async () => assert.equal(await resolverPapel(db, WS, MED), 'medico'));
  test('recepcao resolve papel (S5-T5: passou a poder corrigir, sem credito)', async () => {
    const papel = await resolverPapel(db, WS, RITA);
    assert.equal(papel, 'recepcao');   // D4: recepcao corrige convenio/solicitante
  });
  test('forasteiro sem vinculo → null', async () => {
    assert.equal(await resolverPapel(db, WS, 'uidForasteiro'), null);
  });
});

// resolverPapel so resolve o PAPEL; a autoria + status "emitido" e a regra §4,
// decidida na funcao pura podeCorrigir e checada na rota antes do update.
describe('autoria/emitido corrigir-laudo (podeCorrigir)', () => {
  test('dono + emitido → ok (corrige qualquer autor)', () => {
    assert.deepEqual(podeCorrigir('dono', 'emitido', 'outroMed', DONO), { ok: true });
  });
  test('medico autor + emitido → ok', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', MED, MED), { ok: true });
  });
  test('medico sem autor no exame + emitido → ok (assume)', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', undefined, MED), { ok: true });
  });
  test('medico nao-autor + emitido → nao_e_autor', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', 'outroMed', MED), { ok: false, motivo: 'nao_e_autor' });
  });
  test('qualquer papel + status aguardando → nao_emitido', () => {
    assert.deepEqual(podeCorrigir('dono', 'aguardando', DONO, DONO), { ok: false, motivo: 'nao_emitido' });
    assert.deepEqual(podeCorrigir('medico', 'andamento', MED, MED), { ok: false, motivo: 'nao_emitido' });
  });

  // S5-T5 / D4: correcao administrativa (convenio+solicitante) e trabalho de
  // recepcao. Sem credito, sem tocar no corpo clinico.
  test('recepcao + emitido → ok (corrige de qualquer autor, sem credito)', () => {
    assert.deepEqual(podeCorrigir('recepcao', 'emitido', 'outroMed', RITA), { ok: true });
  });
  test('recepcao + nao emitido → nao_emitido', () => {
    assert.deepEqual(podeCorrigir('recepcao', 'rascunho', MED, RITA), { ok: false, motivo: 'nao_emitido' });
  });
  test('sem vinculo (papel null) → sem_permissao mesmo em emitido', () => {
    assert.deepEqual(podeCorrigir(null, 'emitido', MED, 'uidForasteiro'), { ok: false, motivo: 'sem_permissao' });
  });
});

// ══════════════════════════════════════════════════════════════════
// S5-T5: o HTML do laudo emitido vira SNAPSHOT (Storage) e a correcao
// administrativa reescreve SO os 2 campos nele. O cliente nao manda mais
// pdfHtml — logo, ninguem reescreve o corpo clinico assinado.
// ══════════════════════════════════════════════════════════════════
const P1 = '#0B5FA5';

// Replica FIEL do bloco de identificacao dos dois templates de emissao
// (gerarPdfHtml em /laudo/[id]/page.tsx e gerarPdfHtmlTexto em pdf-texto.ts).
function htmlLaudo(conv, solic) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>ECOTT JOSILENE</title></head><body>
<table class="pl">
<thead><tr><td>
  <div style="border:1px solid ${P1};border-radius:3px;padding:3px 6px;margin-bottom:2mm;">
    <div style="display:flex;gap:8px;margin-bottom:2px;">
      <div style="flex:2"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">NOME</span><span style="display:block;font-size:8.5pt;font-weight:500;">JOSILENE DA SILVA</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">IDADE</span><span style="display:block;font-size:8.5pt;font-weight:500;">62 anos</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">DATA DE NASCIMENTO</span><span style="display:block;font-size:8.5pt;font-weight:500;">12/03/1964</span></div>
    </div>
    <div style="display:flex;gap:8px;">
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">CONVÊNIO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${conv}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">MÉDICO SOLICITANTE</span><span style="display:block;font-size:8.5pt;font-weight:500;">${solic}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${P1};text-transform:uppercase;">DATA DO EXAME</span><span style="display:block;font-size:8.5pt;font-weight:500;">20/08/2026</span></div>
    </div>
  </div>
</td></tr></thead>
<tbody><tr><td class="body-cell">
  <div>MEDIDAS E PARÂMETROS</div><table><tr><td>FEVE</td><td>68</td><td>%</td></tr></table>
  <div>CONCLUSÃO</div><ul><li>Função sistólica do VE preservada. CONVÊNIO do paciente não muda nada aqui.</li></ul>
</td></tr></tbody>
</table></body></html>`;
}

describe('substituirCamposAdministrativos (snapshot congelado)', () => {
  test('troca os 2 campos e mais NADA (byte-a-byte)', () => {
    const antes = htmlLaudo('UNIMED', 'Dr. Edwaldo Rocha');
    const depois = substituirCamposAdministrativos(antes, { convenio: 'BRADESCO SAÚDE', solicitante: 'Dra. Marina Lima' });
    assert.equal(depois, htmlLaudo('BRADESCO SAÚDE', 'Dra. Marina Lima'));
    // o corpo clinico segue intocado
    assert.ok(depois.includes('Função sistólica do VE preservada.'));
    assert.ok(depois.includes('JOSILENE DA SILVA'));
    assert.ok(depois.includes('68'));
    assert.equal(depois.length - antes.length,
      ('BRADESCO SAÚDE'.length - 'UNIMED'.length) + ('Dra. Marina Lima'.length - 'Dr. Edwaldo Rocha'.length));
  });

  test('valor com caractere especial de regex entra literal ($&, $1, parenteses)', () => {
    const depois = substituirCamposAdministrativos(htmlLaudo('UNIMED', 'Dr. A'),
      { convenio: 'AMIL $1 (SP) [A] $&', solicitante: 'Dr. B' });
    // `$1`/`$&` entram literais (o `&` ainda passa pelo escape de HTML)
    assert.equal(depois, htmlLaudo('AMIL $1 (SP) [A] $&amp;', 'Dr. B'));
  });

  test('vazio → travessao e travessao → valor (ida e volta)', () => {
    const vazio = substituirCamposAdministrativos(htmlLaudo('UNIMED', 'Dr. A'), { convenio: '', solicitante: '   ' });
    assert.equal(vazio, htmlLaudo('—', '—'));
    const cheio = substituirCamposAdministrativos(vazio, { convenio: 'PARTICULAR', solicitante: 'Dr. C' });
    assert.equal(cheio, htmlLaudo('PARTICULAR', 'Dr. C'));
  });

  test('valor com HTML e escapado (nao injeta tag no laudo assinado)', () => {
    const depois = substituirCamposAdministrativos(htmlLaudo('UNIMED', 'Dr. A'),
      { convenio: '<script>alert(1)</script>', solicitante: 'Silva & Cia "SA"' });
    assert.ok(!depois.includes('<script>'));
    assert.equal(depois, htmlLaudo('&lt;script&gt;alert(1)&lt;/script&gt;', 'Silva &amp; Cia &quot;SA&quot;'));
  });

  test('snapshot sem o bloco ancora → null (falha segura, nao corrompe)', () => {
    assert.equal(substituirCamposAdministrativos('<html><body>laudo antigo sem identificacao</body></html>',
      { convenio: 'UNIMED', solicitante: 'Dr. A' }), null);
    // so um dos dois blocos presente tambem nao serve
    const soConv = htmlLaudo('UNIMED', 'Dr. A').replace('MÉDICO SOLICITANTE', 'OUTRA COISA');
    assert.equal(substituirCamposAdministrativos(soConv, { convenio: 'X', solicitante: 'Y' }), null);
  });
});

describe('nomeArqDoPdfUrl (regrava o MESMO arquivo — link do paciente nao muda)', () => {
  test('extrai o nome do arquivo publicado', () => {
    assert.equal(nomeArqDoPdfUrl('https://storage.googleapis.com/leo.appspot.com/laudos/wsC/ECOTT_JOSILENE_DA_SILVA.pdf'),
      'ECOTT_JOSILENE_DA_SILVA');
  });
  test('nome com acento vem percent-encoded na URL', () => {
    assert.equal(nomeArqDoPdfUrl('https://storage.googleapis.com/leo.appspot.com/laudos/wsC/ECOTT_JOS%C3%89.pdf'), 'ECOTT_JOSÉ');
  });
  test('sem pdfUrl / lixo → string vazia (salvarPdfBuffer usa o default laudo_{id})', () => {
    assert.equal(nomeArqDoPdfUrl(undefined), '');
    assert.equal(nomeArqDoPdfUrl(''), '');
    assert.equal(nomeArqDoPdfUrl('nao-e-url'), '');
  });
});
