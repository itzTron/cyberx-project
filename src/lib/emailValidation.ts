const SUPPORTED_EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'live.com'] as const;

export type SupportedEmailDomain = (typeof SUPPORTED_EMAIL_DOMAINS)[number];

export type EmailValidationCode =
  | 'EMAIL_REQUIRED'
  | 'INVALID_EMAIL_FORMAT'
  | 'UNSUPPORTED_EMAIL_DOMAIN';

export type EmailValidationResult =
  | {
      isValid: true;
      normalizedEmail: string;
      domain: SupportedEmailDomain;
      code: null;
      message: '';
    }
  | {
      isValid: false;
      normalizedEmail: string;
      domain: null;
      code: EmailValidationCode;
      message: string;
    };

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isSupportedEmailDomain = (domain: string): domain is SupportedEmailDomain =>
  SUPPORTED_EMAIL_DOMAINS.includes(domain as SupportedEmailDomain);

export const validateSignUpEmail = (email: string): EmailValidationResult => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return {
      isValid: false,
      normalizedEmail,
      domain: null,
      code: 'EMAIL_REQUIRED',
      message: 'Email address is required.',
    };
  }

  if (!EMAIL_FORMAT_REGEX.test(normalizedEmail)) {
    return {
      isValid: false,
      normalizedEmail,
      domain: null,
      code: 'INVALID_EMAIL_FORMAT',
      message: 'Enter a valid email address.',
    };
  }

  const [, domain = ''] = normalizedEmail.split('@');

  if (!isSupportedEmailDomain(domain)) {
    return {
      isValid: false,
      normalizedEmail,
      domain: null,
      code: 'UNSUPPORTED_EMAIL_DOMAIN',
      message: 'Use a Gmail or Outlook email address ending in gmail.com, outlook.com, hotmail.com, or live.com.',
    };
  }

  return {
    isValid: true,
    normalizedEmail,
    domain,
    code: null,
    message: '',
  };
};

export const getSupportedEmailDomains = () => [...SUPPORTED_EMAIL_DOMAINS];
