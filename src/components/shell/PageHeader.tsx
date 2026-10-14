// Cabeçalho padrão de cada seção: título à esquerda, ações à direita.
export default function PageHeader({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-p1">{titulo}</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
