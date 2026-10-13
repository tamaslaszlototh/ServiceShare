import { AccountInfo, AppError, EditOperation, ErrorCode, PrivacyStatus, PublishEvent, PublishRequest } from '@shared/types';
import { LONG_VIDEO_SECONDS, TOO_LONG_MESSAGE } from '@shared/limits';
import { ErrorAction, errorAction } from './errors';

export { LONG_VIDEO_SECONDS };

export const PUBLISH_TITLE_MAX = 100;
export const PUBLISH_DESCRIPTION_MAX = 5000;
export const PUBLISH_TAGS_MAX_CHARS = 500;

export const PRIVACY_OPTIONS: { value: PrivacyStatus; label: string }[] = [
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
];

export interface PublishForm {
  title: string;
  description: string;
  tags: string;
  privacyStatus: PrivacyStatus;
  coverImagePath: string | null;
  thumbnailPath: string | null;
}

export function defaultTitle(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  const stem = base.replace(/\.[^./\\]+$/, '');
  return stem || base;
}

export function titleMissing(title: string): boolean {
  return title.trim().length === 0;
}

export function canPublish(title: string, signedIn: boolean): boolean {
  return signedIn && !titleMissing(title);
}

export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function tagsCharCount(tags: string[]): number {
  return tags.join(',').length;
}

export function clampTags(tags: string[], max = PUBLISH_TAGS_MAX_CHARS): string[] {
  const kept: string[] = [];
  for (const tag of tags) {
    if (tagsCharCount([...kept, tag]) > max) {
      break;
    }
    kept.push(tag);
  }
  return kept;
}

export function accountLabel(account: AccountInfo | null | undefined): string {
  return account?.channelTitle || account?.email || 'Signed in';
}

export function editedDuration(sourceDuration: number, editList: EditOperation[]): number {
  let duration = sourceDuration;
  for (const op of editList) {
    if (op.kind === 'trim') {
      duration = Math.max(0, op.end - op.start);
    } else if (op.kind === 'cutRegion') {
      duration = Math.max(0, duration - (op.end - op.start));
    } else if (op.kind === 'concatenate') {
      duration += op.duration;
    }
  }
  return duration;
}

export function durationWarning(durationSeconds: number): AppError | null {
  if (durationSeconds > LONG_VIDEO_SECONDS) {
    return { code: 'TooLong', message: TOO_LONG_MESSAGE };
  }
  return null;
}

export function stageLabel(event: PublishEvent): string {
  if ('kind' in event) {
    return `Publish failed (${event.error.code})`;
  }
  switch (event.stage) {
    case 'cover':
      return 'Composing cover…';
    case 'render':
      return 'Rendering video…';
    case 'upload':
      return `Uploading… ${Math.round(event.percent)}%`;
    case 'done':
      return 'Published to YouTube';
    case 'cancelled':
      return 'Publish cancelled';
  }
}

export function uploadPercent(event: PublishEvent): number | null {
  return 'stage' in event && event.stage === 'upload' ? event.percent : null;
}

export function publishErrorAction(code: ErrorCode): ErrorAction {
  return errorAction(code) ?? { kind: 'retry', label: 'Retry' };
}

export function toPublishRequest(form: PublishForm): PublishRequest {
  const tags = clampTags(parseTags(form.tags));
  return {
    title: form.title.trim().slice(0, PUBLISH_TITLE_MAX),
    description: form.description.trim() || undefined,
    tags: tags.length > 0 ? tags : undefined,
    privacyStatus: form.privacyStatus,
    coverImagePath: form.coverImagePath ?? undefined,
    thumbnailPath: form.thumbnailPath ?? undefined,
  };
}
