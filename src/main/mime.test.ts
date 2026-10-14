import { describe, it, expect } from 'vitest';
import { base64UrlEncode, buildMime } from './mime';

function decodeBase64Url(value: string): string {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

describe('buildMime', () => {
  it('produces RFC 822 headers with CRLF line endings and a UTF-8 plain-text body', () => {
    const mime = buildMime({
      from: 'me@example.com',
      to: ['you@example.com'],
      subject: 'New video',
      body: 'Hello!\n\nhttps://youtu.be/abc',
    });

    expect(mime).toContain('From: me@example.com\r\n');
    expect(mime).toContain('To: you@example.com\r\n');
    expect(mime).toContain('Subject: New video\r\n');
    expect(mime).toContain('MIME-Version: 1.0\r\n');
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8\r\n');
    expect(mime.endsWith('\r\n\r\nHello!\r\n\r\nhttps://youtu.be/abc')).toBe(true);
  });

  it('joins several recipients with a comma', () => {
    const mime = buildMime({ to: ['a@example.com', 'b@example.com'], subject: 's', body: 'b' });
    expect(mime).toContain('To: a@example.com, b@example.com\r\n');
  });

  it('omits the From header when no sender address is known', () => {
    const mime = buildMime({ to: ['a@example.com'], subject: 's', body: 'b' });
    expect(mime).not.toContain('From:');
  });

  it('normalises body line endings to CRLF', () => {
    const mime = buildMime({ to: ['a@example.com'], subject: 's', body: 'one\ntwo\r\nthree' });
    expect(mime.endsWith('\r\n\r\none\r\ntwo\r\nthree')).toBe(true);
  });

  it('encodes a non-ASCII subject as an RFC 2047 word', () => {
    const mime = buildMime({ to: ['a@example.com'], subject: 'Árvíztűrő', body: 'b' });
    const subjectLine = mime.split('\r\n').find((line) => line.startsWith('Subject: '));
    const word = subjectLine?.slice('Subject: '.length) ?? '';
    expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?=$/);
    expect(decodeBase64Url(word.slice('=?UTF-8?B?'.length, -2))).toBe('Árvíztűrő');
  });

  it('keeps an ASCII subject verbatim', () => {
    const mime = buildMime({ to: ['a@example.com'], subject: 'Plain subject', body: 'b' });
    expect(mime).toContain('Subject: Plain subject\r\n');
  });

  it('strips line breaks from header values so they cannot inject headers', () => {
    const mime = buildMime({
      to: ['a@example.com'],
      subject: 'hi\r\nBcc: evil@example.com',
      body: 'b',
    });
    expect(mime.split('\r\n').some((line) => line.startsWith('Bcc:'))).toBe(false);
  });
});

describe('base64UrlEncode', () => {
  it('emits URL-safe base64 without padding', () => {
    expect(base64UrlEncode('Meh')).not.toMatch(/[+/=]/);
    expect(base64UrlEncode('subjects??')).not.toMatch(/[+/=]/);
  });

  it('round-trips the built message back to its exact UTF-8 text', () => {
    const mime = buildMime({
      from: 'me@example.com',
      to: ['you@example.com'],
      subject: 'Árvíztűrő',
      body: 'Hello! Üdv!\n\nhttps://youtu.be/abc',
    });
    expect(decodeBase64Url(base64UrlEncode(mime))).toBe(mime);
  });
});
