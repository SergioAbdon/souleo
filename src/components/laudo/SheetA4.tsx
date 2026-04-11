'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Folha A4 do Laudo — Tradução fiel do preview-motor.html
// Cabeçalho 2 linhas + Identificação + Parâmetros + Comentários + Conclusão + Rodapé + Selo LEO
// IDs DOM idênticos ao motor: out-nome, out-idade, params-tbody, achados-body, conclusao-list
// ══════════════════════════════════════════════════════════════════

import { ReactNode } from 'react';

type Props = {
  p1: string;           // Cor primária do local de trabalho
  clinicaNome: string;
  clinicaSlogan: string;
  clinicaEnd: string;
  clinicaTel: string;
  sigTexto: string;
  logoB64?: string;
  sigB64?: string;
  editorAchados?: ReactNode;
  editorConclusoes?: ReactNode;
};

export default function SheetA4({ p1, clinicaNome, clinicaSlogan, clinicaEnd, clinicaTel, sigTexto, logoB64, sigB64, editorAchados, editorConclusoes }: Props) {
  const result = <>
    <div className="bg-[#D8DEE8] overflow-y-auto p-5 flex-1">
      <p className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider mb-3 text-center">
        Pré-visualização — edite os textos diretamente no laudo
      </p>

      <div id="laudo-sheet" className="bg-white mx-auto shadow-[0_4px_20px_rgba(0,0,0,.15)]"
        style={{ width: '210mm', minHeight: '297mm', padding: '30px 40px', fontSize: '9pt', fontFamily: "'IBM Plex Sans', sans-serif", color: '#1a1a1a' }}>

        {/* ═══ CABEÇALHO — 2 linhas ═══ */}
        <div className="pb-[7px] mb-2" style={{ borderBottom: `2.5px solid ${p1}` }}>
          <div className="flex items-center gap-2.5" style={{ marginBottom: '-2px' }}>
            {logoB64 && <img src={logoB64} alt="Logo" className="w-[42px] h-[42px] rounded-[5px] object-contain" />}
            <div>
              <span className="block font-bold whitespace-nowrap" style={{ fontSize: '14pt', color: p1, letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                {clinicaNome}
              </span>
              {clinicaSlogan && (
                <span className="block text-[#888]" style={{ fontSize: '7.5pt', marginTop: '1px' }}>{clinicaSlogan}</span>
              )}
            </div>
          </div>
          <div id="laudo-titulo-exame" className="font-bold text-center whitespace-nowrap" style={{ fontSize: '10.5pt', color: p1, letterSpacing: '0.3px' }}>
            ECOCARDIOGRAMA TRANSTORÁCICO
          </div>
        </div>

        {/* ═══ IDENTIFICAÇÃO ═══ */}
        <div className="rounded-[3px] mb-3" style={{ border: `1px solid ${p1}`, padding: '4px 8px' }}>
          <div className="flex gap-2 mb-[3px]">
            <IdCell label="NOME" id="out-nome" p1={p1} flex={2}>—</IdCell>
            <IdCell label="IDADE" id="out-idade" p1={p1}>—</IdCell>
            <IdCell label="DATA DE NASCIMENTO" id="out-dtnasc" p1={p1}>—</IdCell>
          </div>
          <div className="flex gap-2">
            <IdCell label="CONVÊNIO" id="out-convenio" p1={p1}>—</IdCell>
            <IdCell label="MÉDICO SOLICITANTE" id="out-solicitante" p1={p1}>—</IdCell>
            <IdCell label="DATA DO EXAME" id="out-dtexame" p1={p1}>—</IdCell>
          </div>
        </div>

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
        </div>

        {/* ═══ COMENTÁRIOS ═══ */}
        <SectionTitle p1={p1} mt>COMENTÁRIOS</SectionTitle>
        <div id="achados-body" className="border border-[#ddd] border-t-0 px-2 py-1 min-h-[50px]">
          {editorAchados}
        </div>

        {/* ═══ CONCLUSÃO ═══ */}
        <SectionTitle p1={p1} mt>CONCLUSÃO</SectionTitle>
        <div className="border border-[#ddd] border-t-0 px-2 py-1">
          {editorConclusoes || <ul id="conclusao-list" className="list-none p-0 m-0" />}
        </div>

        {/* ═══ RODAPÉ ═══ */}
        <div className="flex justify-between items-end gap-2.5 mt-4 pt-[3mm]" style={{ borderTop: `1.5px solid ${p1}` }}>
          <div className="leading-relaxed" style={{ fontSize: '6.8pt', color: '#888' }}>
            <strong style={{ color: p1, fontSize: '8pt' }}>{clinicaNome}</strong><br />
            {clinicaEnd}<br />
            {clinicaTel && <>☎ {clinicaTel}</>}
          </div>
          <div className="text-center shrink-0" style={{ fontSize: '7pt', color: '#444' }}>
            {sigB64 && <img src={sigB64} alt="Assinatura" className="block mx-auto" style={{ maxHeight: '50px', maxWidth: '180px', objectFit: 'contain', margin: '10px auto 2px' }} />}
            <div className="mx-auto mb-[3px]" style={{ borderTop: '1px solid #333', width: '180px', marginTop: sigB64 ? '2px' : '24px' }} />
            <div className="whitespace-pre-line" style={{ lineHeight: 1.4 }}>{sigTexto}</div>
          </div>
        </div>

        {/* ═══ SELO LEO ═══ */}
        <div className="text-center mt-1.5 pt-1" style={{ borderTop: '0.5px solid #e0e0e0', fontSize: '6pt', color: '#aaa', letterSpacing: '0.3px' }}>
          Laudo emitido com ajuda do <strong>LEO</strong> · www.souleo.com.br
        </div>
      </div>
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

function IdCell({ label, id, p1, children, flex }: { label: string; id: string; p1: string; children: React.ReactNode; flex?: number }) {
  return (
    <div style={{ flex: flex || 1 }}>
      <span className="block font-semibold uppercase" style={{ fontSize: '5.5pt', color: p1, letterSpacing: '0.3px' }}>{label}</span>
      <span id={id} className="block font-medium" style={{ fontSize: '9pt' }}>{children}</span>
    </div>
  );
}

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
