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

export async function executarSignup(
  db: Firestore, authAdmin: Auth, uid: string, dados: DadosSignup
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
        cpf: '', rqe: '', superadmin: false,
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
