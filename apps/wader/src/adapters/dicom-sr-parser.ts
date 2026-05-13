import { OrthancClient, OrthancSeries, SimplifiedTags } from './orthanc-client';
import { createLogger } from '../logger';

const log = createLogger({ module: 'dicom-sr-parser' });

/**
 * Resultado da extração de medidas DICOM SR de um estudo.
 *
 * `medidas` é um Record `codigoLOINC -> valor numerico`. Códigos LOINC são
 * os identificadores padrão de medidas clínicas (ex: '18083-6' = LV End-Diastolic
 * Dimension). O motor V8 do LEO web já sabe interpretar esses códigos via
 * `window.importarDICOM({ measurements: medidas, ... })`.
 *
 * `srInstanceId` é o ID Orthanc da instance SR processada (`null` se estudo não
 * tem série SR). Útil pra debug e idempotência (registrar qual SR alimentou
 * `medidasDicom`).
 *
 * `totalMedidas` é tamanho do dict de medidas — atalho pra UI ("23 medidas").
 *
 * `metodoFallback` indica se o parser caiu no fallback de tags diretas (raro):
 *   - 'content-sequence' (caminho feliz, padrão DICOM SR)
 *   - 'tags-diretas' (estudos legados / SR malformado)
 *   - 'sem-sr' (estudo não tem série SR — comum em US vascular básico)
 */
export interface SrParseResult {
  medidas: Record<string, number>;
  srInstanceId: string | null;
  totalMedidas: number;
  metodoFallback: 'content-sequence' | 'tags-diretas' | 'sem-sr';
}

/**
 * Localiza a série SR (Modality=SR) num estudo Orthanc e extrai as medidas.
 *
 * Retorna `{ medidas: {}, srInstanceId: null, metodoFallback: 'sem-sr' }` se
 * o estudo não tiver SR — isso é cenário NORMAL (ex: US vascular básico do
 * Vivid T8 não gera SR pra carótida; só pra eco).
 *
 * **Lógica reaproveitada de** `src/app/api/orthanc/route.ts:245-388` (Leo Cloud).
 * Diferenças relevantes:
 *   - Aqui usa `OrthancClient` injetado (não fetch direto)
 *   - Roda server-side na rede da clínica (Vercel não alcança 192.168.x.x)
 *   - Output vai pro Firestore (`exame.medidasDicom`), não pra resposta HTTP
 */
export async function extrairMedidasDoEstudo(opts: {
  client: OrthancClient;
  orthancStudyId: string;
}): Promise<SrParseResult> {
  const { client, orthancStudyId } = opts;

  // 1) Listar séries do estudo
  const series: OrthancSeries[] = await client.getStudySeries(orthancStudyId);
  if (!series.length) {
    log.warn({ orthancStudyId }, 'Estudo sem séries — não dá pra extrair SR');
    return { medidas: {}, srInstanceId: null, totalMedidas: 0, metodoFallback: 'sem-sr' };
  }

  // 2) Procurar série SR (Structured Report)
  const serieSr = series.find((s) => s.MainDicomTags?.Modality === 'SR');
  if (!serieSr || !serieSr.Instances?.length) {
    log.info({ orthancStudyId, totalSeries: series.length }, 'Estudo sem série SR (normal pra US vascular básico)');
    return { medidas: {}, srInstanceId: null, totalMedidas: 0, metodoFallback: 'sem-sr' };
  }

  // 3) Pega a primeira instance da série SR (em geral é 1 só)
  const srInstanceId = serieSr.Instances[0];

  // 4) Extrair tags simplified
  let tags: SimplifiedTags;
  try {
    tags = await client.getInstanceSimplifiedTags(srInstanceId);
  } catch (err) {
    log.error({ err, srInstanceId }, 'Falha ao baixar tags do SR');
    return { medidas: {}, srInstanceId, totalMedidas: 0, metodoFallback: 'sem-sr' };
  }

  // 5) Parser recursivo do ContentSequence (caminho principal)
  const medidas: Record<string, number> = {};
  extrairDoContentSequence(tags?.ContentSequence, medidas);

  let metodoFallback: SrParseResult['metodoFallback'] = 'content-sequence';

  // 6) Fallback: se ContentSequence vazio, tenta tags diretas conhecidas
  if (Object.keys(medidas).length === 0) {
    aplicarFallbackTagsDiretas(tags, medidas);
    metodoFallback = Object.keys(medidas).length > 0 ? 'tags-diretas' : 'content-sequence';
  }

  log.info(
    { orthancStudyId, srInstanceId, totalMedidas: Object.keys(medidas).length, metodoFallback },
    'SR processado',
  );

  return {
    medidas,
    srInstanceId,
    totalMedidas: Object.keys(medidas).length,
    metodoFallback,
  };
}

/**
 * Percorre recursivamente `ContentSequence` extraindo pares
 * (ConceptNameCodeSequence[0].CodeValue → MeasuredValueSequence[0].NumericValue).
 *
 * Códigos LOINC esperados (exemplos):
 *   - 18083-6: Diâmetro Diastólico do VE
 *   - 18085-1: Diâmetro Sistólico do VE
 *   - 18043-0: Fração de Ejeção
 *   - 18010-9: Diâmetro do AE
 *   ...
 *
 * Mutação no dict `medidas` é intencional (acumula valores).
 */
function extrairDoContentSequence(content: unknown, medidas: Record<string, number>): void {
  if (!Array.isArray(content)) return;
  for (const item of content) {
    const it = item as Record<string, unknown>;

    // Código LOINC vem do ConceptNameCodeSequence
    const conceptSeq = it.ConceptNameCodeSequence as Array<Record<string, string>> | undefined;
    const codeValue = conceptSeq?.[0]?.CodeValue || '';

    // Valor numérico vem do MeasuredValueSequence
    const measuredSeq = it.MeasuredValueSequence as Array<Record<string, string>> | undefined;
    if (codeValue && measuredSeq?.[0]?.NumericValue !== undefined) {
      const v = parseFloat(measuredSeq[0].NumericValue);
      if (!Number.isNaN(v)) medidas[codeValue] = v;
    }

    // Formato alternativo: NumericValue direto no item (raro mas existe)
    if (codeValue && it.NumericValue !== undefined && !(codeValue in medidas)) {
      const v = parseFloat(it.NumericValue as string);
      if (!Number.isNaN(v)) medidas[codeValue] = v;
    }

    // Recursivo: ContentSequence aninhado (medidas em árvore)
    if (it.ContentSequence) extrairDoContentSequence(it.ContentSequence, medidas);
  }
}

/**
 * Fallback: alguns Vivid antigos não usam ContentSequence — colocam medidas
 * direto em tags top-level com nomes legíveis. Mapeia esses nomes pros códigos
 * LOINC correspondentes.
 */
function aplicarFallbackTagsDiretas(
  tags: SimplifiedTags | undefined,
  medidas: Record<string, number>,
): void {
  if (!tags) return;
  const direct = tags as Record<string, string>;

  const directMap: Record<string, string> = {
    LeftVentricleEndDiastolicDimension: '18083-6',
    LeftVentricleEndSystolicDimension: '18085-1',
    InterventricularSeptumThickness: '18157-8',
    LeftVentricularPosteriorWallThickness: '18159-4',
    EjectionFraction: '18043-0',
    LeftAtriumDimension: '18010-9',
    AorticRootDimension: '18008-3',
  };

  for (const [tagName, code] of Object.entries(directMap)) {
    const v = direct[tagName];
    if (v) {
      const num = parseFloat(v);
      if (!Number.isNaN(num)) medidas[code] = num;
    }
  }
}
