import React, { useEffect, useState } from 'react';
import { X, Loader2, ClipboardCheck, AlertCircle, MapPin, Building2, Droplets, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  createSolicitacaoVistoria,
  updateSolicitacaoVistoria,
} from '../data/solicitacoesVistoriaRepository';
import {
  SOLICITACAO_RELATO_MAX,
  containsCpfCnpjClient,
  looksLikeSerializedJsonClient,
  type SolicitacaoVistoriaPrefill,
  type SolicitacaoVistoriaRecord,
} from '../types/solicitacoesVistoria';

interface SolicitarVistoriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: SolicitacaoVistoriaPrefill | null;
  editingRecord?: SolicitacaoVistoriaRecord | null;
  onSuccess?: (record: SolicitacaoVistoriaRecord) => void;
}

export const SolicitarVistoriaModal: React.FC<SolicitarVistoriaModalProps> = ({
  isOpen,
  onClose,
  prefill,
  editingRecord,
  onSuccess,
}) => {
  const isEditing = Boolean(editingRecord);

  const [nomeBarragem, setNomeBarragem] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [cursoAgua, setCursoAgua] = useState('');
  const [coordenadas, setCoordenadas] = useState('');
  const [empreendedorNome, setEmpreendedorNome] = useState('');
  const [processo, setProcesso] = useState('');
  const [relato, setRelato] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    if (editingRecord) {
      setNomeBarragem(editingRecord.nome_barragem || '');
      setMunicipio(editingRecord.municipio || '');
      setCursoAgua(editingRecord.curso_agua || '');
      setCoordenadas(editingRecord.coordenadas || '');
      setEmpreendedorNome(editingRecord.empreendedor_nome || '');
      setProcesso(editingRecord.processo || '');
      setRelato(editingRecord.relato || '');
    } else {
      setNomeBarragem(prefill?.nomeBarragem || '');
      setMunicipio(prefill?.municipio || '');
      setCursoAgua(prefill?.cursoAgua || '');
      setCoordenadas(prefill?.coordenadas || '');
      setEmpreendedorNome(prefill?.empreendedorNome || '');
      setProcesso(prefill?.processo || '');
      setRelato('');
    }
  }, [isOpen, prefill, editingRecord]);

  if (!isOpen) return null;

  const validateFields = (): string | null => {
    const cleanRelato = relato.trim();
    if (!cleanRelato) {
      return 'Descreva o motivo e os detalhes no campo de relato.';
    }
    if (cleanRelato.length > SOLICITACAO_RELATO_MAX) {
      return `O relato deve ter no máximo ${SOLICITACAO_RELATO_MAX} caracteres.`;
    }
    if (looksLikeSerializedJsonClient(cleanRelato)) {
      return 'Não é permitido colar conteúdo JSON no campo de relato.';
    }
    if (containsCpfCnpjClient(cleanRelato)) {
      return 'Não inclua CPF ou CNPJ no relato. Utilize apenas o nome ou identificador do cadastro.';
    }

    const otherFields: Array<{ label: string; value: string; skipDocCheck?: boolean }> = [
      { label: 'Nome da barragem', value: nomeBarragem },
      { label: 'Município', value: municipio },
      { label: "Curso d'água", value: cursoAgua },
      { label: 'Coordenadas', value: coordenadas },
      { label: 'Empreendedor', value: empreendedorNome },
      { label: 'Processo', value: processo, skipDocCheck: /^(?:[A-Z]{2,10}-?)?\d{4,7}\/(?:19|20)\d{2}$/i.test(processo.trim()) },
    ];

    for (const field of otherFields) {
      const val = field.value.trim();
      if (!val) continue;
      if (looksLikeSerializedJsonClient(val)) {
        return `Conteúdo JSON não é permitido em ${field.label}.`;
      }
      if (!field.skipDocCheck && containsCpfCnpjClient(val)) {
        return `Não inclua CPF ou CNPJ em ${field.label}.`;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateFields();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        nome_barragem: nomeBarragem.trim() || null,
        municipio: municipio.trim() || null,
        curso_agua: cursoAgua.trim() || null,
        coordenadas: coordenadas.trim() || null,
        empreendedor_nome: empreendedorNome.trim() || null,
        processo: processo.trim() || null,
        relato: relato.trim(),
        barragem_id: (isEditing ? editingRecord?.barragem_id : prefill?.barragemId) || null,
        empreendedor_id: (isEditing ? editingRecord?.empreendedor_id : prefill?.empreendedorId) || null,
      };

      const saved = isEditing && editingRecord
        ? await updateSolicitacaoVistoria(editingRecord.id, payload)
        : await createSolicitacaoVistoria({
            ...payload,
            tipo_referencia: prefill?.tipoReferencia || 'avulsa',
            referencia_id: prefill?.referenciaId || null,
          });

      toast.success(
        isEditing
          ? 'Solicitação de vistoria atualizada com sucesso.'
          : 'Solicitação de vistoria enviada com sucesso.'
      );
      onSuccess?.(saved);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível concluir a solicitação de vistoria.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const relatoCount = relato.length;
  const isNearLimit = relatoCount >= 900;
  const isOverLimit = relatoCount > SOLICITACAO_RELATO_MAX;

  const tipoDocLabel = (() => {
    const tipo = editingRecord?.tipo_referencia || prefill?.tipoReferencia;
    if (tipo === 'parecer') return 'Origem: Parecer Técnico';
    if (tipo === 'oficio') return 'Origem: Ofício de Pendências';
    if (tipo === 'notificacao') return 'Origem: Notificação';
    return 'Solicitação avulsa';
  })();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="solicitar-vistoria-modal-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
              <ClipboardCheck size={18} />
            </div>
            <div className="min-w-0">
              <h2
                id="solicitar-vistoria-modal-title"
                className="text-base font-bold text-slate-900 truncate"
              >
                {isEditing ? 'Editar Solicitação de Vistoria' : 'Solicitar Vistoria'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {tipoDocLabel}
                {processo.trim() ? ` · Processo ${processo.trim()}` : ''}
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome da Barragem
              </label>
              <div className="relative">
                <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={nomeBarragem}
                  onChange={(e) => setNomeBarragem(e.target.value)}
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
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
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
                  value={cursoAgua}
                  onChange={(e) => setCursoAgua(e.target.value)}
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
                value={coordenadas}
                onChange={(e) => setCoordenadas(e.target.value)}
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
                value={empreendedorNome}
                onChange={(e) => setEmpreendedorNome(e.target.value)}
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
                  value={processo}
                  onChange={(e) => setProcesso(e.target.value)}
                  maxLength={300}
                  placeholder="Ex.: 123456/2026"
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Relato da solicitação <span className="text-rose-600">*</span>
              </label>
              <span
                className={`text-xs font-semibold tabular-nums ${
                  isOverLimit
                    ? 'text-rose-600'
                    : isNearLimit
                      ? 'text-amber-600'
                      : 'text-slate-500'
                }`}
              >
                {relatoCount} / {SOLICITACAO_RELATO_MAX} caracteres
              </span>
            </div>
            <textarea
              value={relato}
              onChange={(e) => setRelato(e.target.value)}
              maxLength={SOLICITACAO_RELATO_MAX}
              rows={4}
              required
              placeholder="Descreva objetivamente os pontos que motivam a vistoria em campo (não informe CPF/CNPJ)."
              className="w-full px-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-y"
            />
          </div>

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
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <ClipboardCheck size={14} />
                  <span>{isEditing ? 'Salvar alterações' : 'Enviar solicitação'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
