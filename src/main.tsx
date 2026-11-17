import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import App from './App.tsx';
import './index.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { EcosystemProvider } from './contexts/EcosystemContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { LoginPage } from './components/LoginPage';
import ErrorBoundary from './components/ui/ErrorBoundary';

function AuthGate() {
  const { session, user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center gap-3 text-white">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-300">
          Verificando sessão...
        </span>
      </div>
    );
  }

  if (!session || !user || !profile) {
    return <LoginPage />;
  }

  return (
    <DataProvider>
      <EcosystemProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </EcosystemProvider>
    </DataProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
