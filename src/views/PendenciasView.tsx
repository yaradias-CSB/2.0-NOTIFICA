import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit3,
  History,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { DataContext } from '../contexts/DataContext';
import { EcosystemContext } from '../contexts/EcosystemContext';
import { pendenciasRepository } from '../data/pendenciasRepository';
import { sanitizeString } from '../lib/security';
import {
  PendenciaCurrentUser,
  PendenciaHistoricoRecord,
  PendenciaRecord,
  PendenciaSituacao,
  PendenciaUsuarioOption,
} from '../types/pendencias';

type PendenciasTab = 'minhas' | 'geral' | 'direcionado';

const SITUACAO_LABELS: Record<PendenciaSituacao, string> = {
  aberta: 'Aberta',
  direcionada: 'Direcionada',
  em_analise: 'Em análise',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
};

const SITUACAO_STYLES: Record<PendenciaSituacao, string> = {
  aberta: 'bg-amber-50 text-amber-700 border-amber-200',
  direcionada: 'bg-blue-50 text-blue-700 border-blue-200',
  em_analise: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  resolvida: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelada: 'bg-slate-100 text-slate-600 border-slate-200',
};

const ACAO_LABELS: Record<string, string> = {
  criacao: 'Criação',
  direcionamento: 'Direcionamento',
  mudanca_situacao: 'Mudança de situação',
  edicao: 'Edição',
  resolucao: 'Resolução',
};

const CAMPO_LABELS: Record<string, string> = {
  tipo: 'Tipo',
  titulo: 'Título',
  descricao: 'Descrição',
  situacao: 'Situação',
  responsavel_id: 'Responsável',
  tipo_referencia: 'Tipo de referência',
  referencia_id: 'Referência',
  origem_ref_id: 'Referência de origem',
  empreendedor_id: 'Empreendedor',
  barragem_id: 'Barragem',
};

const TIPOS_PENDENCIA = [
  'Documental',
  'Análise Técnica',
  'Cadastro / SNISB',
  'Notificação',
  'Ofício de Pendência',
  'Fiscalização',
  'Geral',
];

