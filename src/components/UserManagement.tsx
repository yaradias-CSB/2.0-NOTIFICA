import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  User as UserIcon,
  UserX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../lib/audit';
import { authFetch } from '../lib/supabase';
import { UserRole } from '../types';

interface ManagedUser {
  id: string;
  email: string;
  nome: string;
  perfil: UserRole;
  status: 'ativo' | 'inativo';
}

function getRoleBadgeClass(role: UserRole): string {
  if (role === 'Administrador') return 'bg-purple-100 text-purple-700 border-purple-200';
  if (role === 'Analista') return 'bg-blue-100 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export const UserManagement: React.FC = () => {
  const { user, profile, isAdmin, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all');

  // Create / Edit modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPerfil, setFormPerfil] = useState<UserRole>('Analista');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Row status toggle busy state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/api/users', { method: 'GET' });
      const payload = (await response.json().catch(() => ({}))) as {
        users?: ManagedUser[];
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error || 'Não foi possível carregar os usuários do Supabase.');
        return;
      }
      setUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch {
      setError('Erro de conexão ao buscar usuários.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      void loadUsers();
    }
  }, [authLoading, isAdmin, loadUsers]);

  const isCurrentUser = useCallback(
    (item: ManagedUser) => {
      const currentEmail = (profile?.email || user?.email || '').trim().toLowerCase();
      if (profile?.id && item.id === profile.id) return true;
      if (user?.id && item.id === user.id) return true;
      if (currentEmail && item.email.trim().toLowerCase() === currentEmail) return true;
      return false;
    },
    [profile?.email, profile?.id, user?.email, user?.id]
  );

  const openCreateModal = () => {
    setEditingUser(null);
    setFormNome('');
    setFormEmail('');
    setFormPerfil('Analista');
    setFormActive(true);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (target: ManagedUser) => {
    setEditingUser(target);
    setFormNome(target.nome);
    setFormEmail(target.email);
    setFormPerfil(target.perfil);
    setFormActive(target.status === 'ativo');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const nomeTrimmed = formNome.trim();
    const emailTrimmed = formEmail.trim().toLowerCase();

    if (nomeTrimmed.length < 2) {
      setFormError('Informe o nome completo do usuário (mínimo 2 caracteres).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed)) {
      setFormError('Informe um e-mail válido.');
      return;
    }

    if (!editingUser) {
      setSavingForm(true);
      try {
        const response = await authFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nomeTrimmed,
            email: emailTrimmed,
            perfil: formPerfil,
            status: formActive ? 'ativo' : 'inativo',
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          user?: ManagedUser;
          message?: string;
          error?: string;
        };

        if (!response.ok || !payload.user) {
          setFormError(
            payload.error ||
              'Criação direta de usuários bloqueada até a configuração de fluxo seguro por convite ou definição de senha pelo próprio usuário.'
          );
          return;
        }

        toast.success(payload.message || 'Usuário salvo com sucesso!');
        void logActivity({
          action: 'USUARIO_CRIADO',
          details: `Usuário ${payload.user.email} (${payload.user.perfil}) criado com status ${payload.user.status}.`,
        });
        setIsFormModalOpen(false);
        await loadUsers();
      } catch {
        setFormError('Erro de conexão ao salvar usuário.');
      } finally {
        setSavingForm(false);
      }
      return;
    }

    setSavingForm(true);
    try {
      const response = await authFetch(`/api/users/${encodeURIComponent(editingUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeTrimmed,
          email: emailTrimmed,
          perfil: formPerfil,
          status: formActive ? 'ativo' : 'inativo',
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        user?: ManagedUser;
        error?: string;
      };

      if (!response.ok || !payload.user) {
        setFormError(payload.error || 'Não foi possível atualizar o usuário.');
        return;
      }

      toast.success('Usuário atualizado com sucesso!');
      void logActivity({
        action: 'USUARIO_ATUALIZADO',
        details: `Usuário ${payload.user.email} atualizado (${payload.user.perfil} / ${payload.user.status}).`,
      });
      setIsFormModalOpen(false);
      await loadUsers();
    } catch {
      setFormError('Erro de conexão ao atualizar usuário.');
    } finally {
      setSavingForm(false);
    }
  };

  const handleToggleStatus = async (target: ManagedUser) => {
    if (isCurrentUser(target)) {
      toast.error('Você não pode inativar sua própria conta.');
      return;
    }

    const nextStatus: 'ativo' | 'inativo' = target.status === 'ativo' ? 'inativo' : 'ativo';
    setTogglingId(target.id);
    try {
      const response = await authFetch(`/api/users/${encodeURIComponent(target.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        user?: ManagedUser;
        error?: string;
      };

      if (!response.ok) {
        toast.error(payload.error || 'Não foi possível alterar o status do usuário.');
        return;
      }

      toast.success(
        nextStatus === 'ativo'
          ? `Usuário ${target.nome || target.email} ativado.`
          : `Usuário ${target.nome || target.email} inativado.`
      );
      void logActivity({
        action: nextStatus === 'ativo' ? 'USUARIO_ATIVADO' : 'USUARIO_INATIVADO',
        details: `Status do usuário ${target.email} alterado para ${nextStatus}.`,
      });
      await loadUsers();
    } catch {
      toast.error('Erro de conexão ao atualizar status.');
    } finally {
      setTogglingId(null);
    }
  };

  const openResetModal = (target: ManagedUser) => {
    setResetTarget(target);
    setResetPasswordValue('');
    setShowResetPassword(false);
    setResetError(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);

    const passwordToSet = resetPasswordValue;
    if (passwordToSet.length < 6 || passwordToSet.length > 128) {
      setResetError('Informe uma nova senha válida (entre 6 e 128 caracteres).');
      return;
    }

    setResettingPassword(true);
    try {
      const response = await authFetch(
        `/api/users/${encodeURIComponent(resetTarget.id)}/reset-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: passwordToSet }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setResetError(payload.error || 'Não foi possível redefinir a senha.');
        return;
      }

      toast.success(payload.message || `Senha de ${resetTarget.nome || resetTarget.email} redefinida.`);
      void logActivity({
        action: 'USUARIO_SENHA_RESETADA',
        details: `Senha do usuário ${resetTarget.email} redefinida pelo administrador.`,
      });
      setResetTarget(null);
    } catch {
      setResetError('Erro de conexão ao redefinir a senha.');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingUser(true);
    try {
      const response = await authFetch(`/api/users/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        toast.error(payload.error || 'Não foi possível excluir o usuário.');
        return;
      }

      toast.success(payload.message || 'Usuário excluído com sucesso.');
      void logActivity({
        action: 'USUARIO_EXCLUIDO',
        details: `Usuário ${deleteTarget.email} excluído pelo administrador.`,
      });
      setDeleteTarget(null);
      await loadUsers();
    } catch {
      toast.error('Erro de conexão ao excluir usuário.');
    } finally {
      setDeletingUser(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return users.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!query) return true;
      return (
        item.nome.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        item.perfil.toLowerCase().includes(query)
      );
    });
  }, [users, searchTerm, statusFilter]);

  const counts = useMemo(() => {
    const active = users.filter((u) => u.status === 'ativo').length;
    const inactive = users.length - active;
    return { total: users.length, active, inactive };
  }, [users]);

  if (!authLoading && !isAdmin) {
    return (
      <div className="p-6 md:p-12 max-w-[900px] mx-auto w-full">
        <div className="bg-white border border-rose-200 rounded-3xl p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Lock size={24} />
          </div>
          <h2 className="text-xl font-black text-slate-900">Acesso restrito</h2>
          <p className="text-sm text-slate-600">
            O módulo de Gestão de Usuários é visível e acessível apenas para o perfil Administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-[1400px] mx-auto w-full animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mb-1.5">
            Gestão de <span className="text-emerald-600">Usuários</span>
          </h1>
          <p className="text-slate-500 font-medium text-sm">
            Cadastro, ativação, edição, redefinição de senha e controle de acesso no Supabase
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-emerald-600' : ''} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            <span>+Adicionar usuário</span>
          </button>
        </div>
      </div>

      {/* Stats + Filters */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail ou perfil..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm text-slate-800 outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ativo')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'ativo'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            Ativos ({counts.active})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inativo')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'inativo'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Inativos ({counts.inactive})
          </button>
        </div>
      </div>

      {/* Content */}
      {loading || authLoading ? (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-12 flex flex-col items-center justify-center gap-4 shadow-xs">
          <Loader2 className="text-emerald-500 animate-spin" size={38} />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
            Carregando usuários do Supabase...
          </p>
        </div>
      ) : error ? (
        <div className="bg-white border border-rose-200 rounded-3xl p-8 flex flex-col items-center text-center gap-3 shadow-xs">
          <AlertCircle size={32} className="text-rose-500" />
          <p className="text-sm font-bold text-slate-800">{error}</p>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-2 shadow-xs">
          <UserIcon size={32} className="mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-700">Nenhum usuário encontrado.</p>
          <p className="text-xs text-slate-500">
            Ajuste os filtros ou clique em "+Adicionar usuário" para cadastrar uma nova conta.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <th className="py-3.5 px-5">Usuário</th>
                  <th className="py-3.5 px-4">Perfil</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((item) => {
                  const self = isCurrentUser(item);
                  const isActive = item.status === 'ativo';
                  const isBusy = togglingId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        !isActive ? 'opacity-75 bg-slate-50/40' : ''
                      }`}
                    >
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            <UserIcon size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 truncate">
                                {item.nome || 'Sem nome'}
                              </span>
                              {self && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider">
                                  Você
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate">{item.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${getRoleBadgeClass(
                            item.perfil
                          )}`}
                        >
                          <Shield size={12} />
                          {item.perfil}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isActive ? <CheckCircle2 size={12} /> : <UserX size={12} />}
                          {isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      <td className="py-4 px-5">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openResetModal(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                            title="Resetar senha"
                          >
                            <KeyRound size={13} />
                            <span className="hidden sm:inline">Resetar senha</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                            title="Editar usuário"
                          >
                            <Edit3 size={13} />
                            <span className="hidden sm:inline">Editar</span>
                          </button>

                          <button
                            type="button"
                            disabled={self || isBusy}
                            onClick={() => void handleToggleStatus(item)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                              self
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : isActive
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 cursor-pointer'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 cursor-pointer'
                            }`}
                            title={
                              self
                                ? 'Você não pode inativar sua própria conta'
                                : isActive
                                  ? 'Inativar usuário'
                                  : 'Ativar usuário'
                            }
                          >
                            {isBusy ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : isActive ? (
                              <UserX size={13} />
                            ) : (
                              <UserCheck size={13} />
                            )}
                            <span className="hidden sm:inline">
                              {isActive ? 'Inativar' : 'Ativar'}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={self}
                            onClick={() => setDeleteTarget(item)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                              self
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer'
                            }`}
                            title={
                              self
                                ? 'Você não pode excluir sua própria conta'
                                : 'Excluir usuário'
                            }
                          >
                            <Trash2 size={13} />
                            <span className="hidden sm:inline">Excluir</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Adicionar / Editar Usuário */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  {editingUser ? <Edit3 size={18} /> : <Plus size={18} />}
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight">
                    {editingUser ? 'Editar usuário' : 'Adicionar usuário'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {editingUser
                      ? 'Atualize os dados e permissões no Supabase'
                      : 'Crie e ative o usuário diretamente no Supabase'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                disabled={savingForm}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              {formError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="um-nome" className="block text-xs font-bold text-slate-700">
                  Nome completo
                </label>
                <div className="relative">
                  <UserIcon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="um-nome"
                    type="text"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    placeholder="Ex.: Maria Oliveira"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm outline-none"
                    disabled={savingForm}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="um-email" className="block text-xs font-bold text-slate-700">
                  E-mail de acesso
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="um-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="usuario@sema.mt.gov.br"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm outline-none"
                    disabled={savingForm}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="um-perfil" className="block text-xs font-bold text-slate-700">
                  Perfil de acesso
                </label>
                <select
                  id="um-perfil"
                  value={formPerfil}
                  onChange={(e) => setFormPerfil(e.target.value as UserRole)}
                  disabled={savingForm || Boolean(editingUser && isCurrentUser(editingUser))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium outline-none disabled:opacity-60"
                >
                  <option value="Administrador">Administrador</option>
                  <option value="Analista">Analista</option>
                  <option value="Visualizador">Visualizador</option>
                </select>
                {editingUser && isCurrentUser(editingUser) && (
                  <p className="text-[11px] text-slate-500">
                    Você não pode alterar seu próprio perfil de Administrador.
                  </p>
                )}
              </div>

              {!editingUser && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    A criação direta de usuários está temporariamente bloqueada até a configuração de um fluxo seguro por convite ou definição de senha pelo próprio usuário. Nenhuma conta é criada com senha padrão.
                  </span>
                </div>
              )}

              <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    {editingUser ? 'Usuário ativo no sistema' : 'Ativar usuário ao salvar'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Usuários ativos podem entrar imediatamente no Notifica.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formActive}
                  disabled={!editingUser || savingForm || Boolean(editingUser && isCurrentUser(editingUser))}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer disabled:cursor-not-allowed"
                />
              </label>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={savingForm}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                >
                  {editingUser ? 'Cancelar' : 'Fechar'}
                </button>
                <button
                  type="submit"
                  disabled={!editingUser || savingForm}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                >
                  {savingForm && <Loader2 size={14} className="animate-spin" />}
                  <span>{editingUser ? 'Salvar alterações' : 'Criação bloqueada'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Resetar Senha */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                  <KeyRound size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black tracking-tight">Resetar senha</h2>
                  <p className="text-xs text-slate-400 truncate">
                    {resetTarget.nome || resetTarget.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                disabled={resettingPassword}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              {resetError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{resetError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="um-reset-password" className="block text-xs font-bold text-slate-700">
                  Nova senha temporária para o usuário
                </label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="um-reset-password"
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    placeholder="Digite uma nova senha forte (mínimo 6 caracteres)"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm outline-none"
                    disabled={resettingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  O usuário será obrigado a definir uma nova senha pessoal no próximo acesso.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  disabled={resettingPassword}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                >
                  {resettingPassword && <Loader2 size={14} className="animate-spin" />}
                  <span>Confirmar reset</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Excluir Usuário */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Excluir usuário</h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Deseja excluir permanentemente <strong>{deleteTarget.nome || deleteTarget.email}</strong> ({deleteTarget.email})? O acesso e o perfil no Supabase serão removidos.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deletingUser}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={deletingUser}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                >
                  {deletingUser && <Loader2 size={14} className="animate-spin" />}
                  <span>Excluir usuário</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
