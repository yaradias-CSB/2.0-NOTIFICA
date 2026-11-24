import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Database,
  FileCheck2,
  GitPullRequest,
  Loader2,
  PencilLine,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  UserCheck,
  Waves,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { authFetch } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
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
  onSelectRT?: (rt: ResponsavelTecnicoCanonico, selectedArt?: string) => void;
  onClearLinks?: () => void;
  onSaveToAdministra?: () => Promise<void>;
  savingToAdministra?: boolean;
  onRegisterEmpreendedor?: () => Promise<void>;
  onRegisterBarragem?: () => Promise<void>;
  onRegisterRT?: () => Promise<void>;
  hasPendingEmpreendedor?: boolean;
  hasPendingBarragem?: boolean;
  hasPendingRT?: boolean;
  registeringEntity?: 'empreendedor' | 'barragem' | 'rt' | null;
  unregisteredRtNames?: string[];
  barragemCount?: number;
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
  onSaveToAdministra,
  savingToAdministra = false,
  onRegisterEmpreendedor,
  onRegisterBarragem,
  onRegisterRT,
  hasPendingEmpreendedor = false,
  hasPendingBarragem = false,
  hasPendingRT = false,
  registeringEntity = null,
  unregisteredRtNames = [],
  barragemCount,
}) => {
  const {
    empreendedores,
    barragens,
    responsaveisTecnicos,
    loading,
    refreshEcosystem,
    canEditDirectly,
    getProductsForEntity,
    linkArtToRT,
  } = useContext(EcosystemContext);
  const { canEdit } = useAuth();
  const effectiveReadOnly = readOnly || !canEdit;

  const [empQuery, setEmpQuery] = useState('');
  const [barQuery, setBarQuery] = useState('');
  const [rtQuery, setRtQuery] = useState('');
  const [stagedRtId, setStagedRtId] = useState('');
  const [newArtInput, setNewArtInput] = useState('');
  const [savingArt, setSavingArt] = useState(false);
  const [showProducts, setShowProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [remoteEmpHits, setRemoteEmpHits] = useState<EmpreendedorCanonico[]>([]);
  const [remoteBarHits, setRemoteBarHits] = useState<BarragemCanonica[]>([]);
  const [remoteRtHits, setRemoteRtHits] = useState<ResponsavelTecnicoCanonico[]>([]);

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
    const q = (empQuery.trim() || barQuery.trim() || rtQuery.trim());
    const hasQuery = q.length >= 2;
    if ((!hasQuery && !selectedEmpreendedorId) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      if (!hasQuery) {
        setRemoteEmpHits([]);
        setRemoteBarHits([]);
        setRemoteRtHits([]);
      }
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (hasQuery) params.set('q', q);
        if (selectedEmpreendedorId) params.set('empreendedorId', selectedEmpreendedorId);
        const res = await authFetch(`/api/registry/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.empreendedores)) setRemoteEmpHits(data.empreendedores);
        if (Array.isArray(data.barragens)) setRemoteBarHits(data.barragens);
        if (Array.isArray(data.responsaveisTecnicos)) setRemoteRtHits(data.responsaveisTecnicos);
      } catch {
        // Ignore aborted or offline requests
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [empQuery, barQuery, rtQuery, selectedEmpreendedorId]);

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

  const allResponsaveisTecnicos = useMemo(() => {
    if (remoteRtHits.length === 0) return responsaveisTecnicos;
    const seen = new Set(responsaveisTecnicos.map((r) => r.id));
    return [...responsaveisTecnicos, ...remoteRtHits.filter((r) => !seen.has(r.id))];
  }, [responsaveisTecnicos, remoteRtHits]);

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
    if (!raw) return allResponsaveisTecnicos.slice(0, 20);
    const textQ = normalizeSearchText(raw);
    const digitsQ = normalizeDocumentNumber(raw);
    return allResponsaveisTecnicos
      .filter(
        (rt) =>
          normalizeSearchText(rt.nome).includes(textQ) ||
          normalizeSearchText(rt.registroProfissional).includes(textQ) ||
          normalizeSearchText(rt.art).includes(textQ) ||
          (rt.artsVinculadas || []).some((a) => normalizeSearchText(a.art).includes(textQ)) ||
          (digitsQ.length >= 2 && normalizeDocumentNumber(rt.cpf || '').includes(digitsQ))
      )
      .slice(0, 20);
  }, [allResponsaveisTecnicos, rtQuery]);

  const stagedRt = useMemo(
    () => allResponsaveisTecnicos.find((rt) => rt.id === stagedRtId) || null,
    [allResponsaveisTecnicos, stagedRtId]
  );

  const stagedRtArts = useMemo(() => {
    if (!stagedRt) return [];
    const entries: Array<{
      art: string;
      barragemNome?: string;
      empreendedorNome?: string;
      createdAt?: string;
    }> = [];
    const seen = new Set<string>();
    const addEntry = (
      artValue?: string,
      barragemNome?: string,
      empreendedorNome?: string,
      createdAt?: string
    ) => {
      const trimmed = (artValue || '').trim();
      if (!trimmed) return;
      const key = trimmed.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ art: trimmed, barragemNome, empreendedorNome, createdAt });
    };
    (stagedRt.artsVinculadas || []).forEach((item) =>
      addEntry(item.art, item.barragemNome, item.empreendedorNome, item.createdAt)
    );
    addEntry(stagedRt.art);
    return entries;
  }, [stagedRt]);

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

  const handleStageRtItem = (rt: ResponsavelTecnicoCanonico) => {
    setStagedRtId(rt.id);
    setRtQuery('');
    setNewArtInput('');
    onSelectRT?.(rt);
  };

  const handleSaveNewArt = async () => {
    if (!stagedRt) return;
    const cleanArt = newArtInput.trim();
    if (!cleanArt) {
      toast.error('Digite o número da nova ART para salvar e vincular.');
      return;
    }

    setSavingArt(true);
    try {
      const targetBarragemNome =
        nomeBarragem?.trim() || selectedBarragem?.nomeBarragem || undefined;
      const targetEmpreendedorNome = selectedEmpreendedor?.nome || undefined;
      const res = await linkArtToRT({
        rtId: stagedRt.id,
        rtNome: stagedRt.nome,
        registroProfissional: stagedRt.registroProfissional,
        formacaoProfissional: stagedRt.formacaoProfissional,
        cpf: stagedRt.cpf,
        art: cleanArt,
        barragemId: selectedBarragemId || undefined,
        barragemNome: targetBarragemNome,
        empreendedorId: selectedEmpreendedorId || undefined,
        empreendedorNome: targetEmpreendedorNome,
      });
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Erro ao salvar ART no Administra.');
      }
      const updatedRt = res.data;
      setStagedRtId(updatedRt.id);
      setNewArtInput('');
      onSelectRT?.(updatedRt, cleanArt);
      toast.success(`ART ${cleanArt} salva no Administra e vinculada a ${updatedRt.nome}!`);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar ART no Administra.');
    } finally {
      setSavingArt(false);
    }
  };

  return (
    <div className="rounded-2xl sm:rounded-3xl border-2 border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-slate-50 p-3.5 sm:p-5 md:p-6 space-y-4 sm:space-y-5 shadow-sm">
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

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {!effectiveReadOnly && onSaveToAdministra && (
            <button
              type="button"
              disabled={loading || refreshing || savingToAdministra}
              onClick={onSaveToAdministra}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              title="Salvar ou atualizar Empreendedor, Barragem e RT diretamente no Administra"
            >
              {savingToAdministra ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {selectedEmpreendedorId || selectedBarragemId ? 'Atualizar no Administra' : 'Salvar no Administra'}
            </button>
          )}

          {!effectiveReadOnly && (
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

          {(selectedEmpreendedorId || selectedBarragemId) && !effectiveReadOnly && onClearLinks && (
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
      {!effectiveReadOnly && (
        <div className="grid grid-cols-1 gap-4">
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
              <div className="rounded-xl border border-emerald-300 bg-white shadow-lg max-h-72 overflow-y-auto divide-y divide-slate-100">
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
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs sm:text-sm font-black text-slate-900 break-words">{emp.nome}</p>
                        <p className="text-[11px] font-semibold text-slate-600 break-words">
                          {emp.cpfCnpj || 'S/Doc'}
                          {emp.carMt ? ` • CAR: ${emp.carMt}` : ''}
                          {emp.municipio ? ` • ${emp.municipio}/${emp.uf || 'MT'}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">
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
              <div className="rounded-xl border border-emerald-300 bg-white shadow-lg max-h-72 overflow-y-auto divide-y divide-slate-100">
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
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs sm:text-sm font-black text-slate-900 break-words">{bar.nomeBarragem}</p>
                        <p className="text-[11px] font-semibold text-slate-600 break-words">
                          {bar.municipio || 'MT'}
                          {bar.codigoSnisb ? ` • SNISB: ${bar.codigoSnisb}` : ''}
                          {bar.empreendedorNome ? ` • ${bar.empreendedorNome}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">
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
            <div className="space-y-2 relative">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <UserCheck size={12} className="text-emerald-600" /> Vincular RT da Base
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={rtQuery}
                  onChange={(e) => setRtQuery(e.target.value)}
                  placeholder="Filtrar RT, CREA, CPF ou ART..."
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
              {rtQuery.trim().length > 0 && (
                <div className="rounded-xl border border-emerald-300 bg-white shadow-lg max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {filteredRTs.length === 0 ? (
                    <p className="p-3 text-xs text-slate-500">
                      Nenhum RT encontrado para "{rtQuery}". Preencha manualmente abaixo para cadastrar no Administra.
                    </p>
                  ) : (
                    filteredRTs.map((rt) => (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => handleStageRtItem(rt)}
                        className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-xs sm:text-sm font-black text-slate-900 break-words">{rt.nome}</p>
                          <p className="text-[11px] font-semibold text-slate-600 break-words">
                            {rt.registroProfissional || 'Sem CREA/Registro'}
                            {rt.cpf ? ` • CPF: ${rt.cpf}` : ''}
                            {rt.formacaoProfissional ? ` • ${rt.formacaoProfissional}` : ''}
                            {rt.art ? ` • ART: ${rt.art}` : ''}
                            {rt.artsVinculadas && rt.artsVinculadas.length > 0
                              ? ` (${rt.artsVinculadas.length} ART${rt.artsVinculadas.length > 1 ? 's' : ''} no Administra)`
                              : ''}
                          </p>
                        </div>
                        <span className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">
                          Selecionar
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <select
                value={stagedRtId}
                onChange={(e) => {
                  const found = allResponsaveisTecnicos.find((rt) => rt.id === e.target.value);
                  if (found) {
                    handleStageRtItem(found);
                  } else {
                    setStagedRtId('');
                    setNewArtInput('');
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-t-0 border-slate-300 rounded-b-xl text-xs font-bold text-slate-800 focus:border-emerald-600 outline-none"
              >
                <option value="">
                  {allResponsaveisTecnicos.length === 0
                    ? 'Nenhum RT na base ainda'
                    : `-- Escolher RT e vincular/cadastrar ART (${filteredRTs.length}) --`}
                </option>
                {filteredRTs.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nome} {rt.registroProfissional ? `(${rt.registroProfissional})` : ''}
                    {rt.art ? ` • ART: ${rt.art}` : ''} [
                    {ECOSYSTEM_SYSTEM_LABELS[rt.sourceSystem].shortName}]
                  </option>
                ))}
              </select>

              {stagedRt && (
                <div className="rounded-2xl border border-emerald-200 bg-white p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                        RT Selecionado para Vínculo de ART
                      </p>
                      <p className="text-sm font-black text-slate-900 break-words">{stagedRt.nome}</p>
                      <p className="text-[11px] font-semibold text-slate-600 break-words">
                        {stagedRt.registroProfissional || 'Sem CREA/Registro'}
                        {stagedRt.cpf ? ` • CPF: ${stagedRt.cpf}` : ''}
                        {stagedRt.formacaoProfissional ? ` • ${stagedRt.formacaoProfissional}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStagedRtId('');
                        setNewArtInput('');
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                      aria-label="Fechar vínculo de ART"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {stagedRtArts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        ARTs já salvas no Administra (clique para usar)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {stagedRtArts.map((entry) => (
                          <button
                            key={entry.art}
                            type="button"
                            onClick={() => {
                              onSelectRT(stagedRt, entry.art);
                              toast.success(`ART ${entry.art} aplicada ao documento.`);
                            }}
                            className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold flex flex-col items-start transition-colors cursor-pointer text-left"
                          >
                            <span>ART: {entry.art}</span>
                            {(entry.barragemNome || entry.empreendedorNome) && (
                              <span className="text-[10px] font-medium text-emerald-700">
                                {[entry.barragemNome, entry.empreendedorNome].filter(Boolean).join(' • ')}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                        Cadastrar Nova ART no Administra
                      </label>
                      <span className="text-[10px] font-semibold text-slate-500">
                        Empreendimento:{' '}
                        <strong className="text-slate-700">
                          {nomeBarragem?.trim() ||
                            selectedBarragem?.nomeBarragem ||
                            selectedEmpreendedor?.nome ||
                            'Vínculo do documento atual'}
                        </strong>
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newArtInput}
                        onChange={(e) => setNewArtInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSaveNewArt();
                          }
                        }}
                        placeholder="Digite a nova ART (ex.: MT20260012345)..."
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:bg-white outline-none"
                      />
                      <button
                        type="button"
                        disabled={savingArt || !newArtInput.trim()}
                        onClick={() => void handleSaveNewArt()}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {savingArt ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <PlusCircle size={14} />
                        )}
                        Salvar ART no Administra e Vincular
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected entities + Register pending entities */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {selectedEmpreendedor ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border bg-emerald-50 border-emerald-200 text-emerald-800">
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              <span>
                Empreendedor vinculado no Administra ({selectedEmpreendedor.nome}) • Origem:{' '}
                <strong>{ECOSYSTEM_SYSTEM_LABELS[selectedEmpreendedor.sourceSystem].shortName}</strong>
              </span>
            </div>
          ) : (
            !effectiveReadOnly && (
              <div className="flex flex-wrap items-center justify-between gap-2 w-full sm:w-auto px-3 py-2 rounded-xl text-[11px] font-bold border bg-amber-50 border-amber-200 text-amber-900">
                <div className="flex items-center gap-2">
                  <Database size={13} className="text-amber-600 shrink-0" />
                  <span>
                    Empreendedor não vinculado — salvo apenas no rascunho local até cadastrar no Administra.
                  </span>
                </div>
                {onRegisterEmpreendedor && hasPendingEmpreendedor && (
                  <button
                    type="button"
                    disabled={registeringEntity !== null}
                    onClick={() => void onRegisterEmpreendedor()}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {registeringEntity === 'empreendedor' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <PlusCircle size={12} />
                    )}
                    Cadastrar Empreendedor na Base de Dados
                  </button>
                )}
              </div>
            )
          )}

          {selectedBarragem && !hasPendingBarragem ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border bg-emerald-50 border-emerald-200 text-emerald-800">
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              <span>
                Barragem vinculada no Administra ({selectedBarragem.nomeBarragem})
                {typeof barragemCount === 'number' && barragemCount > 1 ? ` (${barragemCount} no documento)` : ''} • Origem:{' '}
                <strong>{ECOSYSTEM_SYSTEM_LABELS[selectedBarragem.sourceSystem].shortName}</strong>
              </span>
            </div>
          ) : (
            !effectiveReadOnly && (
              <div className="flex flex-wrap items-center justify-between gap-2 w-full sm:w-auto px-3 py-2 rounded-xl text-[11px] font-bold border bg-amber-50 border-amber-200 text-amber-900">
                <div className="flex items-center gap-2">
                  <Waves size={13} className="text-amber-600 shrink-0" />
                  <span>
                    {typeof barragemCount === 'number' && barragemCount > 1
                      ? 'Existem barragens pendentes de cadastro na base Administra.'
                      : 'Barragem não vinculada — temporária no rascunho até cadastrar na base.'}
                  </span>
                </div>
                {onRegisterBarragem && hasPendingBarragem && (
                  <button
                    type="button"
                    disabled={registeringEntity !== null}
                    onClick={() => void onRegisterBarragem()}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {registeringEntity === 'barragem' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <PlusCircle size={12} />
                    )}
                    Cadastrar Barragem na Base de Dados
                  </button>
                )}
              </div>
            )
          )}

          {!effectiveReadOnly && hasPendingRT && (
            <div className="flex flex-wrap items-center justify-between gap-2 w-full sm:w-auto px-3 py-2 rounded-xl text-[11px] font-bold border bg-amber-50 border-amber-200 text-amber-900">
              <div className="flex items-center gap-2">
                <UserCheck size={13} className="text-amber-600 shrink-0" />
                <span>
                  RT(s) pendente(s) no Administra
                  {unregisteredRtNames.length > 0 ? `: ${unregisteredRtNames.join(', ')}` : ''}.
                </span>
              </div>
              {onRegisterRT && (
                <button
                  type="button"
                  disabled={registeringEntity !== null}
                  onClick={() => void onRegisterRT()}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {registeringEntity === 'rt' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <PlusCircle size={12} />
                  )}
                  Cadastrar Responsável Técnico na Base de Dados
                </button>
              )}
            </div>
          )}

          {!effectiveReadOnly && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-blue-50 border border-blue-200 text-blue-800">
              <PencilLine size={13} className="text-blue-600 shrink-0" />
              Documentos do Notifica podem ser salvos e concluídos normalmente; escritas na base do Administra estão temporariamente indisponíveis.
            </span>
          )}
        </div>
      </div>

      {/* Optional cross-system request shortcut if originating outside Notifica */}
      {externalLinkedRecords.length > 0 && !effectiveReadOnly && (
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
