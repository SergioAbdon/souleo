// ══════════════════════════════════════════════════════════════════
// LEO · Signup server-side (Admin SDK) — Secao 1, Plano 2A
// Cria a conta INTEIRA no modelo novo em UMA transacao (leitura do perfil
// inclusa): ou nasce tudo ou nao nasce nada, e duplo-clique nao produz dois
// cadastros. No rollback, apaga o Auth user para nao deixar email orfao
// (retry daria email-already-in-use para sempre).
//
// SEM imports relativos de proposito: os testes (tests/api/signup.test.mjs)
// importam este arquivo direto no node --test via type stripping do Node 24,
// que nao resolve alias @/ nem import relativo sem extensao.
// ══════════════════════════════════════════════════════════════════
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

export type DadosSignup = {
  nome: string; email: string; crm?: string; ufCrm?: string;
  especialidade?: string; tipoPerfil: 'medico' | 'assistente';
};

export type ResultadoSignup =
  | { ok: true; contaId: string; wsId: string }
  | { ok: false; motivo: 'dados_invalidos' | 'ja_cadastrado' | 'erro' };

// Espelho de CrmVerificacao/VerificarCrm (src/lib/verificar-crm.ts). Duplicado
// aqui porque este arquivo nao pode ter import relativo (ver topo) — a rota
// injeta a funcao real por parametro (DI).
type CrmVerificacao = { status: 'nao_verificado' | 'verificado' | 'reprovado'; fonte: string; checadoEm: string | null };
type VerificarCrm = (crm: string, uf: string) => Promise<CrmVerificacao>;

// Espelho da linha 'trial' de PLANOS_DEFAULT (src/lib/billing.ts:69).
// Duplicado aqui porque este arquivo nao pode ter import relativo (ver topo).
// Se configPlanos/atual existir no banco, ele vence — isto e so a rede.
const TRIAL_FALLBACK = {
  id: 'trial', tipo: 'PF', franquia: 600, excedente: 0, maxLocais: 5,
  localAdicional: 0, extratosFranquia: -1, extratoValor: 0,
  maxUsuarios: 1, usuarioAdicional: 0,
};

async function planoTrial(db: Firestore) {
  try {
    const snap = await db.doc('configPlanos/atual').get();
    const planos = (snap.data()?.planos ?? []) as Array<Record<string, unknown>>;
    const trial = planos.find(p => p.id === 'trial');
    if (trial) return { ...TRIAL_FALLBACK, ...trial };
  } catch { /* config indisponivel → fallback */ }
  return TRIAL_FALLBACK;
}

// Espelho de TIPOS_LAUDO_PADRAO (src/lib/tipos-laudo.ts) — inline porque este
// arquivo nao pode ter import relativo (ver topo). Teste de api
// (tests/api/signup.test.mjs) importa os dois e compara campo a campo —
// qualquer drift entre os espelhos quebra o teste (tripwire).
const TIPOS_PADRAO = [
  { id: 'eco_tt', nome: 'Eco Transtorácico', icone: '🫀', ativo: true, ordem: 1, modalidade: 'motor', motorId: 'senna' },
  { id: 'eco_te', nome: 'Eco Transesofágico', icone: '🫀', ativo: true, ordem: 2, modalidade: 'motor', motorId: 'senna' },
  { id: 'eco_stress', nome: 'Eco Stress', icone: '🫀', ativo: true, ordem: 3, modalidade: 'motor', motorId: 'senna' },
  {
    id: 'doppler_carotidas', nome: 'Doppler de Carótidas', icone: '🩺', ativo: true, ordem: 4, modalidade: 'texto',
    modeloTexto: [
      '<h2>DOPPLER DE CARÓTIDAS E VERTEBRAIS</h2>',
      '<p><strong>Técnica:</strong> exame realizado com transdutor linear, em repouso, com análise bidimensional, Doppler colorido e espectral.</p>',
      '<p><strong>Carótidas comuns:</strong> trajeto, calibre e fluxo preservados bilateralmente.</p>',
      '<p><strong>Bulbos e bifurcações:</strong> sem placas ou espessamento médio-intimal significativo.</p>',
      '<p><strong>Carótidas internas:</strong> fluxo preservado, sem estenoses hemodinamicamente significativas.</p>',
      '<p><strong>Carótidas externas:</strong> sem alterações.</p>',
      '<p><strong>Vertebrais:</strong> fluxo anterógrado bilateral.</p>',
      '<h3>CONCLUSÃO</h3>',
      '<p>Exame dentro dos limites da normalidade.</p>',
    ].join(''),
  },
  { id: 'ecg', nome: 'ECG', icone: '📈', ativo: true, ordem: 5, modalidade: 'pdf' },
  { id: 'mapa', nome: 'MAPA', icone: '🩸', ativo: true, ordem: 6, modalidade: 'pdf' },
  { id: 'holter', nome: 'Holter', icone: '📟', ativo: true, ordem: 7, modalidade: 'pdf' },
  { id: 'ergometrico', nome: 'Teste Ergométrico', icone: '🏃', ativo: true, ordem: 8, modalidade: 'pdf' },
];

