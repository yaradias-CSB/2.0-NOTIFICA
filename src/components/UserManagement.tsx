import React, { useState, useEffect } from 'react';
import { 
  User as UserIcon, 
  Shield, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Power,
  X,
  Save,
  AlertTriangle
} from 'lucide-react';
import { User, UserRole } from '../types';
import { userRepository } from '../data';
import { logActivity } from '../lib/audit';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<Partial<User>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const localUsers = await userRepository.getUsers();
      setUsers(localUsers);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar usuários locais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenModal = (mode: 'add' | 'edit', user?: User) => {
    setModalMode(mode);
    if (mode === 'edit' && user) {
      setSelectedUser({
        ...user,
        matricula: user.matricula || ''
      });
    } else {
      setSelectedUser({
        name: '',
        username: '',
        role: 'Analista',
        active: true,
        matricula: ''
      });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!selectedUser.name || !selectedUser.username) {
      setError('Nome e Email são obrigatórios');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const userData: Omit<User, 'id'> = {
        name: selectedUser.name.trim(),
        username: selectedUser.username.trim(),
        role: selectedUser.role || 'Analista',
        active: selectedUser.active !== undefined ? selectedUser.active : true,
        matricula: selectedUser.matricula ? selectedUser.matricula.trim() : undefined,
      };

      if (modalMode === 'add') {
        await userRepository.createUser(userData);
        logActivity({
          action: 'CREATE_USER',
          details: `Novo usuário cadastrado: ${userData.name || '---'} (${userData.username}). Perfil: ${userData.role}.`
        });
      } else if (selectedUser.id) {
        await userRepository.updateUser(selectedUser.id, userData);
        logActivity({
          action: 'UPDATE_USER',
          details: `Dados do usuário atualizados: ${userData.name || '---'} (${userData.username}). Perfil: ${userData.role}, Ativo: ${userData.active}.`
        });
      }

      await fetchUsers();
      setIsModalOpen(false);
    } catch (err: any) {
      console.warn('Notice saving user:', err);
      setError(err.message || 'Erro ao salvar usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await userRepository.updateUser(user.id, { active: !user.active });
      await fetchUsers();
    } catch (err) {
      console.warn('Error toggling status:', err);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const userToDelete = users.find(u => u.id === id);
      await userRepository.deleteUser(id);

      if (userToDelete) {
        logActivity({
          action: 'DELETE_USER',
          details: `Usuário excluído: ${userToDelete.name || '---'} (${userToDelete.username}). Perfil original: ${userToDelete.role}.`
        });
      }

      await fetchUsers();
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Erro ao excluir usuário');
    }
  };

  const filteredUsers = users.filter(user => 
    (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.matricula || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 md:p-12 max-w-[1200px] mx-auto w-full animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6 mb-8 sm:mb-12">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mb-1.5 sm:mb-2">
            Gestão de <span className="text-emerald-600">Usuários</span>
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-slate-500 font-medium">Cadastro de perfis técnicos e equipe do sistema</p>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Buscar por nome ou email..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => handleOpenModal('add')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus size={20} />
            Novo Usuário
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="text-emerald-500 animate-spin" size={48} />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando usuários...</p>
        </div>
      ) : error && users.length === 0 ? (
        <div className="bg-white border border-red-100 rounded-[2.5rem] p-12 text-center shadow-sm">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mx-auto mb-6">
            <AlertTriangle size={40} />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2">Erro ao carregar usuários</h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">{error}</p>
          <div className="flex flex-col items-center gap-4">
            <button 
              onClick={fetchUsers}
              className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-12 text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 mx-auto mb-6">
            <UserIcon size={40} />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2">Nenhum usuário cadastrado</h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">Não há usuários cadastrados no armazenamento local do navegador.</p>
          <button 
            onClick={() => handleOpenModal('add')}
            className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
          >
            Cadastrar Primeiro Usuário
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
              Nenhum usuário corresponde à sua busca
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user.id} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 group relative overflow-hidden">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors">
                    <UserIcon size={24} />
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                    user.role === 'Administrador' ? 'bg-purple-100 text-purple-600' : 
                    user.role === 'Analista' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Shield size={12} />
                    {user.role}
                  </div>
                </div>
                
                <div className="space-y-1.5 mb-6">
                  <h3 className="font-black text-slate-900 tracking-tight truncate">{user.name}</h3>
                  <p className="text-xs text-slate-400 font-medium truncate">{user.username}</p>
                  {user.matricula && String(user.matricula).trim() !== '' && (
                    <div className="pt-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                          Matrícula:
                        </span>
                        <span className="text-xs font-bold font-mono text-emerald-700">
                          {user.matricula}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-2">
                    {user.active ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                        <CheckCircle size={14} /> Ativo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[10px] font-black text-red-500 uppercase tracking-widest">
                        <XCircle size={14} /> Inativo
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleOpenModal('edit', user)}
                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                      title="Editar Cadastro"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleToggleStatus(user)}
                      className={`p-2 rounded-xl transition-all ${user.active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                      title={user.active ? "Desativar Perfil" : "Ativar Perfil"}
                    >
                      <Power size={18} />
                    </button>
                    <button 
                      onClick={() => setDeleteConfirm(user.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="Excluir Usuário"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Delete Confirmation Overlay */}
                {deleteConfirm === user.id && (
                  <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
                    <AlertTriangle className="text-red-500 mb-2" size={32} />
                    <p className="text-sm font-bold text-slate-900 mb-4">Excluir este usuário permanentemente?</p>
                    <div className="flex gap-2 w-full">
                      <button 
                        onClick={() => setDeleteConfirm(null)}
                        className="flex-1 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(user.id)}
                        className="flex-1 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md max-h-[92dvh] rounded-2xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-5 sm:p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {modalMode === 'add' ? 'Novo' : 'Editar'} <span className="text-emerald-600">Usuário</span>
                </h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Informações de acesso</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-slate-900 transition-all shadow-sm"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-5 sm:p-8 space-y-6 overflow-y-auto flex-1">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-2xl flex items-center gap-3">
                  <AlertTriangle size={18} />
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input 
                    type="text"
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium"
                    placeholder="Ex: João Silva"
                    value={selectedUser.name || ''}
                    onChange={(e) => setSelectedUser({...selectedUser, name: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail / Usuário</label>
                  <input 
                    type="email"
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium"
                    placeholder="Ex: joao@sema.mt.gov.br"
                    value={selectedUser.username || ''}
                    onChange={(e) => setSelectedUser({...selectedUser, username: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Matrícula</label>
                  <input 
                    type="text"
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium font-mono"
                    placeholder="Ex: 123456"
                    value={selectedUser.matricula || ''}
                    onChange={(e) => setSelectedUser({...selectedUser, matricula: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Perfil</label>
                    <select 
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-bold text-slate-700"
                      value={selectedUser.role}
                      onChange={(e) => setSelectedUser({...selectedUser, role: e.target.value as UserRole})}
                    >
                      <option value="Analista">Analista</option>
                      <option value="Administrador">Administrador</option>
                      <option value="Visualizador">Visualizador</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Status</label>
                    <div className="flex items-center h-[54px] px-5 bg-slate-50 border border-slate-200 rounded-2xl">
                      <label className="flex items-center gap-3 cursor-pointer w-full">
                        <input 
                          type="checkbox"
                          className="w-5 h-5 rounded-lg border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          checked={selectedUser.active}
                          onChange={(e) => setSelectedUser({...selectedUser, active: e.target.checked})}
                        />
                        <span className="text-sm font-bold text-slate-700">{selectedUser.active ? 'Ativo' : 'Inativo'}</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-8 bg-slate-50/50 border-t border-slate-100 flex gap-3 sm:gap-4 shrink-0">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveUser}
                disabled={isSubmitting}
                className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {modalMode === 'add' ? 'Criar Usuário' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
