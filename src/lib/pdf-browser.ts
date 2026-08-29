// ══════════════════════════════════════════════════════════════════
// LEO · ciclo de vida do Chromium (S7-T0.2, achado P7)
// UM browser por INSTÂNCIA de lambda, não por invocação. Antes cada
// emissão pagava `puppeteer.launch()` + `browser.close()` (~0,5-1s de
// launch, toda vez). O binário do @sparticuz é descompactado dentro de
// `executablePath()` (66MB brotli → ~180MB em /tmp): com reuso isso
// acontece UMA vez por instância quente. O cold start continua pagando
// — não tem como evitar, a instância nasce com /tmp vazio.
// ══════════════════════════════════════════════════════════════════
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';

export type Lancador = () => Promise<Browser>;

// ── Resolver executável do Chrome (Vercel ou local) ──
async function resolverExecutavel(): Promise<{ executablePath: string; args: string[]; headless: boolean }> {
  const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isVercel) {
    return {
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    };
  }
  // Dev local: Chrome do sistema
  const localPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ];
  for (const path of localPaths) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(path)) {
        return { executablePath: path, args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true };
      }
    } catch { /* tenta proximo */ }
  }
  throw new Error('Chrome nao encontrado');
}

// O viewport 1240×1754 é o mesmo de sempre e continua amarrado ao
// `height:calc(100vh - 16mm)` das páginas de imagem (`laudo/[id]/page.tsx`):
// mudar um sem o outro reflowa o grid 2×4 de imagens.
export const lancarChromium: Lancador = async () => {
  const { executablePath, args, headless } = await resolverExecutavel();
  return puppeteer.launch({
    args,
    executablePath,
    headless,
    defaultViewport: { width: 1240, height: 1754 },
  });
};

// ponytail: browser quente sem teto de vida — a instância pode acumular
// memória do Chromium até o lambda reciclar. Teto conhecido; medir no Sentry
// pós-deploy e, se aparecer OOM, expirar o browser por idade/nº de páginas.
let browser: Browser | null = null;
let lancando: Promise<Browser> | null = null;   // trava: 2 invocações simultâneas → 1 launch

/** Browser da instância. Lança na primeira vez e relança se o anterior morreu. */
export async function obterBrowser(lancar: Lancador = lancarChromium): Promise<Browser> {
  if (browser?.connected) return browser;
  browser = null;
  if (!lancando) {
    lancando = lancar().then(
      (b) => { browser = b; lancando = null; return b; },
      (e) => { lancando = null; throw e; },
    );
  }
  return lancando;
}

/** Esquece o browser atual (e fecha em background). Próximo `obterBrowser` relança. */
export function descartarBrowser(): void {
  const morto = browser;
  browser = null;
  if (morto) void morto.close().catch(() => { /* já estava morto */ });
}

// Erro de "o browser reusado morreu no meio" — CDP fecha a sessão/conexão.
// Só ESTES autorizam o retry: um timeout de fonte ou um erro do laudo não
// pode ser repetido (dobraria a espera sem chance de dar certo).
// Frases INTEIRAS, não palavras soltas (M5): `protocol error` e `detached`
// sozinhos pegavam erro de DOM ("Protocol error (DOM.describeNode): Node is
// detached from document") — um erro do próprio laudo virava relançamento do
// Chromium e um segundo render de 15-60s pra falhar igual. Todo erro real de
// conexão traz um dos fechamentos abaixo no texto.
const ERRO_DE_CONEXAO = /target closed|session closed|connection closed|target detached|session detached|frame was detached|browser has disconnected/i;
export function ehErroDeConexao(e: unknown): boolean {
  return ERRO_DE_CONEXAO.test(e instanceof Error ? e.message : String(e));
}
