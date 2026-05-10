'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Sidebar do Laudo — Tradução fiel do preview-motor.html
// CSS original → Tailwind classe por classe
// IDs DOM idênticos ao motor (b7-b62, gls_ve, gls_vd, lars, etc.)
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, ReactNode } from 'react';
import { dataLocalHoje } from '@/lib/utils';

// Helpers para chamar funções do motor (expostas em window.*)
/* eslint-disable @typescript-eslint/no-explicit-any */
function motorCall(fn: string, ...args: any[]) {
  try { const f = (window as any)[fn]; if (typeof f === 'function') f(...args); } catch {}
}
function motorCalc() { motorCall('calc'); }
/* eslint-enable @typescript-eslint/no-explicit-any */

type Props = {
  clinicaNome: string;
  medicoNome: string;
  medicoInfo: string;
  onVoltar: () => void;
  onSalvarEmitir: () => void;
  onLimpar: () => void;
  onImportarDicom?: () => void;
  dicomLoading?: boolean;
  dicomImportado?: boolean;
  ortancAtivo?: boolean;
  emitido?: boolean;
  modoEmitido?: ReactNode;
  readOnlyIdentificacao?: boolean;
  readOnlyMotor?: boolean;
  exameOrigem?: string;
  exameCpf?: string;
  feegowPacienteId?: string | number | null;
  exameAcc?: string;
};

