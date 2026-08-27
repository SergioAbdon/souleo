// ══════════════════════════════════════════════════════════════════
// LEO Senna93 · F3-T5 — A VIRADA DO CABO (pintura dos nós da tela)
// ══════════════════════════════════════════════════════════════════
// Pinta EXATAMENTE os mesmos nós DOM que `renderizarLaudo()` do motor
// legado pintava (motorv8mp4.js:1178-1215), agora a partir do
// `ResultadoLaudo` que a ponte devolve:
//
//   #out-*        identificação impressa no PDF assinado (6 nós)
//   #calc-*       caixas de derivados da sidebar (10 + calc-wilkins)
//   #params-tbody as 12 linhas da tabela de parâmetros
//
// NADA de JSX, moldura, raspagem ou `gerarPdfHtml` muda: quem lê esses
// nós (PDF, Copiar Formatado, Copiar Texto, Word) continua lendo do
// mesmo lugar, com o mesmo `textContent`. O que muda é QUEM ESCREVE —
// e só com `senna93Params()` ON (page.tsx decide; este módulo não lê
// flag nenhuma).
//
// Divergências deliberadas (todas na allowlist da sombra,
// docs/planos/2026-08-27-senna93-divergencias-esperadas.md):
//  • separador decimal vírgula + truncamento (o legado usava toFixed);
//  • mm com 0 casas (era `34.0`, vira `34`);
//  • 12 linhas (Ao ascendente + arco — B14);
//  • realce OOR nas DUAS colunas de valor (B13);
//  • `calc-wilkins` LIMPA quando o escore sai de cena (o legado só
//    escrevia, nunca apagava — o "N pts" ficava fantasma na tela).
// ══════════════════════════════════════════════════════════════════

import type { ResultadoLaudo, MedidasEcoTT } from '@/senna90/types';
import { montarRowsTabela } from '../senna90/classificacoes/tabela';
import { valorTabela } from '../senna90/classificacoes/formatar';
import { escHtml } from './pdf-params';
import { lerMedidasDoDOM } from './motor-ts-adapter';

/**
 * O que a tela sabe e o motor não devolve: identificação crua, sexo/
 * peso/altura e as medidas b7..b29. É o MESMO objeto que a ponte manda
 * pro servidor (`lerMedidasDoDOM`) — nenhuma segunda leitura de DOM.
 */
export type IdentTela = MedidasEcoTT;
export const lerIdentTela: () => IdentTela = lerMedidasDoDOM;

