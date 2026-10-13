import { useEffect, useState } from 'react';
import { AppError } from '@shared/types';
import { ErrorBus } from './globalErrors';
import { ErrorBanner } from './ErrorBanner';

export function GlobalErrorBanner({ bus }: { bus: ErrorBus }) {
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => bus.subscribe(setError), [bus]);

  if (!error) {
    return null;
  }

  return (
    <div className="global-error">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
