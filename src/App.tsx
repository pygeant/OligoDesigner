/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Database,
  Layers,
  Download,
  Copy,
  Trash2,
  Plus,
  Search,
  Settings2,
  Info,
  Check,
  Share,
  FileText,
  Table,
  Beaker,
  Dna,
  BookOpen,
  Archive,
  AlertCircle,
  GitCompare,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

import { cn } from './lib/cn';
import { DEFAULT_MODS, PRESET_PATTERNS } from './lib/chemistry';
import {
  baseString,
  buildRawSeq as buildSeq,
  calculateStats as computeStats,
  getBaseKey,
} from './lib/calc';
import {
  applyPattern,
  parseSequence,
  scanUnrecognized,
  stripName,
  type UnknownMapping,
} from './lib/parser';
import { drawNecklace } from './lib/render';
import { batchReportHtml, singleReportHtml } from './lib/report';
import { assessRisk } from './lib/risk';
import { getStoredKey, setStoredKey } from './lib/ai';
import { AiPanel } from './components/AiPanel';
import { DuplexTab } from './components/DuplexTab';
import { MsTab } from './components/MsTab';
import { RiskPanel } from './components/RiskPanel';
import { BulkAction, FilterChip, StatRow, TabButton } from './components/ui';
import type {
  Bead,
  MassOptions,
  ModLibrary,
  ModType,
  Modification,
  Oligo,
} from './lib/types';


