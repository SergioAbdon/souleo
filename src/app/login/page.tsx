'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Tela de Login / Cadastro
// ══════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification
} from 'firebase/auth';
import { createProfile, createWorkspace, createMembership } from '@/lib/firestore';
import { createSubscription } from '@/lib/billing';

type Tab = 'login' | 'cadastroPF' | 'cadastroPJ';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Campos login
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  // Campos cadastro PF
  const [pfNome, setPfNome] = useState('');
  const [pfEmail, setPfEmail] = useState('');
  const [pfSenha, setPfSenha] = useState('');
  const [pfCrm, setPfCrm] = useState('');
  const [pfUf, setPfUf] = useState('');
  const [pfEsp, setPfEsp] = useState('Cardiologia e Ecocardiografia');
  const [pfTipo, setPfTipo] = useState<'medico' | 'assistente'>('medico');

  // ── Login ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, senha);
      if (!cred.user.emailVerified) {
        setErro('Verifique seu email antes de entrar. Cheque sua caixa de entrada.');
        await auth.signOut();
        setLoading(false);
        return;
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErro('Email ou senha incorretos.');
      } else if (code === 'auth/too-many-requests') {
        setErro('Muitas tentativas. Aguarde alguns minutos.');
      } else {
        setErro('Erro ao entrar. Tente novamente.');
      }
    }
    setLoading(false);
  }

  // ── Cadastro PF ──
  async function handleCadastroPF(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setSucesso(''); setLoading(true);
    try {
      if (!pfNome || !pfEmail || !pfSenha) { setErro('Preencha todos os campos.'); setLoading(false); return; }
      if (pfTipo === 'medico' && (!pfCrm || !pfUf)) { setErro('CRM e UF são obrigatórios para médicos.'); setLoading(false); return; }
      if (pfSenha.length < 6) { setErro('Senha deve ter ao menos 6 caracteres.'); setLoading(false); return; }

      // Criar usuário Firebase
      const cred = await createUserWithEmailAndPassword(auth, pfEmail, pfSenha);
      await sendEmailVerification(cred.user);

      // Criar perfil no Firestore
      await createProfile(cred.user.uid, {
        nome: pfNome, email: pfEmail,
        crm: pfCrm, ufCrm: pfUf.toUpperCase(),
        especialidade: pfEsp, tipoPerfil: pfTipo,
      });

      // Criar workspace PF
      const wsId = await createWorkspace({
        ownerUid: cred.user.uid,
        tipo: 'PF',
        nomeClinica: 'Consultório',
        slogan: pfEsp,
        corPrimaria: '#1E3A5F',
        corSecundaria: '#2563EB',
      });

      // Criar vínculo
      if (wsId) {
        await createMembership(cred.user.uid, wsId, pfTipo === 'medico' ? 'medico' : 'assistente');
        await createSubscription(wsId, 'trial'); // Trial = Expert completo por 30 dias
      }

      // Sair (precisa verificar email)
      await auth.signOut();
      setSucesso('Conta criada! Verifique seu email para ativar.');
      setTab('login');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErro('Este email já está cadastrado.');
      } else {
        setErro('Erro ao cadastrar: ' + (err as Error).message);
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-800 to-[#1E3A5F] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl">🫀</span>
          <h1 className="text-3xl font-bold text-white mt-2">SOULEO</h1>
          <p className="text-blue-200 text-sm">Sistema de Laudos Médicos</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b">
            <button
              onClick={() => { setTab('login'); setErro(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition ${tab === 'login' ? 'text-[#1E3A5F] border-b-2 border-[#1E3A5F]' : 'text-gray-400'}`}
            >Entrar</button>
            <button
              onClick={() => { setTab('cadastroPF'); setErro(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition ${tab === 'cadastroPF' ? 'text-[#1E3A5F] border-b-2 border-[#1E3A5F]' : 'text-gray-400'}`}
            >Cadastro PF</button>
            <button
              onClick={() => { setTab('cadastroPJ'); setErro(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition ${tab === 'cadastroPJ' ? 'text-[#1E3A5F] border-b-2 border-[#1E3A5F]' : 'text-gray-400'}`}
            >Cadastro PJ</button>
          </div>

          <div className="p-6">
            {/* Mensagens */}
            {erro && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4 flex items-center gap-2"><span>⚠️</span>{erro}</div>}
            {sucesso && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg mb-4 flex items-center gap-2"><span>✅</span>{sucesso}</div>}

            {/* ── TAB LOGIN ── */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]"
                    placeholder="seu@email.com" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Senha</label>
                  <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]"
                    placeholder="••••••" required />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-[#1E3A5F] text-white py-3 rounded-lg font-semibold text-sm hover:bg-[#2563EB] transition disabled:opacity-50">
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            )}

            {/* ── TAB CADASTRO PF ── */}
            {tab === 'cadastroPF' && (
              <form onSubmit={handleCadastroPF} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo de profissional</label>
                  <select value={pfTipo} onChange={e => setPfTipo(e.target.value as 'medico' | 'assistente')}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]">
                    <option value="medico">Médico</option>
                    <option value="assistente">Assistente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nome completo</label>
                  <input type="text" value={pfNome} onChange={e => setPfNome(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]"
                    required />
                </div>
                {pfTipo === 'medico' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">CRM</label>
                      <input type="text" value={pfCrm} onChange={e => setPfCrm(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">UF</label>
                      <input type="text" value={pfUf} onChange={e => setPfUf(e.target.value.toUpperCase())}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]"
                        maxLength={2} placeholder="PA" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Especialidade</label>
                  <input type="text" value={pfEsp} onChange={e => setPfEsp(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
                  <input type="email" value={pfEmail} onChange={e => setPfEmail(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]"
                    required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Senha</label>
                  <input type="password" value={pfSenha} onChange={e => setPfSenha(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]"
                    placeholder="Mínimo 6 caracteres" required />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-[#1E3A5F] text-white py-3 rounded-lg font-semibold text-sm hover:bg-[#2563EB] transition disabled:opacity-50">
                  {loading ? 'Cadastrando...' : 'Criar conta'}
                </button>
              </form>
            )}

            {/* ── TAB CADASTRO PJ ── */}
            {tab === 'cadastroPJ' && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-lg">🏢</p>
                <p className="text-sm mt-2">Cadastro PJ será implementado na próxima fase.</p>
                <p className="text-xs mt-1">Por enquanto, use o cadastro PF.</p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-blue-200 text-xs mt-6">
          SOULEO v2.0 · www.souleo.com.br
        </p>
      </div>
    </div>
  );
}
