'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Sidebar do Laudo — Tradução fiel do preview-motor.html
// CSS original → Tailwind classe por classe
// IDs DOM idênticos ao motor (b7-b62, gls_ve, gls_vd, lars, etc.)
// ══════════════════════════════════════════════════════════════════

import { useState, ReactNode } from 'react';
import { dataLocalHoje } from '@/lib/utils';

type Props = {
  clinicaNome: string;
  medicoNome: string;
  medicoInfo: string;
  onVoltar: () => void;
  onSalvarEmitir: () => void;
  onLimpar: () => void;
  emitido?: boolean;
  modoEmitido?: ReactNode;
  readOnlyIdentificacao?: boolean;
};

export default function SidebarLaudo({ clinicaNome, medicoNome, medicoInfo, onVoltar, onSalvarEmitir, onLimpar, emitido, modoEmitido, readOnlyIdentificacao }: Props) {
  const [idDesbloqueado, setIdDesbloqueado] = useState(false);
  const idBloqueado = readOnlyIdentificacao && !idDesbloqueado;

  function handleDesbloquearId() {
    if (confirm('Ao alterar a identificação (nome, data, convênio), será consumido 1 crédito da sua franquia ao emitir.\n\nDeseja desbloquear?')) {
      setIdDesbloqueado(true);
    }
  }
  return (
    <div id="laudo-sidebar" className="bg-white border-r border-[#E5E7EB] overflow-y-auto flex flex-col pb-10">

      {/* ═══ HEADER ═══ */}
      <div className="sticky top-0 z-10 bg-[#1E3A5F] px-5 py-3.5 shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <h1 className="text-white text-[12.5px] font-semibold tracking-wide">
            🫀 Laudo ECO · <span id="hdr-clinica">{clinicaNome}</span>
          </h1>
          <div className="flex gap-1.5">
            <button onClick={onVoltar}
              className="bg-white/[.13] border border-white/[.22] text-white text-[10.5px] px-2.5 py-1 rounded-[5px] font-medium whitespace-nowrap hover:bg-white/25 transition cursor-pointer">
              ← Voltar
            </button>
          </div>
        </div>
        <p id="hdr-subtitulo" className="text-[#93C5FD] text-[10px] mt-0.5">{medicoInfo}</p>
      </div>

      {/* ═══ IDENTIFICAÇÃO ═══ */}
      <Sec id="sec-id" title="👤 Identificação" defaultOpen single>
        {idBloqueado && (
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] text-amber-600 font-semibold">🔒 Campos bloqueados (reemissão)</span>
            <button onClick={handleDesbloquearId}
              className="text-[10px] text-[#2563EB] font-semibold hover:underline">Desbloquear</button>
          </div>
        )}
        <F label="Nome completo"><input type="text" id="nome" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-500' : ''}`} disabled={idBloqueado} /></F>
        <div className="grid grid-cols-2 gap-x-3 gap-y-[7px] mt-[7px]">
          <F label="Data de nascimento"><input type="date" id="dtnasc" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-500' : ''}`} disabled={idBloqueado} /></F>
          <F label="Data do exame"><input type="date" id="dtexame" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-500' : ''}`} defaultValue={dataLocalHoje()} disabled={idBloqueado} /></F>
        </div>
        <F label="Convênio"><input type="text" id="convenio" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-500' : ''}`} disabled={idBloqueado} /></F>
        <F label="Médico solicitante"><input type="text" id="solicitante" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-500' : ''}`} disabled={idBloqueado} /></F>
      </Sec>

      {/* ═══ MEDIDAS GERAIS ═══ */}
      <Sec id="sec-med" title="📏 Medidas Gerais" defaultOpen>
        <F label="Sexo"><select id="sexo" className="sf"><option value="">—</option><option value="M">Masculino</option><option value="F">Feminino</option></select></F>
        <F label="Ritmo"><select id="ritmo" className="sf"><option value="S">Regular</option><option value="N">Irregular</option></select></F>
        <F label="Peso" u="kg"><input type="number" id="peso" step="0.1" className="sf" /></F>
        <F label="Altura" u="cm"><input type="number" id="altura" step="0.1" className="sf" /></F>
        <F label="IMC" u="kg/m²"><C id="calc-imc" /></F>
        <F label="ASC" u="m²"><C id="calc-asc" /></F>
      </Sec>

      {/* ═══ CÂMARAS ═══ */}
      <Sec id="sec-cam" title="📐 Câmaras" defaultOpen>
        <F label="Raiz Aórtica" u="mm"><input type="number" id="b7" step="0.1" className="sf" /></F>
        <F label="Átrio Esquerdo" u="mm"><input type="number" id="b8" step="0.1" className="sf" /></F>
        <F label="DDVE" u="mm"><input type="number" id="b9" step="0.1" className="sf" /></F>
        <F label="Septo IV" u="mm"><input type="number" id="b10" step="0.1" className="sf" /></F>
        <F label="Parede Posterior" u="mm"><input type="number" id="b11" step="0.1" className="sf" /></F>
        <F label="DSVE" u="mm"><input type="number" id="b12" step="0.1" className="sf" /></F>
        <F label="Ventrículo Direito" u="mm"><input type="number" id="b13" step="0.1" className="sf" /></F>
        <F label="Aorta Ascendente" u="mm"><input type="number" id="b28" step="0.1" className="sf" /></F>
        <F label="Arco Aórtico" u="mm"><input type="number" id="b29" step="0.1" className="sf" /></F>
        <F label="AE Vol. index" u="ml/m²"><input type="number" id="b24" step="0.1" className="sf" /></F>
        <F label="AD Vol. index" u="ml/m²"><input type="number" id="b25" step="0.1" className="sf" /></F>
        <div className="col-span-2 border-t border-dashed border-[#E5E7EB] mt-1 pt-1.5 grid grid-cols-2 gap-x-3 gap-y-[7px]">
          <F label="VDF VE" u="ml"><C id="calc-vdf" /></F>
          <F label="VSF VE" u="ml"><C id="calc-vsf" /></F>
          <F label="FE Teichholz"><C id="calc-fe" /></F>
          <F label="Fração Encurt."><C id="calc-fs" /></F>
          <F label="Massa VE" u="g"><C id="calc-massa" /></F>
          <F label="Índice Massa" u="g/m²"><C id="calc-im" /></F>
          <F label="Esp. Relativa"><C id="calc-er" /></F>
          <F label="Relação Ao/AE"><C id="calc-aoae" /></F>
        </div>
      </Sec>

      {/* ═══ DIASTÓLICA ═══ */}
      <Sec id="sec-diast" title="📊 Função Diastólica" defaultOpen>
        <F label="Onda E" u="cm/s"><input type="number" id="b19" step="0.1" className="sf" /></F>
        <F label="Relação E/A"><input type="number" id="b20" step="0.01" className="sf" /></F>
        <F label="e' septal" u="cm/s"><input type="number" id="b21" step="0.1" className="sf" /></F>
        <F label="Relação E/e'"><input type="number" id="b22" step="0.1" className="sf" /></F>
        <F label="Vol. AE index" u="ml/m²"><input type="number" id="b24_diast" step="0.1" className="sf" /></F>
        <F label="LA strain" u="% · VR≥18"><input type="number" id="lars" step="0.1" className="sf" placeholder="reservoir" /></F>
        <F label="Vel. IT" u="m/s"><input type="number" id="b23" step="0.01" className="sf" /></F>
        <F label="PSAP" u="mmHg"><input type="number" id="b37" step="1" className="sf" /></F>
        <F label="≥2 sinais indiretos de HP?"><select id="b38" className="sf"><option value="">Não</option><option value="S">Sim</option></select></F>
      </Sec>

      {/* ═══ VÁLVULAS ═══ */}
      <Sec id="sec-valv" title="🔵 Válvulas">
        <F label="V. Mitral"><VSel id="b34" /></F>
        <F label="Refluxo Mitral"><RSel id="b35" /></F>
        <F label="V. Tricúspide"><VSel id="b34t" /></F>
        <F label="Refluxo Tricúspide"><RSel id="b36" /></F>
        <F label="V. Aórtica"><VSel id="b39" /></F>
        <F label="Refluxo Aórtico"><RSel id="b40" /></F>
        <F label="V. Pulmonar"><VSel id="b39p" /></F>
        <F label="Refluxo Pulmonar"><RSel id="b40p" /></F>
        <F label="Derrame Pericárdico"><RSel id="b41" /></F>
        <F label="Placas Arco Aórtico"><select id="b42" className="sf"><option value="">— Não —</option><option value="s">Sim — Calcificadas</option></select></F>
        <div className="col-span-2 border-t border-dashed border-[#E5E7EB] mt-1 pt-1.5">
          <p className="text-[10.5px] font-semibold text-[#1E3A5F] mb-1">Estenose Mitral</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-[7px]">
            <F label="Grad. máx." u="mmHg"><input type="number" id="b45" step="0.1" className="sf" /></F>
            <F label="Grad. médio" u="mmHg"><input type="number" id="b46" step="0.1" className="sf" /></F>
            <F label="Área mitral" u="cm²"><input type="number" id="b47" step="0.01" className="sf" /></F>
          </div>
          <p className="text-[10.5px] font-semibold text-[#1E3A5F] mt-2 mb-1">Estenose Aórtica</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-[7px]">
            <F label="Grad. máx." u="mmHg"><input type="number" id="b50" step="0.1" className="sf" /></F>
            <F label="Grad. médio" u="mmHg"><input type="number" id="b51" step="0.1" className="sf" /></F>
            <F label="Área aórtica" u="cm²"><input type="number" id="b52" step="0.01" className="sf" /></F>
            <F label="Grad. máx. pulm." u="mmHg"><input type="number" id="b50p" step="0.1" className="sf" /></F>
          </div>
        </div>
        {/* Wilkins hidden */}
        <input type="checkbox" id="wilkins-toggle" className="hidden" />
        <select id="wk-mob" className="hidden"><option value="0">0</option></select>
        <select id="wk-esp" className="hidden"><option value="0">0</option></select>
        <select id="wk-cal" className="hidden"><option value="0">0</option></select>
        <select id="wk-sub" className="hidden"><option value="0">0</option></select>
        <div id="calc-wilkins" className="hidden" />
      </Sec>

      {/* ═══ SISTÓLICA ═══ */}
      <Sec id="sec-sist" title="💓 Função Sistólica" defaultOpen>
        <F label="Simpson VE" u="%"><input type="number" id="b54" step="0.1" className="sf" placeholder="se disponível" /></F>
        <F label="Disfunção VD"><select id="b32" className="sf"><option value="">— Preservada —</option><option value="L">Leve</option><option value="LM">Leve-Mod</option><option value="M">Moderada</option><option value="MI">Mod-Imp</option><option value="I">Importante</option></select></F>
        <F label="TAPSE" u="mm · VR≥17"><input type="number" id="b33" step="0.1" className="sf" /></F>
        <F label="GLS VE" u="% · VR≥-18"><input type="number" id="gls_ve" step="0.1" className="sf" placeholder="ex: -21" /></F>
        <F label="GLS VD" u="% · VR≥-20"><input type="number" id="gls_vd" step="0.1" className="sf" placeholder="ex: -24" /></F>
      </Sec>

      {/* ═══ SEGMENTAR ═══ */}
      <Sec id="sec-seg" title="🗺️ Contratilidade Segmentar" collapsed>
        <div className="col-span-2 text-[10px] text-[#6B7280] italic pb-1">H=Hipocin · A=Acin · D=Discin · B=basal · M=média · A=apical</div>
        <F label="Região Apical"><select id="b55" className="sf"><option value="">— Normal —</option><option value="H">Hipocinesia</option><option value="A">Acinesia</option><option value="D">Discinesia</option></select></F>
        <F label="P. Anterior"><select id="b56" className="sf"><option value="">— Normal —</option></select></F>
        <F label="P. Septalanterior"><select id="b57" className="sf"><option value="">— Normal —</option></select></F>
        <F label="P. Septalinferior"><select id="b58" className="sf"><option value="">— Normal —</option></select></F>
        <F label="P. Lateral"><select id="b59" className="sf"><option value="">— Normal —</option></select></F>
        <F label="P. Inferior"><select id="b60" className="sf"><option value="">— Normal —</option></select></F>
        <F label="P. Inferolateral"><select id="b61" className="sf"><option value="">— Normal —</option></select></F>
        <F label="Demais paredes"><select id="b62" className="sf"><option value="NL">NL — Preservadas</option><option value="HD">Hipocin. difusa</option><option value="HR">Hipocin. demais</option><option value="AD">Acinesia difusa</option><option value="DD">Discinesia difusa</option></select></F>
      </Sec>

      {/* Hidden fields */}
      <input type="number" id="b46t" className="hidden" />
      <input type="number" id="b47t" className="hidden" />
      <input type="number" id="psmap" className="hidden" />

      {/* ═══ BOTÕES ═══ */}
      {emitido ? (
        modoEmitido
      ) : (
        <div id="modo-edicao" className="px-5 pt-3">
          <button onClick={onSalvarEmitir}
            className="w-full py-3 rounded-lg font-bold text-white text-[13px] tracking-wide cursor-pointer transition-[filter] hover:brightness-110 border-none"
            style={{ background: 'linear-gradient(135deg, #1E3A5F, #1E3A5F)' }}>
            💾 Salvar / Emitir Laudo
          </button>
          <button onClick={onLimpar}
            className="w-full mt-1.5 py-[7px] rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] text-xs font-medium cursor-pointer hover:bg-gray-50 transition">
            🗑️ Limpar formulário
          </button>
        </div>
      )}
    </div>
  );
}

