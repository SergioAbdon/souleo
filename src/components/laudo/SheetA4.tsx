'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Folha A4 do Laudo (motor) — hoje só o CORPO do eco.
// Cabeçalho, identificação e rodapé saíram daqui pra MolduraA4 (S5-T10/D6),
// a mesma moldura que o laudo-texto usa — e espelho do PDF (pdf-moldura.ts).
// IDs DOM idênticos ao motor: out-nome, out-idade, params-tbody,
// achados-body, conclusao-list (os #out-* vivem na MolduraA4).
// ══════════════════════════════════════════════════════════════════

import { ReactNode } from 'react';
import MolduraA4 from './MolduraA4';

type Props = {
  p1: string;
  clinicaNome: string;
  clinicaSlogan: string;
  clinicaEnd: string;
  clinicaTel: string;
  sigTexto: string;
  logoB64?: string;
  sigB64?: string;
  titulo?: string;
  editorLaudo?: ReactNode;
};

export default function SheetA4({ p1, clinicaNome, clinicaSlogan, clinicaEnd, clinicaTel, sigTexto, logoB64, sigB64, titulo, editorLaudo }: Props) {
  const result = <>
    <div className="bg-[#D8DEE8] overflow-y-auto p-5 flex-1">
      <p className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider mb-3 text-center">
        Pré-visualização — edite os textos diretamente no laudo
      </p>

      <MolduraA4
        p1={p1}
        clinicaNome={clinicaNome}
        clinicaSlogan={clinicaSlogan}
        clinicaEnd={clinicaEnd}
        clinicaTel={clinicaTel}
        sigTexto={sigTexto}
        logoB64={logoB64}
        sigB64={sigB64}
        titulo={titulo || 'ECOCARDIOGRAMA TRANSTORÁCICO'}
        identificacao={[
          [
            { label: 'NOME', id: 'out-nome', flex: 2 },
            { label: 'IDADE', id: 'out-idade' },
            { label: 'DATA DE NASCIMENTO', id: 'out-dtnasc' },
          ],
          [
            { label: 'CONVÊNIO', id: 'out-convenio' },
            { label: 'MÉDICO SOLICITANTE', id: 'out-solicitante' },
            { label: 'DATA DO EXAME', id: 'out-dtexame' },
          ],
        ]}
      >
        {/* ═══ MEDIDAS E PARÂMETROS ═══ */}
        <SectionTitle p1={p1}>MEDIDAS E PARÂMETROS</SectionTitle>
        <div className="border border-[#ddd] border-t-0 p-0">
          <table className="w-full border-collapse" style={{ fontSize: '7.5pt' }}>
            <thead>
              <tr>
                <Th p1={p1} w="22%">Parâmetro</Th>
                <Th p1={p1} w="8%">Valor</Th>
                <Th p1={p1} w="6%">Unid.</Th>
                <Th p1={p1} w="16%">Referência</Th>
                <Th p1={p1} w="22%" divider>Parâmetro</Th>
                <Th p1={p1} w="8%">Valor</Th>
                <Th p1={p1} w="6%">Unid.</Th>
                <Th p1={p1} w="12%">Referência</Th>
              </tr>
            </thead>
            <tbody id="params-tbody" />
          </table>
          <div style={{ fontSize: '5.5pt', color: '#888', lineHeight: 1.4, padding: '2px 4px', borderTop: '0.5px solid #ddd' }}>
            <span>DDVE= Diâmetro diastólico do VE. DSVE= Diâmetro sistólico do VE. VE= Ventrículo esquerdo. VD= Ventrículo direito.</span><br />
            <span>Valores de referência — Raiz aórtica: WASE 2022 (seio de Valsalva, por sexo e idade). Aorta ascendente: ASE/EACVI Chamber Quantification 2015 (Tab. 14). Arco aórtico: ACR/ACRIN 6654 (NLST). Índice área transversal/altura (≥10 cm²/m): ACC/AHA 2022. Demais câmaras: ASE/EACVI 2015; ASE 2025.</span>
          </div>
        </div>

        {/* ═══ COMENTÁRIOS + CONCLUSÃO ═══ */}
        <SectionTitle p1={p1} mt>COMENTÁRIOS</SectionTitle>
        <div id="editor-laudo-container" className="border border-[#ddd] border-t-0 px-2 py-1">
          {editorLaudo}
        </div>
      </MolduraA4>
    </div>

    {/* ═══ MODAL BANCO DE FRASES ═══ */}
    <div dangerouslySetInnerHTML={{ __html: `
      <div class="modal-overlay" id="modal-banco">
        <div class="modal-box">
          <div class="modal-header" style="background:${p1}">
            <h2>📚 Banco de Frases</h2>
            <button class="modal-close" onclick="fecharBanco()">×</button>
          </div>
          <div class="modal-search">
            <input type="text" id="banco-busca" placeholder="🔍 Buscar frase..." oninput="renderBanco()"/>
          </div>
          <div class="modal-cats" id="banco-cats"></div>
          <div class="modal-list" id="banco-lista"></div>
          <div class="modal-footer">
            <div class="modal-nova-frase">
              <input type="text" id="nova-frase-txt" placeholder="Nova frase..."/>
              <select id="nova-frase-cat"></select>
              <button class="btn-nova-add" onclick="adicionarFraseBanco()">+ Salvar</button>
            </div>
            <button class="btn-inserir" id="btn-inserir-frase" onclick="inserirFraseSelecionada()" disabled>Inserir no Laudo</button>
          </div>
        </div>
      </div>
    ` }} />
  </>;

  return result;
}

// ── Componentes internos ──

function SectionTitle({ p1, children, mt }: { p1: string; children: React.ReactNode; mt?: boolean }) {
  return (
    <div className={`font-bold text-white px-2 py-[3px] ${mt ? 'mt-2' : ''}`} style={{ background: p1, fontSize: '8pt' }}>
      {children}
    </div>
  );
}

function Th({ p1, w, children, divider }: { p1: string; w: string; children: React.ReactNode; divider?: boolean }) {
  return (
    <th style={{
      background: p1, color: '#fff', padding: '2px 5px', fontWeight: 600,
      textAlign: 'left', width: w,
      borderLeft: divider ? `2px solid ${p1}` : undefined
    }}>
      {children}
    </th>
  );
}
