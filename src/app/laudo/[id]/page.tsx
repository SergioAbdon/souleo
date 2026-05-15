'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Tela de Laudo — Motor V8 MP4
// Componentes: SidebarLaudo + SheetA4
// Motor carrega via <script> em IIFE isolado
// IDs DOM idênticos — compatível DICOM SR
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getExame, saveExame } from '@/lib/firestore';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { dataLocalHoje } from '@/lib/utils';
// v3: billing agora e server-side via /api/emitir
// gerarESalvarPdf legado removido — emissao + PDF agora sao server-side em /api/emitir
import SidebarLaudo from '@/components/laudo/SidebarLaudo';
import SheetA4 from '@/components/laudo/SheetA4';
import DicomGallery from '@/components/laudo/DicomGallery';
import DicomSrImport from '@/components/laudo/DicomSrImport';
import { normalizarParaImport, prefixoArquivoPorTipo, InputImport, MedidaSr } from '@/lib/dicom-sr-mapping';
import EditorLaudo from '@/components/laudo/EditorLaudo';
import type { EditorLaudoRef } from '@/components/laudo/EditorLaudo';
import { gerarDocx } from '@/lib/exportDocx';
import { PopupSalvarEmitir, ModoEmitido } from '@/components/laudo/PopupEmitir';
// Shadow Mode (Fase 5): roda Senna90 server-side em paralelo invisível
import { executarEReportar, shadowModeAtivo } from '@/lib/shadow-runner';

