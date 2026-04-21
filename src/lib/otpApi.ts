/**
 * otpApi.ts
 * Frontend client for the Cyberspace-X OTP auth backend (Express on port 3001).
 *
 * Environment:
 *   VITE_API_BASE_URL  – base URL of the backend server (default: http://localhost:3001)
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────────────

export type OtpUser = {
  id: string;
  email: string;
  name: string;
  username: string;
};

export type SendOtpResponse = {
  message: string;
};

export type VerifyOtpResponse = {
  token: string;
  user: OtpUser;
};

/** Error codes returned by the backend. */
export type OtpErrorCode =
  | 'INVALID_EMAIL'
  | 'MAX_ATTEMPTS_REACHED'
  | 'OTP_EXPIRED'
  | 'INVALID_OTP'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR';

export class OtpApiError extends Error {
  code: OtpErrorCode;
  attemptsRemaining?: number;

  constructor({
    message,
    code,
    attemptsRemaining,
  }: {
    message: string;
    code: OtpErrorCode;
    attemptsRemaining?: number;
  }) {
    super(message);
    this.name = 'OtpApiError';
    this.code = code;
    this.attemptsRemaining = attemptsRemaining;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const JWT_STORAGE_KEY = 'cyberx_auth_token';

/** Persist the JWT to localStorage. */
export const storeOtpJwt = (token: string): void => {
  localStorage.setItem(JWT_STORAGE_KEY, token);
};

/** Retrieve the stored JWT (or null if absent). */
export const getOtpJwt = (): string | null => {
  return localStorage.getItem(JWT_STORAGE_KEY);
};

/** Remove the JWT from localStorage (sign-out). */
export const clearOtpJwt = (): void => {
  localStorage.removeItem(JWT_STORAGE_KEY);
};

/** Build an Authorization header object for API calls. */
export const getOtpAuthHeaders = (): Record<string, string> => {
  const token = getOtpJwt();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

// ── Request helper ────────────────────────────────────────────────────────────

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OtpApiError({
      message: 'Cannot reach the authentication server. Check your connection.',
      code: 'NETWORK_ERROR',
    });
  }

  let json: Record<string, unknown>;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new OtpApiError({
      message: 'Unexpected response from the server.',
      code: 'SERVER_ERROR',
    });
  }

  if (!response.ok) {
    const errorMsg = (json.error as string | undefined) || 'Something went wrong.';
    const errorCode = (json.code as string | undefined) || '';
    const attemptsRemaining =
      typeof json.attemptsRemaining === 'number' ? json.attemptsRemaining : undefined;

    if (response.status === 429) {
      const code: OtpErrorCode =
        errorCode === 'MAX_ATTEMPTS_REACHED' ? 'MAX_ATTEMPTS_REACHED' : 'RATE_LIMITED';
      throw new OtpApiError({ message: errorMsg, code, attemptsRemaining });
    }

    if (errorCode === 'OTP_EXPIRED') {
      throw new OtpApiError({ message: errorMsg, code: 'OTP_EXPIRED' });
    }

    if (errorCode === 'INVALID_OTP') {
      throw new OtpApiError({ message: errorMsg, code: 'INVALID_OTP', attemptsRemaining });
    }

    if (response.status === 400) {
      throw new OtpApiError({ message: errorMsg, code: 'INVALID_EMAIL' });
    }

    throw new OtpApiError({ message: errorMsg, code: 'SERVER_ERROR' });
  }

  return json as T;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Request an OTP to be sent to `email`.
 * Throws `OtpApiError` on failure.
 */
export const sendOtp = (email: string): Promise<SendOtpResponse> =>
  post<SendOtpResponse>('/auth/send-otp', { email });

/**
 * Verify the OTP for `email`.
 * On success, automatically stores the JWT in localStorage.
 * Returns the JWT token and user data.
 * Throws `OtpApiError` on failure.
 */
export const verifyOtp = async (
  email: string,
  otp: string,
): Promise<VerifyOtpResponse> => {
  const result = await post<VerifyOtpResponse>('/auth/verify-otp', { email, otp });
  storeOtpJwt(result.token);
  return result;
};
