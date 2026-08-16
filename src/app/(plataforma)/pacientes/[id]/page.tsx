'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · Ficha do paciente — cabeçalho + linha do tempo de exames
// (Sub-plano 4, Task 2). Nenhum dado pessoal na URL (path /pacientes/{id}
// só) nem em console.log.
//
// Política 09/05/2026: o histórico do paciente NÃO mostra não-realizados
// — são filtrados da timeline; a única marca é a contagem discreta no
// rodapé ("N não realizados"), sobre TODO o histórico (decisão do produto
// na revisão final — sem janela de 30 dias).
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getPaciente, getExames } from '@/lib/firestore';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { TIPOS_LAUDO_PADRAO, TipoLaudo } from '@/lib/tipos-laudo';
import { fmtData, calcIdade, formatCpf } from '@/lib/paciente-fmt';
import PageHeader from '@/components/shell/PageHeader';
import StatusPill, { statusConhecido } from '@/components/shell/StatusPill';
import { abrirPdfUrl } from '@/lib/pdfUtils';
import EditarPacienteModal from '@/components/pacientes/EditarPacienteModal';

type Paciente = Record<string, unknown> & {
  id: string; nome?: string; cpf?: string; dtnasc?: string;
  sexo?: string; telefone?: string; convenio?: string;
};

type Exame = Record<string, unknown> & {
  id: string; tipoExame?: string; dataExame?: string; status?: string;
  pdfUrl?: string; acc?: string;
};

const SEXO_LABEL: Record<string, string> = { M: 'Masculino', F: 'Feminino' };

