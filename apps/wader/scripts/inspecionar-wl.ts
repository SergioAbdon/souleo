/**
 * Inspeciona o conteúdo de um arquivo .wl pra validar formato DICOM Part 10.
 *
 * Uso: npx tsx scripts/inspecionar-wl.ts <caminho-do-arquivo.wl>
 */
import * as fs from 'node:fs';
// @ts-ignore — dcmjs não tem types completos
import dcmjs from 'dcmjs';

const wlPath = process.argv[2];
if (!wlPath) {
  console.error('Uso: npx tsx scripts/inspecionar-wl.ts <caminho-do-arquivo.wl>');
  process.exit(1);
}

if (!fs.existsSync(wlPath)) {
  console.error(`Arquivo não existe: ${wlPath}`);
  process.exit(1);
}

const buffer = fs.readFileSync(wlPath);
console.log(`\nArquivo: ${wlPath}`);
console.log(`Tamanho: ${buffer.length} bytes\n`);

// 1. Validar magic DICM (bytes 128-131)
const magic = buffer.slice(128, 132).toString('ascii');
console.log(`Magic bytes 128-131: "${magic}" ${magic === 'DICM' ? '✓' : '✗ INVÁLIDO'}`);

if (magic !== 'DICM') {
  console.error('Arquivo não é DICOM Part 10 válido (falta magic DICM)');
  process.exit(1);
}

// 2. Parsear via dcmjs
try {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer);
  const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
  const meta = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.meta);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  FILE META INFORMATION');
  console.log('═══════════════════════════════════════════════');
  for (const [k, v] of Object.entries(meta)) {
    console.log(`  ${k}: ${formatVal(v)}`);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  DATASET');
  console.log('═══════════════════════════════════════════════');
  for (const [k, v] of Object.entries(dataset)) {
    console.log(`  ${k}: ${formatVal(v)}`);
  }

  console.log('\n✓ Arquivo parseado com sucesso (DICOM Part 10 válido)');
} catch (err) {
  console.error('\n✗ Falha ao parsear DICOM:', (err as Error).message);
  process.exit(1);
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '(null)';
  if (typeof v === 'string') return `"${v}"`;
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return `[${v.length} items]\n${v
      .map((item, i) =>
        typeof item === 'object'
          ? `      [${i}] ${JSON.stringify(item, null, 2).split('\n').join('\n      ')}`
          : `      [${i}] ${formatVal(item)}`,
      )
      .join('\n')}`;
  }
  if (v instanceof Uint8Array) return `<binary ${v.length} bytes>`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
