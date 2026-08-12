'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<{ clinica: string; papel: string } | null>(null);
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState<'login' | 'cadastro'>('login');
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('');
  const [nome, setNome] = useState(''); const [crm, setCrm] = useState(''); const [uf, setUf] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/convite/info?token=${token}`).then(r => r.json()).then(d => {
      if (d.ok) setInfo({ clinica: d.clinica, papel: d.papel });
      else setErro(d.motivo === 'expirado' ? 'Este convite expirou.' : d.motivo === 'ja_usado' ? 'Este convite já foi usado.' : 'Convite inválido.');
    }).catch(() => setErro('Não foi possível carregar o convite.'));
  }, [token]);

  async function aceitar(idToken: string, dadosPerfil: Record<string, string>) {
    const res = await fetch('/api/convite/aceitar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token, dadosPerfil }),
    });
    const d = await res.json();
    if (!d.ok) {
      setErro(d.motivo === 'ja_membro' ? 'Você já faz parte dessa clínica.'
        : d.motivo === 'perfil_incompativel' ? 'Seu perfil não é de médico — peça um convite de recepção.'
        : d.motivo === 'dados_invalidos' ? 'Preencha nome e, se médico, CRM/UF.'
        : 'Não foi possível aceitar o convite.');
      await auth.signOut().catch(() => {});
      return;
    }
    router.push('/dashboard');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setLoading(true);
    try {
      const ehMedico = info?.papel === 'medico';
      if (modo === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email, senha);
        if (!cred.user.emailVerified) { setErro('Verifique seu email antes de entrar.'); await auth.signOut(); setLoading(false); return; }
        await aceitar(await cred.user.getIdToken(), {});
      } else {
        if (!nome || (ehMedico && (!crm || !uf))) { setErro('Preencha nome e, se médico, CRM/UF.'); setLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        await aceitar(await cred.user.getIdToken(), { nome, email, crm, ufCrm: uf.toUpperCase() });
        await sendEmailVerification(cred.user).catch(() => {});
      }
    } catch { setErro('Confira email e senha.'); }
    setLoading(false);
  }

  if (erro && !info) return <div className="min-h-screen flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow p-8 text-center max-w-sm"><p className="text-4xl">🔗</p><p className="text-sm text-gray-600 mt-3">{erro}</p></div></div>;
  if (!info) return <div className="min-h-screen flex items-center justify-center"><span className="text-4xl animate-pulse">🫀</span></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-[#1E3A5F] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
        <h1 className="text-lg font-bold text-[#1E3A5F]">Convite para {info.clinica}</h1>
        <p className="text-sm text-gray-500 mb-4">Você entra como <b>{info.papel === 'medico' ? 'médico' : 'recepção'}</b>.</p>
        <div className="flex gap-2 mb-4 text-sm">
          <button onClick={() => setModo('login')} className={`flex-1 py-2 rounded-lg ${modo === 'login' ? 'bg-[#1E3A5F] text-white' : 'border'}`}>Já tenho conta</button>
          <button onClick={() => setModo('cadastro')} className={`flex-1 py-2 rounded-lg ${modo === 'cadastro' ? 'bg-[#1E3A5F] text-white' : 'border'}`}>Criar conta</button>
        </div>
        {erro && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-3">{erro}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {modo === 'cadastro' && <input placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />}
          {modo === 'cadastro' && info.papel === 'medico' && (
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="CRM" value={crm} onChange={e => setCrm(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <input placeholder="UF" maxLength={2} value={uf} onChange={e => setUf(e.target.value.toUpperCase())} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          <input type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          <button type="submit" disabled={loading} className="w-full bg-[#1E3A5F] text-white py-3 rounded-lg font-semibold text-sm disabled:opacity-50">
            {loading ? 'Entrando...' : 'Entrar na clínica'}
          </button>
        </form>
      </div>
    </div>
  );
}
