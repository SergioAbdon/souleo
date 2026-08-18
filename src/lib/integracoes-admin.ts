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
// user/pass é o nome canônico em todo o sistema (spec §3.2, workspace-repo.ts,
// api/orthanc/route.ts) — não aceitar apelido nenhum aqui.
type ConexaoOrthanc = { url?: string; user?: string; pass?: string };

export async function testarFeegow(conn: ConexaoFeegow, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!conn.token) throw new Error('Token do Feegow ausente.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${FEEGOW_BASE}/professional/list`, {
      headers: { 'x-access-token': conn.token, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    // Nunca embutir o corpo da resposta do alvo na mensagem: pode ecoar a
    // própria credencial tentada (sanitizar() é cinto-e-suspensório, não a
    // única defesa — ver Sub-plano 5 Task 3, achado Important 1).
    if (!res.ok) throw new Error(`Feegow ${res.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function testarOrthanc(conn: ConexaoOrthanc, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!conn.url) throw new Error('Endereço do Orthanc ausente.');
  // Minor 5 (Sub-plano 5, Task 7 revisao): mesma checagem de esquema que
  // resolverConfigOrthanc ja aplica (SSRF) — "testar antes de salvar" nao
  // passava por ali, entao os dois caminhos discordavam sobre a mesma regra.
  // O guard tem que valer ONDE a URL e usada, sempre.
  if (!/^https?:\/\//i.test(conn.url)) throw new Error('Endereço do Orthanc precisa começar com http:// ou https://.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (conn.pass) headers.Authorization = `Basic ${Buffer.from(`${conn.user ?? ''}:${conn.pass}`).toString('base64')}`;
    const res = await fetchImpl(`${conn.url.replace(/\/+$/, '')}/system`, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`Orthanc ${res.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

// ══════════════════════════════════════════════════════════════════
// Sub-plano 5, Task 7 — resolverConfigOrthanc: fonte UNICA de config pros
// dois consumidores server-side de api/orthanc/route.ts (GET e POST
// criar_mwl, que antes tinham cada um sua propria copia da leitura —
// furo 2 do brief inteiro so fechava se os dois usassem esta funcao).
// So http/https (SSRF — endereco vem do dono via /api/integracoes, nunca
// mais do cliente: aceitar x-orthanc-url arbitrario era o resto do furo 2).
// ══════════════════════════════════════════════════════════════════
export type OrtancConfig = { url: string; user?: string; pass?: string };

export async function resolverConfigOrthanc(db: Firestore, wsId: string | null): Promise<OrtancConfig | null> {
  if (!wsId) return null;
  const integSnap = await db.doc(`workspaces/${wsId}/integracoes/orthanc`).get();
  const integData = integSnap.data();
  if (!integData?.ativo || !integData?.url) return null;
  const url = (integData.url as string).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) return null; // SSRF: esquema tem que ser http/https
  const privSnap = await db.doc(`workspaces/${wsId}/privado/orthanc`).get();
  const priv = privSnap.data() ?? {};
  return {
    url,
    user: (priv.user as string) || undefined,
    pass: (priv.pass as string) || undefined,
  };
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

  // Documento público (endereço/flags) nunca carrega segredo — pode ser lido
  // em qualquer um dos dois ramos abaixo sem tocar na gaveta.
  const docPublico = (await dbAdmin.doc(`workspaces/${wsId}/integracoes/${tipo}`).get()).data() ?? {};

  let conn: Record<string, unknown>;
  let fonteSegredo: Record<string, unknown>;
  let gravar: boolean;
  if (credencialBody) {
    // "Testar antes de salvar": combina com o que já está público (ex.: só a
    // senha veio, o endereço já está salvo) — NADA é gravado em privado/{tipo}
    // nem em integracoes/{tipo}: o resultado só volta na resposta HTTP.
    conn = { ...docPublico, ...credencialBody };
    fonteSegredo = credencialBody;
    gravar = false;
  } else {
    const privSnap = await dbAdmin.doc(`workspaces/${wsId}/privado/${tipo}`).get();
    if (!privSnap.exists) {
      return { httpStatus: 400, ok: false, mensagem: `Nenhuma credencial cadastrada para ${tipo}. Cadastre antes de testar.` };
    }
    fonteSegredo = privSnap.data() ?? {};
    conn = { ...docPublico, ...fonteSegredo };
    gravar = true;
  }

  // Qualquer valor-texto da FONTE DO SEGREDO pode ser o segredo (token/senha/usuario) —
  // sanitizar tira TODOS antes de a mensagem sair daqui. Varrer `conn` inteiro seria
  // pior que inutil: ele carrega o `ultimoErro` da tentativa anterior, entao a segunda
  // falha identica seguida se auto-mascararia ("Erro: ***") e apagaria o diagnostico.
  const segredos = Object.values(fonteSegredo).filter((v): v is string => typeof v === 'string');

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

  // Só grava quando a credencial testada é a que está de fato salva (gaveta).
  // Testar com credencial do corpo não pode fazer o cartão mentir sobre um
  // segredo que nunca foi persistido (spec §5.2 "estado sem mentira").
  if (gravar) {
    await dbAdmin.doc(`workspaces/${wsId}/integracoes/${tipo}`).set({
      status,
      ultimoTeste: FieldValue.serverTimestamp(),
      ultimoErro: status === 'erro' ? mensagem : null,
    }, { merge: true });
  }

  return { httpStatus: 200, ok: status === 'ok', status, mensagem };
}

// ══════════════════════════════════════════════════════════════════
// Gravar (Sub-plano 5, Task 4) — salvarIntegracao / removerCredencial.
// Só feegow/orthanc têm formulário (wader só recebe batimento do proprio
// programa). Config publico (procMap/url/ativo) e credencial (token ou
// user/pass) são tratados por campo, com whitelist por tipo — nenhum
// campo fora dela cruza pra o doc publico ou pra gaveta.
// ══════════════════════════════════════════════════════════════════
type TipoComForm = 'feegow' | 'orthanc';
const TIPOS_COM_FORM: TipoComForm[] = ['feegow', 'orthanc'];

const CAMPOS_CONFIG: Record<TipoComForm, string[]> = {
  feegow: ['procMap'],
  orthanc: ['url', 'ativo'],
};
const CAMPOS_CREDENCIAL: Record<TipoComForm, string[]> = {
  feegow: ['token'],
  orthanc: ['user', 'pass'],
};
const TODOS_CAMPOS_CREDENCIAL = new Set(Object.values(CAMPOS_CREDENCIAL).flat());

// Whitelist de config: só os campos do tipo, com o formato esperado —
// qualquer coisa fora disso (inclusive um token/pass que tentasse entrar
// por aqui) é ignorada antes de chegar perto do doc publico.
function limparConfig(tipo: TipoComForm, config: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) return out;
  const c = config as Record<string, unknown>;
  for (const campo of CAMPOS_CONFIG[tipo]) {
    const v = c[campo];
    if (v === undefined) continue;
    if (campo === 'procMap' && v && typeof v === 'object' && !Array.isArray(v)) {
      const mapa: Record<string, string> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string') mapa[k] = val;
      }
      out.procMap = mapa;
    } else if (campo === 'ativo' && typeof v === 'boolean') {
      out.ativo = v;
    } else if (campo === 'url' && typeof v === 'string') {
      // String vazia = "nao mexe" (mesma regra da credencial em limparCredencial)
      // — quem desliga o Orthanc e o toggle `ativo`, nao o endereco em branco.
      const url = v.trim();
      if (url !== '') out.url = url;
    }
  }
  return out;
}

/**
 * Defesa #7c (write-only): campo ausente, `null` ou string vazia = NÃO MEXE
 * no segredo já gravado. Filtra por campo — se só a senha veio, só a senha
 * troca; o usuário existente na gaveta continua intacto. Devolve `null`
 * quando não sobrou nenhum campo pra gravar (não toca a gaveta nem o
 * carimbo de data).
 */
function limparCredencial(tipo: TipoComForm, credencial: unknown): Record<string, string> | null {
  if (credencial === null || credencial === undefined) return null;
  if (typeof credencial !== 'object' || Array.isArray(credencial)) return null;
  const c = credencial as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const campo of CAMPOS_CREDENCIAL[tipo]) {
    const v = c[campo];
    if (typeof v === 'string' && v.trim() !== '') out[campo] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function paraMs(v: unknown): unknown {
  const t = v as { toMillis?: () => number } | undefined;
  return t && typeof t === 'object' && typeof t.toMillis === 'function' ? t.toMillis() : v;
}

// Le o doc publico pos-escrita e monta a resposta: converte Timestamp -> ms
// e varre (defesa em profundidade) qualquer chave de credencial que por
// engano tenha ido parar ali — o doc publico nao deveria ter nenhuma, mas
// a resposta nunca confia nisso sozinha.
async function respostaIntegracao(dbAdmin: Firestore, wsId: string, tipo: TipoComForm): Promise<Record<string, unknown>> {
  const snap = await dbAdmin.doc(`workspaces/${wsId}/integracoes/${tipo}`).get();
  const raw = snap.data() ?? {};
  const limpo: Record<string, unknown> = { tipo };
  for (const [k, v] of Object.entries(raw)) {
    if (TODOS_CAMPOS_CREDENCIAL.has(k)) continue;
    limpo[k] = paraMs(v);
  }
  if (!('credencialCadastradaEm' in limpo)) limpo.credencialCadastradaEm = null;
  return limpo;
}

export type ResultadoGravar = { httpStatus: number; ok: boolean; mensagem: string; integracao?: Record<string, unknown> };

/**
 * Grava config publico + (se veio) credencial na gaveta — no MESMO
 * writeBatch. Para o Orthanc, `config.ativo` também espelha em
 * `workspaces/{wsId}.ortancAtivo` (SidebarLaudo.tsx:187 lê esse campo pra
 * mostrar "Importar DICOM" a qualquer médico — a entidade nova só o dono lê,
 * então o campo tem de continuar existindo, e ligado/desligado junto).
 */
export async function salvarIntegracao(dbAdmin: Firestore, args: {
  wsId: string; tipo: string; config?: unknown; credencial?: unknown;
}): Promise<ResultadoGravar> {
  const { wsId, tipo } = args;
  if (!TIPOS_COM_FORM.includes(tipo as TipoComForm)) {
    return { httpStatus: 400, ok: false, mensagem: 'Tipo de integração inválido para salvar.' };
  }
  const t = tipo as TipoComForm;

  const configLimpo = limparConfig(t, args.config);
  const credLimpa = limparCredencial(t, args.credencial);

  const batch = dbAdmin.batch();
  const pubRef = dbAdmin.doc(`workspaces/${wsId}/integracoes/${t}`);
  const pubUpdate: Record<string, unknown> = { tipo: t, ...configLimpo };
  if (credLimpa) {
    pubUpdate.credencialCadastradaEm = FieldValue.serverTimestamp();
    batch.set(dbAdmin.doc(`workspaces/${wsId}/privado/${t}`), credLimpa, { merge: true });
  }
  // mergeFields (não `{merge:true}`): procMap é um mapa inteiro por save —
  // `{merge:true}` faz merge RECURSIVO em campos aninhados (a chave antiga
  // nunca sai, só acumula). mergeFields com nome de campo no topo troca o
  // campo por inteiro, sem tocar em `status`/`ultimoTeste` que ficam de fora.
  batch.set(pubRef, pubUpdate, { mergeFields: Object.keys(pubUpdate) });

  if (t === 'orthanc' && typeof configLimpo.ativo === 'boolean') {
    batch.set(dbAdmin.doc(`workspaces/${wsId}`), { ortancAtivo: configLimpo.ativo }, { merge: true });
  }

  await batch.commit();
  return { httpStatus: 200, ok: true, mensagem: 'Integração salva.', integracao: await respostaIntegracao(dbAdmin, wsId, t) };
}

/** Apaga a gaveta inteira — explícito, só isto apaga (nunca `salvar` com campo vazio). */
export async function removerCredencial(dbAdmin: Firestore, args: { wsId: string; tipo: string }): Promise<ResultadoGravar> {
  const { wsId, tipo } = args;
  if (!TIPOS_COM_FORM.includes(tipo as TipoComForm)) {
    return { httpStatus: 400, ok: false, mensagem: 'Tipo de integração inválido para remover.' };
  }
  const t = tipo as TipoComForm;

  const batch = dbAdmin.batch();
  batch.delete(dbAdmin.doc(`workspaces/${wsId}/privado/${t}`));
  batch.set(dbAdmin.doc(`workspaces/${wsId}/integracoes/${t}`), { credencialCadastradaEm: null }, { merge: true });
  await batch.commit();
  return { httpStatus: 200, ok: true, mensagem: 'Credencial removida.', integracao: await respostaIntegracao(dbAdmin, wsId, t) };
}
