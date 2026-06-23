import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../logger';

const log = createLogger({ module: 'ingest-state' });

/**
 * Estado persistido do DICOM ingest.
 *
 * POR QUE EXISTE (ADR 2026-05-18 — wader-ingest-resiliente):
 * Antes, `lastSeq` (cursor do /changes) e o set de estudos processados
 * viviam SÓ em memória. Consequências reais (18/05):
 *   - Todo restart re-varria o feed inteiro do seq 0 (lento: 100/30s,
 *     800+ changes ⇒ ~4-5 min só pra recuperar 1 exame).
 *   - Estudo "órfão" (sem ACC na hora) era blacklistado PRA SEMPRE: ao
 *     reenviar o exame já com ACC, o Wader se recusava a olhar de novo.
 *   - Estudo que estabilizou parcial (ex.: 4 imagens, SR ainda não
 *     chegou) ficava travado parcial — nunca reprocessado.
 *
 * Persistir o cursor + uma assinatura por estudo (nImg/nSR) resolve os 3:
 * o boot retoma de onde parou e a re-avaliação por completude reprocessa
 * quando o Orthanc passa a ter mais conteúdo do que já gravamos.
 *
 * Arquivo fica na RAIZ do C:\Wader (cwd em produção), NÃO em src\ —
 * assim o deploy manual (update-wader.ps1 copia só src\*) não o apaga.
 */

export interface StudySignature {
  /** Nº de imagens (instances não-SR) já processadas com sucesso. */
  nImg: number;
  /** Nº de instances SR já vistas (mesma unidade que `precisaProcessar` compara). */
  nSR: number;
  /** Casou com um exame no LEO. */
  matched: boolean;
  /** ISO da última vez que processamos esse estudo. */
  at: string;
}

export interface PersistedIngestState {
  lastSeq: number;
  /** orthancStudyId → assinatura do que já gravamos. */
  studies: Record<string, StudySignature>;
}

const EMPTY: PersistedIngestState = { lastSeq: 0, studies: {} };

export class IngestStateStore {
  private state: PersistedIngestState = { ...EMPTY };
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(stateFile?: string) {
    this.file = stateFile || path.join(process.cwd(), '.wader-ingest-state.json');
  }

  /** Carrega do disco. Arquivo corrompido/ausente ⇒ estado vazio (não derruba). */
  load(): void {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedIngestState;
        this.state = {
          lastSeq: Number.isFinite(parsed.lastSeq) ? parsed.lastSeq : 0,
          studies: parsed.studies && typeof parsed.studies === 'object' ? parsed.studies : {},
        };
        log.info(
          { file: this.file, lastSeq: this.state.lastSeq, estudos: Object.keys(this.state.studies).length },
          'Estado do ingest carregado do disco',
        );
        return;
      }
    } catch (err) {
      log.warn({ err, file: this.file }, 'Falha ao ler estado do ingest — começando do zero');
    }
    this.state = { ...EMPTY };
  }

  getLastSeq(): number {
    return this.state.lastSeq;
  }

  setLastSeq(seq: number): void {
    if (seq !== this.state.lastSeq) {
      this.state.lastSeq = seq;
      this.markDirty();
    }
  }

  /** Quantos estudos têm assinatura gravada (telemetria). */
  size(): number {
    return Object.keys(this.state.studies).length;
  }

  getSignature(studyId: string): StudySignature | undefined {
    return this.state.studies[studyId];
  }

  setSignature(studyId: string, sig: StudySignature): void {
    this.state.studies[studyId] = sig;
    this.markDirty();
  }

  /**
   * Decide se um estudo PRECISA ser (re)processado.
   *
   * Reprocessa quando:
   *   - nunca foi visto, OU
   *   - ainda não casou com exame (pode ter ganhado ACC depois — reenvio), OU
   *   - o Orthanc agora tem MAIS imagens ou SR do que gravamos
   *     (estudo estabilizou parcial e o resto chegou depois).
   *
   * `curImg`/`curSR` = contagem ATUAL no Orthanc (barata: nº de instances
   * por modalidade, sem baixar nada).
   */
  precisaProcessar(studyId: string, curImg: number, curSR: number): boolean {
    const s = this.state.studies[studyId];
    if (!s) return true;
    if (!s.matched) return true;
    if (curImg > s.nImg) return true;
    if (curSR > s.nSR) return true;
    return false;
  }

  /** Zera cursor + assinaturas (debug / re-processar tudo). */
  reset(): void {
    this.state = { ...EMPTY, studies: {} };
    this.dirty = true;
    this.flush();
  }

  private markDirty(): void {
    this.dirty = true;
    // Debounce: agrupa escritas (ticks podem mexer várias vezes seguidas).
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }

  /** Escreve no disco de forma atômica (tmp + rename). */
  flush(): void {
    if (!this.dirty) return;
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.state), 'utf-8');
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (err) {
      log.warn({ err, file: this.file }, 'Falha ao persistir estado do ingest (segue em memória)');
    }
  }
}
