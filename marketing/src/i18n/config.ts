import { pl } from "./locales/pl";

export const defaultLocale = "pl" as const;
export const locales = { pl } as const;
export type Locale = keyof typeof locales;

export function getMessages(locale: Locale = defaultLocale) {
  return locales[locale];
}
