import { Translator } from '@shared/i18n';

export function channelLabel(channels: number, t: Translator): string {
  if (channels === 1) {
    return t('meta.channel.mono');
  }
  if (channels === 2) {
    return t('meta.channel.stereo');
  }
  return t('meta.channel.other', { count: channels });
}
