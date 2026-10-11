import type { ReactNode } from 'react';

// Ícones de contorno locais; válvula 5A reproduz a referência aprovada.
const shapes: Record<string, ReactNode> = {
  'sec-id': <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  'sec-med': <><path d="m3 16 13-13 5 5L8 21zM7 12l3 3m1-7 3 3m1-7 3 3" /></>,
  'sec-cam': <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  'sec-diast': <path d="M2 6q3-4 7 0t7 0 6 0M2 12q3-4 7 0t7 0 6 0M2 18q3-4 7 0t7 0 6 0" />,
  'sec-valv': <g transform="scale(.75)"><circle cx="16" cy="16" r="12" /><path d="M16 4 Q11 10 16 16 M5.6 22 Q13 24 16 16 M26.4 22 Q24 14 16 16" /></g>,
  'sec-sist': <path d="m13 2-10 12h8l-1 8 11-13h-8z" />,
  'sec-seg': <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  back: <path d="m10 5-7 7 7 7M3 12h18" />,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3" cy="6" r=".5" /><circle cx="3" cy="12" r=".5" /><circle cx="3" cy="18" r=".5" /></>,
  ordered: <><path d="M10 6h11M10 12h11M10 18h11M3 4h1v5M3 9h3M3 14c3-2 4 1 1 3l-1 2h3" /></>,
  undo: <path d="M3 4v6h6M3 10c5-8 18-5 18 3 0 5-5 8-10 6" />,
  redo: <path d="M21 4v6h-6m6 0C16 2 3 5 3 13c0 5 5 8 10 6" />,
  library: <><path d="M4 3v18M8 3v18M12 3v18m4-18 5 18" /></>,
};

export default function EditorIcon({ name, className = '' }: { name: string; className?: string }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>{shapes[name]}</svg>;
}
