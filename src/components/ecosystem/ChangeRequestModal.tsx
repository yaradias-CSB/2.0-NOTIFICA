import React, { useContext, useEffect, useMemo, useState } from 'react';
import { X, Send, ShieldAlert, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EcosystemContext } from '../../contexts/EcosystemContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarragemCanonica,
  ChangeRequestTargetType,
  ECOSYSTEM_SYSTEM_LABELS,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../../types/ecosystem';
import { OPS_MUNICIPIOS } from '../../constants';

interface ChangeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: ChangeRequestTargetType;
  record: EmpreendedorCanonico | BarragemCanonica | ResponsavelTecnicoCanonico | null;
}

interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'select';
  options?: string[];
}

const EMPREENDEDOR_FIELDS: FieldDef[] = [
  { key: 'nome', label: 'Nome / Razão Social' },
  { key: 'cpfCnpj', label: 'CPF / CNPJ' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'logradouro', label: 'Logradouro' },
  { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'municipio', label: 'Município', type: 'select', options: OPS_MUNICIPIOS },
  { key: 'uf', label: 'UF' },
  { key: 'cep', label: 'CEP' },
  { key: 'carMt', label: 'CAR/MT' },
];

const BARRAGEM_FIELDS: FieldDef[] = [
  { key: 'nomeBarragem', label: 'Nome da Barragem / Empreendimento' },
  { key: 'codigoSnisb', label: 'Código SNISB' },
  { key: 'municipio', label: 'Município', type: 'select', options: OPS_MUNICIPIOS },
  { key: 'uf', label: 'UF' },
  { key: 'cursoAguaBarrado', label: "Curso d'Água Barrado" },
  { key: 'usoPreponderante', label: 'Uso Preponderante' },
  { key: 'situacaoEmpreendimento', label: 'Situação do Empreendimento' },
  { key: 'tipoBarragem', label: 'Tipo de Barragem' },
  { key: 'altura', label: 'Altura (m)' },
  { key: 'volume', label: 'Volume (hm³)' },
  { key: 'classificacaoDPA', label: 'Classificação DPA' },
  { key: 'classificacaoCRI', label: 'Classificação CRI' },
  { key: 'portariaClassificacao', label: 'Portaria de Classificação' },
  { key: 'parecerClassificacao', label: 'Parecer de Classificação' },
];

