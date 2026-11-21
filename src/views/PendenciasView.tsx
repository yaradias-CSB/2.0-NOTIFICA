import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ClipboardList,
  Clock,
  History,
  Inbox,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { EcosystemContext } from '../contexts/EcosystemContext';
import { pendenciasRepository } from '../data/pendenciasRepository';
import {
  PendenciaCurrentUser,
  PendenciaHistoricoRecord,
  PendenciaRecord,
  PendenciaSituacao,
  PendenciasTab,
  PendenciaUsuarioOption,
} from '../types/pendencias';

const DEFAULT_READ_ONLY_REASON =
  'Módulo em modo somente leitura: criação, edição, direcionamento, mudança de situação e resolução estão temporariamente bloqueados no servidor até haver mecanismo transacional atômico entre pendências e histórico.';

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

export function getAvailablePendenciaTabs(isAdmin: boolean): PendenciasTab[] {
  return isAdmin ? ['minhas', 'geral', 'direcionado'] : ['minhas', 'geral'];
}

export function isAssignedToCanonicalSessionUser(
  item: PendenciaRecord,
  canonicalUserId?: string | null
): boolean {
  const sessionId = String(canonicalUserId || '').trim();
  const respId = String(item.responsavel_id || '').trim();
  return Boolean(sessionId && respId && respId === sessionId);
}

export function filterPendenciasByTab(
  items: PendenciaRecord[],
  tab: PendenciasTab,
  canonicalUserId: string | null | undefined,
  isAdmin: boolean
): PendenciaRecord[] {
  if (tab === 'minhas') {
    return items.filter((item) => isAssignedToCanonicalSessionUser(item, canonicalUserId));
  }
  if (tab === 'direcionado') {
    if (!isAdmin) return [];
    return items.filter((item) => Boolean(item.responsavel_id));
  }
  return items;
}

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
  const { isAdmin } = useAuth();
  const { empreendedores, barragens } = useContext(EcosystemContext);

  const [activeTab, setActiveTab] = useState<PendenciasTab>('minhas');
  const [pendencias, setPendencias] = useState<PendenciaRecord[]>([]);
  const [usuarios, setUsuarios] = useState<PendenciaUsuarioOption[]>([]);
  const [currentUser, setCurrentUser] = useState<PendenciaCurrentUser | null>(null);
  const [readOnlyReason, setReadOnlyReason] = useState<string>(DEFAULT_READ_ONLY_REASON);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [situacaoFilter, setSituacaoFilter] = useState<string>('TODAS');

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
      if (res.readOnlyReason) {
        setReadOnlyReason(res.readOnlyReason);
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar o módulo de pendências.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendencias();
  }, [loadPendencias]);

  const effectiveIsAdmin = currentUser ? currentUser.perfil === 'Administrador' : isAdmin;
  const availableTabs = useMemo(
    () => getAvailablePendenciaTabs(effectiveIsAdmin),
    [effectiveIsAdmin]
  );

  useEffect(() => {
    if (!effectiveIsAdmin && activeTab === 'direcionado') {
      setActiveTab('minhas');
    }
  }, [effectiveIsAdmin, activeTab]);

  const canonicalUserId = currentUser?.id || null;

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usuarios) {
      map.set(u.id, u.nome);
    }
    if (currentUser?.id && !map.has(currentUser.id)) {
      map.set(currentUser.id, currentUser.nome);
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

  const tabCounts = useMemo(() => {
    const minhas = filterPendenciasByTab(pendencias, 'minhas', canonicalUserId, effectiveIsAdmin).length;
    const geral = filterPendenciasByTab(pendencias, 'geral', canonicalUserId, effectiveIsAdmin).length;
    const direcionado = effectiveIsAdmin
      ? filterPendenciasByTab(pendencias, 'direcionado', canonicalUserId, true).length
      : 0;
    return { minhas, geral, direcionado };
  }, [pendencias, canonicalUserId, effectiveIsAdmin]);

  const visiblePendencias = useMemo(() => {
    const base = filterPendenciasByTab(pendencias, activeTab, canonicalUserId, effectiveIsAdmin);

    const q = searchTerm.trim().toLowerCase();
    return base.filter((item) => {
      if (situacaoFilter !== 'TODAS' && item.situacao !== situacaoFilter) {
        return false;
      }
      if (!q) return true;
      const respName = item.responsavel_id ? userNameMap.get(item.responsavel_id) || '' : '';
      const empName = item.empreendedor_id ? empreendedorLabelMap.get(item.empreendedor_id) || '' : '';
      const barName = item.barragem_id ? barragemLabelMap.get(item.barragem_id) || '' : '';
      const haystack = [
        item.titulo,
        item.descricao,
        item.tipo,
        item.origem,
        item.origem_ref_id,
        item.referencia_id,
        item.empreendedor_id,
        item.barragem_id,
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
    canonicalUserId,
    effectiveIsAdmin,
    situacaoFilter,
    searchTerm,
    userNameMap,
    empreendedorLabelMap,
    barragemLabelMap,
  ]);

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
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ClipboardList size={20} />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">
              Notifica CSB • Consulta de Pendências
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase tracking-wider">
              <Lock size={11} />
              Somente leitura
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Módulo de Pendências</h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            Consulta de pendências registradas e histórico auditável somente leitura.
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
        </div>
      </div>

      {/* Read-Only Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900">
        <Lock size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-xs font-black uppercase tracking-wider text-amber-800">
            Modo somente leitura ativo
          </p>
          <p className="text-xs text-amber-800/90 leading-relaxed">{readOnlyReason}</p>
        </div>
      </div>

      {/* Tabs + Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          {availableTabs.includes('minhas') && (
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
          )}

          {availableTabs.includes('geral') && (
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
          )}

          {availableTabs.includes('direcionado') && (
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
              placeholder="Buscar por título, descrição, tipo, responsável, referência, empreendedor ou barragem..."
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
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Origem: {item.origem || 'notifica'}
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

                  {/* Read-Only Row Action */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void openHistoryModal(item)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <History size={14} />
                      <span>Histórico</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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

                    {(row.valor_anterior !== null &&
                      row.valor_anterior !== undefined &&
                      row.valor_anterior !== '') ||
                    (row.valor_novo !== null &&
                      row.valor_novo !== undefined &&
                      row.valor_novo !== '') ? (
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
