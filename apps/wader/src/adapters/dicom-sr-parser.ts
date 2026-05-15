import { OrthancClient, OrthancSeries, SimplifiedTags } from './orthanc-client';
import { createLogger } from '../logger';

const log = createLogger({ module: 'dicom-sr-parser' });

/**
 * Uma medida extraída do DICOM SR, com contexto suficiente pra mapear pro
 * motor LEO sem ambiguidade.
 *
 * Por que `grupo` é crítico: códigos genéricos como `M-02550` ("Diameter")
 * aparecem em vários Measurement Groups do SR (LA, AO, LV...). Sem saber
 * o grupo, não dá pra dizer qual diâmetro é qual. O parser identifica o
 * grupo pelos *siblings* do Measurement Group (ex: se tem códigos com
 * "Left Atrium" no meaning, o grupo é LA).
 *
 * Ver `feedback_dicom_sr_vivid_logica.md` na memória local (15/05/2026).
 */
export interface MedidaSr {
  value: number;
  unit: string;     // ex: 'cm', 'm/s', 'ml', '%', ''
  meaning: string;  // ex: 'Diameter', 'Left Ventricle Internal End Diastolic Dimension'
  grupo: GrupoSr;
}

/**
 * Grupo (estrutura anatômica) do Measurement Group. Determinado pelos
 * siblings — palavras-chave em outros `CodeMeaning` dentro do mesmo grupo.
 *
 * 'general' é o fallback pra medidas que não estão dentro de um Measurement
 * Group claro (ex: Patient Weight, Patient Height — nível de paciente, não
 * de estrutura).
 */
export type GrupoSr = 'LA' | 'LV' | 'AO' | 'MV' | 'RA' | 'RV' | 'TV' | 'PV' | 'general';

/**
 * Resultado da extração de medidas DICOM SR de um estudo.
 *
 * `medidas` tem chave no formato `"{grupo}_{codeValue}"` (ex: `LA_M-02550`,
 * `LV_29436-3`). Cada valor é um `MedidaSr` com value+unit+meaning+grupo.
 *
 * `srInstanceId` é o ID Orthanc da instance SR processada (null se estudo
 * não tem série SR). Útil pra debug e idempotência.
 *
 * `metodoFallback`:
 *   - 'content-sequence' (caminho feliz, padrão DICOM SR)
 *   - 'tags-diretas' (estudos legados / SR malformado)
 *   - 'sem-sr' (estudo não tem série SR — comum em US vascular básico)
 *
 * MUDANÇA 15/05/2026: schema antigo era `Record<string, number>` (só código→
 * valor). Agora é `Record<string, MedidaSr>` com contexto rico — necessário
 * pra resolver ambiguidades como M-02550 ("Diameter" genérico). Parser do
 * Leo web sabe ler os dois schemas pra backward compat com exames antigos.
 */
export interface SrParseResult {
  medidas: Record<string, MedidaSr>;
  srInstanceId: string | null;
  totalMedidas: number;
  metodoFallback: 'content-sequence' | 'tags-diretas' | 'sem-sr';
}

/**
 * Localiza a série SR (Modality=SR) num estudo Orthanc e extrai as medidas
 * contextualizadas.
 *
 * Retorna `{ medidas: {}, srInstanceId: null, metodoFallback: 'sem-sr' }` se
 * o estudo não tiver SR — cenário normal pra US vascular (carótida).
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

  // 5) Parser recursivo do ContentSequence — versão com contexto de grupo
  const medidas: Record<string, MedidaSr> = {};
  extrairDoContentSequence(tags?.ContentSequence, medidas, 'general');

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
 * Heurística pra detectar o grupo (estrutura anatômica) de um Measurement
 * Group, baseada nos meanings dos siblings. Olha os primeiros 30 nós do
 * grupo procurando palavras-chave em inglês.
 *
 * Ex: se um sibling tem `CodeMeaning: "Left Atrium Area A4C view"`, retorna 'LA'.
 *
 * Funciona porque o Vivid agrupa todas as medidas relacionadas à mesma
 * estrutura num único Measurement Group (vi isso confirmado no SR Edwaldo).
 */
function detectarGrupo(siblings: unknown[]): GrupoSr {
  if (!Array.isArray(siblings)) return 'general';
  let votos: Record<GrupoSr, number> = { LA: 0, LV: 0, AO: 0, MV: 0, RA: 0, RV: 0, TV: 0, PV: 0, general: 0 };
  for (const item of siblings.slice(0, 40)) {
    const it = item as Record<string, unknown>;
    const conceptSeq = it.ConceptNameCodeSequence as Array<Record<string, string>> | undefined;
    const m = (conceptSeq?.[0]?.CodeMeaning || '').toLowerCase();
    if (!m) continue;
    if (m.includes('left atri') || m.startsWith('la ') || m.includes(' la ')) votos.LA++;
    else if (m.includes('left ventric') || m.startsWith('lv ') || m.includes(' lv ')) votos.LV++;
    else if (m.includes('aortic') || m.includes('aorta')) votos.AO++;
    else if (m.includes('mitral')) votos.MV++;
    else if (m.includes('right atri') || m.startsWith('ra ') || m.includes(' ra ')) votos.RA++;
    else if (m.includes('right ventric') || m.startsWith('rv ') || m.includes(' rv ')) votos.RV++;
    else if (m.includes('tricuspid')) votos.TV++;
    else if (m.includes('pulmonary') || m.includes('pulmonic')) votos.PV++;
  }
  // Vencedor por maioria simples
  let max = 0;
  let grupo: GrupoSr = 'general';
  for (const g of Object.keys(votos) as GrupoSr[]) {
    if (votos[g] > max) { max = votos[g]; grupo = g; }
  }
  return grupo;
}

