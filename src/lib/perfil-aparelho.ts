// ══════════════════════════════════════════════════════════════════
// LEO · Perfil do aparelho (S4-T13) — mapa medida-do-aparelho -> campo do
// laudo, editavel no cartao Integracoes (decisao Sergio: transparencia
// total, ver tudo que o Vivid manda e mapear com clique).
//
// Doc: workspaces/{ws}/integracoes/perfilAparelho { nome, mapeamentos,
// atualizadoEm, atualizadoPor }. SEM segredo -> ao contrario de feegow/
// orthanc (write:false, so Admin SDK), o cliente escreve direto (regra
// em firestore.rules, gate dono).
//
// Import relativo COM extensao .ts (tsconfig allowImportingTsExtensions):
// reusa MapaSr/SR_TO_MOTOR de dicom-sr-mapping sem quebrar `node --test`
// (que so resolve extensao explicita, nunca alias '@/').
// ══════════════════════════════════════════════════════════════════
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { SR_TO_MOTOR, type MapaSr } from './dicom-sr-mapping.ts';

export type { MapaSr };
export { SR_TO_MOTOR };

const ALVOS_VALIDOS = new Set(['mm', 'cm/s', '']);

function entradaValida(v: unknown): v is MapaSr[string] {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.campo === 'string' && e.campo.trim() !== ''
    && typeof e.nomePt === 'string' && e.nomePt.trim() !== ''
    && typeof e.casas === 'number' && Number.isFinite(e.casas)
    && typeof e.alvo === 'string' && ALVOS_VALIDOS.has(e.alvo);
}

/**
 * Valida o campo `mapeamentos` bruto do doc. Semantica (decisao S4-T13):
 * um doc com pelo menos 1 entrada valida e a VERDADE INTEIRA — nao mistura
 * com o default embutido (o editor semeia com SR_TO_MOTOR na 1a edicao,
 * entao um mapa "menor que o default" so existe se o dono apagou linhas de
 * proposito). So cai no fallback quando nao sobra NENHUMA entrada valida
 * (doc ausente, `mapeamentos` ausente/vazio/nao-objeto, ou so lixo).
 * Entradas individuais malformadas dentro de um doc por outro lado valido
 * sao descartadas silenciosamente (defensivo, nao derruba o resto).
 */
export function validarMapeamentos(mapeamentos: unknown): MapaSr | null {
  if (!mapeamentos || typeof mapeamentos !== 'object' || Array.isArray(mapeamentos)) return null;
  const out: MapaSr = {};
  for (const [chave, entrada] of Object.entries(mapeamentos as Record<string, unknown>)) {
    if (entradaValida(entrada)) out[chave] = entrada;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Le `workspaces/{wsId}/integracoes/perfilAparelho`. Doc ausente, vazio ou
 * malformado -> SR_TO_MOTOR embutido (licao do projeto: config ausente
 * NUNCA desliga comportamento — mesmo criterio do Sub-plano 5).
 */
export async function carregarPerfilAparelho(db: Firestore, wsId: string): Promise<MapaSr> {
  const snap = await getDoc(doc(db, 'workspaces', wsId, 'integracoes', 'perfilAparelho'));
  if (!snap.exists()) return SR_TO_MOTOR;
  return validarMapeamentos(snap.data()?.mapeamentos) ?? SR_TO_MOTOR;
}