// ── Componentes internos ──

function Sec({ id, title, children, defaultOpen, collapsed, single }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean; collapsed?: boolean; single?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? !collapsed);
  return (
    <div id={id} className="border-b border-[#E5E7EB]">
      <button onClick={() => setOpen(!open)}
        className="section-btn w-full flex items-center gap-2 px-5 py-[9px] bg-[#F9FAFB] text-[11px] font-semibold uppercase tracking-[0.7px] text-[#1E3A5F] cursor-pointer select-none hover:bg-[#F3F4F6] transition">
        {title}
        <span className="ml-auto text-[#6B7280] text-[15px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className={`grid ${single ? 'grid-cols-1' : 'grid-cols-2'} gap-x-3 gap-y-[7px] px-5 py-2.5`}>{children}</div>}
    </div>
  );
}

function F({ label, u, children }: { label: string; u?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <label className="text-[10.5px] text-[#6B7280] font-medium">
        {label}{u && <span className="text-[9.5px] text-[#9CA3AF] font-normal ml-[3px]">{u}</span>}
      </label>
      {children}
    </div>
  );
}

function C({ id }: { id: string }) {
  return <div id={id} className="text-[11px] text-[#1E3A5F] bg-[#EEF2F8] px-1.5 py-[3px] rounded font-mono font-medium">—</div>;
}

