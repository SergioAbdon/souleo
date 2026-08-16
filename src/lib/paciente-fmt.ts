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

/** Formata yyyy-mm-dd como dd/mm/aaaa; sem data ou formato inesperado degrada. */
export function fmtData(d?: string): string {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

/** Idade em anos completos a partir de uma data yyyy-mm-dd. */
export function calcIdade(dtnasc?: string): number | null {
  if (!dtnasc) return null;
  const nasc = new Date(dtnasc + 'T00:00:00');
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const aniversarioAno = new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate());
  if (hoje < aniversarioAno) idade--;
  return idade >= 0 ? idade : null;
}
