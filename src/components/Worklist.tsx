'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Worklist Completo
// Timer de espera, editar paciente, remover da fila, badges
// Botões por status conforme V7 aprovado
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { savePaciente, saveExame, listenWorklist, listenNaoRealizados, getExame, getPaciente } from '@/lib/firestore';
import { abrirPdfUrl } from '@/lib/pdfUtils';
import AnexarPdfModal from '@/components/agenda/AnexarPdfModal';
import { dataLocalHoje } from '@/lib/utils';
import { gerarAccessionNumber } from '@/lib/gerarAccessionNumber';
import { db, auth } from '@/lib/firebase';
import { doc, writeBatch, serverTimestamp, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { soAdministrativos } from '@/lib/campos-exame';
import { useRouter } from 'next/navigation';
import { checkEmissao } from '@/lib/billing';
import DicomGallery from '@/components/laudo/DicomGallery';
import { podeEditarLaudo, podeRemoverDaFila, podeCorrigirAdministrativo, ehMedico } from '@/lib/permissoes';
import StatusPill from '@/components/shell/StatusPill';
import { TIPOS_LAUDO_PADRAO, modalidadeDe, rotaDoLaudo, type TipoLaudo } from '@/lib/tipos-laudo';
import type { AcaoFeegow } from '@/lib/feegow-admin';

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
  feegowAppointId?: string | number; medicoUid?: string;
  acc?: string; cpf?: string; imagensDicom?: string[]; mwlStatus?: string;
  pdfUrl?: string; pdfErro?: string;
};

