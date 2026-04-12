'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Dashboard — Visao geral do sistema
// Metricas, Alertas, Atividade recente
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, query, orderBy, limit, where, Timestamp
} from 'firebase/firestore';
import Link from 'next/link';

// ── Tipos ──
type WsData = { id: string; tipo?: string; nomeClinica?: string; ownerUid?: string; [k: string]: unknown };
type SubData = { id: string; workspaceId?: string; tipo?: string; franquiaMensal?: number; franquiaUsada?: number; creditosExtras?: number; cicloFim?: Timestamp; [k: string]: unknown };
type LogData = { id: string; tipo?: string; ts?: Timestamp; medicoUid?: string; wsId?: string; [k: string]: unknown };

type Alerta = {
  nivel: 'amarelo' | 'vermelho';
  texto: string;
  sub?: string;
  link?: string;
};

// ── Helpers ──
function fmtDate(ts: Timestamp | undefined) {
  if (!ts) return '\u2014';
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diffDias(ts: Timestamp | undefined): number {
  if (!ts) return -999;
  const fim = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
  return (fim.getTime() - Date.now()) / 864e5;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);

  // Metricas
  const [totalWs, setTotalWs] = useState(0);
  const [totalPF, setTotalPF] = useState(0);
  const [totalPJ, setTotalPJ] = useState(0);
  const [totalProfs, setTotalProfs] = useState(0);
  const [subsAtivas, setSubsAtivas] = useState(0);
  const [subsExpiradas, setSubsExpiradas] = useState(0);
  const [expirando7d, setExpirando7d] = useState(0);
  const [laudosMes, setLaudosMes] = useState(0);

  // Alertas + Logs
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [logs, setLogs] = useState<LogData[]>([]);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      // Inicio do mes atual
      const agora = new Date();
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

      const [wsSnap, subSnap, profSnap, logSnap, consumoSnap] = await Promise.all([
        getDocs(collection(db, 'workspaces')),
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'profissionais')),
        getDocs(query(collection(db, 'logs'), orderBy('ts', 'desc'), limit(15))),
        getDocs(query(collection(db, 'consumo'), where('emitidoEm', '>=', Timestamp.fromDate(inicioMes)))),
      ]);

      const wsList = wsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WsData));
      const subsList = subSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubData));
      const logsList = logSnap.docs.map(d => ({ id: d.id, ...d.data() } as LogData));

      // ── Metricas ──
      setTotalWs(wsList.length);
      setTotalPF(wsList.filter(w => w.tipo === 'PF').length);
      setTotalPJ(wsList.filter(w => w.tipo === 'PJ').length);
      setTotalProfs(profSnap.size);
      setLaudosMes(consumoSnap.size);
      setLogs(logsList);

      const ativas = subsList.filter(s => diffDias(s.cicloFim) > 0).length;
      setSubsAtivas(ativas);
      setSubsExpiradas(subsList.length - ativas);

      const exp7 = subsList.filter(s => {
        const d = diffDias(s.cicloFim);
        return d > 0 && d <= 7;
      }).length;
      setExpirando7d(exp7);

      // ── Alertas ──
      const alertList: Alerta[] = [];

      // Storage rules (alerta fixo - expira 11/05/2026)
      const storageExpira = new Date(2026, 4, 11); // 11 de maio
      const diasStorage = Math.ceil((storageExpira.getTime() - Date.now()) / 864e5);
      if (diasStorage <= 30 && diasStorage > 0) {
        alertList.push({
          nivel: diasStorage <= 7 ? 'vermelho' : 'amarelo',
          texto: `Firebase Storage Rules expiram em ${diasStorage} dias`,
          sub: 'Ajustar regras antes de 11/05/2026 ou PDFs vao parar de funcionar',
        });
      }

      // Trials expirando
      subsList.filter(s => {
        const d = diffDias(s.cicloFim);
        return s.tipo === 'trial' && d > 0 && d <= 7;
      }).forEach(s => {
        const ws = wsList.find(w => w.id === s.workspaceId);
        const dias = Math.ceil(diffDias(s.cicloFim));
        alertList.push({
          nivel: 'amarelo',
          texto: `${ws?.nomeClinica || s.workspaceId} \u2014 trial expira em ${dias} dia${dias > 1 ? 's' : ''}`,
          sub: `Uso: ${s.franquiaUsada || 0}/${s.franquiaMensal || 0} laudos`,
          link: '/direx/painel/licencas',
        });
      });

      // Inadimplentes
      subsList.filter(s => diffDias(s.cicloFim) < 0).forEach(s => {
        const ws = wsList.find(w => w.id === s.workspaceId);
        const diasAtras = Math.abs(Math.ceil(diffDias(s.cicloFim)));
        alertList.push({
          nivel: 'vermelho',
          texto: `${ws?.nomeClinica || s.workspaceId} \u2014 expirou ha ${diasAtras} dia${diasAtras > 1 ? 's' : ''}`,
          sub: `Creditos restantes: ${s.creditosExtras || 0}`,
          link: '/direx/painel/licencas',
        });
      });

      // Franquia alta (>= 80%)
      subsList.filter(s => {
        const d = diffDias(s.cicloFim);
        const usado = s.franquiaUsada || 0;
        const total = s.franquiaMensal || 1;
        return d > 0 && usado / total >= 0.8;
      }).forEach(s => {
        const ws = wsList.find(w => w.id === s.workspaceId);
        alertList.push({
          nivel: 'amarelo',
          texto: `${ws?.nomeClinica || s.workspaceId} \u2014 ${s.franquiaUsada}/${s.franquiaMensal} laudos usados`,
          sub: `${Math.round(((s.franquiaUsada || 0) / (s.franquiaMensal || 1)) * 100)}% da franquia`,
          link: '/direx/painel/licencas',
        });
      });

      setAlertas(alertList);
    } catch (e) {
      console.error('Dashboard carregarDados:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#64748B] text-sm animate-pulse">Carregando dashboard...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-bold text-[#F8FAFC] mb-4">Dashboard</h1>

      {/* ── METRICAS ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-6">
        <MetricCard label="Workspaces" value={totalWs} sub={`${totalPF} PF \u00B7 ${totalPJ} PJ`} />
        <MetricCard label="Profissionais" value={totalProfs} />
        <MetricCard label="Licencas ativas" value={subsAtivas} sub={`${subsExpiradas} expirada${subsExpiradas !== 1 ? 's' : ''}`} />
        <MetricCard label="Expirando 7 dias" value={expirando7d} cor={expirando7d > 0 ? '#F59E0B' : undefined} />
        <MetricCard label="Laudos (mes)" value={laudosMes} />
      </div>

      {/* ── ALERTAS ── */}
      {alertas.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-[#F8FAFC] mb-3">Alertas</h2>
          <div className="space-y-2">
            {alertas.map((a, i) => (
              <div
                key={i}
                className={`bg-[#1E293B] border border-[#334155] rounded-lg px-4 py-3 border-l-4 flex items-center justify-between gap-3 ${
                  a.nivel === 'vermelho' ? 'border-l-[#EF4444]' : 'border-l-[#F59E0B]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#F8FAFC]">{a.texto}</p>
                  {a.sub && <p className="text-[11px] text-[#64748B] mt-0.5">{a.sub}</p>}
                </div>
                {a.link && (
                  <Link
                    href={a.link}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-[#334155] text-[#94A3B8] hover:bg-[#475569] hover:text-[#F8FAFC] transition-colors flex-shrink-0"
                  >
                    Ver
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ATIVIDADE RECENTE ── */}
      <div>
        <h2 className="text-sm font-bold text-[#F8FAFC] mb-3">Atividade recente</h2>
        {logs.length === 0 ? (
          <p className="text-[#64748B] text-sm">Nenhuma atividade registrada.</p>
        ) : (
          <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#334155]">
                  <th className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">Quando</th>
                  <th className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const detalhes = Object.entries(log)
                    .filter(([k]) => !['id', 'tipo', 'ts', 'medicoUid', 'wsId'].includes(k))
                    .map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : v}`)
                    .join(', ')
                    .substring(0, 120);

                  return (
                    <tr key={log.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                      <td className="px-4 py-2.5 text-[#CBD5E1] whitespace-nowrap">{fmtDate(log.ts)}</td>
                      <td className="px-4 py-2.5 text-[#CBD5E1]">{log.tipo || '\u2014'}</td>
                      <td className="px-4 py-2.5 text-[#64748B] text-[11px] max-w-[300px] truncate">{detalhes || '\u2014'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente Card de Metrica ──
function MetricCard({ label, value, sub, cor }: { label: string; value: number; sub?: string; cor?: string }) {
  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4">
      <div className="text-[11px] text-[#64748B] uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className="text-3xl font-bold" style={{ color: cor || '#F8FAFC' }}>{value}</div>
      {sub && <div className="text-[11px] text-[#64748B] mt-1">{sub}</div>}
    </div>
  );
}
