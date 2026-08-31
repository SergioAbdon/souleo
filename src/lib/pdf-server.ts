// ══════════════════════════════════════════════════════════════════
// LEO · PDF server-side (Puppeteer + Storage)
// Extraído de /api/emitir em 17/05 — reusado por /api/emitir e
// /api/corrigir-laudo (1 pipeline de PDF só, fonte única).
// Onda-3 (P9): as funções que só falam com o Storage/Firestore (salvar/ler/
// apagar PDF e snapshot) saíram pra pdf-storage.ts — a sombra
// (shadow/deps-admin.ts) só precisa ler o snapshot e não pode arrastar
// puppeteer-core + @sparticuz/chromium no bundle do cron.
// ══════════════════════════════════════════════════════════════════
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { assinarImagensExame, assinarUrlsNoHtml } from './imagens-dicom-admin';
import { obterBrowser, descartarBrowser, ehErroDeConexao } from './pdf-browser';
import { salvarPdfBuffer } from './pdf-storage';

// Teto da espera pelas fontes (S7-T0.2, achado P8). P8 follow-up: a moldura
// embute IBM Plex em base64 (pdf-fontes.ts) — zero rede — então
// `document.fonts.ready` resolve local e rápido. O teto fica de qualquer
// jeito: cinto barato contra um Chromium lento a decodificar o woff2.
const TETO_FONTES_MS = 8000;

// P1: o pdfHtml vem do cliente — o Chrome do servidor não pode ser o proxy
// dele. Só o que o laudo legitimamente usa: data: (logo/assinatura, e agora
// as fontes da moldura também — embutidas, P8 follow-up) e o próprio bucket
// (signed URLs das imagens DICOM). fonts.googleapis.com/fonts.gstatic.com
// SAÍRAM da allowlist: a moldura não faz mais essa requisição, e mantê-los
// aqui era superfície de SSRF sem uso legítimo nenhum.
// Prefixo com barra no bucket: "meu-bucketX" não passa.
export function urlPermitidaNoRender(url: string, bucketName: string): boolean {
  return url.startsWith('data:')
    || url.startsWith(`https://storage.googleapis.com/${bucketName}/`);
}

// ── Gerar PDF via Puppeteer + upload Storage ──
export async function gerarESalvarPdf(
  pdfHtml: string,
  wsId: string,
  exameId: string,
  nomeArq: string,
  // Fix I4: última checagem ANTES de publicar o PDF. A correção usa para
  // abortar se o exame foi REEMITIDO durante o Puppeteer — sem isso a escrita
  // atrasada devolveria o corpo clínico antigo por cima do laudo novo.
  // `false` → nada é escrito e a função devolve null.
  podeSalvar?: () => Promise<boolean>,
): Promise<string | null> {
  // D5b: imagens DICOM nascem privadas no Storage — troca a URL canonica
  // embutida no HTML (imagensSelecionadasPdf) por signed URL ANTES do
  // Puppeteer buscar. Sem isso o <img src> da 403: o Chrome headless busca
  // por rede, sem a credencial do Admin SDK. Ponto unico — cobre /api/emitir
  // e /api/corrigir-laudo, os dois chamadores desta funcao.
  const bucket = getStorage().bucket();
  const urlsAssinadas = await assinarImagensExame(getFirestore(), bucket, wsId, exameId);
  const htmlAssinado = assinarUrlsNoHtml(pdfHtml, urlsAssinadas);
  // FAIL-LOUD (S4-T15 fix X4): se sobrou URL canonica de imagem DICOM, a
  // assinatura nao cobriu tudo (imagem fora do exame, doc dessincronizado).
  // Sem isto o Chrome headless toma 403 naquele <img> e o PDF ASSINADO sai
  // com um retangulo vazio no lugar da imagem — sem erro nenhum. Melhor
  // abortar a emissao que publicar laudo com buraco silencioso.
  // Sem a barra final: a URL canonica gravada codifica o path inteiro
  // (encodeURIComponent), entao ela aparece como `/dicom%2F...` — `/dicom`
  // cobre as duas formas.
  // P4/E4: a esta altura a emissão JÁ foi cobrada — o texto antigo ("emissão
  // abortada") mentia dizendo que nada tinha acontecido.
  if (htmlAssinado.includes(`https://storage.googleapis.com/${bucket.name}/dicom`)) {
    throw new Error('imagem não assinada — PDF abortado');
  }
  // S7-T0.2: uma página por emissão, num browser que sobrevive à invocação.
  // Política de retry: UMA repetição, e só se o erro for de conexão — o
  // browser reusado pode ter morrido entre invocações (instância congelada,
  // OOM) e a gente só descobre ao usar. Erro do laudo ou timeout de fonte
  // NÃO repete (dobraria a espera sem chance de dar certo).
  const renderizar = async (): Promise<Uint8Array> => {
    const page = await (await obterBrowser()).newPage();
    try {
      // P1: o laudo não usa JS (o Chrome só pagina e imprime) e não pode fazer
      // o servidor buscar host arbitrário — SSRF/beacon, congelado no snapshot
      // e re-executado a cada correção administrativa. Precisa vir ANTES do
      // setContent: a interceptação só filtra requisições feitas depois dela.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (r) => {
        if (urlPermitidaNoRender(r.url(), bucket.name)) void r.continue();
        else { console.warn(`render: url bloqueada ${r.url().slice(0, 120)} (ws=${wsId} exame=${exameId})`); void r.abort(); }
      });
      // `load` (não `networkidle0`): o evento já espera as imagens do laudo —
      // que é o que o PDF precisa —, sem os 500ms de silêncio de rede nem
      // ficar refém de uma conexão pendurada. As fontes (embutidas, sem rede)
      // continuam esperadas explicitamente logo abaixo.
      await page.setContent(htmlAssinado, { waitUntil: 'load', timeout: 30000 });
      let teto: NodeJS.Timeout | undefined;
      await Promise.race([
        page.evaluateHandle('document.fonts.ready'),
        // Com wsId/exameId (M2): sem eles o aviso e anonimo no Sentry e nao da
        // pra saber QUAL laudo saiu em fonte de fallback quando o medico reclama.
        new Promise<void>((r) => { teto = setTimeout(() => { console.warn(`fontes: teto estourado, PDF sai em fallback (ws=${wsId} exame=${exameId})`); r(); }, TETO_FONTES_MS); }),
      ]);
      clearTimeout(teto);
      return await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
      });
    } finally {
      // Fecha só a PÁGINA. O browser fica de pé para a próxima invocação.
      await page.close().catch(() => { /* browser já morreu */ });
    }
  };

  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await renderizar();
  } catch (e) {
    if (!ehErroDeConexao(e)) throw e;
    console.warn('browser reusado morreu, relançando:', e);
    descartarBrowser();
    pdfBuffer = await renderizar();
  }

  if (podeSalvar && !(await podeSalvar())) return null;

  // Round 4 (Codex Critical, item 3): o snapshot NÃO é mais congelado aqui —
  // essa escrita saiu pra fora, pro caller chamar SÓ depois que a transação
  // de publicação confirmar que esta tentativa ainda é a dona (ver
  // salvarSnapshotHtml em pdf-storage.ts e o wiring em /api/emitir e
  // /api/corrigir-laudo). Gravar aqui, sem transação, deixava uma tentativa
  // perdedora sobrescrever o snapshot canônico da vencedora.
  return await salvarPdfBuffer(Buffer.from(pdfBuffer), wsId, exameId, nomeArq);
}