export default function LaudoPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, workspace } = useAuth();
  const [motorLoaded, setMotorLoaded] = useState(false);
  const [motorErro, setMotorErro] = useState(false);
  const [exame, setExame] = useState<Record<string, unknown> | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [emitido, setEmitido] = useState(false);
  const [dicomLoading, setDicomLoading] = useState(false);
  const [dicomImportado, setDicomImportado] = useState(false);
  // Estado da galeria DICOM (modal full-screen com thumbnails + lightbox).
  // Adicionada em 14/05/2026 — médico consegue ver as imagens dentro do laudo.
  const [galeriaOpen, setGaleriaOpen] = useState(false);
  // Modal de import de medidas SR (15/05/2026). Substitui o auto-import
  // que rodava ao clicar "📡 Vivid" — agora abre modal de validação 1-a-1.
  const [srImportOpen, setSrImportOpen] = useState(false);
  // URLs selecionadas pra imprimir no PDF do laudo (subset de imagensDicom).
  // Sincronizado com `exame.imagensSelecionadasPdf` no Firestore. Default
  // quando undefined no Firestore = primeiras 8 (ou menos se exame tem <8).
  const [imagensSelecionadasPdf, setImagensSelecionadasPdf] = useState<string[]>([]);
  // Toggle "Incluir imagens DICOM no PDF" — controlado pelo médico no
  // PopupSalvarEmitir (decisão 15/05/2026). Default true quando há imagens
  // selecionadas. Lido por `gerarPdfHtml()` pra incluir/omitir as páginas.
  const [imagensIncluidasNoPdf, setImagensIncluidasNoPdf] = useState(true);
  const editorRef = useRef<EditorLaudoRef>(null);
  const pendingHtml = useRef<string | null>(null);

  const exameId = params.id as string;
  const p1 = (workspace?.corPrimaria as string) || '#8B1A1A';
  const clinicaNome = (workspace?.nomeClinica as string) || 'Consultório';
  const clinicaSlogan = (workspace?.slogan as string) || '';
  const clinicaEndRaw = (workspace?.endereco as string) || '';
  const clinicaEnd = fmtCep(clinicaEndRaw);
  const clinicaTelRaw = (workspace?.telefone as string) || '';
  const clinicaTel = fmtTel(clinicaTelRaw);
  const tel2Raw = (workspace?.telefone2 as string) || '';
  const clinicaTel2 = tel2Raw ? fmtTel(tel2Raw) : '';
  const telCompleto = clinicaTel + (clinicaTel2 ? ' / ' + clinicaTel2 : '');
  const espRaw = (profile?.especialidade as string) || '';
  const especialidade = espRaw.replace(/\\/g, ' e ').replace(/\//g, ' e ');
  const sigTexto = profile
    ? `${profile.nome || ''}\n${especialidade}\nCRM/${profile.ufCrm || ''} ${profile.crm || ''}`
    : '';
  const medicoInfo = profile
    ? `${profile.nome || ''} · CRM/${profile.ufCrm || ''} ${profile.crm || ''}`
    : '';
  const logoB64 = (workspace?.logoB64 as string) || '';
  const sigB64 = (profile?.sigB64 as string) || '';

  // Processar conteúdo pendente quando TipTap monta
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingHtml.current && editorRef.current) {
        editorRef.current.setContent(pendingHtml.current);
        pendingHtml.current = null;
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // Carregar exame
  useEffect(() => {
    if (workspace?.id && exameId) {
      getExame(workspace.id, exameId).then(ex => {
        if (ex) {
          setExame(ex);
          const dados = ex as Record<string, unknown>;
          if (dados.emitidoEm) setEmitido(true);

          // Inicializa seleção de imagens pra impressão:
          //  - Se já tem `imagensSelecionadasPdf` salvo → usa
          //  - Senão → default = primeiras 8 (ou todas, se exame tem <8)
          //    Esse default só vive em memória; só persiste no Firestore
          //    quando médico toggle alguma imagem (auto-save abaixo).
          const todas = (dados.imagensDicom as string[] | undefined) || [];
          const salvas = dados.imagensSelecionadasPdf as string[] | undefined;
          if (salvas && Array.isArray(salvas)) {
            // Filtra URLs salvas que ainda existem em imagensDicom (defensivo
            // contra remap/reprocessamento que mudou URLs)
            setImagensSelecionadasPdf(salvas.filter((u) => todas.includes(u)));
          } else {
            setImagensSelecionadasPdf(todas.slice(0, 8));
          }
        }
      });
    }
  }, [workspace?.id, exameId]);

  /**
   * Toggle seleção de uma imagem pra impressão (decisão 14/05/2026).
   * Auto-save no Firestore — sem botão "Salvar". O conceito é "estas vão
   * pro PDF quando emitir/imprimir".
   *
   * Mantém a ORDEM em que o médico clicou (importa pro PDF) — não reordena
   * pela posição na galeria.
   */
  async function handleToggleSelecaoImagem(url: string) {
    if (!workspace?.id || !exameId || !user?.uid) return;
    const novaLista = imagensSelecionadasPdf.includes(url)
      ? imagensSelecionadasPdf.filter((u) => u !== url) // remove
      : [...imagensSelecionadasPdf, url]; // adiciona no fim
    setImagensSelecionadasPdf(novaLista); // optimistic UI
    try {
      await saveExame(workspace.id, { id: exameId, imagensSelecionadasPdf: novaLista }, user.uid);
    } catch (e) {
      console.warn('Falha ao salvar seleção de imagens:', e);
      // Não reverter UI — médico continua escolhendo. Próximo toggle tenta de novo.
    }
  }

  // Preencher quando exame + motor prontos
  useEffect(() => {
    if (exame && motorLoaded) {
      setTimeout(() => {
        try { preencherExame(); safeCalc(); } catch (e) { console.warn('preencher:', e); }
      }, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exame, motorLoaded]);

  // Carregar motor
  useEffect(() => {
    if (motorLoaded) return;
    const w = window as unknown as Record<string, unknown>;
    w.escH = (s: string) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
    w.showToast = (msg: string) => { const el = document.createElement('div'); el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1E293B;color:#fff;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:600;font-family:IBM Plex Sans,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 3000); };
    w.hexToRgb = (h: string) => { if (!h) return [30, 58, 95]; h = h.replace('#', ''); const n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    w.calcIdade = (dn: string, de?: string) => { if (!dn) return ''; const a = new Date(de || new Date()), b = new Date(dn); let i = a.getFullYear() - b.getFullYear(); if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) i--; return i; };
    w.uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    w.tog = (id: string) => { const el = document.getElementById(id); if (el) el.classList.toggle('collapsed'); };
    // alertaIT e setDiastModo wrappers serão aplicados após o motor carregar (ver script.onload)

    // Callbacks TipTap — motor chama estes ao renderizar achados/conclusões
    // Motor gera laudo completo → envia para TipTap
    const WK_DESC: Record<string, string[]> = {
      mob: ['Normal','Boa mobilidade da valva, com restrição apenas na ponta do folheto','Redução da mobilidade na porção média e na base dos folhetos','Mobilidade somente na base dos folhetos','Nenhum ou mínimo movimento dos folhetos'],
      esp: ['Normal','Espessura valvar próxima do normal (4–5 mm)','Grande espessamento nas margens do folheto','Espessamento de todo o folheto (5–8 mm)','Grande espessamento de todo o folheto (>8–10 mm)'],
      sub: ['Normal','Espessamento mínimo da corda tendínea logo abaixo da valva','Espessamento da corda até terço proximal','Espessamento da corda até terço distal','Extenso espessamento e encurtamento de toda corda até músculo papilar'],
      cal: ['Sem calcificação','Uma única área de calcificação','Calcificações nas margens dos folhetos','Calcificações extensivas à porção média do folheto','Extensa calcificação em todo o folheto'],
    };
    const WK_LABELS: Record<string, string> = { mob: 'Mobilidade do folheto', esp: 'Espessamento valvar', sub: 'Espessamento subvalvar', cal: 'Calcificação valvar' };

    function renderWilkinsHtml(json: string): string {
      const d = JSON.parse(json);
      let html = '<p><strong>Escore Ecocardiográfico de Wilkins &amp; Block:</strong></p>';
      for (const key of ['mob', 'esp', 'sub', 'cal']) {
        const val = d[key] as number;
        if (val > 0) {
          html += `<p>• <strong>${WK_LABELS[key]}</strong> (${val} pts): ${WK_DESC[key][val]}</p>`;
        }
      }
      html += `<p><strong>TOTAL: ${d.sc} pontos.</strong> ${d.concFrase}</p>`;
      return html;
    }

    w._onLaudoGerado = (html: string) => {
      // Processar __WILKINS__ JSON → HTML formatado com critérios
      let processed = html.replace(/<p>__WILKINS__(\{.*?\})<\/p>/g, (_match, json) => {
        try { return renderWilkinsHtml(json); } catch { return ''; }
      });
      processed = processed.replace(/__WILKINS__(\{.*?\})/g, (_match, json) => {
        try { return renderWilkinsHtml(json); } catch { return ''; }
      });
      if (editorRef.current) {
        editorRef.current.setContent(processed);
      } else {
        pendingHtml.current = processed;
      }
    };
    // Banco de frases insere no cursor
    w._onInserirFrase = (texto: string) => {
      if (editorRef.current) editorRef.current.insertLine(texto);
    };

    // v3: carregar motor com retry e error handling
    let retryCount = 0;
    function carregarScript() {
      const s = document.createElement('script');
      s.src = `/motor/motorv8mp4.js?v=${Date.now()}`; // cache bust no retry
      s.onerror = () => {
        try { document.body.removeChild(s); } catch {}
        if (retryCount < 1) {
          retryCount++;
          console.warn('Motor: falha ao carregar, tentando novamente...');
          setTimeout(carregarScript, 2000);
        } else {
          console.error('Motor: falha definitiva apos retry');
          setMotorErro(true);
        }
      };
      s.onload = () => motorInicializar();
      document.body.appendChild(s);
    }

    const script = { remove: () => {} }; // ref pra cleanup
    function motorInicializar() {
      setMotorLoaded(true);
      setTimeout(() => {
        try {
          const calcFn = (window as unknown as Record<string, unknown>).calc as (() => void) | undefined;
          if (calcFn) {
            // Wrapper: roda motor antigo + shadow Senna90 (server-side, invisível)
            const sc = () => {
              try { calcFn(); } catch (e) { console.warn('calc:', e); }
              // Shadow mode (Fase 5): invisível, server-side
              if (shadowModeAtivo()) {
                try { executarEReportar(exameId); } catch { /* não bloquear */ }
              }
            };

            // FIX 12/05/2026: Event delegation no container, NÃO em cada input.
            //
            // Bug antigo: querySelectorAll só pegava inputs das seções ABERTAS no
            // momento do load (Válvulas e Contratilidade começam fechadas — seus
            // inputs nem existiam no DOM). Quando o médico abria essas seções e
            // digitava, calc() não rodava → frases não apareciam.
            //
            // Solução: um único listener no #laudo-sidebar (sempre presente).
            // Eventos `input`/`change` borbulham (bubble) pro container, e
            // checamos o target. Funciona pra inputs adicionados depois (seções
            // expandidas, auto-fill DICOM futuro, etc).
            const sidebar = document.getElementById('laudo-sidebar');
            if (sidebar) {
              const onInputOrChange = (e: Event) => {
                const t = e.target as HTMLElement | null;
                if (!t) return;
                const tag = t.tagName;
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
                  sc();
                }
              };
              sidebar.addEventListener('input', onInputOrChange);
              sidebar.addEventListener('change', onInputOrChange);

              // Sincronização b24 (Câmaras) ↔ b24_diast (Diastólica) — também
              // via delegation (pra cobrir caso b24_diast ainda não existir):
              const onB24Sync = (e: Event) => {
                const t = e.target as HTMLInputElement | null;
                if (!t || t.tagName !== 'INPUT') return;
                if (t.id === 'b24') {
                  const d = document.getElementById('b24_diast') as HTMLInputElement | null;
                  if (d) d.value = t.value;
                } else if (t.id === 'b24_diast') {
                  const d = document.getElementById('b24') as HTMLInputElement | null;
                  if (d) d.value = t.value;
                }
              };
              sidebar.addEventListener('input', onB24Sync);
            }

            preencherExame();
            sc();
          }

          // Override alertaIT — usar style.display em vez de classList.toggle
          (window as unknown as Record<string, unknown>).alertaIT = () => {
            const it = parseFloat((document.getElementById('b23') as HTMLInputElement)?.value || '0');
            const psap = parseFloat((document.getElementById('b37') as HTMLInputElement)?.value || '0');
            const msg = document.getElementById('alerta-psap');
            if (msg) msg.style.display = (it > 0 && !psap) ? 'block' : 'none';
          };

          // Wrap setDiastModo APÓS motor carregar (motor exporta window.setDiastModo)
          const origSetDiastModo = (window as unknown as Record<string, unknown>).setDiastModo as ((m: string) => void) | undefined;
          (window as unknown as Record<string, unknown>).setDiastModo = (modo: string) => {
            if (origSetDiastModo) origSetDiastModo(modo);
            const btnAuto = document.getElementById('diast-btn-auto');
            const btnManual = document.getElementById('diast-btn-manual');
            const panel = document.getElementById('diast-manual-panel');
            if (btnAuto && btnManual && panel) {
              if (modo === 'manual') {
                btnManual.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-[#1E3A5F] text-white';
                btnAuto.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-transparent text-[#6B7280] hover:bg-white';
                panel.style.display = 'block';
              } else {
                btnAuto.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-[#1E3A5F] text-white';
                btnManual.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-transparent text-[#6B7280] hover:bg-white';
                panel.style.display = 'none';
              }
            }
          };
        } catch (e) { console.warn('motor:', e); setMotorErro(true); }
      }, 500);
    }

    carregarScript();
    return () => { try { document.querySelectorAll('script[src*="motorv8mp4"]').forEach(s => s.remove()); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function safeCalc() {
    if (motorErro) return; // v3: nao tentar calcular se motor falhou
    try {
      const c = (window as unknown as Record<string, unknown>).calc as (() => void);
      if (c) c();
      else if (motorLoaded) { console.warn('calc: funcao nao encontrada no window'); }
    } catch (e) { console.warn('calc:', e); }
  }

  function preencherExame() {
    if (!exame) return;

    // v3: limpar rascunhos orfaos (mais de 7 dias)
    try {
      const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;
      const agora = Date.now();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('rascunho_')) {
          try {
            const r = JSON.parse(localStorage.getItem(key) || '{}');
            if (r.timestamp && agora - r.timestamp > SETE_DIAS) {
              localStorage.removeItem(key);
            }
          } catch { localStorage.removeItem(key!); }
        }
      }
    } catch { /* */ }

    // Verificar rascunho local
    try {
      const raw = localStorage.getItem(`rascunho_${exameId}`);
      if (raw) {
        const rascunho = JSON.parse(raw);
        const quando = new Date(rascunho.timestamp);
        const fmt = quando.toLocaleDateString('pt-BR') + ' ' + quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (confirm(`Rascunho salvo em ${fmt}. Deseja recuperar?`)) {
          Object.entries(rascunho.medidas as Record<string, string>).forEach(([id, val]) => { if (val) setVal(id, val); });
          return;
        } else {
          localStorage.removeItem(`rascunho_${exameId}`);
        }
      }
    } catch { /* sem rascunho */ }

    const med = exame.medidas as Record<string, string> | undefined;
    if (med) {
      Object.entries(med).forEach(([id, val]) => { if (val) setVal(id, val); });
    }
    // Sempre preencher identificação a partir do exame (fallback se medidas não tiver)
    const idCampos: [string, string][] = [
      ['nome', exame.pacienteNome as string || ''],
      ['dtnasc', exame.pacienteDtnasc as string || ''],
      ['dtexame', exame.dataExame as string || dataLocalHoje()],
      ['convenio', exame.convenio as string || ''],
      ['solicitante', exame.solicitante as string || ''],
      ['sexo', exame.sexo as string || ''],
    ];
    idCampos.forEach(([id, val]) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el && !el.value && val) setVal(id, val);
    });
  }

  function setVal(id: string, val: string) {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = val;
  }

  function coletarMedidas(): Record<string, string> {
    const campos = ['nome', 'dtnasc', 'dtexame', 'convenio', 'solicitante', 'sexo', 'ritmo', 'peso', 'altura',
      'b7', 'b8', 'b9', 'b10', 'b11', 'b12', 'b13', 'b28', 'b29', 'b24', 'b25',
      'b19', 'b20', 'b21', 'b22', 'b23', 'b24_diast', 'b37', 'b38', 'b54', 'b32', 'b33', 'gls_ve', 'gls_vd', 'lars',
      'b34', 'b35', 'b34t', 'b36', 'b39', 'b40', 'b39p', 'b40p', 'psmap',
      'b41', 'b42', 'b45', 'b46', 'b47', 'b46t', 'b47t', 'b50', 'b51', 'b52', 'b50p',
      'b55', 'b56', 'b57', 'b58', 'b59', 'b60', 'b61', 'b62', 'wk-mob', 'wk-esp', 'wk-cal', 'wk-sub'];
    const m: Record<string, string> = {};
    campos.forEach(id => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) m[id] = el.value || ''; });
    return m;
  }

  /** Extrai identificação do DOM — sempre sincronizada ao salvar */
  function coletarIdentificacao(): Record<string, string> {
    const g = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value || '';
    return {
      pacienteNome: g('nome').trim().toUpperCase(),
      pacienteDtnasc: g('dtnasc'),
      dataExame: g('dtexame'),
      convenio: g('convenio'),
      solicitante: g('solicitante'),
      sexo: g('sexo'),
    };
  }

  /** Detecta se identificação mudou em relação ao exame original */
  function identificacaoMudou(): boolean {
    if (!exame) return false;
    const atual = coletarIdentificacao();
    return (
      atual.pacienteNome !== ((exame.pacienteNome as string) || '').trim().toUpperCase() ||
      atual.pacienteDtnasc !== ((exame.pacienteDtnasc as string) || '') ||
      atual.dataExame !== ((exame.dataExame as string) || '') ||
      atual.convenio !== ((exame.convenio as string) || '')
    );
  }

  /** Save centralizado — medidas + identificação sempre juntos */
  async function salvarLaudo(status: 'rascunho' | 'andamento', extras?: Record<string, unknown>) {
    if (!workspace?.id || !exameId || !user?.uid) return false;
    const dados = { id: exameId, medidas: coletarMedidas(), ...coletarIdentificacao(), status, ...extras };
    return await saveExame(workspace.id, dados, user.uid);
  }

  /**
   * Abre o modal de IMPORTAÇÃO de medidas DICOM SR.
   *
   * Mudança 15/05/2026: antes o click no botão "📡 Vivid" importava DIRETO
   * sem validação. Agora abre `<DicomSrImport>` que mostra cada input com
   * checkbox individual — médico confirma item a item. Decisão clínica
   * com Sergio: "GOSTEI DA SUGESTAO B" (validação 1-a-1).
   *
   * Inputs vêm de `normalizarParaImport()` que lê `exame.medidasDicom` e
   * filtra só os mapeáveis na whitelist `SR_TO_MOTOR` (calculados são
   * ignorados — motor recalcula).
   */
  function handleImportarDicom() {
    if (!workspace?.id) return;
    const inputsDisponiveis = getInputsImportaveis();
    if (inputsDisponiveis.length === 0) {
      alert(
        'Sem medidas DICOM SR mapeáveis pra importar.\n\n' +
        'Ou o Wader ainda não processou o estudo, ou as medidas SR não estão ' +
        'na whitelist conhecida (ver `src/lib/dicom-sr-mapping.ts`).'
      );
      return;
    }
    setSrImportOpen(true);
  }

  /**
   * Retorna a lista de inputs DICOM importáveis pro motor (filtrados via
   * whitelist SR_TO_MOTOR). Funciona com schema NOVO (medidas com contexto)
   * e ANTIGO (Record<string, number>) via normalizarParaImport.
   */
  function getInputsImportaveis(): InputImport[] {
    const medidasDicom = exame?.medidasDicom as Record<string, MedidaSr | number> | undefined;
    return normalizarParaImport(medidasDicom);
  }

  /**
   * Callback do modal DicomSrImport — recebe os inputs que o médico
   * MARCOU e chama `window.importarDICOM` do motor com payload no formato
   * esperado (`{ measurements: { [campoMotor]: valor } }`).
   *
   * Motor já preenche os DOM inputs e recalcula automaticamente
   * (cascade: Septo + Parede + DDVE → Massa VE; DDVE + DSVE → FE Teich).
   */
  function handleConfirmarImportSr(selecionados: InputImport[]) {
    if (selecionados.length === 0) return;
    const w = window as unknown as Record<string, (...args: unknown[]) => unknown>;
    const importFn = w.importarDICOM as ((d: unknown) => { ok: boolean; count: number; msg: string }) | undefined;
    if (!importFn) {
      alert('Motor não carregado. Tente recarregar a página.');
      return;
    }

    // Monta `measurements` no formato esperado: { [campoMotorId]: valor }.
    // O motor V8 usa os IDs `b7`, `b8`, etc, internamente.
    const measurements: Record<string, number> = {};
    for (const s of selecionados) {
      measurements[s.campo] = s.valor;
    }

    const dicomMeta = exame?.dicomMeta as Record<string, string> | undefined;
    try {
      const result = importFn({
        measurements,
        patientName: exame?.pacienteNome as string || '',
        studyDate: dicomMeta?.studyDate || '',
      });
      setDicomImportado(true);
      alert(`✅ ${result.count} medidas importadas. Motor recalcula derivados automaticamente.`);
    } catch (e) {
      console.error('handleConfirmarImportSr:', e);
      alert('Erro ao importar. Veja console pra detalhes.');
    }
  }

  function handleVoltar() {
    router.push('/dashboard');
  }

  function handleSalvarEmitir() {
    setPopupOpen(true);
  }

  function handleRascunho() {
    setPopupOpen(false);
    try {
      const medidas = coletarMedidas();
      localStorage.setItem(`rascunho_${exameId}`, JSON.stringify({ medidas, timestamp: Date.now() }));
      toast('Rascunho salvo localmente');
    } catch { toast('Erro ao salvar rascunho'); }
  }

  async function handleEmitir(incluirImagens: boolean = true) {
    setPopupOpen(false);
    if (!workspace?.id || !exameId || !user?.uid) return;
    // Guarda escolha do médico no state — `gerarPdfHtml()` consulta isso
    // antes de incluir as páginas extras de imagens
    setImagensIncluidasNoPdf(incluirImagens);

    const medidas = coletarMedidas();
    const achados = coletarAchados();
    const conclusoes = coletarConclusoes();

    // v3: Emissao atomica server-side (exame + billing numa transacao)
    const jaEmitido = !!(exame?.emitidoEm);
    const idMudou = jaEmitido && identificacaoMudou();
    const identificacao = coletarIdentificacao();

    const dadosFinais = {
      medidas, achados, conclusoes,
      ...identificacao,
      cfgSnapshot: { clinica: clinicaNome, slogan: clinicaSlogan, localEnd: clinicaEnd, localTel: clinicaTel, medNome: profile?.nome, medCrm: profile?.crm, medUf: profile?.ufCrm, p1 },
      // Dados extras pra consumo/log (server usa)
      pacienteNome: (exame?.pacienteNome as string) || identificacao.pacienteNome || '',
      tipoExame: (exame?.tipoExame as string) || '',
      convenio: (exame?.convenio as string) || '',
      reemissao: jaEmitido,
      identificacaoAlterada: idMudou,
    };

    // v3.1: gerar pdfHtml ANTES de emitir, mandar junto na requisicao
    // Servidor faz emissao + PDF tudo numa chamada (sem race condition).
    // Passa `incluirImagens` explícito pra evitar race do setState async
    // (decisão 15/05/2026 — médico escolhe no PopupSalvarEmitir).
    const pdfHtml = gerarPdfHtml(incluirImagens);
    const nome = (document.getElementById('nome') as HTMLInputElement)?.value || 'PACIENTE';
    // Nome do arquivo dinâmico por tipoExame (decisão 15/05/2026):
    //   eco_tt → ECOTT, doppler_carotidas → DOPPLER CAROTIDAS, etc.
    const nomeArq = prefixoArquivoPorTipo(exame?.tipoExame as string | undefined) + ' ' + nome.trim().toUpperCase();

    toast('Emitindo laudo e gerando PDF...');

    let resultado: { ok: boolean; tipo?: string; motivo?: string; pdfUrl?: string; pdfErro?: string };
    try {
      const res = await fetch('/api/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId: workspace.id,
          exameId,
          dadosFinais,
          medicoUid: user.uid,
          pdfHtml,
          nomeArq,
        }),
      });
      resultado = await res.json();
    } catch {
      toast('Erro de conexao ao emitir. Tente novamente.');
      return;
    }

    if (!resultado.ok) {
      const msgs: Record<string, string> = {
        sem_plano: 'Sem plano ativo. Assine um plano para emitir laudos.',
        expirado: 'Seu plano expirou. Renove para continuar emitindo.',
        sem_saldo: 'Franquia esgotada e sem creditos extras.',
        erro: 'Erro ao emitir. Tente novamente.',
      };
      toast(msgs[resultado.motivo || 'erro'] || 'Erro ao emitir.');
      return;
    }

    try { localStorage.removeItem(`rascunho_${exameId}`); } catch { /* */ }

    // Atualizar status no Feegow se veio de lá
    if (exame?.feegowAppointId) {
      try {
        const fToken = await auth.currentUser?.getIdToken();
        await fetch(`/api/feegow?wsId=${workspace.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fToken || ''}` },
          body: JSON.stringify({ action: 'atualizar_status', agendamento_id: exame.feegowAppointId, status_id: 3 }),
        });
      } catch { /* não bloquear emissão se Feegow falhar */ }
    }

    setEmitido(true);

    // Abrir o PDF gerado (se ja foi salvo no Storage)
    if (resultado.pdfUrl) {
      toast('Laudo emitido — PDF pronto');
      window.open(resultado.pdfUrl, '_blank');
    } else if (resultado.pdfErro) {
      toast('Laudo emitido. PDF falhou — tente "Imprimir" depois.');
      console.warn('PDF gen error:', resultado.pdfErro);
    } else {
      toast('Laudo emitido e assinado');
    }
  }

  function handleDesbloquear() {
    if (!confirm('Ao editar e reemitir, será consumido 1 crédito da sua franquia.\n\nDeseja desbloquear para edição?')) return;
    setEmitido(false);
    toast('Laudo desbloqueado para edição');
  }

  function handleFinalizar() {
    toast('Atendimento finalizado');
    router.push('/dashboard');
  }

  // ── Coletar achados e conclusões do TipTap ──
  function coletarAchados(): string[] {
    return editorRef.current?.getAchadosLines() || [];
  }

  function coletarConclusoes(): string[] {
    return editorRef.current?.getConclusoesLines() || [];
  }

  function getAchadosHTML(): string {
    return editorRef.current?.getAchadosHTML() || '';
  }
  function getConclusoesHTML(): string {
    return editorRef.current?.getConclusoesHTML() || '';
  }

  // ── Gerar HTML do PDF a partir do DOM ──
  // `incluirImagensParam` (decisão 15/05/2026): se passado, sobrescreve
  // o state `imagensIncluidasNoPdf` — usado pelo handleEmitir() que recebe
  // a escolha do médico via callback do PopupSalvarEmitir (state ainda não
  // foi commitado quando esta função é chamada).
  function gerarPdfHtml(incluirImagensParam?: boolean): string {
    const incluirImagens = incluirImagensParam !== undefined ? incluirImagensParam : imagensIncluidasNoPdf;
    const nome = (document.getElementById('nome') as HTMLInputElement)?.value || 'PACIENTE';
    // Nome do arquivo dinâmico por tipoExame
    const nomeArq = prefixoArquivoPorTipo(exame?.tipoExame as string | undefined) + ' ' + nome.trim().toUpperCase();

    // Coletar tabela de parâmetros — reconstruir do DOM com larguras fixas
    const rows = document.querySelectorAll('#params-tbody tr');
    let paramsRows = '';
    rows.forEach(tr => {
      let rowHTML = '<tr>';
      tr.querySelectorAll('td').forEach((td, idx) => {
        const divider = idx === 4 ? `border-left:2px solid ${p1};` : '';
        rowHTML += `<td style="border:0.5px solid #ccc;padding:2px 5px;${divider}">${td.innerHTML}</td>`;
      });
      rowHTML += '</tr>';
      paramsRows += rowHTML;
    });

    const paramsHTML = `<table style="border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:fixed;">
<colgroup><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/></colgroup>
<thead><tr>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Parâmetro</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Valor</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Unid.</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Referência</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;border-left:2px solid #fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Parâmetro</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Valor</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Unid.</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Referência</th>
</tr></thead><tbody>${paramsRows}</tbody></table>
<div style="font-size:5.5pt;color:#888;line-height:1.4;padding:2px 4px;border-top:0.5px solid #ddd;">
DDVE= Diâmetro diastólico do VE. DSVE= Diâmetro sistólico do VE. VE= Ventrículo esquerdo. VD= Ventrículo direito.<br/>
Valores de referência: ASE/EACVI 2015; ASE 2025.
</div>`;

    // Comentários e Conclusão — usar HTML do TipTap se disponível
    const achadosHTMLContent = getAchadosHTML();
    const concHTMLContent = getConclusoesHTML();
    const achadosHTML = achadosHTMLContent
      ? `<div style="font-size:8.5pt;line-height:1.6;">${achadosHTMLContent}</div>`
      : coletarAchados().map(t => `<li style="margin-bottom:2px;font-size:8.5pt;line-height:1.6;">${t}</li>`).join('');
    const concHTML = concHTMLContent
      ? `<div style="font-size:8.5pt;line-height:1.6;">${concHTMLContent}</div>`
      : coletarConclusoes().map((t, i) => `<li style="margin-bottom:2px;font-size:8.5pt;line-height:1.6;"><strong style="color:${p1};margin-right:4px;">${i + 1}</strong> ${t}</li>`).join('');

    // Identificação
    const outNome = document.getElementById('out-nome')?.textContent || '—';
    const outIdade = document.getElementById('out-idade')?.textContent || '—';
    const outDtnasc = document.getElementById('out-dtnasc')?.textContent || '—';
    const outConv = document.getElementById('out-convenio')?.textContent || '—';
    const outSolic = document.getElementById('out-solicitante')?.textContent || '—';
    const outDtex = document.getElementById('out-dtexame')?.textContent || '—';

    // Seção de imagens DICOM no PDF (decisão 14/05/2026, fix 15/05/2026):
    //  - Página(s) nova(s) após Conclusão (page-break-before: always)
    //  - Layout 2 colunas × 4 linhas = 8 imagens por A4
    //  - SEMPRE 8 slots — última pg pode ter slots vazios (decisão 15/05)
    //  - Fix CSS: `minmax(0, 1fr)` + `min-height: 0` força 4 linhas mesmo
    //    se imagem (aspect 4:3) tentar empurrar pra mais (bug 14/05 saía 6/pg)
    //  - Pulado se imagensIncluidasNoPdf=false (toggle no PopupSalvarEmitir)
    let imagensPdfHtml = '';
    if (incluirImagens && imagensSelecionadasPdf.length > 0) {
      const POR_PG = 8;
      const totPgs = Math.ceil(imagensSelecionadasPdf.length / POR_PG);
      const tipoLabel = (exame?.tipoExame as string | undefined) || '';
      const pgsHtml = Array.from({ length: totPgs }, (_, pgIdx) => {
        const slice = imagensSelecionadasPdf.slice(pgIdx * POR_PG, (pgIdx + 1) * POR_PG);
        // Pad pra ter SEMPRE 8 slots por página (decisão 15/05/2026)
        const padded = [...slice];
        while (padded.length < POR_PG) padded.push('');
        const slots = padded.map((url, i) => {
          if (!url) return '<div class="dicom-slot dicom-slot-vazio"></div>';
          const num = pgIdx * POR_PG + i + 1;
          return `<div class="dicom-slot"><img src="${url}" alt="Imagem ${num}" /><span class="num">${num}</span></div>`;
        }).join('');
        return `<div class="dicom-pg"><h2>📸 Imagens — ${outNome}${tipoLabel ? ` · ${tipoLabel}` : ''} (página ${pgIdx + 1} de ${totPgs})</h2><div class="dicom-grid">${slots}</div></div>`;
      }).join('');
      imagensPdfHtml = `<style>
.dicom-pg{page-break-before:always;display:flex;flex-direction:column;height:calc(100vh - 16mm);padding:8mm;font-family:"IBM Plex Sans",sans-serif;}
.dicom-pg h2{font-size:11pt;font-weight:700;color:${p1};margin-bottom:3mm;padding-bottom:2mm;border-bottom:1.5px solid ${p1};flex-shrink:0;}
.dicom-grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4, minmax(0, 1fr));gap:3mm;min-height:0;}
.dicom-slot{background:#000;border-radius:2px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;min-height:0;}
.dicom-slot-vazio{background:transparent;}
.dicom-slot img{max-width:100%;max-height:100%;width:auto;height:auto;display:block;object-fit:contain;}
.dicom-slot .num{position:absolute;bottom:2mm;right:2mm;background:rgba(0,0,0,.7);color:#fff;font-size:7.5pt;font-weight:600;padding:1mm 2mm;border-radius:2px;}
</style>${pgsHtml}`;
    }

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${nomeArq}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"IBM Plex Sans",sans-serif;font-size:8.5pt;color:#1a1a1a;}
@page{size:A4;margin:0;}
table.pl{width:100%;border-collapse:collapse;table-layout:fixed;}
thead{display:table-header-group;}
tfoot{display:table-footer-group;}
thead td{padding:8mm 14mm 3mm;}
tfoot td{padding:3mm 14mm 6mm;}
tbody td.body-cell{padding:0 14mm 4mm;}
ul{list-style:none;padding:0;margin:0;}
</style></head><body>
<table class="pl">
<thead><tr><td>
  <div style="padding-bottom:2mm;border-bottom:2.5px solid ${p1};margin-bottom:2mm;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:-2px;">
      ${logoB64 ? `<img src="${logoB64}" style="width:42px;height:42px;border-radius:5px;object-fit:contain;" alt="Logo"/>` : ''}
      <div>
        <div style="font-size:14pt;font-weight:700;color:${p1};white-space:nowrap;line-height:1.1;">${clinicaNome}</div>
        ${clinicaSlogan ? `<div style="font-size:7.5pt;color:#888;margin-top:1px;">${clinicaSlogan}</div>` : ''}
      </div>
    </div>
    <div style="font-size:10.5pt;font-weight:700;color:${p1};text-align:center;white-space:nowrap;letter-spacing:0.3px;">ECOCARDIOGRAMA TRANSTORÁCICO</div>
  </div>
  <div style="border:1px solid ${p1};border-radius:3px;padding:3px 6px;margin-bottom:2mm;">
    <div style="display:flex;gap:8px;margin-bottom:2px;">
      <div style="flex:2"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">NOME</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outNome}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">IDADE</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outIdade}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">DATA DE NASCIMENTO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outDtnasc}</span></div>
    </div>
    <div style="display:flex;gap:8px;">
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">CONVÊNIO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outConv}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">MÉDICO SOLICITANTE</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outSolic}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">DATA DO EXAME</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outDtex}</span></div>
    </div>
  </div>
