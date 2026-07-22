type DerivEnv = 'production' | 'preview';

function getEnv(): DerivEnv {
  if (typeof globalThis !== 'undefined' && typeof process !== 'undefined') {
    const env = process.env.NEXT_PUBLIC_DERIV_ENV;
    if (env === 'preview') return 'preview';
  }
  return 'production';
}

const URLS = {
  production: {
    authBase: 'https://auth.deriv.com/oauth2',
    apiBase: 'https://api.derivws.com/trading/v1/options',
    wsDomain: 'ws.derivws.com',
    appBuilder: 'https://developers.deriv.com',
  },
  preview: {
    authBase: 'https://staging-auth.deriv.com/oauth2',
    apiBase: 'https://staging-api.derivws.com/trading/v1/options',
    wsDomain: 'staging-ws.derivws.com',
    appBuilder: 'https://staging-developers.deriv.com',
  },
} as const;

export function getAuthBaseUrl(): string {
  return URLS[getEnv()].authBase;
}

export function getApiBaseUrl(): string {
  return URLS[getEnv()].apiBase;
}

export function getPublicWsUrl(): string {
  const env = getEnv();
  const appId = typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_DERIV_APP_ID ?? '1089'
    : '1089';
  return `wss://${URLS[env].wsDomain}/websockets/v3?app_id=${appId}&l=EN&brand=deriv`;
}

/**
 * Base URL of the app-builder BFF (deriv-api-v2). Used to call its runtime
 * affiliate-resolution proxy. Derived from NEXT_PUBLIC_DERIV_ENV so no extra
 * env var is needed in the assembled app.
 */
export function getAppBuilderBaseUrl(): string {
  return URLS[getEnv()].appBuilder;
}
