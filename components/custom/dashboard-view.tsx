'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check, Copy, ExternalLink, Key, LogIn, LogOut, Sparkles, UserPlus, Download, FileCode, Share2, Youtube, Send, MessageCircle, Facebook, Music, Linkedin } from 'lucide-react';
import type { UseAuthReturn } from '@/hooks/use-auth';

interface DashboardViewProps {
  auth: UseAuthReturn;
}

export function DashboardView({ auth }: DashboardViewProps) {
  const { authState, accounts, activeAccount, loginWithPat, logout, error } = auth;
  const [patToken, setPatToken] = useState('');
  const [appId, setAppId] = useState(process.env.NEXT_PUBLIC_DERIV_APP_ID || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Copy state
  const [copiedLink, setCopiedLink] = useState<'revshare' | 'turnover' | 'promo' | null>(null);

  const handleAutofillTest = () => {
    setPatToken('pat_dd44ae004e277664032db1f97f36afaf9ef337633ac35074e41569a49ef6295b');
    setAppId(process.env.NEXT_PUBLIC_DERIV_APP_ID || '');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patToken.trim() || !appId.trim()) return;

    setIsSubmitting(true);
    await loginWithPat(patToken.trim(), appId.trim());
    setIsSubmitting(false);
  };

  const copyToClipboard = (text: string, key: 'revshare' | 'turnover' | 'promo') => {
    navigator.clipboard.writeText(text);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const revshareUrl = 'https://partner-tracking.deriv.com/click?a=1248&o=1&c=3&link_id=1';
  const turnoverUrl = 'https://partner-tracking.deriv.com/click?a=1248&o=1&c=4&link_id=1';
  const promoCode = 'H9M8T663Z6H9';

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8 animate-in fade-in duration-500">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 to-amber-600 p-8 text-white shadow-xl">
        <div className="relative z-10 space-y-2 max-w-xl">
          <Badge className="bg-white/20 text-white border-0 hover:bg-white/30 backdrop-blur-md mb-2">
            InvestPal Universal v1.0
          </Badge>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Universal Trading Dashboard
          </h1>
          <p className="text-white/80 text-sm md:text-base">
            Trade Rise/Fall, Digits, and Accumulators, or run automated Blockly strategies and dual-leg martingale hedging bots all in one platform.
          </p>
        </div>
        <div className="absolute right-0 bottom-0 top-0 opacity-10 flex items-center justify-center pointer-events-none pr-12">
          <Sparkles size={250} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Connection & Login Card */}
        <Card className="border border-zinc-800 bg-zinc-950/60 backdrop-blur-md shadow-2xl relative">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
              <Key className="w-5 h-5 text-red-500" />
              API Token Authorization
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Authorize your session using the Deriv Personal Access Token (PAT) format.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {authState === 'authenticated' && activeAccount ? (
              <div className="space-y-4 animate-in zoom-in-95 duration-300">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Active Account</span>
                    <Badge variant={activeAccount.account_id.startsWith('VR') ? 'secondary' : 'default'} className="font-semibold">
                      {activeAccount.account_id.startsWith('VR') ? 'Demo' : 'Real'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xl font-extrabold text-zinc-100">
                      {activeAccount.currency} {parseFloat(activeAccount.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-sm font-mono text-zinc-400">{activeAccount.account_id}</span>
                  </div>
                  {accounts.length > 1 && (
                    <div className="pt-2 border-t border-zinc-800/60 flex flex-col gap-1.5">
                      <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Linked Accounts</span>
                      <div className="flex flex-wrap gap-1.5">
                        {accounts.map(acc => (
                          <Badge 
                            key={acc.account_id} 
                            variant={acc.account_id === activeAccount.account_id ? 'default' : 'outline'}
                            className={`cursor-pointer ${acc.account_id === activeAccount.account_id ? 'bg-red-600 hover:bg-red-700' : 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'}`}
                            onClick={() => auth.switchAccount(acc.account_id)}
                          >
                            {acc.account_id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 border-zinc-800 hover:bg-zinc-900 text-zinc-300 gap-2" onClick={logout}>
                    <LogOut size={16} />
                    Disconnect Session
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="token" className="text-xs font-semibold text-zinc-300">Personal Access Token (PAT)</Label>
                  <Input
                    id="token"
                    placeholder="pat_..."
                    type="password"
                    value={patToken}
                    onChange={(e) => setPatToken(e.target.value)}
                    className="bg-zinc-900/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-red-500 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="appId" className="text-xs font-semibold text-zinc-300">App ID</Label>
                  <Input
                    id="appId"
                    placeholder="33JI7..."
                    type="text"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    className="bg-zinc-900/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-red-500 font-mono"
                    required
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg border border-red-900/40 bg-red-950/20 text-red-400 text-xs font-medium">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-zinc-800 hover:bg-zinc-900 text-zinc-400 text-xs font-medium"
                    onClick={handleAutofillTest}
                  >
                    Autofill Test Token
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold gap-2"
                    disabled={isSubmitting || authState === 'authenticating'}
                  >
                    {authState === 'authenticating' ? 'Connecting...' : (
                      <>
                        <LogIn size={16} />
                        Authorize API
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Affiliate Sign Up Card */}
        <Card className="border border-zinc-800 bg-zinc-950/60 backdrop-blur-md shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
              <UserPlus className="w-5 h-5 text-amber-500" />
              New Client Registration
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Earn commissions by tagging new accounts using referral signups.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {/* Revshare Link */}
              <div className="p-3 rounded-lg border border-zinc-900 bg-zinc-900/30 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Revenue Share Link</span>
                  <p className="text-xs text-zinc-500 font-mono truncate max-w-[260px]">{revshareUrl}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => copyToClipboard(revshareUrl, 'revshare')}>
                    {copiedLink === 'revshare' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" asChild className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
                    <a href={revshareUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>

              {/* Turnover Link */}
              <div className="p-3 rounded-lg border border-zinc-900 bg-zinc-900/30 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Turnover Commission Link</span>
                  <p className="text-xs text-zinc-500 font-mono truncate max-w-[260px]">{turnoverUrl}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => copyToClipboard(turnoverUrl, 'turnover')}>
                    {copiedLink === 'turnover' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" asChild className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
                    <a href={turnoverUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>

              {/* Promo Code */}
              <div className="p-3 rounded-lg border border-zinc-900 bg-zinc-900/30 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Promo Code</span>
                  <p className="text-xs font-bold font-mono text-zinc-200">{promoCode}</p>
                </div>
                <Button variant="outline" className="border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold h-8 gap-1.5" onClick={() => copyToClipboard(promoCode, 'promo')}>
                  {copiedLink === 'promo' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Code
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="text-xs text-zinc-500 leading-relaxed bg-amber-950/10 border border-amber-900/20 p-3 rounded-lg">
              <span className="font-semibold text-amber-500">Quick Guide:</span> New clients who sign up using these tracking links will automatically be registered under your affiliate tree. It is highly recommended to promote the <strong className="text-zinc-300">Revshare Link</strong> consistently to keep tracking clean.
            </div>
          </CardContent>
        </Card>

        {/* Blockly Strategy Templates */}
        <Card className="border border-zinc-800 bg-zinc-950/60 backdrop-blur-md shadow-2xl md:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
              <FileCode className="w-5 h-5 text-red-500" />
              Pre-loaded DBot Strategy XMLs
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Download pre-configured Blockly XML strategies to import directly into your DBot workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Template 1 */}
            <div className="p-3.5 rounded-lg border border-zinc-900 bg-zinc-900/30 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-zinc-200">Martingale Alternate Even-Odd</span>
                <p className="text-[10px] text-zinc-500">Alternates buying Even/Odd with Martingale risk recovery.</p>
              </div>
              <Button size="icon" variant="ghost" asChild className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 shrink-0">
                <a href="/bot-examples/martingale_alternate_even_odd.xml" download="martingale_alternate_even_odd.xml">
                  <Download className="w-4 h-4" />
                </a>
              </Button>
            </div>

            {/* Template 2 */}
            <div className="p-3.5 rounded-lg border border-zinc-900 bg-zinc-900/30 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-zinc-200">Great Martingale</span>
                <p className="text-[10px] text-zinc-500">A higher yields Martingale scaling loop for digits markets.</p>
              </div>
              <Button size="icon" variant="ghost" asChild className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 shrink-0">
                <a href="/bot-examples/Great Martingale.xml" download="great_martingale.xml">
                  <Download className="w-4 h-4" />
                </a>
              </Button>
            </div>

            {/* Template 3 */}
            <div className="p-3.5 rounded-lg border border-zinc-900 bg-zinc-900/30 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-zinc-200">Alternate Call/Put on Loss</span>
                <p className="text-[10px] text-zinc-500">Alternates Rise/Fall purchases automatically upon encountering a loss.</p>
              </div>
              <Button size="icon" variant="ghost" asChild className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 shrink-0">
                <a href="/bot-examples/alternate call put on loss.xml" download="alternate_call_put_on_loss.xml">
                  <Download className="w-4 h-4" />
                </a>
              </Button>
            </div>

            {/* Template 4 */}
            <div className="p-3.5 rounded-lg border border-zinc-900 bg-zinc-900/30 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-zinc-200">RSI Call/Put Indicators</span>
                <p className="text-[10px] text-zinc-500">Automated Rise/Fall trading driven by live RSI indicator bounds.</p>
              </div>
              <Button size="icon" variant="ghost" asChild className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 shrink-0">
                <a href="/bot-examples/rsi call put.xml" download="rsi_call_put.xml">
                  <Download className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Social Channels Card */}
        <Card className="border border-zinc-800 bg-zinc-950/60 backdrop-blur-md shadow-2xl md:col-span-2 animate-in slide-in-from-bottom duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
              <Share2 className="w-5 h-5 text-red-500" />
              Join Our Social Communities
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Follow our official channels, access tutorials, and interact with the InvestPal trading community.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* YouTube */}
            <a href="https://www.youtube.com/@Investpal" target="_blank" rel="noopener noreferrer" className="group p-4 rounded-xl border border-zinc-900 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-red-500/30 transition-all duration-300 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Youtube className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-sm font-bold text-zinc-200 block group-hover:text-red-400 transition-colors">YouTube Channel</span>
                <span className="text-[10px] text-zinc-500 block truncate">@Investpal</span>
              </div>
            </a>

            {/* Telegram */}
            <a href="https://t.me/derivminers" target="_blank" rel="noopener noreferrer" className="group p-4 rounded-xl border border-zinc-900 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-sky-500/30 transition-all duration-300 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-sm font-bold text-zinc-200 block group-hover:text-sky-400 transition-colors">Telegram Channel</span>
                <span className="text-[10px] text-zinc-500 block truncate">t.me/derivminers</span>
              </div>
            </a>

            {/* WhatsApp */}
            <a href="https://chat.whatsapp.com/KJ5uiwfmC8gHxKxuTbXpzi" target="_blank" rel="noopener noreferrer" className="group p-4 rounded-xl border border-zinc-900 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-emerald-500/30 transition-all duration-300 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-sm font-bold text-zinc-200 block group-hover:text-emerald-400 transition-colors">WhatsApp Group</span>
                <span className="text-[10px] text-zinc-500 block truncate">chat.whatsapp.com</span>
              </div>
            </a>

            {/* Facebook */}
            <a href="https://web.facebook.com/profile.php?id=61590574401999" target="_blank" rel="noopener noreferrer" className="group p-4 rounded-xl border border-zinc-900 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-blue-600/30 transition-all duration-300 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-600/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Facebook className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-sm font-bold text-zinc-200 block group-hover:text-blue-400 transition-colors">Facebook Page</span>
                <span className="text-[10px] text-zinc-500 block truncate">InvestPal Profile</span>
              </div>
            </a>

            {/* TikTok */}
            <a href="https://www.tiktok.com/@investpalfxbc" target="_blank" rel="noopener noreferrer" className="group p-4 rounded-xl border border-zinc-900 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-pink-500/30 transition-all duration-300 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-pink-500/10 text-pink-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Music className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-sm font-bold text-zinc-200 block group-hover:text-pink-400 transition-colors">TikTok Feed</span>
                <span className="text-[10px] text-zinc-500 block truncate">@investpalfxbc</span>
              </div>
            </a>

            {/* LinkedIn */}
            <a href="https://www.linkedin.com/in/investpal-global-28bb88359" target="_blank" rel="noopener noreferrer" className="group p-4 rounded-xl border border-zinc-900 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-blue-400/30 transition-all duration-300 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Linkedin className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-sm font-bold text-zinc-200 block group-hover:text-blue-300 transition-colors">LinkedIn Profile</span>
                <span className="text-[10px] text-zinc-500 block truncate">investpal-global</span>
              </div>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
