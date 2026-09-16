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
/**
 * Escopo travado com Dr. Sérgio 16/05/2026: integrar SOMENTE estes 12.
 * `casas` = casas decimais no arredondamento (regra por tipo).
 * `alvo`  = unidade que o motor LEO espera.
 *
 * CONVERSÃO DE UNIDADE ATIVA (16/05, autorizada — revoga a nota
 * anterior "SEM conversão"): o adaptador converte a unidade do SR
 * para `alvo` ANTES de arredondar. Necessário porque exames ANTIGOS
 * (pré-ajuste do Vivid) vêm em cm / m·s e os NOVOS em mm / cm·s — o
 * DICOM SR carrega a unidade, o adaptador normaliza (não o Vivid).
 * b13 (VD) NÃO entra: Vivid nunca emite conceito de VD no SR.
 */
export const SR_TO_MOTOR: Record<
  string,
  { campo: string; nomePt: string; casas: number; alvo: 'mm' | 'cm/s' | '' }
> = {
  // ── Câmaras (lineares → mm; SR pode vir cm[antigo] ou mm[novo]) ──
  'AO_18015-8':      { campo: 'b7',  nomePt: 'Raiz Aórtica',           casas: 0, alvo: 'mm'   }, // Aortic Root Diameter
  'LA_M-02550':      { campo: 'b8',  nomePt: 'Átrio Esquerdo',         casas: 0, alvo: 'mm'   }, // Diameter grupo LA = AE
  'LV_29436-3':      { campo: 'b9',  nomePt: 'DDVE',                    casas: 0, alvo: 'mm'   }, // LV End Diastolic Dim
  'LV_18154-5':      { campo: 'b10', nomePt: 'Septo Interventricular', casas: 0, alvo: 'mm'   }, // IVS Diast Thickness
  'LV_18152-9':      { campo: 'b11', nomePt: 'Parede Posterior',       casas: 0, alvo: 'mm'   }, // LV Post Wall Diast
  'LV_29438-9':      { campo: 'b12', nomePt: 'DSVE',                    casas: 0, alvo: 'mm'   }, // LV Systolic Dim
  'AO_18012-5':      { campo: 'b28', nomePt: 'Aorta Ascendente',       casas: 0, alvo: 'mm'   }, // Ascending Ao Diameter

  // ── Função Diastólica (velocidades → cm/s; razões → sem conversão) ──
  'MV_18037-2':      { campo: 'b19', nomePt: 'Vel. Onda E (Mitral)',   casas: 0, alvo: 'cm/s' }, // E-Wave (pode vir m/s)
  'MV_18038-0':      { campo: 'b20', nomePt: 'Relação E/A',            casas: 1, alvo: ''     }, // adimensional
  'MV_59133-9':      { campo: 'b21', nomePt: "e' septal",              casas: 1, alvo: 'cm/s' }, // Tissue (pode vir m/s)
  'MV_59111-5':      { campo: 'b22', nomePt: "Relação E/e'",           casas: 1, alvo: ''     }, // adimensional

  // ── Átrio Esquerdo Volume (índice — sem conversão) ──
  'LA_GEU-106-0033': { campo: 'b24', nomePt: 'AE Vol. index',          casas: 0, alvo: ''     }, // LA Vol Index ml/m²
};

/** Arredonda pro nº de casas decidido por tipo de medida (16/05/2026). */
function arredonda(v: number, casas: number): number {
  const f = Math.pow(10, casas);
  return Math.round(v * f) / f;
}

/**
 * Converte o valor da unidade do SR p/ a unidade que o motor espera.
 * Exames antigos vêm cm / m·s; novos mm / cm·s. Sem unidade (schema
 * antigo) → assume já correto (não converte). Razões/índices: nunca.
 */
export function converter(value: number, unitRaw: string, alvo: 'mm' | 'cm/s' | ''): number {
  const u = (unitRaw || '').toLowerCase().trim();
  if (alvo === 'mm') {
    if (u === 'cm') return value * 10;
    if (u === 'm') return value * 1000;
    return value; // 'mm' ou vazio → já em mm
  }
  if (alvo === 'cm/s') {
    if (u === 'm/s') return value * 100;
    if (u === 'mm/s') return value / 10;
    return value; // 'cm/s' ou vazio → já em cm/s
  }
  return value; // razões / índices → nunca converte
}

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
 * Detecta o schema ANTIGO (`Record<string, number>` — só código → valor cru,
 * sem unidade/contexto). Usado pra decidir se mostra o botão de reprocesso
 * (Task 12): exame com schema antigo nunca importa nada (ver `normalizarParaImport`).
 */
export function isSchemaAntigo(
  medidas: Record<string, MedidaSr | number> | undefined,
): medidas is Record<string, number> {
  if (!medidas) return false;
  const firstKey = Object.keys(medidas)[0];
  if (!firstKey) return false;
  return typeof medidas[firstKey] === 'number';
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

/** Formato de um perfil de mapeamento (mesma forma de `SR_TO_MOTOR`). */
export type MapaSr = Record<
  string,
  { campo: string; nomePt: string; casas: number; alvo: 'mm' | 'cm/s' | '' }
>;

/**
 * Converte `exame.medidasDicom` (schema novo) numa lista plana de inputs
 * prontos pro modal de import + motor, usando `mapa` (default `SR_TO_MOTOR`)
 * pra traduzir chave contextualizada (`LA_M-02550`) → campo do motor.
 *
 * Schema ANTIGO (`Record<string, number>` — código puro, sem unidade) SEMPRE
 * devolve `[]`: sem unidade não dá pra saber se o SR mandou cm ou mm, e
 * inferir por sufixo já causou import de valor 10× errado (ver Task 10 /
 * achados 1-2). Reprocessar exame antigo é o único caminho seguro (Task 12).
 *
 * Item com unidade ausente (`unit === ''`) e `alvo !== ''` (não é razão/índice)
 * também é descartado — sem saber a unidade não dá pra converter com segurança
 * (achado 17). Códigos fora da whitelist (calculados, GE proprietários sem
 * mapeamento) são silenciosamente ignorados — motor recalcula tudo.
 *
 * Nenhuma validação de faixa/min/max aqui — julgamento clínico é do médico
 * no modal de import (decisão 19b).
 */
export function normalizarParaImport(
  medidasDicom: Record<string, MedidaSr | number> | undefined,
  mapa: MapaSr = SR_TO_MOTOR,
): InputImport[] {
  if (!medidasDicom) return [];
  if (!isSchemaNovo(medidasDicom)) return [];

  const m = medidasDicom;
  const result: InputImport[] = [];

  for (const key of Object.keys(mapa)) {
    const dado = m[key];
    if (!dado) continue;
    const map = mapa[key];
    if (map.alvo !== '' && !dado.unit) continue; // unidade desconhecida não importa
    result.push({
      key,
      campo: map.campo,
      nomePt: map.nomePt,
      valor: arredonda(converter(dado.value, dado.unit, map.alvo), map.casas),
      unit: map.alvo || dado.unit || '',
    });
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
