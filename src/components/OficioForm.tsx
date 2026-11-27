import React, { useState, useContext, useEffect, useMemo } from 'react';
import { 
  Save, Download, ArrowLeft, FileText, Plus, PlusCircle, Trash2, X, CheckCircle, CheckCircle2, Loader2, 
  RotateCcw, Edit2, Info, MapPin, ClipboardList, Shield,
  ChevronDown, Check, Search, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { OPS_ANALISTA, OPS_MUNICIPIOS, OPS_RESPONSAVEL_TECNICO } from '../constants';
import { DataContext } from '../contexts/DataContext';
import { EcosystemContext } from '../contexts/EcosystemContext';
import { logActivity } from '../lib/audit';
import { generateOficioDoc } from '../services/docxService';
import { generateOficioPDF } from '../services/pdfService';
import { buildOficioCorpoText } from '../services/documentTemplates';
import { OficioData } from '../types';
import {
  BarragemCanonica,
  CURRENT_SYSTEM_ID,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import { AdministraEntityPicker } from './ecosystem/AdministraEntityPicker';
import { CarCoordinateLookup } from './ecosystem/CarCoordinateLookup';
import ConfirmModal from './ui/ConfirmModal';
import { matchMunicipioMT } from '../services/carLookupService';
import { sanitizeObject } from '../lib/security';
import { getActiveAuthUser } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SolicitarVistoriaModal } from './SolicitarVistoriaModal';
import { formatCoordenadasGmsString } from '../types/solicitacoesVistoria';
import {
  canUserEditDraft,
  canUserRectifyDocument,
  createRetificationDraft,
  isConcludedStatus,
} from '../lib/documentPermissions';
import {
  applyFieldProposals,
  detectNonEmptyFieldConflicts,
  type ConflictItem,
  type FieldProposal,
} from '../lib/formSelectionMerge';
import { EntityOverwriteModal } from './ui/EntityOverwriteModal';
import { RetificarDocumentoModal } from './ui/RetificarDocumentoModal';

const INITIAL_STATE: OficioData = {
  protocolo: '',
  dataEmissao: new Date().toISOString().split('T')[0],
  interessado: '',
  cpfCnpj: '',
  empreendimento: '',
  municipio: OPS_MUNICIPIOS[0],
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidadeUf: '',
  cep: '',
  assunto: 'Ofício de Pendências - Segurança de Barragens',
  coordenadasGMS: {
    lat: { g: '', m: '', s: '' },
    long: { g: '', m: '', s: '' }
  },
  responsaveisTecnicos: [],
  rtOutros: [],
  temRTOutro: false,
  art: '',
  pendencias: [],
  anotacoesInternas: '',
  prazoCumprimento: 90,
  prorrogacaoPrazo: 0,
  situacaoCumprimento: 'Pendente / Em aberto',
  analistas: [],
  analistasOutros: [],
  temAnalistaOutro: false,
  status: 'Rascunho',
  tipo_documento: '1° Oficio de Pendencias'
};

const formatGMS = (value: string) => {
  const digits = value.replace(/\D/g, '').substring(0, 8);
  let formatted = '';
  if (digits.length > 0) {
    formatted += digits.substring(0, 2);
    if (digits.length > 2) {
      formatted += '°' + digits.substring(2, 4);
      if (digits.length > 4) {
        formatted += "'" + digits.substring(4, 6);
        if (digits.length > 6) {
          formatted += ',' + digits.substring(6, 8);
          if (digits.length === 8) {
            formatted += '"';
          }
        }
      }
    }
  }
  return formatted;
};

interface OficioFormProps {
  onBack: () => void;
  initialData?: OficioData | null;
  readOnly?: boolean;
}

const OficioForm: React.FC<OficioFormProps> = ({ onBack, initialData, readOnly: readOnlyProp }) => {
  const { refreshData, saveOficio, deleteOficio } = useContext(DataContext);
  const {
    empreendedores: administraEmps,
    barragens: administraBars,
    responsaveisTecnicos: administraRTs,
    saveEmpreendedor,
    saveBarragem,
    saveResponsavelTecnico,
    linkArtToRT,
    syncEntitiesFromForm,
    refreshEcosystem,
  } = useContext(EcosystemContext);
  const { user, profile, canEdit } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingToAdministra, setSavingToAdministra] = useState(false);
  const [registeringEntity, setRegisteringEntity] = useState<'empreendedor' | 'barragem' | 'rt' | null>(null);
  const [isSolicitarVistoriaOpen, setIsSolicitarVistoriaOpen] = useState(false);
  const [isRetificarOpen, setIsRetificarOpen] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    entityLabel: string;
    conflicts: ConflictItem[];
    onApply: (mode: 'empty_only' | 'overwrite_all') => void;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; action: 'clear' | 'delete' }>({
    isOpen: false,
    action: 'clear',
  });
  const [formData, setFormData] = useState<OficioData>(() => {
    if (initialData) {
      return { ...INITIAL_STATE, ...initialData };
    }
    return INITIAL_STATE;
  });

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

  const readOnly = Boolean(readOnlyProp) || !canEdit || !canUserEditDraft(formData, currentActor);
  const canRectify = canUserRectifyDocument(formData, canEdit);

  const [rtDetalhes, setRtDetalhes] = useState<{ cpf: string; formacaoProfissional: string; registroProfissional: string }>(() => ({
    cpf: '',
    formacaoProfissional: '',
    registroProfissional: initialData?.art || '',
  }));

  const [editingPendenciaId, setEditingPendenciaId] = useState<string | null>(null);
  const [newPendenciaText, setNewPendenciaText] = useState('');

  const [showRTDropdown, setShowRTDropdown] = useState(false);
  const [rtSearch, setRtSearch] = useState('');
  const rtDropdownRef = React.useRef<HTMLDivElement>(null);

  const [showAnalistaDropdown, setShowAnalistaDropdown] = useState(false);
  const [analistaSearch, setAnalistaSearch] = useState('');
  const analistaDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rtDropdownRef.current && !rtDropdownRef.current.contains(event.target as Node)) {
        setShowRTDropdown(false);
      }
      if (analistaDropdownRef.current && !analistaDropdownRef.current.contains(event.target as Node)) {
        setShowAnalistaDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allRTOptions = useMemo(() => {
    const merged = [...OPS_RESPONSAVEL_TECNICO];
    administraRTs.forEach((rt) => {
      if (rt.nome && !merged.includes(rt.nome)) {
        merged.push(rt.nome);
      }
    });
    return merged;
  }, [administraRTs]);

  const filteredRTs = useMemo(() => {
    return allRTOptions.filter(name => 
      name.toLowerCase().includes(rtSearch.toLowerCase())
    );
  }, [allRTOptions, rtSearch]);

  const filteredAnalistas = useMemo(() => {
    return OPS_ANALISTA.filter(name => 
      name.toLowerCase().includes(analistaSearch.toLowerCase())
    );
  }, [analistaSearch]);

  const handleRTToggle = (name: string) => {
    setFormData(prev => {
      const current = prev.responsaveisTecnicos || [];
      if (current.includes(name)) {
        return { ...prev, responsaveisTecnicos: current.filter(n => n !== name) };
      }
      return { ...prev, responsaveisTecnicos: [...current, name] };
    });
  };

  const handleAnalistaToggle = (name: string) => {
    const isThiago = name === 'Thiago Silveira da Silva';
    const cargo = isThiago ? 'Residente Técnico' : 'Analista de Meio Ambiente';
    const fullName = `${name}/${cargo}- SEMA/MT`;
    setFormData(prev => {
      const current = prev.analistas || [];
      if (current.includes(fullName)) {
        return { ...prev, analistas: current.filter(n => n !== fullName) };
      }
      return { ...prev, analistas: [...current, fullName] };
    });
  };

  const handleRTOutroChange = (index: number, value: string) => {
    setFormData(prev => {
      const current = [...(prev.rtOutros || [])];
      current[index] = value;
      return { ...prev, rtOutros: current };
    });
  };

  const addRTOutro = () => {
    setFormData(prev => ({
      ...prev,
      rtOutros: [...(prev.rtOutros || []), '']
    }));
  };

  const removeRTOutro = (index: number) => {
    setFormData(prev => ({
      ...prev,
      rtOutros: (prev.rtOutros || []).filter((_, i) => i !== index)
    }));
  };

  const handleAnalistaOutroChange = (index: number, value: string) => {
    setFormData(prev => {
      const current = [...(prev.analistasOutros || [])];
      current[index] = value;
      return { ...prev, analistasOutros: current };
    });
  };

  const addAnalistaOutro = () => {
    setFormData(prev => ({
      ...prev,
      analistasOutros: [...(prev.analistasOutros || []), '']
    }));
  };

  const removeAnalistaOutro = (index: number) => {
    setFormData(prev => ({
      ...prev,
      analistasOutros: (prev.analistasOutros || []).filter((_, i) => i !== index)
    }));
  };

  const handleInputChange = (field: keyof OficioData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGMSInputChange = (type: 'lat' | 'long', value: string) => {
    const digits = value.replace(/\D/g, '').substring(0, 8);
    const g = digits.substring(0, 2);
    const m = digits.substring(2, 4);
    const s = digits.length > 4 ? (digits.substring(4, 6) + (digits.length > 6 ? ',' + digits.substring(6) : '')) : '';

    setFormData(prev => ({
      ...prev,
      coordenadasGMS: {
        ...prev.coordenadasGMS,
        [type]: { g, m, s }
      }
    }));
  };

  const getGMSDisplayValue = (type: 'lat' | 'long') => {
    const coord = formData.coordenadasGMS[type];
    const digits = (coord.g + coord.m + coord.s).replace(/\D/g, '');
    return formatGMS(digits);
  };

  const handleAddPendencia = () => {
    if (!newPendenciaText.trim()) return;
    const newPendencia = {
      id: crypto.randomUUID(),
      descricao: newPendenciaText.trim()
    };
    setFormData(prev => ({
      ...prev,
      pendencias: [...prev.pendencias, newPendencia]
    }));
    setNewPendenciaText('');
  };

  const handleUpdatePendencia = () => {
    if (!editingPendenciaId || !newPendenciaText.trim()) return;
    setFormData(prev => ({
      ...prev,
      pendencias: prev.pendencias.map(p => 
        p.id === editingPendenciaId ? { ...p, descricao: newPendenciaText.trim() } : p
      )
    }));
    setEditingPendenciaId(null);
    setNewPendenciaText('');
  };

  const handleRemovePendencia = (id: string) => {
    setFormData(prev => ({
      ...prev,
      pendencias: prev.pendencias.filter(p => p.id !== id)
    }));
  };

  const handleEditPendencia = (p: { id: string, descricao: string }) => {
    setEditingPendenciaId(p.id);
    setNewPendenciaText(p.descricao);
  };

  const handleClear = () => {
    setConfirmModal({ isOpen: true, action: 'clear' });
  };

  const totalDias = useMemo(() => {
    return (Number(formData.prazoCumprimento) || 0) + (Number(formData.prorrogacaoPrazo) || 0);
  }, [formData.prazoCumprimento, formData.prorrogacaoPrazo]);

  const dataFinal = useMemo(() => {
    if (!formData.dataEmissao) return null;
    const date = new Date(formData.dataEmissao);
    date.setDate(date.getDate() + totalDias);
    return date.toLocaleDateString('pt-BR');
  }, [formData.dataEmissao, totalDias]);

  const dynamicOficioText = useMemo(() => {
    return buildOficioCorpoText(formData);
  }, [formData]);

  const syncOficioEntitiesToAdministra = async (source: OficioData) => {
    const sanitized = sanitizeObject(source);
    const rtNames = [
      ...(sanitized.responsaveisTecnicos || []),
      ...(sanitized.rtOutros || []).filter((n) => n.trim() !== ''),
    ];
    const rtList = rtNames.map((nome, idx) => ({
      nome,
      registroProfissional: (idx === 0 ? rtDetalhes.registroProfissional : '') || sanitized.art || undefined,
      art: idx === 0 ? sanitized.art || undefined : undefined,
      cpf: idx === 0 ? rtDetalhes.cpf || undefined : undefined,
      formacaoProfissional: idx === 0 ? rtDetalhes.formacaoProfissional || undefined : undefined,
    }));

    return syncEntitiesFromForm({
      existingEmpreendedorId: sanitized.empreendedorId,
      existingBarragemId: sanitized.barragemId,
      empreendedorNome: sanitized.interessado,
      cpfCnpj: sanitized.cpfCnpj,
      logradouro: sanitized.logradouro,
      numero: sanitized.numero,
      complemento: sanitized.complemento,
      bairro: sanitized.bairro,
      municipio: sanitized.municipio || sanitized.cidadeUf,
      cep: sanitized.cep,
      nomeBarragem: sanitized.empreendimento,
      processo: sanitized.processo || sanitized.protocolo,
      coordenadasGMS: sanitized.coordenadasGMS,
      responsaveisTecnicos: rtList,
      analista:
        sanitized.analistas?.[0] ||
        sanitized.analistasOutros?.[0] ||
        getActiveAuthUser()?.name ||
        getActiveAuthUser()?.email ||
        '',
    });
  };

  const handleSaveOnlyToAdministra = async () => {
    const hasRt =
      (formData.responsaveisTecnicos && formData.responsaveisTecnicos.length > 0) ||
      (formData.rtOutros && formData.rtOutros.some((n) => n.trim() !== ''));

    if (!formData.interessado?.trim() && !formData.empreendimento?.trim() && !hasRt) {
      toast.error('Informe ao menos Empreendedor, Barragem ou Responsável Técnico para salvar no Administra.');
      return;
    }

    setSavingToAdministra(true);
    try {
      const syncRes = await syncOficioEntitiesToAdministra(formData);
      setFormData((prev) => ({
        ...prev,
        empreendedorId: syncRes.empreendedorId || prev.empreendedorId,
        barragemId: syncRes.barragemId || prev.barragemId,
        responsavelTecnicoIds:
          syncRes.responsavelTecnicoIds.length > 0
            ? syncRes.responsavelTecnicoIds
            : prev.responsavelTecnicoIds,
      }));
      await refreshEcosystem();
      toast.success('Dados de Empreendedor, Barragem e Responsável Técnico salvos/atualizados no Administra!');
    } catch (error: any) {
      toast.error(`Erro ao salvar no Administra: ${error?.message || 'falha inesperada'}`);
    } finally {
      setSavingToAdministra(false);
    }
  };

  const normalizeLookupKey = (value?: string) =>
    (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const usedRtNames = useMemo(
    () =>
      Array.from(
        new Set([
          ...(formData.responsaveisTecnicos || []),
          ...(formData.rtOutros || []).map((n) => n.trim()).filter(Boolean),
        ])
      ),
    [formData.responsaveisTecnicos, formData.rtOutros]
  );

  const unregisteredRtNames = useMemo(
    () =>
      usedRtNames.filter(
        (name) => !administraRTs.some((rt) => normalizeLookupKey(rt.nome) === normalizeLookupKey(name))
      ),
    [usedRtNames, administraRTs]
  );

  const hasEmpreendedorManual = Boolean(
    formData.interessado?.trim() || formData.cpfCnpj?.trim()
  );
  const hasBarragemManual = Boolean(
    formData.empreendimento?.trim() ||
      formData.coordenadasGMS?.lat?.g ||
      formData.coordenadasGMS?.long?.g
  );

  const handleRegisterEmpreendedor = async () => {
    const sanitized = sanitizeObject(formData);
    const nome = sanitized.interessado?.trim();
    if (!nome) {
      toast.error('Informe a Identificação do Empreendedor antes de cadastrar na base de dados.');
      return;
    }

    setRegisteringEntity('empreendedor');
    try {
      const digits = (sanitized.cpfCnpj || '').replace(/\D/g, '');
      const nomeNorm = normalizeLookupKey(nome);
      const matched =
        (sanitized.empreendedorId
          ? administraEmps.find((e) => e.id === sanitized.empreendedorId)
          : undefined) ||
        (digits ? administraEmps.find((e) => (e.cpfCnpjNormalizado || '') === digits) : undefined) ||
        (!digits ? administraEmps.find((e) => normalizeLookupKey(e.nome) === nomeNorm) : undefined);

      const cidadeParts = (sanitized.cidadeUf || '').split('/');
      const municipioRes = cidadeParts[0]?.trim() || sanitized.municipio || matched?.municipio;
      const ufRes = cidadeParts[1]?.trim() || matched?.uf || 'MT';

      const res = await saveEmpreendedor(
        {
          ...(matched ? { id: matched.id } : {}),
          nome,
          tipoPessoa: matched?.tipoPessoa || (digits.length === 14 ? 'CNPJ' : 'CPF'),
          cpfCnpj: sanitized.cpfCnpj?.trim() || matched?.cpfCnpj || '',
          telefone: matched?.telefone,
          email: matched?.email,
          logradouro: sanitized.logradouro?.trim() || matched?.logradouro,
          numero: sanitized.numero?.trim() || matched?.numero,
          complemento: sanitized.complemento?.trim() || matched?.complemento,
          bairro: sanitized.bairro?.trim() || matched?.bairro,
          municipio: municipioRes,
          uf: ufRes,
          cep: sanitized.cep?.trim() || matched?.cep,
          carMt: matched?.carMt,
          situacao: matched?.situacao || 'ativo',
          sourceSystem: matched?.sourceSystem || CURRENT_SYSTEM_ID,
          createdByAnalyst:
            matched?.createdByAnalyst ||
            sanitized.analistas?.[0] ||
            sanitized.analistasOutros?.[0] ||
            getActiveAuthUser()?.name ||
            getActiveAuthUser()?.email ||
            '',
        },
        matched ? { allowEditFromForm: true } : undefined
      );

      if (!res.success || !res.data) {
        throw new Error(res.message || 'Erro ao cadastrar empreendedor na base de dados.');
      }

      setFormData((prev) => ({ ...prev, empreendedorId: res.data!.id }));
      await refreshEcosystem();
      toast.success(`Empreendedor "${res.data.nome}" cadastrado e vinculado na base Administra!`);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao cadastrar empreendedor no Administra.');
    } finally {
      setRegisteringEntity(null);
    }
  };

  const handleRegisterBarragem = async () => {
    const sanitized = sanitizeObject(formData);
    const nomeBarragem = sanitized.empreendimento?.trim();
    if (!nomeBarragem) {
      toast.error('Informe o Empreendimento / Barragem antes de cadastrar na base de dados.');
      return;
    }

    setRegisteringEntity('barragem');
    try {
      const nameNorm = normalizeLookupKey(nomeBarragem);
      const matched =
        (sanitized.barragemId
          ? administraBars.find((b) => b.id === sanitized.barragemId)
          : undefined) ||
        administraBars.find(
          (b) =>
            normalizeLookupKey(b.nomeBarragem) === nameNorm &&
            (!sanitized.empreendedorId || !b.empreendedorId || b.empreendedorId === sanitized.empreendedorId)
        );

      const res = await saveBarragem(
        {
          ...(matched ? { id: matched.id } : {}),
          empreendedorId: sanitized.empreendedorId || matched?.empreendedorId,
          empreendedorNome: sanitized.interessado?.trim() || matched?.empreendedorNome,
          empreendedorCpfCnpj: sanitized.cpfCnpj?.trim() || matched?.empreendedorCpfCnpj,
          nomeBarragem,
          processo: sanitized.processo?.trim() || sanitized.protocolo?.trim() || matched?.processo,
          municipio: sanitized.municipio || matched?.municipio,
          uf: 'MT',
          coordenadasGMS: sanitized.coordenadasGMS || matched?.coordenadasGMS,
          sourceSystem: matched?.sourceSystem || CURRENT_SYSTEM_ID,
          createdByAnalyst:
            matched?.createdByAnalyst ||
            sanitized.analistas?.[0] ||
            sanitized.analistasOutros?.[0] ||
            getActiveAuthUser()?.name ||
            getActiveAuthUser()?.email ||
            '',
        },
        matched ? { allowEditFromForm: true } : undefined
      );

      if (!res.success || !res.data) {
        throw new Error(res.message || 'Erro ao cadastrar barragem na base de dados.');
      }

      setFormData((prev) => ({ ...prev, barragemId: res.data!.id }));
      await refreshEcosystem();
      toast.success(`Barragem "${res.data.nomeBarragem}" cadastrada e vinculada na base Administra!`);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao cadastrar barragem no Administra.');
    } finally {
      setRegisteringEntity(null);
    }
  };

  const handleRegisterRTs = async () => {
    const sanitized = sanitizeObject(formData);
    if (usedRtNames.length === 0) {
      toast.error('Selecione ou informe ao menos um Responsável Técnico para cadastrar.');
      return;
    }

    setRegisteringEntity('rt');
    try {
      const nextIds = new Set<string>(sanitized.responsavelTecnicoIds || []);
      let createdCount = 0;

      for (let idx = 0; idx < usedRtNames.length; idx++) {
        const nome = usedRtNames[idx];
        const existing = administraRTs.find(
          (r) => normalizeLookupKey(r.nome) === normalizeLookupKey(nome)
        );
        if (existing) {
          nextIds.add(existing.id);
          continue;
        }

        const artValue = idx === 0 ? sanitized.art?.trim() : undefined;
        const regValue =
          (idx === 0 ? rtDetalhes.registroProfissional?.trim() : '') || artValue;
        const cpfValue = idx === 0 ? rtDetalhes.cpf?.trim() : undefined;
        const formacaoValue = idx === 0 ? rtDetalhes.formacaoProfissional?.trim() : undefined;

        if (artValue) {
          const linkRes = await linkArtToRT({
            rtNome: nome,
            registroProfissional: regValue,
            formacaoProfissional: formacaoValue,
            cpf: cpfValue,
            art: artValue,
            barragemId: sanitized.barragemId || undefined,
            barragemNome: sanitized.empreendimento?.trim() || undefined,
            empreendedorId: sanitized.empreendedorId || undefined,
            empreendedorNome: sanitized.interessado?.trim() || undefined,
            processo: sanitized.processo?.trim() || sanitized.protocolo?.trim() || undefined,
          });
          if (!linkRes.success || !linkRes.data) {
            throw new Error(linkRes.message || `Erro ao cadastrar RT ${nome}.`);
          }
          nextIds.add(linkRes.data.id);
        } else {
          const rtRes = await saveResponsavelTecnico({
            nome,
            registroProfissional: regValue,
            formacaoProfissional: formacaoValue,
            cpf: cpfValue,
            sourceSystem: CURRENT_SYSTEM_ID,
            createdByAnalyst:
              sanitized.analistas?.[0] ||
              sanitized.analistasOutros?.[0] ||
              getActiveAuthUser()?.name ||
              getActiveAuthUser()?.email ||
              '',
          });
          if (!rtRes.success || !rtRes.data) {
            throw new Error(rtRes.message || `Erro ao cadastrar RT ${nome}.`);
          }
          nextIds.add(rtRes.data.id);
        }
        createdCount++;
      }

      setFormData((prev) => ({
        ...prev,
        responsavelTecnicoIds: Array.from(nextIds),
      }));
      await refreshEcosystem();
      toast.success(
        createdCount > 0
          ? `${createdCount} Responsável(is) Técnico(s) cadastrado(s) na base Administra!`
          : 'Responsável(is) Técnico(s) vinculado(s) à base Administra!'
      );
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao cadastrar Responsável Técnico no Administra.');
    } finally {
      setRegisteringEntity(null);
    }
  };

  const handleSave = async (status: 'Rascunho' | 'Concluído') => {
    if (readOnly) {
      toast.error('Este documento está bloqueado para edição direta.');
      return;
    }
    if (!formData.interessado || !formData.protocolo || !formData.municipio) {
      toast.error('Por favor, preencha os campos obrigatórios (Empreendedor, Nº Ofício/Protocolo e Município).');
      return;
    }

    setLoading(true);
    try {
      const sanitizedFormData = sanitizeObject(formData);
      const isFinalizing = status === 'Concluído';

      const resolvedEmpreendedorId = sanitizedFormData.empreendedorId;
      const resolvedBarragemId = sanitizedFormData.barragemId;
      const resolvedRtIds = sanitizedFormData.responsavelTecnicoIds;
      const hasUnlinkedEntities =
        !resolvedEmpreendedorId ||
        (hasBarragemManual && !resolvedBarragemId) ||
        unregisteredRtNames.length > 0;

      const res = await saveOficio({
        ...sanitizedFormData,
        id: formData.id || undefined,
        empreendedorId: resolvedEmpreendedorId,
        barragemId: resolvedBarragemId,
        responsavelTecnicoIds: resolvedRtIds,
        sourceSystem: sanitizedFormData.sourceSystem || CURRENT_SYSTEM_ID,
        status: status,
        analista:
          formData.analistas?.[0] ||
          formData.analistasOutros?.[0] ||
          getActiveAuthUser()?.name ||
          getActiveAuthUser()?.email ||
          '',
        tipo_documento: formData.tipo_documento
      });

      if (!res.success) {
        throw new Error(res.message || 'Erro ao salvar ofício');
      }

      if (res.data) {
        setFormData(prev => ({
          ...prev,
          id: res.data.id,
          status,
          empreendedorId: resolvedEmpreendedorId,
          barragemId: resolvedBarragemId,
          responsavelTecnicoIds: resolvedRtIds,
          sourceSystem: res.data.sourceSystem || CURRENT_SYSTEM_ID,
        }));
      }

      await refreshData?.();

      toast.success(
        isFinalizing
          ? 'Ofício concluído e salvo no Notifica!'
          : 'Rascunho salvo no Notifica.'
      );
      if (isFinalizing && hasUnlinkedEntities) {
        toast.warning(
          'Cadastro no Administra não realizado: o ofício foi salvo no Notifica sem gravar novos cadastros na base do Administra.'
        );
      }
      if (status === 'Concluído') onBack();
    } catch (error: any) {
      console.warn('Notice saving oficio:', error);
      toast.error(`Erro ao salvar ofício: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!formData.id) return;
    setConfirmModal({ isOpen: true, action: 'delete' });
  };

  const handleConfirmModalAction = async () => {
    const action = confirmModal.action;
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));

    if (action === 'clear') {
      setFormData(INITIAL_STATE);
      setRtDetalhes({ cpf: '', formacaoProfissional: '', registroProfissional: '' });
      toast.info('Formulário limpo.');
      return;
    }

    if (action === 'delete' && formData.id) {
      setLoading(true);
      try {
        const res = await deleteOficio(formData.id);
        if (!res.success) throw new Error(res.message || 'Erro ao excluir ofício.');
        await refreshData?.();
        toast.success('Ofício excluído com sucesso!');
        onBack();
      } catch (error: any) {
        console.error('Erro ao excluir ofício:', error);
        toast.error('Erro ao excluir ofício.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDownloadDocx = async () => {
    try {
      await generateOficioDoc({ ...formData, totalDias, dataFinal });
      logActivity({
        action: 'DOWNLOAD_OFICIO',
        details: `Download do Ofício efetuado. Processo: ${formData.processo || formData.protocolo || 'S/P'}. Empreendedor: ${formData.interessado || '---'}`
      });
      toast.success('Documento Word (.docx) gerado.');
    } catch (error) {
      console.error('Erro ao gerar DOCX:', error);
      toast.error('Erro ao gerar o arquivo Word.');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateOficioPDF({ ...formData, totalDias, dataFinal });
      logActivity({
        action: 'DOWNLOAD_OFICIO',
        details: `Download do Ofício (PDF) efetuado. Processo: ${formData.processo || formData.protocolo || 'S/P'}. Empreendedor: ${formData.interessado || '---'}`
      });
      toast.success('Documento PDF gerado.');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar o arquivo PDF.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pendente / Em aberto': return 'bg-yellow-400';
      case 'Cumprido': return 'bg-yellow-400 ring-2 ring-emerald-500 ring-offset-1'; // Hachura fina verde simulated by ring
      case 'Não cumprido no prazo': return 'bg-red-500';
      case 'Arquivado': return 'bg-slate-400';
      default: return 'bg-slate-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="static md:sticky md:top-[61px] z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-3 sm:py-4 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
              Ofício de <span className="text-emerald-600">Pendências</span>
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                {formData.id ? `Editando: ${formData.protocolo}` : 'Novo Documento'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          {!readOnly && (
            <>
              <button onClick={handleClear} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5">
                <RotateCcw size={14} /> Limpar
              </button>
              {formData.id && (
                <button onClick={handleDelete} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-xs hover:bg-red-50 transition-all flex items-center gap-1.5">
                  <Trash2 size={14} /> Excluir
                </button>
              )}
              <button onClick={() => handleSave('Rascunho')} disabled={loading} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Rascunho
              </button>
              <button onClick={() => handleSave('Concluído')} disabled={loading} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-600/20">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Concluir
              </button>
            </>
          )}
          <button onClick={handleDownloadPDF} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 transition-all flex items-center gap-1.5 shadow-lg shadow-rose-600/20" title="Exportar Ofício em PDF">
            <Download size={14} /> Exportar PDF
          </button>
          <button onClick={handleDownloadDocx} className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-lg shadow-blue-600/20">
            <Download size={14} /> Exportar Docx
          </button>
          {canRectify && (
            <button
              type="button"
              onClick={() => setIsRetificarOpen(true)}
              className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-xs hover:bg-amber-700 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw size={14} /> Retificar
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsSolicitarVistoriaOpen(true)}
              className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-lg shadow-slate-900/15 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ClipboardList size={14} /> Solicitar vistoria
            </button>
          )}
        </div>
      </div>

      {(readOnly || formData.retificadoDeId) && (
        <div className="max-w-5xl mx-auto mt-4 px-3 sm:px-6 space-y-2 text-xs">
          {isConcludedStatus(formData.status) && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex flex-wrap items-center justify-between gap-2">
              <span>
                Ofício concluído em modo somente leitura. Alterações exigem retificação auditável preservando o documento original.
              </span>
              {canRectify && (
                <button
                  type="button"
                  onClick={() => setIsRetificarOpen(true)}
                  className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer"
                >
                  Abrir retificação auditável
                </button>
              )}
            </div>
          )}
          {!isConcludedStatus(formData.status) && readOnly && (
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-700">
              Visualização somente leitura: documento pertence a outro autor ou seu perfil não possui permissão de edição.
            </div>
          )}
          {formData.retificadoDeId && (
            <div className="p-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-900">
              Retificação v{formData.versaoRetificacao || 2} originada de <strong>{formData.retificadoDeId}</strong>
              {formData.retificacaoJustificativa ? ` — Justificativa: ${formData.retificacaoJustificativa}` : ''}
            </div>
          )}
        </div>
      )}

      <div className="max-w-5xl mx-auto mt-4 sm:mt-8 px-3 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 space-y-6 sm:space-y-8">
          {/* Main Info */}
          <section className="bg-white p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-[2rem] shadow-xl border border-slate-100 space-y-6 sm:space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Info size={20} />
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Informações Gerais</h2>
            </div>

            <AdministraEntityPicker
              readOnly={readOnly}
              currentDocumentId={formData.id}
              selectedEmpreendedorId={formData.empreendedorId}
              selectedBarragemId={formData.barragemId}
              cpfCnpj={formData.cpfCnpj}
              nomeBarragem={formData.empreendimento}
              processo={formData.processo || formData.protocolo}
              onSaveToAdministra={handleSaveOnlyToAdministra}
              savingToAdministra={savingToAdministra}
              onRegisterEmpreendedor={handleRegisterEmpreendedor}
              onRegisterBarragem={handleRegisterBarragem}
              onRegisterRT={handleRegisterRTs}
              hasPendingEmpreendedor={hasEmpreendedorManual && !formData.empreendedorId}
              hasPendingBarragem={hasBarragemManual && !formData.barragemId}
              hasPendingRT={unregisteredRtNames.length > 0}
              unregisteredRtNames={unregisteredRtNames}
              registeringEntity={registeringEntity}
              onSelectEmpreendedor={(emp: EmpreendedorCanonico) => {
                const matchedMun = matchMunicipioMT(emp.municipio);
                const proposals: FieldProposal<OficioData>[] = [
                  { key: 'interessado', label: 'Empreendedor / Interessado', incomingValue: emp.nome },
                  { key: 'cpfCnpj', label: 'CPF/CNPJ', incomingValue: emp.cpfCnpj },
                  { key: 'logradouro', label: 'Logradouro', incomingValue: emp.logradouro },
                  { key: 'numero', label: 'Número', incomingValue: emp.numero },
                  { key: 'complemento', label: 'Complemento', incomingValue: emp.complemento },
                  { key: 'bairro', label: 'Bairro', incomingValue: emp.bairro },
                  { key: 'municipio', label: 'Município', incomingValue: matchedMun || emp.municipio },
                  {
                    key: 'cidadeUf',
                    label: 'Cidade/UF',
                    incomingValue: emp.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : undefined,
                  },
                  { key: 'cep', label: 'CEP', incomingValue: emp.cep },
                ];
                const applySelection = (mode: 'empty_only' | 'overwrite_all') => {
                  setFormData((prev) => ({
                    ...applyFieldProposals(prev, proposals, mode),
                    empreendedorId: emp.id,
                  }));
                };
                const conflicts = detectNonEmptyFieldConflicts(formData, proposals);
                if (conflicts.length > 0) {
                  setPendingOverwrite({
                    entityLabel: `empreendedor "${emp.nome}"`,
                    conflicts,
                    onApply: applySelection,
                  });
                  return;
                }
                applySelection('overwrite_all');
              }}
              onSelectBarragem={(bar: BarragemCanonica) => {
                const proposals: FieldProposal<OficioData>[] = [
                  { key: 'empreendimento', label: 'Empreendimento / Barragem', incomingValue: bar.nomeBarragem },
                  { key: 'municipio', label: 'Município', incomingValue: bar.municipio },
                  { key: 'coordenadasGMS', label: 'Coordenadas GMS', incomingValue: bar.coordenadasGMS },
                ];
                const applySelection = (mode: 'empty_only' | 'overwrite_all') => {
                  setFormData((prev) => ({
                    ...applyFieldProposals(prev, proposals, mode),
                    barragemId: bar.id,
                    empreendedorId: bar.empreendedorId || prev.empreendedorId,
                  }));
                };
                const conflicts = detectNonEmptyFieldConflicts(formData, proposals);
                if (conflicts.length > 0) {
                  setPendingOverwrite({
                    entityLabel: `barragem "${bar.nomeBarragem || bar.id}"`,
                    conflicts,
                    onApply: applySelection,
                  });
                  return;
                }
                applySelection('overwrite_all');
              }}
              onSelectRT={(rt: ResponsavelTecnicoCanonico, selectedArt?: string) => {
                setFormData(prev => {
                  const isKnown = allRTOptions.includes(rt.nome);
                  const nextRTs = isKnown
                    ? Array.from(new Set([...(prev.responsaveisTecnicos || []), rt.nome]))
                    : (prev.responsaveisTecnicos || []);
                  const nextRtOutros = !isKnown
                    ? Array.from(new Set([...(prev.rtOutros || []).filter(Boolean), rt.nome]))
                    : (prev.rtOutros || []);
                  return {
                    ...prev,
                    responsaveisTecnicos: nextRTs,
                    temRTOutro: !isKnown ? true : prev.temRTOutro,
                    rtOutros: nextRtOutros,
                    art: selectedArt ? selectedArt : prev.art || rt.art || rt.registroProfissional || '',
                    responsavelTecnicoIds: Array.from(new Set([...(prev.responsavelTecnicoIds || []), rt.id])),
                  };
                });
                setRtDetalhes(prev => ({
                  cpf: rt.cpf || prev.cpf,
                  formacaoProfissional: rt.formacaoProfissional || prev.formacaoProfissional,
                  registroProfissional: rt.registroProfissional || prev.registroProfissional,
                }));
              }}
              onClearLinks={() => {
                setFormData(prev => ({
                  ...prev,
                  empreendedorId: undefined,
                  barragemId: undefined,
                  responsavelTecnicoIds: undefined,
                }));
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de Documento</label>
                <select 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                  value={formData.tipo_documento}
                  onChange={(e) => handleInputChange('tipo_documento', e.target.value)}
                  disabled={readOnly}
                >
                  <option value="1° Oficio de Pendencias">1° Oficio de Pendencias</option>
                  <option value="2° Oficio de Pendencias">2° Oficio de Pendencias</option>
                  <option value="Oficio Geral">Oficio Geral</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nº do Ofício / Protocolo *</label>
                <input 
                  type="text" 
                  placeholder="Ex: 042/CSB/SURH/2026"
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.protocolo} 
                  onChange={(e) => handleInputChange('protocolo', e.target.value)} 
                  disabled={readOnly} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nº do Processo SEMA/MT</label>
                <input 
                  type="text" 
                  placeholder="Ex: 123456/2026"
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.processo || ''} 
                  onChange={(e) => handleInputChange('processo', e.target.value)} 
                  disabled={readOnly} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data de Emissão</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.dataEmissao} 
                  onChange={(e) => handleInputChange('dataEmissao', e.target.value)} 
                  disabled={readOnly} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Assunto</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.assunto} 
                  onChange={(e) => handleInputChange('assunto', e.target.value)} 
                  disabled={readOnly} 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Identificação do Empreendedor (Administra) *</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.interessado} 
                  onChange={(e) => handleInputChange('interessado', e.target.value)} 
                  disabled={readOnly} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">CPF / CNPJ do Empreendedor</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.cpfCnpj || ''} 
                  onChange={(e) => handleInputChange('cpfCnpj', e.target.value)} 
                  disabled={readOnly}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Empreendimento / Barragem (Administra)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.empreendimento} 
                  onChange={(e) => handleInputChange('empreendimento', e.target.value)} 
                  disabled={readOnly} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Município do Empreendimento *</label>
                <select 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.municipio || OPS_MUNICIPIOS[0]} 
                  onChange={(e) => handleInputChange('municipio', e.target.value)} 
                  disabled={readOnly}
                >
                  {OPS_MUNICIPIOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {!readOnly && (!formData.empreendedorId || !formData.barragemId) && (
                <div className="md:col-span-2 flex flex-col sm:flex-row flex-wrap gap-2.5 p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200">
                  {!formData.empreendedorId && (
                    <button
                      type="button"
                      disabled={registeringEntity !== null}
                      onClick={() => void handleRegisterEmpreendedor()}
                      className="flex-1 min-w-[220px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {registeringEntity === 'empreendedor' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <PlusCircle size={14} />
                      )}
                      Cadastrar Empreendedor na Base de Dados
                    </button>
                  )}
                  {!formData.barragemId && (
                    <button
                      type="button"
                      disabled={registeringEntity !== null}
                      onClick={() => void handleRegisterBarragem()}
                      className="flex-1 min-w-[220px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {registeringEntity === 'barragem' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <PlusCircle size={14} />
                      )}
                      Cadastrar Barragem na Base de Dados
                    </button>
                  )}
                </div>
              )}

              {/* Endereço */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6 bg-slate-100/50 rounded-2xl sm:rounded-[2rem] border border-slate-200 shadow-inner">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Logradouro</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                    value={formData.logradouro} 
                    onChange={(e) => handleInputChange('logradouro', e.target.value)} 
                    disabled={readOnly} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Número</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                    value={formData.numero} 
                    onChange={(e) => handleInputChange('numero', e.target.value)} 
                    disabled={readOnly} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Complemento</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                    value={formData.complemento} 
                    onChange={(e) => handleInputChange('complemento', e.target.value)} 
                    disabled={readOnly} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bairro</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                    value={formData.bairro} 
                    onChange={(e) => handleInputChange('bairro', e.target.value)} 
                    disabled={readOnly} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cidade/UF</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                    value={formData.cidadeUf} 
                    onChange={(e) => handleInputChange('cidadeUf', e.target.value)} 
                    disabled={readOnly} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">CEP</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                    value={formData.cep} 
                    onChange={(e) => handleInputChange('cep', e.target.value)} 
                    disabled={readOnly} 
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <MapPin size={14} /> Coordenadas (GMS)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Latitude</label>
                  <input 
                    placeholder="Ex: 15121234" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                    value={getGMSDisplayValue('lat')} 
                    onChange={(e) => handleGMSInputChange('lat', e.target.value)} 
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Longitude</label>
                  <input 
                    placeholder="Ex: 56121234" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                    value={getGMSDisplayValue('long')} 
                    onChange={(e) => handleGMSInputChange('long', e.target.value)} 
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200/70">
                <CarCoordinateLookup
                  rawLat={
                    formData.coordenadasGMS.lat.g || formData.coordenadasGMS.lat.m || formData.coordenadasGMS.lat.s
                      ? `${formData.coordenadasGMS.lat.g || '0'}°${formData.coordenadasGMS.lat.m || '0'}'${formData.coordenadasGMS.lat.s || '0'}"`
                      : ''
                  }
                  rawLong={
                    formData.coordenadasGMS.long.g || formData.coordenadasGMS.long.m || formData.coordenadasGMS.long.s
                      ? `${formData.coordenadasGMS.long.g || '0'}°${formData.coordenadasGMS.long.m || '0'}'${formData.coordenadasGMS.long.s || '0'}"`
                      : ''
                  }
                  disabled={readOnly}
                  onApplyCar={(car) => {
                    const matchedMun = matchMunicipioMT(car.municipio);
                    setFormData(prev => ({
                      ...prev,
                      municipio: matchedMun || prev.municipio,
                    }));
                  }}
                  onApplyCadastro={(cad, primaryCar) => {
                    const emp = cad.empreendedorCanonico;
                    const bar = cad.barragemCanonica;
                    const matchedMun = matchMunicipioMT(cad.municipio || primaryCar?.municipio);
                    setFormData(prev => ({
                      ...prev,
                      empreendedorId: cad.empreendedorId || prev.empreendedorId,
                      barragemId: cad.barragemId || prev.barragemId,
                      interessado: emp?.nome || cad.empreendedorNome || prev.interessado,
                      cpfCnpj: emp?.cpfCnpj || cad.cpfCnpj || prev.cpfCnpj,
                      empreendimento: bar?.nomeBarragem || cad.nomeBarragem || prev.empreendimento,
                      municipio: matchedMun || bar?.municipio || prev.municipio,
                      logradouro: emp?.logradouro || prev.logradouro,
                      numero: emp?.numero || prev.numero,
                      complemento: emp?.complemento || prev.complemento,
                      bairro: emp?.bairro || prev.bairro,
                      cidadeUf: emp?.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : prev.cidadeUf,
                      cep: emp?.cep || prev.cep,
                      processo: cad.processo || prev.processo,
                    }));
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Responsável Técnico</label>
                <div className="relative" ref={rtDropdownRef}>
                  <button
                    type="button"
                    onClick={() => !readOnly && setShowRTDropdown(!showRTDropdown)}
                    className={`w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl flex items-center justify-between transition-all shadow-sm ${readOnly ? 'cursor-default' : 'hover:border-emerald-300 focus:ring-4 focus:ring-emerald-500/10'}`}
                    disabled={readOnly}
                  >
                    <div className="flex flex-wrap gap-1">
                      {formData.responsaveisTecnicos && formData.responsaveisTecnicos.length > 0 ? (
                        formData.responsaveisTecnicos.map(name => (
                          <span key={name} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold flex items-center gap-1">
                            {name}
                            {!readOnly && (
                              <X 
                                size={12} 
                                className="cursor-pointer hover:text-emerald-900" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRTToggle(name);
                                }}
                              />
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 font-medium">Selecione os responsáveis...</span>
                      )}
                    </div>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${showRTDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showRTDropdown && (
                    <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Buscar responsável..."
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20"
                            value={rtSearch}
                            onChange={(e) => setRtSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                        {filteredRTs.map(name => {
                          const isSelected = formData.responsaveisTecnicos?.includes(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => handleRTToggle(name)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'}`}
                            >
                              {name}
                              {isSelected && <Check size={14} className="text-emerald-600" />}
                            </button>
                          );
                        })}
                        <div className="pt-2 border-t border-slate-100 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleInputChange('temRTOutro', !formData.temRTOutro);
                              if (!formData.temRTOutro && (!formData.rtOutros || formData.rtOutros.length === 0)) {
                                addRTOutro();
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${formData.temRTOutro ? 'bg-amber-50 text-amber-700' : 'hover:bg-slate-50 text-slate-500'}`}
                          >
                            <Plus size={14} /> Inserir Manualmente (Outro)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {formData.temRTOutro && (
                  <div className="mt-4 p-4 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-widest text-amber-600">Outros Responsáveis Técnicos</label>
                      {!readOnly && (
                        <button onClick={addRTOutro} className="text-amber-600 hover:text-amber-700 p-1">
                          <Plus size={16} />
                        </button>
                      )}
                    </div>
                    {formData.rtOutros?.map((name, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          className="flex-1 px-4 py-2 bg-white border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20"
                          placeholder="Nome do Responsável Técnico"
                          value={name}
                          onChange={(e) => handleRTOutroChange(idx, e.target.value)}
                          disabled={readOnly}
                        />
                        {!readOnly && (
                          <button onClick={() => removeRTOutro(idx)} className="p-2 text-amber-400 hover:text-red-500">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">ART</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.art} 
                  onChange={(e) => {
                    handleInputChange('art', e.target.value);
                    setRtDetalhes((prev) => ({ ...prev, registroProfissional: e.target.value }));
                  }} 
                  disabled={readOnly} 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">CPF do RT (Administra)</label>
                <input 
                  type="text" 
                  placeholder="000.000.000-00"
                  className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={rtDetalhes.cpf} 
                  onChange={(e) => setRtDetalhes((prev) => ({ ...prev, cpf: e.target.value }))} 
                  disabled={readOnly} 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Formação / Registro Profissional (Administra)</label>
                <input 
                  type="text" 
                  placeholder="Ex: Eng. Civil • CREA-MT 12345"
                  className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={rtDetalhes.formacaoProfissional} 
                  onChange={(e) => setRtDetalhes((prev) => ({ ...prev, formacaoProfissional: e.target.value }))} 
                  disabled={readOnly} 
                />
              </div>

              {!readOnly && usedRtNames.length > 0 && (
                <div className="md:col-span-2 pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  {unregisteredRtNames.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      Responsável(is) Técnico(s) cadastrado(s) na base Administra.
                    </span>
                  ) : (
                    <>
                      <span className="text-xs font-semibold text-amber-800">
                        RT(s) pendente(s) no Administra: <strong>{unregisteredRtNames.join(', ')}</strong>.
                      </span>
                      <button
                        type="button"
                        disabled={registeringEntity !== null}
                        onClick={() => void handleRegisterRTs()}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {registeringEntity === 'rt' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <PlusCircle size={14} />
                        )}
                        Cadastrar Responsável Técnico na Base de Dados
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Pendencies */}
          <section className="bg-white p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-[2rem] shadow-xl border border-slate-100 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <ClipboardList size={20} />
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Listagem de Pendências</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <textarea 
                  placeholder="Descreva a pendência encontrada..."
                  className="flex-1 px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm min-h-[100px]"
                  value={newPendenciaText}
                  onChange={(e) => setNewPendenciaText(e.target.value)}
                  disabled={readOnly}
                />
                <button 
                  onClick={editingPendenciaId ? handleUpdatePendencia : handleAddPendencia}
                  disabled={readOnly || !newPendenciaText.trim()}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shrink-0"
                >
                  {editingPendenciaId ? <Save size={20} /> : <Plus size={20} />}
                  <span className="sm:hidden text-xs">{editingPendenciaId ? 'Salvar Pendência' : 'Adicionar Pendência'}</span>
                </button>
              </div>

              <div className="space-y-3">
                {formData.pendencias.map((p, idx) => (
                  <div key={p.id} className="group flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:border-emerald-200 transition-all">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-black shrink-0 mt-1">
                      {idx + 1}
                    </div>
                    <p className="flex-1 text-sm text-slate-700 leading-relaxed">{p.descricao}</p>
                    {!readOnly && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditPendencia(p)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleRemovePendencia(p.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {formData.pendencias.length === 0 && (
                  <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                    <p className="text-slate-400 text-sm italic">Nenhuma pendência adicionada ainda.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Internal Notes */}
          <section className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Shield size={14} /> Anotações Internas (Apenas para conhecimento interno)
            </h2>
            <textarea 
              className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm min-h-[120px]"
              value={formData.anotacoesInternas}
              onChange={(e) => handleInputChange('anotacoesInternas', e.target.value)}
              disabled={readOnly}
              placeholder="Insira aqui observações que não devem constar no documento oficial..."
            />
          </section>

          {/* Dynamic Code-Hosted Document Preview */}
          <section className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Eye size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">
                    Pré-visualização Dinâmica do Ofício
                  </h2>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Texto gerado automaticamente em código conforme seleção e pendências (não gravado como texto longo no banco).
                  </p>
                </div>
              </div>
            </div>
            <pre className="whitespace-pre-wrap font-serif text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-2xl p-6 leading-relaxed">
              {dynamicOficioText}
            </pre>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Deadlines */}
          <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <CheckCircle size={14} /> Situação do Cumprimento
              </label>
              <div className="flex items-center gap-3 p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
                <div className={`w-4 h-4 rounded-full shrink-0 ${getStatusColor(formData.situacaoCumprimento)}`}></div>
                <select 
                  className="flex-1 bg-transparent font-bold text-slate-800 focus:outline-none"
                  value={formData.situacaoCumprimento}
                  onChange={(e) => handleInputChange('situacaoCumprimento', e.target.value)}
                  disabled={readOnly}
                >
                  <option value="Pendente / Em aberto">Pendente / Em aberto</option>
                  <option value="Cumprido">Cumprido</option>
                  <option value="Não cumprido no prazo">Não cumprido no prazo</option>
                  <option value="Arquivado">Arquivado</option>
                </select>
              </div>
            </div>

            <div className="space-y-6 pt-6 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prazo (dias)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-800 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none shadow-sm"
                    value={formData.prazoCumprimento}
                    onChange={(e) => handleInputChange('prazoCumprimento', e.target.value)}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prorrogação (dias)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-800 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none shadow-sm"
                    value={formData.prorrogacaoPrazo}
                    onChange={(e) => handleInputChange('prorrogacaoPrazo', e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Total de Dias</span>
                  <span className="text-xl font-black text-emerald-900">{totalDias}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Prazo Final</span>
                  <span className="text-xl font-black text-emerald-900">{dataFinal || '---'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-100">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Analistas Responsáveis</label>
              <div className="relative" ref={analistaDropdownRef}>
                <button
                  type="button"
                  onClick={() => !readOnly && setShowAnalistaDropdown(!showAnalistaDropdown)}
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between transition-all ${readOnly ? 'cursor-default' : 'hover:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20'}`}
                  disabled={readOnly}
                >
                  <div className="flex flex-wrap gap-1">
                    {formData.analistas && formData.analistas.length > 0 ? (
                      formData.analistas.map(fullName => {
                        const nameOnly = fullName.split('/')[0];
                        return (
                          <span key={fullName} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold flex items-center gap-1">
                            {nameOnly}
                            {!readOnly && (
                              <X 
                                size={12} 
                                className="cursor-pointer hover:text-emerald-900" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAnalistaToggle(nameOnly);
                                }}
                              />
                            )}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-slate-400 font-medium">Selecione os analistas...</span>
                    )}
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${showAnalistaDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showAnalistaDropdown && (
                  <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar analista..."
                          className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20"
                          value={analistaSearch}
                          onChange={(e) => setAnalistaSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                      {filteredAnalistas.map(name => {
                        const isThiago = name === 'Thiago Silveira da Silva';
                        const cargo = isThiago ? 'Residente Técnico' : 'Analista de Meio Ambiente';
                        const fullName = `${name}/${cargo}- SEMA/MT`;
                        const isSelected = formData.analistas?.includes(fullName);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => handleAnalistaToggle(name)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'}`}
                          >
                            {name}
                            {isSelected && <Check size={14} className="text-emerald-600" />}
                          </button>
                        );
                      })}
                      <div className="pt-2 border-t border-slate-100 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleInputChange('temAnalistaOutro', !formData.temAnalistaOutro);
                            if (!formData.temAnalistaOutro && (!formData.analistasOutros || formData.analistasOutros.length === 0)) {
                              addAnalistaOutro();
                            }
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${formData.temAnalistaOutro ? 'bg-amber-50 text-amber-700' : 'hover:bg-slate-50 text-slate-500'}`}
                        >
                          <Plus size={14} /> Inserir Manualmente (Outro)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {formData.temAnalistaOutro && (
                <div className="mt-4 p-4 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-600">Outros Analistas</label>
                    {!readOnly && (
                      <button onClick={addAnalistaOutro} className="text-amber-600 hover:text-amber-700 p-1">
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                  {formData.analistasOutros?.map((name, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 px-4 py-2 bg-white border-2 border-amber-200 rounded-xl text-sm focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 font-bold text-slate-700 shadow-sm"
                        placeholder="Nome do Analista / Cargo"
                        value={name}
                        onChange={(e) => handleAnalistaOutroChange(idx, e.target.value)}
                        disabled={readOnly}
                      />
                      {!readOnly && (
                        <button onClick={() => removeAnalistaOutro(idx)} className="p-2 text-amber-400 hover:text-red-500">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.action === 'delete' ? 'Excluir Ofício' : 'Limpar Formulário'}
        message={
          confirmModal.action === 'delete'
            ? 'Tem certeza que deseja excluir este ofício permanentemente?'
            : 'Tem certeza que deseja limpar todo o formulário de Ofício?'
        }
        variant={confirmModal.action === 'delete' ? 'danger' : 'warning'}
        confirmLabel={confirmModal.action === 'delete' ? 'Excluir' : 'Limpar'}
        onConfirm={handleConfirmModalAction}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      <SolicitarVistoriaModal
        isOpen={isSolicitarVistoriaOpen}
        onClose={() => setIsSolicitarVistoriaOpen(false)}
        prefill={{
          tipoReferencia: 'oficio',
          referenciaId: formData.id || '',
          processo: formData.processo || formData.protocolo || '',
          barragemId: formData.barragemId || '',
          nomeBarragem: formData.empreendimento || '',
          municipio: formData.municipio || '',
          coordenadas: formatCoordenadasGmsString(formData.coordenadasGMS),
          empreendedorId: formData.empreendedorId || '',
          empreendedorNome: formData.interessado || '',
        }}
      />

      <EntityOverwriteModal
        isOpen={Boolean(pendingOverwrite)}
        entityLabel={pendingOverwrite?.entityLabel || ''}
        conflicts={pendingOverwrite?.conflicts || []}
        onApplyEmptyOnly={() => {
          pendingOverwrite?.onApply('empty_only');
          setPendingOverwrite(null);
        }}
        onOverwriteAll={() => {
          pendingOverwrite?.onApply('overwrite_all');
          setPendingOverwrite(null);
        }}
        onCancel={() => setPendingOverwrite(null)}
      />

      <RetificarDocumentoModal
        isOpen={isRetificarOpen}
        doc={formData}
        onCancel={() => setIsRetificarOpen(false)}
        onConfirm={(justification) => {
          const draft = createRetificationDraft(formData, justification, currentActor);
          setFormData(draft);
          setIsRetificarOpen(false);
          toast.success('Rascunho de retificação criado. Edite os campos necessários e salve.');
        }}
      />
    </div>
  );
};

export default OficioForm;
