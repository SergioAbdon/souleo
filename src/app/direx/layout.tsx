import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LEO · Diretoria',
  description: 'Painel administrativo do LEO',
};

export default function DirexLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
