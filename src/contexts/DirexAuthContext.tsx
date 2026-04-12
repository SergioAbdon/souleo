'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Contexto de Autenticação — Diretoria (Admin)
// Leve: apenas user + profile admin + loading + logout
// Separado do AuthContext principal
// ══════════════════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { isDirexAuthorized } from '@/lib/firestore';

export type DirexProfile = {
  id: string;
  nome: string;
  email: string;
  superadmin: boolean;
  adminRole?: string;
};

type DirexAuthState = {
  user: User | null;
  profile: DirexProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const DirexAuthContext = createContext<DirexAuthState>({
  user: null, profile: null, loading: true,
  logout: async () => {},
});

export function DirexAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DirexProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const result = await isDirexAuthorized(fbUser.uid);
        if (result.authorized && result.profile) {
          setUser(fbUser);
          setProfile({
            id: result.profile.id as string,
            nome: (result.profile.nome as string) || '',
            email: (result.profile.email as string) || fbUser.email || '',
            superadmin: result.profile.superadmin === true,
            adminRole: result.profile.adminRole as string | undefined,
          });
        } else {
          await signOut(auth);
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  return (
    <DirexAuthContext.Provider value={{ user, profile, loading, logout }}>
      {children}
    </DirexAuthContext.Provider>
  );
}

export const useDirexAuth = () => useContext(DirexAuthContext);
