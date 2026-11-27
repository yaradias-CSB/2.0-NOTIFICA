import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createSolicitacaoVistoria,
  updateSolicitacaoVistoria,
} from '../data/solicitacoesVistoriaRepository';
import {
  SOLICITACAO_RELATO_MAX,
  containsCpfCnpjClient,
  formatCoordenadasGmsString,
  looksLikeSerializedJsonClient,
  type SolicitacaoVistoriaPrefill,
  type SolicitacaoVistoriaRecord,
} from '../types/solicitacoesVistoria';
import { EcosystemContext } from '../contexts/EcosystemContext';
import { describeBarragemRelationship, paginateItems, searchBarragens } from '../lib/barragemSearch';

interface SolicitarVistoriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: SolicitacaoVistoriaPrefill | null;
  multiTargets?: SolicitacaoVistoriaPrefill[] | null;
  editingRecord?: SolicitacaoVistoriaRecord | null;
  onSuccess?: (record: SolicitacaoVistoriaRecord) => void;
  onBatchSuccess?: (records: SolicitacaoVistoriaRecord[]) => void;
}

interface TargetDraft {
  key: string;
  selected: boolean;
  barragemId: string;
  nomeBarragem: string;
  municipio: string;
  cursoAgua: string;
  coordenadas: string;
  empreendedorId: string;
  empreendedorNome: string;
  processo: string;
  tipoReferencia: SolicitacaoVistoriaPrefill['tipoReferencia'];
  referenciaId: string;
  relatoIndividual: string;
}

interface DispatchResultItem {
  key: string;
  label: string;
  ok: boolean;
  message: string;
}

function validateTextSafety(label: string, value: string, skipDocCheck = false): string | null {
  const val = value.trim();
  if (!val) return null;
  if (looksLikeSerializedJsonClient(val)) {
    return `Conteúdo JSON não é permitido em ${label}.`;
  }
  if (!skipDocCheck && containsCpfCnpjClient(val)) {
    return `Não inclua CPF ou CNPJ em ${label}.`;
  }
  return null;
}

function buildDraftFromPrefill(item: SolicitacaoVistoriaPrefill, idx: number): TargetDraft {
  return {
    key: `${item.barragemId || item.nomeBarragem || 'target'}_${idx}`,
    selected: true,
    barragemId: item.barragemId || '',
    nomeBarragem: item.nomeBarragem || '',
    municipio: item.municipio || '',
    cursoAgua: item.cursoAgua || '',
    coordenadas: item.coordenadas || '',
    empreendedorId: item.empreendedorId || '',
    empreendedorNome: item.empreendedorNome || '',
    processo: item.processo || '',
    tipoReferencia: item.tipoReferencia || 'avulsa',
    referenciaId: item.referenciaId || '',
    relatoIndividual: '',
  };
}

