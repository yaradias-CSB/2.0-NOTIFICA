import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Shield, RefreshCw, 
  Trash2, AlertCircle, CheckCircle, LogOut, FileText, 
  Filter, Award, Download, ChevronLeft, ChevronRight,
  Edit2, User, Terminal
} from 'lucide-react';
import { auditRepository } from '../data';
import { AuditLogRecord, AuditRepository } from '../data/types';
import { useAuth } from '../contexts/AuthContext';

type AuditLog = AuditLogRecord;

export interface AuditAccessState {
  hasSession: boolean;
  isAdmin: boolean;
  loading?: boolean;
}

export type AppViewId =
  | 'dashboard'
  | 'list'
  | 'form'
  | 'oficio'
  | 'info'
  | 'users'
  | 'notificacao'
  | 'controle_notificacoes'
  | 'audit'
  | 'ecossistema'
  | 'pendencias';

export function canAccessAuditLogs(auth: AuditAccessState): boolean {
  return Boolean(!auth.loading && auth.hasSession && auth.isAdmin);
}

export function isAuditMenuVisible(auth: { hasSession: boolean; isAdmin: boolean }): boolean {
  return Boolean(auth.hasSession && auth.isAdmin);
}

export function resolveAuthorizedAppView(
  view: AppViewId,
  auth: { hasSession: boolean; isAdmin: boolean }
): AppViewId {
  if ((view === 'users' || view === 'audit') && (!auth.hasSession || !auth.isAdmin)) {
    return 'dashboard';
  }
  return view;
}

