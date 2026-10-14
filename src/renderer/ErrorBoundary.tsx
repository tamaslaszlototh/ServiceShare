import { Component, ReactNode } from 'react';
import { normalizeError } from '@shared/apperror';
import { ErrorBanner } from './ErrorBanner';
import { useT } from './LocaleContext';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: ReturnType<typeof normalizeError> | null;
}

function BoundaryError({ error, onDismiss }: { error: ReturnType<typeof normalizeError>; onDismiss: () => void }) {
  const t = useT();
  return <ErrorBanner error={error} heading={t('error.boundary')} onDismiss={onDismiss} />;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: normalizeError(error, 'EngineError') };
  }

  render(): ReactNode {
    if (this.state.error) {
      const error = this.state.error;
      return (
        <div className="app-fallback">
          <BoundaryError error={error} onDismiss={() => this.setState({ error: null })} />
        </div>
      );
    }
    return this.props.children;
  }
}
