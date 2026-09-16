// Cabeçalho padrão de cada seção: título à esquerda, ações à direita.
export default function PageHeader({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <h1 className="text-xl font-bold text-ink">{titulo}</h1>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
