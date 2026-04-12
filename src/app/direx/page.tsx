'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Tela de Login da Diretoria
// Firebase Auth + check superadmin/adminRole
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { isDirexAuthorized } from '@/lib/firestore';

export default function DirexLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Auto-login se já autenticado e autorizado
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const result = await isDirexAuthorized(user.uid);
        if (result.authorized) {
          router.replace('/direx/painel');
          return;
        }
      }
      setChecking(false);
    });
    return () => unsub();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!email.trim() || !senha) {
      setErro('Preencha email e senha.');
      return;
    }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), senha);
      const result = await isDirexAuthorized(cred.user.uid);
      if (result.authorized) {
        router.replace('/direx/painel');
      } else {
        await auth.signOut();
        setErro('Acesso negado. Voce nao tem permissao para acessar a diretoria.');
        setLoading(false);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErro('Email ou senha incorretos.');
      } else if (code === 'auth/user-not-found') {
        setErro('Usuario nao encontrado.');
      } else if (code === 'auth/too-many-requests') {
        setErro('Muitas tentativas. Tente novamente em alguns minutos.');
      } else {
        setErro('Erro ao fazer login. Tente novamente.');
      }
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-[#64748B] text-sm animate-pulse">Verificando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-[380px] bg-[#1E293B] rounded-2xl p-8 text-center"
      >
        <div className="text-[40px] mb-1">&#x1FAC0;</div>
        <h2 className="text-xl font-bold text-[#F8FAFC] mb-1">LEO &middot; Diretoria</h2>
        <p className="text-xs text-[#64748B] mb-5">Acesso exclusivo da diretoria</p>

        {erro && (
          <div className="text-[#F87171] text-xs mb-3 text-left">{erro}</div>
        )}

        <input
          type="email"
          placeholder="Seu email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6] mb-2.5 placeholder:text-[#64748B]"
        />
        <input
          type="password"
          placeholder="Sua senha"
          autoComplete="current-password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6] mb-4 placeholder:text-[#64748B]"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
