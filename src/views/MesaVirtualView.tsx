import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit,
  Eye,
  FileCheck,
  FileText,
  FileWarning,
  Filter,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataContext, AppDocument } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { listSolicitacoesVistoria } from '../data/solicitacoesVistoriaRepository';
import {
  formatCoordenadasSimplesString,
  type SolicitacaoVistoriaPrefill,
  type SolicitacaoVistoriaRecord,
} from '../types/solicitacoesVistoria';
import { CURRENT_SYSTEM_ID } from '../types/ecosystem';
import { normalizeLookupText, paginateItems } from '../lib/barragemSearch';
import {
  canUserDeleteDraft,
  canUserEditDraft,
  canUserRectifyDocument,
  createRetificationDraft,
  getDocumentBarragemValue,
  getDocumentDateValue,
  getDocumentEmpreendedorValue,
  getDocumentMunicipioValue,
  getDocumentNumberValue,
  getDocumentProcessValue,
  getNormalizedMesaState,
  isDocumentAuthor,
  matchDocumentRequests,
  type NormalizedMesaState,
} from '../lib/documentPermissions';
import { RelatedDocumentsPanel } from '../components/ecosystem/RelatedDocumentsPanel';
import { SolicitarVistoriaModal } from '../components/SolicitarVistoriaModal';
import { RetificarDocumentoModal } from '../components/ui/RetificarDocumentoModal';
import ConfirmModal from '../components/ui/ConfirmModal';

interface MesaVirtualViewProps {
  onOpenDocument: (doc: AppDocument, viewOnly: boolean) => void;
  onCreateDocument: (target: 'form' | 'oficio' | 'notificacao') => void;
}

type MesaTab = 'meus' | 'todos';
type DocTypeFilter = 'ALL' | 'parecer' | 'oficio' | 'notificacao';
type StateFilter = 'ALL' | NormalizedMesaState;

function getDocCategory(doc: AppDocument): 'parecer' | 'oficio' | 'notificacao' {
  const tipo = String((doc as any).tipo_documento || '');
  if (tipo === 'Notificação') return 'notificacao';
  if (tipo.includes('Ofício') || tipo.includes('Oficio')) return 'oficio';
  return 'parecer';
}

function getDocTypeLabel(doc: AppDocument): string {
  const cat = getDocCategory(doc);
  if (cat === 'notificacao') return 'Notificação';
  if (cat === 'oficio') return 'Ofício';
  return 'Parecer Técnico';
}

