// Loader hook SÓ para os testes (node --test): resolve import relativo SEM
// extensão (`from './calculos/demografia'`) tentando `.ts` quando a
// resolução padrão do Node falha.
//
// Por quê: código do app (webpack/Next.js) resolve extensão automaticamente;
// `node --test` nativo não. `src/senna90/**` é TS "de verdade" (import entre
// arquivos do mesmo motor) escrito pra rodar dentro do Next — reescrever import
// por import pra sempre incluir `.ts` só pra caber no test runner infla um
// diff que devia ficar mínimo (~20 arquivos) por uma questão de tooling, não
// de lógica clínica. Um hook de resolução aqui resolve pra sempre, sem tocar
// em uma linha do motor.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw err;
    // Só '.ts': import de diretório (ex. './achados') lança
    // ERR_UNSUPPORTED_DIR_IMPORT, não ERR_MODULE_NOT_FOUND (filtrado acima) —
    // '/index.ts' nunca seria alcançado (review S5-T3, M2).
    const base = fileURLToPath(new URL(specifier, context.parentURL)) + '.ts';
    if (existsSync(base)) {
      return nextResolve(pathToFileURL(base).href, context);
    }
    throw err;
  }
}