export default function SidebarLaudo({ clinicaNome, medicoNome, medicoInfo, onVoltar, onSalvarEmitir, onLimpar, onImportarDicom, dicomLoading, dicomImportado, ortancAtivo, emitido, modoEmitido, readOnlyIdentificacao, readOnlyMotor, exameOrigem, exameCpf, feegowPacienteId, exameAcc }: Props) {
  const [idDesbloqueado, setIdDesbloqueado] = useState(false);
  const [motorDesbloqueado, setMotorDesbloqueado] = useState(false);
  // Detectar quando readOnlyMotor muda de true→false (médico desbloqueou)
  const prevReadOnlyMotor = useRef(readOnlyMotor);
  useEffect(() => {
    if (prevReadOnlyMotor.current && !readOnlyMotor) {
      setMotorDesbloqueado(true);
    }
    prevReadOnlyMotor.current = readOnlyMotor;
  }, [readOnlyMotor]);
  const [feegowLoading, setFeegowLoading] = useState(false);
  const idBloqueado = readOnlyIdentificacao && !idDesbloqueado;
  const motorBloqueado = !!(readOnlyMotor && !motorDesbloqueado);
  const mb = motorBloqueado ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : '';

  // Bloquear/desbloquear campos do motor quando estado muda
  useEffect(() => {
    const timer = setTimeout(() => {
      const sidebar = document.getElementById('laudo-sidebar');
      if (!sidebar) return;
      const ignorar = ['nome', 'dtnasc', 'dtexame', 'convenio', 'solicitante', 'wk-mob', 'wk-esp', 'wk-cal', 'wk-sub', 'wilkins-toggle', 'diast-manual-sel'];
      const campos = sidebar.querySelectorAll('input:not(.hidden), select:not(.hidden)') as NodeListOf<HTMLInputElement | HTMLSelectElement>;
      if (motorBloqueado) {
        // Bloquear todos os campos do motor
        campos.forEach(el => {
          if (ignorar.includes(el.id)) return;
          el.disabled = true;
          el.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        });
      } else if (motorDesbloqueado) {
        // Só desbloqueia se foi explicitamente desbloqueado (evita interferir na montagem)
        campos.forEach(el => {
          if (ignorar.includes(el.id)) return;
          el.disabled = false;
          el.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [motorBloqueado, motorDesbloqueado]);

  async function handleDesbloquearId() {
    // Se veio do Feegow, buscar dados atualizados antes de desbloquear
    if (exameOrigem === 'FEEGOW' && (feegowPacienteId || exameCpf)) {
      setFeegowLoading(true);
      try {
        let url = '';
        if (feegowPacienteId) {
          url = `/api/feegow?action=paciente&id=${feegowPacienteId}`;
        } else if (exameCpf) {
          url = `/api/feegow?action=buscar_cpf&cpf=${exameCpf}`;
        }

        if (url) {
          const res = await fetch(url);
          const data = await res.json();
          const pac = feegowPacienteId ? data?.data?.content : data?.paciente;

          if (pac) {
            const nomeFeegow = (pac.nome || '').toUpperCase();
            const nomeAtual = (document.getElementById('nome') as HTMLInputElement)?.value?.toUpperCase() || '';

            if (nomeFeegow && nomeFeegow !== nomeAtual) {
              const atualizar = confirm(
                `O Feegow mostra o nome atualizado:\n\n"${nomeFeegow}"\n\nNome atual no laudo:\n"${nomeAtual}"\n\nDeseja atualizar para o nome do Feegow?`
              );
              if (atualizar) {
                const nomeEl = document.getElementById('nome') as HTMLInputElement;
                if (nomeEl) {
                  nomeEl.value = nomeFeegow;
                  nomeEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
                // Atualizar também nascimento e sexo se disponíveis
                if (pac.dtnasc || pac.nascimento) {
                  let dtnasc = pac.dtnasc || '';
                  if (!dtnasc && pac.nascimento) {
                    const p = pac.nascimento.split('-');
                    if (p.length === 3) dtnasc = `${p[2]}-${p[1]}-${p[0]}`;
                  }
                  if (dtnasc) {
                    const dtEl = document.getElementById('dtnasc') as HTMLInputElement;
                    if (dtEl) { dtEl.value = dtnasc; dtEl.dispatchEvent(new Event('input', { bubbles: true })); }
                  }
                }
                if (pac.sexo) {
                  const sexVal = pac.sexo === 'Masculino' ? 'M' : pac.sexo === 'Feminino' ? 'F' : pac.sexo;
                  const sexEl = document.getElementById('sexo') as HTMLSelectElement;
                  if (sexEl) { sexEl.value = sexVal; sexEl.dispatchEvent(new Event('change', { bubbles: true })); }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar Feegow:', e);
      }
      setFeegowLoading(false);
    }

    // Confirmar consumo de crédito
    if (confirm('Ao alterar a identificação (nome, data, convênio), será consumido 1 crédito da sua franquia ao emitir.\n\nDeseja desbloquear?')) {
      setIdDesbloqueado(true);
    }
  }
  return (
    <div id="laudo-sidebar" className="bg-white border-r border-[#E5E7EB] flex flex-col h-screen">

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

      {/* ═══ BOTÕES FIXOS NO TOPO ═══ */}
      <div className="shrink-0 border-b border-[#E5E7EB] bg-white">
        {emitido ? (
          modoEmitido
        ) : (
          <div id="modo-edicao" className="flex items-center gap-2 px-5 py-2">
            {ortancAtivo && onImportarDicom && (
              <button onClick={onImportarDicom} disabled={dicomLoading || dicomImportado}
                className={`px-3 py-2 rounded-md text-[11px] font-semibold cursor-pointer transition border-none whitespace-nowrap ${
                  dicomImportado ? 'bg-green-100 text-green-700' : 'bg-purple-600 text-white hover:bg-purple-700'
                } disabled:opacity-50`}>
                {dicomLoading ? '⏳' : dicomImportado ? '✅ Vivid' : '📡 Vivid'}
              </button>
            )}
            <button onClick={onSalvarEmitir}
              className="flex-1 py-2 rounded-md font-semibold text-white text-[11px] cursor-pointer hover:brightness-110 transition border-none bg-[#1E3A5F]">
              💾 Salvar / Emitir
            </button>
            <button onClick={onLimpar}
              className="px-3 py-2 rounded-md border border-[#E5E7EB] bg-white text-[#6B7280] text-[11px] font-medium cursor-pointer hover:bg-gray-50 transition">
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* ═══ ÁREA SCROLLÁVEL ═══ */}
      <div className="flex-1 overflow-y-auto pb-10">

      {/* ═══ IDENTIFICAÇÃO ═══ */}
      <Sec id="sec-id" title="👤 Identificação" defaultOpen single>
        {exameAcc && (
          <div className="mb-2 rounded-lg border-2 border-[#2563EB] bg-blue-50 p-2.5">
            <div className="text-[9px] text-[#2563EB] font-semibold uppercase tracking-wide mb-1">
              🏥 ACC (AccessionNumber DICOM)
            </div>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(exameAcc); }}
              title="Clique para copiar"
              className="font-mono text-base font-bold text-[#1E3A5F] tracking-wide hover:bg-blue-100 px-1.5 py-0.5 rounded transition cursor-pointer block w-full text-left"
            >
              {exameAcc}
            </button>
            <div className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">
              <strong>Em caso de cadastro manual no Vivid:</strong> copie este código e cole em
              <em> Patient → Edit → AccessionNumber</em> antes de enviar as imagens.
              Sem isso, o LEO não casa as imagens com este exame.
            </div>
          </div>
        )}
        {idBloqueado && exameOrigem === 'FEEGOW' && (
          <div className="mb-2 rounded-lg border border-purple-300 bg-purple-50 p-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-purple-600 text-sm">🔗</span>
              <span className="text-[10.5px] text-purple-700 font-semibold flex-1">Identificação sincronizada com Feegow</span>
            </div>
            <p className="text-[9.5px] text-purple-600">Para corrigir dados do paciente, edite no Feegow. O LEO atualiza automaticamente ao editar o laudo.</p>
          </div>
        )}
        {idBloqueado && exameOrigem !== 'FEEGOW' && (
          <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-amber-600 text-sm">🔒</span>
              <span className="text-[10.5px] text-amber-700 font-semibold flex-1">Campos bloqueados — laudo já emitido</span>
            </div>
            <p className="text-[9.5px] text-amber-600 mb-2">Para corrigir dados, desbloqueie os campos. Alterações consomem 1 crédito.</p>
            <button onClick={handleDesbloquearId} disabled={feegowLoading}
              className="w-full py-1.5 rounded-md bg-amber-500 text-white text-[10.5px] font-semibold hover:bg-amber-600 transition disabled:opacity-50">
              {feegowLoading ? '⏳ Consultando Feegow...' : '🔓 Desbloquear campos'}
            </button>
          </div>
        )}
        <F label={idBloqueado ? '🔒 Nome completo' : 'Nome completo'}><input type="text" id="nome" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} disabled={idBloqueado} /></F>
        <div className="grid grid-cols-2 gap-x-3 gap-y-[7px] mt-[7px]">
          <F label={idBloqueado ? '🔒 Data de nascimento' : 'Data de nascimento'}><input type="date" id="dtnasc" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} disabled={idBloqueado} /></F>
          <F label={idBloqueado ? '🔒 Data do exame' : 'Data do exame'}><input type="date" id="dtexame" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} defaultValue={dataLocalHoje()} disabled={idBloqueado} /></F>
        </div>
        <F label={idBloqueado ? '🔒 Convênio' : 'Convênio'}><input type="text" id="convenio" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} disabled={idBloqueado} /></F>
        <F label={idBloqueado ? '🔒 Médico solicitante' : 'Médico solicitante'}><input type="text" id="solicitante" className={`sf ${idBloqueado ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} disabled={idBloqueado} /></F>
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
        {/* Toggle Auto/Manual */}
        <div className="col-span-2 mb-1">
          <div className="flex items-center gap-1.5 bg-[#F3F4F6] rounded-md p-1">
            <button type="button" id="diast-btn-auto"
              onClick={() => { motorCall('setDiastModo', 'auto'); motorCalc(); }}
              className="flex-1 text-[10px] font-semibold py-1 rounded transition bg-[#1E3A5F] text-white">
              Automático
            </button>
            <button type="button" id="diast-btn-manual"
              onClick={() => { motorCall('setDiastModo', 'manual'); motorCalc(); }}
              className="flex-1 text-[10px] font-semibold py-1 rounded transition bg-transparent text-[#6B7280] hover:bg-white">
              Manual
            </button>
          </div>
          {/* Seletor manual — aparece só no modo manual (motor controla via DOM) */}
          <div id="diast-manual-panel" className="hidden mt-1.5">
            <select id="diast-manual-sel"
              onChange={e => { motorCall('setDiastManual', parseInt(e.target.value)); motorCalc(); }}
              className="sf w-full text-[10px]">
              <option value="-1">— Selecione —</option>
              <option value="0">Índices diastólicos preservados</option>
              <option value="1">Disfunção diastólica grau I (alt. relaxamento)</option>
              <option value="2">Disfunção diastólica grau II (pseudonormal)</option>
              <option value="3">Disfunção diastólica grau III (restritivo)</option>
              <option value="4">Função diastólica indeterminada</option>
              <option value="5">Avaliação limitada (arritmia)</option>
              <option value="6">Não avaliar</option>
            </select>
          </div>
        </div>
        <F label="Onda E" u="cm/s"><input type="number" id="b19" step="0.1" className="sf" /></F>
        <F label="Relação E/A"><input type="number" id="b20" step="0.01" className="sf" /></F>
        <F label="e' septal" u="cm/s"><input type="number" id="b21" step="0.1" className="sf" /></F>
        <F label="Relação E/e'"><input type="number" id="b22" step="0.1" className="sf" /></F>
        <F label="Vol. AE index" u="ml/m²"><input type="number" id="b24_diast" step="0.1" className="sf" /></F>
        <F label="LA strain" u="% · VR≥18"><input type="number" id="lars" step="0.1" className="sf" placeholder="reservoir" /></F>
        <F label="Vel. IT" u="m/s"><input type="number" id="b23" step="0.01" className="sf" /></F>
        <F label="PSAP" u="mmHg"><input type="number" id="b37" step="1" className="sf" /></F>
        <div id="alerta-psap" className="col-span-2 text-[9px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 font-medium" style={{ display: 'none' }}>
          ⚠️ Vel. IT preenchida sem PSAP — informe a PSAP estimada
        </div>
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
        <F label="Refluxo Pulmonar">
          <select id="b40p" className="sf"
            onChange={() => motorCall('refluxoPulmonar')}>
            <option value="">— Ausente —</option>
            <option value="L">L — Leve</option>
            <option value="LM">LM — Leve-Mod</option>
            <option value="M">M — Moderado</option>
            <option value="MI">MI — Mod-Imp</option>
            <option value="I">I — Importante</option>
          </select>
        </F>
        {/* Campo condicional PSMAP — aparece quando Refluxo Pulmonar preenchido */}
        <div id="field-psmap" className="col-span-2" style={{ display: 'none' }}>
          <F label="Pressão Sist. Art. Pulm." u="mmHg"><input type="number" id="psmap" step="1" className="sf" /></F>
        </div>
        <F label="Derrame Pericárdico"><RSel id="b41" /></F>
        <F label="Placas Arco Aórtico"><select id="b42" className="sf"><option value="">— Não —</option><option value="s">Sim — Calcificadas</option></select></F>
        {/* ── Estenose Mitral ── */}
        <div className="col-span-2 border-t border-dashed border-[#E5E7EB] mt-1 pt-1.5">
          <p className="text-[10.5px] font-semibold text-[#1E3A5F] mb-1">Estenose Mitral</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-[7px]">
            <F label="Grad. máx." u="mmHg"><input type="number" id="b45" step="0.1" className="sf" /></F>
            <F label="Grad. médio" u="mmHg"><input type="number" id="b46" step="0.1" className="sf" /></F>
            <F label="Área mitral" u="cm²"><input type="number" id="b47" step="0.01" className="sf" /></F>
          </div>
          {/* Wilkins Score — abaixo da área mitral */}
          <button type="button"
            onClick={() => {
              const cb = document.getElementById('wilkins-toggle') as HTMLInputElement;
              const fields = document.getElementById('wilkins-fields');
              if (cb && fields) {
                cb.checked = !cb.checked;
                fields.style.display = cb.checked ? 'grid' : 'none';
                motorCalc();
              }
            }}
            className="flex items-center gap-2 mt-2 mb-1 cursor-pointer text-[10px] font-semibold text-[#6B7280] hover:text-[#1E3A5F] transition">
            <span id="wilkins-icon">☐</span> Escore de Wilkins
          </button>
          <input type="checkbox" id="wilkins-toggle" className="hidden" />
          <div id="wilkins-fields" className="grid grid-cols-4 gap-2" style={{ display: 'none' }}>
            <div className="flex flex-col gap-[2px]">
              <label className="text-[9px] text-[#6B7280]">Mobilid.</label>
              <WkSel id="wk-mob" />
            </div>
            <div className="flex flex-col gap-[2px]">
              <label className="text-[9px] text-[#6B7280]">Espess.</label>
              <WkSel id="wk-esp" />
            </div>
            <div className="flex flex-col gap-[2px]">
              <label className="text-[9px] text-[#6B7280]">Calcif.</label>
              <WkSel id="wk-cal" />
            </div>
            <div className="flex flex-col gap-[2px]">
              <label className="text-[9px] text-[#6B7280]">Subvalv.</label>
              <WkSel id="wk-sub" />
            </div>
          </div>
          <div id="calc-wilkins" className="text-[10px] text-[#1E3A5F] font-semibold mt-1" />
        </div>
        {/* ── Estenose Aórtica ── */}
        <div className="col-span-2 border-t border-dashed border-[#E5E7EB] mt-1 pt-1.5">
          <p className="text-[10.5px] font-semibold text-[#1E3A5F] mb-1">Estenose Aórtica</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-[7px]">
            <F label="Grad. máx." u="mmHg"><input type="number" id="b50" step="0.1" className="sf" /></F>
            <F label="Grad. médio" u="mmHg"><input type="number" id="b51" step="0.1" className="sf" /></F>
            <F label="Área aórtica" u="cm²"><input type="number" id="b52" step="0.01" className="sf" /></F>
          </div>
        </div>
        {/* ── Estenose Tricúspide ── */}
        <div className="col-span-2 border-t border-dashed border-[#E5E7EB] mt-1 pt-1.5">
          <p className="text-[10.5px] font-semibold text-[#1E3A5F] mb-1">Estenose Tricúspide</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-[7px]">
            <F label="Grad. médio" u="mmHg"><input type="number" id="b46t" step="0.1" className="sf" /></F>
            <F label="Área tricúspide" u="cm²"><input type="number" id="b47t" step="0.01" className="sf" /></F>
          </div>
        </div>
        {/* ── Estenose Pulmonar ── */}
        <div className="col-span-2 border-t border-dashed border-[#E5E7EB] mt-1 pt-1.5">
          <p className="text-[10.5px] font-semibold text-[#1E3A5F] mb-1">Estenose Pulmonar</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-[7px]">
            <F label="Grad. máx." u="mmHg"><input type="number" id="b50p" step="0.1" className="sf" /></F>
          </div>
        </div>
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
        <F label="P. Anterior"><WallSel id="b56" /></F>
        <F label="P. Septal anterior"><WallSel id="b57" /></F>
        <F label="P. Septal inferior"><WallSel id="b58" /></F>
        <F label="P. Lateral"><WallSel id="b59" /></F>
        <F label="P. Inferior"><WallSel id="b60" /></F>
        <F label="P. Inferolateral"><WallSel id="b61" /></F>
        <F label="Demais paredes"><select id="b62" className="sf"><option value="NL">NL — Preservadas</option><option value="HD">Hipocin. difusa</option><option value="HR">Hipocin. demais</option><option value="AD">Acinesia difusa</option><option value="DD">Discinesia difusa</option></select></F>
      </Sec>

      {/* Hidden fields — nenhum restante */}

      </div>{/* fim área scrollável */}
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

function WkSel({ id }: { id: string }) {
  return (
    <select id={id} className="sf text-[10px]">
      <option value="0">0</option>
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
      <option value="4">4</option>
    </select>
  );
}

function WallSel({ id }: { id: string }) {
  return (
    <select id={id} className="sf">
      <option value="">— Normal —</option>
      <option value="HB">HB — Hipocin. basal</option>
      <option value="HMB">HMB — Hipocin. médiobasal</option>
      <option value="HM">HM — Hipocin. média</option>
      <option value="HMA">HMA — Hipocin. médioapical</option>
      <option value="HA">HA — Hipocin. apical</option>
      <option value="H">H — Hipocinesia difusa</option>
      <option value="AB">AB — Acinesia basal</option>
      <option value="AMB">AMB — Acinesia médiobasal</option>
      <option value="AM">AM — Acinesia média</option>
      <option value="AMA">AMA — Acinesia médioapical</option>
      <option value="AA">AA — Acinesia apical</option>
      <option value="A">A — Acinesia difusa</option>
      <option value="DB">DB — Discinesia basal</option>
      <option value="DMB">DMB — Discinesia médiobasal</option>
      <option value="DM">DM — Discinesia média</option>
      <option value="DMA">DMA — Discinesia médioapical</option>
      <option value="DA">DA — Discinesia apical</option>
      <option value="D">D — Discinesia difusa</option>
    </select>
  );
}
