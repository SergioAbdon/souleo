'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Marina — Assistente IA (Chat Interface)
// ══════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { useDirexAuth } from '@/contexts/DirexAuthContext';

type Mensagem = {
  role: 'user' | 'assistant';
  content: string;
};

const SUGESTOES = [
  'Quantos clientes ativos temos?',
  'Gera um relatorio financeiro',
  'Quais clientes estao inadimplentes?',
  'Quem sao nossos profissionais?',
  'Qual o consumo deste mes?',
];

export default function MarinaPage() {
  const { profile } = useDirexAuth();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll pro final quando novas mensagens
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [mensagens]);

  async function enviar(texto?: string) {
    const msg = (texto || input).trim();
    if (!msg || loading) return;

    const novasMsgs: Mensagem[] = [...mensagens, { role: 'user', content: msg }];
    setMensagens(novasMsgs);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/marina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: msg,
          historico: mensagens.slice(-10), // ultimas 10 msgs como contexto
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setMensagens([...novasMsgs, { role: 'assistant', content: data.resposta }]);
      } else {
        setMensagens([...novasMsgs, { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' }]);
      }
    } catch {
      setMensagens([...novasMsgs, { role: 'assistant', content: 'Erro de conexao. Verifique sua internet.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-52px-48px)]">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg font-bold">
          M
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#F8FAFC]">Marina</h1>
          <p className="text-[11px] text-[#64748B]">Assistente IA do LEO</p>
        </div>
      </div>

      {/* ── Chat area ── */}
      <div ref={chatRef} className="flex-1 overflow-y-auto space-y-3 pb-4 pr-1">
        {mensagens.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-5xl mb-4">&#x1F9E0;</div>
            <h2 className="text-base font-bold text-[#F8FAFC] mb-2">Ola, {profile?.nome?.split(' ')[0] || 'Admin'}!</h2>
            <p className="text-sm text-[#64748B] mb-6 max-w-md">
              Sou a Marina, sua assistente do LEO. Posso consultar dados do sistema, gerar relatorios e executar acoes administrativas.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGESTOES.map((s, i) => (
                <button
                  key={i}
                  onClick={() => enviar(s)}
                  className="px-3 py-2 bg-[#1E293B] border border-[#334155] rounded-lg text-[12px] text-[#94A3B8] hover:bg-[#334155] hover:text-[#F8FAFC] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0">
                M
              </div>
            )}
            <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-[13px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#334155] text-[#F8FAFC]'
                : 'bg-[#1E293B] border border-[#334155] text-[#CBD5E1]'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0">
              M
            </div>
            <div className="bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-[13px] text-[#64748B]">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 bg-[#64748B] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block w-1.5 h-1.5 bg-[#64748B] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="inline-block w-1.5 h-1.5 bg-[#64748B] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="border-t border-[#334155] pt-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Pergunte algo para a Marina..."
            disabled={loading}
            className="flex-1 px-4 py-3 bg-[#0F172A] border border-[#334155] rounded-xl text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6] placeholder:text-[#64748B] disabled:opacity-50"
          />
          <button
            onClick={() => enviar()}
            disabled={loading || !input.trim()}
            className="px-5 py-3 bg-[#3B82F6] text-white text-sm font-semibold rounded-xl hover:bg-[#2563EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
