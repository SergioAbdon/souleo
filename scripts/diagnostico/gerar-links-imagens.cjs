// Gera signed URLs (válidas por 24h) pras imagens DICOM dos 3 exames de 12/05/2026.
// Sem necessidade de login — basta clicar/colar no browser.
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');

admin.initializeApp({
  credential: admin.credential.cert(sa),
  projectId: 'leo-sistema-laudos',
  storageBucket: 'leo-sistema-laudos.firebasestorage.app',
});

const bucket = admin.storage().bucket();

const EXAMES = [
  { id: 'uj1U5egIB7ox8CzbNRV8', paciente: 'MANOEL - Eco TT (10:00)' },
  { id: 'v7JvTfjOhJBzCMcNuNIk', paciente: 'SONIA - Eco TT (11:30)' },
  { id: 'He5dXgFCv1oft6xNlUlL', paciente: 'SONIA - Carotidas (11:45)' },
];

const wsId = 'LDRtedkanx3bUvxpdmiL';
const EXPIRES_HOURS = 24;
const expiresAt = Date.now() + EXPIRES_HOURS * 60 * 60 * 1000;

(async () => {
  console.log('Gerando signed URLs (validas por 24h)...\n');

  for (const exame of EXAMES) {
    console.log(`========================================`);
    console.log(`${exame.paciente}`);
    console.log(`Doc: ${exame.id}`);
    console.log(`========================================`);

    // Lista arquivos no bucket pra esse exame
    const prefix = `dicom/${wsId}/${exame.id}/`;
    const [files] = await bucket.getFiles({ prefix });

    if (files.length === 0) {
      console.log('   Nenhuma imagem no Storage.\n');
      continue;
    }

    console.log(`   ${files.length} imagens encontradas\n`);

    // Ordena por nome (001.jpg, 002.jpg, ...)
    files.sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: expiresAt,
      });
      const filename = file.name.split('/').pop();
      console.log(`   ${(i + 1).toString().padStart(2)}. ${filename}`);
      console.log(`       ${url}`);
      console.log('');
    }

    console.log('');
  }

  console.log(`========================================`);
  console.log(`Total: signed URLs validas ate ${new Date(expiresAt).toLocaleString('pt-BR')}`);
  console.log(`========================================`);

  process.exit(0);
})().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
