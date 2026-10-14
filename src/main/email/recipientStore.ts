import { isRecipientValid, normalizeRecipients, recipientKey } from '../../shared/recipients';

export const RECIPIENTS_FILE = 'email-recipients.json';

export interface RecipientStoreDeps {
  filePath: string;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
}

interface RecipientDocument {
  recipients: string[];
}

function isMissingFile(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT';
}

function parseDocument(content: string): string[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
    const { recipients } = parsed as { recipients?: unknown };
    if (!Array.isArray(recipients)) return [];
    return normalizeRecipients(recipients.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return [];
  }
}

/**
 * The saved ("always shown") email recipients, persisted as a small JSON
 * document. Addresses are kept trimmed and de-duplicated case-insensitively in
 * insertion order. Changes run one at a time so concurrent calls cannot lose
 * each other's writes.
 */
export class RecipientStore {
  private cache: string[] | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: RecipientStoreDeps) {}

  list(): Promise<string[]> {
    return this.serialize(async () => [...(await this.load())]);
  }

  remember(address: string): Promise<string[]> {
    return this.serialize(async () => {
      const current = await this.load();
      const next = normalizeRecipients([...current, address]);
      if (!isRecipientValid(address) || next.length === current.length) return [...current];
      return this.save(next);
    });
  }

  forget(address: string): Promise<string[]> {
    return this.serialize(async () => {
      const current = await this.load();
      const key = recipientKey(address);
      const next = current.filter((entry) => recipientKey(entry) !== key);
      if (next.length === current.length) return [...current];
      return this.save(next);
    });
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<string[]> {
    if (this.cache) return this.cache;
    let content: string;
    try {
      content = await this.deps.readFile(this.deps.filePath);
    } catch (e) {
      // An unreadable (not merely absent) file must not be overwritten with a
      // fresh list, or the saved recipients would be lost.
      if (!isMissingFile(e)) throw e;
      content = '';
    }
    this.cache = parseDocument(content);
    return this.cache;
  }

  private async save(recipients: string[]): Promise<string[]> {
    const document: RecipientDocument = { recipients };
    await this.deps.writeFile(this.deps.filePath, JSON.stringify(document, null, 2));
    this.cache = recipients;
    return [...recipients];
  }
}
