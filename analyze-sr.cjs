// Walker recursivo do DICOM SR pra extrair TODAS as medidas com seus conceitos.
// Estratégia: o SR é uma árvore (ContentSequence dentro de ContentSequence).
// Cada nó tem ValueType (NUM, TEXT, CONTAINER, CODE, etc.) e ConceptNameCodeSequence.
// Pra NUM (numeric), tem MeasuredValueSequence com NumericValue + UnitsCodeSequence.

const fs = require('fs');
const path = 'C:/Users/sergi/Desktop/edwaldo-sr-dump.json';

console.log(`Lendo ${path}...`);
let raw = fs.readFileSync(path, 'utf-8');
// PowerShell Out-File -Encoding UTF8 grava BOM ﻿ no inicio — strip
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const data = JSON.parse(raw);
console.log(`OK. ${(raw.length / 1024 / 1024).toFixed(2)} MB de JSON.\n`);

// Há 2 versões no dump: tagsSimplificadas (chaves human-readable) e tagsBrutas (com offset DICOM).
// Vamos preferir tagsSimplificadas — bem mais legível.
const sr = data.tagsSimplificadas;
if (!sr) {
  console.error('Sem tagsSimplificadas no dump.');
  process.exit(1);
}

// Top-level fields que importam
console.log('=== METADADOS DO SR ===');
console.log(`PatientName:    ${sr.PatientName}`);
console.log(`PatientID:      ${sr.PatientID}`);
console.log(`StudyDate:      ${sr.StudyDate}`);
console.log(`StudyTime:      ${sr.StudyTime}`);
console.log(`Manufacturer:   ${sr.Manufacturer}`);
console.log(`ManufacturerModelName: ${sr.ManufacturerModelName}`);
console.log(`SoftwareVersions: ${sr.SoftwareVersions}`);
console.log(`SOPClassUID:    ${sr.SOPClassUID}`);
console.log(`SeriesDescription: ${sr.SeriesDescription}`);
console.log(`ContentDate:    ${sr.ContentDate}`);
console.log(`SpecificCharacterSet: ${sr.SpecificCharacterSet}`);

// Caminho típico: sr.ContentSequence (array) — entra recursivamente
const root = sr.ContentSequence;
if (!Array.isArray(root)) {
  console.log('\nSem ContentSequence top-level. Estrutura:');
  console.log(Object.keys(sr).filter(k => !['PatientName','PatientID','StudyDate','StudyTime','Manufacturer'].includes(k)).slice(0, 30).join('\n'));
  process.exit(0);
}

console.log(`\n=== CONTENT SEQUENCE TOP-LEVEL: ${root.length} items ===\n`);

// Walker recursivo
const medidas = [];
const textos = [];
const containers = [];

function getConceptName(node) {
  const cn = node.ConceptNameCodeSequence;
  if (!cn) return null;
  // pode ser array ou objeto
  const c = Array.isArray(cn) ? cn[0] : cn;
  return c?.CodeMeaning || c?.CodeValue || null;
}

function getConceptCode(node) {
  const cn = node.ConceptNameCodeSequence;
  if (!cn) return null;
  const c = Array.isArray(cn) ? cn[0] : cn;
  return {
    value: c?.CodeValue,
    scheme: c?.CodingSchemeDesignator,
    meaning: c?.CodeMeaning,
  };
}

function getNumericValue(node) {
  const mvs = node.MeasuredValueSequence;
  if (!mvs) return null;
  const m = Array.isArray(mvs) ? mvs[0] : mvs;
  const valor = m?.NumericValue;
  const ucs = m?.MeasurementUnitsCodeSequence;
  const u = Array.isArray(ucs) ? ucs[0] : ucs;
  const unidade = u?.CodeMeaning || u?.CodeValue || '';
  return { valor, unidade };
}

function walk(node, depth, path) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, depth, [...path, i]));
    return;
  }
  if (typeof node !== 'object') return;

  const vt = node.ValueType;
  const concept = getConceptName(node);
  const code = getConceptCode(node);

  if (vt === 'NUM') {
    const nv = getNumericValue(node);
    if (nv && nv.valor !== undefined) {
      medidas.push({
        depth,
        concept: concept || '(sem nome)',
        codigo: code,
        valor: nv.valor,
        unidade: nv.unidade,
      });
    }
  } else if (vt === 'TEXT' && node.TextValue) {
    textos.push({
      depth,
      concept: concept || '(sem nome)',
      texto: String(node.TextValue).slice(0, 100),
    });
  } else if (vt === 'CONTAINER' && concept) {
    containers.push({ depth, concept });
  } else if (vt === 'CODE') {
    const cv = node.ConceptCodeSequence;
    const c2 = Array.isArray(cv) ? cv[0] : cv;
    if (c2?.CodeMeaning) {
      textos.push({
        depth,
        concept: concept || '(sem nome)',
        texto: `[CODE] ${c2.CodeMeaning}`,
      });
    }
  }

  if (node.ContentSequence) {
    walk(node.ContentSequence, depth + 1, path);
  }
}

walk(root, 0, []);

console.log(`=== CONTAINERS (categorias/agrupamentos) — ${containers.length} ===`);
const containerSet = new Set();
containers.forEach(c => containerSet.add(c.concept));
[...containerSet].slice(0, 30).forEach(c => console.log(`  ${c}`));

console.log(`\n=== MEDIDAS NUMÉRICAS — ${medidas.length} ===\n`);
// Ordena por nome do conceito pra agrupar similares
medidas.sort((a, b) => a.concept.localeCompare(b.concept));
medidas.forEach((m, i) => {
  const cod = m.codigo?.value ? `[${m.codigo.scheme}:${m.codigo.value}]` : '';
  console.log(`  ${(i+1).toString().padStart(3)}. ${m.concept.padEnd(60)} = ${String(m.valor).padStart(10)} ${m.unidade}  ${cod}`);
});

console.log(`\n=== TEXTOS / OBSERVAÇÕES — ${textos.length} ===`);
textos.slice(0, 50).forEach(t => console.log(`  ${t.concept}: ${t.texto}`));
if (textos.length > 50) console.log(`  ... (+${textos.length - 50} mais)`);

// Salva o resumo
const resumo = {
  metadados: {
    patient: sr.PatientName,
    studyDate: sr.StudyDate,
    manufacturer: sr.Manufacturer,
    model: sr.ManufacturerModelName,
    software: sr.SoftwareVersions,
  },
  totais: {
    containers: containerSet.size,
    medidasNumericas: medidas.length,
    textos: textos.length,
  },
  medidas,
  textos,
};
fs.writeFileSync('C:/Users/sergi/Desktop/edwaldo-sr-resumo.json', JSON.stringify(resumo, null, 2));
console.log(`\nResumo salvo: C:/Users/sergi/Desktop/edwaldo-sr-resumo.json (${(JSON.stringify(resumo).length / 1024).toFixed(0)} KB)`);
