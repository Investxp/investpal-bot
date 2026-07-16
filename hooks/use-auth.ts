'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initiateLogin,
  initiateSignUp,
  handleOAuthCallback,
  refreshAccessToken,
  fetchAccounts,
  getWebSocketOTP,
  logout as coreLogout,
  getAuthInfo,
  getDerivAccounts,
  getActiveLoginId,
  setActiveLoginId,
  setAccountType,
  clearAllAuthData,
  parseReferralLink,
  parseLandingParams,
  resolveReferralViaProxy,
  storeAuthInfo,
} from '@deriv/core';
import type { AuthInfo, DerivAccount, AuthState, AuthConfig } from '@deriv/core';

function getAuthConfig(): AuthConfig {
  const storedAppId = typeof window !== 'undefined' ? localStorage.getItem('custom_app_id') : null;
  const config: AuthConfig = {
    clientId: storedAppId ?? process.env.NEXT_PUBLIC_DERIV_APP_ID ?? '',
    redirectUri:
      process.env.NEXT_PUBLIC_DERIV_REDIRECT_URI ??
      (typeof window !== 'undefined' ? window.location.origin : ''),
  };

  // Convert comma-separated scopes to space-separated (OAuth spec)
  const scopesEnv = process.env.NEXT_PUBLIC_DERIV_OAUTH_SCOPES ?? '';
  if (scopesEnv) {
    config.scopes = scopesEnv
      .split(',')
      .map(s => s.trim())
      .join(' ');
  }

  const referralLink = process.env.NEXT_PUBLIC_DERIV_REFERRAL_LINK ?? '';
  if (referralLink) {
    const referral = parseReferralLink(referralLink);
    if (referral) {
      config.affiliateToken = referral.affiliateToken;
      config.affiliateTokenParam = referral.affiliateTokenParam;
      config.utmCampaign = referral.utmCampaign;
      config.utmSource = referral.utmSource;
      config.utmMedium = referral.utmMedium;
    }
  }

  // Override with live per-click params from landing URL (e.g. Scaleo t= token).
  // These are present in window.location.search when the user arrives via an
  // affiliate link and haven't been removed yet (OAuth params aren't in the URL
  // at this point — they only appear after Deriv redirects back with ?code=).
  const landing = parseLandingParams();
  if (landing) {
    // Only override the token when the landing URL actually carries one (t=).
    // parseLandingParams returns a non-null result for any utm_* param, so an
    // unguarded write would clobber a valid env token with '' on generic
    // marketing links (e.g. ?utm_source=google with no t=).
    if (landing.affiliateToken) {
      config.affiliateToken = landing.affiliateToken;
      config.affiliateTokenParam = landing.affiliateTokenParam;
    }
    if (landing.utmSource) config.utmSource = landing.utmSource;
    if (landing.utmMedium) config.utmMedium = landing.utmMedium;
    if (landing.utmCampaign) config.utmCampaign = landing.utmCampaign;
  }

  return config;
}

// Build the auth config and, if we don't already have an affiliate token (from
// a resolved/Format-3 referral link or live landing params), try to resolve a
// fresh per-user token via the app-builder BFF proxy. Strictly non-blocking:
// any failure leaves the config untouched so login/sign-up always proceeds.
async function getAuthConfigWithReferral(): Promise<AuthConfig> {
  const config = getAuthConfig();
  if (!config.affiliateToken) {
    try {
      const referralLink = process.env.NEXT_PUBLIC_DERIV_REFERRAL_LINK ?? '';
      const resolved = await resolveReferralViaProxy(referralLink);
      if (resolved) {
        config.affiliateToken = resolved.affiliateToken;
        config.affiliateTokenParam = resolved.affiliateTokenParam;
        if (resolved.utmSource) config.utmSource = resolved.utmSource;
        if (resolved.utmMedium) config.utmMedium = resolved.utmMedium;
        if (resolved.utmCampaign) config.utmCampaign = resolved.utmCampaign;
      }
    } catch {
      // Never block login on attribution resolution.
    }
  }
  return config;
}

