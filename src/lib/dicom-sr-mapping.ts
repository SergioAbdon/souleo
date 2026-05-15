// ════════════════════════════════════════════════════════════════════
// SOULEO · Mapeamento DICOM SR → Campos do Motor LEO
// ════════════════════════════════════════════════════════════════════
//
// Whitelist contextualizada: códigos SR (com grupo) → ID do input no motor V8.
//
// Por que ter contexto (LA_M-02550 em vez de M-02550 puro): o Vivid manda
// códigos genéricos (SNOMED-CT) que dependem do Measurement Group. Ex:
// "Diameter" (M-02550) sozinho não diz se é AE, Aorta ou outra estrutura.
// O Wader parser identifica o grupo pelos siblings e prefixa.
//
// Histórico: ver `docs/decisoes/2026-05-13-bug-acc-duplicado-remap-e-wader-sr.md`
// + memória local `feedback_dicom_sr_vivid_logica.md` (descoberta 15/05/2026).
// ════════════════════════════════════════════════════════════════════

/** Versão estruturada de uma medida SR (schema novo, 15/05/2026). */
export interface MedidaSr {
  value: number;
  unit: string;
  meaning: string;
  grupo: 'LA' | 'LV' | 'AO' | 'MV' | 'RA' | 'RV' | 'TV' | 'PV' | 'general';
}

/**
 * Whitelist: chave SR contextualizada → ID do input no motor V8 do Leo.
 *
 * SOMENTE inputs (medidas brutas). Calculados (FE, Massa, Volumes) NÃO
 * aparecem aqui — motor recalcula automaticamente a partir dos inputs.
 *
 * Conforme decidido em 15/05/2026 com Sergio: "VAMOS TESTAR ESSES INPUTS
 * POR ENQUANTO. DEPOIS QUANDO MOTOR FOR O SENNA, CORRELACIONAMOS."
 */
export const SR_TO_MOTOR: Record<string, { campo: string; nomePt: string }> = {
  // ── Câmaras (vão pra seção CÂMARAS do motor) ──
  'AO_18015-8':      { campo: 'b7',  nomePt: 'Raiz Aórtica' },           // Aortic Root Diameter (cm)
  'LA_M-02550':      { campo: 'b8',  nomePt: 'Átrio Esquerdo' },         // Diameter no grupo LA = AE 2D ⭐ (cm)
  'LV_29436-3':      { campo: 'b9',  nomePt: 'DDVE' },                   // LV Internal End Diastolic Dim (cm)
  'LV_18154-5':      { campo: 'b10', nomePt: 'Septo Interventricular' }, // IVS Diastolic Thickness (cm)
  'LV_18152-9':      { campo: 'b11', nomePt: 'Parede Posterior' },       // LV Posterior Wall Diastolic Thickness (cm)
  'LV_29438-9':      { campo: 'b12', nomePt: 'DSVE' },                   // LV Internal Systolic Dimension (cm)

  // ── Função Diastólica (seção DIASTÓLICA) ──
  'MV_18037-2':      { campo: 'b19', nomePt: 'Vel. Onda E (Mitral)' },   // E-Wave Peak Velocity (m/s)
  // 'MV_17978-8' (Onda A) e 'MV_59133-9' (e' Tissue) entram quando motor expandir

  // ── Átrio Esquerdo Volume (seção CÂMARAS — b24) ──
  'LA_GEU-106-0033': { campo: 'b24', nomePt: 'AE Vol. index' },          // LA End Systolic Vol Index (ml/m²)
};

/**
 * Detecta se o `medidasDicom` vem no schema NOVO (com contexto, value+unit+meaning)
 * ou no ANTIGO (só código → número).
 *
 * Schema novo: keys têm prefixo de grupo (`LA_`, `LV_`, etc) e valores são
 * objects `MedidaSr`. Schema antigo: keys são códigos puros, valores são `number`.
 */
