// ══════════════════════════════════════════════════════════════════
// LEO · Moldura A4 de TELA (S5-T10 / D6)
// O espelho do que o PDF vai imprimir (src/lib/pdf-moldura.ts): folha
// branca 210×297mm, cabeçalho do local, faixa do título, caixa de
// identificação e rodapé com assinatura + selo LEO. O corpo entra como
// `children` — o motor põe a tabela de medidas + editor, o laudo-texto
// põe o editor sozinho.
//
// ⚠️ IDs preservados do motor: #laudo-sheet, #laudo-titulo-exame e os
// #out-* da identificação (motorv8mp4.js escreve neles por getElementById,
// e `gerarPdfHtml()` LÊ os #out-* pra montar o PDF).
// ══════════════════════════════════════════════════════════════════

import { ReactNode } from 'react';

export type CampoTela = {
  label: string;
  id?: string;              // hook do motor (out-nome, out-idade, …)
  valor?: ReactNode;        // conteúdo estático (laudo-texto)
  flex?: number;
};

type Props = {
  p1: string;
  clinicaNome: string;
  clinicaSlogan?: string;
  clinicaEnd?: string;
  clinicaTel?: string;
  sigTexto: string;
  logoB64?: string;
  sigB64?: string;
  titulo: string;
  identificacao: CampoTela[][];
  children: ReactNode;
};

export default function MolduraA4({
  p1, clinicaNome, clinicaSlogan, clinicaEnd, clinicaTel, sigTexto, logoB64, sigB64,
  titulo, identificacao, children,
}: Props) {
  return (
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
          {titulo}
        </div>
      </div>

      {/* ═══ IDENTIFICAÇÃO ═══ */}
      <div className="rounded-[3px] mb-3" style={{ border: `1px solid ${p1}`, padding: '4px 8px' }}>
        {identificacao.map((linha, i) => (
          <div key={i} className={`flex gap-2${i < identificacao.length - 1 ? ' mb-[3px]' : ''}`}>
            {linha.map((c) => (
              <div key={c.label} style={{ flex: c.flex || 1 }}>
                <span className="block font-semibold uppercase" style={{ fontSize: '5.5pt', color: p1, letterSpacing: '0.3px' }}>{c.label}</span>
                <span id={c.id} className="block font-medium" style={{ fontSize: '9pt' }}>{c.valor || '—'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ═══ CORPO ═══ */}
      {children}

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
  );
}
