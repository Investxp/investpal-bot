'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import * as Blockly from 'blockly';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import type { UseAuthReturn } from '@/hooks/use-auth';
import { BlocklyWorkspace, type BlocklyWorkspaceHandle } from './blockly-workspace';
import { TradingEngine, type TradeResult, type StrategySettings, DEFAULT_SETTINGS } from './trading-engine';
import { TickChart } from './tick-chart';
import { TelegramSettings } from './telegram-settings';
import { useSmartChartsApi } from '@/hooks/use-smartcharts-api';

function formatTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmt(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}

type RightTab = 'summary' | 'journal' | 'transactions';

interface StrategyTab {
  id: string;
  name: string;
  xml: string;
  settings: StrategySettings;
}

const TG_TOKEN_KEY = 'investpal_telegram_token';
const TG_CHAT_KEY = 'investpal_telegram_chatid';

const PRESETS: Record<string, string> = {
  'Martingale': `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_definition" id="root" deletable="false" x="20" y="20">
    <value name="MARKET">
      <block type="trade_definition_market">
        <field name="MARKET">volatility</field>
        <field name="SYMBOL">R_100</field>
      </block>
    </value>
    <value name="CONTRACT">
      <block type="trade_definition_tradetype">
        <field name="CONTRACT_TYPE">RISE_FALL</field>
      </block>
    </value>
    <value name="TRADE_OPTIONS">
      <block type="trade_definition_tradeoptions">
        <field name="PREDICTION">RISE</field>
        <field name="CURRENCY">USD</field>
        <value name="STAKE_AMOUNT">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
        <value name="DURATION_AMOUNT">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
      </block>
    </value>
    <statement name="INIT">
      <block type="variables_set" id="init_stake">
        <field name="VAR" id="base_stake">base_stake</field>
        <value name="VALUE">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
        <next>
          <block type="variables_set" id="init_current">
            <field name="VAR" id="current_stake">current_stake</field>
            <value name="VALUE">
              <block type="variables_get" id="get_stake">
                <field name="VAR" id="base_stake">base_stake</field>
              </block>
            </value>
          </block>
        </next>
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="bp" deletable="false" x="20" y="180">
    <statement name="PURCHASE">
      <block type="purchase" id="purch">
        <value name="CONTRACT">
          <block type="trade_definition_tradetype">
            <field name="CONTRACT_TYPE">RISE_FALL</field>
          </block>
        </value>
        <value name="SYMBOL">
          <block type="trade_definition_market">
            <field name="MARKET">volatility</field>
            <field name="SYMBOL">R_100</field>
          </block>
        </value>
        <value name="OPTIONS">
          <block type="trade_definition_tradeoptions">
            <field name="PREDICTION">RISE</field>
            <field name="CURRENCY">USD</field>
            <value name="STAKE_AMOUNT">
              <block type="variables_get">
                <field name="VAR" id="current_stake">current_stake</field>
              </block>
            </value>
            <value name="DURATION_AMOUNT">
              <shadow type="math_number"><field name="NUM">1</field></shadow>
            </value>
          </block>
        </value>
      </block>
    </statement>
  </block>
  <block type="during_purchase" id="dp" deletable="false" x="20" y="280"></block>
  <block type="after_purchase" id="ap" deletable="false" x="20" y="340">
    <statement name="RESTART">
      <block type="controls_if" id="if_loss">
        <mutation elseif="0" else="1"></mutation>
        <value name="IF0">
          <block type="contract_check_result">
            <field name="RESULT">lost</field>
          </block>
        </value>
        <statement name="DO0">
          <block type="variables_set" id="double_stake">
            <field name="VAR" id="current_stake">current_stake</field>
            <value name="VALUE">
              <block type="math_arithmetic">
                <field name="OP">MULTIPLY</field>
                <value name="A">
                  <shadow type="math_number"><field name="NUM">2</field></shadow>
                </value>
                <value name="B">
                  <block type="variables_get">
                    <field name="VAR" id="current_stake">current_stake</field>
                  </block>
                </value>
              </block>
            </value>
          </block>
        </statement>
        <statement name="ELSE">
          <block type="variables_set" id="reset_stake">
            <field name="VAR" id="current_stake">current_stake</field>
            <value name="VALUE">
              <block type="variables_get">
                <field name="VAR" id="base_stake">base_stake</field>
              </block>
            </value>
          </block>
        </statement>
      </block>
    </statement>
  </block>
</xml>`,

  "D'Alembert": `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_definition" id="root" deletable="false" x="20" y="20">
    <value name="MARKET">
      <block type="trade_definition_market">
        <field name="MARKET">volatility</field>
        <field name="SYMBOL">R_100</field>
      </block>
    </value>
    <value name="CONTRACT">
      <block type="trade_definition_tradetype">
        <field name="CONTRACT_TYPE">RISE_FALL</field>
      </block>
    </value>
    <value name="TRADE_OPTIONS">
      <block type="trade_definition_tradeoptions">
        <field name="PREDICTION">RISE</field>
        <field name="CURRENCY">USD</field>
        <value name="STAKE_AMOUNT">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
        <value name="DURATION_AMOUNT">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
      </block>
    </value>
    <statement name="INIT">
      <block type="variables_set" id="init_unit">
        <field name="VAR" id="unit">unit</field>
        <value name="VALUE">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
        <next>
          <block type="variables_set" id="init_current">
            <field name="VAR" id="current_stake">current_stake</field>
            <value name="VALUE">
              <shadow type="math_number"><field name="NUM">1</field></shadow>
            </value>
          </block>
        </next>
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="bp" deletable="false" x="20" y="180">
    <statement name="PURCHASE">
      <block type="purchase" id="purch">
        <value name="CONTRACT">
          <block type="trade_definition_tradetype">
            <field name="CONTRACT_TYPE">RISE_FALL</field>
          </block>
        </value>
        <value name="SYMBOL">
          <block type="trade_definition_market">
            <field name="MARKET">volatility</field>
            <field name="SYMBOL">R_100</field>
          </block>
        </value>
        <value name="OPTIONS">
          <block type="trade_definition_tradeoptions">
            <field name="PREDICTION">RISE</field>
            <field name="CURRENCY">USD</field>
            <value name="STAKE_AMOUNT">
              <block type="variables_get">
                <field name="VAR" id="current_stake">current_stake</field>
              </block>
            </value>
            <value name="DURATION_AMOUNT">
              <shadow type="math_number"><field name="NUM">1</field></shadow>
            </value>
          </block>
        </value>
      </block>
    </statement>
  </block>
  <block type="during_purchase" id="dp" deletable="false" x="20" y="280"></block>
  <block type="after_purchase" id="ap" deletable="false" x="20" y="340">
    <statement name="RESTART">
      <block type="controls_if" id="if_loss">
        <mutation elseif="0" else="1"></mutation>
        <value name="IF0">
          <block type="contract_check_result">
            <field name="RESULT">lost</field>
          </block>
        </value>
        <statement name="DO0">
          <block type="variables_set" id="inc_stake">
            <field name="VAR" id="current_stake">current_stake</field>
            <value name="VALUE">
              <block type="math_arithmetic">
                <field name="OP">ADD</field>
                <value name="A">
                  <shadow type="math_number"><field name="NUM">0</field></shadow>
                </value>
                <value name="B">
                  <block type="variables_get">
                    <field name="VAR" id="unit">unit</field>
                  </block>
                </value>
              </block>
            </value>
          </block>
        </statement>
        <statement name="ELSE">
          <block type="controls_if" id="if_win">
            <value name="IF0">
              <block type="logic_compare">
                <field name="OP">GT</field>
                <value name="A">
                  <block type="variables_get">
                    <field name="VAR" id="current_stake">current_stake</field>
                  </block>
                </value>
                <value name="B">
                  <block type="variables_get">
                    <field name="VAR" id="unit">unit</field>
                  </block>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="variables_set" id="dec_stake">
                <field name="VAR" id="current_stake">current_stake</field>
                <value name="VALUE">
                  <block type="math_arithmetic">
                    <field name="OP">MINUS</field>
                    <value name="A">
                      <block type="variables_get">
                        <field name="VAR" id="current_stake">current_stake</field>
                      </block>
                    </value>
                    <value name="B">
                      <block type="variables_get">
                        <field name="VAR" id="unit">unit</field>
                      </block>
                    </value>
                  </block>
                </value>
              </block>
            </statement>
          </block>
        </statement>
      </block>
    </statement>
  </block>
</xml>`,

  "Oscar's Grind": `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_definition" id="root" deletable="false" x="20" y="20">
    <value name="MARKET">
      <block type="trade_definition_market">
        <field name="MARKET">volatility</field>
        <field name="SYMBOL">R_100</field>
      </block>
    </value>
    <value name="CONTRACT">
      <block type="trade_definition_tradetype">
        <field name="CONTRACT_TYPE">RISE_FALL</field>
      </block>
    </value>
    <value name="TRADE_OPTIONS">
      <block type="trade_definition_tradeoptions">
        <field name="PREDICTION">RISE</field>
        <field name="CURRENCY">USD</field>
        <value name="STAKE_AMOUNT">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
        <value name="DURATION_AMOUNT">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
      </block>
    </value>
    <statement name="INIT">
      <block type="variables_set" id="init_unit">
        <field name="VAR" id="unit">unit</field>
        <value name="VALUE">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
        <next>
          <block type="variables_set" id="init_current">
            <field name="VAR" id="current_stake">current_stake</field>
            <value name="VALUE">
              <shadow type="math_number"><field name="NUM">1</field></shadow>
            </value>
          </block>
        </next>
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="bp" deletable="false" x="20" y="180">
    <statement name="PURCHASE">
      <block type="purchase" id="purch">
        <value name="CONTRACT">
          <block type="trade_definition_tradetype">
            <field name="CONTRACT_TYPE">RISE_FALL</field>
          </block>
        </value>
        <value name="SYMBOL">
          <block type="trade_definition_market">
            <field name="MARKET">volatility</field>
            <field name="SYMBOL">R_100</field>
          </block>
        </value>
        <value name="OPTIONS">
          <block type="trade_definition_tradeoptions">
            <field name="PREDICTION">RISE</field>
            <field name="CURRENCY">USD</field>
            <value name="STAKE_AMOUNT">
              <block type="variables_get">
                <field name="VAR" id="current_stake">current_stake</field>
              </block>
            </value>
            <value name="DURATION_AMOUNT">
              <shadow type="math_number"><field name="NUM">1</field></shadow>
            </value>
          </block>
        </value>
      </block>
    </statement>
  </block>
  <block type="during_purchase" id="dp" deletable="false" x="20" y="280"></block>
  <block type="after_purchase" id="ap" deletable="false" x="20" y="340">
    <statement name="RESTART">
      <block type="variables_set" id="set_stake">
        <field name="VAR" id="current_stake">current_stake</field>
        <value name="VALUE">
          <block type="controls_if" id="if_win">
            <mutation elseif="0" else="1"></mutation>
            <value name="IF0">
              <block type="contract_check_result">
                <field name="RESULT">won</field>
              </block>
            </value>
            <value name="DO0">
              <block type="math_arithmetic" id="inc_stake">
                <field name="OP">ADD</field>
                <value name="A">
                  <block type="variables_get">
                    <field name="VAR" id="current_stake">current_stake</field>
                  </block>
                </value>
                <value name="B">
                  <block type="variables_get">
                    <field name="VAR" id="unit">unit</field>
                  </block>
                </value>
              </block>
            </value>
            <statement name="ELSE">
              <block type="variables_get">
                <field name="VAR" id="current_stake">current_stake</field>
              </block>
            </statement>
          </block>
        </value>
      </block>
    </statement>
  </block>
</xml>`,
};