export function isSchemaNovo(
  medidas: Record<string, MedidaSr | number> | undefined,
): medidas is Record<string, MedidaSr> {
  if (!medidas) return false;
  const firstKey = Object.keys(medidas)[0];
  if (!firstKey) return false;
  const firstVal = medidas[firstKey];
  return typeof firstVal === 'object' && firstVal !== null && 'value' in firstVal;
}

/**
 * Item normalizado pra apresentação no modal de import. Independe do
 * schema (novo/antigo) — o `normalizarParaImport` faz a tradução.
 */
export interface InputImport {
  /** Chave única (pro React key) — `LA_M-02550` ou só `M-02550`. */
  key: string;
  /** ID do campo no motor LEO (`b7`, `b8`, ...). */
  campo: string;
  /** Nome em PT mostrado no modal. */
  nomePt: string;
  /** Valor numérico que vai pro motor. */
  valor: number;
  /** Unidade pra exibição (vazio se não definida). */
  unit: string;
}

/**
 * Converte `exame.medidasDicom` (schema novo OU antigo) numa lista plana
 * de inputs prontos pro modal de import + motor.
 *
 * - Schema novo: usa chave contextualizada (`LA_M-02550`) — match direto na whitelist.
 * - Schema antigo: keys são códigos puros (`M-02550`). Tenta inferir o grupo
 *   procurando `*_<código>` em SR_TO_MOTOR — se ambíguo, pula.
 *
 * Códigos fora da whitelist (calculados, GE proprietários sem mapeamento)
 * são silenciosamente ignorados — motor recalcula tudo.
 */
export function normalizarParaImport(
  medidasDicom: Record<string, MedidaSr | number> | undefined,
): InputImport[] {
  if (!medidasDicom) return [];
  const novo = isSchemaNovo(medidasDicom);

  const result: InputImport[] = [];

  if (novo) {
    const m = medidasDicom as Record<string, MedidaSr>;
    for (const key of Object.keys(SR_TO_MOTOR)) {
      const dado = m[key];
      if (!dado) continue;
      const map = SR_TO_MOTOR[key];
      result.push({
        key,
        campo: map.campo,
        nomePt: map.nomePt,
        valor: dado.value,
        unit: dado.unit || '',
      });
    }
  } else {
    // Schema antigo (Record<string, number>) — tenta inferir o grupo
    // procurando alguma chave em SR_TO_MOTOR que termine com o código.
    const m = medidasDicom as Record<string, number>;
    for (const codePuro of Object.keys(m)) {
      const valor = m[codePuro];
      if (typeof valor !== 'number' || Number.isNaN(valor)) continue;
      // Procura matches em SR_TO_MOTOR cujo sufixo bate (`*_M-02550`)
      const matches = Object.keys(SR_TO_MOTOR).filter((k) => k.endsWith('_' + codePuro));
      if (matches.length === 1) {
        const key = matches[0];
        const map = SR_TO_MOTOR[key];
        result.push({ key, campo: map.campo, nomePt: map.nomePt, valor, unit: '' });
      }
      // Se 0 ou >1 matches, pula (ambíguo ou desconhecido)
    }
  }

  return result;
}

/**
 * Mapeia tipoExame → prefixo do nome do arquivo PDF.
 *
 * Usado em:
 *   - `nomeArq` no `gerarPdfHtml()` do page.tsx
 *   - Nome do arquivo gerado pelo botão "Imprimir Seleção" no DicomGallery
 *
 * Decisão 15/05/2026 (Sergio): "DINAMICO = SE FOR CAROTIDAS MUDA".
 */
export function prefixoArquivoPorTipo(tipoExame: string | undefined): string {
  switch (tipoExame) {
    case 'eco_tt':            return 'ECOTT';
    case 'doppler_carotidas': return 'DOPPLER CAROTIDAS';
    case 'eco_te':            return 'ECOTE';
    case 'eco_stress':        return 'ECO STRESS';
    default:                  return 'EXAME';
  }
}
