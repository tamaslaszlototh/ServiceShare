import { describe, it, expect } from 'vitest';
import { parseChannel } from './youtube';

describe('parseChannel', () => {
  it('reads the signed-in channel id and title', () => {
    const body = JSON.stringify({
      items: [{ id: 'UC123', snippet: { title: 'Studio' } }],
    });
    expect(parseChannel(body)).toEqual({ channelId: 'UC123', channelTitle: 'Studio' });
  });

  it('returns null when the payload has no channel', () => {
    expect(parseChannel('{"items":[]}')).toBeNull();
    expect(parseChannel('not-json')).toBeNull();
  });
});