export async function loadAuditLogsForUser(
  auth: AuditAccessState,
  repository: Pick<AuditRepository, 'getLogs'> = auditRepository
): Promise<{ authorized: boolean; logs: AuditLog[] }> {
  if (!canAccessAuditLogs(auth)) {
    return { authorized: false, logs: [] };
  }
  const localLogs = await repository.getLogs();
  const sorted = [...localLogs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return { authorized: true, logs: sorted };
}

export const AuditLogs: React.FC = () => {
  const { session, user, profile, isAdmin, loading: authLoading } = useAuth();
  const hasSession = Boolean(session && user && profile);
  const isAuthorizedAdmin = canAccessAuditLogs({
    hasSession,
    isAdmin,
    loading: authLoading,
  });

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);
  
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!isAuthorizedAdmin) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await loadAuditLogsForUser(
        { hasSession, isAdmin, loading: authLoading },
        auditRepository
      );
      setLogs(result.authorized ? result.logs : []);
    } catch (err) {
      console.warn('Erro ao ler logs de auditoria locais:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, hasSession, isAdmin, isAuthorizedAdmin]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthorizedAdmin) {
      setLogs([]);
      setLoading(false);
      return;
    }
    void fetchLogs();
  }, [authLoading, isAuthorizedAdmin, fetchLogs]);

  const handleClearLocalLogs = async () => {
    if (!isAuthorizedAdmin) return;
    if (window.confirm('Tem certeza de que deseja limpar os logs locais de auditoria?')) {
      await auditRepository.clearLogs();
      void fetchLogs();
    }
  };

  // Extract statistics
  const stats = useMemo(() => {
    const total = logs.length;
    const loginsSuccess = logs.filter(l => l.action === 'LOGIN_SUCCESS').length;
    const loginsFail = logs.filter(l => l.action === 'LOGIN_FAIL').length;
    const updates = logs.filter(l => l.action.includes('UPDATE') || l.action.includes('SAVE') || l.action.includes('UPSERT')).length;
    const deletes = logs.filter(l => l.action.includes('DELETE') || l.action.includes('REMOVE')).length;
    
    // Most active user
    const usersMap: Record<string, number> = {};
    logs.forEach(l => {
      const userKey = l.name || l.username || 'Sistema';
      usersMap[userKey] = (usersMap[userKey] || 0) + 1;
    });
    
    let mostActiveUser = '---';
    let maxLogs = 0;
    Object.entries(usersMap).forEach(([user, count]) => {
      if (count > maxLogs) {
        maxLogs = count;
        mostActiveUser = user;
      }
    });

    return {
      total,
      loginsSuccess,
      loginsFail,
      updates,
      deletes,
      mostActiveUser,
      mostActiveCount: maxLogs
    };
  }, [logs]);

  // Filters logic
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Search text
      const nameMatch = (log.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const userMatch = (log.username || '').toLowerCase().includes(searchTerm.toLowerCase());
      const actionMatch = (log.action || '').toLowerCase().includes(searchTerm.toLowerCase());
      const detailsMatch = (log.details || '').toLowerCase().includes(searchTerm.toLowerCase());
      const ipMatch = (log.ip_address || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const textMatches = nameMatch || userMatch || actionMatch || detailsMatch || ipMatch;
      
      // Action filter
      let actMatches = true;
      if (actionFilter !== 'ALL') {
        if (actionFilter === 'DOWNLOAD') {
          actMatches = log.action.startsWith('DOWNLOAD_') || log.action === 'EXPORT_EXCEL';
        } else if (actionFilter === 'DELETE_PARECER') {
          actMatches = log.action === 'DELETE_PARECER' || log.action === 'DELETE_PARECER_FISCALIZACAO';
        } else if (actionFilter === 'DELETE_OFICIO') {
          actMatches = log.action === 'DELETE_OFICIO' || log.action === 'DELETE_OFICIO_FISCALIZACAO';
        } else {
          actMatches = log.action === actionFilter;
        }
      }

      // Role filter
      let roleMatches = true;
      if (roleFilter !== 'ALL') {
        roleMatches = log.role === roleFilter;
      }

      return textMatches && actMatches && roleMatches;
    });
  }, [logs, searchTerm, actionFilter, roleFilter]);

  // Pagination
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    let displayLabel = action;
    let badgeStyle = "bg-blue-50 text-blue-700 border-blue-100";
    let IconComponent = Terminal;

    if (act === 'LOGIN_SUCCESS') {
      displayLabel = 'Login Sucesso';
      badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-100";
      IconComponent = CheckCircle;
    } else if (act === 'LOGIN_FAIL') {
      displayLabel = 'Falha Segurança';
      badgeStyle = "bg-rose-50 text-rose-700 border-rose-100";
      IconComponent = AlertCircle;
    } else if (act === 'CREATE_PARECER') {
      displayLabel = 'Criação Parecer';
      badgeStyle = "bg-sky-50 text-sky-700 border-sky-100";
      IconComponent = FileText;
    } else if (act === 'UPDATE_PARECER') {
      displayLabel = 'Edição Parecer';
      badgeStyle = "bg-indigo-50 text-indigo-700 border-indigo-100";
      IconComponent = Edit2;
    } else if (act === 'DELETE_USER') {
      displayLabel = 'Exclusão Usuário';
      badgeStyle = "bg-red-50 text-red-700 border-red-100";
      IconComponent = Trash2;
    } else if (act === 'DELETE_NOTIFICACAO') {
      displayLabel = 'Exclusão Notificação';
      badgeStyle = "bg-amber-50 text-amber-700 border-amber-100";
      IconComponent = Trash2;
    } else if (act === 'DELETE_OFICIO' || act === 'DELETE_OFICIO_FISCALIZACAO') {
      displayLabel = 'Exclusão Ofício';
      badgeStyle = "bg-amber-50 text-amber-700 border-amber-100";
      IconComponent = Trash2;
    } else if (act === 'DELETE_FISCALIZACAO') {
      displayLabel = 'Exclusão Fiscalização';
      badgeStyle = "bg-amber-50 text-amber-700 border-amber-100";
      IconComponent = Trash2;
    } else if (act === 'DELETE_PARECER' || act === 'DELETE_PARECER_FISCALIZACAO') {
      displayLabel = 'Exclusão Parecer';
      badgeStyle = "bg-amber-50 text-amber-700 border-amber-100";
      IconComponent = Trash2;
    } else if (act.includes('DELETE_') || act.includes('REMOVE_')) {
      displayLabel = act.replace('DELETE_', 'Exclusão ').replace('REMOVE_', 'Remoção ');
      badgeStyle = "bg-amber-50 text-amber-700 border-amber-100";
      IconComponent = Trash2;
    } else if (act === 'CREATE_USER') {
      displayLabel = 'Novo Usuário';
      badgeStyle = "bg-purple-50 text-purple-700 border-purple-100";
      IconComponent = User;
    } else if (act === 'DELETE_USER') {
      displayLabel = 'Exclusão Usuário';
      badgeStyle = "bg-red-50 text-red-700 border-red-100";
      IconComponent = Trash2;
    } else if (act === 'LOGOUT') {
      displayLabel = 'Logout';
      badgeStyle = "bg-slate-100 text-slate-700 border-slate-200";
      IconComponent = LogOut;
    } else if (act.startsWith('DOWNLOAD_')) {
      displayLabel = 'Download Documento';
      badgeStyle = "bg-teal-50 text-teal-700 border-teal-100";
      IconComponent = Download;
    } else if (act === 'EXPORT_EXCEL') {
      displayLabel = 'Exportação Excel';
      badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-100";
      IconComponent = Download;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${badgeStyle}`}>
        <IconComponent size={10} /> {displayLabel}
      </span>
    );
  };

  const getSimplifiedDevice = (ua: string) => {
    if (!ua) return '---';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Macintosh')) return 'Mac OS';
    if (ua.includes('Android')) return 'Android Mobile';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Device';
    if (ua.includes('Linux')) return 'Linux PC';
    return ua.substring(0, 30) + '...';
  };

  // Function to download CSV
  const handleDownloadCSV = () => {
    if (filteredLogs.length === 0) return;
    
    const headers = ['ID', 'Data/Hora', 'Username', 'Nome', 'Cargo/Role', 'Acao', 'Detalhes', 'Navegador/Dispositivo'];
    const rows = filteredLogs.map(l => [
      l.id,
      new Date(l.created_at).toLocaleString('pt-BR'),
      l.username,
      l.name || '---',
      l.role || '---',
      l.action,
      l.details.replace(/"/g, '""'),
      l.ip_address.replace(/"/g, '""')
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `auditoria_notificacsb_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 flex items-center justify-center">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Verificando permissões...
        </p>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="p-6 md:p-12 max-w-[900px] mx-auto w-full">
        <div className="bg-white border border-rose-200 rounded-3xl p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Shield size={24} />
          </div>
          <h2 className="text-xl font-black text-slate-900">Acesso não autorizado</h2>
          <p className="text-sm text-slate-600">
            O módulo de Auditoria é acessível exclusivamente para o perfil Administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in px-4 sm:px-6">
      
      {/* Main Audit Header */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-emerald-50 rounded-full blur-3xl"></div>
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black uppercase tracking-wider">
            <Shield size={14} className="animate-pulse" /> Registro Local
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Log de Auditoria & Atividades</h2>
          <p className="text-xs text-slate-500 max-w-xl">Histórico geral de auditoria técnica e operações realizadas no sistema.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <button 
            onClick={fetchLogs} 
            disabled={loading}
            className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 active:scale-95 text-xs font-bold text-slate-700 px-4 py-2.5 rounded-2xl transition-all border border-slate-200"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          
          <button 
            onClick={handleDownloadCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-xs font-black text-white px-4 py-2.5 rounded-2xl transition-all disabled:opacity-50"
          >
            <Download size={14} />
            Exportar CSV
          </button>

          <button 
            onClick={handleClearLocalLogs}
            className="flex items-center gap-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 active:scale-95 text-xs font-bold text-slate-500 px-4 py-2.5 rounded-2xl transition-all"
            title="Limpar logs locais"
          >
            <Trash2 size={14} />
            Limpar buffer local
          </button>
        </div>
      </div>

      {/* Stats Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md flex items-center gap-4 hover:shadow-lg transition-all">
          <div className="bg-emerald-50 p-3.5 rounded-2xl text-emerald-500 shrink-0">
            <Shield size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Eventos</p>
            <p className="text-2xl font-black text-slate-900">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md flex items-center gap-4 hover:shadow-lg transition-all">
          <div className="bg-teal-50 p-3.5 rounded-2xl text-teal-600 shrink-0">
            <CheckCircle size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acessos com Sucesso</p>
            <p className="text-2xl font-black text-slate-900">{stats.loginsSuccess}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md flex items-center gap-4 hover:shadow-lg transition-all">
          <div className="bg-rose-50 p-3.5 rounded-2xl text-rose-500 shrink-0">
            <AlertCircle size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tentativas com Falha</p>
            <p className="text-2xl font-black text-rose-600">{stats.loginsFail}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md flex items-center gap-4 hover:shadow-lg transition-all">
          <div className="bg-purple-50 p-3.5 rounded-2xl text-purple-600 shrink-0">
            <Award size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mais Ativo</p>
            <p className="text-base font-black text-slate-900 truncate max-w-[140px]" title={stats.mostActiveUser}>{stats.mostActiveUser}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase">{stats.mostActiveCount} ações registradas</p>
          </div>
        </div>

      </div>

      {/* Main Grid: Filters & Search with Log List */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
        
        {/* Search Bar / Filtering controls bar */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-3 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar por usuário, ação, IP, detalhes..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-11 pr-4 py-2.5 text-sm font-medium border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white shadow-inner"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <Filter className="text-slate-400 shrink-0" size={14} />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FILTRAR AÇÕES:</span>
            </div>
            
            <select 
              value={actionFilter} 
              onChange={e => { setActionFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs font-bold border border-slate-200 focus:border-emerald-500 rounded-xl px-4 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm transition-all duration-200 cursor-pointer min-w-[200px]"
            >
              <option value="ALL">Todas as Ações</option>
              <option value="LOGIN_SUCCESS">Login Sucesso</option>
              <option value="LOGIN_FAIL">Falha Segurança</option>
              <option value="CREATE_PARECER">Criação Parecer</option>
              <option value="UPDATE_PARECER">Edição Parecer</option>
              <option value="DELETE_PARECER">Exclusão Parecer</option>
              <option value="DELETE_NOTIFICACAO">Exclusão Notificação</option>
              <option value="DELETE_OFICIO">Exclusão Ofício</option>
              <option value="DELETE_FISCALIZACAO">Exclusão Fiscalização</option>
              <option value="CREATE_USER">Novo Usuário</option>
              <option value="DELETE_USER">Exclusão Usuário</option>
              <option value="LOGOUT">Logout</option>
              <option value="DOWNLOAD">Download de Documento</option>
            </select>

            <select 
              value={roleFilter} 
              onChange={e => { setRoleFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">Quaisquer Perfis</option>
              <option value="Administrador">Administrador</option>
              <option value="Analista">Analista</option>
              <option value="Visualizador">Visualizador</option>
            </select>
          </div>
        </div>

        {/* Logs List - Table & Mobile View */}
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw size={36} className="animate-spin text-emerald-500" />
            <p className="text-xs font-black uppercase tracking-widest animate-pulse">Carregando logs de auditoria...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-20 text-center space-y-2">
            <AlertCircle size={40} className="mx-auto text-slate-300" />
            <h4 className="text-sm font-black text-slate-500 uppercase tracking-wider">Nenhum evento registrado</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">Nenhum log de auditoria foi encontrado correspondente aos filtros de pesquisa aplicados.</p>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                    <th className="px-6 py-4 text-left">Data/Hora</th>
                    <th className="px-6 py-4 text-left">Usuário</th>
                    <th className="px-6 py-4 text-left">Perfil</th>
                    <th className="px-6 py-4 text-left">Ação</th>
                    <th className="px-6 py-4 text-left">Detalhes da Atividade</th>
                    <th className="px-6 py-4 text-left">IP / Dispositivo</th>
                    <th className="px-6 py-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors text-xs">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-medium">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 font-bold">
                            {(log.name || log.username || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 leading-none">{log.name || 'Desconhecido'}</p>
                            <p className="text-[10px] font-mono text-slate-400">{log.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        {log.role || '---'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate font-medium text-slate-600" title={log.details}>
                        {log.details}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono text-[10px]" title={log.ip_address}>
                        {getSimplifiedDevice(log.ip_address)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button 
                          onClick={() => setSelectedLog(log)}
                          className="p-1 px-2.5 rounded-lg text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-50 transition-all border border-transparent hover:border-emerald-200"
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedLogs.map((log) => (
                <div key={log.id} className="p-5 space-y-3" onClick={() => setSelectedLog(log)}>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </span>
                    {getActionBadge(log.action)}
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 text-sm leading-tight">{log.name || 'Desconhecido'}</h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">{log.username} • {log.role || '---'}</p>
                  </div>
                  <p className="text-xs text-slate-600 leading-normal">{log.details}</p>
                  <p className="text-[9px] font-mono text-slate-400 border-t border-slate-50 pt-2">
                    {getSimplifiedDevice(log.ip_address)}
                  </p>
                </div>
              ))}
            </div>

            {/* Pagination block */}
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Mostrando {paginatedLogs.length} de {filteredLogs.length} logs
              </span>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setCurrentPage(c => Math.max(1, c - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-bold text-slate-700">
                  Página {currentPage} de {totalPages || 1}
                </span>
                <button 
                  onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-150 animate-scale-up">
            
            <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Auditoria Detalhada</span>
                <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">Registro de Auditoria</h4>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors"
              >
                Fechar
              </button>
            </div>

            <div className="p-6 space-y-4">
              
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Data e Hora</p>
                  <p className="font-bold text-slate-800">{new Date(selectedLog.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status da Ação</p>
                  <div>{getActionBadge(selectedLog.action)}</div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Usuário Responsável</p>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="font-bold text-slate-900 text-sm">{selectedLog.name || 'Usuário Não Identificado'}</p>
                  <p className="text-[10px] font-mono text-slate-400">Username: {selectedLog.username}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Cargo/Perfil: {selectedLog.role || 'Sem cargo'}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Detalhes do Evento</p>
                <div className="p-3 bg-slate-900 rounded-2xl border border-slate-950 font-mono text-[11px] text-emerald-400 leading-normal select-text whitespace-pre-wrap">
                  {selectedLog.details}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Identificação do Dispositivo</p>
                <p className="text-xs text-slate-600 font-mono font-medium leading-normal bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-h-[80px] overflow-y-auto select-text">
                  {selectedLog.ip_address}
                </p>
              </div>

            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all"
              >
                Concluído
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
