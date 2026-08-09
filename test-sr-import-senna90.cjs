// TESTE: simula a importação SR → motor pros exames reais do Manoel/Sonia.
// Objetivo: ver os valores REAIS que entrariam nos campos do motor (b7, b8...)
// e detectar problema de unidade (cm vs mm) antes da migração Senna90.
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');

admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';

// Espelho do SR_TO_MOTOR de src/lib/dicom-sr-mapping.ts (15/05)
const SR_TO_MOTOR = {
  'AO_18015-8':      { campo: 'b7',  nomePt: 'Raiz Aortica' },
  'LA_M-02550':      { campo: 'b8',  nomePt: 'Atrio Esquerdo' },
  'LV_29436-3':      { campo: 'b9',  nomePt: 'DDVE' },
  'LV_18154-5':      { campo: 'b10', nomePt: 'Septo IV' },
  'LV_18152-9':      { campo: 'b11', nomePt: 'Parede Posterior' },
  'LV_29438-9':      { campo: 'b12', nomePt: 'DSVE' },
  'MV_18037-2':      { campo: 'b19', nomePt: 'Vel. Onda E' },
  'LA_GEU-106-0033': { campo: 'b24', nomePt: 'AE Vol. index' },
};

// O que o motor (antigo E Senna90) espera por campo:
const UNIDADE_ESPERADA = {
  b7: 'mm', b8: 'mm', b9: 'mm', b10: 'mm', b11: 'mm', b12: 'mm',
  b19: 'cm/s', b24: 'ml/m2',
};

const EXAMES = [
  { id: 'uj1U5egIB7ox8CzbNRV8', nome: 'MANOEL - Eco TT' },
  { id: 'v7JvTfjOhJBzCMcNuNIk', nome: 'SONIA - Eco TT' },
];

function isSchemaNovo(medidas) {
  if (!medidas) return false;
  const k = Object.keys(medidas)[0];
  if (!k) return false;
  const v = medidas[k];
  return typeof v === 'object' && v !== null && 'value' in v;
}

(async () => {
  for (const ex of EXAMES) {
    const snap = await db.collection('workspaces').doc(wsId).collection('exames').doc(ex.id).get();
    if (!snap.exists) { console.log(`${ex.nome}: doc nao existe`); continue; }
    const d = snap.data();
    const md = d.medidasDicom;

    console.log('================================================');
    console.log(`${ex.nome}  (doc ${ex.id})`);
    console.log(`Schema: ${isSchemaNovo(md) ? 'NOVO (com unidade)' : 'ANTIGO (so numero)'}`);
    console.log(`Total medidasDicom: ${md ? Object.keys(md).length : 0}`);
    console.log('================================================');

    if (!md) { console.log('(sem medidasDicom)\n'); continue; }

    const novo = isSchemaNovo(md);

    console.log('\nSIMULACAO: o que entraria nos campos do motor:\n');
    console.log('Campo | Medida          | Valor SR    | Unid SR | Motor espera | PROBLEMA?');
    console.log('------|-----------------|-------------|---------|--------------|----------');

    for (const srKey of Object.keys(SR_TO_MOTOR)) {
      const map = SR_TO_MOTOR[srKey];
      let valor, unitSr;

      if (novo) {
        const dado = md[srKey];
        if (!dado) continue;
        valor = dado.value;
        unitSr = dado.unit || '?';
      } else {
        // schema antigo: chave = codigo puro (sufixo apos _)
        const codePuro = srKey.split('_').slice(1).join('_');
        if (md[codePuro] === undefined) continue;
        valor = md[codePuro];
        unitSr = '(antigo-sem-unidade)';
      }

      const espera = UNIDADE_ESPERADA[map.campo];
      // Detecta cm->mm: se motor espera mm e valor < 10 (tipico de cm em medida cardiaca)
      let problema = '';
      if (espera === 'mm' && unitSr === 'cm') problema = 'CM->MM (x10)!';
      else if (espera === 'mm' && typeof valor === 'number' && valor < 10) problema = 'suspeito (valor<10 p/ mm)';
      else if (unitSr === 'm/s' && espera === 'cm/s') problema = 'M/S->CM/S (x100)!';

      const valorFmt = typeof valor === 'number' ? valor.toFixed(2) : String(valor);
      console.log(
        `${map.campo.padEnd(5)} | ${map.nomePt.padEnd(15)} | ${valorFmt.padStart(11)} | ${String(unitSr).padEnd(7)} | ${espera.padEnd(12)} | ${problema}`
      );
    }
    console.log('');
  }

  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