const TIPOS_REFERENCIA = [
  { value: '', label: 'Sem referência' },
  { value: 'parecer', label: 'Parecer Técnico' },
  { value: 'oficio', label: 'Ofício' },
  { value: 'notificacao', label: 'Notificação' },
  { value: 'empreendedor', label: 'Empreendedor' },
  { value: 'barragem', label: 'Barragem' },
  { value: 'outro', label: 'Outro' },
];

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PendenciasView: React.FC = () => {
  const { isAdmin, canEdit, profile, user } = useAuth();
  const { pareceres, oficios, notificacoes } = useContext(DataContext);
  const { empreendedores, barragens } = useContext(EcosystemContext);

  const [activeTab, setActiveTab] = useState<PendenciasTab>('minhas');
  const [pendencias, setPendencias] = useState<PendenciaRecord[]>([]);
  const [usuarios, setUsuarios] = useState<PendenciaUsuarioOption[]>([]);
  const [currentUser, setCurrentUser] = useState<PendenciaCurrentUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [situacaoFilter, setSituacaoFilter] = useState<string>('TODAS');

  // Form Modal (Create / Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PendenciaRecord | null>(null);
  const [formTipo, setFormTipo] = useState('Documental');
  const [formTitulo, setFormTitulo] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formSituacao, setFormSituacao] = useState<PendenciaSituacao>('aberta');
  const [formResponsavelId, setFormResponsavelId] = useState('');
  const [formTipoRef, setFormTipoRef] = useState('');
  const [formReferenciaId, setFormReferenciaId] = useState('');
  const [formOrigemRefId, setFormOrigemRefId] = useState('');
  const [formEmpreendedorId, setFormEmpreendedorId] = useState('');
  const [formBarragemId, setFormBarragemId] = useState('');
  const [formMotivo, setFormMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Action Modal (Direcionar / Resolver / Alterar Situação)
  const [actionModal, setActionModal] = useState<{
    mode: 'direcionar' | 'resolver' | 'situacao';
    item: PendenciaRecord;
  } | null>(null);
  const [actionRespId, setActionRespId] = useState('');
  const [actionSituacao, setActionSituacao] = useState<PendenciaSituacao>('em_analise');
  const [actionMotivo, setActionMotivo] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // History Modal (read-only)
  const [historyItem, setHistoryItem] = useState<PendenciaRecord | null>(null);
  const [historyRows, setHistoryRows] = useState<PendenciaHistoricoRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadPendencias = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await pendenciasRepository.list();
      setPendencias(Array.isArray(res.items) ? res.items : []);
      setUsuarios(Array.isArray(res.usuarios) ? res.usuarios : []);
      setCurrentUser(res.currentUser || null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar o módulo de pendências.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendencias();
  }, [loadPendencias]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'direcionado') {
      setActiveTab('minhas');
    }
  }, [isAdmin, activeTab]);

  const isAssignedToCurrentUser = useCallback(
    (item: PendenciaRecord): boolean => {
      const respId = String(item.responsavel_id || '').trim();
      if (!respId) return false;
      const sessionIds = new Set(
        [currentUser?.id, currentUser?.perfilId, user?.id, profile?.id]
          .map((v) => String(v || '').trim())
          .filter(Boolean)
      );
      return sessionIds.has(respId);
    },
    [currentUser, user?.id, profile?.id]
  );

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usuarios) {
      map.set(u.id, u.nome);
    }
    if (currentUser) {
      if (currentUser.id && !map.has(currentUser.id)) map.set(currentUser.id, currentUser.nome);
      if (currentUser.perfilId && !map.has(currentUser.perfilId)) {
        map.set(currentUser.perfilId, currentUser.nome);
      }
    }
    return map;
  }, [usuarios, currentUser]);

  const empreendedorLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of empreendedores) {
      if (e.id) map.set(e.id, e.nome);
    }
    return map;
  }, [empreendedores]);

  const barragemLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of barragens) {
      if (b.id) {
        map.set(b.id, b.municipio ? `${b.nomeBarragem} (${b.municipio})` : b.nomeBarragem);
      }
    }
    return map;
  }, [barragens]);

  const referenciaOptions = useMemo(() => {
    if (formTipoRef === 'parecer') {
      return pareceres
        .filter((p) => p.id)
        .map((p) => ({
          id: p.id!,
          label: `${p.numParecerTecnico || 'S/N'} — ${p.processo || p.nomeBarragem || p.identificacaoEmpreendedor || p.id}`,
        }));
    }
    if (formTipoRef === 'oficio') {
      return oficios
        .filter((o) => o.id)
        .map((o) => ({
          id: o.id!,
          label: `${o.protocolo || 'S/N'} — ${o.empreendimento || o.interessado || o.id}`,
        }));
    }
    if (formTipoRef === 'notificacao') {
      return notificacoes
        .filter((n) => n.id)
        .map((n) => ({
          id: n.id!,
          label: `${n.notificacaoGerada || n.numProcesso || 'S/N'} — ${n.empreendedorNome || n.nomeFantasia || n.id}`,
        }));
    }
    if (formTipoRef === 'empreendedor') {
      return empreendedores
        .filter((e) => e.id)
        .map((e) => ({ id: e.id, label: e.nome }));
    }
    if (formTipoRef === 'barragem') {
      return barragens
        .filter((b) => b.id)
        .map((b) => ({
          id: b.id,
          label: b.municipio ? `${b.nomeBarragem} — ${b.municipio}` : b.nomeBarragem,
        }));
    }
    return [];
  }, [formTipoRef, pareceres, oficios, notificacoes, empreendedores, barragens]);

  const tabCounts = useMemo(() => {
    const minhas = pendencias.filter((p) => isAssignedToCurrentUser(p)).length;
    const geral = pendencias.length;
    const direcionado = pendencias.filter((p) => Boolean(p.responsavel_id)).length;
    return { minhas, geral, direcionado };
  }, [pendencias, isAssignedToCurrentUser]);

  const visiblePendencias = useMemo(() => {
    let base = pendencias;
    if (activeTab === 'minhas') {
      base = pendencias.filter((p) => isAssignedToCurrentUser(p));
    } else if (activeTab === 'direcionado') {
      base = pendencias.filter((p) => Boolean(p.responsavel_id));
    }

    const q = searchTerm.trim().toLowerCase();
    return base.filter((item) => {
      if (situacaoFilter !== 'TODAS' && item.situacao !== situacaoFilter) {
        return false;
      }
      if (!q) return true;
      const respName = item.responsavel_id ? (userNameMap.get(item.responsavel_id) || '') : '';
      const empName = item.empreendedor_id ? (empreendedorLabelMap.get(item.empreendedor_id) || '') : '';
      const barName = item.barragem_id ? (barragemLabelMap.get(item.barragem_id) || '') : '';
      const haystack = [
        item.titulo,
        item.descricao,
        item.tipo,
        item.origem,
        item.origem_ref_id,
        item.referencia_id,
        respName,
        empName,
        barName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    pendencias,
    activeTab,
    isAssignedToCurrentUser,
    situacaoFilter,
    searchTerm,
    userNameMap,
    empreendedorLabelMap,
    barragemLabelMap,
  ]);

  const canModifyRecord = useCallback(
    (item: PendenciaRecord): boolean => {
      if (!canEdit) return false;
      if (isAdmin) return true;
      if (!item.responsavel_id) return true;
      return isAssignedToCurrentUser(item);
    },
    [canEdit, isAdmin, isAssignedToCurrentUser]
  );

  const openCreateModal = () => {
    setEditingItem(null);
    setFormTipo('Documental');
    setFormTitulo('');
    setFormDescricao('');
    setFormSituacao('aberta');
    setFormResponsavelId('');
    setFormTipoRef('');
    setFormReferenciaId('');
    setFormOrigemRefId('');
    setFormEmpreendedorId('');
    setFormBarragemId('');
    setFormMotivo('');
    setIsFormOpen(true);
  };

  const openEditModal = (item: PendenciaRecord) => {
    setEditingItem(item);
    setFormTipo(item.tipo || 'Geral');
    setFormTitulo(item.titulo || '');
    setFormDescricao(item.descricao || '');
    setFormSituacao(item.situacao || 'aberta');
    setFormResponsavelId(item.responsavel_id || '');
    setFormTipoRef(item.tipo_referencia || '');
    setFormReferenciaId(item.referencia_id || '');
    setFormOrigemRefId(item.origem_ref_id || '');
    setFormEmpreendedorId(item.empreendedor_id || '');
    setFormBarragemId(item.barragem_id || '');
    setFormMotivo('');
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = sanitizeString(formTitulo);
    if (!cleanTitle) {
      toast.error('Informe o título da pendência.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        await pendenciasRepository.update(editingItem.id, {
          tipo: sanitizeString(formTipo) || 'Geral',
          titulo: cleanTitle,
          descricao: formDescricao.trim() ? sanitizeString(formDescricao) : null,
          situacao: formSituacao,
          ...(isAdmin ? { responsavel_id: formResponsavelId.trim() || null } : {}),
          tipo_referencia: formTipoRef.trim() || null,
          referencia_id: formReferenciaId.trim() || null,
          origem_ref_id: formOrigemRefId.trim() || null,
          empreendedor_id: formEmpreendedorId.trim() || null,
          barragem_id: formBarragemId.trim() || null,
          motivo: formMotivo.trim() ? sanitizeString(formMotivo) : undefined,
        });
        toast.success('Pendência atualizada com sucesso.');
      } else {
        await pendenciasRepository.create({
          tipo: sanitizeString(formTipo) || 'Geral',
          titulo: cleanTitle,
          descricao: formDescricao.trim() ? sanitizeString(formDescricao) : undefined,
          situacao: isAdmin ? formSituacao : formSituacao === 'direcionada' ? 'aberta' : formSituacao,
          ...(isAdmin && formResponsavelId.trim()
            ? { responsavel_id: formResponsavelId.trim() }
            : {}),
          tipo_referencia: formTipoRef.trim() || null,
          referencia_id: formReferenciaId.trim() || null,
          origem_ref_id: formOrigemRefId.trim() || null,
          empreendedor_id: formEmpreendedorId.trim() || null,
          barragem_id: formBarragemId.trim() || null,
          motivo: formMotivo.trim() ? sanitizeString(formMotivo) : undefined,
        });
        toast.success('Pendência criada com sucesso.');
      }
      setIsFormOpen(false);
      await loadPendencias();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar pendência.');
    } finally {
      setSubmitting(false);
    }
  };

  const openActionModal = (mode: 'direcionar' | 'resolver' | 'situacao', item: PendenciaRecord) => {
    setActionModal({ mode, item });
    setActionRespId(item.responsavel_id || '');
    setActionSituacao(mode === 'resolver' ? 'resolvida' : item.situacao);
    setActionMotivo('');
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;

    setActionSubmitting(true);
    try {
      if (actionModal.mode === 'direcionar') {
        await pendenciasRepository.update(actionModal.item.id, {
          responsavel_id: actionRespId.trim() || null,
          motivo: actionMotivo.trim() ? sanitizeString(actionMotivo) : undefined,
        });
        toast.success('Direcionamento atualizado com sucesso.');
      } else if (actionModal.mode === 'resolver') {
        await pendenciasRepository.update(actionModal.item.id, {
          situacao: 'resolvida',
          motivo: actionMotivo.trim() ? sanitizeString(actionMotivo) : undefined,
        });
        toast.success('Pendência marcada como resolvida.');
      } else {
        await pendenciasRepository.update(actionModal.item.id, {
          situacao: actionSituacao,
          motivo: actionMotivo.trim() ? sanitizeString(actionMotivo) : undefined,
        });
        toast.success('Situação atualizada com sucesso.');
      }
      setActionModal(null);
      await loadPendencias();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao atualizar pendência.');
    } finally {
      setActionSubmitting(false);
    }
  };

  const openHistoryModal = async (item: PendenciaRecord) => {
    setHistoryItem(item);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryRows([]);
    try {
      const rows = await pendenciasRepository.getHistorico(item.id);
      setHistoryRows(rows);
    } catch (err: any) {
      setHistoryError(err?.message || 'Falha ao carregar histórico.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatHistoryValue = (campo?: string | null, value?: string | null): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (campo === 'responsavel_id') return userNameMap.get(value) || value;
    if (campo === 'empreendedor_id') return empreendedorLabelMap.get(value) || value;
    if (campo === 'barragem_id') return barragemLabelMap.get(value) || value;
    if (campo === 'situacao' && value in SITUACAO_LABELS) {
      return SITUACAO_LABELS[value as PendenciaSituacao];
    }
    return value;
  };

  const renderUserLabel = (userId?: string | null): string => {
    if (!userId) return 'Não atribuído';
    return userNameMap.get(userId) || userId;
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto w-full space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ClipboardList size={20} />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">
              Notifica CSB • Fluxo Interno
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Módulo de Pendências</h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            Gerenciamento e rastreabilidade de pendências com registro histórico imutável de criação, direcionamento, edição e resolução.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadPendencias()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-emerald-400' : ''} />
            <span>Atualizar</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>Nova Pendência</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs + Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('minhas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'minhas'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <UserCheck size={15} />
            <span>Minhas pendências</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                activeTab === 'minhas' ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
              }`}
            >
              {tabCounts.minhas}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('geral')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'geral'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ClipboardList size={15} />
            <span>Lista geral</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                activeTab === 'geral' ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
              }`}
            >
              {tabCounts.geral}
            </span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('direcionado')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'direcionado'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Send size={15} />
              <span>Direcionado</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  activeTab === 'direcionado' ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                }`}
              >
                {tabCounts.direcionado}
              </span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título, descrição, tipo, responsável, empreendedor ou barragem..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
          <div className="md:col-span-4">
            <select
              value={situacaoFilter}
              onChange={(e) => setSituacaoFilter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            >
              <option value="TODAS">Todas as situações</option>
              <option value="aberta">Aberta</option>
              <option value="direcionada">Direcionada</option>
              <option value="em_analise">Em análise</option>
              <option value="resolvida">Resolvida</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content States */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 size={28} className="animate-spin text-emerald-600" />
          <p className="text-sm font-bold">Carregando pendências...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 rounded-2xl border border-rose-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black text-rose-900">Erro ao carregar pendências</h3>
              <p className="text-xs text-rose-700 mt-1">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadPendencias()}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      ) : visiblePendencias.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
            <Inbox size={24} />
          </div>
          <h3 className="text-base font-black text-slate-800">Nenhuma pendência encontrada</h3>
          <p className="text-xs text-slate-500 max-w-md">
            {activeTab === 'minhas'
              ? 'Não há pendências direcionadas para o seu usuário com os filtros atuais.'
              : activeTab === 'direcionado'
                ? 'Não há pendências atribuídas a responsáveis no momento.'
                : 'Nenhuma pendência registrada com os critérios selecionados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePendencias.map((item) => {
            const situacaoStyle = SITUACAO_STYLES[item.situacao] || SITUACAO_STYLES.aberta;
            const situacaoLabel = SITUACAO_LABELS[item.situacao] || item.situacao;
            const editable = canModifyRecord(item);
            const isClosed = item.situacao === 'resolvida' || item.situacao === 'cancelada';

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all p-5 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black uppercase tracking-wider border ${situacaoStyle}`}
                      >
                        {situacaoLabel}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {item.tipo || 'Geral'}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Origem: {item.origem || 'NOTIFICA'}
                      </span>
                      {!item.responsavel_id && !isClosed && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Sem responsável
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-black text-slate-900 break-words">
                      {item.titulo}
                    </h3>

                    {item.descricao && (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                        {item.descricao}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1 text-xs text-slate-500">
                      <span>
                        <strong className="text-slate-700">Responsável:</strong>{' '}
                        {renderUserLabel(item.responsavel_id)}
                      </span>
                      <span>
                        <strong className="text-slate-700">Criado por:</strong>{' '}
                        {renderUserLabel(item.criado_por)}
                      </span>
                      {item.empreendedor_id && (
                        <span>
                          <strong className="text-slate-700">Empreendedor:</strong>{' '}
                          {empreendedorLabelMap.get(item.empreendedor_id) || item.empreendedor_id}
                        </span>
                      )}
                      {item.barragem_id && (
                        <span>
                          <strong className="text-slate-700">Barragem:</strong>{' '}
                          {barragemLabelMap.get(item.barragem_id) || item.barragem_id}
                        </span>
                      )}
                      {item.tipo_referencia && (
                        <span>
                          <strong className="text-slate-700">Ref.:</strong>{' '}
                          {item.tipo_referencia}
                          {item.referencia_id ? ` (${item.referencia_id})` : ''}
                        </span>
                      )}
                      {item.origem_ref_id && (
                        <span>
                          <strong className="text-slate-700">Ref. Origem:</strong>{' '}
                          {item.origem_ref_id}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} className="text-slate-400" />
                        <span>Atualizado em {formatDateTime(item.updated_at || item.created_at)}</span>
                      </span>
                      {item.resolvido_em && (
                        <span className="text-emerald-700 font-semibold">
                          Resolvida por {renderUserLabel(item.resolvido_por)} em{' '}
                          {formatDateTime(item.resolvido_em)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void openHistoryModal(item)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <History size={14} />
                      <span>Histórico</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => openActionModal('direcionar', item)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Send size={14} />
                        <span>{item.responsavel_id ? 'Alterar responsável' : 'Direcionar'}</span>
                      </button>
                    )}

                    {editable && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Edit3 size={14} />
                          <span>Editar</span>
                        </button>

                        {item.situacao !== 'resolvida' && (
                          <button
                            type="button"
                            onClick={() => openActionModal('resolver', item)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                          >
                            <CheckCircle2 size={14} />
                            <span>Resolver</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-black text-slate-900">
                {editingItem ? 'Editar Pendência' : 'Nova Pendência'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Origem
                  </label>
                  <input
                    type="text"
                    value={editingItem?.origem || 'NOTIFICA'}
                    disabled
                    className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Tipo *
                  </label>
                  <select
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  >
                    {TIPOS_PENDENCIA.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Título *
                </label>
                <input
                  type="text"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="Descreva resumidamente a pendência"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Descrição
                </label>
                <textarea
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  rows={3}
                  placeholder="Detalhes técnicos ou orientações (não inclua CPF/CNPJ)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Situação
                  </label>
                  <select
                    value={formSituacao}
                    onChange={(e) => setFormSituacao(e.target.value as PendenciaSituacao)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  >
                    <option value="aberta">Aberta</option>
                    {(isAdmin || editingItem?.situacao === 'direcionada') && (
                      <option value="direcionada">Direcionada</option>
                    )}
                    <option value="em_analise">Em análise</option>
                    <option value="resolvida">Resolvida</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>

                {isAdmin && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Responsável (Administrador)
                    </label>
                    <select
                      value={formResponsavelId}
                      onChange={(e) => setFormResponsavelId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    >
                      <option value="">Sem responsável atribuído</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome} ({u.perfil})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* References by ID only */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Tipo de Referência
                  </label>
                  <select
                    value={formTipoRef}
                    onChange={(e) => {
                      setFormTipoRef(e.target.value);
                      setFormReferenciaId('');
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  >
                    {TIPOS_REFERENCIA.map((tr) => (
                      <option key={tr.value} value={tr.value}>
                        {tr.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    ID de Referência
                  </label>
                  {referenciaOptions.length > 0 ? (
                    <select
                      value={formReferenciaId}
                      onChange={(e) => setFormReferenciaId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    >
                      <option value="">Selecione um registro...</option>
                      {referenciaOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formReferenciaId}
                      onChange={(e) => setFormReferenciaId(e.target.value)}
                      placeholder="ID do registro referenciado"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Empreendedor (ID)
                  </label>
                  <select
                    value={formEmpreendedorId}
                    onChange={(e) => setFormEmpreendedorId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  >
                    <option value="">Nenhum empreendedor vinculado</option>
                    {empreendedores.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Barragem (ID)
                  </label>
                  <select
                    value={formBarragemId}
                    onChange={(e) => setFormBarragemId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  >
                    <option value="">Nenhuma barragem vinculada</option>
                    {barragens.map((bar) => (
                      <option key={bar.id} value={bar.id}>
                        {bar.municipio ? `${bar.nomeBarragem} (${bar.municipio})` : bar.nomeBarragem}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  ID de Referência da Origem (opcional)
                </label>
                <input
                  type="text"
                  value={formOrigemRefId}
                  onChange={(e) => setFormOrigemRefId(e.target.value)}
                  placeholder="Identificador na origem (se aplicável)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Motivo / Observação no histórico (opcional)
                </label>
                <input
                  type="text"
                  value={formMotivo}
                  onChange={(e) => setFormMotivo(e.target.value)}
                  placeholder="Justificativa registrada no histórico da pendência"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  <span>{editingItem ? 'Salvar Alterações' : 'Criar Pendência'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Modal (Direcionar / Resolver) */}
      {actionModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-black text-slate-900">
                {actionModal.mode === 'direcionar'
                  ? 'Direcionar Pendência'
                  : actionModal.mode === 'resolver'
                    ? 'Resolver Pendência'
                    : 'Alterar Situação'}
              </h2>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleActionSubmit} className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-black text-slate-800">{actionModal.item.titulo}</p>
              </div>

              {actionModal.mode === 'direcionar' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Responsável
                  </label>
                  <select
                    value={actionRespId}
                    onChange={(e) => setActionRespId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  >
                    <option value="">Remover atribuição (sem responsável)</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome} ({u.perfil})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {actionModal.mode === 'situacao' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Nova Situação
                  </label>
                  <select
                    value={actionSituacao}
                    onChange={(e) => setActionSituacao(e.target.value as PendenciaSituacao)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  >
                    <option value="aberta">Aberta</option>
                    {isAdmin && <option value="direcionada">Direcionada</option>}
                    <option value="em_analise">Em análise</option>
                    <option value="resolvida">Resolvida</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Motivo / Despacho
                </label>
                <textarea
                  value={actionMotivo}
                  onChange={(e) => setActionMotivo(e.target.value)}
                  rows={3}
                  placeholder="Informe o motivo ou despacho para registro no histórico..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionSubmitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {actionSubmitting && <Loader2 size={14} className="animate-spin" />}
                  <span>Confirmar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Read-Only History Modal */}
      {historyItem && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900">Histórico da Pendência</h2>
                <p className="text-xs text-slate-500 truncate max-w-md">{historyItem.titulo}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryItem(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              {historyLoading ? (
                <div className="py-10 flex flex-col items-center gap-2 text-slate-500">
                  <Loader2 size={24} className="animate-spin text-emerald-600" />
                  <span className="text-xs font-bold">Carregando histórico...</span>
                </div>
              ) : historyError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {historyError}
                </div>
              ) : historyRows.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  Nenhum registro encontrado no histórico desta pendência.
                </div>
              ) : (
                historyRows.map((row) => (
                  <div
                    key={row.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                          {ACAO_LABELS[row.acao] || row.acao}
                        </span>
                        {row.campo && (
                          <span className="text-xs font-bold text-slate-700">
                            Campo: {CAMPO_LABELS[row.campo] || row.campo}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-slate-500">
                        {formatDateTime(row.created_at)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">
                      <strong className="text-slate-800">Usuário:</strong>{' '}
                      {renderUserLabel(row.usuario_id)}
                    </p>

                    {(row.valor_anterior !== null && row.valor_anterior !== undefined && row.valor_anterior !== '') ||
                    (row.valor_novo !== null && row.valor_novo !== undefined && row.valor_novo !== '') ? (
                      <p className="text-xs text-slate-600 break-words">
                        <strong className="text-slate-800">Alteração:</strong>{' '}
                        <span className="text-slate-500">
                          {formatHistoryValue(row.campo, row.valor_anterior)}
                        </span>{' '}
                        →{' '}
                        <span className="font-bold text-slate-800">
                          {formatHistoryValue(row.campo, row.valor_novo)}
                        </span>
                      </p>
                    ) : null}

                    {row.motivo && (
                      <p className="text-xs text-slate-700 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <strong>Motivo:</strong> {row.motivo}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
