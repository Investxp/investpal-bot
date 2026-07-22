'use client';

import React, { useState, useCallback } from 'react';
import type { TFormData, TStrategy } from './types';
import { generateBlockXML } from './xml-generator';

type Props = {
  strategy: TStrategy | null;
  onClose: () => void;
  onApply: (xml: string, strategyName: string) => void;
};

const FIXED_INPUTS = new Set(['symbol', 'contract_type', 'tradetype', 'durationtype', 'sell_conditions', 'growth_rate']);

export function QuickStrategyModal({ strategy, onClose, onApply }: Props) {
  const [formData, setFormData] = useState<TFormData>({});

  const set = useCallback((name: keyof TFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  if (!strategy) return null;

  const handleApply = () => {
    const xml = generateBlockXML(strategy.name, formData, strategy.name);
    onApply(xml, strategy.label);
  };

  const allFields = strategy.fields.flat();
  const flatNames = new Set(allFields.filter(f => f.name).map(f => f.name as string));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#1e1e2e', borderRadius: 12, width: 640, maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', border: '1px solid #333',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 600 }}>{strategy.label}</h2>
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>{strategy.description}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '16px 24px 0', borderBottom: '1px solid #2a2a3e' }}>
          {strategy.fields.map((_, i) => (
            <button key={i} style={{
              padding: '8px 20px', cursor: 'pointer', background: 'transparent', border: 'none',
              color: '#aaa', fontSize: 13, fontWeight: 500, borderBottom: '2px solid transparent',
              marginBottom: -1,
            }}>{i === 0 ? 'Trade settings' : 'Strategy settings'}</button>
          ))}
        </div>

        {/* Category Content */}
        <div style={{ padding: '16px 24px', overflow: 'auto', flex: 1 }}>
          {strategy.fields.map((row, rowIndex) => (
            <div key={rowIndex} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              {row.map((field, colIndex) => {
                if (field.type === 'label') {
                  return (
                    <div key={colIndex} style={{ flex: '1 1 100%', marginBottom: -8 }}>
                      <label style={{ color: '#ccc', fontSize: 13, fontWeight: 500, display: 'block' }}>{field.label}</label>
                      {field.description && <span style={{ color: '#666', fontSize: 11, marginLeft: 8 }}>{field.description}</span>}
                    </div>
                  );
                }

                if (field.type === 'checkbox') {
                  const isChecked = !!formData[field.name!];
                  return (
                    <label key={colIndex} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#ccc', fontSize: 13, userSelect: 'none' }}>
                      <input type="checkbox" checked={isChecked} onChange={(e) => set(field.name!, e.target.checked)} style={{ accentColor: '#7c3aed' }} />
                      {field.label}
                    </label>
                  );
                }

                if (field.type === 'symbol') {
                  const symbols = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'EURUSD', 'GBPUSD'];
                  return (
                    <div key={colIndex} style={{ flex: '1 1 140px' }}>
                      <select value={(formData.symbol as string) || ''} onChange={(e) => set('symbol', e.target.value)} style={selectStyle}>
                        <option value="">Select symbol</option>
                        {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  );
                }

                if (field.type === 'contract_type') {
                  const types = { rise_fall: ['CALL', 'PUT'], higher_lower: ['CALL', 'PUT'], touch_no_touch: ['TOUCH', 'NO_TOUCH'], match_diff: ['DIGITMATCH', 'DIGITDIFF'] };
                  const currentType = formData.contract_type as string || '';
                  return (
                    <div key={colIndex} style={{ flex: '1 1 140px' }}>
                      <select value={currentType} onChange={(e) => set('contract_type', e.target.value)} style={selectStyle}>
                        <option value="">Select type</option>
                        {Object.entries(types).map(([cat, vals]) => (
                          <optgroup key={cat} label={cat.replace('_', ' ').toUpperCase()}>
                            {vals.map(v => <option key={v} value={v}>{v}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (field.type === 'tradetype') {
                  return (
                    <div key={colIndex} style={{ flex: '1 1 140px' }}>
                      <select value={(formData.tradetype as string) || ''} onChange={(e) => set('tradetype', e.target.value)} style={selectStyle}>
                        <option value="">Select condition</option>
                        <option value="rise">Rise</option>
                        <option value="fall">Fall</option>
                        <option value="higher">Higher</option>
                        <option value="lower">Lower</option>
                        <option value="touch">Touch</option>
                        <option value="no_touch">No Touch</option>
                        <option value="digit_match">Digit Match</option>
                        <option value="digit_diff">Digit Diff</option>
                        <option value="even">Even</option>
                        <option value="odd">Odd</option>
                        <option value="over_under">Over/Under</option>
                      </select>
                    </div>
                  );
                }

                if (field.type === 'durationtype') {
                  return (
                    <div key={colIndex} style={{ flex: '1 1 100px' }}>
                      <select value={(formData.durationtype as string) || 't'} onChange={(e) => set('durationtype', e.target.value)} style={selectStyle}>
                        <option value="t">Ticks</option>
                        <option value="s">Seconds</option>
                        <option value="m">Minutes</option>
                        <option value="h">Hours</option>
                      </select>
                    </div>
                  );
                }

                if (field.type === 'growth_rate') {
                  return (
                    <div key={colIndex} style={{ flex: '1 1 140px' }}>
                      <select value={(formData.growth_rate as string) || ''} onChange={(e) => set('growth_rate', e.target.value)} style={selectStyle}>
                        <option value="">Select rate</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(v => (
                          <option key={v} value={v}>{v}%</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (field.type === 'sell_conditions') {
                  return (
                    <div key={colIndex} style={{ flex: '1 1 200px' }}>
                      <select value={(formData.sell_conditions as string) || ''} onChange={(e) => {
                        const val = e.target.value;
                        set('sell_conditions', val);
                        set('boolean_tick_count', val === 'tick_count');
                      }} style={selectStyle}>
                        <option value="">Select condition</option>
                        <option value="take_profit">Take Profit Only</option>
                        <option value="tick_count">Tick Count Only</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  );
                }

                if (field.type === 'number') {
                  const isHidden = field.should_have?.some(s => formData[s.key] !== s.value);
                  if (isHidden && field.hide_without_should_have) return null;
                  return (
                    <div key={colIndex} style={{ flex: '1 1 100px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" step="any"
                        value={(formData[field.name!] as string) || ''}
                        onChange={(e) => set(field.name!, e.target.value)}
                        placeholder={field.label}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      {field.has_currency_unit && <span style={{ color: '#888', fontSize: 12 }}>USD</span>}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #2a2a3e', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: '#2a2a3e', color: '#ccc' }}>Cancel</button>
          <button onClick={handleApply} style={{ ...btnStyle, background: '#7c3aed', color: '#fff' }}>Apply Strategy</button>
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #333',
  background: '#16162a', color: '#ddd', fontSize: 13, outline: 'none',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #333',
  background: '#16162a', color: '#ddd', fontSize: 13, outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
};