function getStateClass(state: NormalizedMesaState): string {
  switch (state) {
    case 'Resposta recebida':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Solicitação pendente':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Concluído':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function buildVistoriaTargetsFromDoc(doc: AppDocument): {
  prefill: SolicitacaoVistoriaPrefill;
  multiTargets: SolicitacaoVistoriaPrefill[] | null;
} {
  const cat = getDocCategory(doc);
  const tipoReferencia =
    cat === 'parecer' ? 'parecer' : cat === 'oficio' ? 'oficio' : 'notificacao';
  const processo = getDocumentProcessValue(doc);
  const empNome = getDocumentEmpreendedorValue(doc);
  const empId = String((doc as any).empreendedorId || '');
  const munFallback = getDocumentMunicipioValue(doc);

  const barragensArr = Array.isArray((doc as any).barragens)
    ? ((doc as any).barragens as Array<any>)
    : [];

  if (barragensArr.length > 0) {
    const multi: SolicitacaoVistoriaPrefill[] = barragensArr.map((b) => ({
      tipoReferencia,
      referenciaId: doc.id || '',
      processo,
      barragemId: b.barragemId || (doc as any).barragemId || '',
      nomeBarragem: b.nome || getDocumentBarragemValue(doc),
      municipio: b.municipio || munFallback,
      coordenadas: formatCoordenadasSimplesString(
        b.lat || (doc as any).lat || (doc as any).coordenadasLat,
        b.long || (doc as any).long || (doc as any).coordenadasLong
      ),
      empreendedorId: empId,
      empreendedorNome: empNome,
    }));
    return {
      prefill: multi[0],
      multiTargets: multi,
    };
  }

  const single: SolicitacaoVistoriaPrefill = {
    tipoReferencia,
    referenciaId: doc.id || '',
    processo,
    barragemId: String((doc as any).barragemId || ''),
    nomeBarragem: getDocumentBarragemValue(doc),
    municipio: munFallback,
    coordenadas: formatCoordenadasSimplesString(
      (doc as any).lat || (doc as any).coordenadasLat,
      (doc as any).long || (doc as any).coordenadasLong
    ),
    empreendedorId: empId,
    empreendedorNome: empNome,
  };

  return { prefill: single, multiTargets: null };
}

export const MesaVirtualView: React.FC<MesaVirtualViewProps> = ({
  onOpenDocument,
  onCreateDocument,
}) => {
  const {
    pareceres,
    oficios,
    notificacoes,
    loading: docsLoading,
    deleteParecer,
    deleteOficio,
    deleteNotificacao,
    refreshData,
  } = useContext(DataContext);
  const { user, profile, canEdit } = useAuth();

  const currentActor = useMemo(
    () => ({
      userId: user?.id,
      perfilId: profile?.id,
      name: profile?.nome,
      email: user?.email,
      canEdit,
    }),
    [user?.id, profile?.id, profile?.nome, user?.email, canEdit]
  );

  const [activeTab, setActiveTab] = useState<MesaTab>('meus');
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoVistoriaRecord[]>([]);
  const [solicitacoesLoading, setSolicitacoesLoading] = useState(false);
  const [solicitacoesError, setSolicitacoesError] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [freeQuery, setFreeQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocTypeFilter>('ALL');
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [numeroFilter, setNumeroFilter] = useState('');
  const [processoFilter, setProcessoFilter] = useState('');
  const [barragemFilter, setBarragemFilter] = useState('');
  const [empreendedorFilter, setEmpreendedorFilter] = useState('');
  const [municipioFilter, setMunicipioFilter] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [page, setPage] = useState(1);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [rectifyTarget, setRectifyTarget] = useState<AppDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppDocument | null>(null);
  const [vistoriaTarget, setVistoriaTarget] = useState<AppDocument | null>(null);

  const loadSolicitacoes = useCallback(async () => {
    setSolicitacoesLoading(true);
    setSolicitacoesError(null);
    try {
      const list = await listSolicitacoesVistoria();
      setSolicitacoes(list);
    } catch (err) {
      setSolicitacoesError(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível consultar as solicitações do Fiscaliza.'
      );
    } finally {
      setSolicitacoesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSolicitacoes();
  }, [loadSolicitacoes]);

  // Notifica CSB scope only (strictly pareces, oficios, notificacoes belonging to Notifica)
  const notificaDocuments = useMemo<AppDocument[]>(() => {
    const merged: AppDocument[] = [
      ...pareceres.map((p) => ({ ...p, tipo_documento: p.tipo_documento || 'Parecer Técnico' }) as AppDocument),
      ...oficios.map((o) => ({ ...o, tipo_documento: o.tipo_documento || 'Ofício de Pendências' }) as AppDocument),
      ...notificacoes.map((n) => ({ ...n, tipo_documento: 'Notificação' as const }) as AppDocument),
    ].filter((doc) => {
      const sys = (doc as any).sourceSystem;
      return !sys || sys === CURRENT_SYSTEM_ID;
    });

    merged.sort((a, b) => {
      const dA = new Date(a.updated_at || a.created_at || getDocumentDateValue(a) || 0).getTime();
      const dB = new Date(b.updated_at || b.created_at || getDocumentDateValue(b) || 0).getTime();
      return dB - dA;
    });
    return merged;
  }, [pareceres, oficios, notificacoes]);

  const tabDocuments = useMemo(() => {
    if (activeTab === 'meus') {
      return notificaDocuments.filter((doc) => isDocumentAuthor(doc, currentActor));
    }
    return notificaDocuments;
  }, [activeTab, notificaDocuments, currentActor]);

  const summary = useMemo(() => {
    let pareceresCount = 0;
    let oficiosCount = 0;
    let notificacoesCount = 0;
    let rascunho = 0;
    let concluido = 0;
    let solicitacaoPendente = 0;
    let respostaRecebida = 0;

    for (const doc of tabDocuments) {
      const cat = getDocCategory(doc);
      if (cat === 'parecer') pareceresCount += 1;
      else if (cat === 'oficio') oficiosCount += 1;
      else notificacoesCount += 1;

      const st = getNormalizedMesaState(doc, solicitacoes);
      if (st === 'Rascunho') rascunho += 1;
      else if (st === 'Concluído') concluido += 1;
      else if (st === 'Solicitação pendente') solicitacaoPendente += 1;
      else respostaRecebida += 1;
    }

    return {
      total: tabDocuments.length,
      pareceresCount,
      oficiosCount,
      notificacoesCount,
      rascunho,
      concluido,
      solicitacaoPendente,
      respostaRecebida,
    };
  }, [tabDocuments, solicitacoes]);

  const filteredDocuments = useMemo(() => {
    const q = normalizeLookupText(freeQuery);
    const numQ = normalizeLookupText(numeroFilter);
    const procQ = normalizeLookupText(processoFilter);
    const barQ = normalizeLookupText(barragemFilter);
    const empQ = normalizeLookupText(empreendedorFilter);
    const munQ = normalizeLookupText(municipioFilter);

    return tabDocuments.filter((doc) => {
      const cat = getDocCategory(doc);
      if (typeFilter !== 'ALL' && cat !== typeFilter) return false;

      const normState = getNormalizedMesaState(doc, solicitacoes);
      if (stateFilter !== 'ALL' && normState !== stateFilter) return false;

      const docNum = getDocumentNumberValue(doc);
      const docProc = getDocumentProcessValue(doc);
      const docBar = getDocumentBarragemValue(doc);
      const docEmp = getDocumentEmpreendedorValue(doc);
      const docMun = getDocumentMunicipioValue(doc);
      const docDate = getDocumentDateValue(doc);

      if (numQ && !normalizeLookupText(docNum).includes(numQ)) return false;
      if (procQ && !normalizeLookupText(docProc).includes(procQ)) return false;
      if (barQ && !normalizeLookupText(docBar).includes(barQ)) return false;
      if (empQ && !normalizeLookupText(docEmp).includes(empQ)) return false;
      if (munQ && !normalizeLookupText(docMun).includes(munQ)) return false;
      if (dateStart && (!docDate || docDate < dateStart)) return false;
      if (dateEnd && (!docDate || docDate > dateEnd)) return false;

      if (q) {
        const analistaText = String(
          (doc as any).analista ||
            (Array.isArray((doc as any).analistas) ? (doc as any).analistas.join(' ') : '') ||
            ''
        );
        const haystack = normalizeLookupText(
          [
            docNum,
            docProc,
            docBar,
            docEmp,
            docMun,
            analistaText,
            (doc as any).retificacaoJustificativa,
            (doc as any).id,
          ]
            .filter(Boolean)
            .join(' ')
        );
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    tabDocuments,
    typeFilter,
    stateFilter,
    numeroFilter,
    processoFilter,
    barragemFilter,
    empreendedorFilter,
    municipioFilter,
    dateStart,
    dateEnd,
    freeQuery,
    solicitacoes,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    activeTab,
    typeFilter,
    stateFilter,
    numeroFilter,
    processoFilter,
    barragemFilter,
    empreendedorFilter,
    municipioFilter,
    dateStart,
    dateEnd,
    freeQuery,
  ]);

  const paginated = useMemo(
    () => paginateItems(filteredDocuments, page, 15),
    [filteredDocuments, page]
  );

  const selectedDoc = useMemo(() => {
    if (selectedDocId) {
      const found = filteredDocuments.find((d) => d.id === selectedDocId);
      if (found) return found;
    }
    return paginated.items[0] || null;
  }, [selectedDocId, filteredDocuments, paginated.items]);

  const selectedDocRequests = useMemo(() => {
    if (!selectedDoc) return [];
    return matchDocumentRequests(selectedDoc, solicitacoes);
  }, [selectedDoc, solicitacoes]);

  const clearFilters = () => {
    setFreeQuery('');
    setTypeFilter('ALL');
    setStateFilter('ALL');
    setNumeroFilter('');
    setProcessoFilter('');
    setBarragemFilter('');
    setEmpreendedorFilter('');
    setMunicipioFilter('');
    setDateStart('');
    setDateEnd('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    if (!canUserDeleteDraft(deleteTarget, currentActor)) {
      toast.error('Somente o autor pode excluir seu próprio rascunho.');
      setDeleteTarget(null);
      return;
    }
    const cat = getDocCategory(deleteTarget);
    const res =
      cat === 'parecer'
        ? await deleteParecer(deleteTarget.id)
        : cat === 'oficio'
        ? await deleteOficio(deleteTarget.id)
        : await deleteNotificacao(deleteTarget.id);

    if (res.success) {
      toast.success('Rascunho excluído com sucesso.');
      setDeleteTarget(null);
      await refreshData();
    } else {
      toast.error(res.message || 'Erro ao excluir documento.');
    }
  };

  const vistoriaPayload = useMemo(
    () => (vistoriaTarget ? buildVistoriaTargetsFromDoc(vistoriaTarget) : null),
    [vistoriaTarget]
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto w-full space-y-5">
      {/* Header & Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Mesa Virtual CSB</h2>
            <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Notifica CSB
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Conferência de documentos do Notifica CSB, solicitações de vistoria ao Fiscaliza e histórico relacionado de barragens.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1"
            role="tablist"
            aria-label="Visão da Mesa Virtual"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'meus'}
              onClick={() => setActiveTab('meus')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'meus'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Meus documentos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'todos'}
              onClick={() => setActiveTab('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'todos'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos documentos CSB
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              void refreshData();
              void loadSolicitacoes();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <RefreshCw size={14} className={docsLoading || solicitacoesLoading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>

          {canEdit && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onCreateDocument('form')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <Plus size={14} />
                <span>Parecer</span>
              </button>
              <button
                type="button"
                onClick={() => onCreateDocument('oficio')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
              >
                <Plus size={14} />
                <span>Ofício</span>
              </button>
              <button
                type="button"
                onClick={() => onCreateDocument('notificacao')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
              >
                <Plus size={14} />
                <span>Notificação</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total na aba</p>
          <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">{summary.total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pareceres</p>
          <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">{summary.pareceresCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ofícios</p>
          <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">{summary.oficiosCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notificações</p>
          <p className="text-xl font-black text-slate-900 tabular-nums mt-0.5">{summary.notificacoesCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rascunho</p>
          <p className="text-xl font-black text-slate-700 tabular-nums mt-0.5">{summary.rascunho}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Solic. pendente</p>
          <p className="text-xl font-black text-amber-700 tabular-nums mt-0.5">{summary.solicitacaoPendente}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Resp. / Concl.</p>
          <p className="text-xl font-black text-emerald-700 tabular-nums mt-0.5">
            {summary.respostaRecebida} / {summary.concluido}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={freeQuery}
              onChange={(e) => setFreeQuery(e.target.value)}
              placeholder="Busca livre: processo, número, barragem, empreendedor, município ou analista..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DocTypeFilter)}
            aria-label="Filtrar por tipo de documento"
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 outline-none"
          >
            <option value="ALL">Todos os tipos</option>
            <option value="parecer">Parecer Técnico</option>
            <option value="oficio">Ofício de Pendências</option>
            <option value="notificacao">Notificação</option>
          </select>

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilter)}
            aria-label="Filtrar por estado"
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 outline-none"
          >
            <option value="ALL">Todos os estados</option>
            <option value="Rascunho">Rascunho</option>
            <option value="Concluído">Concluído</option>
            <option value="Solicitação pendente">Solicitação pendente</option>
            <option value="Resposta recebida">Resposta recebida</option>
          </select>

          <button
            type="button"
            onClick={() => setShowFilters((p) => !p)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <Filter size={14} />
            <span>{showFilters ? 'Ocultar filtros' : 'Mais filtros'}</span>
          </button>

          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-500 cursor-pointer"
          >
            Limpar
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 pt-2 border-t border-slate-100">
            <input
              type="text"
              value={numeroFilter}
              onChange={(e) => setNumeroFilter(e.target.value)}
              placeholder="Número"
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              value={processoFilter}
              onChange={(e) => setProcessoFilter(e.target.value)}
              placeholder="Processo / Protocolo"
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              value={barragemFilter}
              onChange={(e) => setBarragemFilter(e.target.value)}
              placeholder="Barragem"
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              value={empreendedorFilter}
              onChange={(e) => setEmpreendedorFilter(e.target.value)}
              placeholder="Empreendedor"
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              value={municipioFilter}
              onChange={(e) => setMunicipioFilter(e.target.value)}
              placeholder="Município"
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500"
            />
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              aria-label="Data inicial"
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500"
            />
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              aria-label="Data final"
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>

      {/* Main Split: Document Table + Contextual Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              {activeTab === 'meus' ? 'Meus documentos no Notifica CSB' : 'Todos documentos do Notifica CSB'}
            </span>
            <span className="text-[11px] font-bold text-slate-500 tabular-nums">
              {filteredDocuments.length} registro(s) • Pág. {paginated.page} de {paginated.totalPages}
            </span>
          </div>

          {docsLoading ? (
            <div className="p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 size={16} className="animate-spin text-emerald-600" />
              <span>Carregando documentos...</span>
            </div>
          ) : paginated.items.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhum documento encontrado para os filtros aplicados nesta aba.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {paginated.items.map((doc) => {
                const state = getNormalizedMesaState(doc, solicitacoes);
                const docEditAllowed = canUserEditDraft(doc, currentActor);
                const docDeleteAllowed = canUserDeleteDraft(doc, currentActor);
                const docRectifyAllowed = canUserRectifyDocument(doc, canEdit);
                const isSelected = selectedDoc?.id === doc.id;
                const docNum = getDocumentNumberValue(doc) || 'S/N';
                const docProc = getDocumentProcessValue(doc) || '---';
                const docEmp = getDocumentEmpreendedorValue(doc) || '---';
                const docBar = getDocumentBarragemValue(doc) || 'Sem barragem vinculada';
                const docMun = getDocumentMunicipioValue(doc) || '---';
                const docDate = getDocumentDateValue(doc) || '---';
                const authorName = String(
                  (doc as any).analista ||
                    (Array.isArray((doc as any).analistas) ? (doc as any).analistas[0] : '') ||
                    'Autor não informado'
                );

                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id || null)}
                    className={`p-3.5 transition-colors cursor-pointer ${
                      isSelected ? 'bg-emerald-50/50 border-l-4 border-l-emerald-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-bold uppercase text-slate-700">
                            {getDocTypeLabel(doc)}
                          </span>
                          <span className="text-xs font-black text-slate-900 font-mono tabular-nums">
                            {docNum}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getStateClass(state)}`}
                          >
                            {state}
                          </span>
                          {(doc as any).retificadoDeId && (
                            <span className="px-2 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-800 text-[10px] font-bold">
                              Retificação v{(doc as any).versaoRetificacao || 2}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-800 truncate">{docEmp}</p>
                        <p className="text-[11px] text-slate-600 truncate">
                          Barragem: {docBar} • Processo: <span className="font-mono">{docProc}</span>
                        </p>
                        <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="inline-flex items-center gap-1">
                            <User size={11} />
                            {authorName}
                          </span>
                          <span>{docMun}</span>
                          <span className="tabular-nums">{docDate}</span>
                        </p>
                      </div>

                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenDocument(doc, true)}
                          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-emerald-700 hover:border-emerald-300 cursor-pointer"
                          title="Visualizar"
                        >
                          <Eye size={14} />
                        </button>
                        {docEditAllowed && (
                          <button
                            type="button"
                            onClick={() => onOpenDocument(doc, false)}
                            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-700 hover:border-blue-300 cursor-pointer"
                            title="Editar rascunho"
                          >
                            <Edit size={14} />
                          </button>
                        )}
                        {docRectifyAllowed && (
                          <button
                            type="button"
                            onClick={() => setRectifyTarget(doc)}
                            className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer"
                            title="Abrir retificação auditável"
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setVistoriaTarget(doc)}
                            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-400 cursor-pointer"
                            title="Solicitar vistoria ao Fiscaliza"
                          >
                            <Send size={14} />
                          </button>
                        )}
                        {docDeleteAllowed && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(doc)}
                            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-700 hover:border-rose-300 cursor-pointer"
                            title="Excluir rascunho"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {paginated.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                Exibindo {paginated.items.length} de {paginated.total}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={paginated.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft size={14} />
                  <span>Anterior</span>
                </button>
                <button
                  type="button"
                  disabled={paginated.page >= paginated.totalPages}
                  onClick={() => setPage((p) => Math.min(paginated.totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <span>Próxima</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Contextual Inspection Panel */}
        <div className="xl:col-span-5 space-y-4">
          {selectedDoc ? (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Conferência contextual • {getDocTypeLabel(selectedDoc)}
                    </p>
                    <h3 className="text-base font-black text-slate-900 truncate">
                      {getDocumentNumberValue(selectedDoc) || 'Documento sem numeração'}
                    </h3>
                    <p className="text-xs text-slate-600 truncate">
                      {getDocumentEmpreendedorValue(selectedDoc) || 'Empreendedor não informado'}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${getStateClass(
                      getNormalizedMesaState(selectedDoc, solicitacoes)
                    )}`}
                  >
                    {getNormalizedMesaState(selectedDoc, solicitacoes)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Processo</p>
                    <p className="font-mono font-bold text-slate-800 break-all">
                      {getDocumentProcessValue(selectedDoc) || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Município</p>
                    <p className="font-bold text-slate-800">
                      {getDocumentMunicipioValue(selectedDoc) || '—'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Barragem(ns)</p>
                    <p className="font-semibold text-slate-800">
                      {getDocumentBarragemValue(selectedDoc) || 'Sem vínculo com barragem'}
                    </p>
                  </div>
                </div>

                {(selectedDoc as any).retificadoDeId && (
                  <div className="p-2.5 rounded-xl border border-sky-200 bg-sky-50 text-xs text-sky-900">
                    <p className="font-bold">
                      Retificação auditável v{(selectedDoc as any).versaoRetificacao || 2} • Origem:{' '}
                      <span className="font-mono">{(selectedDoc as any).retificadoDeId}</span>
                    </p>
                    {(selectedDoc as any).retificacaoJustificativa && (
                      <p className="mt-0.5 text-[11px]">
                        Justificativa: {(selectedDoc as any).retificacaoJustificativa}
                      </p>
                    )}
                  </div>
                )}

                {!canUserEditDraft(selectedDoc, currentActor) && (
                  <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-600 flex items-start gap-2">
                    <Lock size={14} className="shrink-0 mt-0.5 text-slate-500" />
                    <span>
                      {selectedDoc.status === 'Concluído'
                        ? 'Documento concluído protegido contra edição silenciosa. Para alterar, abra uma retificação auditável.'
                        : 'Documento de outro autor: abertura disponível apenas para visualização.'}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenDocument(selectedDoc, true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    <Eye size={13} />
                    <span>Visualizar</span>
                  </button>
                  {canUserEditDraft(selectedDoc, currentActor) && (
                    <button
                      type="button"
                      onClick={() => onOpenDocument(selectedDoc, false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white cursor-pointer"
                    >
                      <Edit size={13} />
                      <span>Editar rascunho</span>
                    </button>
                  )}
                  {canUserRectifyDocument(selectedDoc, canEdit) && (
                    <button
                      type="button"
                      onClick={() => setRectifyTarget(selectedDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white cursor-pointer"
                    >
                      <RefreshCw size={13} />
                      <span>Retificar</span>
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setVistoriaTarget(selectedDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white cursor-pointer"
                    >
                      <ClipboardList size={13} />
                      <span>Solicitar vistoria</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Linked Fiscaliza Requests */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <FileCheck size={14} className="text-emerald-600" />
                    <span>Solicitações vinculadas (Fiscaliza)</span>
                  </h4>
                  <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                    {selectedDocRequests.length}
                  </span>
                </div>

                {solicitacoesError && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    {solicitacoesError}
                  </p>
                )}

                {selectedDocRequests.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhuma solicitação de vistoria vinculada a este documento ou barragem/processo.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDocRequests.map((sol) => (
                      <div
                        key={sol.id}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 truncate">
                            {sol.nome_barragem || 'Barragem'}
                          </span>
                          <span className="px-2 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-bold text-slate-700 uppercase">
                            {sol.status || 'solicitada'}
                          </span>
                        </div>
                        {sol.relato && (
                          <p className="text-[11px] text-slate-600">Solicitação: {sol.relato}</p>
                        )}
                        {sol.observacao_campo && (
                          <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-1.5">
                            Resposta de campo: {sol.observacao_campo}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* On-demand Paginated Related Documents + Classifica Banner */}
              <RelatedDocumentsPanel
                barragemId={(selectedDoc as any).barragemId}
                barragemNome={getDocumentBarragemValue(selectedDoc)}
                empreendedorId={(selectedDoc as any).empreendedorId}
                empreendedorNome={getDocumentEmpreendedorValue(selectedDoc)}
                empreendimentoNome={
                  (selectedDoc as any).empreendimento ||
                  (selectedDoc as any).nomeFantasia ||
                  (selectedDoc as any).localizacaoEmpreendimento
                }
                processo={getDocumentProcessValue(selectedDoc)}
                excludeDocId={selectedDoc.id}
                defaultExpanded={false}
              />
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-500">
              Selecione um documento na lista para abrir a conferência contextual.
            </div>
          )}

          {/* Explicit Unavailable Cross-System Contracts Notice */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <h4 className="text-xs font-black uppercase tracking-wider">
                Ações entre sistemas — Indisponível (contrato pendente)
              </h4>
            </div>
            <div className="space-y-2 text-[11px] text-slate-600">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <p className="font-bold text-slate-800">
                  Classifica CSB — Solicitar análise: <span className="text-amber-700">Indisponível</span>
                </p>
                <p className="mt-0.5">
                  Contrato pendente: a integração atual com o Classifica é somente leitura (consulta PostgREST); não há endpoint confirmado para criação/envio de solicitações de classificação.
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <p className="font-bold text-slate-800">
                  Caixa de Entrada/Saída cross-system e Redistribuição (<span className="font-mono">GERAL</span>):{' '}
                  <span className="text-amber-700">Indisponível</span>
                </p>
                <p className="mt-0.5">
                  Contratos pendentes: listagem de usuários ativos para perfis não-administradores, roteamento de caixa compartilhada cross-system e aprovação remota de revisão cadastral no Administra não possuem rotas confirmadas neste repositório.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {vistoriaPayload && (
        <SolicitarVistoriaModal
          isOpen={Boolean(vistoriaTarget)}
          onClose={() => {
            setVistoriaTarget(null);
            void loadSolicitacoes();
          }}
          prefill={vistoriaPayload.prefill}
          multiTargets={vistoriaPayload.multiTargets}
        />
      )}

      <RetificarDocumentoModal
        isOpen={Boolean(rectifyTarget)}
        doc={rectifyTarget}
        onCancel={() => setRectifyTarget(null)}
        onConfirm={(justification) => {
          if (!rectifyTarget) return;
          const draft = createRetificationDraft(rectifyTarget, justification, currentActor);
          setRectifyTarget(null);
          toast.success('Rascunho de retificação criado. Edite os campos necessários e salve.');
          onOpenDocument(draft as AppDocument, false);
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Excluir rascunho"
        message={`Tem certeza que deseja excluir este rascunho (${deleteTarget ? getDocumentNumberValue(deleteTarget) || 'sem número' : ''})? Esta ação não pode ser desfeita.`}
        variant="danger"
        confirmLabel="Excluir"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default MesaVirtualView;
