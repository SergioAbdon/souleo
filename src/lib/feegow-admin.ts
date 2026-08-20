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

/**
 * Digitos verificadores de CPF. Duplicado de apps/wader/src/ui/api/agendamentos.ts
 * (isValidCpf, ~linha 118) — mesma restricao de nao-import local do topo do
 * arquivo (node --test nao resolve .ts local).
 */
export function cpfValido(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += parseInt(digits[i], 10) * (t + 1 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== parseInt(digits[t], 10)) return false;
  }
  return true;
}

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
 * no-op silencioso pra importacao.
 *
 * Task 3 (D4, achado 15): SEM fallback nenhum — o `defaultMap` (PROC_MAP de
 * 3 entradas chumbadas na rota, IDs da MedCardio) morreu. Doc ausente ou
 * `procMap` vazio devolve `{}`; quem chama (route.ts) trata `{}` como "local
 * nao configurou Feegow" e devolve 400 ANTES de bater na API do Feegow, em
 * vez de silenciosamente usar o mapa de outra clinica.
 */
export async function resolverProcMap(
  db: Firestore, wsId: string | null,
): Promise<Record<number, string>> {
  if (!wsId) return {};
  const snap = await db.doc(`workspaces/${wsId}/integracoes/feegow`).get();
  const cfg = snap.data()?.procMap as Record<string, string> | undefined;
  if (!cfg || Object.keys(cfg).length === 0) return {};
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(cfg)) out[Number(k)] = v;
  return out;
}

/**
 * Veredito HTTP de "wsId + papel resolvido -> pode prosseguir": usado pelos
 * GETs de /api/feegow (buscar_cpf, procedimentos, profissionais) e pelos
 * dois POSTs de /api/feegow (importar, atualizar_status), via
 * decidirGetFeegow — mesmo gate, um unico lugar. NAO resolve papel (isso e
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
 * Veredito de acesso do /api/feegow inteiro (GET e POST) — chamado UMA vez por requisicao,
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

// ══════════════════════════════════════════════════════════════════
// Sub-plano 5, Task 2 (D6, achados 3/4/9/13/14/20/22) — montarCandidatos
// desce de route.ts pra ca: era a unica traducao Feegow->LEO e vivia fora
// da camada testavel, com ZERO cobertura. fetchImpl injetavel (mesmo padrao
// de testarFeegow em integracoes-admin.ts) pra testar sem rede.
// ══════════════════════════════════════════════════════════════════
export const FEEGOW_BASE = 'https://api.feegow.com/v1/api';
const FEEGOW_TIMEOUT_MS = 10000;
// {6,11,22,15} = desmarcado/faltou no Feegow (ADR 16/05 #6). D3: quem
// chama (Task 4) usa a lista `cancelados` pra fechar exames abertos no LEO
// que o Feegow ja cancelou.
const CANCELADOS_FEEGOW = [6, 11, 22, 15];

// Task 5: unificado com o feegowFetch que vivia duplicado em route.ts (GET
// buscar_cpf/procedimentos/profissionais) — mesma logica de timeout/abort,
// so existia em dois lugares que podiam divergir. fetchImpl opcional (default
// fetch de verdade) pra rota chamar com 2 args como antes, e os testes
// (montarCandidatos) continuam passando o stub explicito.
export async function feegowFetch(endpoint: string, token: string, fetchImpl: typeof fetch = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEEGOW_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${FEEGOW_BASE}${endpoint}`, {
      headers: { 'x-access-token': token, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Feegow ${res.status}: ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Data do Feegow (DD-MM-YYYY) -> ISO (YYYY-MM-DD). '' se nao reconhecer o
 * formato (achado 9 — antes montava a string sem checar nada). Guard ISO:
 * se ja vier em YYYY-MM-DD (4 digitos no primeiro pedaco), passa direto.
 */
