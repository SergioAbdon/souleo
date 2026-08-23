// ══════════════════════════════════════════════════════════════════
// SOULEO · Merge por linha — "última alteração vence" (S5-T2)
// ══════════════════════════════════════════════════════════════════
//
// O motor (Senna90) regera achados/conclusões a CADA medida digitada.
// Antes desta task o resultado era `setContent()` cru: tudo que o médico
// tinha escrito no editor era jogado fora a cada tecla na sidebar.
//
// Decisão D2-c do Sergio — "última alteração vence":
//   · linha do motor que o médico NÃO tocou  → motor manda (sai a versão nova)
//   · linha do motor que o médico EDITOU     → se o motor mudou o conteúdo
//     (a medida mudou), a versão do motor vence; se o motor gerou a MESMA
//     coisa, a edição do médico fica
//   · linha que o médico ESCREVEU            → fica sempre, ancorada na linha
//     do motor que vinha antes dela
//   · linha que o médico APAGOU              → continua apagada, a menos que
//     o motor tenha mudado o conteúdo dela (aí volta com o texto novo)
//   · slot que sumiu do motor                → a linha some, editada ou não
//     (a medida deixou de justificar o achado — manter seria laudo falso)
//
// PURO: sem DOM, sem React. Testado em tests/unit/laudo-merge.test.mjs.
// ══════════════════════════════════════════════════════════════════

/** Limiar da heurística de "mesma linha, texto diferente". */
const LIMIAR = 0.6;

