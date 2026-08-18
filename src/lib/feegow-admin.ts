// ══════════════════════════════════════════════════════════════════
// LEO · Importacao Feegow server-side (Secao 2, Achado 14)
// A rota /api/feegow compoe (auth + papel); a logica vive aqui —
// testavel no emulador, padrao exame-admin.ts. Admin SDK ignora regras:
// a AUTORIZACAO (resolverPapel) e responsabilidade do chamador.
// ══════════════════════════════════════════════════════════════════
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

// Duplicado de utils.ts (agoraBelem) e gerarAccessionNumber.ts: este arquivo e
// testado DIRETO por node --test (padrao exame-admin.ts). Import relativo sem
// extensao nao resolve no ESM nativo do Node 24; com extensao `.ts` resolve no
// Node mas quebra `tsc --noEmit` (TS5097, exige allowImportingTsExtensions —
// fora do escopo desta task mexer no tsconfig). Mesmo padrao de `idValido`
// duplicado em exame-admin.ts. Formato e fuso tem que ficar em sincronia com
// os originais se algum dia mudar.
const FUSO_CLINICA = 'America/Belem';

function agoraBelem(): Date {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as Record<string, string>);
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, new Date().getMilliseconds());
}

function gerarAccessionNumber(now: Date, offsetMs: number): string {
  const t = offsetMs ? new Date(now.getTime() + offsetMs) : now;
  const dd = String(t.getDate()).padStart(2, '0');
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const aa = String(t.getFullYear()).slice(-2);
  const hh = String(t.getHours()).padStart(2, '0');
  const mi = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  const cc = String(Math.floor(t.getMilliseconds() / 10)).padStart(2, '0');
  return `EX${dd}${mm}${aa}${hh}${mi}${ss}${cc}`;
}

export type Candidato = {
  feegowAppointId: number | string;
  feegowPacienteId?: number | string;
  pacienteNome?: string; pacienteDtnasc?: string; sexo?: string;
  cpf?: string; telefone?: string; convenio?: string;
  tipoExame?: string; medicoExecutor?: string;
  horarioChegada?: string; dataExame?: string;
};

const jaExiste = (e: unknown) =>
  (e as { code?: number })?.code === 6 || String(e).includes('ALREADY_EXISTS');

// ══════════════════════════════════════════════════════════════════
// Sub-plano 5, Task 7 — funcoes puras que a rota (route.ts, nao testavel
// direto por node --test por causa do import '@/...') delega. Cada uma
// so faz UMA coisa, sem cross-import de outro lib .ts (mesma restricao
// do topo do arquivo).
// ══════════════════════════════════════════════════════════════════

/**
 * Token do Feegow: SEMPRE da gaveta (workspaces/{wsId}/privado/feegow.token),
 * sem excecao. Sem parametro de header nenhum — por construcao nao ha como
 * um x-feegow-token de cliente influenciar o resultado (furo 1 fechado aqui,
 * na funcao compartilhada; route.ts vira wrapper fino que so extrai wsId).
 *
 * Re-revisao da Task 7 (Critical): existiu um fallback pro FEEGOW_API_TOKEN
 * do .env "pra migracao" — como a migracao (`integracoes:migrar --commit`)
 * roda ANTES do deploy, o fallback deixou de ter uso e so segurava um furo:
 * dono de QUALQUER workspace sem token na gaveta caia no token real da
 * MedCardio (dono e sempre 'dono' no proprio ws recem-criado no signup —
 * o gate de papel passa, so a gaveta ta vazia). Removido por completo, sem
 * substituto. Retorna '' quando a gaveta nao tem token — quem chama trata
 * isso como "Feegow nao configurado" (400), nunca como convite a tentar
 * outra fonte. A variavel FEEGOW_API_TOKEN precisa ser removida do Vercel
 * (acao humana, fora do escopo deste arquivo).
 */
