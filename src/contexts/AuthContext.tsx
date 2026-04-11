'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Contexto de Autenticação
// Gerencia: user, profile, workspace, membership, subscription
// Disponível em toda a aplicação via useAuth()
// ══════════════════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getProfile, getMemberships, getWorkspace } from '@/lib/firestore';
import { getSubscription } from '@/lib/billing';

// Tipos
export type Profile = Record<string, unknown> & { id: string; nome?: string; crm?: string; ufCrm?: string; especialidade?: string; tipoPerfil?: string; cpf?: string; sigB64?: string; };
export type Workspace = Record<string, unknown> & { id: string; nomeClinica?: string; slogan?: string; corPrimaria?: string; corSecundaria?: string; endereco?: string; telefone?: string; logoB64?: string; tipo?: string; };
export type Membership = Record<string, unknown> & { id: string; role?: string; workspaceId?: string; empresaId?: string; };
export type Subscription = Record<string, unknown> & { id: string; tipo?: string; franquiaMensal?: number; franquiaUsada?: number; creditosExtras?: number; };

type Contexto = {
  membership: Membership;
  workspace: Workspace;
  subscription: Subscription | null;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  workspace: Workspace | null;
  membership: Membership | null;
  subscription: Subscription | null;
  contextos: Contexto[];
  loading: boolean;
  // Ações
  selecionarContexto: (ctx: Contexto) => void;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null, profile: null, workspace: null, membership: null,
  subscription: null, contextos: [], loading: true,
  selecionarContexto: () => {},
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

  // Ouvir mudanças de auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        // Carregar perfil
        const prof = await getProfile(fbUser.uid);
        setProfile(prof as Profile | null);

        // Carregar contextos (workspaces)
        if (prof) {
          const memberships = await getMemberships(fbUser.uid);
          const ctxs: Contexto[] = [];
          for (const mem of memberships) {
            const wsId = (mem as Membership).workspaceId;
            if (wsId) {
              const ws = await getWorkspace(wsId as string);
              const sub = await getSubscription(wsId as string);
              if (ws) {
                ctxs.push({
                  membership: mem as Membership,
                  workspace: ws as Workspace,
                  subscription: sub as Subscription | null
                });
              }
            }
          }
          setContextos(ctxs);

          // Auto-selecionar se só tem 1 contexto
          if (ctxs.length === 1) {
            selecionarContexto(ctxs[0]);
          }
        }
      } else {
        setProfile(null);
        setWorkspace(null);
        setMembership(null);
        setSubscription(null);
        setContextos([]);
      }
      setLoading(false);
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selecionarContexto(ctx: Contexto) {
    setWorkspace(ctx.workspace);
    setMembership(ctx.membership);
    setSubscription(ctx.subscription);
  }

  async function reloadProfile() {
    if (user) {
      const prof = await getProfile(user.uid);
      setProfile(prof as Profile | null);
    }
  }

  return (
    <AuthContext.Provider value={{
      user, profile, workspace, membership, subscription,
      contextos, loading, selecionarContexto, reloadProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
