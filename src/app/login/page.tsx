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
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';

type Tab = 'login' | 'cadastroPF' | 'cadastroPJ';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  // Aparece quando o login é barrado por e-mail não verificado
  const [precisaVerificar, setPrecisaVerificar] = useState(false);

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

  // Campos cadastro PJ
  const [pjCnpj, setPjCnpj] = useState('');
  const [pjRazao, setPjRazao] = useState('');
  const [pjLocal, setPjLocal] = useState('');
  const [pjNome, setPjNome] = useState('');
  const [pjEmail, setPjEmail] = useState('');
  const [pjSenha, setPjSenha] = useState('');
  const [pjEhMedico, setPjEhMedico] = useState(false);
  const [pjCrm, setPjCrm] = useState('');
  const [pjUf, setPjUf] = useState('');

  // ── Login ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setSucesso(''); setPrecisaVerificar(false);
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, senha);
      if (!cred.user.emailVerified) {
        // Sem setErro aqui: a caixa âmbar do `precisaVerificar` já diz isso, e
        // com o botão de reenviar junto. Dois avisos iguais na mesma tela é
        // barulho — o segundo não acrescenta e ainda esconde a ação.
        setPrecisaVerificar(true);
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

  // ── Esqueci minha senha ──
  async function handleResetSenha() {
    setErro(''); setSucesso('');
    if (!email) { setErro('Digite seu email no campo acima e clique de novo.'); return; }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSucesso(`Enviamos um link de nova senha para ${email}. Cheque também o spam.`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      // Nao revelamos se o email existe ou nao — dizer "esse email nao existe"
      // entrega a lista de quem usa o sistema para quem estiver testando.
      if (code === 'auth/invalid-email') setErro('Email inválido.');
      else if (code === 'auth/too-many-requests') setErro('Muitas tentativas. Aguarde alguns minutos.');
      else setSucesso(`Se houver conta para ${email}, o link foi enviado. Cheque também o spam.`);
    }
    setLoading(false);
  }

  // ── Reenviar o email de verificação ──
  // Precisa estar autenticado para reenviar: entramos, mandamos, saímos.
  async function handleReenviarVerificacao() {
    setErro(''); setSucesso('');
    if (!email || !senha) { setErro('Preencha email e senha para reenviar a verificação.'); return; }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, senha);
      try {
        await sendEmailVerification(cred.user);
        setSucesso(`Reenviamos a verificação para ${email}. Cheque também o spam.`);
        setPrecisaVerificar(false);
      } finally {
        // Sair SEMPRE. Se o envio falhasse aqui, a sessão ficava de pé e um
        // usuário sem e-mail verificado alcançaria /dashboard digitando a URL
        // — a tela só checa se existe usuário, não se ele verificou.
        await auth.signOut().catch(() => {});
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/too-many-requests') setErro('Muitas tentativas. Aguarde alguns minutos.');
      else setErro('Não consegui reenviar. Confira email e senha.');
    }
    setLoading(false);
  }

  // ── Cadastro PF ──
  // O cliente so cria o Auth user (a senha nunca vai ao nosso servidor).
  // Os documentos nascem TODOS em /api/signup (Admin SDK, batch atomico,
  // modelo de contas). Se a rota falhar, ela mesma apaga o Auth user.
  async function handleCadastroPF(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setSucesso(''); setLoading(true);
    try {
      if (!pfNome || !pfEmail || !pfSenha) { setErro('Preencha todos os campos.'); setLoading(false); return; }
      if (pfTipo === 'medico' && (!pfCrm || !pfUf)) { setErro('CRM e UF são obrigatórios para médicos.'); setLoading(false); return; }
      if (pfSenha.length < 6) { setErro('Senha deve ter ao menos 6 caracteres.'); setLoading(false); return; }

      const cred = await createUserWithEmailAndPassword(auth, pfEmail, pfSenha);
      const idToken = await cred.user.getIdToken();

      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          nome: pfNome, email: pfEmail, crm: pfCrm, ufCrm: pfUf.toUpperCase(),
          especialidade: pfEsp, tipoPerfil: pfTipo,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        // O servidor ja desfez tudo (inclusive o Auth user). Uma resposta, um motivo.
        await auth.signOut().catch(() => {});
        setErro(data.motivo === 'ja_cadastrado'
          ? 'Este email já está cadastrado.'
          : data.motivo === 'dados_invalidos'
            ? 'Dados incompletos. Confira nome, email e CRM/UF.'
            : 'Erro ao criar a conta. Tente novamente.');
        setLoading(false);
        return;
      }

      // Verificacao SO depois do sucesso: rota falhou → nenhum email morto.
      await sendEmailVerification(cred.user);
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

  // ── Cadastro PJ ──
  // Mesmo padrão do handleCadastroPF: cliente cria o Auth user, servidor
  // cria os documentos (empresa + local + perfil) em /api/signup.
  async function handleCadastroPJ(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setSucesso(''); setLoading(true);
    try {
      const cnpjLimpo = pjCnpj.replace(/\D/g, '');
      if (!pjNome || !pjEmail || !pjSenha || !pjRazao) { setErro('Preencha nome, email, senha e razão social.'); setLoading(false); return; }
      if (cnpjLimpo.length !== 14) { setErro('CNPJ inválido.'); setLoading(false); return; }
      if (pjEhMedico && (!pjCrm || !pjUf)) { setErro('CRM e UF são obrigatórios para médicos.'); setLoading(false); return; }
      if (pjSenha.length < 6) { setErro('Senha deve ter ao menos 6 caracteres.'); setLoading(false); return; }

      const cred = await createUserWithEmailAndPassword(auth, pjEmail, pjSenha);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          tipoConta: 'PJ', nome: pjNome, email: pjEmail,
          tipoPerfil: pjEhMedico ? 'medico' : 'assistente',
          crm: pjCrm, ufCrm: pjUf.toUpperCase(),
          cnpj: cnpjLimpo, razaoSocial: pjRazao, nomeLocal: pjLocal,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        await auth.signOut().catch(() => {});
        setErro(data.motivo === 'cnpj_duplicado' ? 'Este CNPJ já está cadastrado.'
          : data.motivo === 'dados_invalidos' ? 'Dados incompletos. Confira CNPJ, razão social e CRM/UF.'
          : 'Erro ao criar a conta. Tente novamente.');
        setLoading(false); return;
      }
      await sendEmailVerification(cred.user);
      await auth.signOut();
      setSucesso('Conta da clínica criada! Verifique seu email para ativar.');
      setTab('login');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      setErro(code === 'auth/email-already-in-use' ? 'Este email já está cadastrado.' : 'Erro ao cadastrar: ' + (err as Error).message);
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

                <button type="button" onClick={handleResetSenha} disabled={loading}
                  className="w-full text-center text-xs text-[#1E3A5F] hover:underline disabled:opacity-50">
                  Esqueci minha senha
                </button>

                {precisaVerificar && (
                  <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded-lg space-y-2">
                    <p>Seu email ainda não foi verificado. Sem isso não é possível entrar.</p>
                    <button type="button" onClick={handleReenviarVerificacao} disabled={loading}
                      className="font-semibold underline disabled:opacity-50">
                      Reenviar email de verificação
                    </button>
                  </div>
                )}
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
              <form onSubmit={handleCadastroPJ} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">CNPJ</label>
                  <input type="text" value={pjCnpj} onChange={e => setPjCnpj(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="00.000.000/0000-00" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Razão social</label>
                  <input type="text" value={pjRazao} onChange={e => setPjRazao(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nome do primeiro local</label>
                  <input type="text" value={pjLocal} onChange={e => setPjLocal(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="Unidade Centro" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Seu nome</label>
                  <input type="text" value={pjNome} onChange={e => setPjNome(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" required />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={pjEhMedico} onChange={e => setPjEhMedico(e.target.checked)} />
                  Sou médico (vou assinar laudos)
                </label>
                {pjEhMedico && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">CRM</label>
                      <input type="text" value={pjCrm} onChange={e => setPjCrm(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">UF</label>
                      <input type="text" value={pjUf} onChange={e => setPjUf(e.target.value.toUpperCase())}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" maxLength={2} placeholder="PA" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
                  <input type="email" value={pjEmail} onChange={e => setPjEmail(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Senha</label>
                  <input type="password" value={pjSenha} onChange={e => setPjSenha(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="Mínimo 6 caracteres" required />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-[#1E3A5F] text-white py-3 rounded-lg font-semibold text-sm hover:bg-[#2563EB] transition disabled:opacity-50">
                  {loading ? 'Cadastrando...' : 'Criar conta da clínica'}
                </button>
              </form>
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
