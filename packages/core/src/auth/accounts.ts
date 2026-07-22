import type { AuthInfo, DerivAccount, OTPResponse } from '../types';
import {
  storeDerivAccounts,
  setActiveLoginId,
  setAccountType,
  clearAllAuthData,
} from './storage';
import { getApiBaseUrl } from '../config/urls';

function getWsDomain(): string {
  const env = typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_DERIV_ENV === 'preview' ? 'preview' : 'production')
    : 'production';
  return env === 'preview' ? 'staging-ws.derivws.com' : 'ws.derivws.com';
}

/**
 * Fetch the list of trading accounts for the authenticated user.
 */
export async function fetchAccounts(
  authInfo: AuthInfo,
  clientId: string
): Promise<DerivAccount[]> {
  const response = await fetch(`${getApiBaseUrl()}/accounts`, {
    headers: {
      Authorization: `Bearer ${authInfo.access_token}`,
      'Deriv-App-ID': clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch accounts (${response.status})`);
  }

  const data = await response.json();
  const accounts: DerivAccount[] = data.data;

  storeDerivAccounts(accounts);

  if (accounts.length > 0) {
    const firstAccount = accounts[0];
    setActiveLoginId(firstAccount.account_id);
    setAccountType(firstAccount.account_type);
  }

  return accounts;
}

/**
 * Get a one-time WebSocket URL for an authenticated session.
 */
export async function getWebSocketOTP(
  accountId: string,
  authInfo: AuthInfo,
  clientId: string
): Promise<string> {
  const response = await fetch(`${getApiBaseUrl()}/accounts/${accountId}/otp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authInfo.access_token}`,
      'Deriv-App-ID': clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get WebSocket OTP (${response.status})`);
  }

  const data: OTPResponse = await response.json();

  // Convert the Deriv-provided OTP URL to the standard WebSocket URL format.
  // The server returns something like:
  //   wss://api.derivws.com/trading/v1/options/ws/demo?otp=sV4Trsf1
  // We need:
  //   wss://ws.derivws.com/websockets/v3?app_id=...&otp=...&login1=...&l=EN&brand=deriv
  try {
    const parsed = new URL(data.data.url);
    const otp = parsed.searchParams.get('otp');
    if (otp) {
      const domain = getWsDomain();
      return `wss://${domain}/websockets/v3?app_id=${clientId}&otp=${otp}&login1=${accountId}&l=EN&brand=deriv`;
    }
  } catch {
    // If URL parsing fails, fall back to the server-provided URL
  }
  return data.data.url;
}

/**
 * Perform logout: clear all auth data.
 * Caller is responsible for closing any open WebSocket connections and resetting UI.
 */
export function logout(): void {
  clearAllAuthData();
}
