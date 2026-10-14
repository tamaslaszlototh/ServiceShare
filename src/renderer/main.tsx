import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './errors/ErrorBoundary';
import { ErrorPreview } from './errors/ErrorPreview';
import { GlobalErrorBanner } from './errors/GlobalErrorBanner';
import { createErrorBus, installGlobalErrorHandlers } from './errors/globalErrors';
import { LocaleProvider } from './i18n/LocaleContext';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  const bus = createErrorBus();
  installGlobalErrorHandlers(window, bus);
  createRoot(root).render(
    <React.StrictMode>
      <LocaleProvider>
        <GlobalErrorBanner bus={bus} />
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <ErrorPreview />
      </LocaleProvider>
    </React.StrictMode>,
  );
}