function VSel({ id }: { id: string }) {
  return (
    <select id={id} className="sf">
      <option value="">— Normal —</option>
      <option value="EL">EL — Espessada leve</option>
      <option value="ELM">ELM — Espessada leve-mod</option>
      <option value="EM">EM — Espessada moderada</option>
      <option value="EMI">EMI — Espessada mod-imp</option>
      <option value="EI">EI — Espessada importante</option>
      <option value="FL">FL — Fibrocalcif. leve</option>
      <option value="FLM">FLM — Fibrocalcif. leve-mod</option>
      <option value="FM">FM — Fibrocalcif. moderada</option>
      <option value="FMI">FMI — Fibrocalcif. mod-imp</option>
      <option value="FI">FI — Fibrocalcif. importante</option>
      <option value="EFL">EFL — Esp/Fibrocalcif. leve</option>
      <option value="EFLM">EFLM — Esp/Fibrocalcif. leve-mod</option>
      <option value="EFM">EFM — Esp/Fibrocalcif. moderada</option>
      <option value="EFMI">EFMI — Esp/Fibrocalcif. mod-imp</option>
      <option value="EFI">EFI — Esp/Fibrocalcif. importante</option>
    </select>
  );
}

function RSel({ id }: { id: string }) {
  return (
    <select id={id} className="sf">
      <option value="">— Ausente —</option>
      <option value="L">L — Leve</option>
      <option value="LM">LM — Leve-Mod</option>
      <option value="M">M — Moderado</option>
      <option value="MI">MI — Mod-Imp</option>
      <option value="I">I — Importante</option>
    </select>
  );
}
