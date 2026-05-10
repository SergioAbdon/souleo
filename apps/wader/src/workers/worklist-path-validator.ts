import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../logger';

const log = createLogger({ module: 'wl-path-validator' });

export interface PathValidationResult {
  ok: boolean;
  path: string;
  exists: boolean;
  created: boolean;
  writable: boolean;
  error?: string;
  hint?: string;
}

/**
 * Valida que o `worklistPath` configurado:
 *   1. Existe (cria se a pasta-pai existir)
 *   2. É escrevível (testa criando + apagando arquivo de teste)
 *
 * Roda no startup. Falhar não derruba o Wader (recepção continua online),
 * mas a sincronização de worklists fica desativada e admin é avisado via logs.
 *
 * Razão de não derrubar: Wader serve outras coisas (cadastro manual, status,
 * captura DICOM no futuro). Worklist é uma feature — outras devem continuar.
 */
export function validarWorklistPath(worklistPath: string): PathValidationResult {
  const result: PathValidationResult = {
    ok: false,
    path: worklistPath,
    exists: false,
    created: false,
    writable: false,
  };

  // 1) Existe?
  if (fs.existsSync(worklistPath)) {
    const stat = fs.statSync(worklistPath);
    if (!stat.isDirectory()) {
      result.error = `Caminho existe mas não é uma pasta: ${worklistPath}`;
      result.hint = 'Verifique orthanc.worklistPath no wader.config.json — apontou pra um arquivo?';
      log.error(result.error);
      return result;
    }
    result.exists = true;
  } else {
    // Tenta criar
    const parent = path.dirname(worklistPath);
    if (!fs.existsSync(parent)) {
      result.error = `Pasta pai não existe: ${parent}`;
      result.hint =
        `Verifique orthanc.worklistPath. Caminhos comuns:\n` +
        `  - C:\\Orthanc\\worklists\n` +
        `  - C:\\Program Files\\Orthanc Server\\worklists\n` +
        `  - C:\\OrthancStorage\\worklists`;
      log.error({ parent }, result.error);
      return result;
    }
    try {
      fs.mkdirSync(worklistPath, { recursive: true });
      result.exists = true;
      result.created = true;
      log.info({ worklistPath }, 'Pasta worklists criada');
    } catch (err) {
      result.error = `Falha ao criar pasta: ${(err as Error).message}`;
      result.hint = 'Wader provavelmente não tem permissão pra criar nesse caminho. Crie manualmente OU rode Wader com permissões adequadas.';
      log.error({ err, worklistPath }, result.error);
      return result;
    }
  }

  // 2) Escrevível? Cria + apaga arquivo de teste
  const testFile = path.join(worklistPath, '.wader-write-test');
  try {
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    result.writable = true;
  } catch (err) {
    result.error = `Pasta existe mas Wader não consegue gravar: ${(err as Error).message}`;
    result.hint = 'Confira permissões de escrita. No Windows, talvez precise rodar Wader como Administrator OU dar Modify pra usuário do serviço.';
    log.error({ err, testFile }, result.error);
    return result;
  }

  result.ok = true;
  log.info(
    {
      worklistPath,
      created: result.created,
    },
    'Pasta worklists validada e pronta',
  );
  return result;
}
