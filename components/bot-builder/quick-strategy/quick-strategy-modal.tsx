'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { STRATEGIES } from './config';
import { generateStrategyXml } from './xml-generator';
import type { TFormData } from './types';

const SYMBOLS = [
  { value: 'R_10', label: 'Volatility 10' },
  { value: 'R_25', label: 'Volatility 25' },
  { value: 'R_50', label: 'Volatility 50' },
  { value: 'R_75', label: 'Volatility 75' },
  { value: 'R_100', label: 'Volatility 100' },
  { value: '1HZ10V', label: 'Volatility 10 (1s)' },
  { value: '1HZ25V', label: 'Volatility 25 (1s)' },
  { value: '1HZ50V', label: 'Volatility 50 (1s)' },
  { value: '1HZ100V', label: 'Volatility 100 (1s)' },
];

const CONTRACT_TYPES = [
  { value: 'RISE_FALL', label: 'Rise / Fall' },
  { value: 'RISE', label: 'Rise' },
  { value: 'FALL', label: 'Fall' },
  { value: 'ACCU', label: 'Accumulators' },
  { value: 'MULTIPLIER', label: 'Multipliers' },
  { value: 'TOUCH', label: 'Touch / No Touch' },
  { value: 'MATCHDIFF', label: 'Match/Diff' },
];

const TRADETYPES = [
  { value: 'RISE', label: 'Rise' },
  { value: 'FALL', label: 'Fall' },
];

const DURATION_UNITS = [
  { value: 't', label: 'Ticks' },
  { value: 's', label: 'Seconds' },
  { value: 'm', label: 'Minutes' },
  { value: 'h', label: 'Hours' },
];

const GROWTH_RATES = [
  { value: '0.01', label: '1%' },
  { value: '0.02', label: '2%' },
  { value: '0.03', label: '3%' },
  { value: '0.04', label: '4%' },
  { value: '0.05', label: '5%' },
];

const SELL_OPTIONS = [
  { value: 'take_profit', label: 'Take Profit' },
  { value: 'tick_count', label: 'Tick Count' },
];

type QuickStrategyModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (xml: string, name: string) => void;
};