const PJ_STARTER_FALLBACK = {
  id: 'pj_starter', tipo: 'PJ', franquia: 300, excedente: 1.5, maxLocais: -1,
  localAdicional: 0, extratosFranquia: -1, extratoValor: 0, maxUsuarios: 3, usuarioAdicional: 66.99,
};
async function planoTrialPJ(db: Firestore) {
  try {
    const snap = await db.doc('configPlanos/atual').get();
    const planos = (snap.data()?.planos ?? []) as Array<Record<string, unknown>>;
    const p = planos.find(x => x.id === 'pj_starter');
    if (p) return { ...PJ_STARTER_FALLBACK, ...p };
  } catch { /* fallback */ }
  return PJ_STARTER_FALLBACK;
}

export async function executarSignup(
  db: Firestore, authAdmin: Auth, uid: string, dados: DadosSignup,
  verificarCrm: VerificarCrm = async () => ({ status: 'nao_verificado', fonte: 'nenhum', checadoEm: null }),
): Promise<ResultadoSignup> {
  // Rollback do Auth user orfao: sem ele o email fica preso (retry daria
  // email-already-in-use para sempre). SO e chamado quando o perfil NAO
  // existe — usuario real rechamando a rota jamais perde a conta.
  const falhar = async (motivo: 'dados_invalidos' | 'erro'): Promise<ResultadoSignup> => {
    try { await authAdmin.deleteUser(uid); } catch { /* ja nao existia */ }
    return { ok: false, motivo };
  };

  const nome = (dados.nome ?? '').trim();
  const email = (dados.email ?? '').trim();
  const tipoPerfil = dados.tipoPerfil === 'assistente' ? 'assistente' : 'medico';
  const invalido = !nome || !email
    || (tipoPerfil === 'medico' && (!dados.crm || !dados.ufCrm));

  try {
    const plano = await planoTrial(db);
    const crmVerificacao: CrmVerificacao = tipoPerfil === 'medico'
      ? await verificarCrm(dados.crm ?? '', (dados.ufCrm ?? '').toUpperCase())
      : { status: 'nao_verificado', fonte: 'nenhum', checadoEm: null };
    const agora = new Date();
    const contaRef = db.collection('contas').doc();
    const wsRef = db.collection('workspaces').doc();
    const contaId = contaRef.id;

    // Transacao (nao batch): o `get` do perfil vive DENTRO dela, antes de
    // qualquer escrita. Duplo-clique no cadastro rodava dois signups em
    // paralelo — os dois passavam pelo get, o segundo falhava no meio e o
    // rollback apagava o Auth user recem-criado pelo primeiro.
    const motivo = await db.runTransaction(async (t) => {
      const perfilRef = db.doc(`profissionais/${uid}`);
      // Leitura antes de qualquer escrita (exigencia da transacao) e antes da
      // validacao: perfil existente NUNCA cai no rollback que apaga o Auth.
      const perfilExistente = await t.get(perfilRef);
      if (perfilExistente.exists) return 'ja_cadastrado' as const;
      if (invalido) return 'dados_invalidos' as const;

      // 1. Perfil — mesmos campos do createProfile() do cliente (fixtures.mjs)
      t.set(perfilRef, {
        uid, nome, email,
        crm: dados.crm ?? '', ufCrm: (dados.ufCrm ?? '').toUpperCase(),
        especialidade: dados.especialidade ?? '', tipoPerfil,
        cpf: '', rqe: '', superadmin: false, crmVerificacao,
        criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
      });
      // 2. Conta (a camada nova)
      t.set(contaRef, {
        id: contaId, tipo: 'PF', nome, ownerUid: uid, empresaId: null,
        status: 'ativa', criadoEm: FieldValue.serverTimestamp(),
      });
      // 3. Local — COM contaId (modelo novo) e COM ownerUid (tranca provisoria)
      t.set(wsRef, {
        id: wsRef.id, contaId, ownerUid: uid, tipo: 'PF',
        nomeClinica: 'Consultório', slogan: dados.especialidade ?? '',
        corPrimaria: '#1E3A5F', corSecundaria: '#2563EB',
        criadoEm: FieldValue.serverTimestamp(),
      });
      // 3b. Catalogo de tipos de laudo (Sub-plano 3) — semeia os 8 padroes
      for (const tipo of TIPOS_PADRAO) {
        t.set(wsRef.collection('tiposLaudo').doc(tipo.id),
          { ...tipo, criadoEm: FieldValue.serverTimestamp() });
      }
      // 4. Vinculo com id deterministico — pre-requisito de toda regra de papel
      t.set(db.doc(`vinculos/${contaId}_${uid}`), {
        id: `${contaId}_${uid}`, contaId, medicoUid: uid,
        papel: 'dono', locais: [], status: 'ativo',
        criadoEm: FieldValue.serverTimestamp(),
      });
      // 5. Assinatura por conta — SEM workspaceId (duas assinaturas casariam
      //    na busca antiga e a franquia oscilaria entre elas)
      t.set(db.doc(`subscriptions/${contaId}`), {
        id: contaId, contaId, planoId: 'trial', tipo: 'trial',
        tipoPlano: plano.tipo ?? 'PF',
        franquiaMensal: plano.franquia, franquiaUsada: 0, creditosExtras: 0,
        excedente: plano.excedente, maxLocais: plano.maxLocais,
        localAdicional: plano.localAdicional,
        extratosFranquia: plano.extratosFranquia, extratoValor: plano.extratoValor,
        maxUsuarios: plano.maxUsuarios, usuarioAdicional: plano.usuarioAdicional,
        cicloInicio: Timestamp.fromDate(agora),
        cicloFim: Timestamp.fromDate(new Date(agora.getTime() + 30 * 864e5)),
        criadoEm: FieldValue.serverTimestamp(),
      });
      return 'ok' as const;
    });

    if (motivo === 'ja_cadastrado') return { ok: false, motivo };
    if (motivo === 'dados_invalidos') return falhar(motivo);
    return { ok: true, contaId, wsId: wsRef.id };
  } catch (e) {
    console.error('executarSignup:', e);
    return falhar('erro');
  }
}