/** textContent de um nó opcional (a sidebar/folha pode estar fechada). */
function txt(id: string, valor: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

/** Datas: `new Date(v+'T12:00')` — meio-dia mata o fuso (verbatim do legado). */
function dataBr(v: string): string {
  return v ? new Date(v + 'T12:00').toLocaleDateString('pt-BR') : '—';
}

/** "46 anos" / "1 ano" / "—" — plural do legado (`a>1`), idade do motor. */
function idadeTexto(idade: number | null): string {
  if (idade === null) return '—';
  return idade > 1 ? `${idade} anos` : `${idade} ano`;
}

/** Caixa da sidebar: 1 casa + '%' (a TABELA usa 0 casas — divergem de propósito). */
function pctCaixa(campo: 'feT' | 'fs', valor: number | null, dsveAusente: boolean): string {
  const s = valorTabela(campo, valor, { dsveAusente, casas: 1 });
  return valor === null ? s : s + '%'; // 'VIDE'/'—' não levam '%'
}

/** Caixas de derivados da sidebar → casas iguais às da tabela (ver formatar.ts). */
type CampoCaixa = 'imc' | 'asc' | 'vdf' | 'vsf' | 'massa' | 'imVE' | 'er' | 'aoae';
const CAIXAS: readonly (readonly [string, CampoCaixa])[] = [
  ['calc-imc', 'imc'], ['calc-asc', 'asc'], ['calc-vdf', 'vdf'], ['calc-vsf', 'vsf'],
  ['calc-massa', 'massa'], ['calc-im', 'imVE'], ['calc-er', 'er'], ['calc-aoae', 'aoae'],
];

/**
 * Pinta identificação + caixas + tabela a partir do resultado da ponte.
 * Chamada SÓ com a flag ON (page.tsx). Idempotente e sem estado.
 */
export function pintarTabelaSenna93(r: ResultadoLaudo, lerIdent: () => IdentTela): void {
  const d = r.derivados;
  const m = lerIdent();
  const id = m.identificacao;

  // ── 1) Identificação (#out-*) — o que o PDF assinado raspa de volta ──
  txt('out-nome', id.nome || '—');
  txt('out-idade', idadeTexto(d.idade));
  txt('out-dtnasc', dataBr(id.pacienteDtnasc));
  txt('out-convenio', id.convenio || '—');
  txt('out-solicitante', id.solicitante || '—');
  txt('out-dtexame', dataBr(id.dataExame));

  // ── 2) Caixas calc-* da sidebar ──
  const dsveAusente = m.camaras.dsve === null;
  for (const [nodeId, campo] of CAIXAS) txt(nodeId, valorTabela(campo, d[campo]));
  txt('calc-fe', pctCaixa('feT', d.feT, dsveAusente));
  txt('calc-fs', pctCaixa('fs', d.fs, dsveAusente));
  // Wilkins desligado (ou incompleto → score null, F1-T9) LIMPA a caixa.
  txt('calc-wilkins', d.wilkinsScore !== null ? `${d.wilkinsScore} pts` : '');

  // ── 3) Tabela de parâmetros (#params-tbody) ──
  const { rows, oor } = montarRowsTabela(m.gerais, medidasDaTabela(m), d, d.idade);
  const tb = document.getElementById('params-tbody');
  if (tb) tb.innerHTML = linhasHtml(rows, oor);
}

/** b7..b29 no formato do builder (o adapter chama de raizAo/ae/ddve/...). */
function medidasDaTabela(m: MedidasEcoTT) {
  const c = m.camaras;
  return {
    b7: c.raizAo, b8: c.ae, b9: c.ddve, b10: c.septoIV, b11: c.paredePosterior,
    b12: c.dsve, b13: c.vd, b28: c.aoAscendente, b29: c.arcoAo,
  };
}

/**
 * Mesma estrutura de `<tr>` do legado (classes `val`/`ref`/`params-divider`
 * — o CSS da tela é o de sempre, page.tsx), com duas diferenças:
 * `alert` sai também na coluna 5 (B13) e as células são ESCAPADAS (o
 * legado interpolava cru; VRs como `<25 kg/m²` só não viraram markup por
 * sorte). `textContent` — o que a raspagem lê — é idêntico nos dois casos.
 */
function linhasHtml(rows: string[][], oor: boolean[][]): string {
  return rows.map((r, i) => {
    const val = (j: number) => `val${oor[i]?.[j] ? ' alert' : ''}`;
    return `<tr><td>${escHtml(r[0])}</td><td class="${val(1)}">${escHtml(r[1])}</td>`
      + `<td class="ref">${escHtml(r[2])}</td><td class="ref">${escHtml(r[3])}</td>`
      + `<td class="params-divider">${escHtml(r[4])}</td><td class="${val(5)}">${escHtml(r[5])}</td>`
      + `<td class="ref">${escHtml(r[6])}</td><td class="ref">${escHtml(r[7])}</td></tr>`;
  }).join('');
}

/**
 * Campo condicional PSMAP — o que `refluxoPulmonar()` do motor legado faz
 * (motorv8mp4.js:741-744), com guard de nó ausente.
 *
 * F3-T6: é ela quem manda no `#field-psmap` agora — os 3 call-sites que
 * chamavam `window.refluxoPulmonar` (page.tsx ×2 + o `onChange` do `b40p`
 * em SidebarLaudo.tsx) apontam pra cá. A definição no motor legado fica
 * órfã até a F5 removê-la (invariante 9 do contrato trava as duas pontas).
 * DOM-pura e flag-independente: mesmo corpo do legado (`v('b40p')` → `''`
 * quando o nó falta = mesmo `none` do `sel?.value`), então o campo se
 * comporta igual com a flag ON e OFF.
 */
export function sincronizarCampoPmap(): void {
  const sel = document.getElementById('b40p') as HTMLSelectElement | null;
  const campo = document.getElementById('field-psmap');
  if (campo) campo.style.display = sel?.value ? 'block' : 'none';
}
