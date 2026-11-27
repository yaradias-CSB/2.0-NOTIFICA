/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useContext, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Database, 
  FileText, 
  Info, 
  Users, 
  Menu, 
  X, 
  ArrowRight,
  Zap,
  Shield,
  BarChart3,
  Target,
  Wand2,
  Cpu,
  Building2,
  ListChecks,
  Settings,
  User as UserIcon,
  Home,
  Mail,
  Phone,
  Loader2,
  Plus,
  ChevronUp,
  ClipboardCheck,
  FileWarning,
  Bell,
  ShieldCheck,
  BookOpen,
  ExternalLink,
  FileCheck,
  Search,
  RefreshCw,
  ChevronDown,
  Globe,
  LogOut,
  KeyRound,
  Briefcase
} from 'lucide-react';

import Dashboard from './components/Dashboard';
import OpinionForm from './components/OpinionForm';
import OficioForm from './components/OficioForm';
import NotificaForm from './components/NotificaForm';
import ParecerList from './components/ParecerList';
import ControleNotificacoes from './views/ControleNotificacoes';
import { EcossistemaAdministra } from './views/EcossistemaAdministra';
import { PendenciasView } from './views/PendenciasView';
import { SolicitacoesVistoriaView } from './views/SolicitacoesVistoriaView';
import { MesaVirtualView } from './views/MesaVirtualView';
import GlobalSearchBar from './components/GlobalSearchBar';
import { canUserEditDraft } from './lib/documentPermissions';
import { DataContext } from './contexts/DataContext';
import { EcosystemContext } from './contexts/EcosystemContext';
import { useNotifications } from './contexts/NotificationContext';
import { useAuth } from './contexts/AuthContext';
import { UserManagement } from './components/UserManagement';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import {
  AuditLogs,
  AppViewId,
  isAuditMenuVisible,
  resolveAuthorizedAppView,
} from './components/AuditLogs';
import { ParecerData, OficioData } from './types';
import { AppDocument } from './contexts/DataContext';

type ExtendedViewId = AppViewId | 'solicitacoes_vistoria';

