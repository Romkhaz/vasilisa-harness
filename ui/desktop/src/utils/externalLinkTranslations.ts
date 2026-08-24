export type ExternalLinkLabels = {
  title: string;
  message: string;
  detail: string;
  open: string;
  cancel: string;
};

/**
 * Василиса поставляется на русском, английский оставлен запасным вариантом —
 * набор языков здесь тот же, что и в каталогах переводов интерфейса
 * (см. src/i18n/index.ts).
 */
const labelsByLocale: Record<string, ExternalLinkLabels> = {
  ru: {
    title: 'Открыть внешнюю ссылку',
    message: 'Открыть ссылку {protocol}?',
    detail: 'Будет открыто: {href}',
    open: 'Открыть',
    cancel: 'Отмена',
  },
  en: {
    title: 'Open External Link',
    message: 'Open {protocol} link?',
    detail: 'This will open: {href}',
    open: 'Open',
    cancel: 'Cancel',
  },
};

const selectLocale = (locale?: string): string => {
  const normalized = locale?.replace(/_/g, '-') ?? 'ru';
  if (labelsByLocale[normalized]) return normalized;

  const language = normalized.toLowerCase().split('-')[0];
  return labelsByLocale[language] ? language : 'ru';
};

export const getExternalLinkLabels = (locale?: string): ExternalLinkLabels =>
  labelsByLocale[selectLocale(locale)];
