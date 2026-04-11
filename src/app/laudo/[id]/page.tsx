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
import { getExame, saveExame, emitExame, logAction } from '@/lib/firestore';
import { dataLocalHoje } from '@/lib/utils';
import { checkEmissao, consumirEmissao } from '@/lib/billing';
import SidebarLaudo from '@/components/laudo/SidebarLaudo';
import SheetA4 from '@/components/laudo/SheetA4';
import EditorLaudo from '@/components/laudo/EditorLaudo';
import type { EditorLaudoRef } from '@/components/laudo/EditorLaudo';
import { PopupSalvarEmitir, ModoEmitido } from '@/components/laudo/PopupEmitir';

export default function LaudoPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, workspace } = useAuth();
  const [motorLoaded, setMotorLoaded] = useState(false);
  const [exame, setExame] = useState<Record<string, unknown> | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [emitido, setEmitido] = useState(false);
  const achadosRef = useRef<EditorLaudoRef>(null);
  const conclusoesRef = useRef<EditorLaudoRef>(null);
  const pendingAchados = useRef<string | null>(null);
  const pendingConclusoes = useRef<string | null>(null);

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

  // Processar conteúdo pendente — roda continuamente até entregar
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingAchados.current && achadosRef.current) {
        achadosRef.current.setContent(pendingAchados.current);
        pendingAchados.current = null;
      }
      if (pendingConclusoes.current && conclusoesRef.current) {
        conclusoesRef.current.setContent(pendingConclusoes.current);
        pendingConclusoes.current = null;
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Carregar exame
  useEffect(() => {
    if (workspace?.id && exameId) {
      getExame(workspace.id, exameId).then(ex => { if (ex) setExame(ex); });
    }
  }, [workspace?.id, exameId]);

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

    // Callbacks TipTap — motor chama estes ao renderizar achados/conclusões
    // Motor gera achados → atualiza TipTap (só se médico não editou manualmente)
    w._onAchadosGerados = (linhas: string[]) => {
      const html = linhas.map(l => `<p>${l}</p>`).join('');
      if (achadosRef.current) {
        achadosRef.current.setContent(html);
      } else {
        pendingAchados.current = html;
      }
    };
    w._onConclusoesGeradas = (concs: string[]) => {
      const html = concs.map((c, i) => `<p><strong>${i + 1}</strong>  ${c}</p>`).join('');
      if (conclusoesRef.current) {
        conclusoesRef.current.setContent(html);
      } else {
        pendingConclusoes.current = html;
      }
    };
    w._onInserirFrase = (texto: string) => {
      if (achadosRef.current) achadosRef.current.insertLine(texto);
    };

    const script = document.createElement('script');
    script.src = '/motor/motorv8mp4.js';
    script.onload = () => {
      setMotorLoaded(true);
      setTimeout(() => {
        try {
          const calcFn = (window as unknown as Record<string, unknown>).calc as (() => void) | undefined;
          if (calcFn) {
            const sc = () => { try { calcFn(); } catch (e) { console.warn('calc:', e); } };
            document.querySelectorAll('#laudo-sidebar input, #laudo-sidebar select').forEach(el => {
              el.addEventListener('input', sc);
              el.addEventListener('change', sc);
            });
            preencherExame();
            sc();
          }
        } catch (e) { console.warn('motor:', e); }
      }, 500);
    };
    document.body.appendChild(script);
    return () => { try { document.body.removeChild(script); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function safeCalc() {
    try { const c = (window as unknown as Record<string, unknown>).calc as (() => void); if (c) c(); } catch (e) { console.warn('calc:', e); }
  }

  function preencherExame() {
    if (!exame) return;

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
    } else {
      setVal('nome', exame.pacienteNome as string || '');
      setVal('dtnasc', exame.pacienteDtnasc as string || '');
      setVal('dtexame', exame.dataExame as string || dataLocalHoje());
      setVal('convenio', exame.convenio as string || '');
      setVal('solicitante', exame.solicitante as string || '');
      setVal('sexo', exame.sexo as string || '');
    }
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

  async function handleEmitir() {
    setPopupOpen(false);
    if (!workspace?.id || !exameId || !user?.uid) return;

    const medidas = coletarMedidas();
    const achados = coletarAchados();
    const conclusoes = coletarConclusoes();

    const ok = await emitExame(workspace.id, exameId, {
      medidas, achados, conclusoes,
      ...coletarIdentificacao(),
      cfgSnapshot: { clinica: clinicaNome, slogan: clinicaSlogan, localEnd: clinicaEnd, localTel: clinicaTel, medNome: profile?.nome, medCrm: profile?.crm, medUf: profile?.ufCrm, p1 },
    }, user.uid);

    if (ok) {
      // Billing: cobrar se nunca emitido OU se identificação foi alterada (anti-fraude)
      const jaEmitido = !!(exame?.emitidoEm);
      const idMudou = jaEmitido && identificacaoMudou();
      const deveCobar = !jaEmitido || idMudou;

      if (deveCobar) {
        const check = await checkEmissao(workspace.id);
        if (check.pode && check.tipo) await consumirEmissao(workspace.id, check.tipo);
      }
      await logAction('emissao', { exameId, wsId: workspace.id, reemissao: jaEmitido, identificacaoAlterada: idMudou }, user.uid);

      try { localStorage.removeItem(`rascunho_${exameId}`); } catch { /* */ }

      // Atualizar status no Feegow se veio de lá
      if (exame?.feegowAppointId) {
        try {
          await fetch('/api/feegow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'atualizar_status', agendamento_id: exame.feegowAppointId, status_id: 3 }),
          });
        } catch { /* não bloquear emissão se Feegow falhar */ }
      }

      setEmitido(true);
      toast('Laudo emitido e assinado');
      setTimeout(() => handleImprimir(), 500);
    } else {
      toast('Erro ao emitir laudo');
    }
  }

  function handleDesbloquear() {
    setEmitido(false);
    toast('Laudo desbloqueado para edição');
  }

  function handleFinalizar() {
    toast('Atendimento finalizado');
    router.push('/dashboard');
  }

  // ── Coletar achados e conclusões (TipTap ou DOM fallback) ──
  function coletarAchados(): string[] {
    if (achadosRef.current) return achadosRef.current.getLines();
    const items: string[] = [];
    document.querySelectorAll('#achados-body .linha-wrapper').forEach(w => {
      const ta = w.querySelector('textarea') as HTMLTextAreaElement | null;
      if (ta && ta.value.trim()) items.push(ta.value.trim());
    });
    return items;
  }

  function coletarConclusoes(): string[] {
    if (conclusoesRef.current) return conclusoesRef.current.getLines();
    const items: string[] = [];
    document.querySelectorAll('#conclusao-list li').forEach(li => {
      const el = li.querySelector('.conclusao-text') as HTMLElement | null;
      if (el) {
        const txt = (el.innerText || el.textContent || '').trim();
        if (txt) items.push(txt);
      }
    });
    return items;
  }

  // HTML dos editores para o PDF
  function getAchadosHTML(): string {
    return achadosRef.current?.getHTML() || document.getElementById('achados-body')?.innerHTML || '';
  }
  function getConclusoesHTML(): string {
    return conclusoesRef.current?.getHTML() || document.getElementById('conclusao-list')?.innerHTML || '';
  }

  // ── PDF via window.open — HTML completamente autônomo ──
  function handleImprimir() {
    const nome = (document.getElementById('nome') as HTMLInputElement)?.value || 'PACIENTE';
    const nomeArq = 'ECOTT ' + nome.trim().toUpperCase();

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
</tr></thead><tbody>${paramsRows}</tbody></table>`;

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

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${nomeArq}</title>
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
</table></body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 600);
    }
  }

  // ── Copiar para Prontuário ──
  function handleCopiarFormatado() {
    // Copia parâmetros + comentários + conclusão COM formatação
    const paramsEl = document.querySelector('#laudo-sheet table');
    const achadosEl = document.getElementById('achados-body');
    const concEl = document.getElementById('conclusao-list');

    // Criar container temporário com só o corpo
    const temp = document.createElement('div');
    if (paramsEl) temp.appendChild(paramsEl.cloneNode(true));
    if (achadosEl) temp.appendChild(achadosEl.cloneNode(true));
    if (concEl) { const ul = concEl.cloneNode(true); temp.appendChild(ul); }

    document.body.appendChild(temp);
    const range = document.createRange();
    range.selectNodeContents(temp);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand('copy');
    sel?.removeAllRanges();
    temp.remove();
    toast('Copiado formatado — cole no Tasy, MV ou Word');
  }

  function handleCopiarTexto() {
    // Copia só texto sem formatação
    const achados = coletarAchados().join('\n');
    const conclusoes = coletarConclusoes().map((t, i) => `${i + 1}. ${t}`).join('\n');
    const params = document.getElementById('params-tbody')?.innerText || '';
    const texto = `MEDIDAS E PARÂMETROS\n${params}\n\nCOMENTÁRIOS\n${achados}\n\nCONCLUSÃO\n${conclusoes}`;

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
    document.querySelectorAll('#laudo-sidebar input[type=number], #laudo-sidebar input[type=text]').forEach(el => {
      (el as HTMLInputElement).value = '';
    });
    document.querySelectorAll('#laudo-sidebar select').forEach(el => {
      (el as HTMLSelectElement).selectedIndex = 0;
    });
    const dtEx = document.getElementById('dtexame') as HTMLInputElement;
    if (dtEx) dtEx.value = dataLocalHoje();
    safeCalc();
  }

  return (
    <div className={`h-screen grid grid-cols-[390px_1fr] overflow-hidden font-[family-name:var(--font-ibm-plex)] ${emitido ? 'laudo-locked' : ''}`}>
      <SidebarLaudo
        clinicaNome={clinicaNome}
        medicoNome={profile?.nome as string || ''}
        medicoInfo={medicoInfo}
        onVoltar={handleVoltar}
        onSalvarEmitir={handleSalvarEmitir}
        onLimpar={handleLimpar}
        emitido={emitido}
        readOnlyIdentificacao={!!(exame?.emitidoEm)}
        modoEmitido={
          <ModoEmitido
            onVoltar={handleVoltar}
            onFinalizar={handleFinalizar}
            onEditar={handleDesbloquear}
            onImprimir={handleImprimir}
            onCopiarFormatado={handleCopiarFormatado}
            onCopiarTexto={handleCopiarTexto}
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
        editorAchados={
          <EditorLaudo
            ref={achadosRef}
            placeholder="Achados do exame..."
            minHeight="80px"
            onAddFrase={() => {
              const w = window as unknown as Record<string, unknown>;
              const fn = w.abrirBanco as ((target: unknown, pos: string) => void);
              if (fn) fn(null, 'top');
            }}
          />
        }
        editorConclusoes={
          <EditorLaudo
            ref={conclusoesRef}
            placeholder="Conclusão..."
            minHeight="30px"
          />
        }
      />
      {/* Popup */}
      <PopupSalvarEmitir
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        onRascunho={handleRascunho}
        onEmitir={handleEmitir}
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
