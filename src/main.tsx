import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
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
          </NotificationProvider>
        </EcosystemProvider>
      </DataProvider>
    </ErrorBoundary>
  </StrictMode>,
);
