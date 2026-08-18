// ══════════════════════════════════════════════════════════════════
// LEO · Testar conexão de integração (Sub-plano 5, Task 3) — Admin SDK.
// workspaces/{wsId}/privado/{tipo} tem `allow read, write: if false`: SÓ
// este caminho (via /api/integracoes) alcança o segredo. Nada que sai
// daqui — resposta HTTP ou doc gravado em integracoes/{tipo} — pode
// carregar a credencial: toda mensagem passa por sanitizar() antes.
// Auth (Bearer→uid) e papel (so dono) são responsabilidade da ROTA —
// aqui dentro já se assume dono autorizado, igual ao padrão
// exame-admin.ts/feegow-admin.ts.
// Sem imports relativos/@ (testado direto por node --test).
// ══════════════════════════════════════════════════════════════════
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

// Duplicado de src/lib/integracoes.ts de proposito: aquele arquivo não pode
// ganhar import local (é consumido pela tela E teria que resolver esta
// importação também), então o literal vive duplicado aqui.
export type TipoIntegracao = 'feegow' | 'orthanc' | 'wader';
const TIPOS: TipoIntegracao[] = ['feegow', 'orthanc', 'wader'];

const TIMEOUT_MS = 10_000;
const FEEGOW_BASE = 'https://api.feegow.com/v1/api';

/** Tira a credencial de qualquer texto que vá para o banco ou para a tela. */
export function sanitizar(msg: string, segredos: (string | undefined)[]): string {
  let out = msg;
  for (const s of segredos) if (s && s.length >= 6) out = out.split(s).join('***');
  return out.slice(0, 300);
}

type ConexaoFeegow = { token?: string };
type ConexaoOrthanc = { url?: string; usuario?: string; senha?: string };

export async function testarFeegow(conn: ConexaoFeegow, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!conn.token) throw new Error('Token do Feegow ausente.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${FEEGOW_BASE}/professional/list`, {
      headers: { 'x-access-token': conn.token, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Feegow ${res.status}: ${await res.text()}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function testarOrthanc(conn: ConexaoOrthanc, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!conn.url) throw new Error('Endereço do Orthanc ausente.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (conn.senha) headers.Authorization = `Basic ${Buffer.from(`${conn.usuario ?? ''}:${conn.senha}`).toString('base64')}`;
    const res = await fetchImpl(`${conn.url.replace(/\/+$/, '')}/system`, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`Orthanc ${res.status}: ${await res.text()}`);
  } finally {
    clearTimeout(timeout);
  }
}

export type ResultadoTeste = { httpStatus: number; ok: boolean; status?: 'ok' | 'erro'; mensagem: string };

/**
 * Contrato de segurança pontos 3-6 (auth/papel já resolvidos pela rota):
 * 3. lê o segredo de privado/{tipo} — ou usa credencialBody sem gravar nada;
 * 4. bate no alvo (feegow/orthanc) com timeout de 10s;
 * 5. grava status/ultimoTeste/ultimoErro em integracoes/{tipo};
 * 6. sanitiza a mensagem antes de gravar E antes de responder.
 */
export async function executarTeste(dbAdmin: Firestore, args: {
  wsId: string; tipo: string; credencialBody?: Record<string, unknown>; fetchImpl?: typeof fetch;
}): Promise<ResultadoTeste> {
  const { wsId, tipo, credencialBody, fetchImpl = fetch } = args;

  if (!TIPOS.includes(tipo as TipoIntegracao)) {
    return { httpStatus: 400, ok: false, mensagem: 'Tipo de integração inválido.' };
  }
  if (tipo === 'wader') {
    return { httpStatus: 400, ok: false, mensagem: 'Wader não tem teste de conexão — ele avisa sozinho por batimento.' };
  }

  let conn: Record<string, unknown>;
  if (credencialBody) {
    // "Testar antes de salvar": usa só o que veio no corpo, NADA é gravado em privado/{tipo}.
    conn = credencialBody;
  } else {
    const [pubSnap, privSnap] = await Promise.all([
      dbAdmin.doc(`workspaces/${wsId}/integracoes/${tipo}`).get(),
      dbAdmin.doc(`workspaces/${wsId}/privado/${tipo}`).get(),
    ]);
    if (!privSnap.exists) {
      return { httpStatus: 400, ok: false, mensagem: `Nenhuma credencial cadastrada para ${tipo}. Cadastre antes de testar.` };
    }
    conn = { ...(pubSnap.data() ?? {}), ...(privSnap.data() ?? {}) };
  }

  // Qualquer valor-texto da conexao pode ser o segredo (token/senha/usuario) —
  // sanitizar tira TODOS antes de a mensagem sair daqui.
  const segredos = Object.values(conn).filter((v): v is string => typeof v === 'string');

  let status: 'ok' | 'erro';
  let mensagem: string;
  try {
    if (tipo === 'feegow') await testarFeegow(conn as ConexaoFeegow, fetchImpl);
    else await testarOrthanc(conn as ConexaoOrthanc, fetchImpl);
    status = 'ok';
    mensagem = 'Conexão OK.';
  } catch (e) {
    status = 'erro';
    const bruta = e instanceof Error ? e.message : 'Erro desconhecido ao testar conexão.';
    mensagem = sanitizar(bruta, segredos);
  }

  await dbAdmin.doc(`workspaces/${wsId}/integracoes/${tipo}`).set({
    status,
    ultimoTeste: FieldValue.serverTimestamp(),
    ultimoErro: status === 'erro' ? mensagem : null,
  }, { merge: true });

  return { httpStatus: 200, ok: status === 'ok', status, mensagem };
}
