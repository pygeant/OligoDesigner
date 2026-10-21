import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import App from '../App';
import { DuplexTab } from '../components/DuplexTab';
import { MsTab } from '../components/MsTab';
import { RiskPanel } from '../components/RiskPanel';
import { DEFAULT_MODS } from '../lib/chemistry';
import { calculateStats } from '../lib/calc';
import { parseSequence } from '../lib/parser';
import { assessRisk } from '../lib/risk';
import type { Oligo } from '../lib/types';

const massOptions = { dmtOn: false, end5Mode: 'oh' as const };

function oligoFrom(notation: string): Oligo {
  const parsed = parseSequence(notation, DEFAULT_MODS);
  return { name: 'smoke', beads: parsed.beads, bonds: parsed.bonds, term5: parsed.term5, term3: parsed.term3 };
}

const OLIGO = oligoFrom('(Aom)*(U2f)(Gom)(C2f)(Aom)');

describe('render smoke tests', () => {
  it('renders the application shell', () => {
    expect(renderToString(<App />)).toContain('OligoDesigner');
  });

  it('renders the duplex tab with no antisense loaded', () => {
    const html = renderToString(<DuplexTab sense={OLIGO} mods={DEFAULT_MODS} massOptions={massOptions} />);
    expect(html).toContain('antisens');
  });

  it('renders the LC-MS tab with an expected-species table', () => {
    const stats = calculateStats(OLIGO, DEFAULT_MODS, massOptions);
    const html = renderToString(
      <MsTab oligo={OLIGO} mods={DEFAULT_MODS} massOptions={massOptions} stats={stats} />,
    );
    expect(html).toContain('Espèces attendues');
  });

  it('renders the risk panel', () => {
    const html = renderToString(<RiskPanel report={assessRisk(OLIGO, 'AUGCA')} />);
    expect(html).toContain('Risque de synthèse');
  });
});