export function normalizarNascimento(s: string | undefined | null): string {
  if (!s) return '';
  const p = String(s).split('-');
  if (p.length !== 3) return '';
  const iso = p[0].length === 4 ? String(s) : `${p[2]}-${p[1]}-${p[0]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  // achado 5 (barato e real): a regex so checa formato, nao valores — '32-13-1980'
  // virava '1980-13-32' e passava. Date.parse + volta pra ISO detecta overflow
  // (dia/mes que nao existe rola pro mes seguinte); se nao bate com o iso pedido, e lixo.
  const t = Date.parse(iso);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso ? iso : '';
}
// mesma inversao usada pro campo `data` do agendamento (achado 13) — nome
// separado so pra deixar claro que nao e nascimento de paciente.
const normalizarData = normalizarNascimento;

/**
 * Monta a lista de candidatos da sala de espera Feegow do dia. NAO grava
 * nada (gravarImportacao faz isso). Movida de route.ts (era so ~65 linhas
 * dentro da rota, sem cobertura nenhuma) com 3 mudancas de comportamento:
 *
 * - achado 13: a busca NAO filtra mais status_id=4 na query — traz tudo no
 *   intervalo de data e o laco particiona. {6,11,22,15} vira `cancelados`
 *   (D3, Task 4 consome); != 4 e pulado ({2,3,5} nao mexer); so status 4
 *   segue pro resto do fluxo. A data do agendamento tambem e reconferida
 *   contra `hoje` (defesa extra, o filtro de data do Feegow ja e honrado
 *   mas nao custa nao confiar cegamente de novo).
 * - achado 3: procedimento fora do procMap nao e mais silenciosamente
 *   ignorado — entra em `ignorados` com a contagem por procedimentoId.
 * - achado 4: erro buscando UM paciente (rede, /patient/search estourando,
 *   paciente sem nome) nao derruba a importacao inteira — o agendamento_id
 *   entra em `falhas` e o laco continua pros demais.
 *
 * achado 20: convenioId/procedimentoId/profissionalId/origem NAO viajam no
 * candidato — eram calculados e jogados fora (Candidato nao declara esses
 * campos; gravarImportacao grava o proprio `origem` fixo).
 */
export async function montarCandidatos(args: {
  token: string; wsId: string; hoje: string;
  procMap: Record<string, string>; profMap: Record<number, string>;
  fetchImpl?: typeof fetch;
}): Promise<{
  candidatos: Candidato[];
  ignorados: Array<{ procedimentoId: number; qtd: number }>;
  falhas: string[];
  cancelados: string[];
}> {
  const { token, hoje, procMap, profMap, fetchImpl = fetch } = args;

  const salaRes = await feegowFetch(`/appoints/search?data_start=${hoje}&data_end=${hoje}`, token, fetchImpl);
  const agendamentos = salaRes?.content || [];

  const convRes = await feegowFetch('/insurance/list', token, fetchImpl);
  const convMap: Record<number, string> = {};
  for (const c of convRes?.content || []) {
    convMap[c.convenio_id] = c.nome;
  }

  const candidatos: Candidato[] = [];
  const falhas: string[] = [];
  const cancelados: string[] = [];
  const ignoradosMap = new Map<number, number>();

  for (const ag of agendamentos) {
    if (CANCELADOS_FEEGOW.includes(Number(ag.status_id))) {
      cancelados.push(String(ag.agendamento_id));
      continue;
    }
    if (Number(ag.status_id) !== 4) continue; // {2,3,5}: nao mexer
    // defesa achado 13: so pula quando SABE que e outro dia. Formato de data
    // que normalizarData nao reconhece vira '' (falsy) — nao derruba a
    // importacao inteira (achado 5-critico da re-revisao: um formato
    // desconhecido do Feegow zerava a sala inteira em silencio).
    const dataAg = ag.data ? normalizarData(ag.data) : '';
    if (dataAg && dataAg !== hoje) continue;

    const procId = Number(ag.procedimento_id ?? 0); // achado 5: ausente vira 0, nunca NaN em ignorados
    if (!procMap[procId]) {
      ignoradosMap.set(procId, (ignoradosMap.get(procId) || 0) + 1);
      continue;
    }

    try {
      const pacRes = await feegowFetch(`/patient/search?paciente_id=${ag.paciente_id}`, token, fetchImpl);
      const pac = pacRes?.content;
      if (!pac?.nome) { falhas.push(String(ag.agendamento_id)); continue; }

      candidatos.push({
        feegowAppointId: ag.agendamento_id,
        feegowPacienteId: ag.paciente_id,
        pacienteNome: (pac.nome || '').toUpperCase(),
        pacienteDtnasc: normalizarNascimento(pac.nascimento),
        sexo: pac.sexo === 'Masculino' ? 'M' : pac.sexo === 'Feminino' ? 'F' : '',
        cpf: (pac.documentos?.cpf || '').replace(/\D/g, ''),
        telefone: typeof pac.telefones?.[0] === 'string' ? pac.telefones[0] : '', // achado 16-baixo
        convenio: convMap[ag.convenio_id] || '',
        tipoExame: procMap[procId],
        medicoExecutor: profMap[ag.profissional_id] || '',
        horarioChegada: ag.horario ? ag.horario.slice(0, 5) : '',
        dataExame: hoje, // sempre valido — gravarImportacao (Task 1) descarta sem isso
      });
    } catch {
      falhas.push(String(ag.agendamento_id)); // achado 4: nao derruba os demais
    }
  }

  const ignorados = Array.from(ignoradosMap, ([procedimentoId, qtd]) => ({ procedimentoId, qtd }));
  return { candidatos, ignorados, falhas, cancelados };
}

export async function gravarImportacao(dbAdmin: Firestore, args: {
  wsId: string; candidatos: Candidato[]; uid: string; ehMed: boolean; nomeCriador: string;
}): Promise<{ criados: Array<{ exameId: string; pac: Candidato }>; descartados: number }> {
  const { wsId, candidatos, uid, ehMed, nomeCriador } = args;
  const base = agoraBelem();
  const criados: Array<{ exameId: string; pac: Candidato }> = [];
  // Task 3: contagem dos `continue` de path-safety/data abaixo — no fluxo
  // real montarCandidatos sempre gera fgId numerico + dataExame valida, entao
  // isso nunca dispara; existe so pra fechar o invariante "nenhum descarte
  // silencioso" (route.ts soma isso na resposta do importar).
  let descartados = 0;

  for (let seq = 0; seq < candidatos.length; seq++) {
    const c = candidatos[seq];
    // Path safety (Codex-11): id externo entra em path do Firestore.
    const fgId = String(c.feegowAppointId ?? '');
    if (!/^\d+$/.test(fgId)) { descartados++; continue; }
    const fgPacId = /^\d+$/.test(String(c.feegowPacienteId ?? '')) ? String(c.feegowPacienteId) : null;
    const dataEx = String(c.dataExame ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEx)) { descartados++; continue; } // sem data valida nao ha identidade

    // D2: identidade = agendamento + data. Mesmo agendamento em dias diferentes
    // (remarcacao — o Feegow PRESERVA o id, provado 19/08 com o 66890) sao dois
    // exames de verdade; a trava so precisa impedir o mesmo exame do MESMO dia.
    const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/fg-${fgId}-${dataEx}`);
    const cpfOk = c.cpf && cpfValido(c.cpf) ? c.cpf.replace(/\D/g, '') : ''; // achado 11
    try {
      // Transacao por candidato: exame + reserva de ACC nascem JUNTOS.
      // tx.create falha com ALREADY_EXISTS se o exame ja existe (re-import,
      // 2 POSTs concorrentes) — idempotencia real, nao check-then-write.
      await dbAdmin.runTransaction(async (tx: Transaction) => {
        // ── leituras primeiro (regra do Firestore: tudo antes de qualquer escrita) ──
        let pacRef = fgPacId
          ? dbAdmin.doc(`workspaces/${wsId}/pacientes/fg-${fgPacId}`)
          : dbAdmin.collection(`workspaces/${wsId}/pacientes`).doc();
        let porCpf = false;
        let pacSnap;
        if (cpfOk) {
          // Dedup por CPF (achado 10): ficha manual da mesma pessoa e reusada.
          const q = await tx.get(dbAdmin.collection(`workspaces/${wsId}/pacientes`)
            .where('cpf', '==', cpfOk).limit(1));
          if (!q.empty) { pacRef = q.docs[0].ref; porCpf = true; pacSnap = q.docs[0]; }
        }
        // achado 4 (dedup): sem reler via tx.get o doc que a query ja devolveu.
        if (!pacSnap) pacSnap = await tx.get(pacRef);

        let acc = '';
        for (let t = 0; t < 5; t++) {
          const tent = gerarAccessionNumber(base, seq * 10 + t * 100);
          const res = await tx.get(dbAdmin.doc(`workspaces/${wsId}/accIndex/${tent}`));
          if (!res.exists) { acc = tent; break; }
        }
        if (!acc) throw new Error('ACC: 5 colisoes seguidas na importacao');

        // ── escritas ──
        // #7c (achado 1): vazio significa "nao mexe" — merge:true NAO protege de
        // string vazia, que e valor e sobrescreve o que a secretaria corrigiu na mao.
        // porCpf (achado dedup): pacRef veio da busca por CPF, e pode ser a ficha
        // de OUTRA pessoa se o CPF estiver digitado errado no Feegow — os campos
        // de IDENTIDADE da ficha encontrada nao sao regravados, so o vinculo
        // (feegowPacienteId). cpf nao precisa condicionar: se veio da query, ja e igual.
        tx.set(pacRef, {
          id: pacRef.id,
          // ficha nova sem nome fica invisivel em getPacientes (orderBy('nome')
          // exclui docs sem o campo) — semeia os vazios so na criacao, ANTES dos
          // spreads condicionais abaixo (que sobrescrevem com o que veio preenchido).
          ...(pacSnap.exists ? {} : { nome: '', cpf: '', dtnasc: '', sexo: '', telefone: '', criadoEm: FieldValue.serverTimestamp() }), // achado 12
          ...(!porCpf && c.pacienteNome ? { nome: c.pacienteNome } : {}),
          ...(cpfOk ? { cpf: cpfOk } : {}),
          ...(!porCpf && c.pacienteDtnasc ? { dtnasc: c.pacienteDtnasc } : {}),
          ...(!porCpf && c.sexo ? { sexo: c.sexo } : {}),
          ...(!porCpf && c.telefone ? { telefone: c.telefone } : {}),
          ...(fgPacId ? { feegowPacienteId: fgPacId } : {}),
          atualizadoEm: FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.create(exameRef, {
          id: exameRef.id, acc,
          pacienteId: pacRef.id,
          pacienteNome: c.pacienteNome ?? '', pacienteDtnasc: c.pacienteDtnasc ?? '',
          cpf: cpfOk, feegowPacienteId: fgPacId,
          tipoExame: c.tipoExame ?? '', dataExame: dataEx,
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
  return { criados, descartados };
}

/**
 * Task 4 (D3, achado 7a): reconcilia quem o Feegow ja deu como
 * desmarcado/faltou ({6,11,22,15}, `cancelados` de montarCandidatos) contra
 * a fila do LEO. ADR 16/05 #6: marca 'nao-realizado', NUNCA apaga — o
 * historico do exame (e a reserva de ACC, ligada ao doc) fica intacto.
 *
 * Ancora obrigatoria: `cancelados` carrega so ids, sem data, e o Feegow
 * PRESERVA o id do agendamento numa remarcacao (provado 19/08 com o 66890).
 * A query trava em `dataExame == hoje` — sem isso, um agendamento remarcado
 * pra OUTRO dia (mesmo id, novo doc fg-{id}-{novaData}) marcaria
 * 'nao-realizado' o exame errado. So `aguardando` tambem: exame que ja
 * entrou em andamento/emitido nao regride por reconciliacao tardia.
 */
export async function reconciliarCancelados(dbAdmin: Firestore, args: {
  wsId: string; hoje: string; cancelados: string[];
}): Promise<number> {
  if (args.cancelados.length === 0) return 0;
  const setC = new Set(args.cancelados);
  const snap = await dbAdmin.collection(`workspaces/${args.wsId}/exames`)
    .where('origem', '==', 'FEEGOW').where('dataExame', '==', args.hoje)
    .where('status', '==', 'aguardando').get();
  // ponytail: 1 batch = teto de 500 writes do Firestore; nunca visto (fila
  // de um dia de uma clinica), upgrade se estourar e fatiar em chunks de 500.
  const lote = dbAdmin.batch();
  let n = 0;
  for (const d of snap.docs) {
    if (!setC.has(String(d.data().feegowAppointId))) continue;
    lote.update(d.ref, { status: 'nao-realizado', atualizadoEm: FieldValue.serverTimestamp() });
    n++;
  }
  if (n > 0) await lote.commit();
  return n;
}

/**
 * Task 5 (D4, achados 5/16): endurece o case 'atualizar_status' da rota
 * (motor emite laudo -> LEO carimba "Atendido" no Feegow). Duas falhas
 * fechadas aqui:
 *
 * - achado 16: o `status_id` do corpo (mandado pelo MOTOR, arquivo
 *   intocavel) NUNCA e usado — o StatusID enviado ao Feegow e sempre 3.
 *   Antes qualquer valor do cliente ia direto pro Feegow.
 * - achado 5: `res.ok` agora e conferido. 401/500 do Feegow deixam de virar
 *   {ok:true} silencioso — o resultado fica gravado no proprio exame
 *   (feegowStatusOk), e a rota devolve 502 pra quem quiser olhar (o motor
 *   ja ignora a resposta, fire-and-forget — o 502 e so diagnostico).
 *
 * Validacao extra (achado 16): o agendamento_id tem que pertencer a um
 * exame DESTE wsId — antes qualquer membro autenticado carimbava qualquer
 * status em qualquer agendamento da conta Feegow (nao havia vinculo com o
 * local). Sem exame correspondente -> 404, sem nunca chamar o Feegow.
 */
export async function marcarAtendido(dbAdmin: Firestore, args: {
  wsId: string; agendamentoId: string; token: string; fetchImpl?: typeof fetch;
}): Promise<{ httpStatus: number; ok: boolean; mensagem: string }> {
  const f = args.fetchImpl ?? fetch;
  const agId = String(args.agendamentoId ?? '');
  if (!/^\d+$/.test(agId)) return { httpStatus: 400, ok: false, mensagem: 'agendamento_id invalido' };
  // SEM limit(1): o Feegow preserva o id ao remarcar (66890), entao o mesmo
  // agendamento pode ter DOIS exames (falta antiga + remarcado). O carimbo no
  // Feegow e por agendamento (tanto faz), mas o feegowStatusOk tem de ir pro
  // exame MAIS RECENTE — o que esta sendo emitido. Nao ancorar em "hoje":
  // laudar dias depois do exame acontece (os 13 exames de maio).
  const q = await dbAdmin.collection(`workspaces/${args.wsId}/exames`)
    .where('feegowAppointId', '==', agId).get();
  if (q.empty) return { httpStatus: 404, ok: false, mensagem: 'agendamento nao pertence a este local' };
  const alvo = q.docs.reduce((a, b) =>
    String(a.data().dataExame ?? '') >= String(b.data().dataExame ?? '') ? a : b);
  const res = await f(`${FEEGOW_BASE}/appoints/statusUpdate`, {
    method: 'POST', headers: { 'x-access-token': args.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ AgendamentoID: agId, StatusID: 3 }), // sempre 3: o significado mora aqui
  });
  const ok = res.ok;
  await alvo.ref.set({ feegowStatusOk: ok, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  return ok ? { httpStatus: 200, ok: true, mensagem: 'Atendido marcado no Feegow.' }
            : { httpStatus: 502, ok: false, mensagem: `Feegow ${res.status} ao marcar Atendido — registrado no exame.` };
}
