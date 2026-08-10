// Lista exames do Manoel e Sonia em 12/05/2026 (terça-feira).
// Estratégia: busca exames recentes (sem filtro complexo de data pra evitar índices),
// filtra em memória por nome + data.
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');

admin.initializeApp({
  credential: admin.credential.cert(sa),
  projectId: 'leo-sistema-laudos',
  storageBucket: 'leo-sistema-laudos.firebasestorage.app',
});

const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';

(async () => {
  console.log('Buscando exames de MANOEL e SONIA em 12/05/2026...\n');

  // Busca por nome - usa where('pacienteNome', '>=', 'MANOEL') etc, ou pega todos
  // Pra simplificar e nao depender de indices: pega todos e filtra em memoria
  const snap = await db
    .collection('workspaces').doc(wsId)
    .collection('exames')
    .get();

  console.log(`Total de exames no workspace: ${snap.size}\n`);

  const filtrados = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => {
      const data = e.dataExame || '';
      const nome = (e.pacienteNome || '').toUpperCase();
      return data === '2026-05-12' && (nome.includes('MANOEL') || nome.includes('SONIA'));
    });

  if (filtrados.length === 0) {
    console.log('Nenhum exame de MANOEL ou SONIA em 12/05/2026.\n');

    // Mostra todos os exames de 12/05 pra debug
    const todos1205 = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.dataExame === '2026-05-12');
    console.log(`Exames em 12/05/2026 (${todos1205.length} total):`);
    todos1205.forEach(e => console.log(`  ${e.horarioChegada || '??:??'} | ${e.pacienteNome} | ${e.tipoExame} | acc=${e.acc || '?'}`));
    process.exit(0);
  }

  console.log(`Achados: ${filtrados.length} exames\n`);

  // Ordena por horario
  filtrados.sort((a, b) => (a.horarioChegada || '').localeCompare(b.horarioChegada || ''));

  for (const e of filtrados) {
    const imgCount = Array.isArray(e.imagensDicom) ? e.imagensDicom.length : 0;
    const medidasCount = e.medidasDicom ? Object.keys(e.medidasDicom).length : 0;

    console.log('======================================');
    console.log(`Doc Firestore: ${e.id}`);
    console.log(`Paciente:        ${e.pacienteNome}`);
    console.log(`Tipo:             ${e.tipoExame}`);
    console.log(`Horario:          ${e.horarioChegada || '(?)'}`);
    console.log(`ACC:              ${e.acc || '(sem ACC)'}`);
    console.log(`Status:           ${e.status}`);
    console.log(`Origem:           ${e.origem}`);
    console.log(`Convenio:         ${e.convenio || '(sem convenio)'}`);
    console.log('');
    console.log(`Imagens DICOM:   ${imgCount} ${imgCount > 0 ? 'OK' : 'NENHUMA'}`);
    console.log(`Medidas SR:       ${medidasCount} ${medidasCount > 0 ? 'OK' : 'NENHUMA'}`);

    if (imgCount > 0) {
      console.log('');
      console.log('PRIMEIRAS 3 URLs:');
      e.imagensDicom.slice(0, 3).forEach((url, i) => {
        console.log(`   ${i+1}. ${url}`);
      });
      if (imgCount > 3) console.log(`   ... mais ${imgCount - 3} imagens`);

      console.log('');
      console.log(`LINK NO LEO WEB:`);
      console.log(`   https://souleo.com.br/laudo/${e.id}`);
    }

    if (medidasCount > 0) {
      console.log('');
      console.log('MEDIDAS DICOM (codigos LOINC):');
      const entries = Object.entries(e.medidasDicom).slice(0, 5);
      entries.forEach(([code, val]) => console.log(`   ${code}: ${val}`));
      if (medidasCount > 5) console.log(`   ... mais ${medidasCount - 5} medidas`);
    }
    console.log('');
  }

  process.exit(0);
})().catch(err => {
  console.error('Erro:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});
