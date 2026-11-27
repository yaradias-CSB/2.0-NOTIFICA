import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { authFetch } from '../../lib/supabase';
import { EcosystemContext } from '../../contexts/EcosystemContext';
import { ECOSYSTEM_SYSTEM_LABELS } from '../../types/ecosystem';
import { normalizeLookupText, paginateItems } from '../../lib/barragemSearch';

export interface RelatedDocumentItem {
  id: string;
  systemId: 'NOTIFICA' | 'CLASSIFICA' | 'FISCALIZA';
  tipoDocumento: string;
  numeroDocumento?: string;
  processo?: string;
  status?: string;
  dataEmissao?: string;
  empreendedorId?: string;
  empreendedorNome?: string;
  barragemId?: string;
  barragemNome?: string;
  codigoSnisb?: string;
  municipio?: string;
  analista?: string;
  vinculoLabel: 'Barragem' | 'Empreendedor' | 'Processo' | 'SNISB';
  readonly: boolean;
}

interface RelatedDocumentsPanelProps {
  barragemId?: string;
  empreendedorId?: string;
  processo?: string;
  codigoSnisb?: string;
  nomeBarragem?: string;
  excludeId?: string;
  defaultExpanded?: boolean;
  pageSize?: number;
  onOpenLocalDocument?: (item: RelatedDocumentItem) => void;
}

