import { normalizeEmail, validateSignUpEmail } from '@/lib/emailValidation';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type SignUpPayload = {
  name: string;
  email: string;
  password: string;
};

export type SignInPayload = {
  email: string;
  password: string;
};

export type ApiFieldErrorCode =
  | 'EMAIL_REQUIRED'
  | 'INVALID_EMAIL_FORMAT'
  | 'UNSUPPORTED_EMAIL_DOMAIN'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'INVALID_CREDENTIALS'
  | 'CONFIGURATION_ERROR'
  | 'NAME_REQUIRED'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'UNKNOWN_ERROR';

export type ApiFieldError = {
  field: 'name' | 'email' | 'password';
  code: ApiFieldErrorCode;
  message: string;
};

export class AuthApiError extends Error {
  status: number;
  code: ApiFieldErrorCode;
  field?: ApiFieldError['field'];

  constructor({
    message,
    status,
    code,
    field,
  }: {
    message: string;
    status: number;
    code: ApiFieldErrorCode;
    field?: ApiFieldError['field'];
  }) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export type SignUpSuccessResponse = {
  status: 201;
  message: string;
  user: {
    name: string;
    email: string;
  };
  emailConfirmationRequired: boolean;
};

export type SignInSuccessResponse = {
  status: 200;
  message: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
};

const validatePayload = ({ name, email, password }: SignUpPayload): ApiFieldError | null => {
  if (!name.trim()) {
    return {
      field: 'name',
      code: 'NAME_REQUIRED',
      message: 'Full name is required.',
    };
  }

  const emailValidation = validateSignUpEmail(email);
  if (!emailValidation.isValid) {
    return {
      field: 'email',
      code: emailValidation.code,
      message: emailValidation.message,
    };
  }

  if (!password) {
    return {
      field: 'password',
      code: 'PASSWORD_REQUIRED',
      message: 'Password is required.',
    };
  }

  if (password.length < 8) {
    return {
      field: 'password',
      code: 'PASSWORD_TOO_SHORT',
      message: 'Password must be at least 8 characters long.',
    };
  }

  return null;
};

const mapSupabaseAuthError = (message: string): AuthApiError => {
  const normalized = message.toLowerCase();

  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return new AuthApiError({
      message: 'This email is already registered. Try signing in or use a different email address.',
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
      field: 'email',
    });
  }

  if (normalized.includes('invalid login credentials') || normalized.includes('invalid credentials')) {
    return new AuthApiError({
      message: 'Email or password is incorrect.',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      field: 'email',
    });
  }

  if (normalized.includes('email not confirmed') || normalized.includes('not confirmed')) {
    return new AuthApiError({
      message: 'Email is not verified yet. Check your inbox and verify the account before signing in.',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      field: 'email',
    });
  }

  if (normalized.includes('signup is disabled') || normalized.includes('signups not allowed')) {
    return new AuthApiError({
      message: 'Email/password signup is disabled in Supabase Auth settings.',
      status: 403,
      code: 'UNKNOWN_ERROR',
    });
  }

  if (normalized.includes('database error saving new user')) {
    return new AuthApiError({
      message:
        'Supabase failed while creating the user record. Check auth triggers/functions in your Supabase SQL setup.',
      status: 500,
      code: 'UNKNOWN_ERROR',
    });
  }

  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return new AuthApiError({
      message: 'Too many authentication attempts. Please wait a moment and try again.',
      status: 429,
      code: 'UNKNOWN_ERROR',
    });
  }

  return new AuthApiError({
    message: `Authentication failed: ${message}`,
    status: 500,
    code: 'UNKNOWN_ERROR',
  });
};

type ActivityLogInput = {
  userId: string;
  email: string;
  type: 'sign_up' | 'sign_in';
  context: Record<string, unknown>;
};

const logUserActivity = async ({ userId, email, type, context }: ActivityLogInput) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('activity_logs').insert({
    user_id: userId,
    email,
    activity_type: type,
    activity_context: context,
  });

  if (error) {
    throw error;
  }
};

const getAuthClient = () => {
  if (!isSupabaseConfigured()) {
    throw new AuthApiError({
      message:
        'Supabase is not configured. Add VITE_SUPABASE_PROJECT_ID (or VITE_SUPABASE_URL) and VITE_SUPABASE_ANON_KEY in .env.',
      status: 500,
      code: 'CONFIGURATION_ERROR',
    });
  }

  return getSupabaseClient();
};

export const signUpUser = async ({ name, email, password }: SignUpPayload): Promise<SignUpSuccessResponse> => {
  const supabase = getAuthClient();

  const fieldError = validatePayload({ name, email, password });
  if (fieldError) {
    throw new AuthApiError({
      message: fieldError.message,
      status: 400,
      code: fieldError.code,
      field: fieldError.field,
    });
  }

  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        full_name: name.trim(),
      },
    },
  });

  if (error) {
    throw mapSupabaseAuthError(error.message);
  }

  if (!data.user) {
    throw new AuthApiError({
      message: 'Unable to create account right now. Please try again in a moment.',
      status: 500,
      code: 'UNKNOWN_ERROR',
    });
  }

  const fullName = (data.user.user_metadata.full_name as string | undefined)?.trim() || name.trim();

  return {
    status: 201,
    message: data.session
      ? 'Account created successfully.'
      : 'Account created. Verify your email before signing in.',
    user: {
      name: fullName,
      email: normalizedEmail,
    },
    emailConfirmationRequired: !Boolean(data.session),
  };
};

export const signInUser = async ({ email, password }: SignInPayload): Promise<SignInSuccessResponse> => {
  const supabase = getAuthClient();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new AuthApiError({
      message: 'Email address is required.',
      status: 400,
      code: 'EMAIL_REQUIRED',
      field: 'email',
    });
  }

  if (!password) {
    throw new AuthApiError({
      message: 'Password is required.',
      status: 400,
      code: 'PASSWORD_REQUIRED',
      field: 'password',
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw mapSupabaseAuthError(error.message);
  }

  if (!data.user) {
    throw new AuthApiError({
      message: 'Unable to sign in right now. Please try again in a moment.',
      status: 500,
      code: 'UNKNOWN_ERROR',
    });
  }

  try {
    await logUserActivity({
      userId: data.user.id,
      email: normalizedEmail,
      type: 'sign_in',
      context: {
        source: 'web_sign_in',
      },
    });
  } catch (activityError) {
    console.error('Failed to log sign-in activity:', activityError);
  }

  return {
    status: 200,
    message: 'Signed in successfully.',
    user: {
      id: data.user.id,
      email: normalizedEmail,
      name: (data.user.user_metadata.full_name as string | undefined)?.trim() || '',
    },
  };
};
