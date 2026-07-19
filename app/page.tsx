'use client';

import React, { useState, useEffect } from 'react';
import { useSmartChartsApi } from '@/hooks/use-smartcharts-api';
import { useSmartChartChartData } from '@/hooks/use-smartchart-chart-data';
import { useAccumulatorTrading } from '../hooks/use-accumulator-trading';
import { useRiseFallTrading } from '../hooks/use-rise-fall-trading';
import { useDigitsTrading } from '../hooks/use-digits-trading';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { useLogoSrc } from '@/components/custom/logo-src-provider';

// Views
import { AccumulatorView } from '../components/accumulator-view';
import { RiseFallView } from '../components/rise-fall-view';
import { DigitsView } from '../components/digits-view';
import { DashboardView } from '../components/custom/dashboard-view';
import { AutoTradeView } from '../components/custom/autotrade-view';
import { BotBuilderView } from '../components/bot-builder/bot-builder-view';
import { PolymarketView } from '../components/custom/polymarket-view';
import { PharmacyView } from '../components/custom/pharmacy-view';
import { BetsView } from '../components/custom/bets-view';

// UI icons and components
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/custom/theme-toggle';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Hash, 
  Zap, 
  Bot, 
  Activity, 
  ChevronDown, 
  User, 
  Wallet,
  LogOut,
  Menu,
  X,
  Youtube,
  Send,
  MessageCircle,
  Facebook,
  Music,
  Linkedin
} from 'lucide-react';
import type { UseAuthReturn } from '@/hooks/use-auth';

// -------------------------------------------------------------
// Tab Wrapper Components (Gated execution of WebSocket hooks)
// -------------------------------------------------------------

function AccumulatorsTab({ auth }: { auth: UseAuthReturn }) {
  const logoSrc = useLogoSrc();
  const { ws, isConnected, isExhausted } = useDerivWSContext();
  
  const trading = useAccumulatorTrading({ 
    ws, 
    isConnected, 
    isExhausted, 
    isAuthenticated: auth.authState === 'authenticated', 
    onAuthWSFailed: auth.logout 
  });

  const { chartData } = useSmartChartChartData(trading.ws, trading.isConnected, trading.symbols);
  const { getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartsApi(trading.ws);

  return (
    <AccumulatorView
      {...auth}
      onLogin={auth.login}
      onSignUp={auth.signUp}
      onLogout={auth.logout}
      onSwitchAccount={auth.switchAccount}
      logoSrc={logoSrc}
      ws={trading.ws}
      isConnected={trading.isConnected}
      isLoading={trading.isLoading}
      error={trading.error}
      activeSymbol={trading.activeSymbol}
      selectSymbol={trading.selectSymbol}
      growthRate={trading.growthRate}
      setGrowthRate={trading.setGrowthRate}
      growthRateOptions={trading.growthRateOptions}
      stake={trading.stake}
      setStake={trading.setStake}
      takeProfit={trading.takeProfit}
      setTakeProfit={trading.setTakeProfit}
      proposal={trading.proposal}
      buyContract={trading.buyContract}
      isBuying={trading.isBuying}
      buyResult={trading.buyResult}
      buyError={trading.buyError}
      clearBuyResult={trading.clearBuyResult}
      openPositions={trading.openPositions}
      sellContract={trading.sellContract}
      sellingId={trading.sellingId}
      chartData={chartData}
      getQuotes={getQuotes}
      subscribeQuotes={subscribeQuotes}
      unsubscribeQuotes={unsubscribeQuotes}
      hideHeaderFooter={true}
    />
  );
}

function RiseFallTab({ auth }: { auth: UseAuthReturn }) {
  const logoSrc = useLogoSrc();
  const { ws, isConnected, isExhausted } = useDerivWSContext();

  const trading = useRiseFallTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated: auth.authState === 'authenticated',
    onAuthWSFailed: auth.logout,
  });

  const { chartData } = useSmartChartChartData(trading.ws, trading.isConnected, trading.symbols);
  const { getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartsApi(trading.ws);

  return (
    <RiseFallView
      {...auth}
      onLogin={auth.login}
      onSignUp={auth.signUp}
      onLogout={auth.logout}
      onSwitchAccount={auth.switchAccount}
      logoSrc={logoSrc}
      ws={trading.ws}
      isConnected={trading.isConnected}
      isLoading={trading.isLoading}
      error={trading.error}
      activeSymbol={trading.activeSymbol}
      selectSymbol={trading.selectSymbol}
      direction={trading.direction}
      setDirection={trading.setDirection}
      allowEquals={trading.allowEquals}
      setAllowEquals={trading.setAllowEquals}
      stake={trading.stake}
      setStake={trading.setStake}
      duration={trading.duration}
      setDuration={trading.setDuration}
      durationOptions={trading.durationOptions}
      durationUnit={trading.durationUnit}
      setDurationUnit={trading.setDurationUnit}
      endDate={trading.endDate}
      setEndDate={trading.setEndDate}
      endTime={trading.endTime}
      setEndTime={trading.setEndTime}
      proposal={trading.proposal}
      buyContract={trading.buyContract}
      isBuying={trading.isBuying}
      buyResult={trading.buyResult}
      buyError={trading.buyError}
      clearBuyResult={trading.clearBuyResult}
      openPositions={trading.openPositions}
      sellContract={trading.sellContract}
      sellingId={trading.sellingId}
      chartData={chartData}
      getQuotes={getQuotes}
      subscribeQuotes={subscribeQuotes}
      unsubscribeQuotes={unsubscribeQuotes}
      hideHeaderFooter={true}
    />
  );
}

