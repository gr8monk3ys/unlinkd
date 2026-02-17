import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import './a11y.css';

window.addEventListener('unhandledrejection', (event) => {
  if (import.meta.env.DEV) {
    console.error('Unhandled promise rejection:', event.reason);
  }
});

window.addEventListener('error', (event) => {
  if (import.meta.env.DEV) {
    console.error('Unhandled error:', event.error);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