export function BotBuilderView({ auth }: { auth: UseAuthReturn }) {
  const { ws } = useDerivWSContext();
  const workspaceRef = useRef<BlocklyWorkspaceHandle | null>(null);
  const engineRef = useRef<TradingEngine | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [trades, setTrades] = useState<TradeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [strategyName, setStrategyName] = useState('Untitled Strategy');
  const [savedStrategies, setSavedStrategies] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('summary');
  const [showChart, setShowChart] = useState(false);
  const [tickHistory, setTickHistory] = useState<number[]>([]);
  const [showTelegram, setShowTelegram] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Strategy tabs
  const [tabs, setTabs] = useState<StrategyTab[]>([{ id: 'default', name: 'Untitled Strategy', xml: '', settings: { ...DEFAULT_SETTINGS } }]);
  const [activeTabId, setActiveTabId] = useState('default');
  const [showTabMenu, setShowTabMenu] = useState<string | null>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

  const switchTab = useCallback((id: string) => {
    if (id === activeTabId) return;
    const handle = workspaceRef.current;
    if (handle) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, xml: handle.getXml(), settings: { ...t.settings, showChart } } : t));
    }
    setActiveTabId(id);
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      setStrategyName(tab.name);
      setShowChart(tab.settings.showChart);
    }
  }, [activeTabId, tabs, showChart]);

  const addTab = useCallback(() => {
    const id = `tab_${Date.now()}`;
    const handle = workspaceRef.current;
    if (handle) {
      setTabs(prev => [...prev.map(t => t.id === activeTabId ? { ...t, xml: handle.getXml() } : t), { id, name: `Strategy ${tabs.length + 1}`, xml: '', settings: { ...DEFAULT_SETTINGS } }]);
    } else {
      setTabs(prev => [...prev, { id, name: `Strategy ${tabs.length + 1}`, xml: '', settings: { ...DEFAULT_SETTINGS } }]);
    }
    setActiveTabId(id);
    setStrategyName(`Strategy ${tabs.length + 1}`);
    setShowChart(false);
  }, [activeTabId, tabs.length]);

  const renameTab = useCallback((id: string, name: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name } : t));
    if (id === activeTabId) setStrategyName(name);
  }, [activeTabId]);

  const removeTab = useCallback((id: string) => {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    setTabs(prev => prev.filter(t => t.id !== id));
    if (activeTabId === id) {
      const newId = tabs[idx === 0 ? 1 : idx - 1].id;
      setActiveTabId(newId);
      const tab = tabs.find(t => t.id === newId);
      if (tab) setStrategyName(tab.name);
    }
  }, [tabs, activeTabId]);

  // Load tab XML when switching
  useEffect(() => {
    if (activeTab?.xml) {
      const handle = workspaceRef.current;
      if (handle) {
        handle.loadXml(activeTab.xml);
      }
    }
  }, [activeTab?.id]);

  // Sync showChart to active tab settings
  useEffect(() => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, showChart } } : t));
  }, [showChart, activeTabId]);

  const { getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartsApi(ws);

  useEffect(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('investpal_bot_'));
    setSavedStrategies(keys.map(k => k.replace('investpal_bot_', '')));
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [`[${formatTime()}] ${msg}`, ...prev].slice(0, 500));
  }, []);

  const getSymbolFromWorkspace = useCallback((): string => {
    const wsInst = workspaceRef.current?.getWorkspace();
    if (!wsInst) return 'R_100';
    const blocks = wsInst.getBlocksByType('trade_definition_market', false);
    if (blocks.length > 0) {
      return blocks[0].getFieldValue('SYMBOL') || 'R_100';
    }
    return 'R_100';
  }, []);

  const unsubRef = useRef<(() => void) | null>(null);

  const cleanupEngine = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
  }, []);

  const applyPreset = useCallback((name: string) => {
    const handle = workspaceRef.current;
    if (!handle) return;
    const xml = PRESETS[name];
    if (!xml) return;
    handle.loadXml(xml);
    setStrategyName(name);
    addLog(`Quick strategy loaded: ${name}`);
  }, [addLog]);

  const runBot = useCallback(async () => {
    const handle = workspaceRef.current;
    if (!handle) return;
    if (!ws) {
      setError('WebSocket not connected');
      return;
    }
    setError(null);
    addLog('=== Starting bot ===');
    const curSettings = activeTab?.settings || DEFAULT_SETTINGS;
    // Apply per-strategy settings to workspace blocks
    const wsInst = workspaceRef.current?.getWorkspace();
    if (wsInst) {
      const marketBlocks = wsInst.getBlocksByType('trade_definition_market', false);
      if (marketBlocks.length > 0) marketBlocks[0].setFieldValue(curSettings.symbol, 'SYMBOL');
      const typeBlocks = wsInst.getBlocksByType('trade_definition_tradetype', false);
      if (typeBlocks.length > 0) typeBlocks[0].setFieldValue(curSettings.contractType, 'CONTRACT_TYPE');
      const optBlocks = wsInst.getBlocksByType('trade_definition_tradeoptions', false);
      if (optBlocks.length > 0) {
        optBlocks[0].setFieldValue(curSettings.prediction, 'PREDICTION');
        optBlocks[0].setFieldValue(curSettings.durationUnit, 'DURATION_UNIT');
        const stakeTarget = optBlocks[0].getInput('STAKE_AMOUNT')?.connection?.targetBlock();
        if (stakeTarget?.type === 'math_number') stakeTarget.setFieldValue(String(curSettings.stakeAmount), 'NUM');
        const durTarget = optBlocks[0].getInput('DURATION_AMOUNT')?.connection?.targetBlock();
        if (durTarget?.type === 'math_number') durTarget.setFieldValue(String(curSettings.durationAmount), 'NUM');
      }
    }
    const engine = new TradingEngine({
      sendMessage: async (msg) => ws.send(msg),
      onLog: addLog,
      onTradeUpdate: (result) => {
        setTrades(prev => [result, ...prev]);
      },
      onError: (err) => {
        addLog(`ERROR: ${err}`);
        setError(err);
      },
      onStatusChange: setIsRunning,
      settings: curSettings,
    });
    const unsub = ws.onMessage((data: any) => {
      if (data.msg_type === 'tick' && data.tick) {
        engine.handleTick(data.tick);
        const val = data.tick.quote ?? data.tick.tick ?? 0;
        setTickHistory(prev => [...prev.slice(-499), val]);
      }
      if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
        engine.handleContractUpdate(data.proposal_open_contract);
      }
    });
    unsubRef.current = unsub;
    const bal = auth.activeAccount ? parseFloat(auth.activeAccount.balance) : 0;
    const loginId = auth.activeAccount?.account_id || '';
    engine.setAccountInfo(bal, loginId);
    engineRef.current = engine;
    try {
      const symbol = getSymbolFromWorkspace();
      addLog(`Using symbol: ${symbol}`);
      await engine.start(handle.getWorkspace(), symbol);
    } catch (err: any) {
      addLog(`FATAL: ${err.message}`);
      setError(err.message);
      setIsRunning(false);
    }
  }, [ws, addLog, auth, getSymbolFromWorkspace, cleanupEngine]);

  const stopBot = useCallback(() => {
    cleanupEngine();
    addLog('=== Bot stopped ===');
  }, [addLog, cleanupEngine]);

  const saveStrategy = useCallback(() => {
    const handle = workspaceRef.current;
    if (!handle) return;
    const xml = handle.getXml();
    localStorage.setItem(`investpal_bot_${strategyName}`, xml);
    const keys = Object.keys(localStorage).filter(k => k.startsWith('investpal_bot_'));
    setSavedStrategies(keys.map(k => k.replace('investpal_bot_', '')));
    addLog(`Strategy "${strategyName}" saved`);
  }, [strategyName, addLog]);

  const loadStrategy = useCallback((name: string) => {
    const handle = workspaceRef.current;
    if (!handle) return;
    const xml = localStorage.getItem(`investpal_bot_${name}`);
    if (!xml) return;
    handle.loadXml(xml);
    setStrategyName(name);
    setShowSaved(false);
    addLog(`Strategy "${name}" loaded`);
  }, [addLog]);

  const deleteStrategy = useCallback((name: string) => {
    localStorage.removeItem(`investpal_bot_${name}`);
    const keys = Object.keys(localStorage).filter(k => k.startsWith('investpal_bot_'));
    setSavedStrategies(keys.map(k => k.replace('investpal_bot_', '')));
    addLog(`Strategy "${name}" deleted`);
  }, [addLog]);

  const exportStrategy = useCallback(() => {
    const handle = workspaceRef.current;
    if (!handle) return;
    const xml = handle.getXml();
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${strategyName.replace(/\s+/g, '_')}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`Strategy exported as ${a.download}`);
  }, [strategyName, addLog]);

  const importStrategy = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const handle = workspaceRef.current;
      if (!handle) return;
      handle.loadXml(text);
      const name = file.name.replace(/\.xml$/i, '');
      setStrategyName(name);
      addLog(`Strategy imported from ${file.name}`);
    };
    input.click();
  }, [addLog]);

  const undoAction = useCallback(() => {
    workspaceRef.current?.getWorkspace()?.undo(false);
  }, []);

  const redoAction = useCallback(() => {
    workspaceRef.current?.getWorkspace()?.undo(true);
  }, []);

  const zoomIn = useCallback(() => {
    const wsInst = workspaceRef.current?.getWorkspace();
    if (wsInst) wsInst.zoomCenter((wsInst as any).scale + 0.2);
  }, []);

  const zoomOut = useCallback(() => {
    const wsInst = workspaceRef.current?.getWorkspace();
    if (wsInst) wsInst.zoomCenter((wsInst as any).scale - 0.2);
  }, []);

  const zoomToFit = useCallback(() => {
    workspaceRef.current?.getWorkspace()?.zoomToFit();
  }, []);

  const resetWorkspace = useCallback(() => {
    const handle = workspaceRef.current;
    if (!handle) return;
    const wsInst = handle.getWorkspace();
    wsInst?.clear();
    handle.loadXml(handle.getDefaultXml());
    addLog('Workspace reset');
  }, [addLog]);

  const wins = trades.filter(t => t.status === 'won').length;
  const losses = trades.filter(t => t.status === 'lost').length;
  const totalPnl = trades.reduce((sum, t) => sum + t.profit, 0);
  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0.0';

  return (
    <div className="flex flex-col h-full" style={{ background: '#151717' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 gap-2"
        style={{ background: '#1c1c1c', borderColor: '#2a2a2a' }}>
        {/* Left: Brand + Toolbar */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ff444f' }}>
            ⚡ InvestPal Bot
          </span>
          {/* Undo / Redo */}
          <button onClick={undoAction} className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white transition-all" style={{ background: '#2a2a2a' }} title="Undo">↩</button>
          <button onClick={redoAction} className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white transition-all" style={{ background: '#2a2a2a' }} title="Redo">↪</button>
          <div className="w-px h-4 bg-zinc-700"/>
          {/* Zoom */}
          <button onClick={zoomIn} className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white transition-all" style={{ background: '#2a2a2a' }} title="Zoom in">🔍+</button>
          <button onClick={zoomOut} className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white transition-all" style={{ background: '#2a2a2a' }} title="Zoom out">🔍−</button>
          <button onClick={zoomToFit} className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white transition-all" style={{ background: '#2a2a2a' }} title="Fit to screen">⊞</button>
          <button onClick={resetWorkspace} className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-red-400 transition-all" style={{ background: '#2a2a2a' }} title="Reset workspace">⟳</button>
          <div className="w-px h-4 bg-zinc-700"/>
          {/* Quick Strategy presets */}
          <div className="relative group">
            <button className="px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-white transition-all" style={{ background: '#2a2a2a' }}>
              📋 Quick Strategy ▾
            </button>
            <div className="absolute top-full left-0 mt-1 w-40 rounded border z-20 hidden group-hover:block"
              style={{ background: '#151717', borderColor: '#2a2a2a' }}>
              {Object.keys(PRESETS).map(name => (
                <button key={name}
                  className="block w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                  onMouseDown={() => applyPreset(name)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Strategy controls + Run/Stop */}
        <div className="flex items-center gap-2">
          {auth.activeAccount && (
            <span className="text-xs text-zinc-400 font-mono mr-1">
              {auth.activeAccount.account_id.startsWith('VR') ? 'Demo' : 'Real'} · 
              {parseFloat(auth.activeAccount.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} {auth.activeAccount.currency}
            </span>
          )}
          <div className="relative">
            <input
              className="w-32 px-2 py-1 rounded text-xs font-mono text-zinc-300 border"
              style={{ background: '#151717', borderColor: '#2a2a2a' }}
              value={strategyName}
              onChange={e => setStrategyName(e.target.value)}
              onFocus={() => setShowSaved(true)}
              onBlur={() => setTimeout(() => setShowSaved(false), 200)}
            />
            {showSaved && savedStrategies.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-48 rounded border z-10 max-h-48 overflow-y-auto"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}>
                {savedStrategies.map(name => (
                  <div key={name}
                    className="flex items-center justify-between px-2 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                    style={{ borderBottom: '1px solid #2a2a2a' }}
                    onMouseDown={() => loadStrategy(name)}>
                    <span className="truncate">{name}</span>
                    <button
                      className="text-zinc-600 hover:text-red-400 text-[10px] ml-2"
                      onMouseDown={e => { e.stopPropagation(); deleteStrategy(name); }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-white transition-all"
            style={{ background: '#2a2a2a' }} onClick={saveStrategy} title="Save">
            💾 Save
          </button>
          <button className="px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-white transition-all"
            style={{ background: '#2a2a2a' }} onClick={importStrategy} title="Import XML">
            📂 Import
          </button>
          <button className="px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-white transition-all"
            style={{ background: '#2a2a2a' }} onClick={exportStrategy} title="Export XML">
            📤 Export
          </button>
          {!isRunning ? (
            <button className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all"
              style={{ background: '#22c55e', color: '#fff' }} onClick={runBot}>
              ▶ Run
            </button>
          ) : (
            <button className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all"
              style={{ background: '#ef4444', color: '#fff' }} onClick={stopBot}>
              ⏹ Stop
            </button>
          )}
          <button className="px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-white transition-all"
            style={{ background: '#2a2a2a' }} onClick={() => setShowChart(!showChart)} title="Toggle chart">
            📊 Chart
          </button>
          <button className="px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-white transition-all"
            style={{ background: '#2a2a2a' }} onClick={() => setShowTelegram(true)} title="Telegram settings">
            ✉️ Telegram
          </button>
          <button className="px-2 py-1.5 rounded text-[10px] font-bold text-zinc-400 transition-all"
            style={{ background: '#2a2a2a' }} onClick={() => { setLogs([]); setTrades([]); setError(null); }}>
            Clear
          </button>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center px-2 border-b shrink-0 overflow-x-auto"
        style={{ background: '#151717', borderColor: '#2a2a2a' }}>
        {tabs.map(tab => (
          <div key={tab.id} className="relative group/tab" onMouseLeave={() => setShowTabMenu(null)}>
            <button
              className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-mono transition-all whitespace-nowrap ${tab.id === activeTabId ? 'text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'}`}
              style={{
                borderBottom: tab.id === activeTabId ? '2px solid #ff444f' : '2px solid transparent',
              }}
              onClick={() => switchTab(tab.id)}>
              {tab.name}
              <span className="text-zinc-700 hover:text-zinc-400 text-[10px] ml-0.5 cursor-pointer"
                onClick={e => { e.stopPropagation(); setShowSettingsPanel(tab.id === activeTabId ? !showSettingsPanel : true); }}>
                ⚙
              </span>
              {tabs.length > 1 && (
                <span className="text-zinc-700 hover:text-red-400 text-[10px] ml-0.5"
                  onClick={e => { e.stopPropagation(); removeTab(tab.id); }}>✕</span>
              )}
            </button>
          </div>
        ))}
        <button onClick={addTab}
          className="px-2 py-1.5 text-zinc-600 hover:text-zinc-400 text-[14px] transition-all"
          title="New tab">+</button>
      </div>

      {/* Per-strategy settings panel */}
      {showSettingsPanel && activeTab && (
        <div className="border-b px-4 py-2 shrink-0" style={{ background: '#1c1c1c', borderColor: '#2a2a2a' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Strategy Settings: {activeTab.name}</span>
            <button className="text-zinc-600 hover:text-zinc-400 text-xs" onClick={() => setShowSettingsPanel(false)}>✕</button>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            <label className="flex items-center gap-1.5 text-zinc-400">
              Stake:
              <input type="number" step="0.5" min="0.5"
                className="w-16 px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200 border"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}
                value={activeTab.settings.stakeAmount}
                onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, stakeAmount: parseFloat(e.target.value) || 1 } } : t))} />
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400">
              Symbol:
              <select className="px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200 border"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}
                value={activeTab.settings.symbol}
                onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, symbol: e.target.value } } : t))}>
                <option value="R_10">Volatility 10</option>
                <option value="R_25">Volatility 25</option>
                <option value="R_50">Volatility 50</option>
                <option value="R_75">Volatility 75</option>
                <option value="R_100">Volatility 100</option>
                <option value="1HZ10V">10s Index</option>
                <option value="1HZ50V">50s Index</option>
                <option value="EURUSD">EUR/USD</option>
                <option value="GBPUSD">GBP/USD</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400">
              Contract:
              <select className="px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200 border"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}
                value={activeTab.settings.contractType}
                onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, contractType: e.target.value } } : t))}>
                <option value="RISE_FALL">Rise/Fall</option>
                <option value="HIGHER_LOWER">Higher/Lower</option>
                <option value="TOUCH">Touch/No Touch</option>
                <option value="MATCH_DIFF">Match/Diff</option>
                <option value="ASIAN">Asian</option>
                <option value="DIGIT_MATCH">Digit Match</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400">
              Prediction:
              <select className="px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200 border"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}
                value={activeTab.settings.prediction}
                onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, prediction: e.target.value } } : t))}>
                <option value="RISE">Rise</option>
                <option value="FALL">Fall</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400">
              Duration:
              <input type="number" min="1" max="100"
                className="w-12 px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200 border"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}
                value={activeTab.settings.durationAmount}
                onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, durationAmount: parseInt(e.target.value) || 1 } } : t))} />
              <select className="px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200 border"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}
                value={activeTab.settings.durationUnit}
                onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, durationUnit: e.target.value } } : t))}>
                <option value="t">Ticks</option>
                <option value="s">Seconds</option>
                <option value="m">Minutes</option>
                <option value="h">Hours</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400">
              Telegram Token:
              <input type="password" placeholder="bot token"
                className="w-24 px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200 border"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}
                value={activeTab.settings.telegramToken}
                onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, telegramToken: e.target.value } } : t))} />
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400">
              Chat ID:
              <input type="text" placeholder="chat id"
                className="w-20 px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200 border"
                style={{ background: '#151717', borderColor: '#2a2a2a' }}
                value={activeTab.settings.telegramChatId}
                onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, settings: { ...t.settings, telegramChatId: e.target.value } } : t))} />
            </label>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
        {/* Blockly workspace */}
        <div className="flex-1 relative">
          <BlocklyWorkspace
            ref={workspaceRef}
            onWorkspaceChange={setGeneratedCode}
          />
          {/* Error banner */}
          {error && (
            <div className="absolute top-0 left-0 right-0 z-30 px-4 py-2 text-xs font-mono"
              style={{ background: 'rgba(239,68,68,0.9)', color: '#fff' }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Right panel with tabs */}
        <div className="w-80 shrink-0 flex flex-col border-l overflow-hidden"
          style={{ borderColor: '#2a2a2a', background: '#1c1c1c' }}>

          {/* Tabs */}
          <div className="flex border-b shrink-0" style={{ borderColor: '#2a2a2a' }}>
            {([
              { key: 'summary' as RightTab, label: 'Summary' },
              { key: 'journal' as RightTab, label: 'Journal' },
              { key: 'transactions' as RightTab, label: 'Transactions' },
            ]).map(tab => (
              <button key={tab.key}
                className="flex-1 text-[10px] font-bold uppercase tracking-wider py-2 transition-all"
                style={{
                  background: rightTab === tab.key ? '#151717' : 'transparent',
                  color: rightTab === tab.key ? '#fff' : '#555',
                  borderBottom: rightTab === tab.key ? '2px solid #ff444f' : '2px solid transparent',
                }}
                onClick={() => setRightTab(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {rightTab === 'summary' && (
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg p-3" style={{ background: '#151717' }}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Balance</p>
                    <p className="text-lg font-bold text-zinc-100 mt-1">
                      {auth.activeAccount ? parseFloat(auth.activeAccount.balance).toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#151717' }}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">P&amp;L</p>
                    <p className="text-lg font-bold mt-1" style={{ color: totalPnl >= 0 ? '#22c55e' : '#ef4444' }}>
                      {fmt(totalPnl)}
                    </p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#151717' }}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Win Rate</p>
                    <p className="text-lg font-bold text-zinc-100 mt-1">{winRate}%</p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#151717' }}>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Trades</p>
                    <p className="text-lg font-bold text-zinc-100 mt-1">{trades.length}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-xs" style={{ color: '#555' }}>
                  <span style={{ color: '#22c55e' }}>Won: {wins}</span>
                  <span style={{ color: '#ef4444' }}>Lost: {losses}</span>
                </div>
                {error && (
                  <div className="rounded-lg p-2 text-[10px] font-mono" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                    Last error: {error}
                  </div>
                )}
                {trades.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-8">Run a strategy to see results</p>
                )}
              </div>
            )}

            {rightTab === 'journal' && (
              <div className="p-2 space-y-0.5">
                {logs.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-4">No log entries</p>
                )}
                {logs.map((msg, i) => (
                  <p key={i} className="text-[10px] font-mono leading-relaxed" style={{
                    color: msg.includes('ERROR') ? '#ef4444' : msg.includes('WON') ? '#22c55e' : msg.includes('LOST') ? '#ef4444' : msg.includes('Contract bought') || msg.includes('Requesting') ? '#3b82f6' : msg.includes('Subscribed') ? '#8b5cf6' : msg.includes('Sold') ? '#f59e0b' : '#9ca3af',
                  }}>
                    {msg}
                  </p>
                ))}
              </div>
            )}

            {rightTab === 'transactions' && (
              <div className="p-2 space-y-1">
                {trades.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-4">No transactions yet</p>
                )}
                {trades.map((t, i) => (
                  <div key={i} className="rounded px-2 py-1.5 text-[11px] font-mono flex justify-between items-center"
                    style={{
                      background: t.status === 'won' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    }}>
                    <div className="flex flex-col">
                      <span className="text-[10px]" style={{ color: t.status === 'won' ? '#22c55e' : '#ef4444' }}>
                        #{t.contract_id} · {t.status.toUpperCase()}
                      </span>
                      <span className="text-[9px] text-zinc-500">{t.contract_type} · {t.symbol}</span>
                      <span className="text-[9px] text-zinc-600">Entry: {t.entry_tick} · Exit: {t.exit_tick ?? '-'}</span>
                    </div>
                    <span className="font-bold text-xs" style={{ color: t.profit >= 0 ? '#22c55e' : '#ef4444' }}>
                      {fmt(t.profit)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Code preview at bottom */}
          <div className="shrink-0 border-t overflow-hidden" style={{ borderColor: '#2a2a2a', maxHeight: '100px' }}>
            <div className="text-[9px] font-bold uppercase tracking-wider px-3 py-1 text-zinc-500" style={{ background: '#151717' }}>
              Generated Code
            </div>
            <div className="overflow-auto p-2" style={{ maxHeight: '72px' }}>
              <pre className="text-[9px] font-mono text-zinc-600 leading-tight whitespace-pre-wrap">
                {generatedCode || <span className="text-zinc-800">Blocks will generate code here</span>}
              </pre>
            </div>
          </div>
        </div>
      </div>

        {/* Chart panel */}
        {showChart && (
          <div className="shrink-0 border-t overflow-hidden" style={{ borderColor: '#2a2a2a', height: '200px' }}>
            <div className="flex items-center justify-between px-3 py-1 border-b" style={{ background: '#151717', borderColor: '#2a2a2a' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tick Chart</span>
              <button className="text-zinc-600 hover:text-zinc-400 text-xs" onClick={() => setShowChart(false)}>✕</button>
            </div>
            <div className="w-full h-full" style={{ background: '#0d0f0f' }}>
              <TickChart ticks={tickHistory} height={160} />
            </div>
          </div>
        )}
      </div>
      {showTelegram && (
        <TelegramSettings
          open={true}
          onClose={() => setShowTelegram(false)}
        />
      )}
    </div>
  );
}
