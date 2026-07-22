'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as Blockly from 'blockly';
import { TOOLBOX_XML } from './toolbox';

const ALL_BLOCK_TYPES = new Set<string>();
const xmlParser = new DOMParser();

function buildBlockTypeIndex(): void {
  if (ALL_BLOCK_TYPES.size > 0) return;
  const doc = xmlParser.parseFromString(TOOLBOX_XML, 'text/xml');
  const blocks = doc.querySelectorAll('block');
  blocks.forEach(b => {
    const type = b.getAttribute('type');
    if (type) ALL_BLOCK_TYPES.add(type);
  });
}

function filterToolbox(search: string): string {
  if (!search.trim()) return TOOLBOX_XML;

  const lower = search.toLowerCase();
  const doc = xmlParser.parseFromString(TOOLBOX_XML, 'text/xml');
  const root = doc.documentElement;

  const categories = root.querySelectorAll('category');

  categories.forEach(cat => {
    const catName = cat.getAttribute('name')?.toLowerCase() || '';

    const blocks = cat.querySelectorAll('block');
    let hasMatch = false;

    blocks.forEach(block => {
      const type = block.getAttribute('type')?.toLowerCase() || '';
      const matches = type.includes(lower) || catName.includes(lower);

      if (matches) {
        hasMatch = true;
      } else {
        block.remove();
      }
    });

    if (!hasMatch && !catName.includes(lower)) {
      cat.remove();
    }
  });

  // Also check the Pipeline category and top-level blocks
  const topLevelBlocks = root.querySelectorAll(':scope > block');
  topLevelBlocks.forEach(block => {
    const type = block.getAttribute('type')?.toLowerCase() || '';
    if (!type.includes(lower)) {
      block.remove();
    }
  });

  const serialized = new XMLSerializer().serializeToString(doc);
  return serialized;
}

type SearchableToolboxProps = {
  children: React.ReactNode;
  onWorkspaceReady?: (ws: Blockly.WorkspaceSvg) => void;
  workspaceRef: React.MutableRefObject<Blockly.WorkspaceSvg | null>;
};

export function SearchableToolbox({ children, workspaceRef }: SearchableToolboxProps) {
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    buildBlockTypeIndex();
  }, []);

  const debouncedFilter = useCallback((value: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const ws = workspaceRef.current;
      if (!ws) return;
      try {
        const filtered = filterToolbox(value);
        ws.updateToolbox(filtered);
      } catch (err) {
        console.error('Toolbox filter failed:', err);
      }
    }, 150);
  }, [workspaceRef]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    setIsSearching(value.length > 0);
    debouncedFilter(value);
  }, [debouncedFilter]);

  const handleClear = useCallback(() => {
    setSearch('');
    setIsSearching(false);
    inputRef.current?.blur();
    const ws = workspaceRef.current;
    if (ws) {
      try {
        ws.updateToolbox(TOOLBOX_XML);
      } catch {}
    }
  }, [workspaceRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && inputRef.current) {
        e.preventDefault();
        inputRef.current.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b shrink-0"
        style={{ background: '#151717', borderColor: '#2a2a2a' }}
      >
        <svg className="w-3 h-3 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={handleChange}
          placeholder="Search blocks... (Ctrl+F)"
          className="flex-1 bg-transparent text-[11px] text-zinc-300 placeholder-zinc-600 outline-none border-none font-mono"
          style={{ background: 'transparent' }}
        />
        {isSearching && (
          <button
            onClick={handleClear}
            className="text-zinc-600 hover:text-zinc-400 text-[11px] leading-none"
          >
            &times;
          </button>
        )}
        {isSearching && (
          <span className="text-[9px] text-zinc-600 font-mono">filtering...</span>
        )}
      </div>
      {/* Workspace */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
