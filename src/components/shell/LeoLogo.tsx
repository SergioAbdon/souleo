'use client';

import { useId } from 'react';
import styles from './LeoLogo.module.css';

/** Marca aprovada: somente o traçado ECG recebe a varredura de 88 bpm. */
export default function LeoLogo({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="-10 0 500 230" role="img" aria-label="LEO">
      <defs>
        <linearGradient id={`${id}-blue`} x2="1" y2="1"><stop stopColor="#284f83" /><stop offset="1" stopColor="#2877ff" /></linearGradient>
        <mask id={`${id}-trace`} maskUnits="userSpaceOnUse" x="0" y="0" width="210" height="220"><path d="M17 153 H48 L68 113 L70 188 L87 159 H200" fill="none" stroke="white" strokeWidth="3.5" /></mask>
      </defs>
      <g fill={`url(#${id}-blue)`}>
        <path d="M55 10 H128 L91 151 H202 L201 155 H85 L74 171 L72 95 L46 149 H18 Z" />
        <path d="M16 158 H50 L64 135 L66 202 L86 164 H198 L188 214 H0 Z" />
      </g>
      <g fill="#1e3a5f" transform="translate(213 104) skewX(-12)">
        <path d="M0 0 H100 V23 H28 V43 H93 V65 H28 V87 H100 V110 H0 Z" />
        <path fillRule="evenodd" d="M150 0 H202 Q232 0 232 29 V81 Q232 110 202 110 H150 Q120 110 120 81 V29 Q120 0 150 0 Z M158 23 Q148 23 148 35 V75 Q148 87 158 87 H194 Q204 87 204 75 V35 Q204 23 194 23 Z" />
      </g>
      <g mask={`url(#${id}-trace)`}><rect className={styles.sweep} width="28" height="220" fill="#77aaff" /></g>
    </svg>
  );
}
