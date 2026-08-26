// ══════════════════════════════════════════════════════════════════
// LEO · Codec do único checkbox da tela de laudo (Wilkins, S5-T4/nº15).
//
// `coletarMedidas()` e `setVal()` (src/app/laudo/[id]/page.tsx) são closures
// do componente — inalcançáveis por node --test sem refatorar o componente
// inteiro. Mas o par que os liga (checked → string salva → checked de volta)
// é o invariante cuja quebra silenciosa É o bug que esta task fecha (escore
// de Wilkins salvo volta desligado sem erro nenhum). Extraído aqui pra ter
// um lado pequeno e puro travado por teste (achado M4, revisão S5-T4).
// ══════════════════════════════════════════════════════════════════

export function checkboxParaMedida(checked: boolean): '1' | '0' {
  return checked ? '1' : '0';
}

export function medidaParaChecked(val: string): boolean {
  return val === '1';
}
