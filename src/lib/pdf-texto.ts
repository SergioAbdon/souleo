// ══════════════════════════════════════════════════════════════════
// LEO · PDF da modalidade TEXTO (Sub-plano 3, Task 6)
// Cabeçalho do local + identificação + corpo (HTML do TipTap) +
// assinatura do médico. Desde a S5-T10 (D6) a folha é a MESMA do motor:
// este arquivo só formata os dados e entrega o corpo à moldura única
// (`montarPdfMoldura`). O shell duplicado morreu aqui.
// ══════════════════════════════════════════════════════════════════
import { montarPdfMoldura } from './pdf-moldura';
import { idadeLabel, fmtData } from './paciente-fmt';

export type ArgsPdfTexto = {
  p1: string;
  clinicaNome: string;
  clinicaSlogan?: string;
  clinicaEnd?: string;
  clinicaTel?: string;
  logoB64?: string;
  tituloExame: string;
  identificacao: {
    nome: string;
    nasc?: string;
    convenio?: string;
    solicitante?: string;
    dataExame?: string;
  };
  htmlCorpo: string;
  assinatura: {
    nome: string;
    especialidade?: string;
    crm?: string;
    ufCrm?: string;
    sigB64?: string;
  };
};

// Duplicados do motor (funções privadas de src/app/laudo/[id]/page.tsx —
// intocável nesta fase, não dá pra importar). Exportados desde a S5-T10:
// a TELA do laudo-texto formata os mesmos campos que o PDF (moldura única),
// e as duas são idempotentes (aplicar 2× não muda nada).
export function fmtTel(t: string): string {
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
export function fmtCep(end: string): string {
  return end.replace(/(\d{5})(\d{3})/, '$1-$2');
}

export function gerarPdfHtmlTexto(args: ArgsPdfTexto): string {
  const { p1, clinicaNome, tituloExame, identificacao: id, htmlCorpo, assinatura } = args;
  const especialidade = (assinatura.especialidade || '').replace(/\\/g, ' e ').replace(/\//g, ' e ');
  // Idade NA DATA DO EXAME (como o motor) — nunca a de hoje: reemitir
  // um laudo antigo não pode mudar a idade impressa (S5-T10 fix / I1).
  const idade = idadeLabel(id.nasc, id.dataExame);

  // Estilos do corpo do TipTap — o resto do CSS é da moldura.
  const cssCorpo = [
    '.corpo{font-size:8.5pt;line-height:1.6;}',
    '.corpo p{margin-bottom:2px;}',
    `.corpo h2{font-size:10.5pt;color:${p1};margin:2mm 0 1.5mm;}`,
    `.corpo h3{font-size:9.5pt;color:${p1};margin:2.5mm 0 1mm;}`,
    '.corpo ul{list-style:disc;padding-left:5mm;margin-bottom:2px;}',
    '.corpo ol{list-style:decimal;padding-left:5mm;margin-bottom:2px;}',
  ].join('\n');

  return montarPdfMoldura({
    titulo: tituloExame,
    identificacao: [
      [
        { label: 'NOME', valor: id.nome || '—', flex: 2 },
        { label: 'IDADE', valor: idade || '—' },
        { label: 'DATA DE NASCIMENTO', valor: fmtData(id.nasc) },
      ],
      [
        { label: 'CONVÊNIO', valor: id.convenio || '—' },
        { label: 'MÉDICO SOLICITANTE', valor: id.solicitante || '—' },
        { label: 'DATA DO EXAME', valor: fmtData(id.dataExame) },
      ],
    ],
    cssExtra: cssCorpo,
    corpoHtml: `<div class="corpo">${htmlCorpo}</div>`,
    cfg: {
      p1,
      clinicaNome,
      clinicaSlogan: args.clinicaSlogan || '',
      clinicaEnd: fmtCep(args.clinicaEnd || ''),
      clinicaTel: args.clinicaTel ? fmtTel(args.clinicaTel) : '',
      logoB64: args.logoB64 || '',
      sigB64: assinatura.sigB64 || '',
      sigTexto: `${assinatura.nome || ''}\n${especialidade}\nCRM/${assinatura.ufCrm || ''} ${assinatura.crm || ''}`,
    },
  });
}
