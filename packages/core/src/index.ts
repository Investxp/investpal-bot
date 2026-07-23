// Auth
export {
  buildAuthorizationUrl,
  buildSignUpUrl,
  initiateLogin,
  initiateSignUp,
  parseCallbackParams,
  validateCallback,
  exchangeCodeForTokens,
  refreshAccessToken,
  handleOAuthCallback,
  cleanupUrl,
  OAuthError,
  fetchAccounts,
  getWebSocketOTP,
  logout,
  generateRandomBase64url,
  sha256Base64url,
  base64urlEncode,
  storeCSRFToken,
  getCSRFToken,
  clearCSRFToken,
  storeCodeVerifier,
  getCodeVerifier,
  clearCodeVerifier,
  storeAuthInfo,
  getAuthInfo,
  clearAuthInfo,
  storeDerivAccounts,
  getDerivAccounts,
  clearDerivAccounts,
  setActiveLoginId,
  getActiveLoginId,
  setAccountType,
  getAccountType,
  clearAllAuthData,
  parseReferralLink,
  parseLandingParams,
  resolveReferralViaProxy,
} from './auth';

// Types
export type {
  AuthConfig,
  AuthInfo,
  DerivAccount,
  OTPResponse,
  TokenExchangeParams,
  CallbackParams,
  AuthState,
  StoredCSRFToken,
  StoredCodeVerifier,
  ActiveSymbol,
  Tick,
  TicksHistoryResponse,
  ContractsForResponse,
  ContractInfo,
  DurationLimits,
  ProposalResponse,
  ProposalInfo,
  BuyResponse,
  BuyResult,
  ProposalParams,
} from './types';

// Config
export { getAuthBaseUrl, getApiBaseUrl, getPublicWsUrl } from './config';

// Utils
export { pickDefaultSymbol } from './utils/pick-default-symbol';

// WebSocket
export { DerivWS } from './ws/deriv-ws';

// React Hooks — directly from source files (avoid barrel to prevent circular-dep TDZ)
export { useDerivWS } from './react/useDerivWS';
export { useActiveSymbols } from './react/useActiveSymbols';
export { useTicks } from './react/useTicks';
export { useProposal } from './react/useProposal';
export { useBuy } from './react/useBuy';
