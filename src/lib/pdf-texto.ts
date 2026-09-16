// ══════════════════════════════════════════════════════════════════
// LEO · PDF da modalidade TEXTO (Sub-plano 3, Task 6)
// Cabeçalho do local + identificação + corpo (HTML do TipTap) +
// assinatura do médico. Desde a S5-T10 (D6) a folha é a MESMA do motor:
// este arquivo só formata os dados e entrega o corpo à moldura única
// (`montarPdfMoldura`). O shell duplicado morreu aqui.
// ══════════════════════════════════════════════════════════════════
import { montarPdfMoldura } from './pdf-moldura';
import { corSegura } from './html-escape';
import { idadeLabel, fmtData, fmtTel, fmtCep } from './paciente-fmt';

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

// `fmtTel`/`fmtCep` moraram aqui até a tríade final da S5 (ARQ-I6),
// duplicados do motor com a justificativa "page.tsx é intocável, não dá pra
// importar" — que esta mesma branch tornou falsa (page.tsx já importa
// `pdf-moldura`/`pdf-params`). Agora são de `paciente-fmt.ts`, junto com
// `fmtData`/`idadeLabel`: um dono só pra formatação de dado do local.

export function gerarPdfHtmlTexto(args: ArgsPdfTexto): string {
  const { clinicaNome, tituloExame, identificacao: id, htmlCorpo, assinatura } = args;
  // X10 follow-up: p1 alimenta cssExtra (linhas abaixo) — vai cru pro
  // <style> em montarPdfMoldura, sem escape possível ali (é CSS, não texto).
  // Não dá pra confiar que o único chamador de hoje (laudo-texto/page.tsx)
  // sempre vai validar antes de chamar — mesmo raciocínio do pdf-params.ts.
  const p1 = corSegura(args.p1);
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