function DigitsTab({ auth }: { auth: UseAuthReturn }) {
  const logoSrc = useLogoSrc();
  const { ws, isConnected, isExhausted } = useDerivWSContext();

  const trading = useDigitsTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated: auth.authState === 'authenticated',
    onAuthWSFailed: auth.logout,
  });

  return (
    <DigitsView
      {...auth}
      onLogin={auth.login}
      onSignUp={auth.signUp}
      onLogout={auth.logout}
      onSwitchAccount={auth.switchAccount}
      logoSrc={logoSrc}
      ws={trading.ws}
      isConnected={trading.isConnected}
      isLoading={trading.isLoading}
      error={trading.error}
      symbols={trading.symbols}
      activeSymbol={trading.activeSymbol}
      selectSymbol={trading.selectSymbol}
      currentTick={trading.currentTick}
      lastDigit={trading.lastDigit}
      digitStats={trading.digitStats}
      pipSize={trading.pipSize}
      tradeType={trading.tradeType}
      setTradeType={trading.setTradeType}
      contractMode={trading.contractMode}
      setContractMode={trading.setContractMode}
      selectedDigit={trading.selectedDigit}
      setSelectedDigit={trading.setSelectedDigit}
      stake={trading.stake}
      setStake={trading.setStake}
      duration={trading.duration}
      setDuration={trading.setDuration}
      durationLimits={trading.durationLimits}
      proposal={trading.proposal}
      isProposalLoading={trading.isProposalLoading}
      buyContract={trading.buyContract}
      isBuying={trading.isBuying}
      buyResult={trading.buyResult}
      buyError={trading.buyError}
      clearBuyResult={trading.clearBuyResult}
      hideHeaderFooter={true}
    />
  );
}

// -------------------------------------------------------------
// Main Unified Dashboard Component
// -------------------------------------------------------------

type TabName = 'dashboard' | 'rise-fall' | 'digits' | 'accumulators' | 'dbot' | 'autotrade' | 'polymarket' | 'pharmacy' | 'bets';

