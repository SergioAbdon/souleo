/**
 * Normalização de AccessionNumber (ADR 2026-05-18 — wader-ingest-resiliente).
 *
 * O ACC do LEO tem o formato `EX{ddmmaa}{hhmmsscc}` (16 chars, prefixo "EX").
 * Quando o Feegow cai, a recepção digita o ACC manualmente no Vivid e
 * frequentemente erra: digita SEM o prefixo `EX` (só os 14 dígitos), ou
 * com espaços. O match exato (`where('acc','==',x)`) então falha e o
 * exame fica órfão mesmo com o ACC "certo" no DICOM.
 *
 * `digitos()` extrai só os números ⇒ `EX18052616270366` e `18052616270366`
 * passam a casar. `candidatos()` gera as formas plausíveis pra tentar no
 * Firestore sem precisar varrer a coleção inteira.
 */

/** Só os dígitos do ACC (remove "EX", espaços, qualquer não-dígito). */
export function digitos(acc: string | null | undefined): string {
  return (acc || '').replace(/\D/g, '');
}

/** Dois ACCs são "o mesmo" se os dígitos batem (ignora prefixo/espaços). */
export function accIgual(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digitos(a);
  const db = digitos(b);
  return da.length > 0 && da === db;
}

/**
 * Formas plausíveis do ACC pra tentar no Firestore (`where('acc','==',c)`),
 * em ordem de probabilidade. Bounded (≤3) — nunca varre a coleção.
 *   ex.: "18052616270366" → ["18052616270366", "EX18052616270366"]
 *        "EX18052616270366" → ["EX18052616270366", "18052616270366"]
 */
export function candidatos(acc: string | null | undefined): string[] {
  const bruto = (acc || '').trim();
  const d = digitos(bruto);
  const set = new Set<string>();
  if (bruto) set.add(bruto);
  if (d) {
    set.add(d);
    set.add('EX' + d);
  }
  return [...set];
}
