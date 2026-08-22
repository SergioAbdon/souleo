// /api/exame/imagens-urls — signed URLs pras imagens DICOM (D5b, achado 20).
// Mesmo padrao dos vizinhos (tests/api/integracoes.test.mjs): a rota importa
// 'next/server', nao roda em node --test puro — testa-se requireUid/
// resolverPapel (o MESMO import da rota) + a logica pura em
// src/lib/imagens-dicom-admin.ts, com um bucket falso (DI, sem GCS real —
// o emulador da suite so sobe firestore+auth).
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverPapel } from '../../src/lib/exame-admin.ts';
import { requireUid } from '../../src/lib/auth-admin.ts';
import { assinarImagensExame, apagarImagensExame, derivarPathDeUrl } from '../../src/lib/imagens-dicom-admin.ts';

let db;
const CONTA = 'contaImg', WS = 'wsImg';
const DONO = 'uidDonoImg', RITA = 'uidRitaImg';
const BUCKET_NAME = 'bucket-teste';

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, nomeClinica: 'Imagens Teste' });
  for (const [uid, papel] of [[DONO, 'dono'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
});

// Bucket falso — DI (mesmo motivo do apagarPdf-spy em exame.test.mjs): nao
// existe emulador de Storage na suite (--only firestore,auth), e a rota real
// recebe o bucket de fora (adminStorage().bucket()), nunca cria um sozinha.
function bucketFalso() {
  const assinadas = [];
  return {
    name: BUCKET_NAME,
    file(path) {
      return {
        getSignedUrl: async ({ action, expires }) => {
          assinadas.push(path);
          return [`https://signed.example/${path}?action=${action}&exp=${expires}`];
        },
      };
    },
    _assinadas: assinadas,
  };
}

describe('autorizacao (rota so segue com membro — mesmo gate de /api/exame)', () => {
  test('sem Authorization -> requireUid resolve null (rota devolve 401)', async () => {
    const req = new Request('http://localhost/api/exame/imagens-urls', { method: 'POST' });
    assert.equal(await requireUid(req), null);
  });
  test('token invalido -> requireUid resolve null (rota devolve 401)', async () => {
    const req = new Request('http://localhost/api/exame/imagens-urls', {
      method: 'POST', headers: { authorization: 'Bearer token-invalido' },
    });
    assert.equal(await requireUid(req), null);
  });
  test('forasteiro sem vinculo -> resolverPapel null (rota devolve 403)', async () => {
    assert.equal(await resolverPapel(db, WS, 'uidForasteiro'), null);
  });
  test('recepcao TEM papel -> rota deixa passar (leitura de galeria, nao acao destrutiva)', async () => {
    assert.equal(await resolverPapel(db, WS, RITA), 'recepcao');
  });
});

describe('assinarImagensExame (200 com membro devolvendo o mapa)', () => {
  test('exame com imagensDicomDetalhes -> usa path do detalhe, mapa url->signed', async () => {
    const url1 = `https://storage.googleapis.com/${BUCKET_NAME}/dicom/${WS}/exDet/i1.jpg`;
    const url2 = `https://storage.googleapis.com/${BUCKET_NAME}/dicom/${WS}/exDet/i2.jpg`;
    await db.doc(`workspaces/${WS}/exames/exDet`).set({
      pacienteNome: 'P', imagensDicom: [url1, url2],
      imagensDicomDetalhes: [
        { url: url1, path: `dicom/${WS}/exDet/i1.jpg`, orthancInstanceId: 'i1' },
        { url: url2, path: `dicom/${WS}/exDet/i2.jpg`, orthancInstanceId: 'i2' },
      ],
    });
    const bucket = bucketFalso();
    const urls = await assinarImagensExame(db, bucket, WS, 'exDet');
    assert.equal(Object.keys(urls).length, 2);
    assert.match(urls[url1], /^https:\/\/signed\.example\//);
    assert.match(urls[url2], /^https:\/\/signed\.example\//);
    assert.deepEqual(bucket._assinadas.sort(), [`dicom/${WS}/exDet/i1.jpg`, `dicom/${WS}/exDet/i2.jpg`]);
  });

  // 182 exames legados: gravados antes de imagensDicomDetalhes existir — so
  // tem a URL canonica em imagensDicom. O path tem que sair da propria URL.
  test('exame SEM imagensDicomDetalhes (legado) -> deriva o path da URL canonica', async () => {
    const path = `dicom/${WS}/exLegado/foto especial.jpg`;
    const url = `https://storage.googleapis.com/${BUCKET_NAME}/${encodeURIComponent(path)}`;
    await db.doc(`workspaces/${WS}/exames/exLegado`).set({ pacienteNome: 'P', imagensDicom: [url] });
    const bucket = bucketFalso();
    const urls = await assinarImagensExame(db, bucket, WS, 'exLegado');
    assert.equal(Object.keys(urls).length, 1);
    assert.deepEqual(bucket._assinadas, [path], 'path derivado da URL bate com o path original (round-trip do encode)');
  });

  test('exame sem imagens -> {}', async () => {
    await db.doc(`workspaces/${WS}/exames/exSemImg`).set({ pacienteNome: 'P' });
    const urls = await assinarImagensExame(db, bucketFalso(), WS, 'exSemImg');
    assert.deepEqual(urls, {});
  });

  test('exame inexistente -> {} (sem excecao)', async () => {
    const urls = await assinarImagensExame(db, bucketFalso(), WS, 'naoExiste');
    assert.deepEqual(urls, {});
  });
});

describe('derivarPathDeUrl', () => {
  test('URL fora do bucket esperado -> null', () => {
    assert.equal(derivarPathDeUrl('https://storage.googleapis.com/outro-bucket/dicom/x.jpg', BUCKET_NAME), null);
  });
});

// Exclusao do exame (achado 20): apagarImagensExame lista por prefixo e
// deleta — usado por exame-admin.ts na hora de apagar o exame.
describe('apagarImagensExame (remocao na exclusao)', () => {
  test('deleta so os arquivos do prefixo do exame, devolve a contagem', async () => {
    const deletados = [];
    const arquivo = (name) => ({ name, delete: async () => { deletados.push(name); } });
    const bucket = {
      getFiles: async ({ prefix }) => [
        [arquivo(`dicom/${WS}/exApagar/i1.jpg`), arquivo(`dicom/${WS}/exApagar/i2.jpg`)]
          .filter((f) => f.name.startsWith(prefix)),
      ],
    };
    const n = await apagarImagensExame(bucket, WS, 'exApagar');
    assert.equal(n, 2);
    assert.equal(deletados.length, 2);
  });
  test('exame sem imagens no bucket -> 0, sem excecao', async () => {
    const bucket = { getFiles: async () => [[]] };
    assert.equal(await apagarImagensExame(bucket, WS, 'exVazio'), 0);
  });
});
