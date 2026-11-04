import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Intercept and suppress external browser extension errors (e.g. MetaMask / Web3 injected wallet content scripts)
if (typeof window !== 'undefined') {
  const isExtensionError = (err?: any) => {
    if (!err) return false;
    const str = (typeof err === 'string' ? err : `${err.message || ''} ${err.stack || ''}`).toLowerCase();
    return (
      str.includes('metamask') ||
      str.includes('failed to connect to metamask') ||
      str.includes('ethereum') ||
      str.includes('solana') ||
      str.includes('phantom') ||
      str.includes('web3') ||
      str.includes('coinbase')
    );
  };

  window.addEventListener(
    'error',
    (event) => {
      if (isExtensionError(event.message) || isExtensionError(event.error)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (isExtensionError(event.reason)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );
}

// One address for everyone: logins and browser state are per-domain, so the old AI Studio
// address forwards to itbody.dsoom.com. A Kakao login that already started on the old
// address finishes there first (its callback is registered for that origin).
const CANONICAL_ORIGIN = 'https://itbody.dsoom.com';
const host = typeof window !== 'undefined' ? window.location.hostname : '';
const shouldMove =
  (host.endsWith('.ai.studio') || host.endsWith('.run.app')) &&
  !new URLSearchParams(window.location.search).has('kakao_callback');
if (shouldMove) {
  window.location.replace(CANONICAL_ORIGIN + window.location.pathname + window.location.search + window.location.hash);
}

if (!shouldMove) createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

