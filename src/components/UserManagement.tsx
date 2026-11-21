import React from 'react';
import {
  CheckCircle,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

const NOT_INFORMED = 'Não informado';

function formatPermissionSummary(role: UserRole | null): string {
  if (role === 'Administrador') {
    return 'Acesso administrativo, leitura, edição e exclusão';
  }
  if (role === 'Analista') {
    return 'Leitura e edição de documentos';
  }
  if (role === 'Visualizador') {
    return 'Somente leitura';
  }
  return NOT_INFORMED;
}

function getRoleBadgeClass(role: UserRole | null): string {
  if (role === 'Administrador') return 'bg-purple-100 text-purple-700';
  if (role === 'Analista') return 'bg-blue-100 text-blue-700';
  if (role === 'Visualizador') return 'bg-slate-100 text-slate-700';
  return 'bg-slate-100 text-slate-500';
}

export const UserManagement: React.FC = () => {
  const { user, profile, role, loading } = useAuth();

  const currentRole: UserRole | null = profile?.perfil ?? role ?? null;
  const displayName = profile?.nome?.trim() || NOT_INFORMED;
  const displayIdentifier = profile?.email?.trim() || user?.email?.trim() || NOT_INFORMED;
  const displaySessionId = user?.id?.trim() || profile?.id?.trim() || NOT_INFORMED;
  const displayRole = currentRole || NOT_INFORMED;
  const displayPermission = formatPermissionSummary(currentRole);
  const rawStatus = profile?.status?.trim();
  const displayStatus = rawStatus
    ? rawStatus.toLowerCase() === 'ativo'
      ? 'Ativo'
      : rawStatus
    : NOT_INFORMED;
  const isStatusActive = Boolean(rawStatus && rawStatus.toLowerCase() === 'ativo');

  return (
    <div className="p-4 sm:p-6 md:p-12 max-w-[1200px] mx-auto w-full animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mb-1.5 sm:mb-2">
            Conta <span className="text-emerald-600">Atual</span>
          </h1>
          <p className="text-slate-500 font-medium">
            Dados da sessão autenticada e perfil validado no Notifica (somente consulta)
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">
          <Lock size={14} className="text-slate-500" />
          <span>Somente consulta</span>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-12 flex flex-col items-center justify-center gap-4 shadow-sm">
          <Loader2 className="text-emerald-500 animate-spin" size={40} />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
            Carregando sessão autenticada...
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                <UserIcon size={28} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Usuário autenticado
                </p>
                <h2 className="text-xl font-black text-slate-900 tracking-tight truncate">
                  {displayName}
                </h2>
                <p className="text-sm text-slate-500 font-medium truncate">
                  {displayIdentifier}
                </p>
              </div>
            </div>

            <div
              className={`px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest inline-flex items-center gap-1.5 self-start ${getRoleBadgeClass(
                currentRole
              )}`}
            >
              <Shield size={14} />
              <span>{displayRole}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <UserIcon size={12} />
                Nome
              </span>
              <p className="text-sm font-bold text-slate-800 break-words">{displayName}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Mail size={12} />
                Identificador (E-mail)
              </span>
              <p className="text-sm font-bold text-slate-800 break-all">{displayIdentifier}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Shield size={12} />
                Perfil / Permissão atual
              </span>
              <p className="text-sm font-bold text-slate-800">{displayRole}</p>
              <p className="text-xs text-slate-500">{displayPermission}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <CheckCircle size={12} />
                Status do perfil
              </span>
              <p
                className={`text-sm font-bold ${
                  isStatusActive ? 'text-emerald-700' : 'text-slate-700'
                }`}
              >
                {displayStatus}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1 md:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <KeyRound size={12} />
                ID da conta autenticada
              </span>
              <p className="text-xs font-mono font-bold text-slate-700 break-all">
                {displaySessionId}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
