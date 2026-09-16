// F2-T3 (spec §2.7): o rodapé do PDF assinado creditava errado (B20 —
// dizia "ASE/EACVI 2015; ASE 2025" enquanto raiz=WASE 2022 etc.).
// Fonte por domínio, decisão 26/08. Consumido pelo PDF na F3.
export const FONTES_POR_DOMINIO = {
  camaras: 'Lang 2015 (ASE/EACVI)',
  aorta: 'Goldstein 2015 (ASE); ACC/AHA 2022; WASE 2022',
  coracaoDireito: 'ASE 2025 (coração direito)',
  strain: 'ASE/EACVI 2025 (strain)',
} as const;

export function rodapeFontes(): string {
  return 'Valores de referência: Lang 2015 (ASE/EACVI); Goldstein 2015 (ASE); ' +
    'ACC/AHA 2022; WASE 2022; ASE 2025 (coração direito); ASE/EACVI 2025 (strain).';
}
