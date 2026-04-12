// ══════════════════════════════════════════════════════════════════
// MARINA · API Route — Assistente IA do Direx
// Claude API com tools para consultar/gerenciar o sistema
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ── Firebase Admin (server-side) ──
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const dbAdmin = getFirestore();

// ── Anthropic Client ──
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── System Prompt ──
const SYSTEM_PROMPT = `Voce e a Marina, assistente administrativa do LEO — Sistema de Laudos Medicos de Ecocardiografia.

Voce ajuda a diretoria a gerenciar o sistema: consultar dados de clientes, verificar planos, analisar consumo, dar creditos, e gerar relatorios.

PLANOS DO SISTEMA:
PF (Pessoa Fisica):
- Trial: Gratis/30 dias, 600 laudos, 5 locais, extratos ilimitados (= Expert por 30 dias)
- Remido: Gratis, tudo ilimitado (uso interno/VIP)
- Basic: R$99,99/mes, 100 laudos, 1 local (+R$50/extra), 2 extratos (+R$10), excedente R$1,50/laudo
- Profissional: R$199,99/mes, 350 laudos, 3 locais (+R$25), 10 extratos (+R$5), excedente R$0,75
- Expert: R$249,99/mes, 600 laudos, 5 locais (+R$10), extratos ilimitados, excedente R$0,50

PJ (Pessoa Juridica):
- Clinica Starter: R$299,99/mes, 3 usuarios (+R$66,99/extra), 300 laudos, locais ilimitados, extratos gratis, excedente R$1,50
- Clinica Pro: R$349,99/mes, 6 usuarios (+R$50/extra), 720 laudos, locais ilimitados, extratos gratis, excedente R$0,75
- Enterprise: R$599,99/mes, 9 usuarios (+R$10/extra), 1500 laudos, locais ilimitados, extratos gratis, excedente R$0,50

ESTRATEGIA: O Starter PJ e decoy (ancoragem). O Pro e o ancora (70% dos PJ). No Enterprise, usuario adicional barato (R$10) nao aumenta franquia de laudos — a monetizacao real vem do excedente.

Regras:
- Responda SEMPRE em portugues brasileiro
- Seja objetiva, profissional e amigavel
- Use as ferramentas disponiveis para buscar dados reais do sistema
- Nunca invente dados — sempre consulte as ferramentas
- Formate valores em reais (R$) e datas no formato brasileiro (DD/MM/AAAA)
- Quando listar dados, use formato organizado e legivel
- Se o admin pedir uma acao destrutiva, confirme antes de executar
- Ao mostrar dados de subscription, sempre informe: plano, tipo (PF/PJ), laudos, usuarios, locais`;

