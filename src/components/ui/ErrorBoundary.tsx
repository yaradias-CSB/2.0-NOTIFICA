import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    (this as any).setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if ((this as any).state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-red-600" size={32} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-2">Ops! Algo deu errado</h1>
            <p className="text-slate-500 mb-8 font-medium">
              Ocorreu um erro inesperado no sistema. Nossa equipe técnica já foi notificada.
            </p>
            
            <div className="bg-slate-50 rounded-xl p-4 mb-8 text-left overflow-hidden">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-2">Detalhes do Erro</p>
              <p className="text-xs font-mono text-red-500 break-all">
                {(this as any).state.error?.message || 'Erro desconhecido'}
              </p>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full bg-slate-900 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={20} /> Recarregar Sistema
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default ErrorBoundary;