export default function Worklist() {
  const { workspace, profile, papel, user } = useAuth();
  const router = useRouter();

  // Quem pode nascer como AUTOR de exame: perfil medico E papel dono/medico
  // no local (MEDREC — medico de perfil com papel recepcao — nao assina aqui).
  const assinaComoAutor = ehMedico(profile) && (papel === 'dono' || papel === 'medico');

  // Catálogo de tipos de laudo (Sub-plano 3): coleção vazia ou erro de leitura
  // cai no default embutido — nunca fica sem opção no select nem sem rótulo.
  const [tipos, setTipos] = useState<TipoLaudo[]>(TIPOS_LAUDO_PADRAO);

  const [worklist, setWorklist] = useState<ExameItem[]>([]);
  const [naoRealizados, setNaoRealizados] = useState<ExameItem[]>([]);
  const [busca, setBusca] = useState('');
  const [dataSel, setDataSel] = useState(dataLocalHoje);
  const [statusSel, setStatusSel] = useState<string>('todos');
  const [agora, setAgora] = useState(new Date());
  const [modalPac, setModalPac] = useState(false);
  const [anexarPdf, setAnexarPdf] = useState<ExameItem | null>(null);
  // Correção administrativa de laudo emitido (S5-T5/D4) — recepção troca
  // convênio/solicitante sem médico, sem crédito e sem tocar no laudo.
  const [corrigirAdm, setCorrigirAdm] = useState<ExameItem | null>(null);
  const [admConvenio, setAdmConvenio] = useState('');
  const [admSolicitante, setAdmSolicitante] = useState('');
  const [admSalvando, setAdmSalvando] = useState(false);
  const [regerandoPdf, setRegerandoPdf] = useState<string | null>(null);   // exameId em voo
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

  // Guard de corrida do modal (Achado 5): cada abertura incrementa a geracao;
  // resposta atrasada de getPaciente de uma abertura anterior é descartada.
  const editReq = useRef(0);

  // CPF atual do campo, conferido na CHEGADA da resposta (Achado 6): se o
  // usuario corrigiu o CPF enquanto a busca A voava, a resposta de A e descartada.
  const pacCpfRef = useRef('');

  // Galeria DICOM aberta direto do Worklist (modo secretária — não entra no motor).
  // Adicionado em 14/05/2026: antes, clicar em "📸 Imagens" abria o laudo inteiro,
  // mas secretária/usuário não-médico não deve passar pelo motor.
  //
  // Mudança 15/05/2026 (Sergio): secretária TAMBÉM pode selecionar imagens pra
  // impressão ("INDEPENDENTE DA SELEÇÃO DO MÉDICO, ELA PODE IMPRIMIR TODA CASO
  // JULGUE NECESSARIO. POR PADRAO SELECIONA AS 8 PRIMEIRAS"). Seleção é local
  // (efêmera, não persiste no Firestore) — não interfere com a seleção do médico.
  // `exameId` entra aqui (S4-T12) só pra galeria conseguir pedir as URLs
  // assinadas — as imagens novas nascem privadas no Storage.
  const [galeria, setGaleria] = useState<{ exameId: string; imagens: string[]; paciente: string; tipo: string } | null>(null);
  const [secretariaSelecionadas, setSecretariaSelecionadas] = useState<string[]>([]);

  // Quando galeria abre, default = 8 primeiras imagens
  useEffect(() => {
    if (galeria) {
      setSecretariaSelecionadas(galeria.imagens.slice(0, 8));
    }
  }, [galeria]);

  function handleToggleSelecaoSecretaria(url: string) {
    setSecretariaSelecionadas((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }

  // Atualizar pacCpfRef sempre que pacCpf muda (Achado 6)
  useEffect(() => {
    pacCpfRef.current = pacCpf.replace(/\D/g, '');
  }, [pacCpf]);

  // Listener worklist (reage à data selecionada e ao workspace)
  const wsId = workspace?.id;

  // Catálogo de tipos de laudo — lido uma vez no mount (não precisa de
  // onSnapshot aqui; a página de edição em Clínica é quem observa live).
  useEffect(() => {
    if (!wsId) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'workspaces', wsId, 'tiposLaudo'), orderBy('ordem', 'asc')));
        const lista = snap.docs.map(d => d.data() as TipoLaudo);
        setTipos(lista.length > 0 ? lista : TIPOS_LAUDO_PADRAO);
      } catch (e) {
        console.error('carregar tiposLaudo:', e);
        setTipos(TIPOS_LAUDO_PADRAO);
      }
    })();
  }, [wsId]);

  const tiposAtivos = tipos.filter(t => t.ativo !== false).sort((a, b) => a.ordem - b.ordem);
  const tiposMap: Record<string, TipoLaudo> = {};
  for (const t of tipos) tiposMap[t.id] = t;

  useEffect(() => {
    if (!wsId) return;
    const unsub = listenWorklist(wsId, (items) => {
      setWorklist(items as ExameItem[]);
    }, dataSel);
    return () => unsub();
  }, [wsId, dataSel]);

  // Aba passiva de auditoria: so assina os 30 dias quando o filtro abre
  // (antes rodava em todo mount — leitura Firestore permanente a toa).
  useEffect(() => {
    if (!wsId || statusSel !== 'nao-realizado') return;
    const unsub = listenNaoRealizados(wsId, (items) => {
      setNaoRealizados(items as ExameItem[]);
    }, 30);
    return () => unsub();
  }, [wsId, statusSel]);

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
    editReq.current++;
    setEditPacId(null); setEditExameId(null);
    setPacNome(''); setPacCpf(''); setPacDtnasc(''); setPacSexo('');
    setPacTel(''); setPacConvenio(''); setPacSolicitante(assinaComoAutor ? (profile?.nome as string || '') : '');
    // Default = 'eco_tt' se existir no catálogo (menor surpresa); senão o primeiro tipo ativo.
    setPacTipoExame(tiposAtivos.some(t => t.id === 'eco_tt') ? 'eco_tt' : (tiposAtivos[0]?.id || 'eco_tt'));
    setPacErro(''); setCpfFeegow(false);
    setModalPac(true);
  }

  async function buscarCpfFeegow(cpfDigitado: string) {
    const cpfLimpo = cpfDigitado.replace(/\D/g, '');
    if (cpfLimpo.length < 11) return;
    setCpfBuscando(true);
    try {
      const acao: AcaoFeegow = 'buscar_cpf';
      const res = await feegowAuthFetch(`/api/feegow?action=${acao}&cpf=${cpfLimpo}&wsId=${workspace?.id || ''}`);
      const data = await res.json();
      if (pacCpfRef.current !== cpfLimpo) return; // campo ja tem OUTRO cpf
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

  async function editarPaciente(item: ExameItem) {
    const req = ++editReq.current;
    setEditPacId(item.pacienteId as string || null);
    setEditExameId(item.id);
    setPacNome(item.pacienteNome as string || '');
    // #7a: CPF ESTÁ no exame (gravado no cadastro). Antes vinha vazio
    // (comentário antigo "não está no exame" estava errado). Sem isso,
    // salvar a edição apagava o CPF do paciente — e CPF é chave do DICOM.
    setPacCpf(item.cpf as string || '');
    setPacDtnasc(item.pacienteDtnasc as string || '');
    setPacSexo(item.sexo as string || '');
    setPacTel('');
    setPacConvenio(item.convenio as string || '');
    setPacSolicitante(item.solicitante as string || '');
    setPacTipoExame(item.tipoExame as string || 'eco_tt');
    setPacErro('');
    setModalPac(true);
    // #7b: fonte verdadeira — busca a ficha do paciente p/ CPF+telefone
    // reais (telefone não fica no exame; CPF pode estar só na ficha em
    // exames antigos). Assíncrono: modal já abriu, campos se completam.
    if (item.pacienteId && workspace?.id) {
      const pac = await getPaciente(workspace.id, item.pacienteId as string) as Record<string, unknown> | null;
      if (req !== editReq.current) return; // modal ja e de OUTRO paciente
      if (pac) {
        if (pac.cpf) setPacCpf(pac.cpf as string);
        if (pac.telefone) setPacTel(pac.telefone as string);
      }
    }
  }

  async function handleSalvarPaciente() {
    setPacErro('');
    if (!pacNome.trim()) { setPacErro('Nome é obrigatório.'); return; }
    if (!workspace?.id) { setPacErro('Workspace não encontrado.'); return; }
    setPacLoading(true);

    const cpfLimpo = pacCpf.replace(/\D/g, '');
    const pacData: Record<string, unknown> = {
      nome: pacNome.trim().toUpperCase(),
      dtnasc: pacDtnasc, sexo: pacSexo,
      convenio: pacConvenio,
    };
    // #7c defensivo: NÃO regravar cpf/telefone vazios por cima do valor
    // existente. Só grava se preenchido — evita apagar CPF/telefone numa
    // edição (ex: corrigir convênio). CPF é a chave de pareamento DICOM.
    if (cpfLimpo) pacData.cpf = cpfLimpo;
    if (pacTel) pacData.telefone = pacTel;

    if (editExameId) {
      // Edicao: ficha + exame na MESMA escrita (Achado 3 — antes a ficha
      // salvava e o exame falhava, com a tela dizendo que nada gravou).
      try {
        const batch = writeBatch(db);
        const dadosFicha: Record<string, unknown> = {
          nome: pacNome.trim().toUpperCase(),
          dtnasc: pacDtnasc,
          sexo: pacSexo,
          convenio: pacConvenio,
        };
        if (cpfLimpo) dadosFicha.cpf = cpfLimpo;
        if (pacTel) dadosFicha.telefone = pacTel;
        dadosFicha.atualizadoEm = serverTimestamp();

        if (editPacId) {
          batch.update(doc(db, 'workspaces', workspace.id, 'pacientes', editPacId), dadosFicha);
        }
        batch.update(doc(db, 'workspaces', workspace.id, 'exames', editExameId), soAdministrativos({
          pacienteNome: pacNome.trim().toUpperCase(),
          pacienteDtnasc: pacDtnasc,
          convenio: pacConvenio,
          solicitante: pacSolicitante,
          tipoExame: pacTipoExame,
          sexo: pacSexo,
          // Achado 8: CPF e a chave de pareamento DICOM — propaga pro exame.
          // Vazio = "nao mexer" (mesma filosofia do #7c da ficha): esvaziar o
          // campo NAO apaga o CPF gravado.
          ...(cpfLimpo ? { cpf: cpfLimpo } : {}),
          atualizadoEm: serverTimestamp(),
        }));
        await batch.commit();
      } catch (e) {
        console.error('editar paciente:', e);
        setPacErro('Não foi possível salvar a alteração. Nada foi gravado. (Detalhe no Console — F12.)');
        setPacLoading(false);
        return;
      }
    } else {
      // Novo paciente — criar exame na fila
      const pacId = await savePaciente(workspace.id, pacData);
      if (!pacId) { setPacErro('Erro ao salvar paciente.'); setPacLoading(false); return; }

      const agora2 = new Date();
      const horaChegada = agora2.toTimeString().slice(0, 5);
      const novoExameId = await saveExame(workspace.id, soAdministrativos({
        acc: gerarAccessionNumber(agora2),
        pacienteId: pacId,
        pacienteNome: pacNome.trim().toUpperCase(),
        pacienteDtnasc: pacDtnasc,
        cpf: cpfLimpo,
        tipoExame: pacTipoExame,
        dataExame: dataLocalHoje(),
        horarioChegada: horaChegada,
        status: 'aguardando',
        convenio: pacConvenio,
        solicitante: pacSolicitante,
        medicoExecutor: assinaComoAutor ? (profile?.nome as string || '') : '',
        sexo: pacSexo,
        origem: 'MANUAL',
      }), assinaComoAutor ? (profile?.id as string || '') : '');

      if (!novoExameId) {
        setPacErro('A ficha do paciente foi salva, mas o exame NÃO entrou na fila. Tente salvar de novo. (Detalhe no Console — F12.)');
        setPacLoading(false);
        return;
      }
    }

    setPacLoading(false);
    setModalPac(false);
  }

  async function removerDaFila(item: ExameItem) {
    // Achado 8: exame FEEGOW sai da fila via cancelar (doc fica, .wl some
    // pela elegibilidade — nunca apaga, senao a reimportacao destrava e o
    // Feegow devolve o mesmo agendamento). Manual continua apagando de fato.
    const feegow = item.origem === 'FEEGOW';
    const msg = feegow
      ? `Remover ${item.pacienteNome} da fila? Sai da fila e fica registrado como cancelado (visível na ficha do paciente).`
      : `Remover ${item.pacienteNome} da fila?`;
    if (!confirm(msg)) return;
    if (!workspace?.id) return;
    try {
      const res = await feegowAuthFetch('/api/exame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: feegow ? 'cancelar' : 'apagar', wsId: workspace.id, exameId: item.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.motivo === 'sem_permissao'
          ? 'Seu perfil não pode remover exames da fila. Peça ao médico ou ao responsável.'
          : 'Não foi possível remover. Tente novamente.');
      }
    } catch (e) {
      console.error('Erro ao remover:', e);
      alert('Não foi possível remover. Verifique a conexão e tente novamente.');
    }
  }

  async function importarFeegow() {
    if (!workspace?.id) return;
    setFeegowLoading(true);
    try {
      const acao: AcaoFeegow = 'importar';
      const res = await feegowAuthFetch(`/api/feegow?wsId=${workspace.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: acao }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error === 'sem_acesso_ao_local') {
          alert('Seu usuário não tem acesso a este local.');
        } else if (data.error === 'feegow_sem_procmap') {
          alert('Nenhum procedimento mapeado. Vá em Integrações > Feegow e mapeie os procedimentos.');
        } else if (data.error === 'feegow_desligado') {
          alert('A integração Feegow está desligada. Ligue em Integrações > Feegow.');
        } else {
          alert(data.error || 'Erro ao importar do Feegow.');
        }
      } else {
        // D4: a tela conta a verdade — criados/ignorados/falhas/naoRealizados,
        // nao mais um "Nenhum paciente aguardando" que escondia descarte.
        const partes = [`${data.criados.length} importado(s)`];
        if (data.ignorados?.length) partes.push(`${data.ignorados.reduce((s: number, i: { qtd: number }) => s + i.qtd, 0)} ignorado(s) — procedimento não mapeado (ids: ${data.ignorados.map((i: { procedimentoId: number }) => i.procedimentoId).join(', ')}) — mapeie em Integrações > Feegow`);
        if (data.falhas?.length) partes.push(`${data.falhas.length} falha(s) de busca — tente de novo`);
        if (data.naoRealizados) partes.push(`${data.naoRealizados} marcado(s) não-realizado (desmarcou/faltou no Feegow)`);
        // Reimportacao: quem ja esta na fila nao e criado nem falha — sem esta
        // linha a diferenca entre total e criados ficaria muda (a msg antiga
        // "ja estao na fila" dizia isso e foi preservada aqui em numero).
        // Nao subtrai falhas (achado herdado da Task 3): total = candidatos.length
        // em montarCandidatos NUNCA inclui falhas — o `continue` do push em
        // `falhas` vem antes do push em `candidatos`. Subtrair de novo aqui
        // contava falha duas vezes e subcontava "ja estava(m) na fila".
        const jaNaFila = data.total - data.criados.length - (data.descartados || 0);
        if (jaNaFila > 0) partes.push(`${jaNaFila} já estava(m) na fila`);
        alert(partes.join('\n'));
      }
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
        // Fallback: abrir o laudo em modo leitura (PDF ainda não foi gerado)
        // — despacha pela modalidade real do tipo (X20), não sempre pro motor.
        router.push(rotaDoLaudo(exameId, dados?.tipoExame as string | undefined, tiposMap));
      }
    } catch (e) {
      console.error('Erro ao abrir PDF:', e);
      // Sem `dados` (a leitura falhou) não há tipo pra despachar — mesmo
      // fallback de sempre, equivalente ao default de rotaDoLaudo p/ tipo ausente.
      router.push('/laudo/' + exameId);
    }
  }

  // ── Editar laudo emitido (medico apenas) ──
  // Despacha por modalidade do tipo de laudo (catálogo tiposLaudo, Sub-plano 3).
  // Tipo desconhecido/sem catálogo carregado ainda → fallback 'motor' (comportamento antigo).
  function editarLaudoEmitido(item: ExameItem) {
    const tipoId = (item.tipoExame as string) || '';
    const modalidade = modalidadeDe(tiposMap[tipoId], tipoId);
    if (modalidade === 'pdf') {
      setAnexarPdf(item);
      return;
    }
    router.push(rotaDoLaudo(item.id, tipoId, tiposMap));
  }

  // ── Correção administrativa (S5-T5/D4) ──
  // Mesma rota da tela do laudo: o servidor reescreve SÓ convênio/solicitante
  // no HTML congelado da emissão e regera o PDF. Sem crédito, sem médico.
  function abrirCorrecaoAdm(item: ExameItem) {
    setAdmConvenio((item.convenio as string) || '');
    setAdmSolicitante((item.solicitante as string) || '');
    setCorrigirAdm(item);
  }

  async function salvarCorrecaoAdm() {
    if (!corrigirAdm || !workspace?.id || admSalvando) return;
    setAdmSalvando(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/corrigir-laudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ wsId: workspace.id, exameId: corrigirAdm.id, convenio: admConvenio, solicitante: admSolicitante }),
      });
      const r = await res.json();
      if (!r.ok) {
        alert(r.error === 'nao_emitido' ? 'Este laudo não está emitido.'
          : r.error === 'sem_permissao' ? 'Você não tem permissão para corrigir aqui.'
          : r.error === 'reemitido_durante_correcao'
            ? 'O médico reemitiu o laudo neste instante — a reemissão usa os dados da tela dele e pode ter desfeito esta correção. Confira o laudo novo e refaça se preciso.'
          : 'Não foi possível salvar a correção. Tente de novo.');
        if (r.error === 'reemitido_durante_correcao') setCorrigirAdm(null);
        return;
      }
      alert(r.pdfDesatualizado
        ? 'Correção salva. Este laudo é antigo: o PDF continua com o dado anterior — peça ao médico para reemitir se precisar do PDF corrigido.'
        : r.pdfErro ? 'Correção salva. O PDF falhou ao ser regerado — tente imprimir de novo mais tarde.'
        : 'Correção salva — PDF atualizado.');
      setCorrigirAdm(null);
    } catch {
      alert('Erro de conexão ao salvar a correção.');
    } finally {
      setAdmSalvando(false);
    }
  }

  // ── Regerar PDF (Task 6, P4/E4): a emissao falhou DEPOIS de cobrar a
  // franquia (laudo `emitido` sem `pdfUrl`, marcado com `pdfErro`). Reusa a
  // MESMA rota da correcao administrativa, com o convenio/solicitante ATUAIS
  // do exame (sem mudar nada) — regera o PDF a partir do snapshot congelado
  // na emissao, sem transacao de billing e sem 2a franquia.
  async function regerarPdf(item: ExameItem) {
    if (!workspace?.id || regerandoPdf) return;
    setRegerandoPdf(item.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/corrigir-laudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({
          wsId: workspace.id, exameId: item.id,
          convenio: item.convenio || '', solicitante: item.solicitante || '',
        }),
      });
      const r = await res.json();
      if (!r.ok) {
        // Mesmo mapa motivo→mensagem do salvarCorrecaoAdm (linha ~474) — um
        // erro de permissao/corrida NAO e "sem snapshot", e mandar reemitir
        // nesses casos cobraria uma 2a franquia por engano (achado do reviewer).
        alert(r.error === 'nao_emitido' ? 'Este laudo não está emitido.'
          : r.error === 'sem_permissao' ? 'Você não tem permissão para regerar aqui.'
          : r.error === 'reemitido_durante_correcao'
            ? 'O médico reemitiu o laudo neste instante — a reemissão usa os dados da tela dele e pode ter desfeito esta correção. Confira o laudo novo e refaça se preciso.'
          : 'Snapshot indisponível — reemita o laudo.');
        return;
      }
      // Snapshot ausente (emitido antigo) ou falha nova do Puppeteer: honesto
      // — nao ha o que recuperar aqui, so reemitir de novo (2a franquia).
      if (r.pdfDesatualizado || r.pdfErro) {
        alert('Snapshot indisponível — reemita o laudo.');
        return;
      }
      alert('PDF regerado com sucesso.');
    } catch {
      alert('Erro de conexão ao regerar o PDF.');
    } finally {
      setRegerandoPdf(null);
    }
  }

  async function checarBillingOuAvisar(): Promise<boolean> {
    if (!workspace?.id) return true;
    const check = await checkEmissao(workspace.id);
    if (check.pode) return true;
    alert(check.motivo === 'expirado'
      ? 'Seu plano expirou. Renove para continuar emitindo laudos.'
      : check.motivo === 'sem_saldo'
      ? 'Franquia do mês esgotada. Adquira créditos extras.'
      : 'Nenhum plano ativo encontrado.');
    return false;
  }

  // Dispatch por modalidade do tipo de laudo (catálogo tiposLaudo, Sub-plano 3).
  // Tipo desconhecido/sem catálogo carregado ainda → fallback 'motor' (comportamento antigo).
  async function abrirLaudo(item: ExameItem) {
    const tipoId = (item.tipoExame as string) || '';
    const modalidade = modalidadeDe(tiposMap[tipoId], tipoId);
    if (modalidade === 'pdf') {
      // Ato do médico (mesma matriz do Laudar) — a rota /api/emitir também
      // recusa 403 nao_medico, isso aqui só evita a recepção abrir o modal à toa.
      if (!assinaComoAutor) {
        alert('Anexar o PDF é ato do médico.');
        return;
      }
      setAnexarPdf(item);
      return;
    }
    if (!(await checarBillingOuAvisar())) return;
    router.push(rotaDoLaudo(item.id, tipoId, tiposMap));
  }

  // Filtrar por status + busca texto
  // cancelado some da fila (revisão Task 4, item 2): o confirm() de remover
  // avisa que sai da fila — sem este filtro a linha continuava aparecendo
  // (só perdia os botões de ação) e o operador achava que nada aconteceu.
  // nao-realizado CONTINUA visível (esmaecido) — é auditoria, não fila.
  const worklistVisivel = worklist.filter(it => it.status !== 'cancelado');
  const fonteDados = statusSel === 'nao-realizado' ? naoRealizados : worklistVisivel;
  const filtrada = fonteDados.filter(it => {
    if (statusSel !== 'todos' && statusSel !== 'nao-realizado' && it.status !== statusSel) return false;
    if (busca) {
      const nome = (it.pacienteNome as string || '').toLowerCase();
      const cpf = String(it.cpf ?? '');
      const buscaDigitos = busca.replace(/\D/g, '');
      if (!nome.includes(busca.toLowerCase()) && !(buscaDigitos && cpf.includes(buscaDigitos))) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Barra de ações */}
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1 w-40" />
        {dataSel !== dataLocalHoje() && (
          <button onClick={() => setDataSel(dataLocalHoje())}
            className="text-xs text-p2 hover:underline whitespace-nowrap">Hoje</button>
        )}
        <input type="text" placeholder="Buscar por nome ou CPF..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
        <button onClick={abrirNovoPaciente}
          className="bg-p2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition whitespace-nowrap">
          + Paciente
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
          Todos ({worklistVisivel.length})
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
        <button onClick={() => setStatusSel('nao-realizado')}
          title="Exames não realizados nos últimos 30 dias (auditoria de no-show)"
          className={`px-3 py-1 rounded-full font-semibold transition ${statusSel === 'nao-realizado' ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          🚫 Não realizados{statusSel === 'nao-realizado' ? ` (${naoRealizados.length})` : ''}
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-400 uppercase bg-gray-50">
              <th className="py-2 px-3 text-left w-16">Hora</th>
              <th className="py-2 px-3 text-left w-36">ACC</th>
              <th className="py-2 px-3 text-left">Paciente</th>
              <th className="py-2 px-3 text-left w-28">Convênio</th>
              <th className="py-2 px-3 text-center w-20">Espera</th>
              <th className="py-2 px-3 text-right w-56">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrada.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-gray-300">
                <p className="text-3xl mb-2">📋</p>
                <p>{statusSel !== 'todos' ? `Nenhum exame "${statusSel}" nesta data` : 'Nenhum paciente na fila'}</p>
              </td></tr>
            )}
            {filtrada.map(item => {
              const espera = item.status === 'aguardando' && dataSel === dataLocalHoje()
                ? calcEspera(item.horarioChegada as string)
                : { texto: '', alerta: false };
              const origem = (item.origem as string) || 'MANUAL';

              const isNaoRealizado = item.status === 'nao-realizado';
              return (
                <tr key={item.id} className={`border-b hover:bg-gray-50 transition ${espera.alerta ? 'bg-red-50/30' : ''} ${isNaoRealizado ? 'opacity-70' : ''}`}>
                  {/* Hora (e data se não-realizado) */}
                  <td className="py-3 px-3 text-gray-500 font-mono text-xs">
                    {isNaoRealizado && item.dataExame
                      ? <><div className="text-[10px] text-gray-400">{(item.dataExame as string).split('-').reverse().slice(0, 2).join('/')}</div><div>{item.horarioChegada || '—'}</div></>
                      : (item.horarioChegada || '—')}
                  </td>

                  {/* ACC — clique pra copiar (transcrição manual no Vivid) */}
                  <td className="py-3 px-3">
                    {item.acc ? (
                      <button
                        onClick={() => { navigator.clipboard.writeText(item.acc as string); }}
                        title="Clique para copiar (transcrição manual no Vivid)"
                        className="font-mono text-[13px] font-bold text-p1 hover:bg-blue-50 px-1.5 py-0.5 rounded transition cursor-pointer"
                      >
                        {item.acc as string}
                      </button>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Paciente */}
                  <td className="py-3 px-3">
                    {item.pacienteId ? (
                      <button
                        onClick={() => router.push(`/pacientes/${item.pacienteId}`)}
                        className="font-semibold text-p1 text-sm hover:underline cursor-pointer bg-transparent border-0 p-0 text-left"
                      >
                        {item.pacienteNome || '—'}
                      </button>
                    ) : (
                      <div className="font-semibold text-p1 text-sm">{item.pacienteNome || '—'}</div>
                    )}
                    <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                      <StatusPill status={item.status as string} />
                      <span>{tiposMap[item.tipoExame as string]?.nome || item.tipoExame}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${origem === 'FEEGOW' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                        {origem}
                      </span>
                      {item.mwlStatus === 'falhou' && (
                        <span title="Worklist não chegou ao aparelho — digite o ACC manualmente no Vivid"
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-600">
                          📡 SEM MWL
                        </span>
                      )}
                      {/* Cofre do emitido (S4-T15 fix X1): o Wader recebeu estudo
                          novo num exame JÁ EMITIDO — foi tudo pros campos-sombra
                          e alguém tem que revisar. Sem esta pílula a fila de
                          revisão existia só no Firestore. */}
                      {item.dicomAtualizacaoPendente === true && (
                        <span title="Chegou imagem/medida nova depois da emissão — revise antes de corrigir o laudo"
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">
                          📥 DICOM NOVO — REVISAR
                        </span>
                      )}
                      {/* Ingestão falhou: o erro ficava só no log do Wader e na
                          tela de conferência. A recepção vê aqui e reenvia. */}
                      {typeof item.dicomUltimoErro === 'string' && item.dicomUltimoErro.trim() !== '' && (
                        <span title={item.dicomUltimoErro as string}
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-600">
                          ⚠️ IMAGEM FALHOU
                        </span>
                      )}
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
                      {(() => {
                        // Normalização defensiva de status (fix 15/05/2026):
                        // EDWALDO e CARMEN ficaram com status legado
                        // 'imagens-recebidas' (decisão antiga de 11/05, removida
                        // do tipo em 13/05 quando passou a usar 'andamento').
                        // A UI só tinha bloco pra aguardando/rascunho/andamento/
                        // emitido — exames com status legado viravam "fantasma"
                        // (sem botão de ação, só 📸 Imagens).
                        //
                        // Mapeia qualquer status fora do esperado pra um dos
                        // 3 grupos de ação. 'imagens-recebidas'/'erro-imagens'
                        // (legados do pipeline DICOM) → andamento.
                        const st = item.status as string;
                        // cancelado/nao-realizado: terminal, sem acao (achado 8 — a
                        // Task 4 passou a produzir os dois no MESMO dia — reconciliacao
                        // via Feegow e remover-da-fila FEEGOW — e sem este corte eles
                        // caiam no braco 'andamento' e ganhavam "▶ Continuar" enganoso).
                        if (st === 'cancelado' || st === 'nao-realizado') return null;
                        let grupo: 'aguardando' | 'andamento' | 'emitido';
                        if (st === 'emitido') grupo = 'emitido';
                        else if (st === 'aguardando' || st === 'rascunho') grupo = 'aguardando';
                        else grupo = 'andamento'; // andamento, imagens-recebidas, erro-imagens, e qualquer status inesperado

                        if (grupo === 'aguardando') {
                          return (
                            <>
                              <Btn cor="blue" onClick={() => abrirLaudo(item)}>📋 Laudar</Btn>
                              <Btn cor="gray" onClick={() => editarPaciente(item)}>👤 Editar</Btn>
                              {podeRemoverDaFila(papel) && (
                                <Btn cor="red" onClick={() => removerDaFila(item)}>🗑</Btn>
                              )}
                            </>
                          );
                        }
                        if (grupo === 'andamento') {
                          return (
                            <>
                              <Btn cor="blue" onClick={() => abrirLaudo(item)}>▶ Continuar</Btn>
                              <Btn cor="gray" onClick={() => editarPaciente(item)}>👤 Editar</Btn>
                            </>
                          );
                        }
                        // emitido
                        return (
                          <>
                            {podeEditarLaudo(profile, item, user?.uid || '') && (
                              <Btn cor="amber" onClick={() => editarLaudoEmitido(item)}>✏️ Editar</Btn>
                            )}
                            {/* Correção administrativa (S5-T5/D4): convênio errado
                                é erro de recepção — ela corrige sem chamar o médico,
                                sem crédito e sem encostar no corpo do laudo. */}
                            {podeCorrigirAdministrativo(papel) && (
                              <Btn cor="gray" onClick={() => abrirCorrecaoAdm(item)}>✏️ convênio/solicitante</Btn>
                            )}
                            {/* P4/E4 (Task 6): laudo emitido (franquia ja cobrada) sem
                                PDF — a rota marcou pdfErro no catch. Regenera do
                                snapshot pela mesma rota da correcao, sem 2a franquia.
                                Gate: dono/recepcao (podeCorrigirAdministrativo) OU o
                                medico-autor — mesma dupla que a rota /api/corrigir-laudo
                                autoriza no servidor (podeCorrigir); sem o 2o braco o
                                medico que pagou a franquia nao via o proprio botao. */}
                            {(podeCorrigirAdministrativo(papel) || item.medicoUid === user?.uid) && item.pdfErro && !item.pdfUrl && (
                              <Btn cor="red" onClick={() => regerarPdf(item)}>
                                {regerandoPdf === item.id ? 'Regerando...' : '🔁 Regerar PDF'}
                              </Btn>
                            )}
                            <Btn cor="gray" onClick={() => imprimirPdf(item.id)}>🖨️ Imprimir</Btn>
                          </>
                        );
                      })()}

                      {/* Botão "📸 Imagens" — abre galeria diretamente no Worklist (modal),
                          sem entrar no motor do laudo. Importante pro modo secretária:
                          secretária pode revisar imagens do exame sem precisar abrir
                          o laudo (que tem o motor de medidas etc).
                          Decisão 14/05/2026 (substitui 13/05): antes chamava abrirLaudo;
                          agora abre <DicomGallery /> direto no contexto do Worklist. */}
                      {Array.isArray(item.imagensDicom) && (item.imagensDicom as unknown[]).length > 0 && (
                        <Btn cor="cyan" onClick={() => setGaleria({
                          exameId: item.id as string,
                          imagens: item.imagensDicom as string[],
                          paciente: (item.pacienteNome as string) || '',
                          tipo: tiposMap[(item.tipoExame as string) || '']?.nome || (item.tipoExame as string) || '',
                        })}>
                          📸 Imagens ({(item.imagensDicom as unknown[]).length})
                        </Btn>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>

      {/* Modal Correção administrativa (S5-T5/D4) — só os 2 campos que a
          recepção pode mexer em laudo emitido. Nome/CPF/datas continuam no
          fluxo clínico (Editar → reemitir). */}
      {corrigirAdm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !admSalvando && setCorrigirAdm(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-p1 text-white px-5 py-3 rounded-t-xl">
              <h2 className="font-bold text-sm">✏️ Corrigir convênio / solicitante</h2>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">
                {(corrigirAdm.pacienteNome as string) || '—'} · laudo emitido. O texto do laudo não muda — só estes dois campos, no PDF e na cobrança.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Convênio</label>
                <input type="text" value={admConvenio} onChange={e => setAdmConvenio(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Médico solicitante</label>
                <input type="text" value={admSolicitante} onChange={e => setAdmSolicitante(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button onClick={() => setCorrigirAdm(null)} disabled={admSalvando}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={salvarCorrecaoAdm} disabled={admSalvando}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-p2 text-white hover:bg-blue-700 disabled:opacity-50">
                {admSalvando ? 'Salvando...' : 'Salvar correção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Paciente */}
      {modalPac && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalPac(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="bg-p1 text-white px-5 py-3 rounded-t-xl">
              <h2 className="font-bold text-sm">{editExameId ? '✏️ Editar Paciente' : '+ Novo Paciente'}</h2>
            </div>
            <div className="p-5 space-y-3">
              {pacErro && <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{pacErro}</div>}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nome completo *</label>
                <input type="text" value={pacNome} onChange={e => setPacNome(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
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
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1 ${cpfFeegow ? 'border-green-400 bg-green-50' : ''}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sexo</label>
                  <select value={pacSexo} onChange={e => setPacSexo(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1">
                    <option value="">—</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nascimento</label>
                  <input type="date" value={pacDtnasc} onChange={e => setPacDtnasc(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo exame</label>
                  <select value={pacTipoExame} onChange={e => setPacTipoExame(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1">
                    {tiposAtivos.map(t => <option key={t.id} value={t.id}>{t.icone} {t.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Convênio</label>
                  <input type="text" value={pacConvenio} onChange={e => setPacConvenio(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Solicitante</label>
                  <input type="text" value={pacSolicitante} onChange={e => setPacSolicitante(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Telefone</label>
                <input type="text" value={pacTel} onChange={e => setPacTel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1"
                  placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-3">
              <button onClick={() => setModalPac(false)} className="px-4 py-2 text-sm text-gray-500 border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSalvarPaciente} disabled={pacLoading}
                className="px-6 py-2 text-sm bg-p2 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                {pacLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Galeria DICOM aberta direto do Worklist (sem entrar no motor do laudo).
          Modo secretária pode revisar E selecionar imagens pra imprimir (decisão
          15/05/2026). Seleção dela é local (não persiste) — independente da do médico. */}
      <DicomGallery
        open={galeria !== null}
        onClose={() => setGaleria(null)}
        imagens={galeria?.imagens || []}
        wsId={wsId}
        exameId={galeria?.exameId}
        pacienteNome={galeria?.paciente}
        tipoExame={galeria?.tipo}
        permitirSelecao
        selecionadas={secretariaSelecionadas}
        onToggleSelecao={handleToggleSelecaoSecretaria}
      />

      {/* Anexar PDF (modalidade 'pdf' — ECG/MAPA/Holter/Ergométrico, Task 5).
          Só abre pra quem assina como autor; a rota /api/emitir confirma. */}
      <AnexarPdfModal
        open={anexarPdf !== null}
        onClose={() => setAnexarPdf(null)}
        exame={anexarPdf ? {
          id: anexarPdf.id,
          pacienteNome: anexarPdf.pacienteNome as string,
          // X21: `tipoExame` tem que continuar sendo o ID do catálogo — vai
          // em `dadosFinais` pro /api/emitir, que grava por cima do campo no
          // doc. Mandar o NOME (nome de exibição) corrompia o dado: a
          // próxima leitura de `modalidadeDe` não reconhecia o id e caía no
          // default 'motor'. Nome de exibição vai à parte, em `tipoNome`.
          tipoExame: anexarPdf.tipoExame as string,
          tipoNome: tiposMap[(anexarPdf.tipoExame as string) || '']?.nome,
          convenio: anexarPdf.convenio as string,
        } : null}
        wsId={workspace?.id || ''}
        medicoUid={user?.uid || ''}
      />
    </div>
  );
}

// ── Botão de ação ──
function Btn({ cor, onClick, children }: { cor: 'blue' | 'green' | 'gray' | 'red' | 'amber' | 'cyan'; onClick: () => void; children: React.ReactNode }) {
  const cores = {
    blue: 'bg-p2 text-white hover:bg-blue-700',
    green: 'bg-green-100 text-green-700 hover:bg-green-200',
    gray: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    red: 'bg-red-50 text-red-500 hover:bg-red-100',
    amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100',
    // Botão "📸 Imagens": acionado quando exame.imagensDicom.length > 0
    cyan: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200',
  };
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${cores[cor]}`}>
      {children}
    </button>
  );
}