export async function resolverTokenFeegow(db: Firestore, wsId: string | null): Promise<string> {
  if (!wsId) return '';
  const priv = await db.doc(`workspaces/${wsId}/privado/feegow`).get();
  return (priv.data()?.token as string | undefined) || '';
}

/**
 * Mapa procedimento->tipoExame: SO de integracoes/feegow.procMap (Task 4).
 * Sem fallback pro campo antigo workspaces/{wsId}.feegowProcMap (decisao D3
 * da spec) — antes desta task, montarCandidatos() e o Wader liam o campo
 * antigo e a tela nova (Task 4) gravava no lugar novo: editar o mapa era
 * no-op silencioso pra importacao. `defaultMap` so entra quando o doc novo
 * nao existe ou esta vazio (locais que nunca configuraram).
 */
export async function resolverProcMap(
  db: Firestore, wsId: string | null, defaultMap: Record<number, string>,
): Promise<Record<number, string>> {
  if (wsId) {
    const snap = await db.doc(`workspaces/${wsId}/integracoes/feegow`).get();
    const cfg = snap.data()?.procMap as Record<string, string> | undefined;
    if (cfg && Object.keys(cfg).length > 0) {
      const out: Record<number, string> = {};
      for (const [k, v] of Object.entries(cfg)) out[Number(k)] = v;
      return out;
    }
  }
  return defaultMap;
}

/**
 * Veredito HTTP de "wsId + papel resolvido -> pode prosseguir": usado pelos
 * GETs de /api/feegow (buscar_cpf, procedimentos, profissionais), pelos dois
 * POSTs de /api/feegow (importar, atualizar_status) e por /api/orthanc (GET
 * e POST criar_mwl) — mesmo gate, um unico lugar. NAO resolve papel (isso e
 * resolverPapel de exame-admin.ts, ja testado em
 * exame.test.mjs/corrigir-laudo.test.mjs — este arquivo nao pode importar
 * de la, ver comentario do topo); so decide o codigo a partir do que a
 * rota ja tem em maos.
 */
export function gateAcessoWs(
  wsId: string | null, papel: string | null,
): { ok: true } | { ok: false; status: number; motivo: string } {
  if (!wsId) return { ok: false, status: 400, motivo: 'wsId obrigatorio' };
  if (!papel) return { ok: false, status: 403, motivo: 'sem_acesso_ao_local' };
  return { ok: true };
}

/**
 * Veredito do GET /api/feegow inteiro — chamado UMA vez por requisicao,
 * antes do switch de `action` e SEM saber qual acao e (correcao pos-revisao
 * da Task 7, achados Critical 1 + Important 2):
 *
 * - Critical 1: antes havia uma lista (`ACOES_COM_GATE`) de quais acoes
 *   passavam pelo gate — 4 das 7 acoes do switch nao apareciam nela e
 *   vazavam dado (CRM de outra clinica, sala de espera, oraculo de token
 *   valido) pra qualquer autenticado. Esta funcao nao recebe `action`: ela
 *   roda pra QUALQUER despacho subsequente, entao uma acao nova no switch
 *   fica gateada por construcao — nao ha lista pra esquecer de atualizar.
 * - Important 2: o gate de papel (`gateAcessoWs`) roda ANTES de
 *   `resolverToken` — `resolverToken` (o parametro, injetado) so e chamado
 *   se o papel resolveu. Quem nao tem acesso ao wsId nunca aciona a leitura
 *   de `workspaces/{wsId}/privado/feegow`, e sempre recebe 403 (nunca 400
 *   por token ausente) — o status HTTP nao vaza se a clinica tem Feegow
 *   configurado ou nao.
 */
export async function decidirGetFeegow(
  wsId: string | null, papel: string | null, resolverToken: () => Promise<string>,
): Promise<{ ok: true; token: string } | { ok: false; status: number; motivo: string }> {
  const gate = gateAcessoWs(wsId, papel);
  if (!gate.ok) return gate;
  const token = await resolverToken();
  if (!token) {
    return { ok: false, status: 400, motivo: 'Token Feegow nao configurado. Va em Local de Trabalho > Integracao Feegow.' };
  }
  return { ok: true, token };
}

