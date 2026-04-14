'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Worklist Completo
// Timer de espera, editar paciente, remover da fila, badges
// Botões por status conforme V7 aprovado
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { savePaciente, saveExame, listenWorklist, getExame } from '@/lib/firestore';
import { abrirPdfUrl } from '@/lib/pdfUtils';
import { dataLocalHoje } from '@/lib/utils';
import { db, auth } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { checkEmissao } from '@/lib/billing';

// v3: helper pra enviar token Firebase nas chamadas Feegow
async function feegowAuthFetch(url: string, options?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...options,
    headers: { ...options?.headers, 'Authorization': `Bearer ${token || ''}` },
  });
}

type ExameItem = Record<string, unknown> & {
  id: string; pacienteId?: string; pacienteNome?: string; pacienteDtnasc?: string;
  status?: string; tipoExame?: string; dataExame?: string; horarioChegada?: string;
  convenio?: string; solicitante?: string; sexo?: string; origem?: string;
};

const TIPOS_EXAME: Record<string, string> = {
  'eco_tt': 'Eco TT',
  'doppler_carotidas': 'Carótidas',
  'eco_te': 'Eco TE',
  'eco_stress': 'Eco Stress',
};

export default function Worklist() {
  const { workspace, profile } = useAuth();
  const router = useRouter();

  const [worklist, setWorklist] = useState<ExameItem[]>([]);
  const [busca, setBusca] = useState('');
  const [dataSel, setDataSel] = useState(dataLocalHoje);
  const [statusSel, setStatusSel] = useState<string>('todos');
  const [agora, setAgora] = useState(new Date());
  const [modalPac, setModalPac] = useState(false);
  const [editPacId, setEditPacId] = useState<string | null>(null);
  const [editExameId, setEditExameId] = useState<string | null>(null);

  // Campos modal paciente
  const [pacNome, setPacNome] = useState('');
  const [pacCpf, setPacCpf] = useState('');
  const [pacDtnasc, setPacDtnasc] = useState('');
  const [pacSexo, setPacSexo] = useState('');
  const [pacTel, setPacTel] = useState('');
  const [pacConvenio, setPacConvenio] = useState('');
  const [pacSolicitante, setPacSolicitante] = useState('');
  const [pacTipoExame, setPacTipoExame] = useState('eco_tt');
  const [pacLoading, setPacLoading] = useState(false);
  const [pacErro, setPacErro] = useState('');
  const [feegowLoading, setFeegowLoading] = useState(false);
  const [cpfBuscando, setCpfBuscando] = useState(false);
  const [cpfFeegow, setCpfFeegow] = useState(false); // indica se dados vieram do Feegow

  // Listener worklist (reage à data selecionada e ao workspace)
  const wsId = workspace?.id;
  useEffect(() => {
    if (!wsId) return;
    const unsub = listenWorklist(wsId, (items) => {
      setWorklist(items as ExameItem[]);
    }, dataSel);
    return () => unsub();
  }, [wsId, dataSel]);

  // Timer — atualiza a cada 30s
  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Calcular tempo de espera
  const calcEspera = useCallback((hora: string | undefined): { texto: string; alerta: boolean } => {
    if (!hora) return { texto: '', alerta: false };
    const [h, m] = hora.split(':').map(Number);
    const chegada = new Date();
    chegada.setHours(h, m, 0, 0);
    const diff = Math.floor((agora.getTime() - chegada.getTime()) / 60000);
    if (diff < 0) return { texto: '', alerta: false };
    if (diff < 60) return { texto: `${diff}min`, alerta: diff >= 30 };
    const horas = Math.floor(diff / 60);
    const mins = diff % 60;
    return { texto: `${horas}h${mins > 0 ? mins + 'min' : ''}`, alerta: true };
  }, [agora]);

  // ── Ações ──

  function abrirNovoPaciente() {
    setEditPacId(null); setEditExameId(null);
    setPacNome(''); setPacCpf(''); setPacDtnasc(''); setPacSexo('');
    setPacTel(''); setPacConvenio(''); setPacSolicitante(profile?.nome as string || '');
    setPacTipoExame('eco_tt'); setPacErro(''); setCpfFeegow(false);
    setModalPac(true);
  }

  async function buscarCpfFeegow(cpfDigitado: string) {
    const cpfLimpo = cpfDigitado.replace(/\D/g, '');
    if (cpfLimpo.length < 11) return;
    setCpfBuscando(true);
    try {
      const res = await feegowAuthFetch(`/api/feegow?action=buscar_cpf&cpf=${cpfLimpo}&wsId=${workspace?.id || ''}`);
      const data = await res.json();
      if (data.ok && data.encontrado && data.paciente) {
        const p = data.paciente;
        if (p.nome) setPacNome(p.nome);
        if (p.dtnasc) setPacDtnasc(p.dtnasc);
        if (p.sexo) setPacSexo(p.sexo);
        if (p.telefone) setPacTel(p.telefone);
        setCpfFeegow(true);
      }
    } catch (e) {
      console.warn('Erro ao buscar CPF no Feegow:', e);
    }
    setCpfBuscando(false);
  }

  function editarPaciente(item: ExameItem) {
    setEditPacId(item.pacienteId as string || null);
    setEditExameId(item.id);
    setPacNome(item.pacienteNome as string || '');
    setPacCpf(''); // CPF não está no exame, vem do paciente
    setPacDtnasc(item.pacienteDtnasc as string || '');
    setPacSexo(item.sexo as string || '');
    setPacTel('');
    setPacConvenio(item.convenio as string || '');
    setPacSolicitante(item.solicitante as string || '');
    setPacTipoExame(item.tipoExame as string || 'eco_tt');
    setPacErro('');
    setModalPac(true);
  }

  async function handleSalvarPaciente() {
    setPacErro('');
    if (!pacNome.trim()) { setPacErro('Nome é obrigatório.'); return; }
    if (!workspace?.id) { setPacErro('Workspace não encontrado.'); return; }
    setPacLoading(true);

    const pacData: Record<string, unknown> = {
      nome: pacNome.trim().toUpperCase(),
      cpf: pacCpf.replace(/\D/g, ''),
      dtnasc: pacDtnasc, sexo: pacSexo,
      telefone: pacTel, convenio: pacConvenio,
    };
    if (editPacId) pacData.id = editPacId;

    const pacId = await savePaciente(workspace.id, pacData);
    if (!pacId) { setPacErro('Erro ao salvar paciente.'); setPacLoading(false); return; }

    if (editExameId) {
      // Atualizando paciente de um exame existente
      await saveExame(workspace.id, {
        id: editExameId,
        pacienteNome: pacNome.trim().toUpperCase(),
        pacienteDtnasc: pacDtnasc,
        convenio: pacConvenio,
        solicitante: pacSolicitante,
        tipoExame: pacTipoExame,
        sexo: pacSexo,
      }, profile?.id || '');
    } else {
      // Novo paciente — criar exame na fila
      const agora2 = new Date();
      await saveExame(workspace.id, {
        pacienteId: pacId,
        pacienteNome: pacNome.trim().toUpperCase(),
        pacienteDtnasc: pacDtnasc,
        tipoExame: pacTipoExame,
        dataExame: dataLocalHoje(),
        horarioChegada: agora2.toTimeString().slice(0, 5),
        status: 'aguardando',
        convenio: pacConvenio,
        solicitante: pacSolicitante,
        sexo: pacSexo,
        origem: 'MANUAL',
      }, profile?.id || '');
    }

    setPacLoading(false);
    setModalPac(false);
  }

  async function removerDaFila(item: ExameItem) {
    if (!confirm(`Remover ${item.pacienteNome} da fila?`)) return;
    if (!workspace?.id) return;
    try {
      await deleteDoc(doc(db, 'workspaces', workspace.id, 'exames', item.id));
    } catch (e) { console.error('Erro ao remover:', e); }
  }

  async function importarFeegow() {
    if (!workspace?.id || !profile?.id) return;
    setFeegowLoading(true);
    try {
      const res = await feegowAuthFetch(`/api/feegow?action=importar&wsId=${workspace?.id || ''}`);
      const data = await res.json();
      if (!data.ok || !data.pacientes?.length) {
        alert(data.pacientes?.length === 0 ? 'Nenhum paciente aguardando no Feegow.' : (data.error || 'Erro ao buscar Feegow'));
        setFeegowLoading(false);
        return;
      }

      // Nomes já na worklist para evitar duplicatas
      const nomesNaFila = new Set(worklist.map(w => (w.pacienteNome || '').toUpperCase()));
      const novos = data.pacientes.filter((p: Record<string, string>) => !nomesNaFila.has(p.pacienteNome));

      if (novos.length === 0) {
        alert('Todos os pacientes do Feegow já estão na fila.');
        setFeegowLoading(false);
        return;
      }

      // Criar exames para cada paciente novo
      let criados = 0;
      for (const pac of novos) {
        const pacId = await savePaciente(workspace.id, {
          nome: pac.pacienteNome,
          cpf: pac.cpf,
          dtnasc: pac.pacienteDtnasc,
          sexo: pac.sexo,
          telefone: pac.telefone,
        });
        if (pacId) {
          await saveExame(workspace.id, {
            pacienteId: pacId,
            pacienteNome: pac.pacienteNome,
            pacienteDtnasc: pac.pacienteDtnasc,
            tipoExame: pac.tipoExame,
            dataExame: pac.dataExame,
            horarioChegada: pac.horarioChegada,
            status: 'aguardando',
            convenio: pac.convenio,
            solicitante: profile?.nome as string || '',
            sexo: pac.sexo,
            origem: 'FEEGOW',
            feegowAppointId: pac.feegowAppointId,
          }, profile.id as string);
          criados++;
        }
      }

      alert(`${criados} paciente(s) importado(s) do Feegow!`);
    } catch (e) {
      console.error('importarFeegow:', e);
      alert('Erro ao conectar com o Feegow.');
    }
    setFeegowLoading(false);
  }

  async function imprimirPdf(exameId: string) {
    if (!workspace?.id) return;
    try {
      const ex = await getExame(workspace.id, exameId);
      const dados = ex as Record<string, unknown>;
      if (dados?.pdfUrl) {
        abrirPdfUrl(dados.pdfUrl as string);
      } else {
        // Fallback: abrir o laudo normalmente
        router.push('/laudo/' + exameId);
      }
    } catch (e) {
      console.error('Erro ao abrir PDF:', e);
      router.push('/laudo/' + exameId);
    }
  }

  async function abrirLaudo(exameId: string) {
    // Verificar billing antes de abrir
    if (workspace?.id) {
      const check = await checkEmissao(workspace.id);
      if (!check.pode) {
        alert(check.motivo === 'expirado'
          ? 'Seu plano expirou. Renove para continuar emitindo laudos.'
          : check.motivo === 'sem_saldo'
          ? 'Franquia do mês esgotada. Adquira créditos extras.'
          : 'Nenhum plano ativo encontrado.');
        return;
      }
    }
    router.push('/laudo/' + exameId);
  }

  // Filtrar por status + busca texto
  const filtrada = worklist.filter(it => {
    if (statusSel !== 'todos' && it.status !== statusSel) return false;
    if (busca) {
      const nome = (it.pacienteNome as string || '').toLowerCase();
      const cpf = (it.pacienteDtnasc as string || '');
      if (!nome.includes(busca.toLowerCase()) && !cpf.includes(busca)) return false;
    }
    return true;
  });

  const statusBadge: Record<string, { cor: string; icone: string; texto: string }> = {
    aguardando: { cor: 'bg-yellow-100 text-yellow-700', icone: '⏳', texto: 'Aguardando' },
    andamento: { cor: 'bg-blue-100 text-blue-700', icone: '✏️', texto: 'Em andamento' },
    rascunho: { cor: 'bg-gray-100 text-gray-600', icone: '📝', texto: 'Rascunho' },
    emitido: { cor: 'bg-green-100 text-green-700', icone: '✅', texto: 'Emitido' },
  };

  return (
    <div>
      {/* Barra de ações */}
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F] w-40" />
        {dataSel !== dataLocalHoje() && (
          <button onClick={() => setDataSel(dataLocalHoje())}
            className="text-xs text-[#2563EB] hover:underline whitespace-nowrap">Hoje</button>
        )}
        <input type="text" placeholder="Buscar por nome..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
        <button onClick={abrirNovoPaciente}
          className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition whitespace-nowrap">
          + Paciente
        </button>
        <button onClick={abrirNovoPaciente}
          className="border border-gray-300 px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition whitespace-nowrap">
          📋 Laudo rápido
        </button>
        <button onClick={importarFeegow} disabled={feegowLoading}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition whitespace-nowrap disabled:opacity-50">
          {feegowLoading ? '⏳ Importando...' : '🔗 Feegow'}
        </button>
      </div>

      {/* Contadores clicáveis (filtro por status) */}
      <div className="flex gap-2 mb-3 text-xs">
        <button onClick={() => setStatusSel('todos')}
          className={`px-3 py-1 rounded-full font-semibold transition ${statusSel === 'todos' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          Todos ({worklist.length})
        </button>
        <button onClick={() => setStatusSel('aguardando')}
          className={`px-3 py-1 rounded-full font-semibold transition ${statusSel === 'aguardando' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'}`}>
          ⏳ Aguardando ({worklist.filter(i => i.status === 'aguardando').length})
        </button>
        <button onClick={() => setStatusSel('andamento')}
          className={`px-3 py-1 rounded-full font-semibold transition ${statusSel === 'andamento' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
          ✏️ Andamento ({worklist.filter(i => i.status === 'andamento').length})
        </button>
        <button onClick={() => setStatusSel('emitido')}
          className={`px-3 py-1 rounded-full font-semibold transition ${statusSel === 'emitido' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
          ✅ Emitidos ({worklist.filter(i => i.status === 'emitido').length})
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg overflow-hidden border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-400 uppercase bg-gray-50">
              <th className="py-2 px-3 text-left w-16">Hora</th>
              <th className="py-2 px-3 text-left">Paciente</th>
              <th className="py-2 px-3 text-left w-28">Convênio</th>
              <th className="py-2 px-3 text-center w-20">Espera</th>
              <th className="py-2 px-3 text-right w-56">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrada.length === 0 && (
              <tr><td colSpan={5} className="py-12 text-center text-gray-300">
                <p className="text-3xl mb-2">📋</p>
                <p>{statusSel !== 'todos' ? `Nenhum exame "${statusSel}" nesta data` : 'Nenhum paciente na fila'}</p>
              </td></tr>
            )}
            {filtrada.map(item => {
              const badge = statusBadge[item.status as string] || statusBadge.aguardando;
              const espera = item.status === 'aguardando' ? calcEspera(item.horarioChegada as string) : { texto: '', alerta: false };
              const origem = (item.origem as string) || 'MANUAL';

              return (
                <tr key={item.id} className={`border-b hover:bg-gray-50 transition ${espera.alerta ? 'bg-red-50/30' : ''}`}>
                  {/* Hora */}
                  <td className="py-3 px-3 text-gray-500 font-mono text-xs">{item.horarioChegada || '—'}</td>

                  {/* Paciente */}
                  <td className="py-3 px-3">
                    <div className="font-semibold text-[#1E3A5F] text-sm">{item.pacienteNome || '—'}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${badge.cor}`}>{badge.icone} {badge.texto}</span>
                      <span>{TIPOS_EXAME[item.tipoExame as string] || item.tipoExame}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${origem === 'FEEGOW' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                        {origem}
                      </span>
                    </div>
                  </td>

                  {/* Convênio */}
                  <td className="py-3 px-3 text-gray-500 text-xs">{item.convenio || '—'}</td>

                  {/* Timer espera */}
                  <td className="py-3 px-3 text-center">
                    {espera.texto && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${espera.alerta ? 'bg-red-100 text-red-600 animate-pulse' : 'text-gray-400'}`}>
                        {espera.texto}
                      </span>
                    )}
                  </td>

                  {/* Ações */}
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {/* AGUARDANDO / RASCUNHO */}
                      {(item.status === 'aguardando' || item.status === 'rascunho') && (
                        <>
                          <Btn cor="blue" onClick={() => abrirLaudo(item.id)}>📋 Laudar</Btn>
                          <Btn cor="gray" onClick={() => editarPaciente(item)}>👤 Editar</Btn>
                          <Btn cor="red" onClick={() => removerDaFila(item)}>🗑</Btn>
                        </>
                      )}

                      {/* EM ANDAMENTO */}
                      {item.status === 'andamento' && (
                        <>
                          <Btn cor="blue" onClick={() => abrirLaudo(item.id)}>▶ Continuar</Btn>
                          <Btn cor="gray" onClick={() => editarPaciente(item)}>👤 Editar</Btn>
                        </>
                      )}

                      {/* EMITIDO */}
                      {item.status === 'emitido' && (
                        <>
                          <Btn cor="green" onClick={() => router.push('/laudo/' + item.id)}>👁 Ver</Btn>
                          <Btn cor="gray" onClick={() => imprimirPdf(item.id)}>🖨️</Btn>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Paciente */}
      {modalPac && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalPac(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1E3A5F] text-white px-5 py-3 rounded-t-xl">
              <h2 className="font-bold text-sm">{editExameId ? '✏️ Editar Paciente' : '+ Novo Paciente'}</h2>
            </div>
            <div className="p-5 space-y-3">
              {pacErro && <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{pacErro}</div>}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nome completo *</label>
                <input type="text" value={pacNome} onChange={e => setPacNome(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    CPF {cpfBuscando && <span className="text-purple-500 normal-case font-normal animate-pulse">buscando...</span>}
                    {cpfFeegow && !cpfBuscando && <span className="text-green-500 normal-case font-normal">✓ Feegow</span>}
                  </label>
                  <input type="text" value={pacCpf}
                    onChange={e => { setPacCpf(e.target.value); setCpfFeegow(false); }}
                    onBlur={e => buscarCpfFeegow(e.target.value)}
                    placeholder="000.000.000-00"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F] ${cpfFeegow ? 'border-green-400 bg-green-50' : ''}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sexo</label>
                  <select value={pacSexo} onChange={e => setPacSexo(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]">
                    <option value="">—</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nascimento</label>
                  <input type="date" value={pacDtnasc} onChange={e => setPacDtnasc(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo exame</label>
                  <select value={pacTipoExame} onChange={e => setPacTipoExame(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]">
                    {Object.entries(TIPOS_EXAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Convênio</label>
                  <input type="text" value={pacConvenio} onChange={e => setPacConvenio(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Solicitante</label>
                  <input type="text" value={pacSolicitante} onChange={e => setPacSolicitante(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Telefone</label>
                <input type="text" value={pacTel} onChange={e => setPacTel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]"
                  placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-3">
              <button onClick={() => setModalPac(false)} className="px-4 py-2 text-sm text-gray-500 border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSalvarPaciente} disabled={pacLoading}
                className="px-6 py-2 text-sm bg-[#2563EB] text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                {pacLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Botão de ação ──
function Btn({ cor, onClick, children }: { cor: 'blue' | 'green' | 'gray' | 'red' | 'amber'; onClick: () => void; children: React.ReactNode }) {
  const cores = {
    blue: 'bg-[#2563EB] text-white hover:bg-blue-700',
    green: 'bg-green-100 text-green-700 hover:bg-green-200',
    gray: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    red: 'bg-red-50 text-red-500 hover:bg-red-100',
    amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100',
  };
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${cores[cor]}`}>
      {children}
    </button>
  );
}