export default function UniversalPage() {
  const { auth } = useDerivWSContext();
  const { authState, accounts, activeAccount } = auth;
  const [activeTab, setActiveTab] = useState<TabName>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);

  const menuItems = [
    { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, authRequired: false },
    { name: 'rise-fall', label: 'Rise / Fall', icon: TrendingUp, authRequired: true },
    { name: 'digits', label: 'Digits', icon: Hash, authRequired: true },
    { name: 'accumulators', label: 'Accumulators', icon: Zap, authRequired: true },
    { name: 'dbot', label: 'Bot Builder', icon: Bot, authRequired: true },
    { name: 'autotrade', label: 'Hedge Bot', icon: Activity, authRequired: true },
    { name: 'polymarket', label: 'Polymarket', icon: Activity, authRequired: false },
    { name: 'pharmacy', label: 'Pharmacy', icon: Activity, authRequired: false },
    { name: 'bets', label: 'Bets Engine', icon: Activity, authRequired: false },
  ] as const;

  const handleTabChange = (tabName: TabName) => {
    setActiveTab(tabName);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden font-sans text-zinc-200">
      {/* Sidebar Navigation */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-zinc-900 border-r border-zinc-800/80 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 shrink-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-extrabold text-sm shadow-lg shadow-red-600/30">
              IP
            </div>
            <div>
              <h2 className="font-bold text-zinc-100 leading-tight">InvestPal</h2>
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Universal App</span>
            </div>
          </div>
          <button className="lg:hidden text-zinc-400 hover:text-zinc-100" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.name;
            const isLocked = item.authRequired && authState !== 'authenticated';

            return (
              <button
                key={item.name}
                onClick={() => !isLocked && handleTabChange(item.name)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isSelected 
                    ? "bg-red-600 text-white shadow-md shadow-red-600/20" 
                    : isLocked 
                      ? "text-zinc-600 cursor-not-allowed" 
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                )}
                disabled={isLocked}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} />
                  <span>{item.label}</span>
                </div>
                {isLocked && (
                  <Badge variant="outline" className="text-[9px] font-bold border-zinc-800 text-zinc-600 px-1.5 py-0">
                    Locked
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        {/* Social Channels */}
        <div className="px-4 py-3 border-t border-zinc-800/60 bg-zinc-950/20">
          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">
            Social Channels
          </span>
          <div className="grid grid-cols-6 gap-1">
            <a href="https://www.youtube.com/@Investpal" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-500 hover:border-red-500/30 transition-all flex items-center justify-center" title="YouTube">
              <Youtube size={14} />
            </a>
            <a href="https://t.me/derivminers" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sky-400 hover:border-sky-400/30 transition-all flex items-center justify-center" title="Telegram">
              <Send size={14} />
            </a>
            <a href="https://chat.whatsapp.com/KJ5uiwfmC8gHxKxuTbXpzi" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/30 transition-all flex items-center justify-center" title="WhatsApp">
              <MessageCircle size={14} />
            </a>
            <a href="https://web.facebook.com/profile.php?id=61590574401999" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-blue-500 hover:border-blue-500/30 transition-all flex items-center justify-center" title="Facebook">
              <Facebook size={14} />
            </a>
            <a href="https://www.tiktok.com/@investpalfxbc" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-pink-500 hover:border-pink-500/30 transition-all flex items-center justify-center" title="TikTok">
              <Music size={14} />
            </a>
            <a href="https://www.linkedin.com/in/investpal-global-28bb88359" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-blue-400 hover:border-blue-400/30 transition-all flex items-center justify-center" title="LinkedIn">
              <Linkedin size={14} />
            </a>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-800/80 flex items-center justify-between gap-2 bg-zinc-900/50">
          <ThemeToggle />
          {authState === 'authenticated' && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-red-400 hover:bg-zinc-800" onClick={auth.logout}>
              <LogOut size={18} />
            </Button>
          )}
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Universal Top Header */}
        <header className="h-16 border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 shrink-0 relative z-30">
          {/* Mobile hamburger menu */}
          <button className="lg:hidden text-zinc-400 hover:text-zinc-100 p-1 rounded-md hover:bg-zinc-800" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>

          {/* Spacer on Desktop */}
          <div className="hidden lg:block text-xs font-semibold text-zinc-500 uppercase tracking-widest font-mono">
            {activeTab.replace('-', ' ')}
          </div>

          {/* Account Status / Swticher */}
          <div className="flex items-center gap-3">
            {authState === 'authenticated' && activeAccount ? (
              <Popover open={accountSwitcherOpen} onOpenChange={setAccountSwitcherOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-1.5 hover:bg-zinc-900/90 transition-all shadow-sm">
                    <div className="text-right">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider block leading-none mb-0.5",
                        activeAccount.account_id.startsWith('VR') ? 'text-orange-500' : 'text-emerald-500'
                      )}>
                        {activeAccount.account_id.startsWith('VR') ? 'Demo' : 'Real'}
                      </span>
                      <p className="text-sm font-black text-zinc-100 leading-none">
                        {parseFloat(activeAccount.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeAccount.currency}
                      </p>
                    </div>
                    <ChevronDown size={14} className="text-zinc-500 shrink-0 ml-1" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-2 bg-zinc-900 border-zinc-800 text-zinc-200">
                  <div className="space-y-1">
                    {accounts.map((account) => (
                      <button
                        key={account.account_id}
                        onClick={() => {
                          auth.switchAccount(account.account_id);
                          setAccountSwitcherOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between rounded-lg px-3 py-2 transition-all duration-150',
                          account.account_id === activeAccount.account_id
                            ? 'bg-zinc-800 text-white font-semibold'
                            : 'hover:bg-zinc-800/50 text-zinc-400'
                        )}
                      >
                        <div className="text-left">
                          <span className={cn(
                            "text-[9px] font-bold uppercase tracking-wider block",
                            account.account_id.startsWith('VR') ? 'text-orange-500' : 'text-emerald-500'
                          )}>
                            {account.account_id.startsWith('VR') ? 'Demo' : 'Real'}
                          </span>
                          <span className="text-xs font-mono">{account.account_id}</span>
                        </div>
                        <span className="text-sm font-bold text-zinc-200">
                          {parseFloat(account.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {account.currency}
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-zinc-800 text-zinc-500 text-xs py-1">
                  Session Locked
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs"
                  onClick={auth.login}
                  disabled={authState === 'authenticating'}
                >
                  Log in
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white text-xs"
                  onClick={() => window.location.href = 'https://partner-tracking.deriv.com/click?a=1248&o=1&c=3&link_id=1'}
                  disabled={authState === 'authenticating'}
                >
                  Sign up
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-1 overflow-y-auto relative min-h-0 bg-zinc-950/20">
          {activeTab === 'dashboard' && <DashboardView auth={auth} />}
          
          {/* Lazy mounts for trade views to manage connections */}
          {activeTab === 'rise-fall' && <RiseFallTab auth={auth} />}
          {activeTab === 'digits' && <DigitsTab auth={auth} />}
          {activeTab === 'accumulators' && <AccumulatorsTab auth={auth} />}
          
          {activeTab === 'dbot' && <BotBuilderView auth={auth} />}

          {activeTab === 'autotrade' && <AutoTradeView auth={auth} />}

          {activeTab === 'polymarket' && <PolymarketView />}
          {activeTab === 'pharmacy' && <PharmacyView />}
          {activeTab === 'bets' && <BetsView />}
        </main>
      </div>
    </div>
  );
}

// DbotTab replaced by custom BotBuilderView
