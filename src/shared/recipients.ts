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

/** The identity of an address: two addresses with the same key are the same recipient. */
export function recipientKey(address: string): string {
  return address.trim().toLowerCase();
}

export function normalizeRecipients(recipients: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of recipients) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const key = recipientKey(trimmed);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

export interface RecipientClassification {
  valid: string[];
  invalid: string[];
}

export function classifyRecipients(recipients: string[]): RecipientClassification {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const address of normalizeRecipients(recipients)) {
    if (isRecipientValid(address)) {
      valid.push(address);
    } else {
      invalid.push(address);
    }
  }
  return { valid, invalid };
}

export function validateRecipients(recipients: string[]): string[] {
  return classifyRecipients(recipients).valid;
}
