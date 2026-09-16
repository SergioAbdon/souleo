'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Contexto de Autenticação
// Gerencia: user, profile, workspace, membership, subscription
// Disponível em toda a aplicação via useAuth()
// ══════════════════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getProfile, getMemberships, getWorkspace } from '@/lib/firestore';
import { getSubscription } from '@/lib/billing';
import { getVinculosDoUsuario, getConta, getLocaisDaConta, type Conta, type Papel } from '@/lib/contas';
import { modoEntrada } from '@/lib/permissoes';

// Tipos
export type Profile = Record<string, unknown> & { id: string; nome?: string; crm?: string; ufCrm?: string; especialidade?: string; tipoPerfil?: string; cpf?: string; sigB64?: string; };
export type Workspace = Record<string, unknown> & { id: string; nomeClinica?: string; slogan?: string; corPrimaria?: string; corSecundaria?: string; endereco?: string; telefone?: string; logoB64?: string; tipo?: string; };
export type Membership = Record<string, unknown> & { id: string; role?: string; workspaceId?: string; empresaId?: string; };
export type Subscription = Record<string, unknown> & { id: string; tipo?: string; franquiaMensal?: number; franquiaUsada?: number; creditosExtras?: number; };

type Contexto = {
  membership: Membership;
  workspace: Workspace;
  subscription: Subscription | null;
  conta?: Conta | null;
  papel?: Papel;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  workspace: Workspace | null;
  membership: Membership | null;
  subscription: Subscription | null;
  contextos: Contexto[];
  loading: boolean;
  localAtivo: Contexto | null;
  precisaEscolher: boolean;
  semLocal: boolean;
  papel?: Papel;
  // Ações
  selecionarContexto: (ctx: Contexto) => void;
  selecionarLocal: (wsId: string) => void;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null, profile: null, workspace: null, membership: null,
  subscription: null, contextos: [], loading: true,
  localAtivo: null, precisaEscolher: false, semLocal: false,
  selecionarContexto: () => {},
  selecionarLocal: () => {},
  reloadProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [contextos, setContextos] = useState<Contexto[]>([]);
  const [loading, setLoading] = useState(true);
  const [localAtivo, setLocalAtivo] = useState<Contexto | null>(null);
  const [precisaEscolher, setPrecisaEscolher] = useState(false);
  const [semLocal, setSemLocal] = useState(false);
  // Anti-corrida: trocar de conta entre abas faz uma leitura antiga terminar
  // depois e aplicar o usuario anterior. Cada callback ganha um gen; so aplica
  // estado se ainda for o gen mais novo.
  const genRef = useRef(0);

  // Ouvir mudanças de auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      const meuGen = ++genRef.current;
      // try/finally: sem isso, uma leitura negada pelas regras (ou queda de
      // rede) interrompe o callback antes do setLoading(false) e a tela fica
      // presa no coracao pulsando, para sempre, sem dizer o que houve.
      try {
      if (meuGen === genRef.current) setUser(fbUser);
      if (fbUser) {
        // Carregar perfil
        const prof = await getProfile(fbUser.uid);
        if (meuGen !== genRef.current) return;
        setProfile(prof as Profile | null);

        // v3: Carregar contextos (workspaces) em PARALELO
        if (prof) {
          // Caminho novo: conta → locais. Se nao houver vinculo migrado, cai no antigo.
          const vincs = await getVinculosDoUsuario(fbUser.uid);
          if (vincs.length > 0) {
            const ctxNovos: Contexto[] = [];
            for (const v of vincs) {
              const [conta, locais] = await Promise.all([
                getConta(v.contaId),
                getLocaisDaConta(v.contaId, v.locais ?? []),
              ]);
              // getSubscription resolve por contaId desde o Plano 2A
              // (fallback legado por workspaceId dentro dela).
              const subs = await Promise.all(locais.map(l => getSubscription(l.id)));
              locais.forEach((local, i) => {
                ctxNovos.push({
                  membership: { id: v.id, role: v.papel, workspaceId: local.id } as Membership,
                  workspace: local as Workspace,
                  subscription: subs[i] as Subscription | null,
                  conta, papel: v.papel,
                });
              });
            }
            // Só assume o caminho novo se ele cobrir TODOS os locais que o
            // usuario alcanca. Migracao parcial (um vinculo migrado, outro nao)
            // esconderia uma clinica inteira sem erro nenhum na tela.
            const cobertos = new Set(ctxNovos.map(c => c.workspace.id));
            const legadoDescoberto = (await getMemberships(fbUser.uid)).filter(m => {
              const ws = (m as Membership).workspaceId;
              return ws && !cobertos.has(ws);
            });
            if (ctxNovos.length > 0 && legadoDescoberto.length === 0) {
              if (meuGen !== genRef.current) return;
              setContextos(ctxNovos);
              aplicarEntrada(ctxNovos);
              setLoading(false);
              return;
            }
          }
          // ── caminho antigo (pre-migracao) daqui para baixo ──
          const memberships = await getMemberships(fbUser.uid);
          const ctxResults = await Promise.all(
            memberships
              .filter(mem => (mem as Membership).workspaceId)
              .map(async (mem) => {
                const wsId = (mem as Membership).workspaceId as string;
                const [ws, sub] = await Promise.all([
                  getWorkspace(wsId),
                  getSubscription(wsId),
                ]);
                if (!ws) return null;
                return {
                  membership: mem as Membership,
                  workspace: ws as Workspace,
                  subscription: sub as Subscription | null,
                };
              })
          );
          const ctxs = ctxResults.filter((c): c is Contexto => c !== null);
          if (meuGen !== genRef.current) return;
          setContextos(ctxs);
          aplicarEntrada(ctxs);
        }
      } else {
        setProfile(null);
        setWorkspace(null);
        setMembership(null);
        setSubscription(null);
        setContextos([]);
        setLocalAtivo(null);
        setPrecisaEscolher(false);
        setSemLocal(false);
      }
      } catch (e) {
        console.error('AuthContext: falha ao montar a sessao', e);
      } finally {
        if (meuGen === genRef.current) setLoading(false);
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selecionarContexto(ctx: Contexto) {
    setWorkspace(ctx.workspace);
    setMembership(ctx.membership);
    setSubscription(ctx.subscription);
    setLocalAtivo(ctx);
    setPrecisaEscolher(false);
    setSemLocal(false);
  }

  // Troca o local ativo pelo id do workspace (seletor do topo / gate de escolha).
  function selecionarLocal(wsId: string) {
    const ctx = contextos.find(c => c.workspace.id === wsId);
    if (ctx) selecionarContexto(ctx);
  }

  async function reloadProfile() {
    if (user) {
      const prof = await getProfile(user.uid);
      setProfile(prof as Profile | null);
    }
  }

  // Decide a entrada a partir dos locais acessiveis (A2 do spec):
  // 0 → aviso "conta sem local"; 1 → entra direto; 2+ → escolher.
  function aplicarEntrada(ctxs: Contexto[]) {
    setLocalAtivo(null);
    setSemLocal(false);
    setPrecisaEscolher(false);
    const modo = modoEntrada(ctxs.length);
    if (modo === 'sem-local') setSemLocal(true);
    else if (modo === 'entrar') selecionarContexto(ctxs[0]);
    else setPrecisaEscolher(true);   // 2+: NAO auto-seleciona
  }

  return (
    <AuthContext.Provider value={{
      user, profile, workspace, membership, subscription,
      contextos, loading,
      localAtivo, precisaEscolher, semLocal,
      papel: membership?.role as Papel | undefined,
      selecionarContexto, selecionarLocal,
      reloadProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
