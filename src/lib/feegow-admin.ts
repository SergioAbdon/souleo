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
