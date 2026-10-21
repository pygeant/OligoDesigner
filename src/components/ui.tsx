/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small presentational primitives shared across tabs.
 */

import React from 'react';
import { cn } from '../lib/cn';

export function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all',
        active ? 'bg-zinc-800 text-blue-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function StatRow({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between group">
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover:text-zinc-400 transition-colors">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className={cn('text-lg font-mono font-bold tracking-tighter', color || 'text-zinc-200')}>
          {value}
        </span>
        {unit && <span className="text-[10px] font-mono text-zinc-600">{unit}</span>}
      </div>
    </div>
  );
}

export function BulkAction({ onClick, label, color }: { onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all active:scale-95"
    >
      <div className={cn('w-2 h-2 rounded-full', color)} />
      <span className="text-[10px] font-bold text-zinc-400">{label}</span>
    </button>
  );
}

export function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-1.5 rounded-full text-[10px] font-bold transition-all border whitespace-nowrap',
        active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700',
      )}
    >
      {label}
    </button>
  );
}

export function SectionCard({
  title,
  icon,
  actions,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm', className)}>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
