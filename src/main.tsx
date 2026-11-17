import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App.tsx';
import './index.css';
import { DataProvider } from './contexts/DataContext';
import { EcosystemProvider } from './contexts/EcosystemContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ErrorBoundary from './components/ui/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <DataProvider>
        <EcosystemProvider>
          <NotificationProvider>
            <App />
            <Toaster position="top-right" richColors />
          </NotificationProvider>
        </EcosystemProvider>
      </DataProvider>
    </ErrorBoundary>
  </StrictMode>,
);