</td></tr></thead>
<tfoot><tr><td>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;border-top:1.5px solid ${p1};padding-top:3mm;">
    <div style="font-size:7pt;color:#444;line-height:1.6;">
      <strong style="color:${p1};font-size:8pt;">${clinicaNome}</strong><br/>
      ${clinicaEnd}<br/>
      ${telCompleto ? '&#9742; ' + telCompleto : ''}
    </div>
    <div style="text-align:center;font-size:7pt;color:#444;">
      ${sigB64 ? `<img src="${sigB64}" style="max-height:50px;max-width:180px;display:block;margin:10px auto 2px;object-fit:contain;" alt="Assinatura"/>` : ''}
      <div style="width:180px;border-top:1px solid #333;margin:${sigB64 ? '2px' : '24px'} auto 3px;"></div>
      <div style="font-size:7pt;white-space:pre-line;line-height:1.4;">${sigTexto}</div>
    </div>
  </div>
  <div style="text-align:center;width:100%;margin-top:2mm;padding-top:1mm;border-top:0.5px solid #e0e0e0;font-size:6pt;color:#aaa;">
    Laudo emitido com ajuda do <strong>LEO</strong> &middot; www.souleo.com.br
  </div>
</td></tr></tfoot>
<tbody><tr><td class="body-cell">
  <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">MEDIDAS E PARÂMETROS</div>
  <div style="border:1px solid #ddd;border-top:none;padding:0;">${paramsHTML}</div>
  <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;">COMENTÁRIOS</div>
  <div style="border:1px solid #ddd;border-top:none;padding:4px 8px;"><ul>${achadosHTML}</ul></div>
  <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;">CONCLUSÃO</div>
  <div style="border:1px solid #ddd;border-top:none;padding:4px 8px;"><ul>${concHTML}</ul></div>
