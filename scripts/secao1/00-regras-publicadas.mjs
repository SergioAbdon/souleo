// Somente leitura. Baixa a regra de Firestore que esta PUBLICADA agora.
// Responde a Fase 0 sem depender do console do Firebase.
import { writeFileSync } from 'node:fs';
import { getCredential, PROJECT_ID } from './lib-admin.mjs';

const API = 'https://firebaserules.googleapis.com/v1';

async function token() {
  const { access_token } = await getCredential().getAccessToken();
  return access_token;
}

async function api(caminho, tk) {
  const r = await fetch(`${API}/${caminho}`, { headers: { Authorization: `Bearer ${tk}` } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} em ${caminho}: ${await r.text()}`);
  return r.json();
}

async function main() {
  const tk = await token();
  const release = await api(`projects/${PROJECT_ID}/releases/cloud.firestore`, tk);
  console.log(`Release:  ${release.name}`);
  console.log(`Ruleset:  ${release.rulesetName}`);
  console.log(`Criado:   ${release.createTime}`);
  console.log(`Alterado: ${release.updateTime}`);

  const ruleset = await api(release.rulesetName, tk);
  const conteudo = ruleset.source.files.map(f => f.content).join('\n');

  const destino = 'firestore.rules.PUBLICADA.txt';
  writeFileSync(destino, conteudo, 'utf8');
  console.log(`\nRegra publicada salva em ${destino} (${conteudo.split('\n').length} linhas)\n`);
  console.log('=== VEREDITO RAPIDO ===');
  const frouxa = /allow\s+(read|write|read,\s*write)\s*:\s*if\s+true/.test(conteudo);
  console.log(frouxa
    ? 'MODO TESTE DETECTADO: existe "allow ...: if true". Fechadura aberta.'
    : 'Nao ha "if true" — nao esta em modo teste (mas pode estar frouxa mesmo assim).');
  console.log(`Menciona "contas": ${/\/contas\//.test(conteudo)}`);
  console.log(`Bloqueia superadmin: ${/superadmin/.test(conteudo)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
