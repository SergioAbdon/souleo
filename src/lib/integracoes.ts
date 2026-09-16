// Tipos e rotulos da secao Integracoes (Sub-plano 5). Dado puro + formatacao:
// sem I/O e sem import @/ — o `node --test` do repo nao resolve import relativo
// encadeado entre .ts, entao este arquivo tem de se bastar.

export type TipoIntegracao = 'feegow' | 'orthanc' | 'wader';

export type Integracao = {
  tipo: TipoIntegracao;
  ativo?: boolean;
  status?: 'ok' | 'erro' | 'nunca_testado';
  ultimoTeste?: number | null;
  ultimoErro?: string | null;
  ultimaSync?: number | null;
  procMap?: Record<string, string>;  // feegow
  profMap?: Record<string, string>;  // feegow
  url?: string;                      // orthanc
  visto?: number | null;             // wader
  versao?: string;                   // wader
  maquina?: string;                  // wader
  /** Wader: hostname de OUTRO Wader batendo no mesmo workspace (heartbeat.ts). */
  conflito?: string | null;          // wader
  /** Wader: último erro do tick de ingestão DICOM (heartbeat.ts). */
  ultimoErroIngest?: string | null;  // wader
  credencialCadastradaEm?: number | null; // feegow/orthanc — Task 4, nunca o segredo em si
};

export const TIPOS_INTEGRACAO: { id: TipoIntegracao; rotulo: string; icone: string; descricao: string }[] = [
  { id: 'feegow',  rotulo: 'Feegow',  icone: '📅', descricao: 'Agenda e cadastro de pacientes da clínica.' },
  { id: 'orthanc', rotulo: 'Orthanc', icone: '🖼️', descricao: 'Servidor de imagens que recebe do aparelho.' },
  { id: 'wader',   rotulo: 'Wader',   icone: '🛰️', descricao: 'Programa que roda na clínica e traz as imagens.' },
];

/** Sem batimento por mais que isto, o Wader conta como fora do ar. */
export const SEM_SINAL_MS = 15 * 60 * 1000;

function dataHora(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * O que o cartao escreve. Regra da spec §5.2: existir credencial NAO e "conectado" —
 * o que vale e o ultimo teste. O Wader tem estado proprio: o batimento.
 */
export function rotuloEstado(i: Integracao, agoraMs: number): string {
  if (i.tipo === 'wader') {
    if (!i.visto) return 'Nunca apareceu';
    const faz = agoraMs - i.visto;
    if (faz <= SEM_SINAL_MS) {
      const min = Math.max(1, Math.round(faz / 60000));
      return `No ar — visto há ${min} min`;
    }
    return `Sem sinal desde ${dataHora(i.visto)}`;
  }
  if (i.status === 'ok') return i.ultimoTeste ? `Conexão OK — testada ${dataHora(i.ultimoTeste)}` : 'Conexão OK';
  if (i.status === 'erro') return i.ultimoErro ? `Erro: ${i.ultimoErro}` : 'Erro na última tentativa';
  return 'Nunca testado';
}

/**
 * Cor da pilula. Mesma fonte de verdade que rotuloEstado — mesmo `i` e
 * `agoraMs` — pra cor e texto nunca divergirem (spec §5.2).
 */
export function tomEstado(i: Integracao, agoraMs: number): 'ok' | 'erro' | 'neutro' {
  if (i.tipo === 'wader') {
    if (!i.visto) return 'neutro';
    return agoraMs - i.visto <= SEM_SINAL_MS ? 'ok' : 'erro';
  }
  if (i.status === 'ok') return 'ok';
  if (i.status === 'erro') return 'erro';
  return 'neutro';
}
