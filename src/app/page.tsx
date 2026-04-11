'use client';
// Página raiz — redireciona para /dashboard ou /login
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-800 to-[#1E3A5F] flex items-center justify-center">
      <div className="text-center">
        <span className="text-6xl animate-pulse">🫀</span>
        <p className="text-white mt-4 font-semibold">Carregando...</p>
      </div>
    </div>
  );
}
