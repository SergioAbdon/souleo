// ══════════════════════════════════════════════════════════════════
// LEO · Convite por link + gestão de membros (Plano 2B-B2) — Admin SDK.
// vinculos/convites têm `if false` nas regras: TODA escrita passa por aqui.
// Sem import relativo/@ (testado direto por node --test); verificarCrm por DI.
// papel/locais do vínculo vêm SEMPRE do doc do convite, nunca do cliente.
// ══════════════════════════════════════════════════════════════════
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export type PapelConvite = 'medico' | 'recepcao';
type CrmVerificacao = { status: 'nao_verificado' | 'verificado' | 'reprovado'; fonte: string; checadoEm: string | null };
type VerificarCrm = (crm: string, uf: string) => Promise<CrmVerificacao>;
export type DadosPerfilConvite = { nome?: string; email?: string; crm?: string; ufCrm?: string; especialidade?: string };

const SETE_DIAS = 7 * 864e5;

// Ids interpolados no path do Admin SDK (convites/${token}, vinculos/${...}):
// um id com '/' remonta o path e escaparia da colecao. So aceita o charset de
// doc-id gerado pelo Firestore. contaId vem do servidor (nao precisa guard).
export function idValido(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
}

export async function criarConvite(
  db: Firestore,
  args: { contaId: string; criadoPor: string; papel: PapelConvite; locais: string[]; agora: Date },
): Promise<{ ok: true; token: string } | { ok: false; motivo: string }> {
  if (args.papel !== 'medico' && args.papel !== 'recepcao') return { ok: false, motivo: 'papel_invalido' };
  try {
    const ref = db.collection('convites').doc();
    await ref.set({
      id: ref.id, contaId: args.contaId, papel: args.papel,
      locais: Array.isArray(args.locais) ? args.locais : [],
      criadoPor: args.criadoPor, criadoEm: FieldValue.serverTimestamp(),
      expiraEm: Timestamp.fromDate(new Date(args.agora.getTime() + SETE_DIAS)),
      usado: false, usadoPor: null, usadoEm: null,
    });
    return { ok: true, token: ref.id };
  } catch (e) { console.error('criarConvite:', e); return { ok: false, motivo: 'erro' }; }
}

export async function aceitarConvite(
  db: Firestore,
  args: { uid: string; token: string; dadosPerfil: DadosPerfilConvite; verificarCrm: VerificarCrm; agora: Date },
): Promise<{ ok: true; contaId: string } | { ok: false; motivo: string }> {
  const { uid, token, dadosPerfil, verificarCrm, agora } = args;
  if (!idValido(token)) return { ok: false, motivo: 'invalido' };
  try {
    // A verificação de CRM (I/O) fica FORA da transação; só é usada se o perfil
    // for criado como médico. Resolvida depois de saber o papel do convite.
    const conviteSnap = await db.doc(`convites/${token}`).get();
    if (!conviteSnap.exists) return { ok: false, motivo: 'invalido' };
    const convite = conviteSnap.data()!;
    if (convite.usado) return { ok: false, motivo: 'ja_usado' };
    if ((convite.expiraEm as Timestamp).toDate() < agora) return { ok: false, motivo: 'expirado' };

    const papel = convite.papel as PapelConvite;
    const contaId = convite.contaId as string;

    // Read FORA da transação usado SÓ para decidir se roda verificarCrm (I/O não
    // pode entrar na tx). A decisão de perfil (existe? incompatível? criar?) é
    // feita DENTRO da tx com perfilTx — senão dois aceites concorrentes do mesmo
    // uid novo veem ambos exists=false, o guard nunca dispara e a última escrita
    // sobrescreve profissionais/{uid} (um assistente poderia virar médico).
    const perfilForaTx = await db.doc(`profissionais/${uid}`).get();

    // Fast-fail fora da tx (revalidado dentro): novo médico precisa de CRM+nome.
    if (papel === 'medico') {
      if (perfilForaTx.exists) {
        if (((perfilForaTx.data()!.tipoPerfil as string | undefined) ?? 'medico') !== 'medico') return { ok: false, motivo: 'perfil_incompativel' };
      } else if (!dadosPerfil.crm || !dadosPerfil.ufCrm || !dadosPerfil.nome) {
        return { ok: false, motivo: 'dados_invalidos' };
      }
    } else if (!perfilForaTx.exists && !dadosPerfil.nome) {
      return { ok: false, motivo: 'dados_invalidos' };
    }

    const crmVerificacao = (!perfilForaTx.exists && papel === 'medico')
      ? await verificarCrm(dadosPerfil.crm ?? '', (dadosPerfil.ufCrm ?? '').toUpperCase())
      : { status: 'nao_verificado' as const, fonte: 'nenhum', checadoEm: null };

    const motivo = await db.runTransaction(async (t) => {
      // Reads ANTES de qualquer write: convite, vínculo e perfil.
      const conv = await t.get(db.doc(`convites/${token}`));
      if (!conv.exists || conv.data()!.usado) return 'ja_usado' as const;
      // Expiração revalidada DENTRO da tx: uma tx lenta/retry não pode commitar
      // depois de o convite ter expirado.
      if ((conv.data()!.expiraEm as Timestamp).toDate() < agora) return 'expirado' as const;
      const vincExistente = await t.get(db.doc(`vinculos/${contaId}_${uid}`));
      if (vincExistente.exists && vincExistente.data()!.status === 'ativo') return 'ja_membro' as const;

      // Guard atômico: decisão de perfil usa o read DENTRO da tx.
      const perfilTx = await t.get(db.doc(`profissionais/${uid}`));
      const perfilExiste = perfilTx.exists;
      if (papel === 'medico') {
        if (perfilExiste) {
          if (((perfilTx.data()!.tipoPerfil as string | undefined) ?? 'medico') !== 'medico') return 'perfil_incompativel' as const;
        } else if (!dadosPerfil.crm || !dadosPerfil.ufCrm || !dadosPerfil.nome) {
          return 'dados_invalidos' as const;
        }
      } else if (!perfilExiste && !dadosPerfil.nome) {
        return 'dados_invalidos' as const;
      }

      if (!perfilExiste) {
        t.set(db.doc(`profissionais/${uid}`), {
          uid, nome: (dadosPerfil.nome ?? '').trim(), email: (dadosPerfil.email ?? '').trim(),
          crm: papel === 'medico' ? (dadosPerfil.crm ?? '') : '',
          ufCrm: papel === 'medico' ? (dadosPerfil.ufCrm ?? '').toUpperCase() : '',
          especialidade: dadosPerfil.especialidade ?? '',
          tipoPerfil: papel === 'medico' ? 'medico' : 'assistente',
          cpf: '', rqe: '', superadmin: false, crmVerificacao,
          criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
        });
      }
      t.set(db.doc(`vinculos/${contaId}_${uid}`), {
        id: `${contaId}_${uid}`, contaId, medicoUid: uid, papel,
        locais: Array.isArray(convite.locais) ? convite.locais : [],
        status: 'ativo', convitePor: convite.criadoPor ?? null,
        criadoEm: FieldValue.serverTimestamp(),
      });
      t.update(db.doc(`convites/${token}`), { usado: true, usadoPor: uid, usadoEm: FieldValue.serverTimestamp() });
      return 'ok' as const;
    });

    if (motivo !== 'ok') return { ok: false, motivo };
    return { ok: true, contaId };
  } catch (e) { console.error('aceitarConvite:', e); return { ok: false, motivo: 'erro' }; }
}

