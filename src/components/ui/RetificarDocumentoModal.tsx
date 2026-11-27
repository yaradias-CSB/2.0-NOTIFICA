import React, { useEffect, useState } from 'react';
import { FileEdit, ShieldAlert, X } from 'lucide-react';
import {
  getDocumentBarragemValue,
  getDocumentNumberValue,
  getDocumentProcessValue,
  type PermissionCheckDocument,
} from '../../lib/documentPermissions';

interface RetificarDocumentoModalProps {
  isOpen: boolean;
  doc: PermissionCheckDocument | null;
  onConfirm: (justification: string) => void | Promise<void>;
  onCancel: () => void;
}

export const RetificarDocumentoModal: React.FC<RetificarDocumentoModalProps> = ({
  isOpen,
  doc,
  onConfirm,
  onCancel,
}) => {
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setJustification('');
    setError(null);
    setSubmitting(false);
  }, [isOpen, doc?.id]);

  if (!isOpen || !doc) return null;

  const docNumber = getDocumentNumberValue(doc) || doc.id || 'Documento';
  const docProcess = getDocumentProcessValue(doc);
  const docBarragem = getDocumentBarragemValue(doc);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = justification.trim();
    if (clean.length < 5) {
      setError('Informe uma justificativa com pelo menos 5 caracteres para registrar a retificação.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar a retificação.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="retificar-doc-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <FileEdit size={18} />
            </div>
            <div className="min-w-0">
              <h2 id="retificar-doc-modal-title" className="text-sm font-bold text-slate-900 truncate">
                Abrir Retificação Auditável
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {doc.tipo_documento || 'Documento'} · {docNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2.5">
            <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                O documento concluído original permanecerá imutável para fins de auditoria.
              </p>
              <p className="text-[11px] text-amber-800">
                Será aberto um novo rascunho vinculado ao documento de origem ({docNumber}
                {docProcess ? ` · Proc. ${docProcess}` : ''}
                {docBarragem ? ` · ${docBarragem}` : ''}), registrando autor, data/hora e justificativa.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="retificacao-justificativa-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Justificativa da retificação <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="retificacao-justificativa-input"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              required
              placeholder="Descreva o motivo técnico ou administrativo da retificação (mínimo 5 caracteres)..."
              className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 resize-y"
            />
            {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || justification.trim().length < 5}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Abrindo revisão...' : 'Gerar rascunho de retificação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
