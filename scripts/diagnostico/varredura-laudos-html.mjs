// Varredura pre-merge S5: ha .html no prefixo laudos/ em producao?
// (o snapshot novo grava em laudos-html/; o path antigo era world-readable)
import { getDb } from '../secao1/lib-admin.mjs';
import { getStorage } from 'firebase-admin/storage';

getDb();
const BUCKET = 'leo-sistema-laudos.firebasestorage.app';
const bucket = getStorage().bucket(BUCKET);
const [files] = await bucket.getFiles({ prefix: 'laudos/' });
const html = files.filter(f => f.name.endsWith('.html'));
console.log(`${files.length} objeto(s) em laudos/ — ${html.length} .html`);
for (const f of html) console.log('  RESIDUAL:', f.name);
if (!html.length) console.log('LIMPO: nenhum .html residual no path antigo.');
