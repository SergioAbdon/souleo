// Semeia tiposLaudo nos workspaces EXISTENTES que ainda nao tem o catalogo.
// Dry-run por padrao; --commit grava. Nao le TIPOS_LAUDO_PADRAO do fonte TS:
// node puro — duplica aqui o array (3o espelho, aceito: script one-shot,
// morre apos a migracao). Rodar: node --env-file=.env.local scripts/reestruturacao/seed-tipos-laudo.mjs
import { getDb, COMMIT, modo } from '../secao1/lib-admin.mjs';

const TIPOS = [
  { id: 'eco_tt', nome: 'Eco Transtorácico', icone: '🫀', ativo: true, ordem: 1, modalidade: 'motor', motorId: 'senna' },
  { id: 'eco_te', nome: 'Eco Transesofágico', icone: '🫀', ativo: true, ordem: 2, modalidade: 'motor', motorId: 'senna' },
  { id: 'eco_stress', nome: 'Eco Stress', icone: '🫀', ativo: true, ordem: 3, modalidade: 'motor', motorId: 'senna' },
  {
    id: 'doppler_carotidas', nome: 'Doppler de Carótidas', icone: '🩺', ativo: true, ordem: 4, modalidade: 'texto',
    modeloTexto: [
      '<h2>DOPPLER DE CARÓTIDAS E VERTEBRAIS</h2>',
      '<p><strong>Técnica:</strong> exame realizado com transdutor linear, em repouso, com análise bidimensional, Doppler colorido e espectral.</p>',
      '<p><strong>Carótidas comuns:</strong> trajeto, calibre e fluxo preservados bilateralmente.</p>',
      '<p><strong>Bulbos e bifurcações:</strong> sem placas ou espessamento médio-intimal significativo.</p>',
      '<p><strong>Carótidas internas:</strong> fluxo preservado, sem estenoses hemodinamicamente significativas.</p>',
      '<p><strong>Carótidas externas:</strong> sem alterações.</p>',
      '<p><strong>Vertebrais:</strong> fluxo anterógrado bilateral.</p>',
      '<h3>CONCLUSÃO</h3>',
      '<p>Exame dentro dos limites da normalidade.</p>',
    ].join(''),
  },
  { id: 'ecg', nome: 'ECG', icone: '📈', ativo: true, ordem: 5, modalidade: 'pdf' },
  { id: 'mapa', nome: 'MAPA', icone: '🩸', ativo: true, ordem: 6, modalidade: 'pdf' },
  { id: 'holter', nome: 'Holter', icone: '📟', ativo: true, ordem: 7, modalidade: 'pdf' },
  { id: 'ergometrico', nome: 'Teste Ergométrico', icone: '🏃', ativo: true, ordem: 8, modalidade: 'pdf' },
];

async function main() {
  console.log(`MODO: ${modo()}\n`);
  const db = getDb();
  const ws = await db.collection('workspaces').get();
  for (const w of ws.docs) {
    const existentes = await w.ref.collection('tiposLaudo').limit(1).get();
    if (!existentes.empty) { console.log(`${w.id}: ja semeado, pulo`); continue; }
    console.log(`${w.id} (${w.data().nomeClinica ?? '?'}): semear 8 tipos${COMMIT ? '' : ' [dry-run]'}`);
    if (COMMIT) {
      const batch = db.batch();
      for (const t of TIPOS) batch.set(w.ref.collection('tiposLaudo').doc(t.id), { ...t, criadoEm: new Date() });
      await batch.commit();
    }
  }
  console.log(COMMIT ? 'GRAVADO' : 'dry-run — rode com --commit para gravar');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