export const SolicitarVistoriaModal: React.FC<SolicitarVistoriaModalProps> = ({
  isOpen,
  onClose,
  prefill,
  multiTargets,
  editingRecord,
  onSuccess,
  onBatchSuccess,
}) => {
  const isEditing = Boolean(editingRecord);
  const { barragens: ecosystemBarragens } = useContext(EcosystemContext);

  const [step, setStep] = useState<'form' | 'preview' | 'results'>('form');
  const [targets, setTargets] = useState<TargetDraft[]>([]);
  const [justificationMode, setJustificationMode] = useState<'geral' | 'individual'>('geral');
  const [relatoGeral, setRelatoGeral] = useState('');
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [showAddPicker, setShowAddPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dispatchResults, setDispatchResults] = useState<DispatchResultItem[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setStep('form');
    setSubmitting(false);
    setDispatchResults([]);
    setAddSearchQuery('');
    setShowAddPicker(false);

    if (editingRecord) {
      setTargets([
        {
          key: editingRecord.id,
          selected: true,
          barragemId: editingRecord.barragem_id || '',
          nomeBarragem: editingRecord.nome_barragem || '',
          municipio: editingRecord.municipio || '',
          cursoAgua: editingRecord.curso_agua || '',
          coordenadas: editingRecord.coordenadas || '',
          empreendedorId: editingRecord.empreendedor_id || '',
          empreendedorNome: editingRecord.empreendedor_nome || '',
          processo: editingRecord.processo || '',
          tipoReferencia:
            (editingRecord.tipo_referencia as SolicitacaoVistoriaPrefill['tipoReferencia']) || 'avulsa',
          referenciaId: editingRecord.referencia_id || '',
          relatoIndividual: editingRecord.relato || '',
        },
      ]);
      setJustificationMode('geral');
      setRelatoGeral(editingRecord.relato || '');
      return;
    }

    const initialList =
      Array.isArray(multiTargets) && multiTargets.length > 0
        ? multiTargets
        : prefill
          ? [prefill]
          : [{}];

    setTargets(initialList.map((item, idx) => buildDraftFromPrefill(item, idx)));
    setJustificationMode('geral');
    setRelatoGeral('');
  }, [isOpen, prefill, multiTargets, editingRecord]);

  const addableBarragens = useMemo(() => {
    const matched = searchBarragens(ecosystemBarragens, {
      query: addSearchQuery,
      includeUnlinked: true,
    });
    return paginateItems(matched, 1, 20).items;
  }, [ecosystemBarragens, addSearchQuery]);

  if (!isOpen) return null;

  const selectedTargets = targets.filter((t) => t.selected);
  const singleTarget = targets[0];

  const updateTarget = (key: string, patch: Partial<TargetDraft>) => {
    setTargets((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  };

  const handleAddEcosystemBarragem = (bar: (typeof ecosystemBarragens)[number]) => {
    const alreadyExists = targets.some(
      (t) => (t.barragemId && t.barragemId === bar.id) || (t.nomeBarragem && t.nomeBarragem === bar.nomeBarragem)
    );
    if (alreadyExists) {
      toast.info(`"${bar.nomeBarragem}" já está na lista de destinos.`);
      return;
    }
    const baseRef = prefill || multiTargets?.[0];
    setTargets((prev) => [
      ...prev.filter((t) => t.nomeBarragem || t.barragemId || t.empreendedorNome || prev.length > 1),
      buildDraftFromPrefill(
        {
          tipoReferencia: baseRef?.tipoReferencia || 'avulsa',
          referenciaId: baseRef?.referenciaId,
          processo: bar.processoReferencia || baseRef?.processo,
          barragemId: bar.id,
          nomeBarragem: bar.nomeBarragem,
          municipio: bar.municipio,
          cursoAgua: bar.cursoAguaBarrado,
          coordenadas: formatCoordenadasGmsString(bar.coordenadasGMS),
          empreendedorId: bar.empreendedorId || baseRef?.empreendedorId,
          empreendedorNome: bar.empreendedorNome || baseRef?.empreendedorNome,
        },
        prev.length + Date.now()
      ),
    ]);
    setAddSearchQuery('');
    setShowAddPicker(false);
  };

  const validateBeforePreview = (): string | null => {
    if (selectedTargets.length === 0) {
      return 'Selecione ao menos uma barragem/entidade de destino.';
    }

    if (justificationMode === 'geral' || isEditing) {
      const cleanRelato = relatoGeral.trim();
      if (!cleanRelato) {
        return 'Descreva o motivo e os detalhes no campo de justificativa/relato.';
      }
      if (cleanRelato.length > SOLICITACAO_RELATO_MAX) {
        return `O relato deve ter no máximo ${SOLICITACAO_RELATO_MAX} caracteres.`;
      }
      const err = validateTextSafety('relato', cleanRelato);
      if (err) return err;
    }

    for (const item of selectedTargets) {
      const labelPrefix = item.nomeBarragem || item.empreendedorNome || 'Destino';
      if (justificationMode === 'individual' && !isEditing) {
        const cleanIndiv = item.relatoIndividual.trim();
        if (!cleanIndiv) {
          return `Informe o relato individual para "${labelPrefix}".`;
        }
        if (cleanIndiv.length > SOLICITACAO_RELATO_MAX) {
          return `O relato de "${labelPrefix}" deve ter no máximo ${SOLICITACAO_RELATO_MAX} caracteres.`;
        }
        const errRel = validateTextSafety(`relato (${labelPrefix})`, cleanIndiv);
        if (errRel) return errRel;
      }

      const fields: Array<{ label: string; value: string; skipDocCheck?: boolean }> = [
        { label: `Nome da barragem (${labelPrefix})`, value: item.nomeBarragem },
        { label: `Município (${labelPrefix})`, value: item.municipio },
        { label: `Curso d'água (${labelPrefix})`, value: item.cursoAgua },
        { label: `Coordenadas (${labelPrefix})`, value: item.coordenadas },
        { label: `Empreendedor (${labelPrefix})`, value: item.empreendedorNome },
        {
          label: `Processo (${labelPrefix})`,
          value: item.processo,
          skipDocCheck: /^(?:[A-Z]{2,10}-?)?\d{4,7}\/(?:19|20)\d{2}$/i.test(item.processo.trim()),
        },
      ];
      for (const field of fields) {
        const err = validateTextSafety(field.label, field.value, field.skipDocCheck);
        if (err) return err;
      }
    }

    return null;
  };

  const handleContinueToPreview = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateBeforePreview();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setStep('preview');
  };

  const handleConfirmSend = async () => {
    setSubmitting(true);
    setFormError(null);

    if (isEditing && editingRecord && singleTarget) {
      try {
        const saved = await updateSolicitacaoVistoria(editingRecord.id, {
          nome_barragem: singleTarget.nomeBarragem.trim() || null,
          municipio: singleTarget.municipio.trim() || null,
          curso_agua: singleTarget.cursoAgua.trim() || null,
          coordenadas: singleTarget.coordenadas.trim() || null,
          empreendedor_nome: singleTarget.empreendedorNome.trim() || null,
          processo: singleTarget.processo.trim() || null,
          relato: relatoGeral.trim(),
          barragem_id: singleTarget.barragemId || null,
          empreendedor_id: singleTarget.empreendedorId || null,
        });
        toast.success('Solicitação de vistoria atualizada com sucesso.');
        onSuccess?.(saved);
        onClose();
      } catch (err) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Não foi possível atualizar a solicitação de vistoria.';
        setFormError(msg);
        toast.error(msg);
        setStep('form');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const createdRecords: SolicitacaoVistoriaRecord[] = [];
    const results: DispatchResultItem[] = [];

    for (const item of selectedTargets) {
      const label = item.nomeBarragem || item.empreendedorNome || 'Solicitação avulsa';
      const itemRelato =
        justificationMode === 'individual' ? item.relatoIndividual.trim() : relatoGeral.trim();
      try {
        const saved = await createSolicitacaoVistoria({
          nome_barragem: item.nomeBarragem.trim() || null,
          municipio: item.municipio.trim() || null,
          curso_agua: item.cursoAgua.trim() || null,
          coordenadas: item.coordenadas.trim() || null,
          empreendedor_nome: item.empreendedorNome.trim() || null,
          processo: item.processo.trim() || null,
          relato: itemRelato,
          barragem_id: item.barragemId || null,
          empreendedor_id: item.empreendedorId || null,
          tipo_referencia: item.tipoReferencia || 'avulsa',
          referencia_id: item.referenciaId || null,
        });
        createdRecords.push(saved);
        results.push({
          key: item.key,
          label,
          ok: true,
          message: 'Solicitação registrada no Fiscaliza.',
        });
      } catch (err) {
        results.push({
          key: item.key,
          label,
          ok: false,
          message:
            err instanceof Error && err.message ? err.message : 'Falha ao enviar solicitação.',
        });
      }
    }

    setSubmitting(false);
    setDispatchResults(results);

    if (createdRecords.length > 0) {
      onSuccess?.(createdRecords[0]);
      onBatchSuccess?.(createdRecords);
    }

    const failCount = results.filter((r) => !r.ok).length;
    if (failCount === 0) {
      toast.success(
        createdRecords.length === 1
          ? 'Solicitação de vistoria enviada com sucesso.'
          : `${createdRecords.length} solicitações de vistoria enviadas com sucesso.`
      );
      if (results.length === 1) {
        onClose();
        return;
      }
    } else {
      toast.error(`${failCount} solicitação(ões) falharam no envio.`);
    }

    setStep('results');
  };

  const tipoDocLabel = (() => {
    const tipo = editingRecord?.tipo_referencia || prefill?.tipoReferencia || multiTargets?.[0]?.tipoReferencia;
    if (tipo === 'parecer') return 'Origem: Parecer Técnico';
    if (tipo === 'oficio') return 'Origem: Ofício de Pendências';
    if (tipo === 'notificacao') return 'Origem: Notificação';
    return 'Solicitação avulsa';
  })();

  const relatoCount = relatoGeral.length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="solicitar-vistoria-modal-title"
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
              <ClipboardCheck size={18} />
            </div>
            <div className="min-w-0">
              <h2
                id="solicitar-vistoria-modal-title"
                className="text-base font-bold text-slate-900 truncate"
              >
                {isEditing
                  ? 'Editar Solicitação de Vistoria'
                  : step === 'preview'
                    ? 'Confirmar Envio de Solicitação'
                    : step === 'results'
                      ? 'Resultado do Envio'
                      : 'Solicitar Vistoria (Fiscaliza CSB)'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {tipoDocLabel} · {selectedTargets.length} destino(s) selecionado(s)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {step === 'form' && (
          <form onSubmit={handleContinueToPreview} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            {!isEditing && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Destinos / Barragens ({selectedTargets.length}/{targets.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setTargets((prev) => prev.map((t) => ({ ...t, selected: true })))
                      }
                      className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Selecionar todas
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddPicker((prev) => !prev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      <Plus size={12} />
                      Adicionar barragem
                    </button>
                  </div>
                </div>

                {showAddPicker && (
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={addSearchQuery}
                        onChange={(e) => setAddSearchQuery(e.target.value)}
                        placeholder="Buscar barragem no Administra (nome, SNISB, município, ID)..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {addableBarragens.map((bar) => {
                        const rel = describeBarragemRelationship(bar);
                        return (
                          <button
                            key={bar.id}
                            type="button"
                            onClick={() => handleAddEcosystemBarragem(bar)}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-50 text-xs flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">
                                {bar.nomeBarragem || bar.id}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {bar.municipio || 'Sem município'} · {rel.label} · {rel.coordinatesLabel}
                              </p>
                            </div>
                            <span className="text-[11px] font-bold text-emerald-700 shrink-0">
                              Incluir
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {targets.length > 1 && (
                  <div className="space-y-1.5">
                    {targets.map((target, idx) => (
                      <div
                        key={target.key}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs"
                      >
                        <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={target.selected}
                            onChange={(e) =>
                              updateTarget(target.key, { selected: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {idx + 1}. {target.nomeBarragem || target.empreendedorNome || 'Destino sem nome'}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {target.municipio || 'Município não informado'}
                              {target.coordenadas ? ` · ${target.coordenadas}` : ' · coord. indisponíveis'}
                            </p>
                          </div>
                        </label>
                        {targets.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setTargets((prev) => prev.filter((item) => item.key !== target.key))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            aria-label="Remover destino"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Editable fields when single target, or per selected target */}
            {targets.length === 1 && singleTarget && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome da Barragem
                  </label>
                  <div className="relative">
                    <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={singleTarget.nomeBarragem}
                      onChange={(e) => updateTarget(singleTarget.key, { nomeBarragem: e.target.value })}
                      maxLength={300}
                      placeholder="Informe o nome da barragem"
                      className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Município
                  </label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={singleTarget.municipio}
                      onChange={(e) => updateTarget(singleTarget.key, { municipio: e.target.value })}
                      maxLength={300}
                      placeholder="Ex.: Cuiabá"
                      className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Curso d&apos;água
                  </label>
                  <div className="relative">
                    <Droplets size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={singleTarget.cursoAgua}
                      onChange={(e) => updateTarget(singleTarget.key, { cursoAgua: e.target.value })}
                      maxLength={300}
                      placeholder="Nome do curso d'água barrado"
                      className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Coordenadas
                  </label>
                  <input
                    type="text"
                    value={singleTarget.coordenadas}
                    onChange={(e) => updateTarget(singleTarget.key, { coordenadas: e.target.value })}
                    maxLength={300}
                    placeholder="Ex.: 15°35'42,10&quot; S / 56°05'12,30&quot; W"
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Empreendedor (nome)
                  </label>
                  <input
                    type="text"
                    value={singleTarget.empreendedorNome}
                    onChange={(e) => updateTarget(singleTarget.key, { empreendedorNome: e.target.value })}
                    maxLength={300}
                    placeholder="Nome do empreendedor (sem CPF/CNPJ)"
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Processo
                  </label>
                  <div className="relative">
                    <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={singleTarget.processo}
                      onChange={(e) => updateTarget(singleTarget.key, { processo: e.target.value })}
                      maxLength={300}
                      placeholder="Ex.: 123456/2026"
                      className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {!isEditing && targets.length > 1 && (
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl p-1 bg-slate-50 w-fit">
                <button
                  type="button"
                  onClick={() => setJustificationMode('geral')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    justificationMode === 'geral'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Justificativa geral
                </button>
                <button
                  type="button"
                  onClick={() => setJustificationMode('individual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    justificationMode === 'individual'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Justificativa por destino
                </button>
              </div>
            )}

            {(justificationMode === 'geral' || isEditing || targets.length === 1) && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Relato / Justificativa da solicitação <span className="text-rose-600">*</span>
                  </label>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      relatoCount > SOLICITACAO_RELATO_MAX
                        ? 'text-rose-600'
                        : relatoCount >= 900
                          ? 'text-amber-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {relatoCount} / {SOLICITACAO_RELATO_MAX} caracteres
                  </span>
                </div>
                <textarea
                  value={relatoGeral}
                  onChange={(e) => setRelatoGeral(e.target.value)}
                  maxLength={SOLICITACAO_RELATO_MAX}
                  rows={4}
                  required
                  placeholder="Descreva objetivamente os pontos que motivam a vistoria em campo (não informe CPF/CNPJ)."
                  className="w-full px-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-y"
                />
              </div>
            )}

            {!isEditing && targets.length > 1 && justificationMode === 'individual' && (
              <div className="space-y-3">
                {selectedTargets.map((item) => (
                  <div key={item.key} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">
                        {item.nomeBarragem || item.empreendedorNome || 'Destino'}
                      </span>
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {item.relatoIndividual.length} / {SOLICITACAO_RELATO_MAX}
                      </span>
                    </div>
                    <textarea
                      value={item.relatoIndividual}
                      onChange={(e) => updateTarget(item.key, { relatoIndividual: e.target.value })}
                      maxLength={SOLICITACAO_RELATO_MAX}
                      rows={2}
                      required
                      placeholder={`Justificativa específica para ${item.nomeBarragem || 'este destino'}...`}
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 resize-y"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || selectedTargets.length === 0}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ClipboardCheck size={14} />
                <span>Revisar prévia ({selectedTargets.length})</span>
              </button>
            </div>
          </form>
        )}

        {step === 'preview' && (
          <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="p-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-900 text-xs">
              <p className="font-semibold">
                Prévia de envio para o Fiscaliza CSB: {selectedTargets.length} solicitação(ões) serão registradas.
              </p>
              <p className="text-[11px] text-sky-800 mt-0.5">
                Confira os destinos e justificativas abaixo antes de confirmar o disparo.
              </p>
            </div>

            <div className="space-y-2.5">
              {selectedTargets.map((item, idx) => {
                const text =
                  justificationMode === 'individual' && targets.length > 1
                    ? item.relatoIndividual.trim()
                    : relatoGeral.trim();
                return (
                  <div
                    key={item.key}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {idx + 1}. {item.nomeBarragem || item.empreendedorNome || 'Solicitação avulsa'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {item.municipio || 'Município não informado'}
                        {item.processo ? ` · Proc. ${item.processo}` : ''}
                      </span>
                    </div>
                    {item.coordenadas && (
                      <p className="text-[11px] font-mono text-slate-600">Coord.: {item.coordenadas}</p>
                    )}
                    <p className="text-slate-700 bg-white border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap">
                      {text}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setStep('form')}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Voltar e editar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmSend()}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <ClipboardCheck size={14} />
                    <span>
                      {isEditing
                        ? 'Confirmar e salvar alterações'
                        : `Confirmar e enviar (${selectedTargets.length})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'results' && (
          <div className="p-5 space-y-4">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {dispatchResults.map((resItem) => (
                <div
                  key={resItem.key}
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    resItem.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {resItem.ok ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-bold">{resItem.label}</p>
                    <p className="text-[11px]">{resItem.message}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