/** Tokens normalizados (minúsculas, sem acento, sem pontuação), EM ORDEM. */
function tokens(linha: string): string[] {
  return (linha || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Palavras que nomeiam ESTRUTURA (válvula, câmara, lado). Se duas linhas
 * discordam em qualquer uma delas, falam de coisas diferentes — por mais
 * parecido que seja o resto da frase. Foi o buraco do review (Critical 3):
 * "Insuficiência Mitral leve." × "Insuficiência Aórtica leve." pontuava
 * 0.667 e "…ventrículo esquerdo." × "…ventrículo direito." 0.800, ambos
 * ACIMA do par legítimo "leve" × "leve a moderada" (0.600).
 */
const ESTRUTURA = new Set([
  'esquerdo', 'esquerda', 'direito', 'direita', 'biventricular',
  'mitral', 'aortica', 'aortico', 'tricuspide', 'pulmonar',
]);

function estruturas(toks: string[]): Set<string> {
  return new Set(toks.filter((t) => ESTRUTURA.has(t)));
}

/**
 * Semelhança entre duas linhas = tokens em comum / tamanho da maior, com
 * DOIS portões antes: as frases do motor abrem pelo sujeito ("Ventrículo
 * esquerdo…", "Insuficiência Mitral…"), então
 *   1. as duas primeiras palavras têm de bater, e
 *   2. as palavras de estrutura/lado têm de ser as mesmas.
 * Sem os portões o merge trocava a conclusão de uma válvula pela de outra.
 *
 * ponytail: heurística de saco de palavras com dois portões — barata e
 * suficiente pras frases do motor (mudam 1-2 palavras: "leve"→"moderado").
 * Limites conhecidos, os DOIS na direção segura (a linha vira "manual": o
 * texto do médico FICA, só deixa de sofrer override do motor):
 *   · médico reescreve o começo da frase ("O ventrículo…") → não casa mais;
 *   · motor troca a 2a palavra ("Hipertrofia concêntrica" → "excêntrica")
 *     numa linha JÁ editada → as duas versões convivem no laudo.
 * O que NÃO acontece mais: apagar frase do médico casando anatomias
 * diferentes. Upgrade, se doer: diff word-level (levenshtein por palavra).
 */
function semelhanca(a: string, b: string): number {
  const la = tokens(a);
  const lb = tokens(b);
  if (la.length === 0 || lb.length === 0) return 0;
  // Portão 1 — mesmo sujeito (as 2 primeiras palavras).
  if (la[0] !== lb[0] || (la[1] || '') !== (lb[1] || '')) return 0;
  // Portão 2 — mesma estrutura/lado.
  const ea = estruturas(la);
  const eb = estruturas(lb);
  if (ea.size !== eb.size) return 0;
  for (const t of ea) if (!eb.has(t)) return 0;

  const ta = new Set(la);
  const tb = new Set(lb);
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns / Math.max(ta.size, tb.size);
}

/** Par alinhado: [índice em `a`, índice em `b`] — null = sem contraparte. */
type Par = [number | null, number | null];

/**
 * Alinha duas listas de linhas:
 *   1. LCS por igualdade exata (listas ≤ ~40 linhas, O(n·m) é trivial);
 *   2. dentro de cada buraco do LCS ("hunk"), pareia por semelhança ≥ 60%
 *      — é aqui que "VE ... grau leve" reencontra "VE ... grau moderado".
 * Devolve os pares na ordem de `b` (a ordem de saída é sempre a de quem
 * chegou por último: o motor no passo 2, o editor no passo 1).
 */
function alinhar(a: string[], b: string[]): Par[] {
  // ── LCS ──
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Ops em ordem: ['=', i, j] casamento exato | ['-', i] só em a | ['+', j] só em b
  const ops: Array<['=' | '-' | '+', number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push(['=', i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', i, -1]); i++; }
    else { ops.push(['+', -1, j]); j++; }
  }
  while (i < n) { ops.push(['-', i, -1]); i++; }
  while (j < m) { ops.push(['+', -1, j]); j++; }

  // ── Pares, resolvendo cada hunk por semelhança ──
  const pares: Par[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k][0] === '=') { pares.push([ops[k][1], ops[k][2]]); k++; continue; }
    // hunk = run de ops não-casadas
    const soA: number[] = [];
    const soB: number[] = [];
    while (k < ops.length && ops[k][0] !== '=') {
      if (ops[k][0] === '-') soA.push(ops[k][1]);
      else soB.push(ops[k][2]);
      k++;
    }
    // pareamento guloso na ordem de b: cada linha nova busca a linha velha
    // mais parecida ainda livre
    const parDeB = new Map<number, number>();
    const usados = new Set<number>();
    for (const bi of soB) {
      let melhor = -1;
      let melhorSim = LIMIAR;
      for (const ai of soA) {
        if (usados.has(ai)) continue;
        const s = semelhanca(a[ai], b[bi]);
        if (s >= melhorSim) { melhorSim = s; melhor = ai; }
      }
      if (melhor >= 0) { parDeB.set(bi, melhor); usados.add(melhor); }
    }
    const saiu = new Set<number>();
    for (const bi of soB) {
      const ai = parDeB.get(bi);
      if (ai === undefined) { pares.push([null, bi]); continue; }
      // linhas de `a` sem contraparte que vinham ANTES saem primeiro (a
      // posição delas importa: é onde moram as âncoras das linhas manuais)
      for (const aj of soA) if (aj < ai && !usados.has(aj) && !saiu.has(aj)) { pares.push([aj, null]); saiu.add(aj); }
      pares.push([ai, bi]);
      saiu.add(ai);
    }
    for (const aj of soA) if (!saiu.has(aj)) pares.push([aj, null]);
  }
  return pares;
}

// ── Wilkins ────────────────────────────────────────────────────────
// O motor emite UMA linha-sentinela `__WILKINS__{json}`; o page.tsx a
// explode em 3-6 parágrafos formatados dentro do editor. Sem colapsar de
// volta, o merge veria parágrafos "manuais" (que ficariam pra sempre) e
// uma sentinela nova (que entraria de novo) — bloco de Wilkins duplicado
// e desatualizado no laudo.
const RENDER_WILKINS = [
  /^Escore Ecocardiográfico de Wilkins/,
  /^•\s*(Mobilidade do folheto|Espessamento valvar|Espessamento subvalvar|Calcificação valvar)\s*\(/,
  /^TOTAL:\s*\d+\s*pontos\./,
];

function ehWilkinsRenderizado(linha: string): boolean {
  return RENDER_WILKINS.some((re) => re.test(linha || ''));
}

/**
 * Troca o bloco de Wilkins JÁ RENDERIZADO (como está no editor) pela
 * linha-sentinela do motor. Sem sentinela em `doMotor` (score apagado) o
 * bloco simplesmente some — é o motor que manda nele.
 */
export function colapsarWilkins(atuais: string[], doMotor: string[]): string[] {
  const sentinela = (doMotor || []).find((l) => typeof l === 'string' && l.startsWith('__WILKINS__'));
  const out: string[] = [];
  // No MÁXIMO uma sentinela por chamada: se o médico escreveu uma frase no
  // meio do bloco renderizado, o bloco vira dois pedaços — emitir uma
  // sentinela por pedaço duplicaria o escore de Wilkins no laudo.
  let emitida = false;
  for (const linha of atuais || []) {
    if (ehWilkinsRenderizado(linha)) {
      if (!emitida && sentinela) { out.push(sentinela); emitida = true; }
      continue;
    }
    out.push(linha);
  }
  return out;
}

// ── Merge ──────────────────────────────────────────────────────────

/**
 * Mescla a geração nova do motor com o que está no editor agora.
 *
 * @param prevGer  linhas da geração ANTERIOR do motor (o "estado conhecido")
 * @param novaGer  linhas que o motor acabou de gerar
 * @param atuais   linhas como estão no editor (inclui edições do médico)
 * @returns linhas finais pro editor
 */
export function mesclarLinhas(prevGer: string[], novaGer: string[], atuais: string[]): string[] {
  const prev = prevGer || [];
  const nova = novaGer || [];
  const atu = colapsarWilkins(atuais || [], prev.length ? prev : nova);

  // Fast path: médico não tocou em nada → a geração nova inteira.
  if (atu.length === prev.length && atu.every((l, k) => l === prev[k])) return [...nova];

  // Editor vazio com geração conhecida: NÃO é "o médico apagou tudo" — é o
  // editor que ainda não montou, ou um Ctrl+A/Del. Mesclar aqui devolveria
  // [] (todo slot pareceria deletado) e apagaria o laudo inteiro. Não há o
  // que preservar → a geração nova manda. (Critical 2 do review.)
  if (prev.length > 0 && atu.length === 0) return [...nova];

  // 1) O que o médico fez com cada slot do motor.
  const estado = new Map<number, { editada: boolean; texto: string }>();
  const manuais: Array<{ texto: string; ancora: number | null }> = [];
  let ancora: number | null = null;
  for (const [p, a] of alinhar(prev, atu)) {
    if (p !== null && a !== null) {
      estado.set(p, { editada: prev[p] !== atu[a], texto: atu[a] });
      ancora = p;
    } else if (a !== null) {
      manuais.push({ texto: atu[a], ancora });
    }
    // p sem contraparte → médico apagou o slot (fica fora do mapa)
  }

  // 2) Saída na ordem do motor.
  const out: string[] = [];
  const push = (t: string) => out.push(t);
  // Linha que o médico digitou e o motor PASSOU A GERAR sozinho sai uma vez
  // só, na posição do motor. É o único caso de duplicata que o merge cria —
  // dedup global (o que havia antes) engolia linha legitimamente repetida
  // do próprio motor (Important 4 do review).
  const doMotor = new Set(nova);
  const despejar = (chave: number | null) => {
    for (const man of manuais) if (man.ancora === chave && !doMotor.has(man.texto)) push(man.texto);
  };

  despejar(null); // manuais antes de qualquer linha do motor
  for (const [p, n] of alinhar(prev, nova)) {
    if (p !== null && n !== null) {
      const st = estado.get(p);
      if (!st) {
        // médico apagou: só volta se o motor mudou o conteúdo
        if (nova[n] !== prev[p]) push(nova[n]);
      } else if (!st.editada || nova[n] !== prev[p]) {
        push(nova[n]); // intocada, ou editada mas o motor tem conteúdo novo
      } else {
        push(st.texto); // editada e o motor repetiu o mesmo texto
      }
      despejar(p);
    } else if (n !== null) {
      push(nova[n]); // achado novo do motor
    } else {
      despejar(p); // slot sumiu do motor: linha some, manuais ancoradas ficam
    }
  }
  return out;
}
