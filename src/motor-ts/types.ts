// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Tipos / Interfaces
// Define a estrutura tipada de inputs e outputs do motor
// Equivalente moderno do "objeto d" do motorv8mp4.js
// ══════════════════════════════════════════════════════════════════

// ── INPUTS ──────────────────────────────────────────────────────

/** Identificação do paciente */
export interface Identificacao {
  nome: string;
  pacienteDtnasc: string;     // YYYY-MM-DD
  dataExame: string;          // YYYY-MM-DD
  convenio: string;
  solicitante: string;
}

/** Sexo: 'M' / 'F' / '' (vazio) */
export type Sexo = 'M' | 'F' | '';

/** Ritmo: 'S' regular (default) / 'N' irregular */
export type Ritmo = 'S' | 'N' | '';

/** Antropometria + condição basica */
export interface MedidasGerais {
  sexo: Sexo;
  ritmo: Ritmo;
  peso: number | null;        // kg
  altura: number | null;      // cm
}

/** Câmaras cardíacas e aorta (linear) */
export interface MedidasCamaras {
  raizAo: number | null;      // b7 (mm)
  ae: number | null;          // b8 (mm) — diâmetro linear (M-mode)
  ddve: number | null;        // b9 (mm)
  septoIV: number | null;     // b10 (mm)
  paredePosterior: number | null; // b11 (mm)
  dsve: number | null;        // b12 (mm)
  vd: number | null;          // b13 (mm)
  aoAscendente: number | null;// b28 (mm)
  arcoAo: number | null;      // b29 (mm)
}

/** Função diastólica */
export interface MedidasDiastolicas {
  ondaE: number | null;       // b19 (cm/s)
  relacaoEA: number | null;   // b20
  eSeptal: number | null;     // b21 (cm/s) — ANTES "tempo desaceleração", agora "e' septal"
  relacaoEEseptal: number | null; // b22 (E/e' septal — cutoff >15 ASE 2016)
  velocidadeIT: number | null; // b23 (m/s)
  psap: number | null;        // b37 (mmHg)
  volAEindex: number | null;  // b24 (ml/m²) — LAVI ASE 2015 (≤34/35-41/42-48/>48)
  volADindex: number | null;  // b25 (ml/m²) — RAVI JASE 2025 unificado (<30/30-36/>36-41/>41)
  laStrain: number | null;    // lars (%)
  sinaisHP: '' | 'S';         // b38
  // Modo manual diastologia (override do médico)
  modoManual: 'auto' | 'manual';
  selecaoManual: number;      // -1 a 6 (índice DIAST_SENTENCAS)
  textoLivre: string;
}

/** Sistólica */
export interface MedidasSistolicas {
  feSimpson: number | null;   // b54 (%)
  disfuncaoVD: GrauRefluxo;   // b32 ('' / L / LM / M / MI / I)
  tapse: number | null;       // b33 (mm)
  glsVE: number | null;       // gls_ve (%) — VR ≥ -20% (atualizado de -18%)
  glsVD: number | null;       // gls_vd (%) — VR ≥ -20%
}

/** Grau de refluxo / disfunção qualitativa */
export type GrauRefluxo = '' | 'L' | 'LM' | 'M' | 'MI' | 'I';

/** Morfologia valvar — 15 padrões */
export type MorfologiaValvar = '' |
  'EL' | 'ELM' | 'EM' | 'EMI' | 'EI' |
  'FL' | 'FLM' | 'FM' | 'FMI' | 'FI' |
  'EFL' | 'EFLM' | 'EFM' | 'EFMI' | 'EFI';

/** Válvulas — morfologia + refluxos */
export interface MedidasValvas {
  morfMitral: MorfologiaValvar;     // b34
  refluxoMitral: GrauRefluxo;       // b35
  morfTricuspide: MorfologiaValvar; // b34t
  refluxoTricuspide: GrauRefluxo;   // b36
  morfAortica: MorfologiaValvar;    // b39
  refluxoAortico: GrauRefluxo;      // b40
  morfPulmonar: MorfologiaValvar;   // b39p
  refluxoPulmonar: GrauRefluxo;     // b40p
  pmap: number | null;              // psmap (mmHg)
  derramePericard: GrauRefluxo;     // b41
  placasArco: '' | 's' | 'nv';      // b42
}

/** Estenoses (gradientes + áreas) */
export interface MedidasEstenoses {
  // Mitral
  gradMaxMitral: number | null;     // b45 (mmHg)
  gradMedMitral: number | null;     // b46 (mmHg)
  areaMitral: number | null;        // b47 (cm²)
  // Aórtica
  gradMaxAo: number | null;         // b50 (mmHg)
  gradMedAo: number | null;         // b51 (mmHg)
  areaAo: number | null;            // b52 (cm²)
  // Tricúspide
  gradMedTric: number | null;       // b46t (mmHg)
  areaTric: number | null;          // b47t (cm²)
  // Pulmonar
  gradMaxPulm: number | null;       // b50p (mmHg)
}