// --- Main Component ---
export default function App() {
  const [activeTab, setActiveTab] = useState<'designer' | 'duplex' | 'ms' | 'batch' | 'database'>(
    'designer',
  );
  const [mods, setMods] = useState<Record<string, Modification>>(DEFAULT_MODS);
  const [oligo, setOligo] = useState<Oligo>({
    name: 'Untitled_Oligo',
    beads: [],
    bonds: [],
    term5: null,
    term3: null,
  });
  const [rawInput, setRawInput] = useState('AAUAACACUGUUUCUGUUCCU');
  const [dmtOn, setDmtOn] = useState(false);
  const [end5Mode, setEnd5Mode] = useState<'oh' | 'p'>('oh');
  const [batchInput, setBatchInput] = useState('');
  const [batchResults, setBatchResults] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [modTypeFilter, setModTypeFilter] = useState<ModType | 'all'>('all');
  const [isModModalOpen, setIsModModalOpen] = useState(false);
  const [editingMod, setEditingMod] = useState<Partial<Modification> | null>(null);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [isSavePatternModalOpen, setIsSavePatternModalOpen] = useState(false);
  const [newPatternName, setNewPatternName] = useState('');
  const [selectedBeadIndex, setSelectedBeadIndex] = useState<number | null>(null);
  const [selectedBondIndex, setSelectedBondIndex] = useState<number | null>(null);
  const [isModPickerOpen, setIsModPickerOpen] = useState(false);
  const [isBondPickerOpen, setIsBondPickerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [unrecognizedParts, setUnrecognizedParts] = useState<string[]>([]);
  const [pendingSequence, setPendingSequence] = useState<string | null>(null);
  const [isUnrecognizedModalOpen, setIsUnrecognizedModalOpen] = useState(false);
  const [unrecognizedMappings, setUnrecognizedMappings] = useState<Record<string, { modId?: string, mass?: number }>>({});
  const [necklaceDirection, setNecklaceDirection] = useState<'5-3' | '3-5'>('5-3');
  const [selectedBatchPatternId, setSelectedBatchPatternId] = useState<string | null>(null);
  const [aiKey, setAiKey] = useState('');

  // Load from LocalStorage
  useEffect(() => {
    const savedMods = localStorage.getItem('oligo_designer_mods');
    if (savedMods) {
      try {
        setMods({ ...DEFAULT_MODS, ...JSON.parse(savedMods) });
      } catch (e) {
        console.error('Failed to load mods', e);
      }
    }

    const savedPatterns = localStorage.getItem('oligo_designer_patterns');
    if (savedPatterns) {
      try {
        setPatterns(JSON.parse(savedPatterns));
      } catch (e) {
        console.error('Failed to load patterns', e);
      }
    }

    setAiKey(getStoredKey());
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    const customMods = Object.fromEntries(
      Object.entries(mods).filter(([_, m]) => !(m as Modification).builtin)
    );
    localStorage.setItem('oligo_designer_mods', JSON.stringify(customMods));
  }, [mods]);

  useEffect(() => {
    localStorage.setItem('oligo_designer_patterns', JSON.stringify(patterns));
  }, [patterns]);

  // --- Derived state ---
  const massOptions: MassOptions = useMemo(() => ({ dmtOn, end5Mode }), [dmtOn, end5Mode]);
  const calculateStats = (oligoData: Oligo) => computeStats(oligoData, mods, massOptions);
  const buildRawSeq = (target: Oligo) => buildSeq(target, mods);

  const stats = useMemo(() => calculateStats(oligo), [oligo, dmtOn, end5Mode, mods]);
  const sequence = useMemo(() => baseString(oligo), [oligo]);
  const risk = useMemo(
    () => (oligo.beads.length ? assessRisk(oligo, sequence) : null),
    [oligo, sequence],
  );

  // --- Actions ---
  const handleGenerate = (
    inputToProcess?: unknown,
    mappings?: Record<string, UnknownMapping>,
  ) => {
    const input = stripName(typeof inputToProcess === 'string' ? inputToProcess : rawInput);
    if (!input) return;

    // First pass: let the user map anything the library does not know about.
    if (!mappings) {
      const unknown = scanUnrecognized(input, mods);
      if (unknown.length > 0) {
        setUnrecognizedParts(unknown);
        setPendingSequence(input);
        setIsUnrecognizedModalOpen(true);
        return;
      }
    }

    const parsed = parseSequence(input, mods, mappings);
    if (parsed.beads.length === 0) return;

    if (Object.keys(parsed.customMods).length > 0) {
      setMods((prev) => ({ ...prev, ...parsed.customMods }));
    }

    setOligo((prev) => ({
      ...prev,
      beads: parsed.beads,
      bonds: parsed.bonds,
      term5: parsed.term5,
      term3: parsed.term3,
    }));
  };

  const updateBeadMod = (index: number, modId: string | null) => {
    const newBeads = [...oligo.beads];
    newBeads[index].modId = modId;
    setOligo({ ...oligo, beads: newBeads });
  };

  const updateBeadType = (index: number, baseType: 'dna' | 'rna') => {
    const newBeads = [...oligo.beads];
    let base = newBeads[index].base;
    // Normalize T/U when switching type
    if (base === 'T' && baseType === 'rna') base = 'U';
    if (base === 'U' && baseType === 'dna') base = 'T';
    
    newBeads[index] = { ...newBeads[index], baseType, base };
    setOligo({ ...oligo, beads: newBeads });
  };

  const updateBondType = (index: number, typeId: string) => {
    const newBonds = [...oligo.bonds];
    newBonds[index].typeId = typeId;
    setOligo({ ...oligo, bonds: newBonds });
  };

  const applyAllBeads = (modId: string | null) => {
    const newBeads = oligo.beads.map(b => ({ ...b, modId }));
    setOligo({ ...oligo, beads: newBeads });
  };

  const applyAllBonds = (typeId: string) => {
    const newBonds = oligo.bonds.map(b => ({ ...b, typeId }));
    setOligo({ ...oligo, bonds: newBonds });
  };

  const applyBondsEnds = (n: number) => {
    const newBonds = oligo.bonds.map((b, i) => ({
      ...b,
      typeId: (i < n || i >= oligo.bonds.length - n) ? 'PS' : 'PO'
    }));
    setOligo({ ...oligo, bonds: newBonds });
  };

  const runBatch = () => {
    const lines = batchInput.trim().split('\n').filter((l) => l.trim());
    const allPatterns = [...PRESET_PATTERNS, ...patterns];
    const pattern = selectedBatchPatternId
      ? allPatterns.find((p) => p.id === selectedBatchPatternId) ?? oligo
      : oligo;

    setBatchResults(
      lines.map((line, i) => {
        const parts = line.split('\t');
        const name = parts.length > 1 ? parts[0] : `Oligo_${i + 1}`;
        const batchOligo = applyPattern(name, parts.length > 1 ? parts[1] : parts[0], pattern);
        return {
          ...batchOligo,
          stats: calculateStats(batchOligo),
          risk: assessRisk(batchOligo, baseString(batchOligo)),
          rawSeq: buildRawSeq(batchOligo),
        };
      }),
    );
  };


  const exportBatchCSV = () => {
    if (!batchResults.length) return;
    const data = batchResults.map((r) => ({
      Nom: r.name,
      Séquence: r.rawSeq,
      Longueur: r.stats?.nBases,
      'MW (g/mol)': r.stats?.mw,
      'GC%': r.stats?.gcPct,
      'Epsilon 260': r.stats?.epsilon,
      'Liaisons PS': r.stats?.psCount,
      'Risque synthèse': r.risk?.score,
      'Bande de risque': r.risk?.band,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    XLSX.writeFile(workbook, 'oligo_batch_results.xlsx');
  };

  const exportBatchSEQZip = async () => {
    if (!batchResults.length) return;
    const zip = new JSZip();

    batchResults.forEach((res) => {
      const content = `${res.name}:,${res.rawSeq}`;
      zip.file(`${res.name}.seq`, content);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = `batch_sequences_${new Date().getTime()}.zip`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  const drawNecklaceOnCtx = (
    ctx: CanvasRenderingContext2D,
    target: Oligo,
    scale: number = 2,
  ) => drawNecklace(ctx, target, mods, { direction: necklaceDirection, scale });

  const exportSinglePNG = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawNecklaceOnCtx(ctx, oligo);
    const link = document.createElement('a');
    link.download = `${oligo.name || 'necklace'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const exportHTMLReport = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawNecklaceOnCtx(ctx, oligo);

    const html = singleReportHtml({
      oligo,
      mods,
      stats,
      risk,
      notation: buildRawSeq(oligo),
      png: canvas.toDataURL('image/png'),
    });

    const link = document.createElement('a');
    link.download = `${oligo.name || 'necklace'}_report.html`;
    link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    link.click();
  };

  const exportBatchPNG = async () => {
    if (!batchResults.length) return;
    const zip = new JSZip();
    const scale = 2;
    
    for (const res of batchResults) {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) continue;
      
      const oligoData: Oligo = {
        name: res.name,
        beads: res.beads,
        bonds: res.bonds,
        term5: res.term5,
        term3: res.term3
      };
      
      drawNecklaceOnCtx(tempCtx, oligoData, scale);
      const dataUrl = tempCanvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      
      zip.file(`${res.name || 'necklace'}.png`, base64Data, { base64: true });
    }
    
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = `batch_necklaces.zip`;
    link.href = URL.createObjectURL(content);
    link.click();
  };

  const exportBatchHTMLReport = () => {
    if (!batchResults.length) return;
    const html = batchReportHtml(batchResults);
    const link = document.createElement('a');
    link.download = `batch_report_${Date.now()}.html`;
    link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    link.click();
  };

  const handleSaveMod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMod?.code || !editingMod?.name || editingMod.mw === undefined) return;

    const id = editingMod.id || `custom_${Date.now()}`;
    const newMod: Modification = {
      ...editingMod as Modification,
      id,
      builtin: false,
    };

    setMods(prev => ({ ...prev, [id]: newMod }));
    setIsModModalOpen(false);
    setEditingMod(null);
  };

  const handleDeleteMod = (id: string) => {
    const newMods = { ...mods };
    delete newMods[id];
    setMods(newMods);
  };

  const handleSavePattern = () => {
    if (!newPatternName) return;
    const pattern = {
      id: `pattern_${Date.now()}`,
      name: newPatternName,
      beads: oligo.beads.map(b => ({ modId: b.modId, baseType: b.baseType })), // Store mods and type
      bonds: oligo.bonds.map(b => ({ typeId: b.typeId })),
      term5: oligo.term5,
      term3: oligo.term3,
      createdAt: new Date().toISOString()
    };
    setPatterns(prev => [pattern, ...prev]);
    setIsSavePatternModalOpen(false);
    setNewPatternName('');
  };

  const loadPattern = (p: any) => {
    // Apply pattern to current beads if possible
    const newBeads = oligo.beads.map((bead, i) => ({
      ...bead,
      modId: i < p.beads.length ? p.beads[i].modId : null,
      baseType: i < p.beads.length ? p.beads[i].baseType : (p.series || 'rna')
    }));
    
    const newBonds = oligo.bonds.map((bond, i) => ({
      ...bond,
      typeId: i < p.bonds.length ? p.bonds[i].typeId : 'PO'
    }));

    setOligo({
      ...oligo,
      beads: newBeads,
      bonds: newBonds,
      term5: p.term5,
      term3: p.term3
    });
    setActiveTab('designer');
  };

  const exportDB = () => {
    const customMods = Object.fromEntries(
      Object.entries(mods).filter(([_, m]) => !(m as Modification).builtin)
    );
    const blob = new Blob([JSON.stringify({ mods: customMods, patterns }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oligo_designer_data.json';
    a.click();
  };

  const importDB = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.mods) {
          setMods(prev => ({ ...prev, ...data.mods }));
        }
        if (data.patterns) {
          setPatterns(prev => [...data.patterns, ...prev]);
        }
      } catch (err) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  // --- Render Helpers ---
  const renderBead = (bead: Bead, index: number, isFirst: boolean) => {
    const mod = bead.modId ? mods[bead.modId] : null;
    const baseKey = getBaseKey(bead.base, bead.baseType);
    const baseMod = mods[baseKey];
    const color = mod?.color || baseMod?.color || '#64748b';
    
    const isReversed = necklaceDirection === '3-5';
    const bondIdx = isReversed ? index : index - 1;
    const hasBond = !isFirst;
    const bondMod = hasBond ? mods[oligo.bonds[bondIdx].typeId] : null;

    return (
      <div key={index} className="flex flex-col items-center group relative">
        {/* Bond Zone */}
        {hasBond && (
          <div 
            className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-12 z-10 cursor-pointer flex items-center justify-center"
            onClick={() => {
              setSelectedBondIndex(bondIdx);
              setIsBondPickerOpen(true);
            }}
          >
            <div 
              className={cn(
                "w-1.5 h-10 rounded-full transition-all",
                bondMod?.id === 'PO' ? "bg-zinc-800 group-hover:bg-zinc-700" : ""
              )}
              style={bondMod?.id !== 'PO' ? { 
                backgroundColor: bondMod?.color || '#64748b',
                boxShadow: bondMod?.id === 'PS' ? `0 0 8px ${bondMod.color}99` : 'none'
              } : {}}
            />
          </div>
        )}

        {/* Bead */}
        <div 
          className="w-14 h-14 rounded-full border-2 flex items-center justify-center font-mono font-black text-xl text-white cursor-pointer transition-transform hover:scale-110 active:scale-95 shadow-lg relative"
          style={{ backgroundColor: color, borderColor: `${color}88` }}
          onClick={() => {
            setSelectedBeadIndex(index);
            setIsModPickerOpen(true);
          }}
        >
          {bead.base}
        </div>
        
        {/* Mod Label */}
        <div className="mt-1 h-4 text-[10px] font-mono text-zinc-500 uppercase tracking-tighter">
          {mod?.code || ''}
        </div>
        
        {/* Position */}
        <div className="text-[9px] font-mono text-zinc-600 mt-1">
          {index + 1}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Dna className="text-white" size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">OligoDesigner <span className="text-blue-500">Pro</span></h1>
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest leading-none">Unified Design & Calculation</p>
            </div>
          </div>

          <nav className="flex items-center bg-zinc-900/50 p-1 rounded-lg border border-zinc-800">
            <TabButton active={activeTab === 'designer'} onClick={() => setActiveTab('designer')} icon={<Layers size={16} />} label="Designer" />
            <TabButton active={activeTab === 'duplex'} onClick={() => setActiveTab('duplex')} icon={<GitCompare size={16} />} label="Duplex" />
            <TabButton active={activeTab === 'ms'} onClick={() => setActiveTab('ms')} icon={<Beaker size={16} />} label="LC-MS" />
            <TabButton active={activeTab === 'batch'} onClick={() => setActiveTab('batch')} icon={<Table size={16} />} label="Batch" />
            <TabButton active={activeTab === 'database'} onClick={() => setActiveTab('database')} icon={<Database size={16} />} label="Database" />
          </nav>

          <div className="flex items-center gap-4">
            <a 
              href="/api/download-app" 
              download 
              className="hidden lg:flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
            >
              <Download size={14} /> Download Standalone App
            </a>
            <div className="text-right hidden md:block">
              <p className="text-[10px] text-zinc-500 font-mono uppercase">Current Session</p>
              <p className="text-xs font-medium text-zinc-300 italic">pygeant@gmail.com</p>
            </div>
            <button className="p-2 rounded-lg hover:bg-zinc-900 transition-colors text-zinc-400">
              <Settings2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'designer' && (
            <motion.div 
              key="designer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Left Column: Input & Controls */}
              <div className="lg:col-span-8 space-y-6">
                <AiPanel
                  oligo={oligo}
                  mods={mods}
                  currentBases={sequence}
                  notation={buildRawSeq(oligo)}
                  facts={[
                    `Longueur : ${stats?.nBases ?? 0} nt`,
                    `MW : ${stats?.mw ?? '—'} g/mol`,
                    `GC : ${stats?.gcPct ?? '—'} %`,
                    `Liaisons PS : ${stats?.psCount ?? 0}`,
                    `Score de risque de synthèse : ${risk?.score ?? '—'} (${risk?.band ?? '—'})`,
                  ].join('\n')}
                  onApply={(next) => {
                    setOligo(next);
                    setRawInput(buildRawSeq(next));
                  }}
                />

                {/* Input Card */}
                <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                      <Zap size={14} className="text-blue-500" />
                      Sequence Input
                    </h2>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-zinc-600 uppercase">Oligo Name:</label>
                      <input 
                        type="text"
                        value={oligo.name}
                        onChange={(e) => setOligo({ ...oligo, name: e.target.value })}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1 text-xs focus:outline-none focus:border-blue-500/50 transition-all w-[180px]"
                        placeholder="Sequence Name"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={rawInput}
                      onChange={(e) => setRawInput(e.target.value)}
                      placeholder="Enter raw sequence (e.g. (Aom)*(G2f)...)"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-lg focus:outline-none focus:border-blue-500/50 transition-all"
                    />
                    <button 
                      onClick={handleGenerate}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                    >
                      Generate
                    </button>
                  </div>
                  <p className="mt-3 text-[10px] text-zinc-600 font-mono flex items-center gap-4">
                    <span><strong className="text-zinc-400">Format:</strong> (Nom) for OMe, (N2f) for 2'F, (Nl) for LNA</span>
                    <span><strong className="text-zinc-400">Bonds:</strong> * (PS)</span>
                    <span><strong className="text-zinc-400">Terminals:</strong> /5Phos/, /3BioTEG/</span>
                  </p>
                </section>

                {/* Designer Card */}
                <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                      <Layers size={14} className="text-blue-500" />
                      Visual Necklace Editor
                    </h2>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setIsSavePatternModalOpen(true)}
                        className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest"
                      >
                        <Check size={12} /> Save Pattern
                      </button>
                      <button 
                        onClick={exportHTMLReport}
                        className="flex items-center gap-2 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest"
                      >
                        <Share size={12} /> Export HTML Report
                      </button>
                      <button 
                        onClick={exportSinglePNG}
                        className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 hover:text-white transition-colors uppercase tracking-widest"
                      >
                        <Download size={12} /> Export PNG
                      </button>
                      <div className="flex items-center gap-2 bg-zinc-950/50 border border-zinc-800 rounded-lg px-2 py-1">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">View:</span>
                        <button 
                          onClick={() => setNecklaceDirection('5-3')}
                          className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold transition-all",
                            necklaceDirection === '5-3' ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          5'-3'
                        </button>
                        <button 
                          onClick={() => setNecklaceDirection('3-5')}
                          className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold transition-all",
                            necklaceDirection === '3-5' ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          3'-5'
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                        <span className="w-2 h-2 rounded-full bg-zinc-800" /> PO
                        <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_4px_rgba(249,115,22,0.6)]" /> PS
                      </div>
                    </div>
                  </div>

                  {/* Bulk Actions Bar */}
                  <div className="flex flex-wrap items-center gap-2 mb-8 p-2 bg-zinc-950/50 rounded-xl border border-zinc-900">
                    <span className="text-[10px] font-bold text-zinc-600 px-2 uppercase">Apply All:</span>
                    <BulkAction onClick={() => applyAllBeads(null)} label="Classic" color="bg-blue-600" />
                    <BulkAction onClick={() => applyAllBeads('OMe')} label="2'OMe" color="bg-zinc-900" />
                    <BulkAction onClick={() => applyAllBeads('F')} label="2'F" color="bg-green-600" />
                    <BulkAction onClick={() => applyAllBeads('LNA')} label="LNA" color="bg-purple-600" />
                    <div className="w-px h-4 bg-zinc-800 mx-1" />
                    <BulkAction onClick={() => applyAllBonds('PS')} label="PS All" color="bg-orange-600" />
                    <BulkAction onClick={() => applyBondsEnds(3)} label="PS ±3" color="bg-orange-600/50" />
                    <BulkAction onClick={() => applyAllBonds('PO')} label="PO All" color="bg-zinc-800" />
                  </div>

                  {/* Necklace Stage */}
                  <div className="relative mb-4 flex items-center justify-end gap-4 px-4">
                    <div className="flex items-center gap-2 bg-zinc-950/50 border border-zinc-900 rounded-lg px-3 py-1.5">
                      <Search size={12} className="text-zinc-500" />
                      <input 
                        type="range" 
                        min="0.2" 
                        max="2" 
                        step="0.1" 
                        value={zoom} 
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="w-24 accent-blue-500"
                      />
                      <span className="text-[10px] font-mono text-zinc-500 w-8">{Math.round(zoom * 100)}%</span>
                      <button 
                        onClick={() => setZoom(1)}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-400 uppercase ml-2"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="relative min-h-[240px] flex items-center overflow-x-auto pb-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    {oligo.beads.length === 0 ? (
                      <div className="w-full text-center py-20 text-zinc-600 font-mono italic text-sm">
                        Awaiting sequence input...
                      </div>
                    ) : (
                      <div 
                        className="flex items-center gap-8 px-10 transition-transform duration-200 origin-left min-w-max"
                        style={{ transform: `scale(${zoom})` }}
                      >
                        {/* Left End */}
                        <div 
                          className={cn(
                            "flex flex-col items-center cursor-pointer group",
                            (necklaceDirection === '3-5' ? oligo.term3 : oligo.term5) ? (necklaceDirection === '3-5' ? "text-emerald-400" : "text-pink-400") : "text-zinc-600"
                          )}
                          onClick={() => {
                            if (necklaceDirection === '3-5') {
                              const t3 = ['3Phos', '3Biotin', null];
                              const current = t3.indexOf(oligo.term3 as any);
                              setOligo({ ...oligo, term3: t3[(current + 1) % t3.length] as any });
                            } else {
                              const t5 = ['5Phos', '5Cy3', null];
                              const current = t5.indexOf(oligo.term5 as any);
                              setOligo({ ...oligo, term5: t5[(current + 1) % t5.length] as any });
                            }
                          }}
                        >
                          <div className="w-12 h-8 border-2 border-current rounded-lg flex items-center justify-center font-mono font-bold text-xs uppercase transition-all group-hover:scale-110">
                            {necklaceDirection === '3-5' 
                              ? (oligo.term3 ? mods[oligo.term3].code.replace(/\//g, '') : "3'")
                              : (oligo.term5 ? mods[oligo.term5].code.replace(/\//g, '') : "5'")
                            }
                          </div>
                          <div className="mt-1 text-[8px] font-mono opacity-50 uppercase tracking-widest">Terminus</div>
                        </div>

                        {/* Beads */}
                        {(necklaceDirection === '3-5' ? [...oligo.beads].reverse() : oligo.beads).map((bead, i) => {
                          const originalIndex = necklaceDirection === '3-5' ? oligo.beads.length - 1 - i : i;
                          return renderBead(bead, originalIndex, i === 0);
                        })}

                        {/* Right End */}
                        <div 
                          className={cn(
                            "flex flex-col items-center cursor-pointer group",
                            (necklaceDirection === '3-5' ? oligo.term5 : oligo.term3) ? (necklaceDirection === '3-5' ? "text-pink-400" : "text-emerald-400") : "text-zinc-600"
                          )}
                          onClick={() => {
                            if (necklaceDirection === '3-5') {
                              const t5 = ['5Phos', '5Cy3', null];
                              const current = t5.indexOf(oligo.term5 as any);
                              setOligo({ ...oligo, term5: t5[(current + 1) % t5.length] as any });
                            } else {
                              const t3 = ['3Phos', '3Biotin', null];
                              const current = t3.indexOf(oligo.term3 as any);
                              setOligo({ ...oligo, term3: t3[(current + 1) % t3.length] as any });
                            }
                          }}
                        >
                          <div className="w-12 h-8 border-2 border-current rounded-lg flex items-center justify-center font-mono font-bold text-xs uppercase transition-all group-hover:scale-110">
                            {necklaceDirection === '3-5' 
                              ? (oligo.term5 ? mods[oligo.term5].code.replace(/\//g, '') : "5'")
                              : (oligo.term3 ? mods[oligo.term3].code.replace(/\//g, '') : "3'")
                            }
                          </div>
                          <div className="mt-1 text-[8px] font-mono opacity-50 uppercase tracking-widest">Terminus</div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Output Card */}
                <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                      <FileText size={14} className="text-blue-500" />
                      Synthesizer Format
                    </h2>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(buildRawSeq(oligo));
                      }}
                      className="flex items-center gap-2 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest"
                    >
                      <Copy size={12} /> Copy Sequence
                    </button>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-sm leading-relaxed break-all min-h-[60px] text-zinc-300">
                    {oligo.beads.length > 0 ? buildRawSeq(oligo) : <span className="text-zinc-700 italic">No sequence designed yet...</span>}
                  </div>
                </section>
              </div>

              {/* Right Column: Stats & Meta */}
              <div className="lg:col-span-4 space-y-6">
                {/* Stats Card */}
                <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                    <Beaker size={14} className="text-blue-500" />
                    Calculation Results
                  </h2>

                  <div className="space-y-4">
                    <StatRow label="Molecular Weight" value={stats?.mw || '—'} unit="g/mol" />
                    <StatRow label="MW (DMT-on)" value={stats?.mwDmt || '—'} unit="g/mol" color="text-orange-400" />
                    <div className="h-px bg-zinc-800 my-4" />
                    <StatRow label="Length" value={stats?.nBases || '—'} unit="nt" />
                    <StatRow label="GC Content" value={stats?.gcPct ? `${stats.gcPct}%` : '—'} />
                    <StatRow label="Epsilon 260" value={stats?.epsilon?.toLocaleString() || '—'} unit="M⁻¹cm⁻¹" />
                    <StatRow label="PS Linkages" value={stats?.psCount || '0'} />
                  </div>

                  <div className="mt-8 space-y-3">
                    <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">DMT Protection</span>
                      <button 
                        onClick={() => setDmtOn(!dmtOn)}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-colors",
                          dmtOn ? "bg-blue-600" : "bg-zinc-800"
                        )}
                      >
                        <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", dmtOn ? "left-6" : "left-1")} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">5' Phosphate</span>
                      <button 
                        onClick={() => setEnd5Mode(end5Mode === 'oh' ? 'p' : 'oh')}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-colors",
                          end5Mode === 'p' ? "bg-pink-600" : "bg-zinc-800"
                        )}
                      >
                        <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", end5Mode === 'p' ? "left-6" : "left-1")} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-8 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                    <div className="flex gap-3">
                      <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-zinc-500 leading-relaxed">
                        ε 260 : somme des coefficients monomériques corrigée d'un facteur
                        d'hypochromicité forfaitaire de 0,9 — approximation indépendante de la
                        séquence. La MW tient compte du squelette et de l'état de l'extrémité 5'.
                      </p>
                    </div>
                  </div>
                </section>

                <RiskPanel report={risk} />
              </div>
            </motion.div>
          )}

          {activeTab === 'duplex' && (
            <motion.div
              key="duplex"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <DuplexTab sense={oligo} mods={mods} massOptions={massOptions} />
            </motion.div>
          )}

          {activeTab === 'ms' && (
            <motion.div
              key="ms"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <MsTab oligo={oligo} mods={mods} massOptions={massOptions} stats={stats} />
            </motion.div>
          )}

          {activeTab === 'batch' && (
            <motion.div 
              key="batch"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                      <Table size={14} className="text-blue-500" />
                      Batch Processing
                    </h2>
                    <p className="text-xs text-zinc-600 mt-1">Apply a modification pattern to multiple sequences.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest ml-1">Pattern Source</label>
                      <select 
                        value={selectedBatchPatternId || ''}
                        onChange={(e) => setSelectedBatchPatternId(e.target.value || null)}
                        className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-zinc-300 focus:outline-none focus:border-blue-500/50 transition-all min-w-[200px]"
                      >
                        <option value="">Current Designer Pattern</option>
                        <optgroup label="Presets">
                          {PRESET_PATTERNS.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                        {patterns.length > 0 && (
                          <optgroup label="Saved Patterns">
                            {patterns.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                    <button 
                      onClick={runBatch}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 mt-4"
                    >
                      Calculate Batch
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Input Sequences (Name [TAB] Sequence)</label>
                    <textarea 
                      value={batchInput}
                      onChange={(e) => setBatchInput(e.target.value)}
                      placeholder="Oligo_1&#9;AAUAACACUGUUUCUGUUCCU&#10;Oligo_2&#9;GCUAGCUAGCUAGCUAGCUA"
                      className="w-full h-[200px] bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-sm focus:outline-none focus:border-blue-500/50 transition-all resize-none"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Selected Pattern Summary</label>
                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 flex items-center gap-6 overflow-hidden">
                      <div className="shrink-0 max-w-[200px]">
                        <p className="text-[10px] text-zinc-500 italic truncate">
                          {selectedBatchPatternId 
                            ? `Pattern: ${[...PRESET_PATTERNS, ...patterns].find(p => p.id === selectedBatchPatternId)?.name}`
                            : "Current Designer Pattern"
                          }
                        </p>
                      </div>
                      
                      <div className="flex-1 flex flex-nowrap gap-1 overflow-x-auto pb-1 no-scrollbar">
                        {(selectedBatchPatternId 
                          ? [...PRESET_PATTERNS, ...patterns].find(p => p.id === selectedBatchPatternId) 
                          : oligo
                        )?.beads.map((b: any, i: number) => {
                          const p = selectedBatchPatternId 
                            ? [...PRESET_PATTERNS, ...patterns].find(p => p.id === selectedBatchPatternId) 
                            : oligo;
                          return (
                            <div key={i} className="flex flex-col items-center gap-0.5 shrink-0">
                              <div 
                                className="w-5 h-5 rounded-full border border-zinc-700 flex items-center justify-center text-[9px] font-bold text-white"
                                style={{ backgroundColor: b.modId ? mods[b.modId].color : '#18181b' }}
                              >
                                {b.modId ? mods[b.modId].code[0] : 'N'}
                              </div>
                              {i < (p?.bonds?.length || 0) && p?.bonds[i].typeId === 'PS' && (
                                <div className="w-0.5 h-1.5 bg-orange-500 rounded-full" />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="shrink-0 flex items-center gap-4 text-[9px] font-mono text-zinc-600 border-l border-zinc-800 pl-6">
                        {(() => {
                          const p = selectedBatchPatternId 
                            ? [...PRESET_PATTERNS, ...patterns].find(p => p.id === selectedBatchPatternId) 
                            : oligo;
                          return (
                            <>
                              {p?.term5 && <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{backgroundColor: mods[p.term5].color}}/> 5': {mods[p.term5].code}</span>}
                              {p?.term3 && <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{backgroundColor: mods[p.term3].color}}/> 3': {mods[p.term3].code}</span>}
                              {!p?.term5 && !p?.term3 && <span className="opacity-30">No Termini Mods</span>}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {batchResults.length > 0 && (
                <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Results Table</h2>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={exportBatchHTMLReport}
                        className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-blue-400 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-zinc-800"
                      >
                        <Share size={14} /> Export HTML Report
                      </button>
                      <button 
                        onClick={exportBatchPNG}
                        className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-zinc-800"
                      >
                        <Download size={14} /> Export PNGs
                      </button>
                      <button 
                        onClick={exportBatchSEQZip}
                        className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-amber-400 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-zinc-800"
                      >
                        <Archive size={14} /> Export .seq ZIP
                      </button>
                      <button 
                        onClick={exportBatchCSV}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
                      >
                        <Download size={14} /> Export Excel
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="py-4 px-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Name</th>
                          <th className="py-4 px-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sequence</th>
                          <th className="py-4 px-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center">nt</th>
                          <th className="py-4 px-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">MW (off)</th>
                          <th className="py-4 px-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">GC%</th>
                          <th className="py-4 px-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">ε 260</th>
                          <th className="py-4 px-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Risque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchResults.map((res, i) => (
                          <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors group">
                            <td className="py-4 px-4 text-xs font-bold text-zinc-300 italic">{res.name}</td>
                            <td className="py-4 px-4 text-[10px] font-mono text-zinc-500 break-all max-w-[300px]">{res.rawSeq}</td>
                            <td className="py-4 px-4 text-xs text-center text-zinc-400">{res.stats?.nBases}</td>
                            <td className="py-4 px-4 text-xs text-right font-bold text-blue-400">{res.stats?.mw}</td>
                            <td className="py-4 px-4 text-xs text-right text-zinc-400">{res.stats?.gcPct}%</td>
                            <td className="py-4 px-4 text-xs text-right text-zinc-400">{res.stats?.epsilon?.toLocaleString()}</td>
                            <td
                              className={cn(
                                'py-4 px-4 text-xs text-right font-bold',
                                res.risk?.score >= 45
                                  ? 'text-red-400'
                                  : res.risk?.score >= 20
                                    ? 'text-amber-400'
                                    : 'text-emerald-400',
                              )}
                              title={res.risk?.band}
                            >
                              {res.risk?.score ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </motion.div>
          )}

          {activeTab === 'database' && (
            <motion.div 
              key="database"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                      <Database size={14} className="text-blue-500" />
                      Chemical Modifications
                    </h2>
                    <p className="text-xs text-zinc-600 mt-1">Manage sugars, backbones, and terminal modifications.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
                      <input 
                        type="text" 
                        placeholder="Search mods..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-blue-500/50 transition-all w-[200px]"
                      />
                    </div>
                    <button 
                      onClick={() => {
                        setEditingMod({
                          code: '',
                          name: '',
                          type: 'sugar',
                          mw: 0,
                          color: '#3b82f6',
                          delta: true
                        });
                        setIsModModalOpen(true);
                      }}
                      className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-zinc-800 flex items-center gap-2"
                    >
                      <Plus size={14} /> Add New
                    </button>
                  </div>
                </div>

                {/* Help Info Box */}
                <div className="mb-8 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <BookOpen size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-blue-400 mb-1">No-Database Storage</h3>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      Your custom modifications are saved in your browser's <strong className="text-zinc-400">LocalStorage</strong>. 
                      They persist across sessions on this device. Use the <strong className="text-zinc-400">Export/Import</strong> icons below to back up your library as a <strong className="text-zinc-400">JSON</strong> file or move it to another computer.
                    </p>
                  </div>
                </div>

                {/* API Key for Standalone Use */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                      <Settings2 size={16} className="text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-indigo-400 mb-1">Clé API — mode standalone</h3>
                      <p className="text-[10px] text-zinc-500">
                        Inutile lorsque l'application est servie par son serveur : la clé reste alors
                        côté serveur. En fichier HTML autonome, la clé saisie ici est conservée dans
                        ce navigateur et les séquences analysées sont envoyées au fournisseur.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="password"
                      placeholder="Clé API…"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                      value={aiKey}
                      onChange={(e) => {
                        setAiKey(e.target.value);
                        setStoredKey(e.target.value.trim());
                      }}
                    />
                    <div className="flex items-center px-3 bg-zinc-950 border border-zinc-800 rounded-xl text-[10px] text-zinc-500 font-mono">
                      {aiKey ? 'Stockée localement' : 'Aucune clé'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    <FilterChip active={modTypeFilter === 'all'} onClick={() => setModTypeFilter('all')} label="All" />
                    <FilterChip active={modTypeFilter === 'sugar'} onClick={() => setModTypeFilter('sugar')} label="Sugars" />
                    <FilterChip active={modTypeFilter === 'backbone'} onClick={() => setModTypeFilter('backbone')} label="Backbones" />
                    <FilterChip active={modTypeFilter === 'spacer'} onClick={() => setModTypeFilter('spacer')} label="Spacers" />
                    <FilterChip active={modTypeFilter === 'terminal5'} onClick={() => setModTypeFilter('terminal5')} label="5' Mods" />
                    <FilterChip active={modTypeFilter === 'terminal3'} onClick={() => setModTypeFilter('terminal3')} label="3' Mods" />
                  </div>
                  <div className="flex items-center gap-4">
                    <a 
                      href="/api/download-app" 
                      download 
                      className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 uppercase tracking-widest transition-all"
                    >
                      <Download size={14} /> Standalone App
                    </a>
                    <div className="flex items-center gap-2">
                      <button onClick={exportDB} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors" title="Export All Data">
                        <Download size={18} />
                      </button>
                      <label className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer" title="Import Data">
                        <Plus size={18} />
                        <input type="file" className="hidden" onChange={importDB} accept=".json" />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-12">
                  {(Object.values(mods) as Modification[])
                    .filter(m => {
                      const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.code.toLowerCase().includes(searchTerm.toLowerCase());
                      const matchesType = modTypeFilter === 'all' || m.type === modTypeFilter;
                      return matchesSearch && matchesType;
                    })
                    .map((mod) => (
                      <div key={mod.id} className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 hover:border-zinc-800 transition-all group">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] text-white shadow-sm" style={{ backgroundColor: mod.color }}>
                              {mod.code[0]}
                            </div>
                            <div>
                              <h3 className="text-xs font-bold text-zinc-200">{mod.name}</h3>
                              <p className="text-[10px] text-zinc-600 font-mono">{mod.code}</p>
                            </div>
                          </div>
                          {mod.builtin ? (
                            <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest bg-zinc-900 px-2 py-0.5 rounded">Core</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => {
                                  setEditingMod(mod);
                                  setIsModModalOpen(true);
                                }}
                                className="text-zinc-700 hover:text-blue-400 transition-colors"
                              >
                                <Settings2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteMod(mod.id)}
                                className="text-zinc-700 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                          <div className="bg-zinc-900/50 rounded-lg p-2">
                            <p className="text-[8px] text-zinc-600 uppercase font-bold">MW</p>
                            <p className="text-xs font-mono text-blue-400">{mod.mw} <span className="text-[8px] text-zinc-700">g/mol</span></p>
                          </div>
                          <div className="bg-zinc-900/50 rounded-lg p-2">
                            <p className="text-[8px] text-zinc-600 uppercase font-bold">Type</p>
                            <p className="text-xs font-mono text-zinc-400">{mod.type}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Template Library Section */}
                <div className="mt-12">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                    <BookOpen size={14} className="text-blue-500" />
                    Template Library (Presets)
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {PRESET_PATTERNS.map((p) => (
                      <div key={p.id} className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 hover:border-blue-500/30 transition-all group">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-xs font-bold text-zinc-200">{p.name}</h3>
                            <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed">
                              {p.description}
                            </p>
                          </div>
                          <button 
                            onClick={() => loadPattern(p)}
                            className="text-blue-500 hover:text-blue-400 transition-colors shrink-0"
                            title="Apply Template"
                          >
                            <Zap size={14} />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-4 opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                          {p.beads.map((b: any, i: number) => (
                            <React.Fragment key={i}>
                              <div 
                                className="w-2.5 h-2.5 rounded-full border border-zinc-800"
                                style={{ backgroundColor: b.modId ? mods[b.modId]?.color : '#18181b' }}
                              />
                              {i < p.bonds?.length && p.bonds[i].typeId === 'PS' && (
                                <div className="w-1 h-2 bg-orange-500 rounded-full" />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Patterns Section */}
                <div className="mt-12">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                    <Check size={14} className="text-emerald-500" />
                    Saved Modification Patterns
                  </h2>
                  
                  {patterns.length === 0 ? (
                    <div className="bg-zinc-900/20 border border-zinc-900 border-dashed rounded-2xl p-12 text-center">
                      <p className="text-zinc-600 text-sm italic">No patterns saved yet. Design one in the Designer tab!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {patterns.map((p) => (
                        <div key={p.id} className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 hover:border-emerald-500/30 transition-all group">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="text-xs font-bold text-zinc-200">{p.name}</h3>
                              <p className="text-[8px] text-zinc-600 font-mono uppercase mt-1">
                                {p.beads.length} nt pattern • {p.series}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => loadPattern(p)}
                                className="text-emerald-500 hover:text-emerald-400 transition-colors"
                                title="Apply Pattern"
                              >
                                <Zap size={14} />
                              </button>
                              <button 
                                onClick={() => setPatterns(prev => prev.filter(x => x.id !== p.id))}
                                className="text-zinc-700 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-4 opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                            {p.beads.map((b: any, i: number) => (
                              <React.Fragment key={i}>
                                <div 
                                  className="w-3 h-3 rounded-full border border-zinc-800"
                                  style={{ backgroundColor: b.modId ? mods[b.modId]?.color : '#18181b' }}
                                />
                                {i < p.bonds?.length && p.bonds[i].typeId === 'PS' && (
                                  <div className="w-1 h-2.5 bg-orange-500 rounded-full" />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isModModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
            >
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Database size={20} className="text-blue-500" />
                {editingMod?.id ? 'Edit Modification' : 'Add New Modification'}
              </h2>
              
              <form onSubmit={handleSaveMod} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Code</label>
                    <input 
                      required
                      value={editingMod?.code || ''}
                      onChange={e => setEditingMod({ ...editingMod, code: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50"
                      placeholder="e.g. 2'MOE"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">MW Delta</label>
                    <input 
                      required
                      type="number"
                      step="0.001"
                      value={editingMod?.mw || ''}
                      onChange={e => setEditingMod({ ...editingMod, mw: parseFloat(e.target.value) })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50"
                      placeholder="0.000"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">Full Name</label>
                  <input 
                    required
                    value={editingMod?.name || ''}
                    onChange={e => setEditingMod({ ...editingMod, name: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50"
                    placeholder="e.g. 2'-O-Methoxyethyl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">Synthesizer Notation</label>
                  <input 
                    value={editingMod?.notation || ''}
                    onChange={e => setEditingMod({ ...editingMod, notation: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50"
                    placeholder="e.g. (Nom) or (N2f)"
                  />
                  <p className="text-[9px] text-zinc-600 mt-1 italic">Use 'N' as a placeholder for the base (e.g. (Nm) for 2'OMe).</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Type</label>
                    <select 
                      value={editingMod?.type || 'sugar'}
                      onChange={e => setEditingMod({ ...editingMod, type: e.target.value as ModType })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50"
                    >
                      <option value="sugar">Sugar</option>
                      <option value="backbone">Backbone</option>
                      <option value="spacer">Spacer</option>
                      <option value="terminal5">5' Mod</option>
                      <option value="terminal3">3' Mod</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Color</label>
                    <div className="flex gap-2">
                      <input 
                        type="color"
                        value={editingMod?.color || '#3b82f6'}
                        onChange={e => setEditingMod({ ...editingMod, color: e.target.value })}
                        className="w-10 h-9 bg-zinc-950 border border-zinc-800 rounded-lg p-1 cursor-pointer"
                      />
                      <input 
                        value={editingMod?.color || ''}
                        onChange={e => setEditingMod({ ...editingMod, color: e.target.value })}
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModModalOpen(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-xl font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
                  >
                    Save Mod
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isSavePatternModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSavePatternModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
            >
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-emerald-400">
                <Check size={20} />
                Save Pattern
              </h2>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">Pattern Name</label>
                  <input 
                    autoFocus
                    value={newPatternName}
                    onChange={e => setNewPatternName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSavePattern()}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                    placeholder="e.g. siRNA_Gapmer_v1"
                  />
                </div>

                <div className="pt-6 flex gap-3">
                  <button 
                    onClick={() => setIsSavePatternModalOpen(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-xl font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSavePattern}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isModPickerOpen && selectedBeadIndex !== null && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModPickerOpen(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl max-h-[80vh] flex flex-col"
            >
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Layers size={20} className="text-blue-500" />
                Select Modification for Position {selectedBeadIndex + 1}
              </h2>
              
              <div className="overflow-y-auto pr-2 space-y-6">
                <div>
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Sugar Type</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateBeadType(selectedBeadIndex, 'dna')}
                      className={cn(
                        "flex-1 py-2 rounded-xl border text-xs font-bold transition-all",
                        oligo.beads[selectedBeadIndex].baseType === 'dna' 
                          ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20" 
                          : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                      )}
                    >
                      DNA (Deoxy)
                    </button>
                    <button 
                      onClick={() => updateBeadType(selectedBeadIndex, 'rna')}
                      className={cn(
                        "flex-1 py-2 rounded-xl border text-xs font-bold transition-all",
                        oligo.beads[selectedBeadIndex].baseType === 'rna' 
                          ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20" 
                          : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                      )}
                    >
                      RNA (Ribose)
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Sugar Modifications</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => {
                        updateBeadMod(selectedBeadIndex, null);
                        setIsModPickerOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                        oligo.beads[selectedBeadIndex].modId === null 
                          ? "bg-zinc-800 border-zinc-700" 
                          : "bg-zinc-950 border-zinc-900 hover:border-zinc-800"
                      )}
                    >
                      <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700" />
                      <div>
                        <p className="text-xs font-bold">Standard</p>
                        <p className="text-[10px] text-zinc-600">No modification</p>
                      </div>
                    </button>
                    {(Object.values(mods) as Modification[])
                      .filter(m => m.type === 'sugar')
                      .map(m => (
                        <button 
                          key={m.id}
                          onClick={() => {
                            updateBeadMod(selectedBeadIndex, m.id);
                            setIsModPickerOpen(false);
                          }}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                            oligo.beads[selectedBeadIndex].modId === m.id 
                              ? "bg-zinc-800 border-zinc-700" 
                              : "bg-zinc-950 border-zinc-900 hover:border-zinc-800"
                          )}
                        >
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: m.color }} />
                          <div>
                            <p className="text-xs font-bold">{m.name}</p>
                            <p className="text-[10px] text-zinc-600">{m.code}</p>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Other Modifications</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.values(mods) as Modification[])
                      .filter(m => m.type !== 'sugar' && m.type !== 'standard' && m.type !== 'backbone' && !m.type.startsWith('terminal'))
                      .map(m => (
                        <button 
                          key={m.id}
                          onClick={() => {
                            updateBeadMod(selectedBeadIndex, m.id);
                            setIsModPickerOpen(false);
                          }}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                            oligo.beads[selectedBeadIndex].modId === m.id 
                              ? "bg-zinc-800 border-zinc-700" 
                              : "bg-zinc-950 border-zinc-900 hover:border-zinc-800"
                          )}
                        >
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: m.color }} />
                          <div>
                            <p className="text-xs font-bold">{m.name}</p>
                            <p className="text-[10px] text-zinc-600">{m.code}</p>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-auto">
                <button 
                  onClick={() => setIsModPickerOpen(false)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-xl font-bold transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isBondPickerOpen && selectedBondIndex !== null && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBondPickerOpen(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl max-h-[80vh] flex flex-col"
            >
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Database size={20} className="text-orange-500" />
                Select Backbone for Position {selectedBondIndex + 1}-{selectedBondIndex + 2}
              </h2>
              
              <div className="overflow-y-auto pr-2 space-y-6">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.values(mods) as Modification[])
                    .filter(m => m.type === 'backbone')
                    .map(m => (
                      <button 
                        key={m.id}
                        onClick={() => {
                          updateBondType(selectedBondIndex, m.id);
                          setIsBondPickerOpen(false);
                        }}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                          oligo.bonds[selectedBondIndex].typeId === m.id 
                            ? "bg-zinc-800 border-zinc-700" 
                            : "bg-zinc-950 border-zinc-900 hover:border-zinc-800"
                        )}
                      >
                        <div className="w-1 h-6 rounded-full" style={{ backgroundColor: m.color }} />
                        <div>
                          <p className="text-xs font-bold">{m.name}</p>
                          <p className="text-[10px] text-zinc-600">{m.code}</p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              <div className="pt-6 mt-auto">
                <button 
                  onClick={() => setIsBondPickerOpen(false)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-xl font-bold transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 w-full bg-zinc-950 border-t border-zinc-900 px-6 py-2 flex items-center justify-between text-[10px] font-mono text-zinc-600 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>System Ready</span>
          </div>
          <div className="hidden sm:block">
            Database: <span className="text-zinc-400">{Object.keys(mods).length} entries</span>
          </div>
        </div>
        <div className="flex items-center gap-4 uppercase tracking-widest">
          <span>© Pierre-Yves GEANT</span>
          <span className="text-zinc-800">|</span>
          <span>v2.1.0-unified</span>
        </div>
      </footer>

      {/* Unrecognized Parts Modal */}
      {isUnrecognizedModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Unrecognized Sequence Parts
              </h2>
              <button onClick={() => setIsUnrecognizedModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full text-zinc-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <p className="text-sm text-gray-600 italic">
                The following parts of your sequence were not recognized. Please define them by selecting an existing modification or entering a custom mass.
              </p>
              
              <div className="space-y-4">
                {unrecognizedParts.map((part) => (
                  <div key={part} className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="min-w-[100px]">
                      <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg font-mono text-sm font-bold">
                        {part}
                      </span>
                    </div>
                    
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Select Existing</label>
                        <select 
                          className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm text-zinc-900"
                          value={unrecognizedMappings[part]?.modId || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setUnrecognizedMappings(prev => ({
                              ...prev,
                              [part]: val ? { modId: val } : {}
                            }));
                          }}
                        >
                          <option value="">-- Select Modification --</option>
                          {Object.values(mods).map((m: any) => (
                            <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Or Custom Mass (g/mol)</label>
                        <input 
                          type="number"
                          placeholder="e.g. 500.0"
                          className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm text-zinc-900"
                          value={unrecognizedMappings[part]?.mass || ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setUnrecognizedMappings(prev => ({
                              ...prev,
                              [part]: !isNaN(val) ? { mass: val } : {}
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsUnrecognizedModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  handleGenerate(pendingSequence!, unrecognizedMappings);
                  setIsUnrecognizedModalOpen(false);
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors"
              >
                Apply & Generate
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
