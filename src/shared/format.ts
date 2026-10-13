import { Locale } from './i18n';

export function decimalSeparator(locale: Locale): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  return parts.find((part) => part.type === 'decimal')?.value ?? '.';
}

export function formatDecimal(value: number, locale: Locale, fractionDigits: number): string {
  const fixed = value.toFixed(fractionDigits);
  if (fractionDigits <= 0) {
    return fixed;
  }
  const [whole, fraction] = fixed.split('.');
  return `${whole}${decimalSeparator(locale)}${fraction}`;
}
