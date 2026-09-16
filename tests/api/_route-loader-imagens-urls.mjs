// Loader (node:module customization hooks — nada instalado, so API nativa)
// so pro teste de wiring do handler em imagens-urls.test.mjs.
//
// Por que existe: a rota importa 'next/server' sem barrel/exports no
// package.json do Next (bundler-only) — node --test puro NAO resolve o
// especificador bare (confirmado: ERR_MODULE_NOT_FOUND mesmo com o arquivo
// real presente em node_modules/next/server.js). Por isso nenhuma rota de
// tests/api/ e importada direto (ver comentario no topo dos arquivos de
// teste). Este loader resolve 'next/server' pro arquivo real (mesmo
// NextResponse/NextRequest do build) e troca so os dois modulos que a rota
// usa pra falar com o Firestore/Auth (auth-admin, exame-admin) por um
// mock minimo — o suficiente pra simular "miss de resolverPapel" sem
// precisar de um id token real do emulador. imagens-dicom-admin e
// convite-server continuam os arquivos de verdade.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const REAIS = {
  'next/server': pathToFileURL(path.join(ROOT, 'node_modules/next/server.js')).href,
  '@/lib/imagens-dicom-admin': pathToFileURL(path.join(ROOT, 'src/lib/imagens-dicom-admin.ts')).href,
  '@/lib/convite-server': pathToFileURL(path.join(ROOT, 'src/lib/convite-server.ts')).href,
};
const FALSOS = new Set(['@/lib/auth-admin', '@/lib/exame-admin']);

export async function resolve(specifier, context, nextResolve) {
  if (REAIS[specifier]) return { url: REAIS[specifier], shortCircuit: true };
  if (FALSOS.has(specifier)) return { url: `mock-rota:${specifier}`, shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'mock-rota:@/lib/auth-admin') {
    return {
      format: 'module', shortCircuit: true,
      source: `
        export const adminDb = () => ({});
        export const adminStorage = () => ({ bucket: () => ({}) });
        export async function requireUid(req) {
          const h = req.headers.get('authorization');
          return h === 'Bearer uid-teste-rota' ? 'uid-teste-rota' : null;
        }
      `,
    };
  }
  if (url === 'mock-rota:@/lib/exame-admin') {
    // Simula o miss: uid autenticado mas sem vinculo no local.
    return {
      format: 'module', shortCircuit: true,
      source: `export async function resolverPapel() { return null; }`,
    };
  }
  return nextLoad(url, context);
}
