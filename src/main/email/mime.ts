export interface MimeMessage {
  from?: string;
  to: string[];
  subject: string;
  body: string;
}

const NON_ASCII = /[^\x00-\x7F]/;

function headerValue(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  if (NON_ASCII.test(clean)) {
    return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
  }
  return clean;
}

export function buildMime(message: MimeMessage): string {
  const headers: string[] = [];
  if (message.from) {
    headers.push(`From: ${headerValue(message.from)}`);
  }
  headers.push(`To: ${message.to.map(headerValue).join(', ')}`);
  headers.push(`Subject: ${headerValue(message.subject)}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset=utf-8');
  headers.push('Content-Transfer-Encoding: 8bit');
  const body = message.body.replace(/\r?\n/g, '\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

export function base64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
