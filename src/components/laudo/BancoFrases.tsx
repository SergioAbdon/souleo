'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Banco de Frases (F3-T7) — o último pedaço de UI que morava
// dentro do motor legado.
//
// Antes: HTML em dangerouslySetInnerHTML no SheetA4 + `onclick="..."`
// globais + estado em variáveis soltas do motorv8mp4.js. Agora: React,
// estado local, dado vindo de src/lib/banco-frases.ts (mesma chave
// `medcardio_banco`, mesmo shape). Substituição COMPLETA — não tem flag:
// o modal antigo só funcionava com as globais do motor, então os dois
// caminhos nunca coexistiriam.
//
// As classes CSS (.modal-overlay, .frase-item, .btn-inserir …) são as
// MESMAS já definidas no <style jsx global> da page — reuso, não cópia.
// ══════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { CATS, Frase, loadBanco, saveBanco, adicionarFrase, editarFrase, apagarFrase, filtrarFrases } from '@/lib/banco-frases';

type Props = {
  p1: string;
  onInserir: (txt: string) => void;
  onClose: () => void;
};

export default function BancoFrases({ p1, onInserir, onClose }: Props) {
  // Lazy init: lê o localStorage uma vez, na abertura (o modal só monta aberto).
  const [frases, setFrases] = useState<Frase[]>(() => loadBanco());
  const [cat, setCat] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [novaTxt, setNovaTxt] = useState('');
  const [novaCat, setNovaCat] = useState(CATS[0]);

  const visiveis = useMemo(() => filtrarFrases(frases, cat, busca), [frases, cat, busca]);

  /** Toda mutação grava no mesmo instante — igual ao legado (saveBanco a cada ação). */
  function aplicar(novas: Frase[]) {
    setFrases(novas);
    saveBanco(novas);
  }

  function salvarNova() {
    const novas = adicionarFrase(frases, novaCat, novaTxt);
    if (novas === frases) return; // texto vazio: legado saía seco
    aplicar(novas);
    setNovaTxt('');
  }

  function inserir() {
    const f = frases.find((x) => x.id === selecionada);
    if (!f) return;
    onInserir(f.txt);
    onClose();
  }

  return (
    <div
      className="modal-overlay open"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box">
        <div className="modal-header" style={{ background: p1 }}>
          <h2>📚 Banco de Frases</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-search">
          <input
            type="text"
            placeholder="🔍 Buscar frase..."
            value={busca}
            autoFocus
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="modal-cats">
          {['Todos', ...CATS].map((c) => (
            <button
              key={c}
              type="button"
              className={`cat-btn${c === cat ? ' active' : ''}`}
              onClick={() => setCat(c)}
            >{c}</button>
          ))}
        </div>

        <div className="modal-list">
          {visiveis.length === 0 ? (
            <div style={{ color: '#9CA3AF', padding: 20, textAlign: 'center', fontSize: 12 }}>
              Nenhuma frase encontrada.
            </div>
          ) : visiveis.map((f) => (
            <div
              key={f.id}
              className={`frase-item${selecionada === f.id ? ' selected' : ''}`}
              onClick={() => setSelecionada(f.id)}
              onDoubleClick={() => { onInserir(f.txt); onClose(); }}
            >
              <span className="frase-cat">{f.cat}</span>
              <span className="frase-text">{f.txt}</span>
              <div className="frase-btns">
                <button
                  type="button"
                  className="frase-btn-edit"
                  title="Editar"
                  onClick={(e) => {
                    e.stopPropagation();
                    const novo = window.prompt('Editar frase:', f.txt);
                    if (novo !== null) aplicar(editarFrase(frases, f.id, novo));
                  }}
                >✏️</button>
                <button
                  type="button"
                  className="frase-btn-del"
                  title="Excluir"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!window.confirm('Excluir esta frase do banco?')) return;
                    aplicar(apagarFrase(frases, f.id));
                    if (selecionada === f.id) setSelecionada(null);
                  }}
                >🗑️</button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <div className="modal-nova-frase">
            <input
              type="text"
              placeholder="Nova frase..."
              value={novaTxt}
              onChange={(e) => setNovaTxt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); salvarNova(); } }}
            />
            <select value={novaCat} onChange={(e) => setNovaCat(e.target.value)}>
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" className="btn-nova-add" onClick={salvarNova}>+ Salvar</button>
          </div>
          <button type="button" className="btn-inserir" onClick={inserir} disabled={selecionada === null}>
            Inserir no Laudo
          </button>
        </div>
      </div>
    </div>
  );
}
