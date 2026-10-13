import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { GlobalErrorBanner } from './GlobalErrorBanner';
import { createErrorBus, installGlobalErrorHandlers } from './globalErrors';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  const bus = createErrorBus();
  installGlobalErrorHandlers(window, bus);
  createRoot(root).render(
    <React.StrictMode>
      <GlobalErrorBanner bus={bus} />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
