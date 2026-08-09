// Gera UMA pagina HTML com TODAS as imagens dos 3 exames de 12/05
// Abre no browser e ve tudo organizado por paciente.
const admin = require('firebase-admin');
const fs = require('fs');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');

admin.initializeApp({
  credential: admin.credential.cert(sa),
  projectId: 'leo-sistema-laudos',
  storageBucket: 'leo-sistema-laudos.firebasestorage.app',
});

const bucket = admin.storage().bucket();
const wsId = 'LDRtedkanx3bUvxpdmiL';

const EXAMES = [
  { id: 'uj1U5egIB7ox8CzbNRV8', paciente: 'MANOEL ROBERTO GEMAQUE BARBOSA', tipo: 'Eco TT', horario: '10:00', acc: 'EX12052610215916' },
  { id: 'v7JvTfjOhJBzCMcNuNIk', paciente: 'SONIA MARIA DE SOUZA AMARANTE', tipo: 'Eco TT', horario: '11:30', acc: 'EX12052610215917' },
  { id: 'He5dXgFCv1oft6xNlUlL', paciente: 'SONIA MARIA DE SOUZA AMARANTE', tipo: 'Doppler de Carotidas', horario: '11:45', acc: 'EX12052610215918' },
];

const EXPIRES_HOURS = 24;
const expiresAt = Date.now() + EXPIRES_HOURS * 60 * 60 * 1000;

(async () => {
  const sections = [];

  for (const exame of EXAMES) {
    const prefix = `dicom/${wsId}/${exame.id}/`;
    const [files] = await bucket.getFiles({ prefix });
    files.sort((a, b) => a.name.localeCompare(b.name));

    const imgs = [];
    for (const file of files) {
      const [url] = await file.getSignedUrl({ action: 'read', expires: expiresAt });
      const filename = file.name.split('/').pop();
      imgs.push({ filename, url });
    }

    sections.push({ ...exame, imgs });
    console.log(`OK ${exame.paciente} - ${exame.tipo}: ${imgs.length} imagens`);
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Imagens DICOM - 12/05/2026</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a1a; color: #e5e5e5; padding: 24px; }
  h1 { color: #fff; margin-bottom: 8px; }
  .meta { color: #888; font-size: 13px; margin-bottom: 32px; }
  .section { margin-bottom: 48px; padding-bottom: 32px; border-bottom: 1px solid #333; }
  .section h2 { color: #fff; margin-bottom: 4px; font-size: 22px; }
  .section .info { color: #aaa; font-size: 13px; margin-bottom: 16px; }
  .info strong { color: #fff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .img-card { background: #2a2a2a; border-radius: 8px; overflow: hidden; transition: transform 0.2s; }
  .img-card:hover { transform: scale(1.02); }
  .img-card img { width: 100%; height: auto; display: block; cursor: pointer; }
  .img-card .label { padding: 8px 12px; font-size: 12px; color: #888; }
  .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.95); z-index: 1000; align-items: center; justify-content: center; cursor: pointer; }
  .modal.open { display: flex; }
  .modal img { max-width: 95vw; max-height: 95vh; object-fit: contain; }
  .modal .close { position: absolute; top: 20px; right: 30px; color: #fff; font-size: 40px; cursor: pointer; user-select: none; }
  .badge { display: inline-block; padding: 4px 10px; background: #2563EB; color: #fff; border-radius: 12px; font-size: 11px; font-weight: 600; margin-right: 8px; }
  .badge.alt { background: #059669; }
</style>
</head>
<body>

<h1>Imagens DICOM — Terça-feira 12/05/2026</h1>
<p class="meta">Links válidos até ${new Date(expiresAt).toLocaleString('pt-BR')} (24h)</p>

${sections.map(s => `
<div class="section">
  <h2>${s.paciente}</h2>
  <p class="info">
    <span class="badge">${s.tipo}</span>
    <span class="badge alt">${s.imgs.length} imagens</span>
    Horario: <strong>${s.horario}</strong> · ACC: <strong>${s.acc}</strong> · Doc: <code>${s.id}</code>
  </p>
  <div class="grid">
    ${s.imgs.map(img => `
      <div class="img-card">
        <img src="${img.url}" alt="${img.filename}" onclick="openModal(this.src)" loading="lazy">
        <div class="label">${img.filename}</div>
      </div>
    `).join('')}
  </div>
</div>
`).join('')}

<div class="modal" id="modal" onclick="closeModal()">
  <span class="close">&times;</span>
  <img id="modal-img" src="">
</div>

<script>
function openModal(src) {
  document.getElementById('modal-img').src = src;
  document.getElementById('modal').classList.add('open');
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
}
</script>

</body>
</html>`;

  const outPath = 'C:/Users/sergi/Desktop/imagens-12maio.html';
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`\nGaleria salva em: ${outPath}`);
  console.log('Abra esse arquivo no browser pra ver todas as imagens.');

  process.exit(0);
})().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