/**
 * Percorre recursivamente `ContentSequence` extraindo medidas com contexto.
 *
 * Quando encontra um nó com `CodeMeaning === "Measurement Group"`, detecta
 * o grupo (LA/AO/LV/MV/etc) pelos siblings e passa esse contexto pros
 * filhos via parâmetro recursivo.
 */
function extrairDoContentSequence(
  content: unknown,
  medidas: Record<string, MedidaSr>,
  grupoAtual: GrupoSr,
): void {
  if (!Array.isArray(content)) return;
  for (const item of content) {
    const it = item as Record<string, unknown>;
    const conceptSeq = it.ConceptNameCodeSequence as Array<Record<string, string>> | undefined;
    const codeValue = conceptSeq?.[0]?.CodeValue || '';
    const meaning = conceptSeq?.[0]?.CodeMeaning || '';

    // Se estamos entrando num Measurement Group, redetecta o grupo
    // baseado nos siblings desse grupo (sobrescreve o grupoAtual no
    // descent recursivo, mas restaura ao sair via novo escopo).
    let grupoFilhos = grupoAtual;
    if (meaning === 'Measurement Group' && it.ContentSequence) {
      const filhos = it.ContentSequence as unknown[];
      grupoFilhos = detectarGrupo(filhos);
    }

    // Extrai valor + unidade se este nó é uma medida numérica
    const measuredSeq = it.MeasuredValueSequence as Array<Record<string, unknown>> | undefined;
    const numericValue =
      (measuredSeq?.[0]?.NumericValue as string | undefined) ??
      (it.NumericValue as string | undefined);

    if (codeValue && numericValue !== undefined) {
      const v = parseFloat(numericValue);
      if (!Number.isNaN(v)) {
        const unitSeq = measuredSeq?.[0]?.MeasurementUnitsCodeSequence as Array<Record<string, string>> | undefined;
        const unit = unitSeq?.[0]?.CodeValue || '';
        const key = `${grupoAtual}_${codeValue}`;
        // Se já existe, mantém a primeira (evita sobrescrever — algumas medidas
        // aparecem duplicadas no SR, valores idênticos)
        if (!(key in medidas)) {
          medidas[key] = { value: v, unit, meaning, grupo: grupoAtual };
        }
      }
    }

    // Recursivo: passa o grupo (do filho, se entramos num MG; do pai, senão)
    if (it.ContentSequence) extrairDoContentSequence(it.ContentSequence, medidas, grupoFilhos);
  }
}

/**
 * Fallback pra Vivid antigos que colocam medidas em tags top-level com
 * nomes legíveis. Mapeia pros equivalentes contextualizados.
 *
 * Mantido por compat — raro de ser usado em produção.
 */
function aplicarFallbackTagsDiretas(
  tags: SimplifiedTags | undefined,
  medidas: Record<string, MedidaSr>,
): void {
  if (!tags) return;
  const direct = tags as Record<string, string>;

  const directMap: Array<{ tag: string; codeValue: string; grupo: GrupoSr; meaning: string; unit: string }> = [
    { tag: 'LeftVentricleEndDiastolicDimension', codeValue: '29436-3', grupo: 'LV', meaning: 'LV Internal End Diastolic Dimension', unit: 'cm' },
    { tag: 'LeftVentricleEndSystolicDimension', codeValue: '29438-9', grupo: 'LV', meaning: 'LV Internal Systolic Dimension', unit: 'cm' },
    { tag: 'InterventricularSeptumThickness', codeValue: '18154-5', grupo: 'LV', meaning: 'Interventricular Septum Diastolic Thickness', unit: 'cm' },
    { tag: 'LeftVentricularPosteriorWallThickness', codeValue: '18152-9', grupo: 'LV', meaning: 'LV Posterior Wall Diastolic Thickness', unit: 'cm' },
    { tag: 'EjectionFraction', codeValue: '18043-0', grupo: 'LV', meaning: 'LV Ejection Fraction', unit: '%' },
    { tag: 'LeftAtriumDimension', codeValue: 'M-02550', grupo: 'LA', meaning: 'Diameter', unit: 'cm' },
    { tag: 'AorticRootDimension', codeValue: '18015-8', grupo: 'AO', meaning: 'Aortic Root Diameter', unit: 'cm' },
  ];

  for (const m of directMap) {
    const v = direct[m.tag];
    if (v) {
      const num = parseFloat(v);
      if (!Number.isNaN(num)) {
        medidas[`${m.grupo}_${m.codeValue}`] = { value: num, unit: m.unit, meaning: m.meaning, grupo: m.grupo };
      }
    }
  }
}
