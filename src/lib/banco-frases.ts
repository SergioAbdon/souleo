// ══════════════════════════════════════════════════════════════════
// SOULEO · Banco de frases — módulo PURO (F3-T7)
//
// Antes: CATS/FRASES_DEFAULT/loadBanco/saveBanco viviam DENTRO do motor
// legado (public/motor/motorv8mp4.js:1303-1346), com o modal em
// dangerouslySetInnerHTML e onclick globais. Aqui é o mesmo dado, o mesmo
// shape {id,cat,txt} e a MESMA chave de localStorage — o acervo que o médico
// já editou é lido sem migração nenhuma. CATS e as 34 frases abaixo foram
// COPIADAS DO MOTOR byte a byte (linhas 1303 e 1306-1339).
// ══════════════════════════════════════════════════════════════════

export type Frase = { id: number; cat: string; txt: string };

/** Chave histórica, sem namespace — NÃO mudar (é o acervo do médico). */
export const CHAVE_BANCO = 'medcardio_banco';

export const CATS=['Ritmo','Câmaras','Sistólica VE','Contratilidade','Diastólica','Ventrículo Direito','Válvulas','Pericárdio/Aorta','Outros'];

export const FRASES_DEFAULT: Frase[] = [
  {id:1,cat:'Ritmo',txt:'Ritmo cardíaco regular.'},
  {id:2,cat:'Ritmo',txt:'Ritmo cardíaco irregular.'},
  {id:3,cat:'Ritmo',txt:'Exame realizado em vigência de arritmia.'},
  {id:4,cat:'Câmaras',txt:'Câmaras cardíacas com dimensões normais.'},
  {id:5,cat:'Câmaras',txt:'Janela acústica limitada.'},
  {id:6,cat:'Câmaras',txt:'Exame realizado a beira do leito e sob ventilação mecânica.'},
  {id:7,cat:'Câmaras',txt:'Septo interventricular com movimento atípico.'},
  {id:8,cat:'Câmaras',txt:'Septo interventricular retificado.'},
  {id:9,cat:'Sistólica VE',txt:'Função sistólica do ventrículo esquerdo preservada.'},
  {id:10,cat:'Sistólica VE',txt:'Disfunção sistólica do ventrículo esquerdo em grau leve.'},
  {id:11,cat:'Sistólica VE',txt:'Disfunção sistólica do ventrículo esquerdo em grau moderado.'},
  {id:12,cat:'Sistólica VE',txt:'Disfunção sistólica do ventrículo esquerdo em grau importante.'},
  {id:13,cat:'Contratilidade',txt:'Contratilidade preservada nas demais paredes.'},
  {id:14,cat:'Contratilidade',txt:'Alteração contrátil por hipocinesia difusa do ventrículo esquerdo.'},
  {id:15,cat:'Diastólica',txt:'Índices diastólicos do ventrículo esquerdo preservados.'},
  {id:16,cat:'Diastólica',txt:'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento).'},
  {id:17,cat:'Diastólica',txt:'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal).'},
  {id:18,cat:'Diastólica',txt:'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo).'},
  {id:19,cat:'Diastólica',txt:'Função Diastólica do ventrículo esquerdo Indeterminada.'},
  {id:20,cat:'Ventrículo Direito',txt:'Função sistólica do ventrículo direito preservada.'},
  {id:21,cat:'Ventrículo Direito',txt:'Disfunção sistólica do ventrículo direito. TAPSE (VR ≥ 20 mm).'},
  {id:22,cat:'Válvulas',txt:'Válvulas atrioventriculares com a morfologia preservada.'},
  {id:23,cat:'Válvulas',txt:'Fluxo pelas válvulas atrioventriculares preservado.'},
  {id:24,cat:'Válvulas',txt:'Ausência de sinais indiretos de hipertensão pulmonar.'},
  {id:25,cat:'Válvulas',txt:'Válvulas semilunares com morfologia preservada.'},
  {id:26,cat:'Válvulas',txt:'Fluxo pelas válvulas semilunares preservado.'},
  {id:27,cat:'Pericárdio/Aorta',txt:'Pericárdio sem alterações.'},
  {id:28,cat:'Pericárdio/Aorta',txt:'Raiz aórtica, aorta ascendente e arco aórtico com dimensões normais.'},
  {id:29,cat:'Pericárdio/Aorta',txt:'Placas de ateroma calcificadas e não complicadas no arco aórtico.'},
  {id:30,cat:'Outros',txt:'Não visualizado trombos intracavitários.'},
  {id:31,cat:'Outros',txt:'Não visualizado imagem sugestiva de endocardite infecciosa.'},
  {id:32,cat:'Outros',txt:'Cabo de marcapasso presente em câmaras direitas.'},
  {id:33,cat:'Outros',txt:'Strain Global longitudinal do ventrículo esquerdo pelo "speckle tracking" de - %. VR ≥ -18%.'},
  {id:34,cat:'Outros',txt:'Exame realizado com paciente em decúbito dorsal.'},
];

const defaults = (): Frase[] => JSON.parse(JSON.stringify(FRASES_DEFAULT)) as Frase[];

/** Storage vazio/corrompido = defaults (mesmo comportamento do motor). */
export function loadBanco(): Frase[] {
  try {
    const s = localStorage.getItem(CHAVE_BANCO);
    return s ? (JSON.parse(s) as Frase[]) : defaults();
  } catch {
    return defaults();
  }
}

export function saveBanco(frases: Frase[]): void {
  try { localStorage.setItem(CHAVE_BANCO, JSON.stringify(frases)); } catch {}
}

/** Id novo = maior id + 1 (o legado usava Date.now(); ambos únicos). */
export function proximoId(frases: Frase[]): number {
  return frases.reduce((m, f) => (f.id > m ? f.id : m), 0) + 1;
}

/** Texto vazio não entra — o legado saía seco do adicionarFraseBanco(). */
export function adicionarFrase(frases: Frase[], cat: string, txt: string): Frase[] {
  const t = txt.trim();
  if (!t) return frases;
  return [...frases, { id: proximoId(frases), cat, txt: t }];
}

/** Texto vazio não sobrescreve (idem legado: `if(novo!==null&&novo.trim())`). */
export function editarFrase(frases: Frase[], id: number, txt: string): Frase[] {
  const t = txt.trim();
  if (!t) return frases;
  return frases.map((f) => (f.id === id ? { ...f, txt: t } : f));
}

export function apagarFrase(frases: Frase[], id: number): Frase[] {
  return frases.filter((f) => f.id !== id);
}

/** Filtro do modal: categoria ('Todos' = tudo) + busca em txt e cat. */
export function filtrarFrases(frases: Frase[], cat: string, busca: string): Frase[] {
  const b = busca.toLowerCase();
  return frases.filter((f) => {
    const catOk = cat === 'Todos' || f.cat === cat;
    const busOk = !b || f.txt.toLowerCase().includes(b) || f.cat.toLowerCase().includes(b);
    return catOk && busOk;
  });
}