export type DadosSignupPJ = DadosSignup & {
  cnpj: string; razaoSocial: string; nomeFantasia?: string; nomeLocal?: string;
};
export type ResultadoSignupPJ =
  | { ok: true; contaId: string; wsId: string; empresaId: string }
  | { ok: false; motivo: 'dados_invalidos' | 'ja_cadastrado' | 'cnpj_duplicado' | 'erro' };

export async function executarSignupPJ(
  db: Firestore, authAdmin: Auth, uid: string, dados: DadosSignupPJ,
  verificarCrm: VerificarCrm = async () => ({ status: 'nao_verificado', fonte: 'nenhum', checadoEm: null }),
): Promise<ResultadoSignupPJ> {
  const falhar = async (motivo: 'dados_invalidos' | 'cnpj_duplicado' | 'erro'): Promise<ResultadoSignupPJ> => {
    try { await authAdmin.deleteUser(uid); } catch { /* ja nao existia */ }
    return { ok: false, motivo };
  };

  const nome = (dados.nome ?? '').trim();
  const email = (dados.email ?? '').trim();
  const cnpj = String(dados.cnpj ?? '').replace(/\D/g, '');
  const razaoSocial = (dados.razaoSocial ?? '').trim();
  const tipoPerfil = dados.tipoPerfil === 'medico' ? 'medico' : 'assistente';
  const invalido = !nome || !email || cnpj.length !== 14 || !razaoSocial
    || (tipoPerfil === 'medico' && (!dados.crm || !dados.ufCrm));

  try {
    // Nao chamar o provedor de CRM quando o dado ja e invalido (evita I/O inutil).
    const crmVerificacao = (!invalido && tipoPerfil === 'medico')
      ? await verificarCrm(dados.crm ?? '', (dados.ufCrm ?? '').toUpperCase())
      : { status: 'nao_verificado' as const, fonte: 'nenhum', checadoEm: null };

    const plano = await planoTrialPJ(db);
    const agora = new Date();
    const empresaRef = db.collection('empresas').doc();
    const contaRef = db.collection('contas').doc();
    const wsRef = db.collection('workspaces').doc();
    const contaId = contaRef.id;

    const motivo = await db.runTransaction(async (t) => {
      const perfilRef = db.doc(`profissionais/${uid}`);
      const perfilExistente = await t.get(perfilRef);
      if (perfilExistente.exists) return 'ja_cadastrado' as const;
      // Usuario ja cadastrado NUNCA cai no rollback: 'invalido' so vale depois disso.
      if (invalido) return 'dados_invalidos' as const;
      // CNPJ unico: query dentro da transacao (leitura antes de qualquer escrita)
      const dup = await t.get(db.collection('empresas').where('cnpj', '==', cnpj).limit(1));
      if (!dup.empty) return 'cnpj_duplicado' as const;

      t.set(perfilRef, {
        uid, nome, email,
        crm: dados.crm ?? '', ufCrm: (dados.ufCrm ?? '').toUpperCase(),
        especialidade: dados.especialidade ?? '', tipoPerfil,
        cpf: '', rqe: '', superadmin: false, crmVerificacao,
        criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
      });
      t.set(empresaRef, {
        id: empresaRef.id, cnpj, razaoSocial, nomeFantasia: dados.nomeFantasia ?? '',
        tipo: 'clinica', masterUid: uid, status: 'ativa', criadoEm: FieldValue.serverTimestamp(),
      });
      t.set(contaRef, {
        id: contaId, tipo: 'PJ', nome: razaoSocial, ownerUid: uid, empresaId: empresaRef.id,
        status: 'ativa', criadoEm: FieldValue.serverTimestamp(),
      });
      t.set(wsRef, {
        id: wsRef.id, contaId, ownerUid: uid, tipo: 'PJ',
        nomeClinica: (dados.nomeLocal ?? '').trim() || razaoSocial || 'Unidade',
        corPrimaria: '#1E3A5F', corSecundaria: '#2563EB', criadoEm: FieldValue.serverTimestamp(),
      });
      // Catalogo de tipos de laudo (Sub-plano 3) — semeia os 8 padroes
      for (const tipo of TIPOS_PADRAO) {
        t.set(wsRef.collection('tiposLaudo').doc(tipo.id),
          { ...tipo, criadoEm: FieldValue.serverTimestamp() });
      }
      t.set(db.doc(`vinculos/${contaId}_${uid}`), {
        id: `${contaId}_${uid}`, contaId, medicoUid: uid, papel: 'dono', locais: [],
        status: 'ativo', criadoEm: FieldValue.serverTimestamp(),
      });
      t.set(db.doc(`subscriptions/${contaId}`), {
        id: contaId, contaId, planoId: plano.id, tipo: 'trial', tipoPlano: 'PJ',
        franquiaMensal: plano.franquia, franquiaUsada: 0, creditosExtras: 0,
        excedente: plano.excedente, maxLocais: plano.maxLocais, localAdicional: plano.localAdicional,
        extratosFranquia: plano.extratosFranquia, extratoValor: plano.extratoValor,
        maxUsuarios: plano.maxUsuarios, usuarioAdicional: plano.usuarioAdicional,
        cicloInicio: Timestamp.fromDate(agora),
        cicloFim: Timestamp.fromDate(new Date(agora.getTime() + 30 * 864e5)),
        criadoEm: FieldValue.serverTimestamp(),
      });
      return 'ok' as const;
    });

    if (motivo === 'ja_cadastrado') return { ok: false, motivo };
    if (motivo === 'dados_invalidos') return falhar('dados_invalidos');
    if (motivo === 'cnpj_duplicado') return falhar('cnpj_duplicado');
    return { ok: true, contaId, wsId: wsRef.id, empresaId: empresaRef.id };
  } catch (e) {
    console.error('executarSignupPJ:', e);
    return falhar('erro');
  }
}
