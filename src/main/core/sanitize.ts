export function sanitizeText(text: string): string {
  return text.trim().split('\n').slice(-5).join('\n').slice(0, 1000);
}
