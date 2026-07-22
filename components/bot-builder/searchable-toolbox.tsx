'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type * as Blockly from 'blockly';

type Props = {
  workspace: Blockly.WorkspaceSvg | null;
  toolboxConfig: any;
  children: React.ReactNode;
};

export function SearchableToolbox({ workspace, toolboxConfig, children }: Props) {
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workspace) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && workspace) {
        const el = workspace.getDiv();
        if (el && el.contains(e.target as Node)) {
          e.preventDefault();
          setShowSearch(s => !s);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [workspace]);

  useEffect(() => {
    if (showSearch && inputRef.current) inputRef.current.focus();
  }, [showSearch]);

  const filteredToolbox = useCallback(() => {
    if (!search.trim() || !toolboxConfig) return toolboxConfig;
    const q = search.toLowerCase().trim();

    const deepFilter = (contents: any[]): any[] => {
      return contents.reduce((acc: any[], item: any) => {
        if (item.type === 'category') {
          const cats = Array.isArray(item.contents) ? deepFilter(item.contents) : item.contents;
          const nameMatch = (item.name || '').toLowerCase().includes(q);
          if (nameMatch || (Array.isArray(cats) && cats.length > 0)) {
            acc.push({ ...item, contents: nameMatch ? item.contents : cats, expanded: 'true' });
          }
        } else if (item.type === 'block') {
          if ((item.block_type || '').toLowerCase().includes(q)) {
            acc.push(item);
          }
        } else {
          acc.push(item);
        }
        return acc;
      }, []);
    };

    const filtered = JSON.parse(JSON.stringify(toolboxConfig));
    if (filtered.contents) filtered.contents = deepFilter(filtered.contents);
    return filtered;
  }, [search, toolboxConfig]);

  const filtered = filteredToolbox();

  const childrenWithToolbox = React.Children.map(children, child => {
    if (React.isValidElement(child) && child.props?.workspaceProps) {
      return React.cloneElement(child, { ...child.props, workspaceProps: { ...child.props.workspaceProps, toolbox: filtered } } as any);
    }
    return child;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showSearch && (
        <div style={{ padding: '6px 8px', background: '#1a1a2e', borderBottom: '1px solid #2a2a3e' }}>
          <input ref={inputRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search blocks..."
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #333',
              background: '#12121e', color: '#ddd', fontSize: 12, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
      {childrenWithToolbox}
    </div>
  );
}
