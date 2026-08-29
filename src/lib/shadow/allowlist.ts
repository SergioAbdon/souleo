// ══════════════════════════════════════════════════════════════════
// LEO Senna93 F4 · Allowlist EXECUTÁVEL das divergências esperadas
// ══════════════════════════════════════════════════════════════════
// Fonte da verdade: docs/planos/2026-08-27-senna93-divergencias-esperadas.md
// Cada `ref` aqui é o par "{Task} {Domínio}" LITERAL de uma linha daquele
// markdown — tests/unit/shadow-allowlist.test.mjs quebra se um dos lados
// andar sem o outro (linha nova sem matcher, ou matcher fantasma).
//
// CALIBRAÇÃO: todo regex foi lido dos DOIS motores, não de memória.
//   • lado NOVO   — src/senna90/{achados,conclusoes,calculos,classificacoes}
//   • lado VELHO  — public/motor/motorv8mp4.js (e, na tabela, o simulador
//                   da T1 em src/lib/shadow/legado-tabela.ts)
// A citação fonte:linha de cada string está no comentário de cada matcher.
//
// PAREAMENTO: compararFrases compara CONJUNTOS normalizados, logo uma
// mudança de redação vira DUAS divergências de um lado só ("velho sem
// par" + "novo sem par"). Por isso os matchers casam a FAMÍLIA da frase
// (velho E novo), nunca só o texto novo.
// ══════════════════════════════════════════════════════════════════

export interface MatcherFrase {
  ref: string;
  casa(velho: string, novo: string): boolean;
}

/** Matcher = "alguma destas regex bate em algum dos dois lados". */
function fam(ref: string, ...res: RegExp[]): MatcherFrase {
  return { ref, casa: (velho, novo) => res.some((r) => r.test(velho) || r.test(novo)) };
}

