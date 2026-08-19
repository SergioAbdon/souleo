/**
 * Atualiza workspace `wader-dev` pra apontar pro Orthanc REAL da MedCardio.
 * Use SOMENTE quando estiver na rede da clínica.
 *
 * A credencial NÃO fica mais escrita neste arquivo (achado Minor da revisão
 * da Task 6 — era o segredo que o Sub-plano 5 existe pra esconder, e estava
 * versionado em texto puro no git). Endereço, usuário e senha vêm de
 * variáveis de ambiente; o script falha com mensagem clara se faltar alguma,
 * sem valor padrão embutido.
 *
 * Grava no lugar novo (Task 5): `workspaces/wader-dev/integracoes/orthanc`
 * (público: url/ativo/status) e `workspaces/wader-dev/privado/orthanc`
 * (segredo: user/pass), no mesmo writeBatch — é de lá que o Wader novo lê.
 *
 * Uso:
 *   MEDCARDIO_ORTHANC_URL=http://192.168.15.27:8042 \
 *   MEDCARDIO_ORTHANC_USER=*** \
 *   MEDCARDIO_ORTHANC_PASS=*** \
 *   npx tsx scripts/apontar-orthanc-medcardio.ts
 */
import { loadConfig } from '../src/config/load';
import { initFirebase, getDb } from '../src/adapters/firebase';

function envObrigatoria(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    throw new Error(`${nome} ausente. Defina a variável de ambiente antes de rodar — sem valor padrão embutido no script.`);
  }
  return v;
}

async function main() {
  const url = envObrigatoria('MEDCARDIO_ORTHANC_URL');
  const user = envObrigatoria('MEDCARDIO_ORTHANC_USER');
  const pass = envObrigatoria('MEDCARDIO_ORTHANC_PASS');

  const config = loadConfig();
  initFirebase(config.firebase);
  const db = getDb();

  const wsRef = db.collection('workspaces').doc('wader-dev');
  const lote = db.batch();
  // merge: nao apagar status/ultimoTeste/ultimoErro que a tela ou a migracao
  // ja tenham gravado neste documento.
  lote.set(wsRef.collection('integracoes').doc('orthanc'), {
    tipo: 'orthanc',
    ativo: true,
    status: 'nunca_testado',
    url,
  }, { merge: true });
  lote.set(wsRef.collection('privado').doc('orthanc'), { user, pass }, { merge: true });
  await lote.commit();

  console.log(`✓ wader-dev apontado pro Orthanc real da MedCardio (${url})`);
  console.log('  Reinicie o Wader pra invalidar cache (ou use POST /api/orthanc/config/refresh)');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
