import en from './locales/en.json';

type TranslationKeys = string;

// Simple, lightweight, zero-dependency translation function
export const t = (key: TranslationKeys): string => {
  const parts = key.split('.');
  let current: any = en;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
};

export const useTranslation = () => {
  return { t };
};

export default { t, useTranslation };
