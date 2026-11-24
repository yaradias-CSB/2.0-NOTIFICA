import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Edit2,
  Loader2,
  MapPin,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Users,
  XCircle,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  cancelSolicitacaoVistoria,
  listSolicitacoesVistoria,
  updateSolicitacaoObservacaoCampo,
} from '../data/solicitacoesVistoriaRepository';
import {
  SOLICITACAO_OBSERVACAO_MAX,
  containsCpfCnpjClient,
  isSolicitacaoCancelada,
  isSolicitacaoRealizada,
  isUserInSolicitacaoEquipeClient,
  looksLikeSerializedJsonClient,
  normalizeComparableName,
  type SolicitacaoVistoriaRecord,
} from '../types/solicitacoesVistoria';
import { SolicitarVistoriaModal } from '../components/SolicitarVistoriaModal';

function formatDateBr(raw?: string | null): string {
  if (!raw) return '—';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getStatusLabel(status?: string | null): string {
  const norm = normalizeComparableName(status);
  if (norm === 'realizada' || norm === 'concluida') return 'Vistoria realizada';
  if (norm === 'cancelada') return 'Cancelada';
  if (norm === 'em_andamento' || norm === 'em andamento' || norm === 'agendada') {
    return norm === 'agendada' ? 'Agendada' : 'Em andamento';
  }
  return 'Solicitada';
}

export const SolicitacoesVistoriaView: React.FC = () => {
  const { user, profile, isAdmin, canEdit } = useAuth();

  const [items, setItems] = useState<SolicitacaoVistoriaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todas' | 'abertas' | 'realizadas' | 'canceladas'>('todas');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SolicitacaoVistoriaRecord | null>(null);

  const [cancelTarget, setCancelTarget] = useState<SolicitacaoVistoriaRecord | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [obsTarget, setObsTarget] = useState<SolicitacaoVistoriaRecord | null>(null);
  const [obsText, setObsText] = useState('');
  const [obsError, setObsError] = useState<string | null>(null);
  const [savingObs, setSavingObs] = useState(false);

  const loadSolicitacoes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSolicitacoesVistoria();
      setItems(list);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível carregar as solicitações de vistoria.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSolicitacoes();
  }, [loadSolicitacoes]);

  const filteredItems = useMemo(() => {
    const query = normalizeComparableName(searchTerm);
    return items.filter((item) => {
      const realizada = isSolicitacaoRealizada(item.status);
      const cancelada = isSolicitacaoCancelada(item.status);

      if (statusFilter === 'realizadas' && !realizada) return false;
      if (statusFilter === 'canceladas' && !cancelada) return false;
      if (statusFilter === 'abertas' && (realizada || cancelada)) return false;

      if (!query) return true;
      const haystack = normalizeComparableName(
        [
          item.nome_barragem,
          item.municipio,
          item.curso_agua,
          item.empreendedor_nome,
          item.processo,
          item.relato,
          item.solicitante_nome,
        ]
          .filter(Boolean)
          .join(' ')
      );
      return haystack.includes(query);
    });
  }, [items, searchTerm, statusFilter]);

  const counts = useMemo(() => {
    let realizadas = 0;
    let canceladas = 0;
    let abertas = 0;
    for (const item of items) {
      if (isSolicitacaoRealizada(item.status)) realizadas += 1;
      else if (isSolicitacaoCancelada(item.status)) canceladas += 1;
      else abertas += 1;
    }
    return { total: items.length, abertas, realizadas, canceladas };
  }, [items]);

  const canManageRecord = (item: SolicitacaoVistoriaRecord): boolean => {
    if (isSolicitacaoCancelada(item.status) || isSolicitacaoRealizada(item.status)) {
      return false;
    }
    if (isAdmin) return true;
    if (!canEdit) return false;
    const sessionIds = new Set(
      [user?.id, profile?.id].map((v) => String(v || '').trim()).filter(Boolean)
    );
    return Boolean(item.solicitante_id && sessionIds.has(item.solicitante_id.trim()));
  };

  const canEditObservacao = (item: SolicitacaoVistoriaRecord): boolean => {
    if (isAdmin) return true;
    if (!canEdit) return false;
    return isUserInSolicitacaoEquipeClient(item, user?.id, profile?.id, profile?.nome);
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    const motivo = cancelMotivo.trim();
    if (motivo && looksLikeSerializedJsonClient(motivo)) {
      toast.error('Conteúdo JSON não é permitido no motivo do cancelamento.');
      return;
    }
    if (motivo && containsCpfCnpjClient(motivo)) {
      toast.error('Não informe CPF ou CNPJ no motivo do cancelamento.');
      return;
    }

    setCancelling(true);
    try {
      const updated = await cancelSolicitacaoVistoria(cancelTarget.id, motivo || undefined);
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      toast.success('Solicitação de vistoria cancelada.');
      setCancelTarget(null);
      setCancelMotivo('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar solicitação.');
    } finally {
      setCancelling(false);
    }
  };

  const handleSaveObservacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsTarget) return;
    const clean = obsText.trim();
    if (clean.length > SOLICITACAO_OBSERVACAO_MAX) {
      setObsError(`A observação deve ter no máximo ${SOLICITACAO_OBSERVACAO_MAX} caracteres.`);
      return;
    }
    if (clean && looksLikeSerializedJsonClient(clean)) {
      setObsError('Não é permitido colar conteúdo JSON na observação de campo.');
      return;
    }
    if (clean && containsCpfCnpjClient(clean)) {
      setObsError('Não inclua CPF ou CNPJ na observação de campo.');
      return;
    }

    setSavingObs(true);
    setObsError(null);
    try {
      const updated = await updateSolicitacaoObservacaoCampo(obsTarget.id, clean);
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      toast.success('Observação de campo atualizada.');
      setObsTarget(null);
      setObsText('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar observação de campo.';
      setObsError(msg);
      toast.error(msg);
    } finally {
      setSavingObs(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Solicitações de Vistoria
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Acompanhe as solicitações registradas, o status de atendimento e os registros de campo.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadSolicitacoes()}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-emerald-600' : ''} />
            <span>Atualizar</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditingRecord(null);
                setIsCreateOpen(true);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={15} />
              <span>Solicitar vistoria</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters and clean inline metrics */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por barragem, município, processo, empreendedor ou relato..."
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'todas', label: 'Todas', count: counts.total },
                { id: 'abertas', label: 'Em aberto', count: counts.abertas },
                { id: 'realizadas', label: 'Realizadas', count: counts.realizadas },
                { id: 'canceladas', label: 'Canceladas', count: counts.canceladas },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* States */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 size={24} className="animate-spin text-emerald-600" />
          <p className="text-sm font-medium">Carregando solicitações de vistoria...</p>
        </div>
      ) : error ? (
        <div className="bg-white border border-rose-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Não foi possível carregar as solicitações
              </h2>
              <p className="text-xs text-slate-600 mt-1">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadSolicitacoes()}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <ClipboardCheck size={22} />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">
              Nenhuma solicitação encontrada
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {items.length === 0
                ? 'Ainda não há solicitações de vistoria registradas.'
                : 'Nenhuma solicitação corresponde aos filtros aplicados.'}
            </p>
          </div>
          {canEdit && items.length === 0 && (
            <button
              type="button"
              onClick={() => {
                setEditingRecord(null);
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer"
            >
              <Plus size={15} />
              <span>Solicitar vistoria</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const realizada = isSolicitacaoRealizada(item.status);
            const cancelada = isSolicitacaoCancelada(item.status);
            const showManage = canManageRecord(item);
            const showObsEdit = canEditObservacao(item);

            return (
              <article
                key={item.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 transition-colors hover:border-slate-300"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-bold text-slate-900">
                        {item.nome_barragem || 'Barragem não informada'}
                      </h3>

                      {realizada ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={14} className="text-emerald-600" />
                          <span>Vistoria realizada</span>
                        </span>
                      ) : cancelada ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle size={13} />
                          <span>Cancelada</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <span>{getStatusLabel(item.status)}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                      {item.municipio && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="text-slate-400" />
                          {item.municipio}
                        </span>
                      )}
                      {item.curso_agua && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>Curso d&apos;água: {item.curso_agua}</span>
                        </>
                      )}
                      {item.coordenadas && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="tabular-nums">{item.coordenadas}</span>
                        </>
                      )}
                      {item.empreendedor_nome && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>Empreendedor: {item.empreendedor_nome}</span>
                        </>
                      )}
                      {item.processo && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="tabular-nums font-medium text-slate-700">
                            Processo {item.processo}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {(showManage || showObsEdit) && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {showObsEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setObsTarget(item);
                            setObsText(item.observacao_campo || '');
                            setObsError(null);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <MessageSquareText size={13} />
                          <span>
                            {item.observacao_campo ? 'Editar observação' : 'Registrar observação'}
                          </span>
                        </button>
                      )}
                      {showManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRecord(item);
                              setIsCreateOpen(true);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <Edit2 size={13} />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCancelTarget(item);
                              setCancelMotivo('');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <XCircle size={13} />
                            <span>Cancelar</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Relato */}
                <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Relato da solicitação
                  </p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {item.relato}
                  </p>
                </div>

                {/* Details when realized */}
                {(realizada || item.observacao_campo || (item.equipe && item.equipe.length > 0) || item.data_vistoria) && (
                  <div className="border-t border-slate-100 pt-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                      {item.data_vistoria && (
                        <span className="inline-flex items-center gap-1.5 tabular-nums font-medium text-slate-800">
                          <Calendar size={13} className="text-emerald-600" />
                          Data da vistoria: {formatDateBr(item.data_vistoria)}
                        </span>
                      )}
                      {item.equipe && item.equipe.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Users size={13} className="text-slate-400" />
                          <span>
                            Equipe:{' '}
                            <strong className="font-semibold text-slate-800">
                              {item.equipe.map((m) => m.nome).join(', ')}
                            </strong>
                          </span>
                        </span>
                      )}
                    </div>

                    {item.observacao_campo && (
                      <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 mb-1">
                          Observações de campo
                        </p>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                          {item.observacao_campo}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {cancelada && (item.motivo_cancelamento || item.cancelado_em) && (
                  <div className="text-xs text-rose-700 bg-rose-50/70 border border-rose-200/70 rounded-xl px-3.5 py-2.5">
                    <span className="font-semibold">
                      Cancelada{item.cancelado_em ? ` em ${formatDateBr(item.cancelado_em)}` : ''}
                      {item.cancelado_por_nome ? ` por ${item.cancelado_por_nome}` : ''}
                    </span>
                    {item.motivo_cancelamento ? ` — ${item.motivo_cancelamento}` : ''}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-1 tabular-nums">
                  <span>
                    Solicitante: <strong className="font-medium text-slate-700">{item.solicitante_nome || '—'}</strong>
                  </span>
                  <span>Registrada em {formatDateBr(item.created_at)}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <SolicitarVistoriaModal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingRecord(null);
        }}
        editingRecord={editingRecord}
        onSuccess={(saved) => {
          setItems((prev) => {
            const exists = prev.some((it) => it.id === saved.id);
            if (exists) {
              return prev.map((it) => (it.id === saved.id ? saved : it));
            }
            return [saved, ...prev];
          });
        }}
      />

      {/* Cancel Confirmation Modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancelar-solicitacao-title"
        >
          <form
            onSubmit={handleConfirmCancel}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4"
          >
            <div className="space-y-1">
              <h2 id="cancelar-solicitacao-title" className="text-base font-bold text-slate-900">
                Cancelar Solicitação de Vistoria
              </h2>
              <p className="text-xs text-slate-600">
                Confirma o cancelamento da solicitação para{' '}
                <strong>{cancelTarget.nome_barragem || 'esta barragem'}</strong>?
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motivo do cancelamento (opcional)
              </label>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Informe o motivo (sem CPF/CNPJ)"
                className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelMotivo('');
                }}
                disabled={cancelling}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={cancelling}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {cancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                <span>Confirmar cancelamento</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Field Observation Modal */}
      {obsTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="observacao-campo-title"
        >
          <form
            onSubmit={handleSaveObservacao}
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4"
          >
            <div className="space-y-1">
              <h2 id="observacao-campo-title" className="text-base font-bold text-slate-900">
                Observações de Campo
              </h2>
              <p className="text-xs text-slate-600">
                {obsTarget.nome_barragem || 'Barragem'}
                {obsTarget.municipio ? ` · ${obsTarget.municipio}` : ''}
              </p>
            </div>

            {obsError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                <span>{obsError}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Observação de campo
                </label>
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    obsText.length > SOLICITACAO_OBSERVACAO_MAX
                      ? 'text-rose-600'
                      : obsText.length >= 900
                        ? 'text-amber-600'
                        : 'text-slate-500'
                  }`}
                >
                  {obsText.length} / {SOLICITACAO_OBSERVACAO_MAX} caracteres
                </span>
              </div>
              <textarea
                value={obsText}
                onChange={(e) => setObsText(e.target.value)}
                maxLength={SOLICITACAO_OBSERVACAO_MAX}
                rows={4}
                placeholder="Registre observações coletadas em campo (não informe CPF/CNPJ)."
                className="w-full px-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setObsTarget(null);
                  setObsText('');
                  setObsError(null);
                }}
                disabled={savingObs}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingObs}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingObs ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>Salvar observação</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