</td></tr></tbody>
</table>
${imagensPdfHtml}
</body></html>`;
  }

  // ── PDF via window.open ──
  function handleImprimir() {
    const html = gerarPdfHtml();
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  // ── Copiar para Prontuário ──
  function handleCopiarFormatado() {
    // Usar MESMO HTML do PDF — garantia de formatação idêntica
    const rows = document.querySelectorAll('#params-tbody tr');
    let paramsRows = '';
    rows.forEach(tr => {
      let rowHTML = '<tr>';
      tr.querySelectorAll('td').forEach((td, idx) => {
        const divider = idx === 4 ? `border-left:2px solid ${p1};` : '';
        rowHTML += `<td style="border:0.5px solid #ccc;padding:2px 5px;${divider}">${td.innerHTML}</td>`;
      });
      rowHTML += '</tr>';
      paramsRows += rowHTML;
    });

    const paramsHTML = `<table style="border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:fixed;">
<colgroup><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/></colgroup>
<thead><tr>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Parâmetro</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Valor</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Unid.</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Referência</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;border-left:2px solid #fff;">Parâmetro</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Valor</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Unid.</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Referência</th>
</tr></thead><tbody>${paramsRows}</tbody></table>
<div style="font-size:5.5pt;color:#888;padding:2px 4px;">Valores de referência: ASE/EACVI 2015; ASE 2025.</div>`;

    const achadosHTMLContent = getAchadosHTML();
    const concHTMLContent = getConclusoesHTML();
    const achadosHTML = achadosHTMLContent
      ? `<div style="font-size:8.5pt;line-height:1.6;">${achadosHTMLContent}</div>`
      : coletarAchados().map(t => `<div style="font-size:8.5pt;line-height:1.6;">${t}</div>`).join('');
    const concHTML = concHTMLContent
      ? `<div style="font-size:8.5pt;line-height:1.6;">${concHTMLContent}</div>`
      : coletarConclusoes().map((t, i) => `<div style="font-size:8.5pt;line-height:1.6;"><strong>${i + 1}</strong> ${t}</div>`).join('');

    const temp = document.createElement('div');
    temp.style.cssText = 'font-family:IBM Plex Sans,Arial,sans-serif;font-size:8.5pt;color:#1a1a1a;';
    temp.innerHTML = `
      <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;">MEDIDAS E PARÂMETROS</div>
      <div style="border:1px solid #ddd;border-top:none;padding:0;">${paramsHTML}</div>
      <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:4px;">COMENTÁRIOS</div>
      <div style="border:1px solid #ddd;border-top:none;padding:4px 8px;">${achadosHTML}</div>
      <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:4px;">CONCLUSÃO</div>
      <div style="border:1px solid #ddd;border-top:none;padding:4px 8px;">${concHTML}</div>
    `;

    document.body.appendChild(temp);
    const range = document.createRange();
    range.selectNodeContents(temp);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand('copy');
    sel?.removeAllRanges();
    temp.remove();
    toast('Copiado — cole com Ctrl+V no Word, Tasy ou MV');
  }

  function handleCopiarTexto() {
    const achados = coletarAchados().join('\n');
    const conclusoes = coletarConclusoes().map((t, i) => `${i + 1}. ${t}`).join('\n');

    // Reconstruir tabela com alinhamento por tabulação
    const rows = document.querySelectorAll('#params-tbody tr');
    let params = '';
    rows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 8) {
        const left = `${(cells[0]?.textContent || '').padEnd(22)}${(cells[1]?.textContent || '').padStart(6)}  ${(cells[2]?.textContent || '').padEnd(4)}${(cells[3]?.textContent || '').padEnd(12)}`;
        const right = `${(cells[4]?.textContent || '').padEnd(24)}${(cells[5]?.textContent || '').padStart(6)}  ${(cells[6]?.textContent || '').padEnd(6)}${cells[7]?.textContent || ''}`;
        params += `${left}  │  ${right}\n`;
      }
    });

    const ref = 'Valores de referência: ASE/EACVI 2015; ASE 2025.';
    const texto = `MEDIDAS E PARÂMETROS\n${'─'.repeat(80)}\n${params}${'─'.repeat(80)}\n${ref}\n\nCOMENTÁRIOS\n${achados}\n\nCONCLUSÃO\n${conclusoes}`;

    navigator.clipboard.writeText(texto).then(() => {
      toast('Copiado texto simples — cole no prontuário');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Copiado texto simples');
    });
  }

  async function handleBaixarWord() {
    const rows = document.querySelectorAll('#params-tbody tr');
    const params: { cells: string[] }[] = [];
    rows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 8) {
        params.push({ cells: Array.from(cells).map(c => c.textContent || '') });
      }
    });

    const outNome = (document.getElementById('nome') as HTMLInputElement)?.value || 'PACIENTE';
    const outConv = (document.getElementById('convenio') as HTMLInputElement)?.value || '';
    const outDtex = (document.getElementById('dtexame') as HTMLInputElement)?.value || '';

    await gerarDocx({
      clinicaNome,
      medicoNome: (profile?.nome as string) || '',
      medicoCrm: `CRM/${profile?.ufCrm || ''} ${profile?.crm || ''}`,
      pacienteNome: outNome.trim().toUpperCase(),
      dataExame: outDtex,
      convenio: outConv,
      p1,
      params,
      achados: coletarAchados(),
      conclusoes: coletarConclusoes(),
    });

    toast('Word (.docx) baixado!');
  }

  function toast(msg: string) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1E293B;color:#fff;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:600;font-family:IBM Plex Sans,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // Formatar telefone: 9130854000 → (91) 3085-4000
  function fmtTel(t: string): string {
    const d = t.replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return t;
  }

  // Formatar CEP dentro do endereço: 66023700 → 66023-700
  function fmtCep(end: string): string {
    return end.replace(/(\d{5})(\d{3})/, '$1-$2');
  }

  function handleLimpar() {
    if (!confirm('Limpar todos os campos?')) return;
    // Limpar TODOS os campos do motor pelos IDs conhecidos (não depende de
    // a seção estar aberta/fechada no DOM). Mesma motivação do fix de
    // event-delegation acima — Sec só monta children quando `open=true`.
    const camposNum = [
      'peso','altura',
      'b7','b8','b9','b10','b11','b12','b13','b28','b29',
      'b19','b20','b21','b22','b23','b24','b24_diast','b25','lars',
      'b54','b33','gls_ve','gls_vd',
      'b45','b46','b47','b50','b51','b52','b46t','b47t','b50p',
      'psmap','b37',
      'wk-mob','wk-esp','wk-cal','wk-sub',
    ];
    const camposSel = [
      'sexo','ritmo',
      'b32','b34','b35','b36','b34t','b39','b40','b39p','b40p','b41','b42','b38',
      'b55','b56','b57','b58','b59','b60','b61','b62',
      'wilkins-toggle','diast-manual-sel',
    ];
    camposNum.forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = '';
    });
    camposSel.forEach(id => {
      const el = document.getElementById(id) as HTMLSelectElement | HTMLInputElement | null;
      if (!el) return;
      if (el instanceof HTMLSelectElement) el.selectedIndex = 0;
      else if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = false;
    });
    const dtEx = document.getElementById('dtexame') as HTMLInputElement;
    if (dtEx) dtEx.value = dataLocalHoje();
    safeCalc();
  }

  return (
    <div className={`h-screen grid grid-cols-[390px_1fr] overflow-hidden font-[family-name:var(--font-ibm-plex)] ${emitido ? 'laudo-locked' : ''}`}>
      {/* v3: alerta se motor falhou */}
      {motorErro && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center py-2 text-sm font-semibold">
          Motor de calculos indisponivel. <button onClick={() => window.location.reload()} className="underline ml-2">Recarregar pagina</button>
        </div>
      )}
      <SidebarLaudo
        clinicaNome={clinicaNome}
        medicoNome={profile?.nome as string || ''}
        medicoInfo={medicoInfo}
        onVoltar={handleVoltar}
        onSalvarEmitir={handleSalvarEmitir}
        onLimpar={handleLimpar}
        onImportarDicom={handleImportarDicom}
        dicomLoading={dicomLoading}
        dicomImportado={dicomImportado}
        ortancAtivo={!!workspace?.ortancAtivo}
        totalMedidasDicom={getInputsImportaveis().length}
        totalImagensDicom={((exame?.imagensDicom as string[] | undefined) || []).length}
        onAbrirGaleria={() => setGaleriaOpen(true)}
        emitido={emitido}
        readOnlyIdentificacao={!!(exame?.emitidoEm)}
        readOnlyMotor={emitido}
        exameOrigem={exame?.origem as string || ''}
        exameCpf={exame?.cpf as string || ''}
        feegowPacienteId={exame?.feegowPacienteId as string | number | null || null}
        exameAcc={exame?.acc as string || ''}
        modoEmitido={
          <ModoEmitido
            onFinalizar={handleFinalizar}
            onEditar={handleDesbloquear}
            onImprimir={handleImprimir}
            onCopiarFormatado={handleCopiarFormatado}
            onCopiarTexto={handleCopiarTexto}
            onBaixarWord={handleBaixarWord}
          />
        }
      />
      <SheetA4
        p1={p1}
        clinicaNome={clinicaNome}
        clinicaSlogan={clinicaSlogan}
        clinicaEnd={clinicaEnd}
        clinicaTel={telCompleto}
        sigTexto={sigTexto}
        logoB64={logoB64}
        sigB64={sigB64}
        editorLaudo={
          <EditorLaudo
            ref={editorRef}
            placeholder="Achados e conclusões do exame..."
            onAddFrase={() => {
              const w = window as unknown as Record<string, unknown>;
              const fn = w.abrirBanco as ((target: unknown, pos: string) => void);
              if (fn) fn(null, 'top');
            }}
          />
        }
      />
      {/* Popup Salvar/Emitir — agora mostra toggle "Incluir imagens DICOM"
          quando há selecionadas (decisão 15/05/2026). */}
      <PopupSalvarEmitir
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        onRascunho={handleRascunho}
        onEmitir={handleEmitir}
        totalImagensSelecionadas={imagensSelecionadasPdf.length}
      />
      {/* Modal de Import SR — validação 1-a-1 das medidas do Vivid antes
          de jogar no motor (decisão 15/05/2026). Aberto pelo botão
          "📡 Importar (N)" no sidebar. Filtra calculados (motor recalcula). */}
      <DicomSrImport
        open={srImportOpen}
        onClose={() => setSrImportOpen(false)}
        inputs={getInputsImportaveis()}
        pacienteNome={exame?.pacienteNome as string | undefined}
        onImportar={handleConfirmarImportSr}
      />
      {/* Galeria DICOM — modal full-screen (z-1000) com thumbnails e lightbox.
          Aberta pelo botão "🖼️ Imagens (N)" no sidebar. Modo seleção ON
          (decisão 14/05/2026) — médico marca quais vão pro PDF. */}
      <DicomGallery
        open={galeriaOpen}
        onClose={() => setGaleriaOpen(false)}
        imagens={(exame?.imagensDicom as string[] | undefined) || []}
        pacienteNome={exame?.pacienteNome as string | undefined}
        tipoExame={exame?.tipoExame as string | undefined}
        permitirSelecao
        selecionadas={imagensSelecionadasPdf}
        onToggleSelecao={handleToggleSelecaoImagem}
      />
      {/* CSS global */}
      <style jsx global>{`
        .sf{width:100%;border:1.5px solid #E5E7EB;border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#111827;background:#fff;transition:border-color .15s;}
        .sf:focus{outline:none;border-color:#1E3A5F;}
        #achados-body .linha-wrapper{display:flex;align-items:flex-start;gap:6px;padding:2px 0;border-bottom:1px solid #f1f5f9;margin:0;}
        #achados-body textarea{flex:1;border:none;resize:none;font-size:8.5pt;font-family:'IBM Plex Sans',sans-serif;line-height:1.5;padding:1px 3px;overflow:hidden;min-width:0;}
        #achados-body textarea:focus{background:#FFFBEB;border-radius:2px;outline:none;}
        #conclusao-list li{display:flex;align-items:flex-start;gap:6px;padding:3px 0;border-bottom:1px solid #f1f5f9;}
        .conclusao-text{flex:1;font-weight:500;font-size:8pt;line-height:1.5;outline:none;}
        .conclusao-text:focus{background:#FFFBEB;border-radius:2px;}

        /* ── TipTap: heading CONCLUSÃO dentro do editor ── */
        .tiptap h3{background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin:8px -8px 4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        .tiptap ol{list-style:decimal;padding-left:18px;margin:0;}
        .tiptap ol li{font-size:8.5pt;line-height:1.6;padding:1px 0;}
        .tiptap p{margin:0;padding:1px 0;}

        /* ── Botões achados/conclusões: +, ×, ⠿ ── */
        .btn-rm{background:none;border:none;color:#EF4444;font-size:14px;cursor:pointer;padding:0 2px;line-height:1;opacity:.4;transition:opacity .15s;flex-shrink:0;}
        .btn-rm:hover{opacity:1;}
        .btn-plus-inline{background:none;border:none;color:#F59E0B;font-size:16px;cursor:pointer;padding:0 2px;line-height:1;opacity:.4;transition:opacity .15s;flex-shrink:0;}
        .btn-plus-inline:hover{opacity:1;}
        .drag-handle{cursor:grab;color:#9CA3AF;font-size:10px;user-select:none;flex-shrink:0;padding:2px 0;opacity:.4;transition:opacity .15s;}
        .drag-handle:hover{opacity:1;color:#6B7280;}
        .drag-handle:active{cursor:grabbing;}
        .btn-add-top{display:block;width:100%;background:none;border:1px dashed #D1D5DB;border-radius:4px;padding:4px 0;color:#2563EB;font-size:9pt;font-weight:600;cursor:pointer;margin-top:4px;transition:background .15s,border-color .15s;}
        .btn-add-top:hover{background:#EFF6FF;border-color:#2563EB;}

        /* ── Drag & drop visual feedback ── */
        .linha-wrapper.dragging,.conc-wrapper.dragging{opacity:.4;background:#DBEAFE;}
        .linha-wrapper.drag-over,.conc-wrapper.drag-over{border-top:2px solid #2563EB;}
        .linha-wrapper{position:relative;}
        .conc-wrapper{position:relative;}

        /* ── Hover: mostrar botões só ao passar o mouse ── */
        .linha-wrapper .btn-rm,.linha-wrapper .btn-plus-inline,.linha-wrapper .drag-handle{opacity:0;transition:opacity .15s;}
        .linha-wrapper:hover .btn-rm,.linha-wrapper:hover .btn-plus-inline,.linha-wrapper:hover .drag-handle{opacity:.6;}
        .conc-wrapper .btn-rm,.conc-wrapper .drag-handle{opacity:0;transition:opacity .15s;}
        .conc-wrapper:hover .btn-rm,.conc-wrapper:hover .drag-handle{opacity:.6;}

        .params-divider{border-left:2px solid #8B1A1A!important;}

        /* ── Modal Banco de Frases ── */
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:none;align-items:center;justify-content:center;}
        .modal-overlay.open{display:flex;}
        .modal-box{background:#fff;border-radius:8px;width:680px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;}
        .modal-header{color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
        .modal-header h2{font-size:14px;font-weight:600;margin:0;}
        .modal-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;}
        .modal-search{padding:10px 16px;border-bottom:1px solid #E5E7EB;flex-shrink:0;}
        .modal-search input{width:100%;border:1.5px solid #E5E7EB;border-radius:5px;padding:7px 10px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;}
        .modal-search input:focus{outline:none;border-color:#1E3A5F;}
        .modal-cats{display:flex;gap:6px;padding:8px 16px;flex-wrap:wrap;border-bottom:1px solid #E5E7EB;flex-shrink:0;}
        .cat-btn{background:#F3F4F6;border:1.5px solid #E5E7EB;color:#6B7280;font-size:10.5px;padding:3px 10px;border-radius:20px;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;transition:all .12s;}
        .cat-btn.active,.cat-btn:hover{background:#1E3A5F;border-color:#1E3A5F;color:#fff;}
        .modal-list{flex:1;overflow-y:auto;padding:8px 16px;}
        .frase-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:5px;cursor:pointer;border:1px solid transparent;transition:all .12s;margin-bottom:3px;}
        .frase-item:hover{background:#EFF6FF;border-color:#E5E7EB;}
        .frase-item.selected{background:#EEF2F8;border-color:#1E3A5F;}
        .frase-text{flex:1;font-size:12px;color:#374151;line-height:1.4;}
        .frase-cat{font-size:10px;color:#6B7280;background:#F3F4F6;padding:1px 6px;border-radius:10px;flex-shrink:0;}
        .frase-btns{display:flex;gap:4px;flex-shrink:0;}
        .frase-btn-edit,.frase-btn-del{background:none;border:1px solid #E5E7EB;font-size:11px;padding:2px 6px;border-radius:3px;cursor:pointer;transition:all .12s;}
        .frase-btn-edit:hover{background:#EFF6FF;border-color:#1E3A5F;}
        .frase-btn-del:hover{background:#FEE2E2;border-color:#EF4444;color:#EF4444;}
        .modal-footer{padding:10px 16px;border-top:1px solid #E5E7EB;display:flex;gap:8px;justify-content:space-between;align-items:center;flex-shrink:0;}
        .modal-nova-frase{display:flex;gap:6px;flex:1;}
        .modal-nova-frase input{flex:1;border:1.5px solid #E5E7EB;border-radius:5px;padding:6px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;}
        .modal-nova-frase input:focus{outline:none;border-color:#1E3A5F;}
        .modal-nova-frase select{border:1.5px solid #E5E7EB;border-radius:5px;padding:6px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;background:#fff;}
        .btn-nova-add{background:#1E3A5F;color:#fff;border:none;padding:6px 14px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;}
        .btn-inserir{background:#2563EB;color:#fff;border:none;padding:8px 20px;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer;}
        .btn-inserir:disabled{background:#ccc;cursor:default;}

        /* ── Undo/Redo ── */
        .undo-redo-bar{display:flex;gap:4px;justify-content:flex-end;padding:2px 0;margin-bottom:2px;}
        .btn-undo,.btn-redo{background:none;border:1px solid #E5E7EB;color:#6B7280;font-size:12px;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;transition:all .12s;}
        .btn-undo:hover,.btn-redo:hover{background:#EFF6FF;border-color:#2563EB;color:#2563EB;}
        #params-tbody td{border:0.5px solid #ccc;padding:2px 5px;}
        .laudo-locked #laudo-sidebar input,.laudo-locked #laudo-sidebar select,.laudo-locked #laudo-sidebar textarea{pointer-events:none;opacity:.6;background:#f1f5f9;}
        .laudo-locked #laudo-sidebar .section-btn{pointer-events:none;opacity:.5;}
        .laudo-locked #modo-edicao{display:none;}
      `}</style>
    </div>
  );
}
