import { Component, ReactNode } from 'react';
import { normalizeError } from '@shared/apperror';
import { ErrorBanner } from './ErrorBanner';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: ReturnType<typeof normalizeError> | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: normalizeError(error, 'EngineError') };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="app-fallback">
          <ErrorBanner
            error={this.state.error}
            heading="Something went wrong."
            onDismiss={() => this.setState({ error: null })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
