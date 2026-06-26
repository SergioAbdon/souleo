import { FastifyInstance } from 'fastify';
import { OrthancClient, OrthancStudy } from '../../adapters/orthanc-client';
import { getDb } from '../../adapters/firebase';
import { digitos } from '../../lib/acc';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';

const log = createLogger({ module: 'api-reconciliacao' });

const CLINIC_TZ = 'America/Belem'; // fuso da clínica (ver ADR 2026-06-22)

/** Data de hoje no fuso da clínica (não do servidor). */
function dataHojeClinica(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface ExameRecon {
  id: string;
  pacienteNome: string;
  acc: string;
  tipoExame: string;
  status: string;
  horarioChegada: string;
  temAcc: boolean;
  nImagens: number;
  temMedidas: boolean;
  /** 'casado' = já tem imagens/SR no LEO; 'recebido' = estudo chegou, processando; 'aguardando' = sem estudo ainda. */
  matchStatus: 'casado' | 'recebido' | 'aguardando';
  orthancStudyId: string | null;
}

interface OrfaoRecon {
  orthancStudyId: string;
  pacienteNomeDicom: string;
  accDicom: string;
  nSeries: number;
  studyDate: string;
  studyTime: string;
}

/**
 * Endpoint da console de reconciliação (ADR 2026-06-26).
 *
 *   GET /api/reconciliacao?data=YYYY-MM-DD
 *
 * Cruza a agenda do LEO (exames do dia no Firestore) com o que o Vivid mandou
 * (estudos no Orthanc), classificando o vínculo. SÓ LEITURA.
 */
export function registerReconciliacaoRoutes(
  app: FastifyInstance,
  config: WaderConfig,
  client: OrthancClient | null,
): void {
  app.get<{ Querystring: { data?: string } }>('/api/reconciliacao', async (req, reply) => {
    const data = req.query.data || dataHojeClinica();
    try {
      const payload = await montarReconciliacao(config.wsId, client, data);
      return reply.send({ ok: true, data, ...payload });
    } catch (err) {
      log.error({ err }, 'Falha ao montar reconciliação');
      return reply.status(500).send({ ok: false, error: (err as Error).message });
    }
  });
}

async function montarReconciliacao(
  wsId: string,
  client: OrthancClient | null,
  data: string,
): Promise<{ exames: ExameRecon[]; orfaos: OrfaoRecon[]; orthancOk: boolean }> {
  // 1) Exames do dia (Firestore). dataExame não é indexado pra where direto —
  // varremos por status e filtramos em memória (≤ ~30 docs/dia).
  const examesCol = getDb().collection('workspaces').doc(wsId).collection('exames');
  const seen = new Set<string>();
  const exameDocs: Array<Record<string, unknown> & { id: string }> = [];
  for (const st of ['aguardando', 'andamento', 'rascunho', 'emitido', 'nao-realizado']) {
    const snap = await examesCol.where('status', '==', st).get();
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      const e = d.data();
      if (e.dataExame === data) {
        exameDocs.push({ id: d.id, ...e });
        seen.add(d.id);
      }
    }
  }

  // 2) Estudos recentes do Orthanc (tolerante a Orthanc fora — só fica sem órfãos).
  let studies: OrthancStudy[] = [];
  let orthancOk = false;
  if (client) {
    try {
      studies = await client.listStudies(80);
      orthancOk = true;
    } catch (err) {
      log.warn({ err }, 'Orthanc inacessível — reconciliação sem o lado Vivid');
    }
  }

  // 3) Índices pro cruzamento.
  // accDigitos -> exame (pra casar estudo por ACC) e studyId vinculado.
  const accParaExame = new Map<string, (typeof exameDocs)[number]>();
  const studyIdsVinculados = new Set<string>();
  for (const e of exameDocs) {
    const d = digitos(e.acc as string);
    if (d) accParaExame.set(d, e);
    const vinc = e.dicomOrthancStudyId as string | undefined;
    if (vinc) studyIdsVinculados.add(vinc);
  }

  // Acha o estudo que casa com um exame (por studyId vinculado OU ACC).
  const studyPorId = new Map(studies.map((s) => [s.ID, s]));
  function estudoDoExame(e: (typeof exameDocs)[number]): OrthancStudy | null {
    const vinc = e.dicomOrthancStudyId as string | undefined;
    if (vinc && studyPorId.has(vinc)) return studyPorId.get(vinc)!;
    const d = digitos(e.acc as string);
    if (!d) return null;
    return studies.find((s) => digitos(s.MainDicomTags?.AccessionNumber) === d) ?? null;
  }

  // 4) Monta lista de exames com status de vínculo.
  const exames: ExameRecon[] = exameDocs.map((e) => {
    const nImagens = Array.isArray(e.imagensDicom) ? (e.imagensDicom as unknown[]).length : 0;
    const temMedidas = !!e.medidasDicom && Object.keys(e.medidasDicom as object).length > 0;
    const casadoNoLeo = nImagens > 0 || !!e.dicomStudyUid;
    const estudo = estudoDoExame(e);
    const matchStatus: ExameRecon['matchStatus'] = casadoNoLeo
      ? 'casado'
      : estudo
        ? 'recebido'
        : 'aguardando';
    return {
      id: e.id,
      pacienteNome: (e.pacienteNome as string) || '(sem nome)',
      acc: (e.acc as string) || '',
      tipoExame: (e.tipoExame as string) || '',
      status: (e.status as string) || '',
      horarioChegada: (e.horarioChegada as string) || '',
      temAcc: !!digitos(e.acc as string),
      nImagens,
      temMedidas,
      matchStatus,
      orthancStudyId: (e.dicomOrthancStudyId as string) || estudo?.ID || null,
    };
  });

  // 5) Órfãos: estudos que NÃO estão vinculados a nenhum exame e cujo ACC
  // não casa com nenhum exame do dia (inclui estudos com ACC vazio).
  const orfaos: OrfaoRecon[] = studies
    .filter((s) => {
      if (studyIdsVinculados.has(s.ID)) return false;
      const d = digitos(s.MainDicomTags?.AccessionNumber);
      if (d && accParaExame.has(d)) return false;
      return true;
    })
    .map((s) => ({
      orthancStudyId: s.ID,
      pacienteNomeDicom: s.PatientMainDicomTags?.PatientName || '(sem nome no DICOM)',
      accDicom: s.MainDicomTags?.AccessionNumber || '',
      nSeries: (s.Series ?? []).length,
      studyDate: s.MainDicomTags?.StudyDate || '',
      studyTime: s.MainDicomTags?.StudyTime || '',
    }))
    .sort((a, b) => (b.studyDate + b.studyTime).localeCompare(a.studyDate + a.studyTime));

  return { exames, orfaos, orthancOk };
}
