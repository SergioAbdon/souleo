// ══════════════════════════════════════════════════════════════════
// Validação Senna90 contra exames REAIS do Firestore (MedCardio).
// Roda: npx tsx src/senna90/valida-exames-reais.ts
//
// Objetivo: provar que o Senna90 (com a SPEC AORTA 16/05/2026 + j9
// Massa) produz laudos clinicamente sãos pros inputs reais do Sérgio.
// (script local, NÃO commitado — gitignore TOKENS / dev tool)
// ══════════════════════════════════════════════════════════════════
/* eslint-disable @typescript-eslint/no-explicit-any */
import { calcular } from './motor';
import { medidasVazias } from './smoke-test';
import type { MedidasEcoTT } from './types';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const sa = require('C:/Users/sergi/Desktop/CREDENCIAL JSON WADER FIREBASEGOOGLE/leo-sistema-laudos-firebase-adminsdk-fbsvc-7b5aa6377f.json');

admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'leo-sistema-laudos' });
const db = admin.firestore();
const wsId = 'LDRtedkanx3bUvxpdmiL';

function buildMedidas(m: Record<string, string>): MedidasEcoTT {
  const num = (id: string): number | null => {
    const s = (m[id] ?? '').trim();
    if (s === '') return null;
    const n = parseFloat(s.replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  };
  const str = (id: string): string => (m[id] ?? '').trim();
  const wk = (id: string): number => Math.max(0, Math.min(4, Math.trunc(num(id) ?? 0)));

  const base = medidasVazias();
  base.identificacao = {
    nome: str('nome'), pacienteDtnasc: str('dtnasc'), dataExame: str('dtexame'),
    convenio: str('convenio'), solicitante: str('solicitante'),
  };
  base.gerais = {
    sexo: str('sexo') as any, ritmo: str('ritmo') as any,
    peso: num('peso'), altura: num('altura'),
  };
  base.camaras = {
    raizAo: num('b7'), ae: num('b8'), ddve: num('b9'), septoIV: num('b10'),
    paredePosterior: num('b11'), dsve: num('b12'), vd: num('b13'),
    aoAscendente: num('b28'), arcoAo: num('b29'),
  };
  base.diastolica = {
    ondaE: num('b19'), relacaoEA: num('b20'), eSeptal: num('b21'),
    relacaoEEseptal: num('b22'), velocidadeIT: num('b23'), psap: num('b37'),
    volAEindex: num('b24'), volADindex: num('b25'), laStrain: num('lars'),
    sinaisHP: str('b38') === 'S' ? 'S' : '',
    modoManual: 'auto', selecaoManual: -1, textoLivre: '',
  };
  base.sistolica = {
    feSimpson: num('b54'), disfuncaoVD: str('b32') as any, tapse: num('b33'),
    glsVE: num('gls_ve'), glsVD: num('gls_vd'),
  };
  base.valvas = {
    morfMitral: str('b34') as any, refluxoMitral: str('b35') as any,
    morfTricuspide: str('b34t') as any, refluxoTricuspide: str('b36') as any,
    morfAortica: str('b39') as any, refluxoAortico: str('b40') as any,
    morfPulmonar: str('b39p') as any, refluxoPulmonar: str('b40p') as any,
    pmap: num('psmap'), derramePericard: str('b41') as any,
    placasArco: (str('b42') || '') as any,
  };
  base.estenoses = {
    gradMaxMitral: num('b45'), gradMedMitral: num('b46'), areaMitral: num('b47'),
    gradMaxAo: num('b50'), gradMedAo: num('b51'), areaAo: num('b52'),
    gradMedTric: num('b46t'), areaTric: num('b47t'), gradMaxPulm: num('b50p'),
  };
  base.wilkins = {
    ativo: str('wilkins-toggle') === 'true' || str('wilkins-toggle') === 'on',
    mobilidade: wk('wk-mob'), espessura: wk('wk-esp'),
    calcificacao: wk('wk-cal'), subvalvar: wk('wk-sub'),
  };
  base.segmentar = {
    apex: (str('b55') || '') as any, anterior: str('b56') as any,
    septalAnterior: str('b57') as any, septalInferior: str('b58') as any,
    inferior: str('b59') as any, inferolateral: str('b60') as any,
    lateral: str('b61') as any, demaisParedes: (str('b62') || 'NL') as any,
  };
  return base;
}

(async () => {
  const snap = await db.collection('workspaces').doc(wsId).collection('exames').get();
  const comMedidas = snap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((e: any) => e.medidas && Object.keys(e.medidas).length > 5);

  console.log(`Exames com medidas salvas: ${comMedidas.length} (de ${snap.size} total)\n`);
  console.log('Paciente'.padEnd(28) + 'Status'.padEnd(13) + '#Ach #Conc  1a Conclusao / ANOMALIA');
  console.log('─'.repeat(100));

  let ok = 0, vazios = 0, erros = 0;
  const aortaFrases: string[] = [];
  for (const e of comMedidas as any[]) {
    const nome = String(e.pacienteNome || '?').slice(0, 26).padEnd(28);
    const st = String(e.status || '?').padEnd(13);
    try {
      const r = calcular(buildMedidas(e.medidas));
      const nA = r.achados.length, nC = r.conclusoes.length;
      const c1 = (r.conclusoes[0] || '(vazio)').slice(0, 50);
      let flag = '';
      if (nA === 0 && nC === 0) { flag = '  ⚠️ VAZIO TOTAL'; vazios++; }
      else ok++;
      for (const a of r.achados) {
        if (/aort|aneurism|ectasia|arco/i.test(a)) aortaFrases.push(`${e.pacienteNome}: ${a}`);
      }
      console.log(`${nome}${st}${String(nA).padStart(4)} ${String(nC).padStart(4)}   ${c1}${flag}`);
    } catch (err: any) {
      erros++;
      console.log(`${nome}${st}  💥 EXCEPTION: ${err.message}`);
    }
  }

  console.log('─'.repeat(100));
  console.log(`\nRESUMO: ${ok} OK · ${vazios} vazios · ${erros} exceptions · ${comMedidas.length} total`);
  console.log('\n── Frases de AORTA geradas (spec 16/05) ──');
  aortaFrases.slice(0, 40).forEach((f) => console.log('  ' + f));
  console.log(erros === 0 && vazios === 0
    ? '\n✅ Senna90 (spec aorta + j9) rodou em TODOS os exames reais sem crash e sem vazio.'
    : '\n⚠️ Ha casos a investigar (acima).');
  process.exit(0);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