const RT_FIELDS: FieldDef[] = [
  { key: 'nome', label: 'Nome Completo' },
  { key: 'registroProfissional', label: 'Registro Profissional (CREA)' },
  { key: 'formacaoProfissional', label: 'Formação Profissional' },
  { key: 'cpf', label: 'CPF' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
];

export const ChangeRequestModal: React.FC<ChangeRequestModalProps> = ({
  isOpen,
  onClose,
  targetType,
  record,
}) => {
  const { submitChangeRequest } = useContext(EcosystemContext);
  const { profile, user } = useAuth();
  const sessionAnalystName = profile?.nome || user?.email || '';
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fields = useMemo(() => {
    if (targetType === 'EMPREENDEDOR') return EMPREENDEDOR_FIELDS;
    if (targetType === 'BARRAGEM') return BARRAGEM_FIELDS;
    return RT_FIELDS;
  }, [targetType]);

  useEffect(() => {
    if (isOpen && record) {
      const initial: Record<string, string> = {};
      fields.forEach((f) => {
        const val = (record as unknown as Record<string, unknown>)[f.key];
        initial[f.key] = val !== undefined && val !== null ? String(val) : '';
      });
      setFormValues(initial);
      setJustification('');
    }
  }, [isOpen, record, fields]);

  const changedFields = useMemo(() => {
    if (!record) return [];
    const recMap = record as unknown as Record<string, unknown>;
    return fields.filter((f) => {
      const original = recMap[f.key] !== undefined && recMap[f.key] !== null ? String(recMap[f.key]) : '';
      return (formValues[f.key] || '') !== original;
    });
  }, [fields, formValues, record]);

  if (!isOpen || !record) return null;

  const targetLabel =
    targetType === 'EMPREENDEDOR'
      ? (record as EmpreendedorCanonico).nome
      : targetType === 'BARRAGEM'
        ? (record as BarragemCanonica).nomeBarragem
        : (record as ResponsavelTecnicoCanonico).nome;

  const ownerInfo = ECOSYSTEM_SYSTEM_LABELS[record.sourceSystem];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionAnalystName.trim()) {
      toast.error('Sessão de analista autenticada é obrigatória.');
      return;
    }
    if (justification.trim().length < 5) {
      toast.error('Informe uma justificativa técnica com ao menos 5 caracteres.');
      return;
    }
    if (changedFields.length === 0) {
      toast.error('Altere ao menos um campo antes de enviar a solicitação.');
      return;
    }

    const currentSnapshot: Record<string, unknown> = {};
    const proposedChanges: Record<string, unknown> = {};
    const recMap = record as unknown as Record<string, unknown>;

    changedFields.forEach((f) => {
      currentSnapshot[f.key] = recMap[f.key] ?? '';
      proposedChanges[f.key] = formValues[f.key] ?? '';
    });

    setSubmitting(true);
    try {
      const res = await submitChangeRequest({
        targetType,
        targetId: record.id,
        targetLabel,
        targetOwnerSystem: record.sourceSystem,
        requestedByName: sessionAnalystName.trim(),
        justification: justification.trim(),
        currentSnapshot,
        proposedChanges,
      });

      if (!res.success) {
        toast.error(res.message || 'Não foi possível enviar a solicitação.');
        return;
      }

      toast.success(
        `Solicitação enviada para aprovação do analista/administrador do sistema ${ownerInfo.shortName}.`
      );
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight">
                Solicitar Alteração de Registro Externo
              </h3>
              <p className="text-xs text-slate-400">
                Origem protegida: <strong className="text-amber-300">{ownerInfo.name}</strong> • Alvo:{' '}
                <strong className="text-white">{targetLabel}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            Por regra do ecossistema CSB, informações cadastradas por outro sistema não podem ser
            sobrescritas diretamente. Sua proposta ficará registrada para que o analista ou
            administrador de <strong>{ownerInfo.name}</strong> possa <strong>Aprovar</strong> ou{' '}
            <strong>Reprovar</strong> a atualização na base central do Administra.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                Analista Solicitante (Sessão Autenticada)
              </label>
              <input
                type="text"
                value={sessionAnalystName}
                readOnly
                className="w-full px-3.5 py-2.5 bg-slate-100 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                Justificativa Técnica da Alteração *
              </label>
              <input
                type="text"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ex: Atualização de CNPJ/endereço conforme documentação protocolada"
                className="w-full px-3.5 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:border-emerald-600 outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
                Campos Propostos para Atualização
              </h4>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                {changedFields.length} {changedFields.length === 1 ? 'campo alterado' : 'campos alterados'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field) => {
                const recMap = record as unknown as Record<string, unknown>;
                const originalValue =
                  recMap[field.key] !== undefined && recMap[field.key] !== null
                    ? String(recMap[field.key])
                    : '';
                const currentValue = formValues[field.key] || '';
                const isModified = currentValue !== originalValue;

                return (
                  <div
                    key={field.key}
                    className={`p-3 rounded-2xl border transition-all ${
                      isModified
                        ? 'bg-emerald-50/50 border-emerald-300'
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">
                      {field.label}
                    </label>
                    {field.type === 'select' && field.options ? (
                      <select
                        value={currentValue}
                        onChange={(e) =>
                          setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none"
                      >
                        <option value="">Selecione...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={currentValue}
                        onChange={(e) =>
                          setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none"
                      />
                    )}
                    {isModified && (
                      <p className="mt-1.5 text-[10px] text-slate-600 flex items-center gap-1 flex-wrap">
                        <span className="line-through text-rose-600">{originalValue || '(vazio)'}</span>
                        <ArrowRight size={10} className="text-emerald-600 shrink-0" />
                        <span className="font-bold text-emerald-700">{currentValue || '(vazio)'}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || changedFields.length === 0}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Enviar Solicitação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
