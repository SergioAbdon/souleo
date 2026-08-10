// Publica um arquivo de regras do Firestore via Rules API (service account —
// nao depende de firebase login). ENSAIO por padrao; --commit publica.
// ROLLBACK: node --env-file=.env.local scripts/secao1/04-publicar-regras.mjs --file=firestore.rules.PUBLICADA.txt --commit
//   (o .PUBLICADA.txt e salvo pelo 00-regras-publicadas ANTES da troca)
import { readFileSync } from 'node:fs';
import { getCredential, PROJECT_ID } from './lib-admin.mjs';

const API = 'https://firebaserules.googleapis.com/v1';
const fileArg = process.argv.find(a => a.startsWith('--file='));
const ARQUIVO = fileArg ? fileArg.slice(7) : 'firestore.rules';
const COMMIT = process.argv.includes('--commit');

async function main() {
  const conteudo = readFileSync(ARQUIVO, 'utf8');
  const { access_token: tk } = await getCredential().getAccessToken();
  const H = { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' };

  const atual = await (await fetch(`${API}/projects/${PROJECT_ID}/releases/cloud.firestore`, { headers: H })).json();
  console.log(`No ar agora: ${atual.rulesetName}`);
  console.log(`Desde:       ${atual.updateTime}`);
  console.log(`Publicar:    ${ARQUIVO} (${conteudo.split('\n').length} linhas)`);
  if (!COMMIT) { console.log('\nENSAIO. Nada publicado. Rode com --commit para valer.'); return; }

  // 1. Criar o ruleset (o servidor valida a sintaxe aqui)
  const rs = await fetch(`${API}/projects/${PROJECT_ID}/rulesets`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: conteudo }] } }),
  });
  if (!rs.ok) throw new Error(`criar ruleset falhou: ${rs.status} ${await rs.text()}`);
  const ruleset = await rs.json();
  console.log(`\nRuleset criado: ${ruleset.name}`);

  // 2. Apontar o release do Firestore para ele (= publicar)
  const rel = await fetch(`${API}/projects/${PROJECT_ID}/releases/cloud.firestore`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({
      release: { name: `projects/${PROJECT_ID}/releases/cloud.firestore`, rulesetName: ruleset.name },
    }),
  });
  if (!rel.ok) throw new Error(`publicar falhou: ${rel.status} ${await rel.text()}`);

  // 3. Conferir lendo de volta
  const depois = await (await fetch(`${API}/projects/${PROJECT_ID}/releases/cloud.firestore`, { headers: H })).json();
  if (depois.rulesetName !== ruleset.name) throw new Error(`VERIFICACAO FALHOU: no ar esta ${depois.rulesetName}`);
  console.log(`PUBLICADO E VERIFICADO: ${depois.rulesetName} (${depois.updateTime})`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
