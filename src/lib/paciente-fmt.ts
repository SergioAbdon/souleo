// ══════════════════════════════════════════════════════════════════
// LEO · Formatação de dados de paciente — CPF mascarado, data BR, idade.
// Extraído da lista e da ficha (Sub-plano 4, revisão final) pra não viver
// copiado em 2 arquivos e pra dar pra testar (`tests/unit/paciente-fmt.test.mjs`).
//
// ZERO imports locais (só tipos, se algum dia precisar): o `node --test`
// deste repo importa `.ts` direto (type-stripping nativo do Node), mas não
// resolve import encadeado entre `.ts` — um import local aqui deixaria o
// teste impossível de rodar.
// ══════════════════════════════════════════════════════════════════

/** Mascara o CPF mostrando só os 2 últimos dígitos: ***.***.***-NN. */
export function maskCpf(cpf?: string): string {
  const digitos = (cpf || '').replace(/\D/g, '');
  if (digitos.length < 2) return '—';
  return `***.***.***-${digitos.slice(-2)}`;
}

/** Formata o CPF com pontos e travessão: 000.000.000-00. Se não tiver 11 dígitos ou for vazio, degrada. */
export function formatCpf(cpf?: string): string {
  const digitos = (cpf || '').replace(/\D/g, '');
  if (digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }
  // Degrade like maskCpf: empty/undefined -> '—', else return trimmed original
  const trimmed = (cpf || '').trim();
  return trimmed ? trimmed : '—';
}

/** Formata yyyy-mm-dd como dd/mm/aaaa; sem data ou formato inesperado degrada. */
export function fmtData(d?: string): string {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

/**
 * Idade em anos completos a partir de uma data yyyy-mm-dd.
 *
 * `ateData` (yyyy-mm-dd) fixa a data de referência — é a idade NA DATA DO
 * EXAME, que é o que vai no laudo: um laudo reimpresso/reemitido anos depois
 * não pode envelhecer o paciente no papel assinado (S5-T10 fix / achado I1).
 * Sem `ateData` (ou com data inválida) cai em hoje — comportamento de sempre,
 * que a ficha do paciente e a lista continuam usando.
 */
export function calcIdade(dtnasc?: string, ateData?: string): number | null {
  if (!dtnasc) return null;
  const nasc = new Date(dtnasc + 'T00:00:00');
  if (isNaN(nasc.getTime())) return null;
  const ref = ateData ? new Date(ateData + 'T00:00:00') : new Date();
  if (isNaN(ref.getTime())) return calcIdade(dtnasc);
  let idade = ref.getFullYear() - nasc.getFullYear();
  const aniversarioAno = new Date(ref.getFullYear(), nasc.getMonth(), nasc.getDate());
  if (ref < aniversarioAno) idade--;
  return idade >= 0 ? idade : null;
}

/**
 * Idade como o motor escreve no laudo: `62 anos`, `1 ano`, `0 ano`
 * (`motorv8mp4.js:1109-1115` — `a > 1 ? 'anos' : 'ano'`). Sem data de
 * nascimento devolve '' (a moldura/tela é que decide o travessão).
 */
export function idadeLabel(dtnasc?: string, ateData?: string): string {
  // Sem data do exame o motor imprime '—' (não a idade de hoje) — os 2
  // call-sites do laudo passam ateData; '' deixa o travessão pro chamador.
  if (!dtnasc || !ateData) return '';
  const i = calcIdade(dtnasc, ateData);
  if (i === null) return '';
  return `${i} ${i > 1 ? 'anos' : 'ano'}`;
}
