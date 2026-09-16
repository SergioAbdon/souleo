// Card de métrica do padrão V7-clean (label maiúscula, valor grande, barra opcional).
export default function MetricCard({ label, valor, sub, barraPct }: {
  label: string; valor: string | number; sub?: string; barraPct?: number;
}) {
  return (
    <div className="bg-card border border-borda rounded-xl px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
      <p className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-ink mt-0.5">{valor}{sub && <span className="text-sm font-normal text-ink-3 ml-1">{sub}</span>}</p>
      {barraPct !== undefined && (
        <div className="mt-2 h-1.5 bg-borda rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barraPct >= 90 ? 'bg-critico' : barraPct >= 70 ? 'bg-alerta' : 'bg-p2'}`}
            style={{ width: `${Math.min(100, barraPct)}%` }} />
        </div>
      )}
    </div>
  );
}