export async function gravarImportacao(dbAdmin: Firestore, args: {
  wsId: string; candidatos: Candidato[]; uid: string; ehMed: boolean; nomeCriador: string;
}): Promise<{ criados: Array<{ exameId: string; pac: Candidato }> }> {
  const { wsId, candidatos, uid, ehMed, nomeCriador } = args;
  const base = agoraBelem();
  const criados: Array<{ exameId: string; pac: Candidato }> = [];

  for (let seq = 0; seq < candidatos.length; seq++) {
    const c = candidatos[seq];
    // Path safety (Codex-11): id externo entra em path do Firestore.
    const fgId = String(c.feegowAppointId ?? '');
    if (!/^\d+$/.test(fgId)) continue;
    const fgPacId = /^\d+$/.test(String(c.feegowPacienteId ?? '')) ? String(c.feegowPacienteId) : null;

    const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/fg-${fgId}`);
    try {
      // Transacao por candidato: exame + reserva de ACC nascem JUNTOS.
      // tx.create falha com ALREADY_EXISTS se o exame ja existe (re-import,
      // 2 POSTs concorrentes) — idempotencia real, nao check-then-write.
      await dbAdmin.runTransaction(async (tx: Transaction) => {
        let acc = '';
        for (let t = 0; t < 5; t++) {
          const tent = gerarAccessionNumber(base, seq * 10 + t * 100);
          const res = await tx.get(dbAdmin.doc(`workspaces/${wsId}/accIndex/${tent}`));
          if (!res.exists) { acc = tent; break; }
        }
        if (!acc) throw new Error('ACC: 5 colisoes seguidas na importacao');

        const pacRef = fgPacId
          ? dbAdmin.doc(`workspaces/${wsId}/pacientes/fg-${fgPacId}`)
          : dbAdmin.collection(`workspaces/${wsId}/pacientes`).doc();
        // `?? ''` em todo opcional: um unico undefined derruba a escrita (A10).
        tx.set(pacRef, {
          id: pacRef.id, nome: c.pacienteNome ?? '', cpf: c.cpf ?? '',
          dtnasc: c.pacienteDtnasc ?? '', sexo: c.sexo ?? '',
          telefone: c.telefone ?? '', feegowPacienteId: fgPacId,
          criadoEm: FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.create(exameRef, {
          id: exameRef.id, acc,
          pacienteId: pacRef.id,
          pacienteNome: c.pacienteNome ?? '', pacienteDtnasc: c.pacienteDtnasc ?? '',
          cpf: c.cpf ?? '', feegowPacienteId: fgPacId,
          tipoExame: c.tipoExame ?? '', dataExame: c.dataExame ?? '',
          horarioChegada: c.horarioChegada ?? '', status: 'aguardando',
          convenio: c.convenio ?? '',
          solicitante: ehMed ? nomeCriador : '',
          medicoExecutor: c.medicoExecutor || (ehMed ? nomeCriador : ''),
          sexo: c.sexo ?? '', origem: 'FEEGOW',
          feegowAppointId: fgId,
          ...(ehMed ? { medicoUid: uid } : {}),
          versao: 1, criadoEm: FieldValue.serverTimestamp(),
        });
        tx.create(dbAdmin.doc(`workspaces/${wsId}/accIndex/${acc}`), {
          exameId: exameRef.id, criadoEm: FieldValue.serverTimestamp(),
        });
      });
      criados.push({ exameId: exameRef.id, pac: c });
    } catch (e) {
      if (jaExiste(e)) continue; // exame ja na fila (re-import/concorrencia) — pula
      throw e; // qualquer outro erro NAO e colisao: propaga (Codex-5)
    }
  }

  if (criados.length > 0) {
    await dbAdmin.collection('logs').add({
      tipo: 'importar_feegow', wsId, quantidade: criados.length,
      por: uid, ts: FieldValue.serverTimestamp(),
    });
  }
  return { criados };
}