export const RelatedDocumentsPanel: React.FC<RelatedDocumentsPanelProps> = ({
  barragemId,
  empreendedorId,
  processo,
  codigoSnisb,
  nomeBarragem,
  excludeId,
  defaultExpanded = false,
  pageSize = 5,
  onOpenLocalDocument,
}) => {
  const { getProductsForEntity } = useContext(EcosystemContext);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remoteItems, setRemoteItems] = useState<RelatedDocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasConcludedClassificacao, setHasConcludedClassificacao] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const hasCriteria = Boolean(
    barragemId?.trim() ||
      empreendedorId?.trim() ||
      processo?.trim() ||
      codigoSnisb?.trim() ||
      nomeBarragem?.trim()
  );

  // Reset pagination when criteria change
  useEffect(() => {
    setPage(1);
  }, [barragemId, empreendedorId, processo, codigoSnisb, nomeBarragem, excludeId]);

  const localFallbackSlice = useMemo(() => {
    if (!hasCriteria) {
      return {
        items: [] as RelatedDocumentItem[],
        total: 0,
        totalPages: 1,
        hasConcludedClassificacao: false,
      };
    }

    const matched = getProductsForEntity({
      empreendedorId,
      barragemId,
      codigoSnisb,
      nomeBarragem,
    })
      .filter((prod) => !excludeId || prod.id !== excludeId)
      .filter((prod) => prod.systemId !== 'ADMINISTRA');

    const procNorm = normalizeLookupText(processo);
    const mapped: RelatedDocumentItem[] = matched.map((prod) => {
      const vinculoLabel: RelatedDocumentItem['vinculoLabel'] =
        barragemId && prod.barragemId === barragemId
          ? 'Barragem'
          : codigoSnisb && prod.codigoSnisb === codigoSnisb
            ? 'SNISB'
            : procNorm && normalizeLookupText(prod.processo) === procNorm
              ? 'Processo'
              : 'Empreendedor';

      return {
        id: prod.id,
        systemId:
          prod.systemId === 'CLASSIFICA' || prod.systemId === 'FISCALIZA'
            ? prod.systemId
            : 'NOTIFICA',
        tipoDocumento: prod.tipoDocumento,
        numeroDocumento: prod.numeroDocumento,
        processo: prod.processo,
        status: prod.status,
        dataEmissao: prod.dataEmissao,
        empreendedorId: prod.empreendedorId,
        empreendedorNome: prod.empreendedorNome,
        barragemId: prod.barragemId,
        barragemNome: prod.barragemNome,
        codigoSnisb: prod.codigoSnisb,
        municipio: prod.municipio,
        analista: prod.analista,
        vinculoLabel,
        readonly: prod.readonly,
      };
    });

    const hasConcluded = mapped.some((item) => {
      const statusNorm = normalizeLookupText(item.status);
      const tipoNorm = normalizeLookupText(item.tipoDocumento);
      const concluded =
        statusNorm === 'concluido' || statusNorm === 'aprovado' || statusNorm === 'vigente';
      return concluded && (item.systemId === 'CLASSIFICA' || tipoNorm.includes('classificacao'));
    });

    const sliced = paginateItems(mapped, page, pageSize);
    return {
      items: sliced.items,
      total: sliced.total,
      totalPages: sliced.totalPages,
      hasConcludedClassificacao: hasConcluded,
    };
  }, [
    hasCriteria,
    getProductsForEntity,
    empreendedorId,
    barragemId,
    codigoSnisb,
    nomeBarragem,
    processo,
    excludeId,
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (!expanded || !hasCriteria) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUsedFallback(true);
      setRemoteItems(localFallbackSlice.items);
      setTotal(localFallbackSlice.total);
      setTotalPages(localFallbackSlice.totalPages);
      setHasConcludedClassificacao(localFallbackSlice.hasConcludedClassificacao);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setErrorMsg(null);

    const params = new URLSearchParams();
    if (barragemId?.trim()) params.set('barragemId', barragemId.trim());
    if (empreendedorId?.trim()) params.set('empreendedorId', empreendedorId.trim());
    if (processo?.trim()) params.set('processo', processo.trim());
    if (codigoSnisb?.trim()) params.set('codigoSnisb', codigoSnisb.trim());
    if (nomeBarragem?.trim()) params.set('nomeBarragem', nomeBarragem.trim());
    if (excludeId?.trim()) params.set('excludeId', excludeId.trim());
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    authFetch(`/api/documents/related?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const serverItems = Array.isArray(data?.items) ? (data.items as RelatedDocumentItem[]) : [];
        if (data?.remoteEnabled === false && serverItems.length === 0) {
          setUsedFallback(true);
          setRemoteItems(localFallbackSlice.items);
          setTotal(localFallbackSlice.total);
          setTotalPages(localFallbackSlice.totalPages);
          setHasConcludedClassificacao(localFallbackSlice.hasConcludedClassificacao);
          return;
        }
        setUsedFallback(false);
        setRemoteItems(serverItems);
        setTotal(Number(data?.total) || serverItems.length);
        setTotalPages(Math.max(1, Number(data?.totalPages) || 1));
        setHasConcludedClassificacao(Boolean(data?.hasConcludedClassificacao));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setUsedFallback(true);
        setRemoteItems(localFallbackSlice.items);
        setTotal(localFallbackSlice.total);
        setTotalPages(localFallbackSlice.totalPages);
        setHasConcludedClassificacao(localFallbackSlice.hasConcludedClassificacao);
        if (localFallbackSlice.total === 0) {
          setErrorMsg(err instanceof Error ? err.message : 'Falha ao consultar documentos relacionados.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    expanded,
    hasCriteria,
    barragemId,
    empreendedorId,
    processo,
    codigoSnisb,
    nomeBarragem,
    excludeId,
    page,
    pageSize,
    reloadToken,
    localFallbackSlice,
  ]);

  const items = usedFallback ? localFallbackSlice.items : remoteItems;
  const displayTotal = usedFallback ? localFallbackSlice.total : total;
  const displayTotalPages = usedFallback ? localFallbackSlice.totalPages : totalPages;
  const showClassificacaoAlert = usedFallback
    ? localFallbackSlice.hasConcludedClassificacao
    : hasConcludedClassificacao;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={16} className="text-slate-600 shrink-0" />
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-900">Documentos relacionados</span>
            <span className="ml-2 text-[11px] font-medium text-slate-500">
              {!hasCriteria
                ? 'Selecione barragem, empreendedor ou informe processo para consultar'
                : expanded
                  ? `${displayTotal} registro(s) encontrado(s)`
                  : 'Clique para consultar sob demanda (Notifica, Classifica e Fiscaliza)'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded && loading && <Loader2 size={14} className="animate-spin text-emerald-600" />}
          <ChevronDown
            size={16}
            className={`text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="p-4 border-t border-slate-200 space-y-3">
          {!hasCriteria ? (
            <p className="text-xs text-slate-500">
              Nenhum vínculo de barragem, empreendedor, SNISB ou processo definido no documento atual.
            </p>
          ) : (
            <>
              {showClassificacaoAlert && (
                <div className="p-3 rounded-lg border border-sky-200 bg-sky-50 text-sky-900 text-xs flex items-start gap-2.5">
                  <Info size={16} className="text-sky-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Existe documento de classificação concluído vinculado a este contexto.
                    </p>
                    <p className="text-[11px] text-sky-800 mt-0.5">
                      Alerta informativo: confira a classificação vigente antes de concluir uma nova notificação ou parecer.
                    </p>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs">
                  Não foi possível consultar a base remota ({errorMsg}). Exibindo cache local disponível.
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="tabular-nums">
                  {displayTotal > 0
                    ? `Página ${page} de ${displayTotalPages} · ${displayTotal} documento(s)`
                    : 'Nenhum documento relacionado encontrado.'}
                </span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setReloadToken((n) => n + 1)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                  Atualizar
                </button>
              </div>

              {items.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        <th className="py-2 px-3">Sistema</th>
                        <th className="py-2 px-3">Tipo / Nº</th>
                        <th className="py-2 px-3">Processo</th>
                        <th className="py-2 px-3">Vínculo</th>
                        <th className="py-2 px-3">Data</th>
                        <th className="py-2 px-3">Estado</th>
                        {onOpenLocalDocument && <th className="py-2 px-3 text-right">Ação</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item) => {
                        const sysLabel = ECOSYSTEM_SYSTEM_LABELS[item.systemId]?.shortName || item.systemId;
                        const canOpenLocal = Boolean(
                          onOpenLocalDocument && item.systemId === 'NOTIFICA'
                        );
                        return (
                          <tr key={`${item.systemId}-${item.id}`} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">
                              {sysLabel}
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              <div className="font-semibold text-slate-900">
                                {item.tipoDocumento}
                                {item.numeroDocumento ? ` · ${item.numeroDocumento}` : ''}
                              </div>
                              {(item.barragemNome || item.empreendedorNome) && (
                                <div className="text-[11px] text-slate-500 truncate max-w-[240px]">
                                  {item.barragemNome || item.empreendedorNome}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 tabular-nums text-slate-600 whitespace-nowrap">
                              {item.processo || '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                              {item.vinculoLabel}
                            </td>
                            <td className="py-2 px-3 tabular-nums text-slate-600 whitespace-nowrap">
                              {item.dataEmissao ? item.dataEmissao.split('T')[0] : '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                              {item.status || '—'}
                            </td>
                            {onOpenLocalDocument && (
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                {canOpenLocal ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenLocalDocument(item)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-emerald-700 font-semibold text-[11px] transition-colors cursor-pointer"
                                  >
                                    <ExternalLink size={11} />
                                    Abrir
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">Somente leitura</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {displayTotalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft size={13} />
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={page >= displayTotalPages || loading}
                    onClick={() => setPage((p) => Math.min(displayTotalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    Próxima
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
