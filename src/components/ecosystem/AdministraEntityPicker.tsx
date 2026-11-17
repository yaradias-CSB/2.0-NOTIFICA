import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Database,
  FileCheck2,
  GitPullRequest,
  PencilLine,
  RefreshCw,
  Search,
  UserCheck,
  Waves,
  X,
} from 'lucide-react';
import { EcosystemContext } from '../../contexts/EcosystemContext';
import {
  BarragemCanonica,
  ChangeRequestTargetType,
  ECOSYSTEM_SYSTEM_LABELS,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../../types/ecosystem';
import { normalizeDocumentNumber } from '../../lib/security';
import { normalizeCarCode, normalizeSearchText } from '../../data/localAdministraRepository';
import { ChangeRequestModal } from './ChangeRequestModal';

interface AdministraEntityPickerProps {
  readOnly?: boolean;
  currentDocumentId?: string;
  selectedEmpreendedorId?: string;
  selectedBarragemId?: string;
  cpfCnpj?: string;
  codigoSnisb?: string;
  nomeBarragem?: string;
  onSelectEmpreendedor: (empreendedor: EmpreendedorCanonico) => void;
  onSelectBarragem: (barragem: BarragemCanonica) => void;
  onSelectRT?: (rt: ResponsavelTecnicoCanonico) => void;
  onClearLinks?: () => void;
}

export const AdministraEntityPicker: React.FC<AdministraEntityPickerProps> = ({
  readOnly = false,
  currentDocumentId,
  selectedEmpreendedorId,
  selectedBarragemId,
  cpfCnpj,
  codigoSnisb,
  nomeBarragem,
  onSelectEmpreendedor,
  onSelectBarragem,
  onSelectRT,
  onClearLinks,
}) => {
  const {
    empreendedores,
    barragens,
    responsaveisTecnicos,
    loading,
    refreshEcosystem,
    canEditDirectly,
    getProductsForEntity,
  } = useContext(EcosystemContext);

  const [empQuery, setEmpQuery] = useState('');
  const [barQuery, setBarQuery] = useState('');
  const [rtQuery, setRtQuery] = useState('');
  const [showProducts, setShowProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [remoteEmpHits, setRemoteEmpHits] = useState<EmpreendedorCanonico[]>([]);
  const [remoteBarHits, setRemoteBarHits] = useState<BarragemCanonica[]>([]);

  const [changeModalState, setChangeModalState] = useState<{
    isOpen: boolean;
    targetType: ChangeRequestTargetType;
    record: EmpreendedorCanonico | BarragemCanonica | ResponsavelTecnicoCanonico | null;
  }>({
    isOpen: false,
    targetType: 'EMPREENDEDOR',
    record: null,
  });

  useEffect(() => {
    const q = (empQuery.trim() || barQuery.trim());
    if (q.length < 3 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setRemoteEmpHits([]);
      setRemoteBarHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/registry/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.empreendedores)) setRemoteEmpHits(data.empreendedores);
        if (Array.isArray(data.barragens)) setRemoteBarHits(data.barragens);
      } catch {
        // Ignore aborted or offline requests
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [empQuery, barQuery]);

  const allEmpreendedores = useMemo(() => {
    if (remoteEmpHits.length === 0) return empreendedores;
    const seen = new Set(empreendedores.map((e) => e.id));
    return [...empreendedores, ...remoteEmpHits.filter((e) => !seen.has(e.id))];
  }, [empreendedores, remoteEmpHits]);

  const allBarragens = useMemo(() => {
    if (remoteBarHits.length === 0) return barragens;
    const seen = new Set(barragens.map((b) => b.id));
    return [...barragens, ...remoteBarHits.filter((b) => !seen.has(b.id))];
  }, [barragens, remoteBarHits]);

  const selectedEmpreendedor = useMemo(
    () => allEmpreendedores.find((e) => e.id === selectedEmpreendedorId) || null,
    [allEmpreendedores, selectedEmpreendedorId]
  );

  const selectedBarragem = useMemo(
    () => allBarragens.find((b) => b.id === selectedBarragemId) || null,
    [allBarragens, selectedBarragemId]
  );

  const filteredEmpreendedores = useMemo(() => {
    const raw = empQuery.trim();
    if (!raw) return allEmpreendedores.slice(0, 25);

    const textQ = normalizeSearchText(raw);
    const digitsQ = normalizeDocumentNumber(raw);
    const carQ = normalizeCarCode(raw);

    return allEmpreendedores
      .filter((e) => {
        if (normalizeSearchText(e.nome).includes(textQ)) return true;
        if (normalizeSearchText(e.municipio).includes(textQ)) return true;
        if ((e.cpfCnpj || '').toLowerCase().includes(raw.toLowerCase())) return true;
        if (digitsQ.length >= 2 && (e.cpfCnpjNormalizado || normalizeDocumentNumber(e.cpfCnpj)).includes(digitsQ)) {
          return true;
        }
        if (carQ.length >= 3 && normalizeCarCode(e.carMt).includes(carQ)) return true;
        if (normalizeSearchText(e.carMt).includes(textQ)) return true;
        return false;
      })
      .slice(0, 25);
  }, [allEmpreendedores, empQuery]);

  const filteredBarragens = useMemo(() => {
    const raw = barQuery.trim();
    const base = selectedEmpreendedorId
      ? allBarragens.filter((b) => !b.empreendedorId || b.empreendedorId === selectedEmpreendedorId)
      : allBarragens;

    if (!raw) return base.slice(0, 25);

    const textQ = normalizeSearchText(raw);
    const digitsQ = normalizeDocumentNumber(raw);
    const carQ = normalizeCarCode(raw);

    return base
      .filter((b) => {
        if (normalizeSearchText(b.nomeBarragem).includes(textQ)) return true;
        if (normalizeSearchText(b.codigoSnisb).includes(textQ)) return true;
        if (normalizeSearchText(b.municipio).includes(textQ)) return true;
        if (normalizeSearchText(b.empreendedorNome).includes(textQ)) return true;
        if (digitsQ.length >= 2 && normalizeDocumentNumber(b.empreendedorCpfCnpj || '').includes(digitsQ)) {
          return true;
        }
        const linkedEmp = allEmpreendedores.find((e) => e.id === b.empreendedorId);
        if (linkedEmp && carQ.length >= 3 && normalizeCarCode(linkedEmp.carMt).includes(carQ)) {
          return true;
        }
        return false;
      })
      .slice(0, 25);
  }, [allBarragens, barQuery, selectedEmpreendedorId, allEmpreendedores]);

  const filteredRTs = useMemo(() => {
    const raw = rtQuery.trim();
    if (!raw) return responsaveisTecnicos.slice(0, 20);
    const textQ = normalizeSearchText(raw);
    const digitsQ = normalizeDocumentNumber(raw);
    return responsaveisTecnicos
      .filter(
        (rt) =>
          normalizeSearchText(rt.nome).includes(textQ) ||
          normalizeSearchText(rt.registroProfissional).includes(textQ) ||
          (digitsQ.length >= 2 && normalizeDocumentNumber(rt.cpf || '').includes(digitsQ))
      )
      .slice(0, 20);
  }, [responsaveisTecnicos, rtQuery]);

  const matchedProducts = useMemo(() => {
    return getProductsForEntity({
      empreendedorId: selectedEmpreendedorId,
      cpfCnpj: cpfCnpj || selectedEmpreendedor?.cpfCnpj,
      barragemId: selectedBarragemId,
      codigoSnisb: codigoSnisb || selectedBarragem?.codigoSnisb,
      nomeBarragem: nomeBarragem || selectedBarragem?.nomeBarragem,
    }).filter((item) => !currentDocumentId || item.id !== currentDocumentId);
  }, [
    getProductsForEntity,
    selectedEmpreendedorId,
    cpfCnpj,
    selectedEmpreendedor,
    selectedBarragemId,
    codigoSnisb,
    selectedBarragem,
    nomeBarragem,
    currentDocumentId,
  ]);

  const externalLinkedRecords = useMemo(() => {
    const list: Array<{
      type: ChangeRequestTargetType;
      label: string;
      record: EmpreendedorCanonico | BarragemCanonica;
    }> = [];
    if (selectedEmpreendedor && !canEditDirectly(selectedEmpreendedor.sourceSystem)) {
      list.push({
        type: 'EMPREENDEDOR',
        label: `Empreendedor: ${selectedEmpreendedor.nome}`,
        record: selectedEmpreendedor,
      });
    }
    if (selectedBarragem && !canEditDirectly(selectedBarragem.sourceSystem)) {
      list.push({
        type: 'BARRAGEM',
        label: `Barragem: ${selectedBarragem.nomeBarragem}`,
        record: selectedBarragem,
      });
    }
    return list;
  }, [selectedEmpreendedor, selectedBarragem, canEditDirectly]);

  const handleSelectEmpItem = (emp: EmpreendedorCanonico) => {
    onSelectEmpreendedor(emp);
    setEmpQuery('');
    // Also auto-link single barrage if entrepreneur has exactly one registered barrage
    const empBarragens = barragens.filter((b) => b.empreendedorId === emp.id);
    if (empBarragens.length === 1 && !selectedBarragemId) {
      onSelectBarragem(empBarragens[0]);
    }
  };

  return (
    <div className="rounded-3xl border-2 border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-slate-50 p-5 md:p-6 space-y-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
            <Database size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                Base Central • Administra Barragens
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                Ecossistema CSB
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Consulte por <strong>Nome, CPF/CNPJ ou CAR/MT</strong> ({empreendedores.length} empreendedores,{' '}
              {barragens.length} barragens, {responsaveisTecnicos.length} RTs).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!readOnly && (
            <button
              type="button"
              disabled={loading || refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await refreshEcosystem();
                } finally {
                  setRefreshing(false);
                }
              }}
              className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-white text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw size={12} className={loading || refreshing ? 'animate-spin' : ''} />
              Atualizar Base
            </button>
          )}

          {(selectedEmpreendedorId || selectedBarragemId) && !readOnly && onClearLinks && (
            <button
              type="button"
              onClick={onClearLinks}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:text-rose-600 hover:border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <X size={13} /> Desvincular Seleção
            </button>
          )}
        </div>
      </div>

      {/* Pickers */}
      {!readOnly && (
        <div className={`grid grid-cols-1 ${onSelectRT ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
          {/* Empreendedor Picker */}
          <div className="space-y-1.5 relative">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
              <Building2 size={12} className="text-emerald-600" /> Buscar Empreendedor (Nome, CPF/CNPJ ou CAR)
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={empQuery}
                onChange={(e) => setEmpQuery(e.target.value)}
                placeholder="Nome, CPF/CNPJ ou CAR/MT..."
                className="w-full pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-t-xl text-xs font-semibold text-slate-700 focus:border-emerald-600 outline-none"
              />
              {empQuery && (
                <button
                  type="button"
                  onClick={() => setEmpQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  aria-label="Limpar busca de empreendedor"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {empQuery.trim().length > 0 && (
              <div className="rounded-xl border border-emerald-300 bg-white shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                {filteredEmpreendedores.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">
                    Nenhum empreendedor encontrado para "{empQuery}". Você pode preencher manualmente nos campos abaixo.
                  </p>
                ) : (
                  filteredEmpreendedores.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => handleSelectEmpItem(emp)}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">{emp.nome}</p>
                        <p className="text-[10px] font-semibold text-slate-500 truncate">
                          {emp.cpfCnpj || 'S/Doc'}
                          {emp.carMt ? ` • CAR: ${emp.carMt}` : ''}
                          {emp.municipio ? ` • ${emp.municipio}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">
                        Usar
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            <select
              value={selectedEmpreendedorId || ''}
              onChange={(e) => {
                const found = allEmpreendedores.find((item) => item.id === e.target.value);
                if (found) handleSelectEmpItem(found);
              }}
              className="w-full px-3 py-2 bg-white border border-t-0 border-slate-300 rounded-b-xl text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none"
            >
              <option value="">
                {allEmpreendedores.length === 0
                  ? 'Nenhum empreendedor na base (será salvo ao concluir)'
                  : `-- Escolher empreendedor (${filteredEmpreendedores.length}) --`}
              </option>
              {filteredEmpreendedores.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nome} {emp.cpfCnpj ? `(${emp.cpfCnpj})` : ''}{' '}
                  {emp.carMt ? `[CAR: ${emp.carMt}]` : ''} [{ECOSYSTEM_SYSTEM_LABELS[emp.sourceSystem].shortName}]
                </option>
              ))}
            </select>
          </div>

          {/* Barragem Picker */}
          <div className="space-y-1.5 relative">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
              <Waves size={12} className="text-emerald-600" /> Buscar Barragem (Nome, SNISB, Município)
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={barQuery}
                onChange={(e) => setBarQuery(e.target.value)}
                placeholder="Nome, SNISB, município ou CAR..."
                className="w-full pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-t-xl text-xs font-semibold text-slate-700 focus:border-emerald-600 outline-none"
              />
              {barQuery && (
                <button
                  type="button"
                  onClick={() => setBarQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  aria-label="Limpar busca de barragem"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {barQuery.trim().length > 0 && (
              <div className="rounded-xl border border-emerald-300 bg-white shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                {filteredBarragens.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">
                    Nenhuma barragem encontrada para "{barQuery}".
                  </p>
                ) : (
                  filteredBarragens.map((bar) => (
                    <button
                      key={bar.id}
                      type="button"
                      onClick={() => {
                        onSelectBarragem(bar);
                        setBarQuery('');
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">{bar.nomeBarragem}</p>
                        <p className="text-[10px] font-semibold text-slate-500 truncate">
                          {bar.municipio || 'MT'}
                          {bar.codigoSnisb ? ` • SNISB: ${bar.codigoSnisb}` : ''}
                          {bar.empreendedorNome ? ` • ${bar.empreendedorNome}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">
                        Usar
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            <select
              value={selectedBarragemId || ''}
              onChange={(e) => {
                const found = allBarragens.find((item) => item.id === e.target.value);
                if (found) onSelectBarragem(found);
              }}
              className="w-full px-3 py-2 bg-white border border-t-0 border-slate-300 rounded-b-xl text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none"
            >
              <option value="">
                {allBarragens.length === 0
                  ? 'Nenhuma barragem na base (será salva ao concluir)'
                  : `-- Escolher barragem (${filteredBarragens.length}) --`}
              </option>
              {filteredBarragens.map((bar) => (
                <option key={bar.id} value={bar.id}>
                  {bar.nomeBarragem} {bar.codigoSnisb ? `[SNISB: ${bar.codigoSnisb}]` : ''} — {bar.municipio || 'MT'} [
                  {ECOSYSTEM_SYSTEM_LABELS[bar.sourceSystem].shortName}]
                </option>
              ))}
            </select>
          </div>

          {/* RT Picker */}
          {onSelectRT && (
            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <UserCheck size={12} className="text-emerald-600" /> Vincular RT da Base
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={rtQuery}
                  onChange={(e) => setRtQuery(e.target.value)}
                  placeholder="Filtrar RT, CREA ou CPF..."
                  className="w-full pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-t-xl text-xs font-semibold text-slate-700 focus:border-emerald-600 outline-none"
                />
                {rtQuery && (
                  <button
                    type="button"
                    onClick={() => setRtQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    aria-label="Limpar busca de RT"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <select
                defaultValue=""
                onChange={(e) => {
                  const found = responsaveisTecnicos.find((rt) => rt.id === e.target.value);
                  if (found) {
                    onSelectRT(found);
                    e.target.value = '';
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-t-0 border-slate-300 rounded-b-xl text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none"
              >
                <option value="">
                  {responsaveisTecnicos.length === 0
                    ? 'Nenhum RT na base ainda'
                    : `-- Adicionar RT ao documento (${filteredRTs.length}) --`}
                </option>
                {filteredRTs.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nome} {rt.registroProfissional ? `(${rt.registroProfissional})` : ''} [
                    {ECOSYSTEM_SYSTEM_LABELS[rt.sourceSystem].shortName}]
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Selected entities + Editable confirmation */}
      {(selectedEmpreendedor || selectedBarragem) && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedEmpreendedor && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border bg-emerald-50 border-emerald-200 text-emerald-800">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>
                Empreendedor ({selectedEmpreendedor.nome}) • Origem:{' '}
                <strong>{ECOSYSTEM_SYSTEM_LABELS[selectedEmpreendedor.sourceSystem].shortName}</strong>
              </span>
            </div>
          )}

          {selectedBarragem && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border bg-emerald-50 border-emerald-200 text-emerald-800">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>
                Barragem ({selectedBarragem.nomeBarragem}) • Origem:{' '}
                <strong>{ECOSYSTEM_SYSTEM_LABELS[selectedBarragem.sourceSystem].shortName}</strong>
              </span>
            </div>
          )}

          {!readOnly && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-blue-50 border border-blue-200 text-blue-800">
              <PencilLine size={13} className="text-blue-600" />
              Campos editáveis: qualquer alteração feita no formulário será salva na versão atualizada.
            </span>
          )}
        </div>
      )}

      {/* Optional cross-system request shortcut if originating outside Notifica */}
      {externalLinkedRecords.length > 0 && !readOnly && (
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11px] text-slate-600">
            <strong>Registro vinculado a outro módulo ({externalLinkedRecords.map((item) => item.label).join(' / ')}):</strong>{' '}
            Ao editar nos campos abaixo e salvar o documento, a versão atualizada será salva normalmente. Caso deseje formalizar uma solicitação de revisão ao administrador de origem, use a opção ao lado.
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {externalLinkedRecords.map((item) => (
              <button
                key={item.record.id}
                type="button"
                onClick={() =>
                  setChangeModalState({
                    isOpen: true,
                    targetType: item.type,
                    record: item.record,
                  })
                }
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <GitPullRequest size={12} />
                Solicitar Revisão ({item.type === 'EMPREENDEDOR' ? 'Empreendedor' : 'Barragem'})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Existing Ecosystem Products for this Empreendedor / Barragem */}
      {matchedProducts.length > 0 && (
        <div className="rounded-2xl bg-white border border-blue-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-blue-900">
              <FileCheck2 size={16} className="text-blue-600 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider">
                Produtos já existentes no Ecossistema ({matchedProducts.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowProducts((prev) => !prev)}
              className="text-[11px] font-bold text-blue-700 hover:underline"
            >
              {showProducts ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {showProducts && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
              {matchedProducts.map((prod) => (
                <div
                  key={`${prod.systemId}-${prod.id}`}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-black uppercase">
                      {ECOSYSTEM_SYSTEM_LABELS[prod.systemId].shortName}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      {prod.dataEmissao || 'Sem data'}
                    </span>
                  </div>
                  <p className="text-xs font-black text-slate-800 truncate">
                    {prod.tipoDocumento} {prod.numeroDocumento ? `• ${prod.numeroDocumento}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-600 truncate">
                    {prod.barragemNome || prod.empreendedorNome || 'Registro vinculado'}
                    {prod.processo ? ` • Proc. ${prod.processo}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ChangeRequestModal
        isOpen={changeModalState.isOpen}
        onClose={() => setChangeModalState((prev) => ({ ...prev, isOpen: false }))}
        targetType={changeModalState.targetType}
        record={changeModalState.record}
      />
    </div>
  );
};
