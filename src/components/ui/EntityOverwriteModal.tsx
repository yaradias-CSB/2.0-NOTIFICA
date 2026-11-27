import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { ConflictItem } from '../../lib/formSelectionMerge';

interface EntityOverwriteModalProps {
  isOpen: boolean;
  entityLabel: string;
  conflicts: ConflictItem[];
  onApplyEmptyOnly: () => void;
  onOverwriteAll: () => void;
  onCancel: () => void;
}

export const EntityOverwriteModal: React.FC<EntityOverwriteModalProps> = ({
  isOpen,
  entityLabel,
  conflicts,
  onApplyEmptyOnly,
  onOverwriteAll,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entity-overwrite-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <h2 id="entity-overwrite-modal-title" className="text-sm font-bold text-slate-900 truncate">
                Confirmar substituição de campos preenchidos
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Seleção de {entityLabel} no Administra
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            O formulário já possui valores digitados que diferem do cadastro selecionado. Escolha se deseja preencher apenas os campos vazios ou substituir os campos listados abaixo:
          </p>

          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
            {conflicts.map((item) => (
              <div key={item.key} className="p-3 space-y-1">
                <p className="font-bold text-slate-800">{item.label}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="block font-semibold text-slate-500">Valor atual</span>
                    <span className="text-slate-900 break-words">{item.currentValue}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <span className="block font-semibold text-emerald-700">Cadastro Administra</span>
                    <span className="text-emerald-950 break-words">{item.incomingValue}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onApplyEmptyOnly}
              className="px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              Preencher só vazios
            </button>
            <button
              type="button"
              onClick={onOverwriteAll}
              className="px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors cursor-pointer"
            >
              Substituir campos preenchidos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