// ── ORDEM IMPORTA: o comparador usa o PRIMEIRO matcher que casar ──
export const FRASES_ESPERADAS: MatcherFrase[] = [
  // Rodapé unificado (B20) — só aparece se o texto comparado carregar o rodapé.
  // src/senna90/classificacoes/fontes.ts (rodapeFontes) × redações antigas.
  fam('F3-T3 Rodapé/fontes',
    /Valores de referência:/,
    /Lang 2015|ASE\/EACVI|Goldstein/),

  // Wilkins: literal "(escore < 8)" (novo, achados/wilkins.ts:91) × "(escore ≤ 8)"
  // (motorv8mp4.js:833) + o "TOTAL 0 pts" fantasma do componente 0 (:1137).
  fam('F1-T9 Wilkins',
    /[Ee]score de Wilkins/,
    /valvuloplastia mitral percutânea/),

  // GLS VE: 3 faixas ASE 2025 (achados/strain.ts:24-26 · conclusoes/index.ts:190-193)
  // × binário do legado (motorv8mp4.js:845-846, "(VR ≥ -18%)").
  fam('F1-T3 Strain',
    /Strain global longitudinal do ventrículo esquerdo/,
    /Função sistólica global do ventrículo esquerdo preservada, .*strain longitudinal/,
    /Disfunção sistólica do ventrículo esquerdo, com strain longitudinal/,
    /Função sistólica preservada com strain longitudinal reduzido/),

  // TAPSE: "(VR > 17 mm)" (achados/sistolicaVD.ts:18,27) × "(VR ≥ 20 mm)"
  // (motorv8mp4.js:422,428).
  fam('F1-T4 VD',
    /TAPSE=.*\(VR [≥>] (20|17) mm\)/),

  // Raiz aneurismática passa a imprimir a medida (achados/aorta.ts:54) +
  // frases de sugestão REMOVIDAS (V13). As de sugestão não existem em NENHUM
  // dos dois motores hoje (o legado nunca as teve) — ficam como rede para
  // texto de laudo antigo/manual que as carregue. Ver relatório da T2.
  fam('F3-fix Aorta',
    /Dilatação aneurismática da Raiz aórtica medindo/,
    /[Ss]ugere-se|angiotomografia|angiorressonância|avaliação cirúrgica especializada/),

  // "Ectasia" (motorv8mp4.js:484,491-493,1014,1020) → "Dilatação/Aneurisma"
  // (achados/aorta.ts:54-70 · conclusoes/index.ts:153-174) + índice cm²/m e
  // "com critérios de maior gravidade" na faixa 45-49 (I1 da revisão T1).
  fam('F1-T2 Aorta',
    /Ectasia/,
    /Dilatação (aneurismática )?d[ao] (Raiz aórtica|aorta ascendente|arco aórtico)/,
    /Aneurisma d[ao] (Raiz aórtica|aorta ascendente)/,
    /com critérios de maior gravidade/,
    /cm²\/m \(valores acima de 10/),

  // Réguas novas (WASE ♀≥66 37→38 · aneurisma ≥45 · arco ≤40 sem graus):
  // um segmento entra/sai do normal e a frase combinada muda
  // (achados/aorta.ts:75,81-90,172-174 × motorv8mp4.js j37).
  fam('F1-T1 Aorta',
    // /i: frase pode abrir a sentença com "Aorta ascendente"/"Arco aórtico"
    // maiúsculos (aorta.ts:88-89,174) — só "Raiz aórtica" tinha capital antes.
    /(Raiz aórtica|aorta ascendente|arco aórtico).{0,60}com dimensões normais/i,
    /Arco aórtico dilatado, medindo/),

  // LAVI 48: legado ≥48 = importante (motorv8mp4.js:173-175); Lang 2015 põe
  // grave só em >48 → 48 vira moderado (achados/camaras.ts:46-48).
  fam('F1-T5 Câmaras',
    /Átrio esquerdo aumentado em grau (leve|moderado|importante)\. Volume index de/),

  // j22 sinusal parou de imprimir campo vazio ("Relação E/A= ;"):
  // achados/diastologia.ts:74-79 (só o preenchido) × motorv8mp4.js:408 (todos).
  fam('F1-T6 Diastólica',
    /Velocidade da Onda E=/,
    /Relação E\/A=/,
    /Relação E\/e'=/,
    /Velocidade e' septal=/,
    /volume index do átrio esquerdo/i),

  // Entrada do algoritmo diastólico mudou (calculos/diastologia.ts:86-92):
  // FE-baixa 50→52/54 por sexo (A12) e massa alta 102/88→115/95 (B12) trocam
  // o RAMO da classificação. Direcional de propósito — o SUMIÇO dessas
  // frases não é esperado (mascararia bug real); só a APARIÇÃO pelo flip
  // de ramo A12/B12 (achado no retroativo real 28/08, exames era-senna90).
  {
    ref: 'F1-T6 Diastólica',
    casa: (velho, novo) =>
      velho === '' &&
      /Função diastólica do ventrículo esquerdo Indeterminada|Índices diastólicos do ventrículo esquerdo preservados/i.test(novo),
  },

  // Estenose mitral pela diretriz (27/08): área 1,5-2,0 vira LEVE direto
  // (calculos/valvas.ts:46) — o legado nessa faixa segue o gradiente primeiro
  // (motorv8mp4.js:101-111). Frase: conclusoes/index.ts:119.
  fam('F3-fix Valvas',
    /Estenose Mitral Leve\./),

  // Resto da T7: mitral área primária, aórtica pior-grau (mata o low-flow
  // "leve"), esclerose ganha achado (achados/valvas.ts:204 — o legado
  // calculava e jogava fora, motorv8mp4.js:118) e tricúspide sempre imprime
  // o gradiente (achados/valvas.ts:144, B18).
  fam('F1-T7 Valvas',
    /Estenose Mitral (Moderada|Importante)\./,
    /Estenose Aórtica (Leve|Moderada|Importante)\./,
    /Esclerose valvar aórtica/,
    /Gradiente transvalvar tricúspide médio/),

  // Massa/geometria/sistólica: massa +0,6 g (B24), HVE 102/88 → 115/95
  // (achados/massa.ts:56 × motorv8mp4.js j10 lim=102/88), "apesar da alteração
  // contrátil segmentar" só com parede alterada (B5), conclusão segmentar
  // isolada (B7) e as bandas de FE Teichholz (A13).
  fam('F1-T10 Massa/sistólica',
    /Massa do ventrículo esquerdo/,
    /Hipertrofia (concêntrica|excêntrica) do ventrículo esquerdo/,
    /Remodelamento concêntrico do ventrículo esquerdo/,
    /Índice de massa/,
    /apesar da alteração contrátil segmentar/,
    /Alteração contrátil segmentar do ventrículo esquerdo/,
    /Disfunção sistólica (do ventrículo esquerdo|biventricular)\./,
    /Miocardiopatia Dilatada/),

  // Paredes: DD imprimia hipocinesia (motorv8mp4.js:342 j20) → discinesia
  // (achados/paredes.ts:92), "septalanterior/septalinferior" ganham espaço
  // (motorv8mp4.js:337-338 × paredes.ts:62,67), acentos ("contratil") e a
  // morfologia AV que agora decide por morfologia, não por refluxo
  // (achados/valvas.ts:16-18 × motorv8mp4.js j24).
  fam('F1-T8 Paredes/valvas',
    /Alteração contr[aá]til por (hipo|a|dis)cinesia/,
    /Contratilidade preservada nas demais paredes/,
    /(Válvulas atrioventriculares com a|Válvula mitral com) morfologia preservada/),

  // ══ Onda "Diastologia conforme ASE/EACVI 2016" (28/08) ═════════════
  // Regra permanente do Sergio: "os resultados seguem os guidelines".
  // Plano: docs/planos/2026-08-28-diastologia-guideline-ase2016.md ·
  // anexo normativo: docs/planos/2026-08-28-auditoria-diastologia-ase2016.md.
  // Como o pareamento é por CONJUNTO, cada flip de classificação vira DUAS
  // divergências de um lado só — por isso cada matcher declara a DIREÇÃO
  // que aquele lado pode assumir, e nenhum casa "qualquer frase diastólica".
  // Todos case-SENSITIVE: a redação minúscula do modo manual do médico
  // (achados/diastologia.ts DIAST_SENTENCAS) não é flip do motor.

  // F6-T1 · sumiço da frase de GRAU. Achado calculos/diastologia.ts:147,150,
  // 180-181,226,233,236 · conclusão achados/diastologia.ts:117-119. Porta
  // única do sumiço na onda inteira (T1 troca o ramo; T2b/T3 trocam o grau
  // por outra classe). A APARIÇÃO de grau é a F6-T2, direção oposta.
  {
    ref: 'F6-T1 Diastológica',
    casa: (velho, novo) =>
      novo === '' &&
      (/Disfunção Diastólica do ventrículo esquerdo de Grau (III|II|I) \(/.test(velho) ||
       /Disfunção diastólica de grau (III|II|I) do ventrículo esquerdo \(/.test(velho)),
  },

  // F6-T1 · concLARS (conclusoes/index.ts:209-220) só fala do strain atrial
  // com a diastologia normal/silenciosa: volta a sair quando o exame deixa de
  // ter grau falso (T1) e silencia quando o empate vira Indeterminada (T2).
  // Bidirecional de propósito — a frase depende da classe diastológica, que
  // esta onda mudou nos dois sentidos.
  fam('F6-T1 Diastológica', /Strain atrial esquerdo (preservado|reduzido)/),

  // F6-T2 · maioria dos AVALIADOS (calculos/diastologia.ts:216-218): o que
  // SAI de cena — preservados no empate (n=2,c=1) e Indeterminada quando a
  // maioria passa a graduar (n=2,c=2 · n=3,c=2).
  // Estreitado pelo F1 (29/08): com c=2 puxado pelo e' septal, a zona média do
  // ramo A recai em Indeterminada (Fig. 8 empatada) e NÃO flipa — o sumiço da
  // Indeterminada sobra para os casos em que os 2 positivos são critérios de
  // pressão, e para as regras diretas de E/A (grau III / grau I).
  {
    ref: 'F6-T2 Diastológica',
    casa: (velho, novo) =>
      novo === '' &&
      (/Índices diastólicos do ventrículo esquerdo preservados/.test(velho) ||
       /Função [Dd]iastólica do ventrículo esquerdo Indeterminada/.test(velho)),
  },

  // F6-T2 · e o que ENTRA: a frase de grau que a maioria passou a emitir.
  {
    ref: 'F6-T2 Diastológica',
    casa: (velho, novo) =>
      velho === '' &&
      (/Disfunção Diastólica do ventrículo esquerdo de Grau (III|II|I) \(/.test(novo) ||
       /Disfunção diastólica de grau (III|II|I) do ventrículo esquerdo \(/.test(novo)),
  },

  // F6-T2b · FRASE NOVA (SEM_GRADUACAO, calculos/diastologia.ts:22 +
  // achados/diastologia.ts:115): graduação exige fluxo mitral (anexo §8.2).
  // Direcional — o sumiço de uma frase que o motor antigo nunca escreveu
  // seria bug, e segue alarmando.
  {
    ref: 'F6-T2b Diastológica',
    casa: (velho, novo) => velho === '' && /de grau não determinado/.test(novo),
  },

  // F6-T3 · empate da FA (calculos/diastologia.ts:290): 2/4 e 1/2 deixam de
  // ser "elevada"/"normal". O ACHADO da FA é o mesmo texto nas 4 sentinelas
  // (achados/diastologia.ts:62) — só a conclusão (j43:107-109) flipa.
  {
    ref: 'F6-T3 Diastológica',
    casa: (velho, novo) =>
      (velho === '' && /Pressão de enchimento indeterminada/.test(novo)) ||
      (novo === '' && /Parâmetros sugestivos de pressão de enchimento (elevada|normal)/.test(velho)),
  },
];

/**
 * Pares de VR (coluna 3/7) legado → senna93 na zona comum das 10 linhas.
 * Lado senna93 conferido em classificacoes/refValues.ts:26-47 (+ tetoRaiz,
 * isOOR.ts:30); lado legado no simulador da T1 (legado-tabela.ts:43-52,
 * porte verbatim de motorv8mp4.js:1075 e :1196-1215).
 */
export const PARES_VR: { campo: string; legado: string; senna93: string; ref: string }[] = [
  { campo: 'feT',   legado: '>51%',      senna93: '≥ 52%',      ref: 'F3-T5 Tabela · referências' },
  { campo: 'feT',   legado: '>53%',      senna93: '≥ 54%',      ref: 'F3-T5 Tabela · referências' },
  { campo: 'massa', legado: '<201 g',    senna93: '≤ 200 g',    ref: 'F3-T5 Tabela · referências' },
  { campo: 'massa', legado: '<151 g',    senna93: '≤ 150 g',    ref: 'F3-T5 Tabela · referências' },
  { campo: 'imVE',  legado: '<103 g/m²', senna93: '≤ 115 g/m²', ref: 'F3-T5 Tabela · referências' },
  { campo: 'imVE',  legado: '<89 g/m²',  senna93: '≤ 95 g/m²',  ref: 'F3-T5 Tabela · referências' },
  // Único corte de VR que a F1 mexeu na zona comum: raiz ♀ ≥66a (WASE 2022).
  { campo: 'b7',    legado: '≤ 37 mm',   senna93: '≤ 38 mm',    ref: 'F1-T1 Aorta' },
];

/**
 * As 3 VRs que o legado imprimia SEM sexo (legado-tabela.ts:83,88,91 —
 * literais, fora do `sexo ? … : ''`). Com sexo vazio o Senna93 zera todas
 * (C8, refValues.ts:56) e só estas 3 divergem.
 */
export const VR_INCONDICIONAL_LEGADO = ['<25 kg/m²', '30–40%', '<0,43'];

/**
 * Tolerância por célula de VALOR (colunas 1 e 5), chave `${linha},${col}`.
 * Diferença numérica ≤ tol → esperada (truncamento/vírgula/B24/DuBois).
 * O ,01 a mais absorve o próprio arredondamento de ponto flutuante.
 */
export const TOL_CELULA: Record<string, number> = {
  // coluna 1 — peso/altura (1 casa em ambos os lados; 0,11 só absorve arredonda-vs-trunca)
  '1,1': 0.11, '2,1': 0.11,
  // linhas 3..9 (mm): legado imprime 1 casa (toFixed, ex. 34.5), Senna93
  // trunca pra 0 casas (34) — Δ pode chegar a quase 1 (B25/F3-T5 Tabela · casas).
  '3,1': 0.91, '4,1': 0.91, '5,1': 0.91,
  '6,1': 0.91, '7,1': 0.91, '8,1': 0.91, '9,1': 0.91,
  // coluna 5 — derivados
  '0,5': 0.11,   // imc
  '1,5': 0.011,  // aoae (2 casas)
  '2,5': 0.11,   // vdf
  '3,5': 0.11,   // vsf
  '4,5': 1.01,   // feT (pontos percentuais — truncamento, B25/FE-FS)
  '5,5': 1.01,   // fs  (idem)
  '6,5': 0.71,   // massa (+0,6 g da B24 + truncamento)
  '7,5': 0.61,   // imVE (massa nova ÷ ASC nova)
  '8,5': 0.011,  // er (2 casas)
  '9,5': 0.011,  // asc (DuBois 71,74 → 71,84)
};

/**
 * Linhas do markdown que NÃO são frase de laudo nem célula da zona
 * comparada — comportamento de tela, de arquivo ou de fluxo. Ficam
 * declaradas aqui para o tripwire de cobertura não passar em branco.
 */
export const LINHAS_MD_NAO_COMPARAVEIS: string[] = [
  // realce/oor não é comparado — o simulador da T1 não porta o oor do
  // legado (deslocado 3 linhas, morre na F5)
  'F3-T5 Tabela · realce',
  'F3-T3 Tabela (visual)',        // realce vermelho (CSS)
  'F3-fix Tabela (visual)',       // realce escopado ao caminho novo
  'F3-T3fix Rodapé',              // 5ª saída (Word) usando rodapeFontes()
  'F3-T5 Caixas da sidebar',      // #calc-*, fora da tabela
  'F3-T5 Caixa Wilkins',          // #calc-wilkins limpa quando o escore sai
  'F3-T5 Identificação',          // #out-*, fora da tabela
  'F3-T5 Word (.docx)',           // formato do arquivo exportado
  'F3-T5 Alertas',                // #alerta-psap × lista estruturada
  'F3-T5 Proveniência',           // campo motorNumeros no exame emitido
  'F3-T6 Emissão · tabela velha', // bloqueio de emissão
  'F3-T6 Campo PSMAP',            // revelação do campo na tela
  'F3-T5 Janela de carga',        // tabela vazia até a 1ª volta da ponte
];
