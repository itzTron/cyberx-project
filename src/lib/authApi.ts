import { normalizeEmail, validateSignUpEmail } from '@/lib/emailValidation';

export type SignUpPayload = {
  name: string;
  email: string;
  password: string;
};

export type ApiFieldErrorCode =
  | 'EMAIL_REQUIRED'
  | 'INVALID_EMAIL_FORMAT'
  | 'UNSUPPORTED_EMAIL_DOMAIN'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'NAME_REQUIRED'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_TOO_SHORT';

export type ApiFieldError = {
  field: 'name' | 'email' | 'password';
  code: ApiFieldErrorCode;
  message: string;
};

export class AuthApiError extends Error {
  status: number;
  code: ApiFieldErrorCode | 'UNKNOWN_ERROR';
  field?: ApiFieldError['field'];

  constructor({
    message,
    status,
    code,
    field,
  }: {
    message: string;
    status: number;
    code: ApiFieldErrorCode | 'UNKNOWN_ERROR';
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
  apiContract: {
    endpoint: 'POST /api/auth/signup';
    notes: string[];
  };
};

const requestDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const registeredEmails = new Set<string>(['admin@gmail.com', 'demo@outlook.com']);

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

export const signUpUser = async ({ name, email, password }: SignUpPayload): Promise<SignUpSuccessResponse> => {
  await requestDelay(600);

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

  if (registeredEmails.has(normalizedEmail)) {
    throw new AuthApiError({
      message: 'This email is already registered. Try signing in or use a different email address.',
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
      field: 'email',
    });
  }

  registeredEmails.add(normalizedEmail);

  return {
    status: 201,
    message: 'Account created successfully. Backend validation rules were satisfied.',
    user: {
      name: name.trim(),
      email: normalizedEmail,
    },
    apiContract: {
      endpoint: 'POST /api/auth/signup',
      notes: [
        'Backend must normalize email to lowercase and trim whitespace before validation.',
        'Backend must reject unsupported domains with HTTP 400.',
        'Backend must reject duplicate normalized emails with HTTP 409.',
        'Database should enforce a unique index on the normalized email column.',
      ],
    },
  };
};
