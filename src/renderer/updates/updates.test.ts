import { describe, it, expect } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '@shared/i18n';
import { updateView } from './updates';

const tFor = (locale: Locale) => (key: TranslationKey, params?: TranslationParams) =>
  translate(locale, key, params);
const en = tFor('en');

const updateError = { code: 'UpdateError' as const, message: 'The app could not be updated' };

describe('updateView', () => {
  it('shows nothing while idle', () => {
    expect(updateView({ state: 'idle' }, en)).toBeNull();
  });

  it('stays silent about launch checks that find nothing or fail', () => {
    expect(updateView({ state: 'checking', manual: false }, en)).toBeNull();
    expect(updateView({ state: 'upToDate', manual: false, version: '1.0.0' }, en)).toBeNull();
    expect(updateView({ state: 'unsupported', manual: false }, en)).toBeNull();
    expect(updateView({ state: 'error', manual: false, error: updateError }, en)).toBeNull();
  });

  it("tells a manual check that the app is up to date", () => {
    expect(updateView({ state: 'upToDate', manual: true, version: '1.0.0' }, en)).toEqual({
      kind: 'notice',
      text: "You're up to date (1.0.0)",
    });
  });

  it('explains that development builds cannot update', () => {
    expect(updateView({ state: 'unsupported', manual: true }, en)).toMatchObject({ kind: 'notice' });
  });

  it('shows download progress for any update found', () => {
    expect(updateView({ state: 'downloading', version: '1.1.0', percent: 42 }, en)).toEqual({
      kind: 'progress',
      text: 'Downloading update 1.1.0… 42%',
      percent: 42,
    });
  });

  it('offers a restart once the update is staged', () => {
    expect(updateView({ state: 'ready', version: '1.1.0' }, en)).toEqual({
      kind: 'ready',
      text: 'Update 1.1.0 is ready',
      action: 'Restart to update',
    });
  });

  it('surfaces errors from a manual check', () => {
    expect(updateView({ state: 'error', manual: true, error: updateError }, en)).toEqual({
      kind: 'error',
      error: updateError,
    });
  });

  it('speaks Hungarian by default', () => {
    expect(updateView({ state: 'ready', version: '1.1.0' }, tFor('hu'))).toMatchObject({
      action: 'Újraindítás a frissítéshez',
    });
  });
});