export interface UseAuthReturn {
  authState: AuthState;
  accounts: DerivAccount[];
  activeAccount: DerivAccount | null;
  activeAccountId: string | null;
  wsUrl: string | undefined;
  login: () => Promise<void>;
  signUp: () => Promise<void>;
  loginWithPat: (patToken: string, appId: string) => Promise<void>;
  logout: () => void;
  switchAccount: (accountId: string) => Promise<void>;
  updateAccountBalance: (accountId: string, newBalance: string) => void;
  error: string | null;
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>(() =>
    typeof window !== 'undefined' && getAuthInfo() ? 'authenticated' : 'unauthenticated'
  );
  const [accounts, setAccounts] = useState<DerivAccount[]>(() => {
    if (typeof window === 'undefined') return [];
    return getDerivAccounts() ?? [];
  });
  const [activeAccountId, setActiveAccountId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return getActiveLoginId() ?? null;
  });
  const [wsUrl, setWsUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);
  const activeAccountIdRef = useRef<string | null>(null);
  const tabHiddenAtRef = useRef<number | null>(null);

  // Fetch OTP WebSocket URL for an account
  const fetchOTPUrl = useCallback(
    async (accountId: string, authInfo: AuthInfo): Promise<string> => {
      return getWebSocketOTP(accountId, authInfo, getAuthConfig().clientId);
    },
    []
  );

  const syncStorageForDBot = useCallback((fetchedAccounts: DerivAccount[], primaryToken: string) => {
    if (typeof window === 'undefined') return;

    const accountsListObj: Record<string, string> = {};
    const clientAccountsObj: Record<string, any> = {};
    
    fetchedAccounts.forEach(acc => {
      const token = (acc as any).token || primaryToken;
      if (token) {
        accountsListObj[acc.account_id] = token;
        clientAccountsObj[acc.account_id] = {
          loginid: acc.account_id,
          token: token,
          currency: acc.currency || 'USD',
        };
      }
    });

    localStorage.setItem('accountsList', JSON.stringify(accountsListObj));
    localStorage.setItem('clientAccounts', JSON.stringify(clientAccountsObj));
    localStorage.setItem('session_token', primaryToken);
    localStorage.setItem('authToken', primaryToken);
  }, []);

  // Complete auth: fetch accounts → get OTP → set WS URL
  const completeAuth = useCallback(
    async (authInfo: AuthInfo) => {
      const fetchedAccounts = await fetchAccounts(authInfo, getAuthConfig().clientId);
      setAccounts(fetchedAccounts);

      if (fetchedAccounts.length > 0) {
        const firstAccount = fetchedAccounts[0];
        setActiveAccountId(firstAccount.account_id);

        // Sync storage for DBot
        syncStorageForDBot(fetchedAccounts, authInfo.access_token);

        const otpUrl = await fetchOTPUrl(firstAccount.account_id, authInfo);
        setWsUrl(otpUrl);
      }

      setAuthState('authenticated');
    },
    [fetchOTPUrl, syncStorageForDBot]
  );

  // Initialize: check for OAuth callback or existing session
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');

      // Phase 3-5: Handle OAuth callback
      if (code) {
        setAuthState('authenticating');
        try {
          const authInfo = await handleOAuthCallback(window.location.href, getAuthConfig());
          await completeAuth(authInfo);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Authentication failed');
          setAuthState('error');
          clearAllAuthData();
        }
        return;
      }

      // Check for existing session
      const storedAuth = getAuthInfo();
      if (storedAuth) {
        // Check if token is expired
        if (storedAuth.expires_at && Date.now() / 1000 > storedAuth.expires_at) {
          // Try to refresh
          try {
            const refreshed = await refreshAccessToken(
              storedAuth.refresh_token,
              getAuthConfig().clientId
            );
            await completeAuth(refreshed);
          } catch {
            // Refresh failed — fall back to unauthenticated (public WS)
            clearAllAuthData();
            setAuthState('unauthenticated');
          }
          return;
        }

        // Valid stored session — restore accounts and get fresh OTP
        const storedAccounts = getDerivAccounts();
        if (storedAccounts && storedAccounts.length > 0) {
          setAccounts(storedAccounts);
          const loginId = getActiveLoginId() ?? storedAccounts[0].account_id;
          setActiveAccountId(loginId);

          // Sync storage for DBot on restore
          syncStorageForDBot(storedAccounts, storedAuth.access_token);

          try {
            const otpUrl = await fetchOTPUrl(loginId, storedAuth);
            setWsUrl(otpUrl);
            setAuthState('authenticated');
          } catch {
            // OTP fetch failed — token may be invalid, clear and fallback
            clearAllAuthData();
            setAuthState('unauthenticated');
          }
        } else {
          // Have auth info but no accounts — re-fetch
          try {
            await completeAuth(storedAuth);
          } catch {
            clearAllAuthData();
            setAuthState('unauthenticated');
          }
        }
      }
    };

    init();
  }, [completeAuth, fetchOTPUrl]);

  // Keep ref in sync so visibility handler always has the current account ID
  useEffect(() => {
    activeAccountIdRef.current = activeAccountId;
  }, [activeAccountId]);

  // Refresh the OTP WebSocket URL when returning to the tab after >30s of inactivity.
  // OTP URLs are single-use, so a stale URL will cause reconnect failures.
  useEffect(() => {
    if (authState !== 'authenticated') return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now();
        return;
      }

      const hiddenAt = tabHiddenAtRef.current;
      if (!hiddenAt || Date.now() - hiddenAt < 30_000) return;
      tabHiddenAtRef.current = null;

      const accountId = activeAccountIdRef.current;
      const authInfo = getAuthInfo();
      if (!authInfo || !accountId) return;

      try {
        const otpUrl = await fetchOTPUrl(accountId, authInfo);
        setWsUrl(otpUrl);
      } catch {
        clearAllAuthData();
        setAuthState('unauthenticated');
        setWsUrl(undefined);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [authState, fetchOTPUrl]);

  // Phase 1: Initiate login — includes partner attribution params, resolving a
  // fresh per-user Scaleo token via the BFF proxy when needed (non-blocking).
  const login = useCallback(async () => {
    await initiateLogin(await getAuthConfigWithReferral());
  }, []);

  // Initiate sign-up — adds prompt=registration and partner attribution params
  const signUp = useCallback(async () => {
    await initiateSignUp(await getAuthConfigWithReferral());
  }, []);

  // Login with PAT Token directly
  const loginWithPat = useCallback(
    async (patToken: string, appId: string) => {
      setAuthState('authenticating');
      setError(null);
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('custom_app_id', appId);
        }

        const authInfo: AuthInfo = {
          access_token: patToken,
          expires_at: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
          token_type: 'Bearer',
          expires_in: 365 * 24 * 3600,
          scope: 'admin read trade payment',
          refresh_token: '',
        };

        storeAuthInfo(authInfo);

        const fetchedAccounts = await fetchAccounts(authInfo, appId);
        setAccounts(fetchedAccounts);

        if (fetchedAccounts.length > 0) {
          const firstAccount = fetchedAccounts[0];
          setActiveAccountId(firstAccount.account_id);

          // Write account details to localStorage for DBot using sync helper
          syncStorageForDBot(fetchedAccounts, patToken);

          if (typeof window !== 'undefined') {
            localStorage.setItem('active_loginid', firstAccount.account_id);
          }

          const otpUrl = await fetchOTPUrl(firstAccount.account_id, authInfo);
          setWsUrl(otpUrl);
        }

        setAuthState('authenticated');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'PAT Login failed');
        setAuthState('error');
        coreLogout();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accountsList');
          localStorage.removeItem('clientAccounts');
          localStorage.removeItem('active_loginid');
          localStorage.removeItem('session_token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('custom_app_id');
        }
      }
    },
    [fetchOTPUrl]
  );

  // Logout: close WS (handled by useDerivWS cleanup), clear storage, reset state
  const logout = useCallback(() => {
    coreLogout();
    setAccounts([]);
    setActiveAccountId(null);
    setWsUrl(undefined);
    setAuthState('unauthenticated');
    setError(null);
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accountsList');
      localStorage.removeItem('clientAccounts');
      localStorage.removeItem('active_loginid');
      localStorage.removeItem('session_token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('custom_app_id');
    }
  }, []);

  // Account switch: fetch new OTP first, then update accountId and wsUrl together
  // so reconnectKey and url change in the same render cycle with the correct OTP.
  const switchAccount = useCallback(
    async (accountId: string) => {
      const authInfo = getAuthInfo();
      if (!authInfo) return;

      try {
        const account = accounts.find(a => a.account_id === accountId);
        if (account) setAccountType(account.account_type);
        // Fetch OTP before updating accountId so reconnectKey and url are consistent
        const otpUrl = await fetchOTPUrl(accountId, authInfo);
        setActiveLoginId(accountId);
        setActiveAccountId(accountId);
        setWsUrl(otpUrl);

        if (typeof window !== 'undefined') {
          localStorage.setItem('active_loginid', accountId);
          const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') ?? '{}');
          const token = clientAccounts[accountId]?.token || authInfo.access_token;
          localStorage.setItem('session_token', token);
          localStorage.setItem('authToken', token);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Account switch failed');
      }
    },
    [fetchOTPUrl, accounts]
  );

  const updateAccountBalance = useCallback((accountId: string, newBalance: string) => {
    setAccounts(prev => prev.map(acc => {
      if (acc.account_id === accountId) {
        return { ...acc, balance: newBalance };
      }
      return acc;
    }));
  }, []);

  const activeAccount =
    accounts.find(acc => acc.account_id === activeAccountId) ?? accounts[0] ?? null;

  return {
    authState,
    accounts,
    activeAccount,
    activeAccountId,
    wsUrl,
    login,
    signUp,
    loginWithPat,
    logout,
    switchAccount,
    updateAccountBalance,
    error,
  };
}