// Main App Component
const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ExtendedViewId>('dashboard');
  const [editingDocument, setEditingDocument] = useState<AppDocument | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isSidebarManualCollapsed, setIsSidebarManualCollapsed] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [returnView, setReturnView] = useState<'dashboard' | 'list' | 'controle_notificacoes' | 'mesa_virtual'>('dashboard');

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [activeInfo, setActiveInfo] = useState<string | null>(null);
  
  const { session, user, profile, role, isAdmin, canEdit, signOut } = useAuth();
  const hasSession = Boolean(session && user && profile);
  const showAuditMenu = isAuditMenuVisible({ hasSession, isAdmin });
  const effectiveView: ExtendedViewId =
    currentView === 'solicitacoes_vistoria'
      ? (hasSession ? 'solicitacoes_vistoria' : 'dashboard')
      : resolveAuthorizedAppView(currentView, { hasSession, isAdmin });
  const data = useContext(DataContext);
  const { pendingIncomingCount } = useContext(EcosystemContext);
  const notifications = useNotifications ? useNotifications() : { pendingCount: 0, importantUpdate: false };

  const refreshData = data?.refreshData;
  const { pendingCount, importantUpdate } = notifications;

  // Global Loading Overlay for Data Refresh
  const isDataLoading = data?.loading && currentView !== 'dashboard';

  // Scroll to top on view change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView]);

  // Dynamic Title Logic
  useEffect(() => {
    const baseTitle = 'Notifica CSB - SEMA/MT';
    let interval: NodeJS.Timeout;

    if (pendingCount > 0 || importantUpdate) {
      let showNotification = true;
      interval = setInterval(() => {
        if (showNotification) {
          document.title = `(${pendingCount}) Novas Pendências!`;
        } else {
          document.title = baseTitle;
        }
        showNotification = !showNotification;
      }, 3000); // Alternate every 3 seconds
    } else {
      document.title = baseTitle;
    }

    return () => {
      if (interval) clearInterval(interval);
      document.title = baseTitle;
    };
  }, [pendingCount, importantUpdate]);

  useEffect(() => {
    if ((currentView === 'users' || currentView === 'audit') && (!hasSession || !isAdmin)) {
      setCurrentView('dashboard');
    }
  }, [currentView, hasSession, isAdmin]);

  const isSidebarCollapsed = (effectiveView === 'form' || effectiveView === 'oficio' || effectiveView === 'notificacao') || isSidebarManualCollapsed;
  
  const currentActor = {
    userId: user?.id,
    perfilId: profile?.id,
    name: profile?.nome,
    email: user?.email,
    canEdit,
  };

  const handleNavigate = (view: ExtendedViewId, doc: AppDocument | null = null, viewOnly: boolean = false) => {
    if ((view === 'users' || view === 'audit') && (!hasSession || !isAdmin)) {
      setCurrentView('dashboard');
      setIsMobileMenuOpen(false);
      setIsQuickCreateOpen(false);
      return;
    }
    if (!canEdit && (view === 'form' || view === 'oficio' || view === 'notificacao') && !doc) {
      setCurrentView('dashboard');
      setIsMobileMenuOpen(false);
      setIsQuickCreateOpen(false);
      return;
    }
    const docReadOnly = doc ? !canUserEditDraft(doc, currentActor) : false;
    setEditingDocument(doc);
    setIsViewOnly(viewOnly || !canEdit || docReadOnly);
    setCurrentView(view);
    setIsMobileMenuOpen(false);
    setIsQuickCreateOpen(false);
  };

  const handleOpenDocumentFromSearch = (doc: AppDocument, viewOnly: boolean = false) => {
    const docReadOnly = !canUserEditDraft(doc, currentActor);
    const effectiveViewOnly = viewOnly || !canEdit || docReadOnly;
    const tipo = (doc as any).tipo_documento;
    if (tipo === 'Notificação') {
      setReturnView(
        currentView === 'controle_notificacoes'
          ? 'controle_notificacoes'
          : currentView === 'mesa_virtual'
          ? 'mesa_virtual'
          : 'list'
      );
      handleNavigate('notificacao', doc, effectiveViewOnly);
    } else if (tipo?.includes('Ofício') || tipo?.includes('Oficio')) {
      handleNavigate('oficio', doc as any, effectiveViewOnly);
    } else {
      handleNavigate('form', doc as any, effectiveViewOnly);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col md:flex-row bg-slate-50 font-sans text-slate-900 overflow-x-clip">
      
      {/* Global Loading Overlay */}
      {isDataLoading && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-[9999] flex items-center justify-center pointer-events-none">
          <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-200 flex items-center gap-3 animate-in zoom-in duration-300">
            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            <span className="text-sm font-bold text-slate-700 uppercase tracking-widest">Atualizando Dados...</span>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <header className="md:hidden bg-slate-900 text-white px-3.5 h-14 flex items-center justify-between sticky top-0 z-[60] shadow-xl border-b border-slate-800">
         <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-white p-1 rounded-lg overflow-hidden flex items-center justify-center w-9 h-9 shadow-lg shrink-0">
                <img src="https://lh3.googleusercontent.com/d/11OtFjZyub-hYsCvNr8N88CHVtcGM1QKU" alt="Logo" className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-black text-sm tracking-tighter leading-none truncate"><span className="text-emerald-500">Notifica</span> CSB</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/90 leading-tight mt-0.5 truncate">SEMA/MT • CSB</span>
            </div>
         </div>
         <div className="flex items-center gap-1.5 shrink-0">
           {canEdit && (
             <button 
               type="button"
               onClick={() => handleNavigate('form')}
               className="px-2.5 min-h-[38px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black flex items-center gap-1 transition-all active:scale-95"
               aria-label="Novo Parecer"
             >
               <Plus size={14} />
               <span>Novo</span>
             </button>
           )}
           <button 
             type="button"
             onClick={() => {
               const searchInput = document.querySelector('input[placeholder*="Buscar"]') as HTMLInputElement;
               searchInput?.focus();
               searchInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
             }} 
             className="min-w-[40px] min-h-[40px] flex items-center justify-center bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-all active:scale-95 text-slate-200 hover:text-white"
             aria-label="Buscar documentos"
             title="Buscar no sistema"
           >
              <Search size={18} />
           </button>
           <button 
             type="button"
             onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
             className="min-w-[40px] min-h-[40px] flex items-center justify-center bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-all active:scale-95"
             aria-label="Toggle menu"
           >
              {isMobileMenuOpen ? <X size={20}/> : <Menu size={20}/>}
           </button>
         </div>
      </header>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[55] md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-[70] bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out shadow-2xl md:shadow-xl border-r border-slate-800 overscroll-contain
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          ${!isSidebarCollapsed ? 'w-[82vw] max-w-72 md:w-64' : 'w-[82vw] max-w-72 md:w-20'}
        `}
      >
        {/* Toggle Button (Desktop Only) */}
        <button 
          onClick={() => setIsSidebarManualCollapsed(!isSidebarManualCollapsed)}
          className="hidden md:flex absolute -right-3 top-24 w-6 h-6 bg-emerald-500 text-white rounded-full items-center justify-center shadow-lg hover:bg-emerald-600 transition-all z-[80] border border-emerald-400"
          title={isSidebarManualCollapsed ? "Expandir Menu" : "Recolher Menu"}
        >
          {isSidebarManualCollapsed ? <ArrowRight size={12} /> : <X size={12} className="rotate-45" />}
        </button>

        {!isSidebarCollapsed || isMobileMenuOpen ? (
          <>
            <div className="p-6 flex flex-col items-center gap-4 border-b border-slate-800/50 relative overflow-hidden group">
              <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors"></div>
              
              {/* Close button inside sidebar for mobile */}
              <button 
                className="md:hidden absolute top-4 right-4 text-slate-400 hover:text-white p-1 z-20"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center gap-4 relative z-10">
                <div className="bg-white p-2 rounded-2xl shadow-xl shrink-0 flex items-center justify-center w-24 h-24 group-hover:scale-105 transition-transform duration-300 border border-slate-100">
                  <img src="https://lh3.googleusercontent.com/d/11OtFjZyub-hYsCvNr8N88CHVtcGM1QKU" alt="Logo" className="w-20 h-20 object-contain" referrerPolicy="no-referrer" />
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white mb-2 animate-pulse">
                    Olá! {(() => {
                      const hour = new Date().getHours();
                      if (hour >= 5 && hour < 12) return 'Bom dia';
                      if (hour >= 12 && hour < 18) return 'Boa tarde';
                      return 'Boa noite';
                    })()}
                  </p>
                  <h1 className="font-black text-2xl tracking-tighter leading-none text-white"><span className="text-emerald-500">Notifica</span> CSB</h1>
                </div>
              </div>
              <div className="relative z-10 px-0.5 text-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500/80 drop-shadow-sm">Segurança de Barragens</span>
              </div>
            </div>

            <nav className="flex-1 py-4 px-4 space-y-1 overflow-y-auto custom-scrollbar">
              <button 
                onClick={() => handleNavigate('dashboard')}
                className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'dashboard' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
              >
                <LayoutDashboard size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                <span className="font-bold text-sm whitespace-nowrap tracking-tight">Painel de Controle</span>
              </button>

              <button 
                onClick={() => handleNavigate('mesa_virtual')}
                className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'mesa_virtual' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
              >
                <Briefcase size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'mesa_virtual' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                <span className="font-bold text-sm whitespace-nowrap tracking-tight">Mesa Virtual</span>
              </button>
              
              <button 
                onClick={() => handleNavigate('list')}
                className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'list' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
              >
                <Database size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'list' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                <span className="font-bold text-sm whitespace-nowrap tracking-tight">Banco de Dados</span>
              </button>
              
              {canEdit && (
                <>
                  <button 
                    onClick={() => handleNavigate('form')}
                    className="flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group text-slate-400 hover:bg-slate-800/50 hover:text-white"
                  >
                    <ClipboardCheck size={20} className="shrink-0 text-slate-500 group-hover:text-emerald-400 transition-transform group-hover:scale-110" />
                    <span className="font-bold text-sm whitespace-nowrap tracking-tight">Novo Parecer</span>
                  </button>

                  <button 
                    onClick={() => handleNavigate('oficio')}
                    className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'oficio' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
                  >
                    <FileWarning size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'oficio' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                    <span className="font-bold text-sm whitespace-nowrap tracking-tight">Ofício de Pendência</span>
                  </button>

                  <button 
                    onClick={() => handleNavigate('notificacao')}
                    className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'notificacao' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
                  >
                    <Bell size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'notificacao' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                    <span className="font-bold text-sm whitespace-nowrap tracking-tight">Notificação</span>
                  </button>
                </>
              )}

              <button 
                onClick={() => handleNavigate('controle_notificacoes')}
                className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'controle_notificacoes' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
              >
                <Database size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'controle_notificacoes' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                <span className="font-bold text-sm whitespace-nowrap tracking-tight">Controle de Notificações</span>
              </button>

              <button 
                onClick={() => handleNavigate('ecossistema')}
                className={`flex items-center justify-between gap-2 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'ecossistema' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Globe size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'ecossistema' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                  <span className="font-bold text-sm whitespace-nowrap tracking-tight truncate">Ecossistema CSB</span>
                </div>
                {pendingIncomingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-900 text-[10px] font-black shrink-0">
                    {pendingIncomingCount}
                  </span>
                )}
              </button>

              <button 
                onClick={() => handleNavigate('pendencias')}
                className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'pendencias' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
              >
                <ListChecks size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'pendencias' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                <span className="font-bold text-sm whitespace-nowrap tracking-tight">Pendências</span>
              </button>

              <button 
                onClick={() => handleNavigate('solicitacoes_vistoria')}
                className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'solicitacoes_vistoria' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
              >
                <FileCheck size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'solicitacoes_vistoria' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                <span className="font-bold text-sm whitespace-nowrap tracking-tight">Solicitações de Vistoria</span>
              </button>

              <div className="pt-2 pb-1 px-4">
                <div className="h-px bg-slate-800 w-full"></div>
              </div>

              <button 
                onClick={() => handleNavigate('info')}
                className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'info' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
              >
                <Info size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'info' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                <span className="font-bold text-sm whitespace-nowrap tracking-tight">Informações</span>
              </button>

              {isAdmin && (
                <button 
                  onClick={() => handleNavigate('users')}
                  className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'users' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
                >
                  <Users size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'users' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                  <span className="font-bold text-sm whitespace-nowrap tracking-tight">Usuários</span>
                </button>
              )}

              {showAuditMenu && (
                <button 
                  onClick={() => handleNavigate('audit')}
                  className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl transition-all duration-200 group ${currentView === 'audit' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
                >
                  <Shield size={20} className={`shrink-0 transition-transform group-hover:scale-110 ${currentView === 'audit' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`} />
                  <span className="font-bold text-sm whitespace-nowrap tracking-tight">Auditoria</span>
                </button>
              )}
            </nav>

            <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 space-y-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <UserIcon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{profile?.nome || user?.email}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 truncate">{role}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsChangePasswordOpen(true);
                  }}
                  className="flex items-center justify-center gap-1.5 w-full px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <KeyRound size={14} />
                  <span>Trocar senha</span>
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex items-center justify-center gap-1.5 w-full px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-600/90 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Sair</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Collapsed State for Form (Desktop Only) */
          <div className="hidden md:flex flex-col items-center py-8 gap-8 w-full">
            <div className="bg-white p-1.5 rounded-xl shadow-lg flex items-center justify-center w-12 h-12 border border-slate-100">
              <img src="https://lh3.googleusercontent.com/d/11OtFjZyub-hYsCvNr8N88CHVtcGM1QKU" alt="Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
            </div>
            
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => handleNavigate('dashboard')}
                className={`p-3 rounded-xl transition-all ${currentView === 'dashboard' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                title="Painel"
              >
                <LayoutDashboard size={24} />
              </button>
              <button 
                onClick={() => handleNavigate('mesa_virtual')}
                className={`p-3 rounded-xl transition-all ${currentView === 'mesa_virtual' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                title="Mesa Virtual"
              >
                <Briefcase size={24} />
              </button>
              <button 
                onClick={() => handleNavigate('list')}
                className={`p-3 rounded-xl transition-all ${currentView === 'list' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                title="Banco de Dados"
              >
                <Database size={24} />
              </button>
              {canEdit && (
                <>
                  <button 
                    onClick={() => handleNavigate('form')}
                    className={`p-3 rounded-xl transition-all ${currentView === 'form' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                    title="Novo Parecer"
                  >
                    <ClipboardCheck size={24} />
                  </button>
                  <button 
                    onClick={() => handleNavigate('oficio')}
                    className={`p-3 rounded-xl transition-all ${currentView === 'oficio' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                    title="Ofício de Pendência"
                  >
                    <FileWarning size={24} />
                  </button>
                  <button 
                    onClick={() => handleNavigate('notificacao')}
                    className={`p-3 rounded-xl transition-all ${currentView === 'notificacao' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                    title="Notificação"
                  >
                    <Bell size={24} />
                  </button>
                </>
              )}
              <button 
                onClick={() => handleNavigate('controle_notificacoes')}
                className={`p-3 rounded-xl transition-all ${currentView === 'controle_notificacoes' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                title="Controle de Notificações"
              >
                <Database size={24} />
              </button>
              <button 
                onClick={() => handleNavigate('ecossistema')}
                className={`relative p-3 rounded-xl transition-all ${currentView === 'ecossistema' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                title="Ecossistema CSB & Administra"
              >
                <Globe size={24} />
                {pendingIncomingCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-400" />
                )}
              </button>
              <button 
                onClick={() => handleNavigate('pendencias')}
                className={`p-3 rounded-xl transition-all ${currentView === 'pendencias' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                title="Pendências"
              >
                <ListChecks size={24} />
              </button>
              <button 
                onClick={() => handleNavigate('solicitacoes_vistoria')}
                className={`p-3 rounded-xl transition-all ${currentView === 'solicitacoes_vistoria' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                title="Solicitações de Vistoria"
              >
                <FileCheck size={24} />
              </button>

              {isAdmin && (
                <button 
                  onClick={() => handleNavigate('users')}
                  className={`p-3 rounded-xl transition-all ${currentView === 'users' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                  title="Usuários"
                >
                  <Users size={24} />
                </button>
              )}
              {showAuditMenu && (
                <button 
                  onClick={() => handleNavigate('audit')}
                  className={`p-3 rounded-xl transition-all ${currentView === 'audit' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                  title="Log de Auditoria"
                >
                  <Shield size={24} />
                </button>
              )}
            </div>

            <div className="w-8 h-px bg-slate-800"></div>

            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(true)}
              className="p-3 rounded-xl text-slate-400 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer"
              title="Trocar senha"
            >
              <KeyRound size={20} />
            </button>

            <button
              type="button"
              onClick={() => void signOut()}
              className="p-3 rounded-xl text-slate-400 hover:bg-rose-600/90 hover:text-white transition-all cursor-pointer"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main 
        className={`
          flex-1 flex flex-col min-h-screen min-h-[100dvh] transition-all duration-300
          ${!isSidebarCollapsed ? 'md:ml-64' : 'md:ml-20'}
          w-full min-w-0 overflow-x-clip
        `}
      >
        {/* System Global Header Bar */}
        <header className="relative md:sticky md:top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-6 md:px-8 py-2.5 sm:py-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 shadow-xs">
          {/* Current view indicator / Breadcrumbs */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold shadow-2xs">
                {effectiveView === 'dashboard' && <LayoutDashboard size={17} />}
                {effectiveView === 'mesa_virtual' && <Briefcase size={17} />}
                {effectiveView === 'list' && <Database size={17} />}
                {effectiveView === 'controle_notificacoes' && <Bell size={17} />}
                {effectiveView === 'form' && <ClipboardCheck size={17} />}
                {effectiveView === 'oficio' && <FileWarning size={17} />}
                {effectiveView === 'notificacao' && <Bell size={17} />}
                {effectiveView === 'info' && <Info size={17} />}
                {effectiveView === 'users' && <Users size={17} />}
                {effectiveView === 'audit' && showAuditMenu && <Shield size={17} />}
                {effectiveView === 'ecossistema' && <Globe size={17} />}
                {effectiveView === 'pendencias' && <ListChecks size={17} />}
                {effectiveView === 'solicitacoes_vistoria' && <FileCheck size={17} />}
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  SEMA/MT • CSB
                </span>
                <span className="text-sm font-black text-slate-900 tracking-tight leading-tight">
                  {effectiveView === 'dashboard' && 'Painel de Controle'}
                  {effectiveView === 'mesa_virtual' && 'Mesa Virtual CSB'}
                  {effectiveView === 'list' && 'Banco de Dados'}
                  {effectiveView === 'controle_notificacoes' && 'Controle de Notificações'}
                  {effectiveView === 'form' && (isViewOnly ? 'Visualizar Parecer Técnico' : 'Parecer Técnico')}
                  {effectiveView === 'oficio' && (isViewOnly ? 'Visualizar Ofício de Pendências' : 'Ofício de Pendências')}
                  {effectiveView === 'notificacao' && (isViewOnly ? 'Visualizar Notificação' : 'Formulário de Notificação')}
                  {effectiveView === 'ecossistema' && 'Ecossistema & Administra'}
                  {effectiveView === 'pendencias' && 'Módulo de Pendências'}
                  {effectiveView === 'solicitacoes_vistoria' && 'Solicitações de Vistoria'}
                  {effectiveView === 'info' && 'Informações do Sistema'}
                  {effectiveView === 'users' && 'Gestão de Usuários'}
                  {effectiveView === 'audit' && showAuditMenu && 'Auditoria de Ações'}
                </span>
              </div>
            </div>

            {/* Quick action buttons on mobile */}
            <div className="flex md:hidden items-center gap-1.5">
              <button
                onClick={() => refreshData?.()}
                className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-xl transition-colors"
                title="Atualizar Dados"
              >
                <RefreshCw size={16} className={data?.loading ? 'animate-spin text-emerald-600' : ''} />
              </button>
            </div>
          </div>

          {/* Central Global Search Bar */}
          <div className="flex-1 max-w-2xl w-full mx-auto md:mx-4 flex items-center">
            <GlobalSearchBar 
              onSelectDocument={handleOpenDocumentFromSearch} 
              onNavigateView={handleNavigate}
            />
          </div>

          {/* Right side controls (Desktop) */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => refreshData?.()}
              disabled={data?.loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:text-emerald-700 bg-slate-100/70 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition-colors shadow-2xs cursor-pointer"
              title="Recarregar registros do banco de dados"
            >
              <RefreshCw size={14} className={data?.loading ? 'animate-spin text-emerald-600' : ''} />
              <span className="hidden lg:inline">{data?.loading ? 'Atualizando...' : 'Atualizar'}</span>
            </button>

            {/* Quick Create Dropdown */}
            {canEdit && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsQuickCreateOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm hover:shadow-emerald-600/20 active:scale-95 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Novo</span>
                  <ChevronDown size={14} className={`opacity-70 transition-transform ${isQuickCreateOpen ? 'rotate-180' : ''}`} />
                </button>

                {isQuickCreateOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in-0 zoom-in-95">
                    <button
                      type="button"
                      onClick={() => handleNavigate('form')}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <ClipboardCheck size={15} className="text-emerald-600" />
                      <span>Novo Parecer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigate('oficio')}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:text-amber-700 hover:bg-amber-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <FileWarning size={15} className="text-amber-600" />
                      <span>Novo Ofício</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigate('notificacao')}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:text-violet-700 hover:bg-violet-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Bell size={15} className="text-violet-600" />
                      <span>Nova Notificação</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 w-full max-w-[1600px] mx-auto">
          {effectiveView === 'dashboard' ? (
            <Dashboard 
              onNewParecer={() => handleNavigate('form')} 
              onNewOficio={() => handleNavigate('oficio')}
              onNewNotificacao={() => handleNavigate('notificacao')}
              onEditParecer={(p) => handleNavigate('form', p)}
              onViewParecer={(p) => handleNavigate('form', p, true)}
              onEditOficio={(o) => handleNavigate('oficio', o)}
              onViewOficio={(o) => handleNavigate('oficio', o, true)}
              onEditNotificacao={(n) => {
                setReturnView('dashboard');
                handleNavigate('notificacao', n);
              }}
              onViewNotificacao={(n) => {
                setReturnView('dashboard');
                handleNavigate('notificacao', n, true);
              }}
            />
          ) : effectiveView === 'controle_notificacoes' ? (
            <ControleNotificacoes 
              onEditNotificacao={(n) => {
                setReturnView('controle_notificacoes');
                handleNavigate('notificacao', n);
              }}
              onViewNotificacao={(n) => {
                setReturnView('controle_notificacoes');
                handleNavigate('notificacao', n, true);
              }}
            />
          ) : effectiveView === 'list' ? (
            <ParecerList 
              onEditParecer={(p) => {
                if (p.tipo_documento?.startsWith('Parecer')) {
                  handleNavigate('form', p);
                } else if (p.tipo_documento === 'Notificação') {
                  setReturnView('list');
                  handleNavigate('notificacao', p);
                } else {
                  handleNavigate('oficio', p);
                }
              }}
              onViewParecer={(p) => {
                if (p.tipo_documento?.startsWith('Parecer')) {
                  handleNavigate('form', p, true);
                } else if (p.tipo_documento === 'Notificação') {
                  setReturnView('list');
                  handleNavigate('notificacao', p, true);
                } else {
                  handleNavigate('oficio', p, true);
                }
              }}
            />
          ) : effectiveView === 'form' ? (
            <OpinionForm 
              initialData={editingDocument as ParecerData}
              readOnly={isViewOnly || !canEdit}
              onBack={() => {
                handleNavigate('dashboard');
                refreshData?.();
              }} 
              onNavigate={handleNavigate}
            />
          ) : effectiveView === 'oficio' ? (
            <OficioForm 
              initialData={editingDocument as OficioData}
              readOnly={isViewOnly || !canEdit}
              onBack={() => {
                handleNavigate('dashboard');
                refreshData?.();
              }} 
            />
          ) : effectiveView === 'notificacao' ? (
            <NotificaForm 
              initialData={editingDocument as any}
              readOnly={isViewOnly || !canEdit}
              onBack={() => {
                handleNavigate(returnView || 'dashboard');
                refreshData?.();
              }} 
            />
          ) : effectiveView === 'users' && isAdmin ? (
            <UserManagement />
          ) : effectiveView === 'users' ? (
            <Dashboard 
              onNewParecer={() => handleNavigate('form')} 
              onNewOficio={() => handleNavigate('oficio')}
              onNewNotificacao={() => handleNavigate('notificacao')}
              onEditParecer={(p) => handleNavigate('form', p)}
              onViewParecer={(p) => handleNavigate('form', p, true)}
              onEditOficio={(o) => handleNavigate('oficio', o)}
              onViewOficio={(o) => handleNavigate('oficio', o, true)}
              onEditNotificacao={(n) => {
                setReturnView('dashboard');
                handleNavigate('notificacao', n);
              }}
              onViewNotificacao={(n) => {
                setReturnView('dashboard');
                handleNavigate('notificacao', n, true);
              }}
            />
          ) : effectiveView === 'audit' && showAuditMenu ? (
            <AuditLogs />
          ) : effectiveView === 'mesa_virtual' ? (
            <MesaVirtualView
              onOpenDocument={(doc, viewOnly) => handleOpenDocumentFromSearch(doc, viewOnly)}
              onCreateDocument={(target) => handleNavigate(target)}
            />
          ) : effectiveView === 'ecossistema' ? (
            <EcossistemaAdministra />
          ) : effectiveView === 'pendencias' ? (
            <PendenciasView />
          ) : effectiveView === 'solicitacoes_vistoria' ? (
            <SolicitacoesVistoriaView />
          ) : (
             <div className="p-6 md:p-12 max-w-[1600px] mx-auto w-full animate-fade-in space-y-12">
                
                {/* Hero / Header Section - Redesigned for Modern Look */}
                <div className="relative bg-slate-900 rounded-[3rem] p-10 md:p-16 overflow-hidden shadow-2xl border border-slate-800 group">
                   <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none group-hover:bg-emerald-500/30 transition-colors duration-700"></div>
                   <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none group-hover:bg-blue-600/30 transition-colors duration-700"></div>
                   
                   <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-12">
                      <div className="max-w-3xl text-center lg:text-left">
                         <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-8">
                            <span className="px-5 py-2 bg-emerald-500 text-white text-[11px] font-black rounded-full uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 border border-emerald-400/30">
                               Versão 1.0.4
                            </span>
                            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest border border-slate-800 px-4 py-2 rounded-full bg-slate-800/30 backdrop-blur-sm">
                               SEMA-MT // SURH // FISCALIZAÇÃO
                            </span>
                         </div>
                         <h1 className="text-4xl md:text-6xl lg:text-8xl font-black text-white tracking-tighter mb-8 leading-[0.85]">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600">Notifica</span> CSB
                         </h1>
                         <p className="text-slate-400 text-xl md:text-2xl leading-relaxed font-medium max-w-2xl">
                            Ecossistema inteligente para monitoramento e gestão documental de segurança de barragens.
                         </p>
                      </div>
                      <div className="hidden xl:block">
                         <div className="p-12 bg-slate-800/20 rounded-[3rem] border border-slate-700/50 backdrop-blur-md shadow-inner group-hover:border-emerald-500/30 transition-all duration-500">
                            <Building2 className="text-emerald-500 w-32 h-32 opacity-80 group-hover:scale-110 transition-transform duration-500" strokeWidth={0.5} />
                         </div>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                   
                   {/* Main Column */}
                   <div className="lg:col-span-8 space-y-12">
                      
                      {/* Transparency and Commitment Block - Redesigned */}
                      <div className="group relative">
                         <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 rounded-[2.5rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                         <div className="relative bg-white border border-slate-200 rounded-[2.5rem] shadow-xl overflow-hidden transition-all duration-500 hover:border-emerald-500/30">
                            <div className="flex flex-col xl:flex-row">
                               {/* Left Side: Main Message */}
                               <div className="p-8 lg:p-14 xl:w-2/3 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-8">
                                     <div className="bg-emerald-500 text-white p-4 rounded-2xl shadow-lg shadow-emerald-500/20 w-fit">
                                        <Cpu size={28} />
                                     </div>
                                     <div>
                                        <h3 className="text-slate-900 font-black text-2xl sm:text-3xl tracking-tighter leading-none">Nota de Desenvolvimento</h3>
                                        <p className="text-emerald-600 text-[11px] font-black uppercase tracking-[0.25em] mt-2">Inovação Institucional Nativa</p>
                                     </div>
                                  </div>
                                  <p className="text-slate-600 leading-relaxed text-lg sm:text-xl font-medium mb-10 text-justify">
                                     Este ecossistema digital foi concebido e arquitetado por uma <span className="text-slate-900 font-black underline decoration-emerald-500/30 decoration-8 underline-offset-4">servidora efetiva</span> da SEMA-MT. O projeto nasceu da necessidade de elevar o padrão técnico das análises de fiscalização, unindo conhecimento jurídico-normativo à engenharia de software de ponta.
                                  </p>
                                  <div className="flex flex-wrap gap-5">
                                     <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 rounded-2xl border border-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest">
                                        <Shield size={16} className="text-emerald-500" />
                                        Custo Zero ao Erário
                                     </div>
                                     <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 rounded-2xl border border-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest">
                                        <Zap size={16} className="text-amber-500" />
                                        Desenvolvimento Nativo
                                     </div>
                                  </div>
                               </div>
                               {/* Right Side: Technical Specs */}
                               <div className="bg-slate-900 p-10 lg:p-14 xl:w-1/3 flex flex-col justify-center relative overflow-hidden">
                                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                                  <div className="relative z-10 space-y-8">
                                     
                                     {activeInfo && (
                                       <div className="absolute inset-x-0 top-0 p-6 z-20 animate-in fade-in slide-in-from-top-4 duration-300">
                                          <div className="bg-emerald-500 text-white p-5 rounded-2xl shadow-2xl border border-emerald-400/30 relative">
                                             <button 
                                               onClick={() => setActiveInfo(null)}
                                               className="absolute top-3 right-3 p-1.5 hover:bg-white/20 rounded-full transition-colors"
                                             >
                                                <X size={14} />
                                             </button>
                                             <p className="text-xs font-bold leading-relaxed pr-4">
                                                {activeInfo === 'performance' && "Disponibilidade de 99,9%: Arquitetura resiliente projetada para operação contínua e alta performance em tempo real."}
                                                {activeInfo === 'security' && "Camada de dados desacoplada em armazenamento local temporário, preparada para futura integração."}
                                                {activeInfo === 'stack' && "Stack Moderna: React 19 e TypeScript com camada de acesso a dados preparada para futura integração em nuvem."}
                                             </p>
                                          </div>
                                       </div>
                                     )}

                                     <div className="space-y-3 group/item">
                                        <div className="flex justify-between items-end">
                                           <div className="flex items-center gap-2">
                                              <span className="text-slate-400 text-[11px] font-black uppercase tracking-widest">Performance</span>
                                              <button 
                                                onClick={() => setActiveInfo(activeInfo === 'performance' ? null : 'performance')}
                                                className={`p-1 rounded-full transition-all ${activeInfo === 'performance' ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:text-emerald-400 hover:bg-slate-800'}`}
                                              >
                                                 <Info size={14} />
                                              </button>
                                           </div>
                                           <span className="text-emerald-400 text-sm font-mono font-bold">99.9%</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                           <div className="h-full bg-emerald-500 w-[99.9%] rounded-full shadow-[0_0_15px_rgba(16,185,129,0.4)]"></div>
                                        </div>
                                     </div>

                                     <div className="space-y-3 group/item">
                                        <div className="flex justify-between items-end">
                                           <div className="flex items-center gap-2">
                                              <span className="text-slate-400 text-[11px] font-black uppercase tracking-widest">Segurança</span>
                                              <button 
                                                onClick={() => setActiveInfo(activeInfo === 'security' ? null : 'security')}
                                                className={`p-1 rounded-full transition-all ${activeInfo === 'security' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:text-blue-400 hover:bg-slate-800'}`}
                                              >
                                                 <Info size={14} />
                                              </button>
                                           </div>
                                           <span className="text-blue-400 text-sm font-mono font-bold">AES-256</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                           <div className="h-full bg-blue-500 w-[95%] rounded-full shadow-[0_0_15px_rgba(59,130,246,0.4)]"></div>
                                        </div>
                                     </div>

                                     <div className="pt-4">
                                        <div className="p-5 bg-slate-800/40 rounded-[2rem] border border-slate-700/50 backdrop-blur-sm relative group/item">
                                           <div className="flex items-center justify-between mb-4">
                                              <div className="flex items-center gap-3">
                                                 <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                 <span className="text-white text-[11px] font-black uppercase tracking-widest">Stack Tecnológica</span>
                                              </div>
                                              <button 
                                                onClick={() => setActiveInfo(activeInfo === 'stack' ? null : 'stack')}
                                                className={`p-1 rounded-full transition-all ${activeInfo === 'stack' ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:text-emerald-400 hover:bg-slate-800'}`}
                                              >
                                                 <Info size={14} />
                                              </button>
                                           </div>
                                           <div className="flex flex-wrap gap-2">
                                              {['React 19', 'TypeScript', 'Tailwind', 'Vite', 'Local Storage'].map(tech => (
                                                 <span key={tech} className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700/50">{tech}</span>
                                              ))}
                                           </div>
                                        </div>
                                     </div>
                                  </div>
                               </div>
                            </div>
                         </div>
                      </div>

                      {/* Institutional Info & Objetivo */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 hover:border-emerald-500/30 transition-all duration-300">
                            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                               <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                  <Info size={24} />
                               </div>
                               Sobre o Sistema
                            </h3>
                            <p className="text-slate-600 leading-relaxed text-base text-justify font-medium">
                               O <strong className="text-slate-900">Notifica CSB</strong> é uma ferramenta estratégica da <strong className="text-slate-900">Superintendência de Recursos Hídricos (SURH)</strong> da SEMA-MT. O sistema padroniza procedimentos e promove a excelência técnica na gestão de segurança de barragens em Mato Grosso.
                            </p>
                         </div>

                         <div className="bg-emerald-900 text-white p-10 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
                             <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                                 <Target size={180} />
                             </div>
                             <h3 className="text-xl font-black mb-6 flex items-center gap-3 relative z-10">
                                <div className="p-2 bg-emerald-800 text-emerald-400 rounded-xl">
                                   <Target size={24} />
                                </div>
                                Objetivo Estratégico
                             </h3>
                             <p className="text-emerald-50 text-lg leading-relaxed font-medium relative z-10 text-justify">
                                Mitigar inconsistências técnicas, otimizar o fluxo de análises e assegurar a conformidade normativa rigorosa, elevando a eficiência da fiscalização ambiental estadual.
                             </p>
                         </div>
                      </div>

                      {/* Legislações Block - NEW */}
                      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200">
                         <div className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                               <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                  <BookOpen size={24} />
                               </div>
                               Legislações e Normativas
                            </h3>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
                               Base Normativa Atualizada
                            </span>
                         </div>
                         
                         <div className="grid grid-cols-1 gap-4">
                            {[
                               {
                                  title: "PNSB - LEI Nº 12.334/2010",
                                  desc: "Estabelece a Política Nacional de Segurança de Barragens e cria o Sistema Nacional de Informações sobre Segurança de Barragens (SNISB).",
                                  link: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12334.htm",
                                  tag: "Lei Federal"
                               },
                               {
                                  title: "RESOLUÇÃO CNRH Nº 241/2024",
                                  desc: "Critérios gerais de classificação de barragens por dano potencial associado, volume e categoria de risco.",
                                  link: "https://www.gov.br/anm/pt-br/assuntos/barragens/legislacao/cnrh-no-241-2024.pdf",
                                  tag: "Resolução"
                               },
                               {
                                  title: "RESOLUÇÃO CEHIDRO Nº 163/2023",
                                  desc: "Estabelece periodicidade, qualificação técnica e conteúdo mínimo do Plano de Segurança e Inspeções (Revoga Res. 99).",
                                  link: "http://www.sema.mt.gov.br/site/phocadownload/Portarias_barragens_2021/RESOLUO%20CEHIDRO%20N%20163%20DE%2011%20DE%20MAIO%20DE%202023%20Revoga%20a%20Resoluo%2099.pdf",
                                  tag: "Estadual"
                               },
                               {
                                  title: "Instrução Normativa nº 08/2023",
                                  desc: "Procedimentos referentes à Classificação quanto à Segurança de Barragens para usos múltiplos em Mato Grosso.",
                                  link: "http://www.sema.mt.gov.br/site/phocadownload/Barragem/Instruo%20Normativa%20n%2008%20de%2019%20de%20dezembro%20de%202023.pdf",
                                  tag: "IN SEMA"
                               },
                               {
                                  title: "TR 17- SURH - CLASSIFICAÇÃO",
                                  desc: "Termo de Referência para Classificação quanto à Segurança de barragem de acumulação de água para usos múltiplos.",
                                  link: "http://www.sema.mt.gov.br/site/phocadownload/Barragem/TR%2017-%20SURH%20-%20CLASSIFICAO%20DE%20BARRAGEM%20-%20Atualizado%2005.07.2024.pdf",
                                  tag: "T.R."
                               },
                               {
                                  title: "ANEXO I - REQUERIMENTO SNISB",
                                  desc: "Formulário oficial de requerimento para cadastro no Sistema Nacional de Informações sobre Segurança de Barragens.",
                                  link: "https://drive.google.com/file/d/1VNem6xR6DHJS_SHuTiMuMHQ3BV-cgBpX/view?usp=sharing",
                                  tag: "Formulário"
                               },
                               {
                                  title: "TR18 - SURH - DESCOMISSIONAMENTO",
                                  desc: "Termo de Referência para Descomissionamento de barragens de acumulação de água para usos múltiplos.",
                                  link: "http://www.sema.mt.gov.br/site/phocadownload/Barragem_2025/TR18%20-%20SURH%20-%20Descomissionamento%20de%20barragem%20-%20Atualizado%2006_10_2025%201.pdf",
                                  tag: "T.R."
                               }
                            ].map((leg, idx) => (
                               <a 
                                 key={idx}
                                 href={leg.link}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="group/leg flex flex-col md:flex-row md:items-center justify-between p-6 rounded-2xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 gap-4"
                               >
                                  <div className="flex-1">
                                     <div className="flex items-center gap-3 mb-2">
                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black uppercase tracking-wider rounded-md">
                                           {leg.tag}
                                        </span>
                                        <h4 className="font-black text-slate-900 text-sm group-hover/leg:text-blue-600 transition-colors">{leg.title}</h4>
                                     </div>
                                     <p className="text-xs text-slate-500 font-medium leading-relaxed">{leg.desc}</p>
                                  </div>
                                  <div className="flex items-center gap-2 text-blue-500 opacity-0 group-hover/leg:opacity-100 transition-all transform translate-x-2 group-hover/leg:translate-x-0">
                                     <span className="text-[10px] font-black uppercase tracking-widest">Acessar</span>
                                     <ExternalLink size={16} />
                                  </div>
                               </a>
                            ))}
                         </div>
                      </div>

                      {/* Corpo Técnico Block - NEW */}
                      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200">
                         <div className="flex items-center justify-between mb-10">
                            <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                               <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                  <Users size={24} />
                               </div>
                               Corpo Técnico CSB/SURH
                            </h3>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
                               Equipe Multidisciplinar
                            </span>
                         </div>

                         <div className="space-y-12">
                            {/* Coordenador */}
                            <div>
                               <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                  Coordenação
                               </h4>
                               <div className="p-8 rounded-[2rem] bg-slate-900 text-white border border-slate-800 shadow-2xl relative overflow-hidden group">
                                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-700">
                                     <ShieldCheck size={120} />
                                  </div>
                                  <div className="relative z-10">
                                     <p className="font-black text-2xl tracking-tight mb-1">Fernando de Almeida Pires</p>
                                     <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider">Coordenador</p>
                                     <div className="mt-4 pt-4 border-t border-slate-800">
                                        <p className="text-slate-400 text-xs font-medium leading-relaxed">Engenheiro Ambiental e Sanitarista, Especialista em Segurança de Barragens (UFBA)</p>
                                     </div>
                                  </div>
                               </div>
                            </div>

                            {/* Setores */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                               {/* Setor de Classificação */}
                               <div className="space-y-6">
                                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
                                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                     Classificação de Barragens
                                  </h4>
                                  <div className="space-y-3">
                                     {[
                                        { name: "Alahn Wellington de Morais", role: "Engenheiro Civil" },
                                        { name: "Eliane Antônia Nadaf Diniz", role: "Engenheira Civil" },
                                        { name: "Géssika Rodrigues de Almeida Camacho", role: "Engenheira Civil" },
                                        { name: "Junior Silva de Paula", role: "Engenheiro Civil" },
                                        { name: "Matheus Costa Oliveira de Moraes", role: "Engenheiro Civil" },
                                        { name: "Vanusa de Souza Pacheco Hoki", role: "Engenheira Civil e de Segurança de Trabalho" }
                                     ].map((member, i) => (
                                        <div key={i} className="p-5 rounded-2xl border border-slate-100 bg-slate-50/30 hover:border-blue-200 hover:bg-white hover:shadow-md transition-all duration-300 group/member">
                                           <p className="font-black text-slate-900 text-sm group-hover/member:text-blue-600 transition-colors">{member.name}</p>
                                           <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tight">{member.role}</p>
                                        </div>
                                     ))}
                                  </div>
                               </div>

                               {/* Setor de Fiscalização */}
                               <div className="space-y-6">
                                  <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
                                     <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                                     Fiscalização e Monitoramento
                                  </h4>
                                  <div className="space-y-3">
                                     {[
                                        { name: "Edemar Pinho Vilas Boas", role: "Engenheiro Agrônomo, Mestre em Agricultura Tropical" },
                                        { name: "Igor de Oliveira Vital", role: "Engenheiro Florestal" },
                                        { name: "Thaiza Moreira Pacheco de Mello", role: "Engenheira Sanitarista" },
                                        { name: "Yara Dias Pereira", role: "Geóloga, Especialista em Segurança de Barragens (UFBA)" },
                                        { name: "Thiago Silveira da Silva", role: "Residente Técnico" }
                                     ].map((member, i) => (
                                        <div key={i} className="p-5 rounded-2xl border border-slate-100 bg-slate-50/30 hover:border-amber-200 hover:bg-white hover:shadow-md transition-all duration-300 group/member">
                                           <p className="font-black text-slate-900 text-sm group-hover/member:text-amber-600 transition-colors">{member.name}</p>
                                           <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tight">{member.role}</p>
                                        </div>
                                     ))}
                                  </div>
                               </div>

                               {/* Setor Administrativo */}
                               <div className="space-y-6">
                                  <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
                                     <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                                     Setor Administrativo
                                  </h4>
                                  <div className="space-y-3">
                                     {[
                                        { name: "Bianka Nuccia Magalhães Campos", role: "Administrativa, Advogada" },
                                        { name: "Carlos Augusto Gomes de Oliveira", role: "Economista" }
                                     ].map((member, i) => (
                                        <div key={i} className="p-5 rounded-2xl border border-slate-100 bg-slate-50/30 hover:border-purple-200 hover:bg-white hover:shadow-md transition-all duration-300 group/member">
                                           <p className="font-black text-slate-900 text-sm group-hover/member:text-purple-600 transition-colors">{member.name}</p>
                                           <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tight">{member.role}</p>
                                        </div>
                                     ))}
                                  </div>
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Sidebar Column */}
                   <div className="lg:col-span-4 space-y-8">
                      {/* Funcionalidades Principais - Redesigned */}
                      <div className="space-y-4">
                         <h3 className="text-lg font-black text-slate-900 px-4 flex items-center gap-3">
                            <Wand2 size={20} className="text-emerald-600" />
                            Recursos Técnicos
                         </h3>
                         <div className="grid grid-cols-1 gap-4">
                            {[
                               { icon: <ListChecks size={20} />, title: "Padronização Normativa", desc: "Redução de erros com seleções baseadas em normas vigentes.", color: "blue" },
                               { icon: <Cpu size={20} />, title: "Processamento Ágil", desc: "Geração instantânea de pareceres e notificações técnicas.", color: "purple" },
                               { icon: <Shield size={20} />, title: "Integridade de Dados", desc: "Validação automática de enquadramento ambiental.", color: "emerald" },
                               { icon: <Zap size={20} />, title: "Fluxo Otimizado", desc: "Interface técnica focada na produtividade do analista.", color: "amber" }
                            ].map((feat, idx) => (
                               <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-all hover:border-emerald-500/30 group">
                                  <div className={`w-12 h-12 bg-${feat.color}-50 text-${feat.color}-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                                     {feat.icon}
                                  </div>
                                  <h4 className="font-black text-slate-900 text-sm mb-2">{feat.title}</h4>
                                  <p className="text-xs text-slate-500 leading-relaxed font-medium">{feat.desc}</p>
                               </div>
                            ))}
                         </div>
                      </div>

                      {/* Contact Card - Redesigned */}
                      <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                         <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-700">
                            <Zap size={100} />
                         </div>
                         <h3 className="text-2xl font-black mb-6">Suporte SURH</h3>
                         <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium">
                            Para suporte técnico, dúvidas normativas ou sugestões de evolução do sistema.
                         </p>

                         <div className="space-y-4">
                            <a href="mailto:fiscalizacao@sema.mt.gov.br" className="block bg-slate-800/50 p-5 rounded-2xl border border-slate-700 hover:border-emerald-500/50 transition-all group/link">
                               <div className="flex items-center gap-4 mb-2 text-emerald-400">
                                  <Mail size={20} />
                                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">E-mail Institucional</span>
                                </div>
                               <span className="text-sm font-bold text-white group-hover/link:text-emerald-400 transition-colors">
                                  fiscalizacao@sema.mt.gov.br
                               </span>
                            </a>

                            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700">
                               <div className="flex items-center gap-4 mb-2 text-emerald-400">
                                  <Phone size={20} />
                                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Telefone Direto</span>
                               </div>
                               <span className="text-sm font-bold text-white">
                                  (65) 3613-7257
                               </span>
                            </div>
                         </div>

                         <div className="mt-8 pt-8 border-t border-slate-800 text-center">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest italic">
                               "Inovação a serviço da proteção ambiental"
                            </p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          )}
        </div>

        {/* App Footer */}
        <footer className="py-4 text-xs text-slate-400 border-t border-slate-200 bg-white mt-auto px-6">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="bg-white p-1.5 rounded-2xl shadow-lg border border-slate-100 flex items-center justify-center w-20 h-20 shrink-0 hover:scale-105 transition-transform duration-300">
                      <img src="https://lh3.googleusercontent.com/d/11OtFjZyub-hYsCvNr8N88CHVtcGM1QKU" alt="Logo" className="w-16 h-16 object-contain" referrerPolicy="no-referrer" />
                    </div>
                    <div className="text-left border-l-2 border-emerald-500/30 pl-6 py-1">
                      <p className="font-black text-slate-800 tracking-tighter uppercase text-base leading-none mb-1.5"><span className="text-emerald-500">Notifica</span> CSB</p>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-black rounded uppercase tracking-wider">SURH</span>
                        <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">SEMA-MT</span>
                      </div>
                    </div>
                </div>
                
                <div className="flex flex-col md:items-end gap-1 text-center md:text-right border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-8 w-full md:w-auto">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-0.5">Engenharia & Design</p>
                    <p className="text-xs font-bold text-slate-700">Yara Dias <span className="text-emerald-500 mx-1">//</span> <span className="text-slate-400 italic font-medium">© 2026</span></p>
                </div>
            </div>
        </footer>
      </main>

      {/* Back to Top Button */}
      {showBackToTop && (
        <button 
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-[100] p-3 bg-emerald-600 text-white rounded-full shadow-2xl hover:bg-emerald-700 transition-all animate-in fade-in zoom-in duration-300 active:scale-90"
          aria-label="Voltar ao topo"
        >
          <ChevronUp size={24} />
        </button>
      )}

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
};

export default App;