// ── Tools Definition ──
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_clientes',
    description: 'Busca workspaces/clientes do sistema. Pode filtrar por nome, tipo (PF/PJ), ou listar todos. Retorna workspace, tipo, dono, plano, uso, expiracao e status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filtro: { type: 'string', description: 'Texto para filtrar por nome, CPF, CNPJ ou email. Deixe vazio para listar todos.' },
      },
      required: [],
    },
  },
  {
    name: 'buscar_profissional',
    description: 'Busca profissionais (medicos/assistentes) cadastrados. Pode filtrar por nome, email, CPF ou CRM.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filtro: { type: 'string', description: 'Texto para filtrar por nome, email, CPF ou CRM.' },
      },
      required: [],
    },
  },
  {
    name: 'ver_subscription',
    description: 'Ve detalhes da subscription/plano de um workspace especifico. Mostra tipo, franquia, uso, creditos, vencimento.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace/clinica para buscar.' },
      },
      required: ['workspace_nome'],
    },
  },
  {
    name: 'ver_pagamentos',
    description: 'Lista historico de pagamentos. Pode filtrar por workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace para filtrar. Deixe vazio para todos.' },
      },
      required: [],
    },
  },
  {
    name: 'ver_consumo',
    description: 'Lista laudos emitidos (consumo). Pode filtrar por workspace. Mostra paciente, tipo exame, convenio, data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace para filtrar. Deixe vazio para todos.' },
      },
      required: [],
    },
  },
  {
    name: 'dar_creditos',
    description: 'Adiciona creditos de cortesia a um workspace. Requer workspace, quantidade e motivo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace que vai receber os creditos.' },
        quantidade: { type: 'number', description: 'Quantidade de creditos a adicionar.' },
        motivo: { type: 'string', description: 'Motivo da cortesia (obrigatorio).' },
      },
      required: ['workspace_nome', 'quantidade', 'motivo'],
    },
  },
  {
    name: 'gerar_relatorio',
    description: 'Gera relatorio financeiro consolidado com assinaturas ativas, receita, cancelamentos, inadimplentes, top clientes.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'bloquear_workspace',
    description: 'Bloqueia/suspende o acesso de um workspace. O usuario nao consegue mais emitir laudos. Use quando inadimplente ou por decisao administrativa.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace a bloquear.' },
        motivo: { type: 'string', description: 'Motivo do bloqueio.' },
      },
      required: ['workspace_nome', 'motivo'],
    },
  },
  {
    name: 'desbloquear_workspace',
    description: 'Desbloqueia/reativa o acesso de um workspace. Permite emitir laudos novamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace a desbloquear.' },
      },
      required: ['workspace_nome'],
    },
  },
  {
    name: 'renovar_trial',
    description: 'Estende o periodo de trial de um workspace por X dias.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace.' },
        dias: { type: 'number', description: 'Quantos dias estender. Default: 15.' },
      },
      required: ['workspace_nome'],
    },
  },
  {
    name: 'editar_licenca',
    description: 'Altera o plano de um workspace. Pode informar planoId (trial, remido, basic, profissional, expert, pj_starter, pj_pro, pj_enterprise) para auto-preencher todos os campos, ou alterar campos individuais.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace.' },
        plano_id: { type: 'string', description: 'ID do plano: trial, remido, basic, profissional, expert, pj_starter, pj_pro, pj_enterprise.' },
        franquia_mensal: { type: 'number', description: 'Nova franquia mensal de laudos (opcional se plano_id informado).' },
      },
      required: ['workspace_nome'],
    },
  },
  {
    name: 'registrar_pagamento',
    description: 'Registra um pagamento manual (Pix, transferencia, cartao). Grava no historico.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_nome: { type: 'string', description: 'Nome do workspace.' },
        valor: { type: 'number', description: 'Valor em reais.' },
        metodo: { type: 'string', description: 'Metodo: pix, cartao, transferencia ou cortesia.' },
        plano: { type: 'string', description: 'Plano referente: basic, profissional ou expert.' },
        referencia: { type: 'string', description: 'Mes/ano referente. Ex: 04/2026.' },
        obs: { type: 'string', description: 'Observacao opcional.' },
      },
      required: ['workspace_nome', 'valor', 'metodo'],
    },
  },
  {
    name: 'ver_logs',
    description: 'Mostra logs de auditoria do sistema. Pode filtrar por tipo de acao ou por texto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filtro: { type: 'string', description: 'Texto para filtrar logs (por tipo, workspace, etc).' },
        limite: { type: 'number', description: 'Quantidade de logs a retornar. Default: 20.' },
      },
      required: [],
    },
  },
  {
    name: 'ver_config_planos',
    description: 'Mostra a configuracao atual dos planos (preco, franquia, excedente) e parametros do sistema.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ── Tool Execution ──
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'buscar_clientes': {
        const filtro = ((input.filtro as string) || '').toLowerCase();
        const wsSnap = await dbAdmin.collection('workspaces').get();
        const subSnap = await dbAdmin.collection('subscriptions').get();
        const profSnap = await dbAdmin.collection('profissionais').get();

        const subs = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const profs = profSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const agora = Date.now();

        const rows = wsSnap.docs.map(d => {
          const ws = { id: d.id, ...d.data() } as Record<string, unknown>;
          const sub = subs.find((s: Record<string, unknown>) => s.workspaceId === ws.id) as Record<string, unknown> | undefined;
          const owner = profs.find((p: Record<string, unknown>) => p.uid === ws.ownerUid || p.id === ws.ownerUid) as Record<string, unknown> | undefined;
          const fim = sub?.cicloFim ? (sub.cicloFim as Timestamp).toDate() : null;
          const ativo = fim && agora <= fim.getTime();
          return {
            workspace: ws.nomeClinica || ws.id,
            tipo: ws.tipo || '?',
            dono: owner?.nome || '?',
            email: owner?.email || '',
            plano: sub?.tipo || 'sem plano',
            uso: `${sub?.franquiaUsada || 0}/${sub?.franquiaMensal || 0}`,
            creditos: sub?.creditosExtras || 0,
            expira: fim ? fim.toLocaleDateString('pt-BR') : 'N/A',
            status: ativo ? (sub?.tipo === 'trial' ? 'Trial' : 'Ativo') : 'Expirado',
          };
        }).filter(r => {
          if (!filtro) return true;
          return [r.workspace, r.dono, r.email].join(' ').toLowerCase().includes(filtro);
        });

        return JSON.stringify({ total: rows.length, clientes: rows.slice(0, 20) });
      }

      case 'buscar_profissional': {
        const filtro = ((input.filtro as string) || '').toLowerCase();
        const profSnap = await dbAdmin.collection('profissionais').get();
        const rows = profSnap.docs.map(d => {
          const p = d.data();
          return { nome: p.nome, email: p.email, cpf: p.cpf, crm: p.crm, uf: p.ufCrm, tipo: p.tipoPerfil, especialidade: p.especialidade };
        }).filter(r => {
          if (!filtro) return true;
          return [r.nome, r.email, r.cpf, r.crm].join(' ').toLowerCase().includes(filtro);
        });
        return JSON.stringify({ total: rows.length, profissionais: rows.slice(0, 20) });
      }

      case 'ver_subscription': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        const wsSnap = await dbAdmin.collection('workspaces').get();
        const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
        if (!ws) return JSON.stringify({ erro: 'Workspace nao encontrado' });

        const subSnap = await dbAdmin.collection('subscriptions').where('workspaceId', '==', ws.id).limit(1).get();
        if (subSnap.empty) return JSON.stringify({ workspace: ws.data().nomeClinica, erro: 'Sem subscription' });

        const sub = subSnap.docs[0].data();
        const fim = sub.cicloFim ? (sub.cicloFim as Timestamp).toDate() : null;
        return JSON.stringify({
          workspace: ws.data().nomeClinica,
          plano: sub.planoId || sub.tipo,
          tipoPlano: sub.tipoPlano || 'PF',
          tipo: sub.tipo,
          franquiaMensal: sub.franquiaMensal, franquiaUsada: sub.franquiaUsada,
          creditosExtras: sub.creditosExtras,
          maxLocais: sub.maxLocais === -1 ? 'Ilimitado' : (sub.maxLocais || 1),
          localAdicional: sub.localAdicional || 0,
          extratosFranquia: sub.extratosFranquia === -1 ? 'Ilimitado' : (sub.extratosFranquia ?? 2),
          extratoValor: sub.extratoValor || 0,
          excedente: sub.excedente || 0,
          maxUsuarios: sub.maxUsuarios || 1,
          usuarioAdicional: sub.usuarioAdicional || 0,
          expira: fim?.toLocaleDateString('pt-BR'),
          status: fim && Date.now() <= fim.getTime() ? 'Ativo' : 'Expirado',
        });
      }

      case 'ver_pagamentos': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        let wsId: string | null = null;
        if (nome) {
          const wsSnap = await dbAdmin.collection('workspaces').get();
          const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
          wsId = ws?.id || null;
        }
        let q = dbAdmin.collection('pagamentos').orderBy('criadoEm', 'desc').limit(20);
        if (wsId) q = dbAdmin.collection('pagamentos').where('workspaceId', '==', wsId).orderBy('criadoEm', 'desc').limit(20);
        const snap = await q.get();
        const rows = snap.docs.map(d => {
          const p = d.data();
          return {
            data: p.criadoEm ? (p.criadoEm as Timestamp).toDate().toLocaleDateString('pt-BR') : 'N/A',
            valor: p.valor, metodo: p.metodo, plano: p.plano, status: p.status, obs: p.obs,
          };
        });
        return JSON.stringify({ total: rows.length, pagamentos: rows });
      }

      case 'ver_consumo': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        let wsId: string | null = null;
        if (nome) {
          const wsSnap = await dbAdmin.collection('workspaces').get();
          const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
          wsId = ws?.id || null;
        }
        let q = dbAdmin.collection('consumo').orderBy('emitidoEm', 'desc').limit(30);
        if (wsId) q = dbAdmin.collection('consumo').where('workspaceId', '==', wsId).orderBy('emitidoEm', 'desc').limit(30);
        const snap = await q.get();
        const rows = snap.docs.map(d => {
          const c = d.data();
          return {
            data: c.emitidoEm ? (c.emitidoEm as Timestamp).toDate().toLocaleDateString('pt-BR') : 'N/A',
            paciente: c.pacienteNome, tipoExame: c.tipoExame, convenio: c.convenio,
            tipo: c.tipo, reemissao: c.reemissao,
          };
        });
        return JSON.stringify({ total: rows.length, consumo: rows });
      }

      case 'dar_creditos': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        const quantidade = (input.quantidade as number) || 0;
        const motivo = (input.motivo as string) || '';
        if (!quantidade || !motivo) return JSON.stringify({ erro: 'Quantidade e motivo sao obrigatorios' });

        const wsSnap = await dbAdmin.collection('workspaces').get();
        const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
        if (!ws) return JSON.stringify({ erro: 'Workspace nao encontrado' });

        const subSnap = await dbAdmin.collection('subscriptions').where('workspaceId', '==', ws.id).limit(1).get();
        if (subSnap.empty) return JSON.stringify({ erro: 'Sem subscription ativa' });

        const sub = subSnap.docs[0];
        const saldoAnterior = sub.data().creditosExtras || 0;
        const saldoNovo = Math.max(0, saldoAnterior + quantidade);

        await sub.ref.update({ creditosExtras: saldoNovo });
        await dbAdmin.collection('creditosLog').add({
          workspaceId: ws.id, quantidade, tipo: 'cortesia', motivo,
          saldoAnterior, saldoNovo, dadoPor: 'marina-ia',
          criadoEm: Timestamp.now(),
        });

        return JSON.stringify({
          sucesso: true, workspace: ws.data().nomeClinica,
          creditosAnterior: saldoAnterior, creditosNovo: saldoNovo, motivo,
        });
      }

      case 'gerar_relatorio': {
        const wsSnap = await dbAdmin.collection('workspaces').get();
        const subSnap = await dbAdmin.collection('subscriptions').get();
        const pagSnap = await dbAdmin.collection('pagamentos').get();
        const profSnap = await dbAdmin.collection('profissionais').get();

        const agora = Date.now();
        const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const subs = subSnap.docs.map(d => d.data());
        const wsDocs = wsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const wsPF = wsDocs.filter((w: Record<string, unknown>) => w.tipo === 'PF');
        const wsPJ = wsDocs.filter((w: Record<string, unknown>) => w.tipo === 'PJ');

        const ativas = subs.filter(s => { const f = s.cicloFim ? (s.cicloFim as Timestamp).toDate() : null; return f && agora <= f.getTime(); });
        const pagas = ativas.filter(s => s.tipo === 'paid');
        const trials = ativas.filter(s => s.tipo === 'trial');
        const expiradas = subs.length - ativas.length;
        const cancelamentos = subs.filter(s => s.tipo === 'paid' && s.cicloFim && agora > (s.cicloFim as Timestamp).toDate().getTime()).length;

        // Separar PF/PJ
        const ativasPF = pagas.filter(s => wsPF.some((w: Record<string, unknown>) => w.id === s.workspaceId));
        const ativasPJ = pagas.filter(s => wsPJ.some((w: Record<string, unknown>) => w.id === s.workspaceId));

        const pagsMes = pagSnap.docs.filter(d => {
          const ts = d.data().criadoEm ? (d.data().criadoEm as Timestamp).toDate() : null;
          return ts && ts >= inicioMes && d.data().status === 'confirmado';
        });
        const receitaMes = pagsMes.reduce((a, d) => a + (d.data().valor || 0), 0);
        const receitaPF = pagsMes.filter(d => wsPF.some((w: Record<string, unknown>) => w.id === d.data().workspaceId)).reduce((a, d) => a + (d.data().valor || 0), 0);
        const receitaPJ = pagsMes.filter(d => wsPJ.some((w: Record<string, unknown>) => w.id === d.data().workspaceId)).reduce((a, d) => a + (d.data().valor || 0), 0);

        const totalFranquia = subs.reduce((a, s) => a + (s.franquiaMensal || 0), 0);
        const totalUsada = subs.reduce((a, s) => a + (s.franquiaUsada || 0), 0);

        return JSON.stringify({
          totalWorkspaces: wsSnap.size, totalWorkspacesPF: wsPF.length, totalWorkspacesPJ: wsPJ.length,
          totalProfissionais: profSnap.size,
          subsAtivas: ativas.length, subsPagas: pagas.length, subsTrials: trials.length,
          assinantesPF: ativasPF.length, assinantesPJ: ativasPJ.length,
          subsExpiradas: expiradas, cancelamentos,
          receitaMes: `R$ ${receitaMes.toFixed(2)}`, receitaPF: `R$ ${receitaPF.toFixed(2)}`, receitaPJ: `R$ ${receitaPJ.toFixed(2)}`,
          totalPagamentosMes: pagsMes.length,
          franquiaTotal: totalFranquia, franquiaUsada: totalUsada,
          percentualUso: totalFranquia > 0 ? `${Math.round((totalUsada / totalFranquia) * 100)}%` : '0%',
        });
      }

      case 'bloquear_workspace': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        const motivo = (input.motivo as string) || '';
        if (!motivo) return JSON.stringify({ erro: 'Motivo e obrigatorio' });

        const wsSnap = await dbAdmin.collection('workspaces').get();
        const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
        if (!ws) return JSON.stringify({ erro: 'Workspace nao encontrado' });

        const subSnap = await dbAdmin.collection('subscriptions').where('workspaceId', '==', ws.id).limit(1).get();
        if (subSnap.empty) return JSON.stringify({ erro: 'Sem subscription' });

        // Zerar franquia e creditos = bloqueio efetivo (nao consegue emitir)
        await subSnap.docs[0].ref.update({ franquiaMensal: 0, creditosExtras: 0 });
        await dbAdmin.collection('logs').add({
          tipo: 'bloqueio', wsId: ws.id, motivo, ts: Timestamp.now(), medicoUid: 'marina-ia',
        });

        return JSON.stringify({ sucesso: true, workspace: ws.data().nomeClinica, acao: 'bloqueado', motivo });
      }

      case 'desbloquear_workspace': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        const wsSnap = await dbAdmin.collection('workspaces').get();
        const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
        if (!ws) return JSON.stringify({ erro: 'Workspace nao encontrado' });

        const subSnap = await dbAdmin.collection('subscriptions').where('workspaceId', '==', ws.id).limit(1).get();
        if (subSnap.empty) return JSON.stringify({ erro: 'Sem subscription' });

        // Restaurar franquia baseada no plano
        const planoId = subSnap.docs[0].data().planoId || 'basic';
        const franquias: Record<string, number> = { trial: 600, remido: 9999, basic: 100, profissional: 350, expert: 600 };
        const franquiaRestaurada = franquias[planoId] || 100;
        await subSnap.docs[0].ref.update({ franquiaMensal: franquiaRestaurada });
        await dbAdmin.collection('logs').add({
          tipo: 'desbloqueio', wsId: ws.id, planoId, ts: Timestamp.now(), medicoUid: 'marina-ia',
        });

        return JSON.stringify({ sucesso: true, workspace: ws.data().nomeClinica, acao: 'desbloqueado', plano: planoId, franquiaRestaurada });
      }

      case 'renovar_trial': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        const dias = (input.dias as number) || 15;
        const wsSnap = await dbAdmin.collection('workspaces').get();
        const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
        if (!ws) return JSON.stringify({ erro: 'Workspace nao encontrado' });

        const subSnap = await dbAdmin.collection('subscriptions').where('workspaceId', '==', ws.id).limit(1).get();
        if (subSnap.empty) return JSON.stringify({ erro: 'Sem subscription' });

        const novaData = new Date(Date.now() + dias * 864e5);
        await subSnap.docs[0].ref.update({ cicloFim: Timestamp.fromDate(novaData) });
        await dbAdmin.collection('logs').add({
          tipo: 'renovacao_trial', wsId: ws.id, dias, novaExpiracao: novaData.toLocaleDateString('pt-BR'),
          ts: Timestamp.now(), medicoUid: 'marina-ia',
        });

        return JSON.stringify({
          sucesso: true, workspace: ws.data().nomeClinica,
          diasAdicionados: dias, novaExpiracao: novaData.toLocaleDateString('pt-BR'),
        });
      }

      case 'editar_licenca': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        const wsSnap = await dbAdmin.collection('workspaces').get();
        const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
        if (!ws) return JSON.stringify({ erro: 'Workspace nao encontrado' });

        const subSnap = await dbAdmin.collection('subscriptions').where('workspaceId', '==', ws.id).limit(1).get();
        if (subSnap.empty) return JSON.stringify({ erro: 'Sem subscription' });

        const updates: Record<string, unknown> = {};

        // Se plano_id informado, auto-preenche todos os campos do plano
        const planoId = input.plano_id as string;
        if (planoId) {
          const planosMap: Record<string, Record<string, unknown>> = {
            trial: { planoId: 'trial', tipo: 'trial', tipoPlano: 'PF', franquiaMensal: 600, excedente: 0, maxLocais: 5, localAdicional: 0, extratosFranquia: -1, extratoValor: 0, maxUsuarios: 1, usuarioAdicional: 0 },
            remido: { planoId: 'remido', tipo: 'paid', tipoPlano: 'PF', franquiaMensal: 9999, excedente: 0, maxLocais: 99, localAdicional: 0, extratosFranquia: -1, extratoValor: 0, maxUsuarios: 99, usuarioAdicional: 0 },
            basic: { planoId: 'basic', tipo: 'paid', tipoPlano: 'PF', franquiaMensal: 100, excedente: 1.50, maxLocais: 1, localAdicional: 50, extratosFranquia: 2, extratoValor: 10, maxUsuarios: 1, usuarioAdicional: 0 },
            profissional: { planoId: 'profissional', tipo: 'paid', tipoPlano: 'PF', franquiaMensal: 350, excedente: 0.75, maxLocais: 3, localAdicional: 25, extratosFranquia: 10, extratoValor: 5, maxUsuarios: 1, usuarioAdicional: 0 },
            expert: { planoId: 'expert', tipo: 'paid', tipoPlano: 'PF', franquiaMensal: 600, excedente: 0.50, maxLocais: 5, localAdicional: 10, extratosFranquia: -1, extratoValor: 0, maxUsuarios: 1, usuarioAdicional: 0 },
            pj_starter: { planoId: 'pj_starter', tipo: 'paid', tipoPlano: 'PJ', franquiaMensal: 300, excedente: 1.50, maxLocais: -1, localAdicional: 0, extratosFranquia: -1, extratoValor: 0, maxUsuarios: 3, usuarioAdicional: 66.99 },
            pj_pro: { planoId: 'pj_pro', tipo: 'paid', tipoPlano: 'PJ', franquiaMensal: 720, excedente: 0.75, maxLocais: -1, localAdicional: 0, extratosFranquia: -1, extratoValor: 0, maxUsuarios: 6, usuarioAdicional: 50 },
            pj_enterprise: { planoId: 'pj_enterprise', tipo: 'paid', tipoPlano: 'PJ', franquiaMensal: 1500, excedente: 0.50, maxLocais: -1, localAdicional: 0, extratosFranquia: -1, extratoValor: 0, maxUsuarios: 9, usuarioAdicional: 10 },
          };
          const planoConfig = planosMap[planoId];
          if (!planoConfig) return JSON.stringify({ erro: `Plano ${planoId} nao encontrado. Opcoes: ${Object.keys(planosMap).join(', ')}` });
          Object.assign(updates, planoConfig);
        } else {
          if (input.franquia_mensal) updates.franquiaMensal = input.franquia_mensal;
          if (Object.keys(updates).length === 0) return JSON.stringify({ erro: 'Informe plano_id ou franquia_mensal' });
        }

        await subSnap.docs[0].ref.update(updates);
        await dbAdmin.collection('logs').add({
          tipo: 'edicao_licenca', wsId: ws.id, planoId: planoId || 'manual', alteracoes: updates,
          ts: Timestamp.now(), medicoUid: 'marina-ia',
        });

        return JSON.stringify({ sucesso: true, workspace: ws.data().nomeClinica, plano: planoId || 'manual', alteracoes: updates });
      }

      case 'registrar_pagamento': {
        const nome = ((input.workspace_nome as string) || '').toLowerCase();
        const wsSnap = await dbAdmin.collection('workspaces').get();
        const ws = wsSnap.docs.find(d => (d.data().nomeClinica || '').toLowerCase().includes(nome));
        if (!ws) return JSON.stringify({ erro: 'Workspace nao encontrado' });

        const valor = (input.valor as number) || 0;
        const metodo = (input.metodo as string) || 'pix';
        if (!valor) return JSON.stringify({ erro: 'Valor e obrigatorio' });

        const ref = await dbAdmin.collection('pagamentos').add({
          workspaceId: ws.id, valor, metodo, status: 'confirmado', gateway: 'manual',
          plano: input.plano || '', referencia: input.referencia || '',
          registradoPor: 'marina-ia', obs: input.obs || '',
          criadoEm: Timestamp.now(), confirmadoEm: Timestamp.now(),
        });

        return JSON.stringify({
          sucesso: true, workspace: ws.data().nomeClinica,
          pagamentoId: ref.id, valor: `R$ ${valor.toFixed(2)}`, metodo,
        });
      }

      case 'ver_logs': {
        const filtro = ((input.filtro as string) || '').toLowerCase();
        const limite = (input.limite as number) || 20;
        const snap = await dbAdmin.collection('logs').orderBy('ts', 'desc').limit(limite).get();
        const rows = snap.docs.map(d => {
          const l = d.data();
          return {
            data: l.ts ? (l.ts as Timestamp).toDate().toLocaleDateString('pt-BR') + ' ' +
              (l.ts as Timestamp).toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
            tipo: l.tipo, medicoUid: l.medicoUid ? String(l.medicoUid).substring(0, 12) : '',
            wsId: l.wsId || '', detalhes: JSON.stringify(l).substring(0, 150),
          };
        }).filter(r => {
          if (!filtro) return true;
          return JSON.stringify(r).toLowerCase().includes(filtro);
        });
        return JSON.stringify({ total: rows.length, logs: rows });
      }

      case 'ver_config_planos': {
        const snap = await dbAdmin.collection('configPlanos').doc('atual').get();
        if (snap.exists) {
          return JSON.stringify(snap.data());
        }
        // Retorna defaults
        return JSON.stringify({
          planos: [
            { id: 'basic', nome: 'Basic', preco: 99, franquia: 100, excedente: 1.50 },
            { id: 'profissional', nome: 'Profissional', preco: 189.99, franquia: 350, excedente: 0.75 },
            { id: 'expert', nome: 'Expert', preco: 249.99, franquia: 500, excedente: 0.50 },
          ],
          carenciaDias: 3, rateLimitEmissao: 20,
        });
      }

      default:
        return JSON.stringify({ erro: `Tool ${name} nao encontrada` });
    }
  } catch (e) {
    return JSON.stringify({ erro: `Erro ao executar ${name}: ${(e as Error).message}` });
  }
}

// ── POST Handler ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mensagem, historico } = body as {
      mensagem: string;
      historico: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!mensagem) return NextResponse.json({ ok: false, error: 'Mensagem vazia' }, { status: 400 });

    // Montar mensagens
    const messages: Anthropic.MessageParam[] = [
      ...(historico || []).map((h: { role: 'user' | 'assistant'; content: string }) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: mensagem },
    ];

    // Chamar Claude com tools (loop ate ter resposta final)
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Tool use loop
    while (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use');

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolBlocks) {
        if (tb.type !== 'tool_use') continue;
        const result = await executeTool(tb.name, tb.input as Record<string, unknown>);
        toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result });
      }

      messages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] });
      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    }

    // Extrair texto da resposta
    const texto = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    return NextResponse.json({ ok: true, resposta: texto });
  } catch (e) {
    console.error('Marina API error:', e);
    return NextResponse.json({ ok: false, error: 'Erro interno da Marina' }, { status: 500 });
  }
}
