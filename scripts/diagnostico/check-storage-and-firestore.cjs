// Verifica se as imagens DICOM chegaram ao Storage e ao Firestore.
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');

admin.initializeApp({
  credential: admin.credential.cert(sa),
  projectId: 'leo-sistema-laudos',
  storageBucket: 'leo-sistema-laudos.firebasestorage.app',
});

const db = admin.firestore();
const bucket = admin.storage().bucket();
const wsId = 'LDRtedkanx3bUvxpdmiL';

(async () => {
  console.log('========================================');
  console.log('  VALIDACAO PIPELINE DICOM');
  console.log('========================================\n');

  // 1) Lista arquivos do bucket inteiro pra pasta dicom/{wsId}/
  console.log(`[1/3] Listando Storage em: dicom/${wsId}/`);
  const [files] = await bucket.getFiles({ prefix: `dicom/${wsId}/` });
  if (files.length === 0) {
    console.log('  NENHUM arquivo no Storage');
  } else {
    // Agrupa por exameId (segunda parte do path)
    const porExame = {};
    let totalBytes = 0;
    for (const f of files) {
      const parts = f.name.split('/'); // dicom / wsId / exameId / xxx.jpg
      const exameId = parts[2] || '(raiz)';
      porExame[exameId] = porExame[exameId] || { count: 0, bytes: 0 };
      porExame[exameId].count++;
      const size = parseInt(f.metadata?.size || '0', 10);
      porExame[exameId].bytes += size;
      totalBytes += size;
    }
    console.log(`  Total: ${files.length} arquivos (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`  Por exame:`);
    Object.entries(porExame).forEach(([exameId, info]) => {
      console.log(`    ${exameId}: ${info.count} arquivos (${(info.bytes / 1024 / 1024).toFixed(2)} MB)`);
    });
  }

  // 2) Lê os exames Carmen + Edwaldo no Firestore
  console.log(`\n[2/3] Verificando Firestore (exames com status='imagens-recebidas'):`);
  const snap = await db
    .collection('workspaces')
    .doc(wsId)
    .collection('exames')
    .where('status', '==', 'imagens-recebidas')
    .get();

  if (snap.empty) {
    console.log('  NENHUM exame com status="imagens-recebidas"');
  } else {
    snap.forEach((doc) => {
      const d = doc.data();
      const imagens = Array.isArray(d.imagensDicom) ? d.imagensDicom.length : 0;
      const detalhes = Array.isArray(d.imagensDicomDetalhes) ? d.imagensDicomDetalhes.length : 0;
      console.log(`  Exame ${doc.id}:`);
      console.log(`    paciente: ${d.pacienteNome}`);
      console.log(`    acc: ${d.acc}`);
      console.log(`    status: ${d.status}`);
      console.log(`    imagensDicom (array de URLs): ${imagens}`);
      console.log(`    imagensDicomDetalhes (array de objetos): ${detalhes}`);
      console.log(`    dicomOrthancStudyId: ${d.dicomOrthancStudyId}`);
      console.log(`    dicomMeta:`, d.dicomMeta);
      if (imagens > 0) {
        console.log(`    1a URL: ${d.imagensDicom[0]}`);
      }
      console.log('');
    });
  }

  // 3) Testa se a 1a URL responde (sem auth) — confirma que a imagem está acessível
  console.log(`[3/3] Testando 1a URL HTTP HEAD (sem auth):`);
  if (!snap.empty) {
    const primeiro = snap.docs[0].data();
    const url = primeiro.imagensDicom?.[0];
    if (url) {
      const fetched = await fetch(url, { method: 'HEAD' });
      console.log(`  GET ${url}`);
      console.log(`    HTTP ${fetched.status} ${fetched.statusText}`);
      console.log(`    Content-Type: ${fetched.headers.get('content-type')}`);
      console.log(`    Content-Length: ${fetched.headers.get('content-length')} bytes`);
    }
  }

  console.log('\n========================================');
  console.log('  FIM');
  console.log('========================================');
  process.exit(0);
})().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
