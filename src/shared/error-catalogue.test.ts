import { describe, it, expect } from 'vitest';
import { ERROR_CATALOGUE, ERROR_CODES } from './error-catalogue';
import { dictionaries } from './i18n';

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('error catalogue', () => {
  it('carries the same interpolation parameters in both languages', () => {
    for (const code of ERROR_CODES) {
      const spec = ERROR_CATALOGUE[code];
      expect(placeholders(spec.hu), code).toEqual(placeholders(spec.en));
    }
  });

  it('declares exactly the parameters its wording uses', () => {
    for (const code of ERROR_CODES) {
      const spec = ERROR_CATALOGUE[code];
      expect(spec.params ?? [], code).toEqual(placeholders(spec.en));
    }
  });

  it('generates a non-empty translation for every code in every locale', () => {
    for (const code of ERROR_CODES) {
      const spec = ERROR_CATALOGUE[code];
      expect(dictionaries.en[`error.code.${code}`]).toBe(spec.en);
      expect(dictionaries.hu[`error.code.${code}`]).toBe(spec.hu);
    }
  });
});
