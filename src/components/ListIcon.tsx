import type { ReactNode } from 'react';

const shapes: Record<string, ReactNode> = {
  hourglass: <path d="M6 2h12M6 22h12M7 2v5l5 5-5 5v5M17 2v5l-5 5 5 5v5M7 18h10" />,
  badge: <><path d="m12 2 3 2 4 .5.5 4 2 3-2 3-.5 4-4 .5-3 2-3-2-4-.5-.5-4-2-3 2-3 .5-4 4-.5z"/><path d="m8 12 3 3 5-6"/></>,
  draft: <><path d="M14 2H6a2 2 0 0 0-2 2v16h8M14 2v6h6V8l-6-6M8 12h4m2 7 5-5 3 3-5 5h-3z"/></>,
  'file-x': <><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8zM14 2v6h6M9 12l6 6m0-6-6 6"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  edit: <><path d="m16 3 5 5L8 21H3v-5zM14 5l5 5" /></>,
  print: <><path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6zM17 12h1" /></>,
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></>,
  refresh: <><path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  cancel: <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>,
  link: <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" />,
  play: <path d="m8 4 12 8-12 8z" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12" /><circle cx="12" cy="12" r="3" /></>,
  chart: <path d="M3 3v18h18M7 15l4-5 4 3 6-8" />,
  alert: <><path d="m12 3 10 18H2zM12 9v4m0 4h.01" /></>,
};

export default function ListIcon({ name, className = '' }: { name: string; className?: string }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`inline-block shrink-0 align-[-3px] ${className}`}>{shapes[name]}</svg>;
}