export default function FichaPacientePage() {
  const params = useParams();
  const router = useRouter();
  const { workspace } = useAuth();
  const wsId = workspace?.id || '';
  const pacienteId = params.id as string;

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [exames, setExames] = useState<Exame[]>([]);
  const [tipos, setTipos] = useState<TipoLaudo[]>(TIPOS_LAUDO_PADRAO);
  const [loading, setLoading] = useState(true);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);

  function carregarFicha() {
    if (!wsId || !pacienteId) return;
    setLoading(true);
    Promise.all([getPaciente(wsId, pacienteId), getExames(wsId, pacienteId)]).then(([pac, exs]) => {
      if (!pac) { setNaoEncontrado(true); setLoading(false); return; }
      setPaciente(pac as Paciente);
      setExames(exs as Exame[]);
      setLoading(false);
    });
  }

  useEffect(carregarFicha, [wsId, pacienteId]);

  // Catálogo de tipos de laudo — carregado 1x no mount (mesmo padrão do
  // Worklist: getDocs ordenado, fallback pro default embutido).
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

  const tiposMap: Record<string, TipoLaudo> = {};
  for (const t of tipos) tiposMap[t.id] = t;

  const timeline = exames.filter(e => e.status !== 'nao-realizado');
  const naoRealizadosTotal = exames.filter(e => e.status === 'nao-realizado').length;

  function abrirLaudo(item: Exame) {
    const modalidade = tiposMap[(item.tipoExame as string) || '']?.modalidade || 'motor';
    router.push(modalidade === 'texto' ? '/laudo-texto/' + item.id : '/laudo/' + item.id);
  }

  // `st` vem de `statusConhecido()` — a MESMA normalização que a StatusPill
  // usa no JSX (fonte única em StatusPill.tsx). Antes cada um calculava o
  // próprio fallback e podiam divergir: um status desconhecido/legado (ex.
  // 'cancelado', ou os legados 'imagens-recebidas'/'erro-imagens' do
  // pipeline DICOM — ver comentário em Worklist.tsx) virava "Aguardando" na
  // pill enquanto a ação caía no branch padrão de "Abrir laudo" — contraditório.
  function acaoLaudo(item: Exame, st: string) {
    if (st === 'emitido' && item.pdfUrl) {
      return (
        <button onClick={() => abrirPdfUrl(item.pdfUrl as string)}
          className="bg-p2 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-p2-deep transition">
          🖨️ Abrir PDF
        </button>
      );
    }
    if (st === 'aguardando') {
      return <Link href="/agenda" className="text-xs text-p2 font-semibold hover:underline">Ver na Agenda</Link>;
    }
    // Cancelado: franquia já foi devolvida (exame-admin.ts cancelarExame) e
    // o pdfUrl foi apagado — não há laudo pra abrir nem sentido em mandar
    // pra Agenda. Sem ação nenhuma, só a pill vermelha já conta a história.
    if (st === 'cancelado') return null;
    // Modalidade 'pdf' (ECG/MAPA/Holter/Ergométrico) ainda sem pdfUrl: NÃO
    // oferecer "Abrir laudo" aqui — /laudo/[id] é o motor de ECHO e não tem
    // guard de modalidade, abriria o motor errado num exame de ECG/Holter/etc.
    // Anexar o PDF é ação da Agenda (AnexarPdfModal); a ficha só aponta pra lá.
    const modalidade = tiposMap[(item.tipoExame as string) || '']?.modalidade || 'motor';
    if (modalidade === 'pdf') {
      return <Link href="/agenda" className="text-xs text-p2 font-semibold hover:underline">Ver na Agenda</Link>;
    }
    return (
      <button onClick={() => abrirLaudo(item)}
        className="bg-p2 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-p2-deep transition">
        Abrir laudo
      </button>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-ink-3">
        <span className="text-3xl animate-pulse">🫀</span>
        <p className="text-sm mt-2">Carregando ficha...</p>
      </div>
    );
  }

  if (naoEncontrado || !paciente) {
    return (
      <div className="bg-card border border-borda rounded-xl p-8 text-center">
        <p className="text-3xl mb-2">🔍</p>
        <p className="text-sm text-ink-2 mb-4">Paciente não encontrado.</p>
        <button onClick={() => router.push('/pacientes')}
          className="text-sm text-p2 font-semibold hover:underline">← Voltar para Pacientes</button>
      </div>
    );
  }

  // `dtnasc` é a ÚNICA chave real de data de nascimento em `pacientes`
  // (ver Fix 1 da revisão final — nenhum caminho de escrita do repo grava
  // `nascimento`; era um fallback morto que só quebraria a data se algum
  // doc um dia tivesse o formato dd-mm-yyyy da API Feegow).
  const dtnasc = paciente.dtnasc as string | undefined;
  const idade = calcIdade(dtnasc);

  return (
    <>
      <PageHeader titulo={paciente.nome || 'Paciente'}>
        <button onClick={() => setModalEditar(true)}
          className="bg-p2 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-p2-deep transition">
          ✏️ Editar cadastro
        </button>
      </PageHeader>

      <EditarPacienteModal
        open={modalEditar}
        onClose={() => setModalEditar(false)}
        wsId={wsId}
        paciente={paciente}
        exames={exames}
        onSaved={carregarFicha}
      />

      <div className="bg-card border border-borda rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-xs text-ink-3 block">CPF</span>
            <span className="text-ink font-mono">{formatCpf(paciente.cpf)}</span>
          </div>
          <div>
            <span className="text-xs text-ink-3 block">Nascimento</span>
            <span className="text-ink">{fmtData(dtnasc)}{idade !== null ? ` (${idade} anos)` : ''}</span>
          </div>
          <div>
            <span className="text-xs text-ink-3 block">Sexo</span>
            <span className="text-ink">{(paciente.sexo && SEXO_LABEL[paciente.sexo]) || paciente.sexo || '—'}</span>
          </div>
          <div>
            <span className="text-xs text-ink-3 block">Telefone</span>
            <span className="text-ink">{paciente.telefone || '—'}</span>
          </div>
          <div>
            <span className="text-xs text-ink-3 block">Convênio</span>
            <span className="text-ink">{paciente.convenio || '—'}</span>
          </div>
        </div>
      </div>

      <div className="bg-card border border-borda rounded-xl p-4">
        <h2 className="text-sm font-bold text-ink mb-3">Linha do tempo</h2>
        {timeline.length === 0 ? (
          <div className="text-center py-10 text-ink-3">
            <p className="text-sm">Nenhum exame registrado.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {timeline.map(item => {
              const st = statusConhecido(item.status as string);
              return (
                <div key={item.id} className="border border-borda rounded-lg p-3 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-ink-2 font-mono w-24">{fmtData(item.dataExame)}</span>
                  <span className="text-sm text-ink flex-1 min-w-[120px]">
                    {tiposMap[(item.tipoExame as string) || '']?.nome || item.tipoExame || '—'}
                  </span>
                  <StatusPill status={st} />
                  <span className="text-xs text-ink-3 font-mono">{item.acc || '—'}</span>
                  {acaoLaudo(item, st)}
                </div>
              );
            })}
          </div>
        )}
        {naoRealizadosTotal > 0 && (
          <p className="text-xs text-ink-3 mt-3">
            {naoRealizadosTotal} não realizado{naoRealizadosTotal !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </>
  );
}
