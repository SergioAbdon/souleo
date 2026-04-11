// ══════════════════════════════════════════════════════════════════
// SOULEO · Exportação DOCX nativa
// Gera .docx real com tabela de parâmetros + achados + conclusões
// Formatação idêntica ao PDF — Word abre perfeitamente
// ══════════════════════════════════════════════════════════════════

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, BorderStyle, WidthType, ShadingType,
} from 'docx';
import { saveAs } from 'file-saver';

type ParamRow = { cells: string[] };

type LaudoData = {
  clinicaNome: string;
  medicoNome: string;
  medicoCrm: string;
  pacienteNome: string;
  dataExame: string;
  convenio: string;
  p1: string;        // cor primária hex
  params: ParamRow[];
  achados: string[];
  conclusoes: string[];
};

// Converter hex para RGB decimal string
function hexToRgb(hex: string): string {
  return hex.replace('#', '').toUpperCase();
}

function criarCelula(texto: string, opts?: { bold?: boolean; header?: boolean; bgColor?: string; width?: number }) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };

  return new TableCell({
    borders,
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts?.bgColor ? { fill: opts.bgColor, type: ShadingType.CLEAR } : undefined,
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: texto,
            bold: opts?.bold || opts?.header,
            font: 'Arial',
            size: opts?.header ? 14 : 15, // 7pt header, 7.5pt body
            color: opts?.header ? 'FFFFFF' : '1A1A1A',
          }),
        ],
      }),
    ],
  });
}

export async function gerarDocx(data: LaudoData) {
  const cor = hexToRgb(data.p1);

  // Larguras das 8 colunas em DXA (total = 9360 para A4 com margens de 1")
  const colWidths = [2060, 750, 560, 1310, 2060, 750, 560, 1310];

  // Cabeçalho da tabela
  const headerRow = new TableRow({
    children: ['Parâmetro', 'Valor', 'Un.', 'Ref.', 'Parâmetro', 'Valor', 'Un.', 'Ref.'].map((t, i) =>
      criarCelula(t, { header: true, bgColor: cor, width: colWidths[i] })
    ),
  });

  // Linhas de dados
  const dataRows = data.params.map(row =>
    new TableRow({
      children: row.cells.map((cell, i) =>
        criarCelula(cell, { width: colWidths[i] })
      ),
    })
  );

  // Achados como parágrafos
  const achadosParagraphs = data.achados.map(
    txt => new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: txt, font: 'Arial', size: 17 })], // 8.5pt
    })
  );

  // Conclusões como lista numerada
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'conclusoes',
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // ~2cm
          },
        },
        children: [
          // Título
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: data.clinicaNome, bold: true, font: 'Arial', size: 22, color: cor }),
              new TextRun({ text: '  —  ECOCARDIOGRAMA TRANSTORÁCICO', font: 'Arial', size: 18, color: cor }),
            ],
          }),

          // Identificação
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: 'Paciente: ', bold: true, font: 'Arial', size: 17 }),
              new TextRun({ text: data.pacienteNome, font: 'Arial', size: 17 }),
              new TextRun({ text: '    Convênio: ', bold: true, font: 'Arial', size: 17 }),
              new TextRun({ text: data.convenio, font: 'Arial', size: 17 }),
              new TextRun({ text: '    Data: ', bold: true, font: 'Arial', size: 17 }),
              new TextRun({ text: data.dataExame, font: 'Arial', size: 17 }),
            ],
          }),

          // Título MEDIDAS
          new Paragraph({
            spacing: { before: 200, after: 80 },
            shading: { fill: cor, type: ShadingType.CLEAR },
            children: [new TextRun({ text: 'MEDIDAS E PARÂMETROS', bold: true, font: 'Arial', size: 16, color: 'FFFFFF' })],
          }),

          // Tabela
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: colWidths,
            rows: [headerRow, ...dataRows],
          }),

          // Referência
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: 'Valores de referência: ASE/EACVI 2015; ASE 2025.', font: 'Arial', size: 12, color: '888888', italics: true })],
          }),

          // Título COMENTÁRIOS
          new Paragraph({
            spacing: { before: 200, after: 80 },
            shading: { fill: cor, type: ShadingType.CLEAR },
            children: [new TextRun({ text: 'COMENTÁRIOS', bold: true, font: 'Arial', size: 16, color: 'FFFFFF' })],
          }),

          // Achados
          ...achadosParagraphs,

          // Título CONCLUSÃO
          new Paragraph({
            spacing: { before: 200, after: 80 },
            shading: { fill: cor, type: ShadingType.CLEAR },
            children: [new TextRun({ text: 'CONCLUSÃO', bold: true, font: 'Arial', size: 16, color: 'FFFFFF' })],
          }),

          // Conclusões numeradas
          ...data.conclusoes.map(
            txt => new Paragraph({
              numbering: { reference: 'conclusoes', level: 0 },
              spacing: { after: 40 },
              children: [new TextRun({ text: txt, font: 'Arial', size: 17, bold: true })],
            })
          ),

          // Rodapé
          new Paragraph({ spacing: { before: 400 }, children: [] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: data.medicoNome, bold: true, font: 'Arial', size: 17 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: data.medicoCrm, font: 'Arial', size: 15, color: '666666' }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  const nomeArq = `ECOTT_${data.pacienteNome.replace(/\s+/g, '_')}.docx`;
  saveAs(buffer, nomeArq);
}