export async function listarMembros(db: Firestore, contaId: string) {
  const vincSnap = await db.collection('vinculos').where('contaId', '==', contaId).get();
  const membros = await Promise.all(vincSnap.docs
    .filter(d => d.data().status === 'ativo')
    .map(async (d) => {
      const v = d.data();
      const prof = await db.doc(`profissionais/${v.medicoUid}`).get();
      return { uid: v.medicoUid, nome: prof.data()?.nome ?? '(sem nome)', papel: v.papel, locais: v.locais ?? [], status: v.status };
    }));
  const convSnap = await db.collection('convites').where('contaId', '==', contaId).where('usado', '==', false).get();
  const agora = new Date();
  const pendentes = convSnap.docs
    .filter(d => (d.data().expiraEm as Timestamp).toDate() >= agora)
    .map(d => ({ token: d.id, papel: d.data().papel, locais: d.data().locais ?? [], expiraEm: (d.data().expiraEm as Timestamp).toDate().toISOString() }));
  return { membros, pendentes };
}

export async function editarMembro(
  db: Firestore, args: { contaId: string; alvoUid: string; papel?: PapelConvite; locais?: string[] },
): Promise<{ ok: boolean; motivo?: string }> {
  if (!idValido(args.alvoUid)) return { ok: false, motivo: 'nao_encontrado' };
  const ref = db.doc(`vinculos/${args.contaId}_${args.alvoUid}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, motivo: 'nao_encontrado' };
  if (snap.data()!.papel === 'dono') return { ok: false, motivo: 'dono_imutavel' };
  // Promover a médico exige perfil médico: senão recria papel:medico+perfil:assistente
  // que o aceite bloqueia (paridade com ehMedicoDeVerdade / aceitarConvite).
  if (args.papel === 'medico') {
    const prof = await db.doc(`profissionais/${args.alvoUid}`).get();
    if (((prof.data()?.tipoPerfil as string | undefined) ?? 'medico') !== 'medico') return { ok: false, motivo: 'perfil_incompativel' };
  }
  const patch: Record<string, unknown> = {};
  if (args.papel === 'medico' || args.papel === 'recepcao') patch.papel = args.papel;
  if (Array.isArray(args.locais)) patch.locais = args.locais;
  if (Object.keys(patch).length === 0) return { ok: false, motivo: 'nada_a_mudar' };
  await ref.update(patch);
  return { ok: true };
}

export async function revogarMembro(
  db: Firestore, args: { contaId: string; alvoUid: string; donoUid: string },
): Promise<{ ok: boolean; motivo?: string }> {
  if (!idValido(args.alvoUid)) return { ok: false, motivo: 'nao_encontrado' };
  if (args.alvoUid === args.donoUid) return { ok: false, motivo: 'nao_pode_a_si' };
  const ref = db.doc(`vinculos/${args.contaId}_${args.alvoUid}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, motivo: 'nao_encontrado' };
  if (snap.data()!.papel === 'dono') return { ok: false, motivo: 'dono_imutavel' };
  await ref.update({ status: 'inativo', saiu: FieldValue.serverTimestamp() });
  return { ok: true };
}

export async function cancelarConvite(
  db: Firestore, args: { contaId: string; token: string },
): Promise<{ ok: boolean; motivo?: string }> {
  if (!idValido(args.token)) return { ok: false, motivo: 'nao_encontrado' };
  const ref = db.doc(`convites/${args.token}`);
  // Transacional: leitura+decisão+update num só passo — senão corre com
  // aceitarConvite e o update incondicional apagaria usadoPor de um já aceito.
  const motivo = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists || snap.data()!.contaId !== args.contaId) return 'nao_encontrado' as const;
    if (snap.data()!.usado) return 'ja_usado' as const;
    t.update(ref, { usado: true, usadoPor: null, usadoEm: FieldValue.serverTimestamp() });
    return 'ok' as const;
  });
  if (motivo !== 'ok') return { ok: false, motivo };
  return { ok: true };
}