/** Wilkins Score */
export interface MedidasWilkins {
  ativo: boolean;                   // wilkins-toggle
  mobilidade: number;               // wk-mob (0-4)
  espessura: number;                // wk-esp (0-4)
  calcificacao: number;             // wk-cal (0-4)
  subvalvar: number;                // wk-sub (0-4)
}

/** Contratilidade segmentar */
export type CodigoSegmento = '' | 'H' | 'A' | 'D' |
  'HB' | 'HMB' | 'HM' | 'HMA' | 'HA' |
  'AB' | 'AMB' | 'AM' | 'AMA' | 'AA' |
  'DB' | 'DMB' | 'DM' | 'DMA' | 'DA';

export type CodigoDemaisParedes = 'NL' | 'HD' | 'HR' | 'AD' | 'DD';

export interface MedidasSegmentar {
  apex: '' | 'H' | 'A' | 'D';       // b55
  anterior: CodigoSegmento;         // b56
  septalAnterior: CodigoSegmento;   // b57
  septalInferior: CodigoSegmento;   // b58
  inferior: CodigoSegmento;         // b59 (corrigido AHA)
  inferolateral: CodigoSegmento;    // b60 (corrigido AHA)
  lateral: CodigoSegmento;          // b61 (corrigido AHA)
  demaisParedes: CodigoDemaisParedes;// b62
}

/** Configuração da clínica/médico (para PDF) */
export interface CfgSnapshot {
  clinica: string;
  slogan: string;
  localEnd: string;
  localTel: string;
  medNome: string;
  medCrm: string;
  medUf: string;
  p1: string;                       // cor primária
}

/** Pacote completo de inputs */
export interface MedidasEcoTT {
  identificacao: Identificacao;
  gerais: MedidasGerais;
  camaras: MedidasCamaras;
  diastolica: MedidasDiastolicas;
  sistolica: MedidasSistolicas;
  valvas: MedidasValvas;
  estenoses: MedidasEstenoses;
  wilkins: MedidasWilkins;
  segmentar: MedidasSegmentar;
  cfgSnapshot?: CfgSnapshot;
}

// ── DERIVADOS / CALCULADOS ──────────────────────────────────────

/** Grau de estenose calculado */
export type GrauEstenose = '' | 'leve' | 'moderada' | 'importante' | 'esclerose';

/** Resultado dos cálculos numéricos */
export interface CalculosDerivados {
  imc: number | null;               // kg/m²
  asc: number | null;               // m² (DuBois 71,84)
  aoae: number | null;              // razão Ao/AE
  vdf: number | null;               // ml (Teichholz)
  vsf: number | null;               // ml (Teichholz)
  feT: number | null;               // FE Teichholz (decimal 0-1)
  fs: number | null;                // Fração de encurtamento (decimal 0-1)
  massa: number | null;             // g (Devereux)
  imVE: number | null;              // g/m² (massa indexada)
  er: number | null;                // (SIV+PP)/DDVE
  aoIdx: number | null;             // cm²/m² (área aórtica indexada)
  idade: number | null;             // anos completos
  // Classificações de estenose
  estenMitGrau: GrauEstenose;
  estenAoGrau: GrauEstenose;
  estenTricGrau: GrauEstenose;
  estenPulmGrau: GrauEstenose;
  // Wilkins
  wilkinsScore: number | null;
}

// ── OUTPUTS ────────────────────────────────────────────────────

/** Resultado final do motor (a entregar pra UI) */
export interface ResultadoLaudo {
  derivados: CalculosDerivados;
  achados: string[];                // Lista de frases (renderizar)
  conclusoes: string[];             // Lista numerada
  alertas: AlertaUI[];              // Avisos visuais (alertaIT etc.)
  divergencia?: DivergenciaDiast;   // Quando manual diverge do auto
}

/** Alertas visuais */
export interface AlertaUI {
  tipo: 'IT_SEM_PSAP' | 'REFLUXO_PULM_SEM_PMAP';
  campo: string;
  mensagem: string;
}

/** Divergência diastologia auto vs manual */
export interface DivergenciaDiast {
  manual: string;
  auto: string;
  msg: string;
}

// ── SENTINELAS ──────────────────────────────────────────────────

/** Resultados especiais de j21 quando em fibrilação atrial */
export type SentinelaFA =
  | 'FA_PRESSAO_ELEVADA'
  | 'FA_PRESSAO_NORMAL'
  | 'FA_INDETERMINADA'
  | 'FA_SEM_DADOS';

/** Resultado bruto de j21 (texto OU sentinela) */
export type ResultadoJ21 = string | SentinelaFA;
