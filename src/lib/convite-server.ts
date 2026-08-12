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

    const perfilSnap = await db.doc(`profissionais/${uid}`).get();
    const perfilExiste = perfilSnap.exists;
    const tipoPerfilExistente = perfilExiste ? (perfilSnap.data()!.tipoPerfil as string | undefined) : undefined;

    // Coerência papel↔perfil: convite de MÉDICO exige perfil médico (ausente ou
    // 'medico'). Assistente existente não vira médico (tipoPerfil é imutável).
    if (papel === 'medico') {
      if (perfilExiste) {
        if ((tipoPerfilExistente ?? 'medico') !== 'medico') return { ok: false, motivo: 'perfil_incompativel' };
      } else {
        if (!dadosPerfil.crm || !dadosPerfil.ufCrm || !dadosPerfil.nome) return { ok: false, motivo: 'dados_invalidos' };
      }
    } else if (!perfilExiste && !dadosPerfil.nome) {
      return { ok: false, motivo: 'dados_invalidos' };
    }

    const crmVerificacao = (!perfilExiste && papel === 'medico')
      ? await verificarCrm(dadosPerfil.crm ?? '', (dadosPerfil.ufCrm ?? '').toUpperCase())
      : { status: 'nao_verificado' as const, fonte: 'nenhum', checadoEm: null };

    const motivo = await db.runTransaction(async (t) => {
      const conv = await t.get(db.doc(`convites/${token}`));
      if (!conv.exists || conv.data()!.usado) return 'ja_usado' as const;
      const vincExistente = await t.get(db.doc(`vinculos/${contaId}_${uid}`));
      if (vincExistente.exists && vincExistente.data()!.status === 'ativo') return 'ja_membro' as const;

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
