const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

export function isRecipientValid(address: string): boolean {
  return EMAIL_PATTERN.test(address.trim());
}

export function parseRecipients(input: string): string[] {
  if (input.trim().length === 0) {
    return [];
  }
  return input
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeRecipients(recipients: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of recipients) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

export function validateRecipients(recipients: string[]): string[] {
  return normalizeRecipients(recipients).filter((entry) => isRecipientValid(entry));
}