export function QuickStrategyModal({ open, onClose, onApply }: QuickStrategyModalProps) {
  const strategies = useMemo(() => Object.entries(STRATEGIES()), []);
  const optionsStrategies = useMemo(() => strategies.filter(([, s]) => s.category === 'options'), [strategies]);
  const accumulatorsStrategies = useMemo(() => strategies.filter(([, s]) => s.category === 'accumulators'), [strategies]);

  const [category, setCategory] = useState<'options' | 'accumulators'>('options');
  const [selectedKey, setSelectedKey] = useState<string>(optionsStrategies[0]?.[0] || '');
  const [formValues, setFormValues] = useState<TFormData>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const currentStrategy = useMemo(() => {
    const entry = strategies.find(([k]) => k === selectedKey);
    return entry ? entry[1] : null;
  }, [strategies, selectedKey]);

  const currentList = category === 'options' ? optionsStrategies : accumulatorsStrategies;

  const selectStrategy = useCallback((key: string) => {
    setSelectedKey(key);
    setFormValues({});
    setErrors({});
    const found = strategies.find(([k]) => k === key)?.[1];
    if (found?.category === 'accumulators') {
      setFormValues(prev => ({ ...prev, boolean_tick_count: false }));
    }
  }, [strategies]);

  const switchCategory = useCallback((cat: 'options' | 'accumulators') => {
    setCategory(cat);
    const list = cat === 'options' ? optionsStrategies : accumulatorsStrategies;
    const firstKey = list[0]?.[0] || '';
    setSelectedKey(firstKey);
    setFormValues({});
    setErrors({});
  }, [optionsStrategies, accumulatorsStrategies]);

  const setValue = useCallback((key: string, value: string | number | boolean) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!currentStrategy) return false;
    for (const group of currentStrategy.fields) {
      for (const field of group) {
        if (!field.name || !field.validation) continue;
        const val = formValues[field.name];
        for (const rule of field.validation) {
          if (typeof rule === 'string') {
            if (rule === 'required' && (val === undefined || val === '' || val === null)) {
              errs[field.name] = 'Required';
            }
            if (rule === 'number' && val !== undefined && val !== '' && isNaN(Number(val))) {
              errs[field.name] = 'Must be a number';
            }
            if (rule === 'min' && val !== undefined && val !== '' && Number(val) < 1) {
              errs[field.name] = 'Min value is 1';
            }
          } else if (typeof rule === 'object' && 'type' in rule) {
            if (rule.type === 'min' && val !== undefined && val !== '' && Number(val) < rule.value) {
              errs[field.name] = rule.message;
            }
          }
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [currentStrategy, formValues]);

  const handleApply = useCallback(() => {
    if (!currentStrategy || !validate()) return;
    const xml = generateStrategyXml(currentStrategy.name as any, formValues);
    onApply(xml, `${currentStrategy.label} Strategy`);
    onClose();
  }, [currentStrategy, formValues, validate, onApply, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#1c1c1c] rounded-lg border border-[#2a2a2a] w-[680px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a2a]">
          <h2 className="text-sm font-bold text-zinc-200">Quick Strategy</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - categories */}
          <div className="w-48 shrink-0 border-r border-[#2a2a2a] p-3 overflow-y-auto" style={{ background: '#151717' }}>
            {/* Category tabs */}
            <div className="flex mb-3 rounded overflow-hidden border border-[#2a2a2a]">
              <button
                className={`flex-1 text-[10px] font-bold py-1.5 transition-all ${category === 'options' ? 'bg-[#ff444f] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                onClick={() => switchCategory('options')}
              >
                Options
              </button>
              <button
                className={`flex-1 text-[10px] font-bold py-1.5 transition-all ${category === 'accumulators' ? 'bg-[#ff444f] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                onClick={() => switchCategory('accumulators')}
              >
                Accumulators
              </button>
            </div>
            {/* Strategy chips */}
            {currentList.map(([key, strat]) => (
              <button
                key={key}
                className={`w-full text-left px-3 py-2 rounded text-[11px] mb-1 transition-all ${
                  selectedKey === key
                    ? 'bg-[#ff444f]/20 text-white border border-[#ff444f]/40'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                }`}
                onClick={() => selectStrategy(key)}
              >
                {strat.label}
              </button>
            ))}
          </div>

          {/* Form area */}
          <div className="flex-1 overflow-y-auto p-4">
            {currentStrategy && (
              <>
                <p className="text-[11px] text-zinc-500 mb-4 italic">{currentStrategy.description}</p>
                <div className="space-y-4">
                  {currentStrategy.fields.map((group, gi) => (
                    <div key={gi} className="space-y-2">
                      {gi > 0 && <hr className="border-[#2a2a2a]" />}
                      {group.map((field, fi) => {
                        const key = `${field.name || field.type}-${fi}`;
                        const show = checkShouldShow(field, formValues);
                        if (!show) return null;
                        return (
                          <FormField
                            key={key}
                            field={field}
                            value={formValues[field.name as string]}
                            error={errors[field.name as string]}
                            onChange={(v) => field.name && setValue(field.name, v)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#2a2a2a]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-all border border-[#2a2a2a]"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 rounded text-xs font-bold text-white transition-all"
            style={{ background: '#ff444f' }}
          >
            Apply Strategy
          </button>
        </div>
      </div>
    </div>
  );
}

function checkShouldShow(field: { should_have?: { key: string; value: string | number | boolean; multiple?: string[] }[]; hide_without_should_have?: boolean }, values: TFormData): boolean {
  if (!field.should_have) return true;
  const enabled = field.should_have.every(item => {
    const itemValue = String(values[item.key] ?? '');
    if (item.multiple) return item.multiple.includes(itemValue);
    return itemValue === String(item.value);
  });
  if (field.hide_without_should_have) return enabled;
  return true;
}

const inputStyle: React.CSSProperties = {
  background: '#151717',
  borderColor: '#2a2a2a',
  color: '#e4e4e7',
};

const labelStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

type FormFieldProps = {
  field: any;
  value: any;
  error?: string;
  onChange: (value: any) => void;
  currency?: string;
};

function FormField({ field, value, error, onChange, currency }: FormFieldProps) {
  switch (field.type) {
    case 'label':
      return (
        <div>
          <label style={labelStyle}>{field.label}</label>
          {field.description && (
            <p className="text-[10px] text-zinc-600 mt-0.5">{field.description}</p>
          )}
        </div>
      );

    case 'number':
      return (
        <div>
          <div className="flex items-center gap-2">
            <button
              className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-zinc-400 hover:text-white transition-all border"
              style={inputStyle}
              onClick={() => {
                const current = Number(value ?? 1);
                const min = field.name === 'stake' ? 0.35 : 1;
                const next = Math.max(min, current - (field.name === 'stake' ? 0.5 : 1));
                onChange(parseFloat(next.toFixed(2)));
              }}
            >-</button>
            <input
              type="text"
              inputMode="decimal"
              className="w-24 px-2 py-1 rounded text-xs font-mono text-zinc-200 border text-center"
              style={{
                ...inputStyle,
                ...(error ? { borderColor: '#ef4444' } : {}),
              }}
              value={value ?? ''}
              onChange={e => onChange(e.target.value)}
            />
            <button
              className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-zinc-400 hover:text-white transition-all border"
              style={inputStyle}
              onClick={() => {
                const current = Number(value ?? 1);
                const next = current + (field.name === 'stake' ? 0.5 : 1);
                onChange(parseFloat(next.toFixed(2)));
              }}
            >+</button>
            {field.has_currency_unit && currency && (
              <span className="text-[10px] text-zinc-500 font-mono">{currency}</span>
            )}
            {field.has_currency_unit && !currency && (
              <span className="text-[10px] text-zinc-500 font-mono">USD</span>
            )}
          </div>
          {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
        </div>
      );

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-zinc-600"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
          />
          <span className="text-xs text-zinc-300">{field.label}</span>
          {field.description && (
            <span className="text-[10px] text-zinc-600">(optional)</span>
          )}
        </label>
      );

    case 'symbol':
      return (
        <div>
          <label style={labelStyle}>Asset</label>
          <select
            className="w-full px-2 py-1.5 rounded text-xs font-mono text-zinc-200 border mt-1"
            style={inputStyle}
            value={value ?? 'R_100'}
            onChange={e => onChange(e.target.value)}
          >
            {SYMBOLS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      );

    case 'contract_type':
      return (
        <div>
          <label style={labelStyle}>Contract type</label>
          <select
            className="w-full px-2 py-1.5 rounded text-xs font-mono text-zinc-200 border mt-1"
            style={inputStyle}
            value={value ?? 'RISE_FALL'}
            onChange={e => onChange(e.target.value)}
          >
            {CONTRACT_TYPES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      );

    case 'tradetype':
      return (
        <div>
          <label style={labelStyle}>Purchase condition</label>
          <select
            className="w-full px-2 py-1.5 rounded text-xs font-mono text-zinc-200 border mt-1"
            style={inputStyle}
            value={value ?? 'RISE'}
            onChange={e => onChange(e.target.value)}
          >
            {TRADETYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      );

    case 'durationtype':
      return (
        <div>
          <label style={labelStyle}>Duration</label>
          <select
            className="w-full px-2 py-1.5 rounded text-xs font-mono text-zinc-200 border mt-1"
            style={inputStyle}
            value={value ?? 't'}
            onChange={e => onChange(e.target.value)}
          >
            {DURATION_UNITS.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      );

    case 'growth_rate':
      return (
        <div>
          <label style={labelStyle}>Growth rate</label>
          <select
            className="w-full px-2 py-1.5 rounded text-xs font-mono text-zinc-200 border mt-1"
            style={inputStyle}
            value={value ?? '0.01'}
            onChange={e => onChange(e.target.value)}
          >
            {GROWTH_RATES.map(g => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
      );

    case 'sell_conditions':
      return (
        <div>
          <label style={labelStyle}>Sell conditions</label>
          <select
            className="w-full px-2 py-1.5 rounded text-xs font-mono text-zinc-200 border mt-1"
            style={inputStyle}
            value={value ?? 'take_profit'}
            onChange={e => {
              onChange(e.target.value);
            }}
          >
            {SELL_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      );

    default:
      return null;
  }
}
