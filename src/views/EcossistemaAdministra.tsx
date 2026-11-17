import React, { useContext, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileText,
  GitPullRequest,
  Globe,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Waves,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { EcosystemContext } from '../contexts/EcosystemContext';
import { DataContext } from '../contexts/DataContext';
import {
  BarragemCanonica,
  ChangeRequest,
  ChangeRequestTargetType,
  CURRENT_SYSTEM_ID,
  ECOSYSTEM_SYSTEM_LABELS,
  EcosystemProductSummary,
  EcosystemRemoteSystemDiagnostic,
  EcosystemSystemId,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import { OPS_ANALISTA, OPS_MUNICIPIOS, OPS_TIPO_BARRAGEM, OPS_USO_PREPONDERANTE } from '../constants';
import { formatCpfCnpj, isValidCpfCnpj, normalizeDocumentNumber } from '../lib/security';
import { ChangeRequestModal } from '../components/ecosystem/ChangeRequestModal';
import ConfirmModal from '../components/ui/ConfirmModal';

type TabId = 'empreendedores' | 'barragens' | 'rts' | 'integracao';
type SystemFilter = 'TODOS' | EcosystemSystemId;

const SYSTEM_BADGE_CLASSES: Record<EcosystemSystemId, string> = {
  ADMINISTRA: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  CLASSIFICA: 'bg-sky-100 text-sky-800 border-sky-200',
  NOTIFICA: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FISCALIZA: 'bg-amber-100 text-amber-800 border-amber-200',
};

function normalizeLookupText(value?: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const EcossistemaAdministra: React.FC = () => {
  const {
    empreendedores,
    barragens,
    responsaveisTecnicos,
    externalEmpreendedores,
    externalBarragens,
    externalResponsaveisTecnicos,
    changeRequests,
    externalProducts,
    allEcosystemProducts,
    connections,
    remoteDiagnostics,
    pendingIncomingCount,
    loading,
    isPullingExternal,
    lastExternalSyncAt,
    refreshEcosystem,
    pullFromIntegratedSystems,
    importEmpreendedorToAdministra,
    importBarragemToAdministra,
    importRTToAdministra,
    canEditDirectly,
    saveEmpreendedor,
    deleteEmpreendedor,
    saveBarragem,
    deleteBarragem,
    saveResponsavelTecnico,
    deleteResponsavelTecnico,
    syncEntitiesFromForm,
    reviewChangeRequest,
    getProductsForEntity,
  } = useContext(EcosystemContext);

  const { pareceres, oficios, notificacoes } = useContext(DataContext);

  const [activeTab, setActiveTab] = useState<TabId>('empreendedores');
  const [systemFilter, setSystemFilter] = useState<SystemFilter>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'TODAS' | 'PENDENTE' | 'APROVADA' | 'REPROVADA'>('TODAS');
  const [isSyncingExisting, setIsSyncingExisting] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);

  // Selected entity for viewing linked products across the ecosystem
  const [productsModal, setProductsModal] = useState<{
    isOpen: boolean;
    title: string;
    products: EcosystemProductSummary[];
  }>({ isOpen: false, title: '', products: [] });

  // Selected entity for viewing full details (eye icon)
  const [empDetailModal, setEmpDetailModal] = useState<{
    isOpen: boolean;
    emp: EmpreendedorCanonico | null;
    linkedBarragens: BarragemCanonica[];
    linkedProducts: EcosystemProductSummary[];
  }>({ isOpen: false, emp: null, linkedBarragens: [], linkedProducts: [] });

  const [barDetailModal, setBarDetailModal] = useState<{
    isOpen: boolean;
    bar: BarragemCanonica | null;
    linkedEmpreendedor: EmpreendedorCanonico | null;
    linkedProducts: EcosystemProductSummary[];
  }>({ isOpen: false, bar: null, linkedEmpreendedor: null, linkedProducts: [] });

  // Change request modal for records owned by external systems
  const [changeRequestTarget, setChangeRequestTarget] = useState<{
    isOpen: boolean;
    targetType: ChangeRequestTargetType;
    record: EmpreendedorCanonico | BarragemCanonica | ResponsavelTecnicoCanonico | null;
  }>({ isOpen: false, targetType: 'EMPREENDEDOR', record: null });

  // Confirm delete modal
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: async () => {},
  });

  // Empreendedor form modal state
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empForm, setEmpForm] = useState<{
    id?: string;
    nome: string;
    tipoPessoa: 'CPF' | 'CNPJ';
    cpfCnpj: string;
    telefone: string;
    email: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    carMt: string;
  }>({
    nome: '',
    tipoPessoa: 'CPF',
    cpfCnpj: '',
    telefone: '',
    email: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    municipio: OPS_MUNICIPIOS[0],
    uf: 'MT',
    cep: '',
    carMt: '',
  });

  // Barragem form modal state
  const [barModalOpen, setBarModalOpen] = useState(false);
  const [barForm, setBarForm] = useState<{
    id?: string;
    empreendedorId: string;
    nomeBarragem: string;
    codigoSnisb: string;
    municipio: string;
    uf: string;
    cursoAguaBarrado: string;
    usoPreponderante: string;
    tipoBarragem: string;
    altura: string;
    volume: string;
    classificacaoDPA: string;
    classificacaoCRI: string;
  }>({
    empreendedorId: '',
    nomeBarragem: '',
    codigoSnisb: '',
    municipio: OPS_MUNICIPIOS[0],
    uf: 'MT',
    cursoAguaBarrado: '',
    usoPreponderante: '',
    tipoBarragem: '',
    altura: '',
    volume: '',
    classificacaoDPA: '',
    classificacaoCRI: '',
  });

  // RT form modal state
  const [rtModalOpen, setRtModalOpen] = useState(false);
  const [rtForm, setRtForm] = useState<{
    id?: string;
    nome: string;
    registroProfissional: string;
    formacaoProfissional: string;
    cpf: string;
    telefone: string;
    email: string;
  }>({
    nome: '',
    registroProfissional: '',
    formacaoProfissional: '',
    cpf: '',
    telefone: '',
    email: '',
  });

  // Review state for incoming ChangeRequests
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const existingEmpKeys = useMemo(() => {
    const docs = new Set<string>();
    const names = new Set<string>();
    empreendedores.forEach((e) => {
      if (e.cpfCnpjNormalizado) docs.add(e.cpfCnpjNormalizado);
      if (e.nome) names.add(normalizeLookupText(e.nome));
    });
    return { docs, names };
  }, [empreendedores]);

  const existingBarKeys = useMemo(() => {
    const snisbs = new Set<string>();
    const names = new Set<string>();
    barragens.forEach((b) => {
      if (b.codigoSnisb) snisbs.add(normalizeLookupText(b.codigoSnisb));
      if (b.nomeBarragem) names.add(normalizeLookupText(b.nomeBarragem));
    });
    return { snisbs, names };
  }, [barragens]);

  const existingRtKeys = useMemo(() => {
    const cpfs = new Set<string>();
    const regs = new Set<string>();
    const names = new Set<string>();
    responsaveisTecnicos.forEach((rt) => {
      const cpf = normalizeDocumentNumber(rt.cpf || '');
      if (cpf) cpfs.add(cpf);
      if (rt.registroProfissional) regs.add(normalizeLookupText(rt.registroProfissional));
      if (rt.nome) names.add(normalizeLookupText(rt.nome));
    });
    return { cpfs, regs, names };
  }, [responsaveisTecnicos]);

  const combinedEmpreendedores = useMemo(() => {
    const base = empreendedores.map((item) => ({ item, isExternalPreview: false, alreadyInAdministra: true }));
    const ext = externalEmpreendedores.map((item) => {
      const alreadyInAdministra =
        Boolean(item.cpfCnpjNormalizado && existingEmpKeys.docs.has(item.cpfCnpjNormalizado)) ||
        Boolean(item.nome && existingEmpKeys.names.has(normalizeLookupText(item.nome)));
      return { item, isExternalPreview: true, alreadyInAdministra };
    });
    return [...base, ...ext];
  }, [empreendedores, externalEmpreendedores, existingEmpKeys]);

  const combinedBarragens = useMemo(() => {
    const base = barragens.map((item) => ({ item, isExternalPreview: false, alreadyInAdministra: true }));
    const ext = externalBarragens.map((item) => {
      const alreadyInAdministra =
        Boolean(item.codigoSnisb && existingBarKeys.snisbs.has(normalizeLookupText(item.codigoSnisb))) ||
        Boolean(item.nomeBarragem && existingBarKeys.names.has(normalizeLookupText(item.nomeBarragem)));
      return { item, isExternalPreview: true, alreadyInAdministra };
    });
    return [...base, ...ext];
  }, [barragens, externalBarragens, existingBarKeys]);

  const combinedRTs = useMemo(() => {
    const base = responsaveisTecnicos.map((item) => ({ item, isExternalPreview: false, alreadyInAdministra: true }));
    const ext = externalResponsaveisTecnicos.map((item) => {
      const cpf = normalizeDocumentNumber(item.cpf || '');
      const alreadyInAdministra =
        Boolean(cpf && existingRtKeys.cpfs.has(cpf)) ||
        Boolean(item.registroProfissional && existingRtKeys.regs.has(normalizeLookupText(item.registroProfissional))) ||
        Boolean(item.nome && existingRtKeys.names.has(normalizeLookupText(item.nome)));
      return { item, isExternalPreview: true, alreadyInAdministra };
    });
    return [...base, ...ext];
  }, [responsaveisTecnicos, externalResponsaveisTecnicos, existingRtKeys]);

  const { barragensByEmpKey, empreendedorByBarKey } = useMemo(() => {
    const empById = new Map<string, EmpreendedorCanonico>();
    const empByDoc = new Map<string, EmpreendedorCanonico>();
    const empByName = new Map<string, EmpreendedorCanonico>();

    combinedEmpreendedores.forEach(({ item: e }) => {
      if (e.id && !empById.has(e.id)) empById.set(e.id, e);
      const doc = e.cpfCnpjNormalizado || normalizeDocumentNumber(e.cpfCnpj || '');
      if (doc && !empByDoc.has(doc)) empByDoc.set(doc, e);
      const name = normalizeLookupText(e.nome);
      if (name && !empByName.has(name)) empByName.set(name, e);
    });

    const barsByEmpId = new Map<string, BarragemCanonica[]>();
    const barsByEmpDoc = new Map<string, BarragemCanonica[]>();
    const barsByEmpName = new Map<string, BarragemCanonica[]>();
    const empForBar = new Map<string, EmpreendedorCanonico>();

    const pushUnique = (map: Map<string, BarragemCanonica[]>, key: string, bar: BarragemCanonica) => {
      if (!key) return;
      const list = map.get(key) || [];
      if (!list.some((b) => b.id === bar.id)) {
        list.push(bar);
        map.set(key, list);
      }
    };

    combinedBarragens.forEach(({ item: b }) => {
      const barDoc = normalizeDocumentNumber(b.empreendedorCpfCnpj || '');
      const barEmpName = normalizeLookupText(b.empreendedorNome);

      const matchedEmp =
        (b.empreendedorId ? empById.get(b.empreendedorId) : undefined) ||
        (barDoc ? empByDoc.get(barDoc) : undefined) ||
        (barEmpName ? empByName.get(barEmpName) : undefined);

      if (matchedEmp) {
        empForBar.set(`${b.sourceSystem}-${b.id}`, matchedEmp);
        pushUnique(barsByEmpId, matchedEmp.id, b);
        const empDoc = matchedEmp.cpfCnpjNormalizado || normalizeDocumentNumber(matchedEmp.cpfCnpj || '');
        if (empDoc) pushUnique(barsByEmpDoc, empDoc, b);
        const empName = normalizeLookupText(matchedEmp.nome);
        if (empName) pushUnique(barsByEmpName, empName, b);
      } else {
        if (b.empreendedorId) pushUnique(barsByEmpId, b.empreendedorId, b);
        if (barDoc) pushUnique(barsByEmpDoc, barDoc, b);
        if (barEmpName) pushUnique(barsByEmpName, barEmpName, b);
      }
    });

    const byEmpKey = new Map<string, BarragemCanonica[]>();
    combinedEmpreendedores.forEach(({ item: e }) => {
      const collected = new Map<string, BarragemCanonica>();
      const addAll = (list?: BarragemCanonica[]) => {
        list?.forEach((b) => {
          if (!collected.has(b.id)) collected.set(b.id, b);
        });
      };
      addAll(barsByEmpId.get(e.id));
      const doc = e.cpfCnpjNormalizado || normalizeDocumentNumber(e.cpfCnpj || '');
      if (doc) addAll(barsByEmpDoc.get(doc));
      const name = normalizeLookupText(e.nome);
      if (name) addAll(barsByEmpName.get(name));
      byEmpKey.set(`${e.sourceSystem}-${e.id}`, Array.from(collected.values()));
    });

    return { barragensByEmpKey: byEmpKey, empreendedorByBarKey: empForBar };
  }, [combinedEmpreendedores, combinedBarragens]);

  const getEmpreendedorEcosystemProducts = (
    emp: EmpreendedorCanonico,
    linkedBars: BarragemCanonica[]
  ): EcosystemProductSummary[] => {
    const map = new Map<string, EcosystemProductSummary>();
    const addProducts = (items: EcosystemProductSummary[]) => {
      items.forEach((p) => {
        const key = `${p.systemId}-${p.id}`;
        if (!map.has(key)) map.set(key, p);
      });
    };
    addProducts(
      getProductsForEntity({
        empreendedorId: emp.id,
        cpfCnpj: emp.cpfCnpj,
      })
    );
    linkedBars.forEach((bar) => {
      addProducts(
        getProductsForEntity({
          barragemId: bar.id,
          codigoSnisb: bar.codigoSnisb,
          nomeBarragem: bar.nomeBarragem,
        })
      );
    });
    return Array.from(map.values());
  };

  const filteredEmpreendedores = useMemo(() => {
    const raw = searchTerm.trim();
    const q = raw.toLowerCase();
    const digits = normalizeDocumentNumber(raw);
    const carQ = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

    return combinedEmpreendedores.filter(({ item: e }) => {
      if (systemFilter !== 'TODOS' && e.sourceSystem !== systemFilter) return false;
      if (!raw) return true;
      return (
        (e.nome || '').toLowerCase().includes(q) ||
        (e.cpfCnpj || '').toLowerCase().includes(q) ||
        (digits.length >= 2 && (e.cpfCnpjNormalizado || '').includes(digits)) ||
        (e.municipio || '').toLowerCase().includes(q) ||
        (e.carMt || '').toLowerCase().includes(q) ||
        (carQ.length >= 3 && (e.carMt || '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes(carQ))
      );
    });
  }, [combinedEmpreendedores, searchTerm, systemFilter]);

  const filteredBarragens = useMemo(() => {
    const raw = searchTerm.trim();
    const q = raw.toLowerCase();
    const digits = normalizeDocumentNumber(raw);

    return combinedBarragens.filter(({ item: b }) => {
      if (systemFilter !== 'TODOS' && b.sourceSystem !== systemFilter) return false;
      if (!raw) return true;
      return (
        (b.nomeBarragem || '').toLowerCase().includes(q) ||
        (b.codigoSnisb || '').toLowerCase().includes(q) ||
        (b.municipio || '').toLowerCase().includes(q) ||
        (b.empreendedorNome || '').toLowerCase().includes(q) ||
        (digits.length >= 2 && normalizeDocumentNumber(b.empreendedorCpfCnpj || '').includes(digits))
      );
    });
  }, [combinedBarragens, searchTerm, systemFilter]);

  const filteredRTs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return combinedRTs.filter(({ item: rt }) => {
      if (systemFilter !== 'TODOS' && rt.sourceSystem !== systemFilter) return false;
      if (!q) return true;
      return (
        (rt.nome || '').toLowerCase().includes(q) ||
        (rt.registroProfissional || '').toLowerCase().includes(q) ||
        (rt.formacaoProfissional || '').toLowerCase().includes(q) ||
        (rt.art || '').toLowerCase().includes(q) ||
        (rt.artsVinculadas || []).some(
          (a) =>
            (a.art || '').toLowerCase().includes(q) ||
            (a.barragemNome || '').toLowerCase().includes(q)
        )
      );
    });
  }, [combinedRTs, searchTerm, systemFilter]);

  const filteredRequests = useMemo(() => {
    return changeRequests.filter((req) => {
      if (requestStatusFilter !== 'TODAS' && req.status !== requestStatusFilter) return false;
      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;
      return (
        (req.targetLabel || '').toLowerCase().includes(q) ||
        (req.requestedByName || '').toLowerCase().includes(q) ||
        (req.justification || '').toLowerCase().includes(q)
      );
    });
  }, [changeRequests, requestStatusFilter, searchTerm]);

  const filteredExternalProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return externalProducts.filter((p) => {
      if (systemFilter !== 'TODOS' && p.systemId !== systemFilter) return false;
      if (!q) return true;
      return (
        (p.tipoDocumento || '').toLowerCase().includes(q) ||
        (p.numeroDocumento || '').toLowerCase().includes(q) ||
        (p.empreendedorNome || '').toLowerCase().includes(q) ||
        (p.barragemNome || '').toLowerCase().includes(q) ||
        (p.processo || '').toLowerCase().includes(q)
      );
    });
  }, [externalProducts, systemFilter, searchTerm]);

  const openNewEmpreendedor = () => {
    setEmpForm({
      nome: '',
      tipoPessoa: 'CPF',
      cpfCnpj: '',
      telefone: '',
      email: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      municipio: OPS_MUNICIPIOS[0],
      uf: 'MT',
      cep: '',
      carMt: '',
    });
    setEmpModalOpen(true);
  };

  const openEditEmpreendedor = (emp: EmpreendedorCanonico) => {
    setEmpForm({
      id: emp.id,
      nome: emp.nome || '',
      tipoPessoa: emp.tipoPessoa || 'CPF',
      cpfCnpj: emp.cpfCnpj || '',
      telefone: emp.telefone || '',
      email: emp.email || '',
      logradouro: emp.logradouro || '',
      numero: emp.numero || '',
      complemento: emp.complemento || '',
      bairro: emp.bairro || '',
      municipio: emp.municipio || OPS_MUNICIPIOS[0],
      uf: emp.uf || 'MT',
      cep: emp.cep || '',
      carMt: emp.carMt || '',
    });
    setEmpModalOpen(true);
  };

  const handleSaveEmpreendedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.nome.trim()) {
      toast.error('Informe o nome do empreendedor.');
      return;
    }
    const docDigits = normalizeDocumentNumber(empForm.cpfCnpj);
    if (docDigits && !isValidCpfCnpj(docDigits)) {
      toast.error('CPF/CNPJ inválido. Verifique os dígitos informados.');
      return;
    }

    const res = await saveEmpreendedor({
      ...empForm,
      nome: empForm.nome.trim(),
      cpfCnpj: docDigits ? formatCpfCnpj(docDigits) : empForm.cpfCnpj.trim(),
      tipoPessoa: docDigits.length === 14 ? 'CNPJ' : empForm.tipoPessoa,
      sourceSystem: CURRENT_SYSTEM_ID,
    });

    if (!res.success) {
      toast.error(res.message || 'Erro ao salvar empreendedor.');
      return;
    }
    toast.success('Empreendedor salvo na base do Administra.');
    setEmpModalOpen(false);
  };

  const openNewBarragem = () => {
    setBarForm({
      empreendedorId: empreendedores[0]?.id || '',
      nomeBarragem: '',
      codigoSnisb: '',
      municipio: OPS_MUNICIPIOS[0],
      uf: 'MT',
      cursoAguaBarrado: '',
      usoPreponderante: '',
      tipoBarragem: '',
      altura: '',
      volume: '',
      classificacaoDPA: '',
      classificacaoCRI: '',
    });
    setBarModalOpen(true);
  };

  const openEditBarragem = (bar: BarragemCanonica) => {
    setBarForm({
      id: bar.id,
      empreendedorId: bar.empreendedorId || '',
      nomeBarragem: bar.nomeBarragem || '',
      codigoSnisb: bar.codigoSnisb || '',
      municipio: bar.municipio || OPS_MUNICIPIOS[0],
      uf: bar.uf || 'MT',
      cursoAguaBarrado: bar.cursoAguaBarrado || '',
      usoPreponderante: bar.usoPreponderante || '',
      tipoBarragem: bar.tipoBarragem || '',
      altura: bar.altura || '',
      volume: bar.volume || '',
      classificacaoDPA: bar.classificacaoDPA || '',
      classificacaoCRI: bar.classificacaoCRI || '',
    });
    setBarModalOpen(true);
  };

  const handleSaveBarragem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barForm.nomeBarragem.trim()) {
      toast.error('Informe o nome da barragem ou empreendimento.');
      return;
    }
    const linkedEmp = empreendedores.find((emp) => emp.id === barForm.empreendedorId);
    const res = await saveBarragem({
      ...barForm,
      nomeBarragem: barForm.nomeBarragem.trim(),
      empreendedorNome: linkedEmp?.nome,
      empreendedorCpfCnpj: linkedEmp?.cpfCnpj,
      sourceSystem: CURRENT_SYSTEM_ID,
    });

    if (!res.success) {
      toast.error(res.message || 'Erro ao salvar barragem.');
      return;
    }
    toast.success('Barragem salva na base do Administra.');
    setBarModalOpen(false);
  };

  const openNewRT = () => {
    setRtForm({
      nome: '',
      registroProfissional: '',
      formacaoProfissional: '',
      cpf: '',
      telefone: '',
      email: '',
    });
    setRtModalOpen(true);
  };

  const openEditRT = (rt: ResponsavelTecnicoCanonico) => {
    setRtForm({
      id: rt.id,
      nome: rt.nome || '',
      registroProfissional: rt.registroProfissional || '',
      formacaoProfissional: rt.formacaoProfissional || '',
      cpf: rt.cpf || '',
      telefone: rt.telefone || '',
      email: rt.email || '',
    });
    setRtModalOpen(true);
  };

  const handleSaveRT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rtForm.nome.trim()) {
      toast.error('Informe o nome do Responsável Técnico.');
      return;
    }
    const cpfDigits = normalizeDocumentNumber(rtForm.cpf);
    if (cpfDigits && !isValidCpfCnpj(cpfDigits)) {
      toast.error('CPF do Responsável Técnico inválido.');
      return;
    }
    const res = await saveResponsavelTecnico({
      ...rtForm,
      nome: rtForm.nome.trim(),
      cpf: cpfDigits ? formatCpfCnpj(cpfDigits) : rtForm.cpf.trim(),
      sourceSystem: CURRENT_SYSTEM_ID,
    });

    if (!res.success) {
      toast.error(res.message || 'Erro ao salvar Responsável Técnico.');
      return;
    }
    toast.success('Responsável Técnico salvo na base do Administra.');
    setRtModalOpen(false);
  };

  const handleSyncExistingLocalDocs = async () => {
    const totalDocs = pareceres.length + oficios.length + notificacoes.length;
    if (totalDocs === 0) {
      toast.info('Nenhum parecer, ofício ou notificação salvo localmente para sincronizar.');
      return;
    }

    setIsSyncingExisting(true);
    let createdEmps = 0;
    let createdBars = 0;
    let createdRTs = 0;

    try {
      for (const p of pareceres) {
        const rts = [
          ...(p.responsaveisTecnicos || []),
          ...(p.rtOutros || []).filter((n) => n.trim()),
        ].map((nome) => ({
          nome,
          registroProfissional: p.registroProfissionalRT || p.artCreaMt,
          formacaoProfissional: p.formacaoProfissionalRT,
          cpf: p.cpfRT,
        }));
        const res = await syncEntitiesFromForm({
          existingEmpreendedorId: p.empreendedorId,
          existingBarragemId: p.barragemId,
          empreendedorNome: p.identificacaoEmpreendedor,
          cpfCnpj: p.cpfCnpj,
          logradouro: p.logradouro,
          numero: p.numero,
          complemento: p.complemento,
          bairro: p.bairro,
          municipio: p.municipio,
          cep: p.cep,
          carMt: p.numCarMt,
          nomeBarragem: p.nomeBarragem || p.localizacaoEmpreendimento,
          codigoSnisb: p.snisb,
          processo: p.processo,
          cursoAguaBarrado: p.nomeCursoAguaBarrado,
          usoPreponderante: p.usoPreponderante,
          situacaoEmpreendimento: p.situacaoEmpreendimento,
          tipoBarragem: p.tipoBarragem,
          coordenadasGMS: p.coordenadasGMS,
          altura: p.alturaBarragem,
          volume: p.volumeBarragem,
          larguraCoroamento: p.larguraCoroamento,
          comprimentoCoroamento: p.comprimentoCoroamento,
          classificacaoBarragem: p.classificacaoBarragem,
          classificacaoDPA: p.classificacaoDPA,
          classificacaoCRI: p.classificacaoCRI,
          portariaClassificacao: p.portariaClassificacao,
          parecerClassificacao: p.parecerClassificacao,
          responsaveisTecnicos: rts,
          analista: p.analista,
        });
        if (res.createdEmpreendedor) createdEmps++;
        if (res.createdBarragem) createdBars++;
        createdRTs += res.createdRTCount;
      }

      for (const o of oficios) {
        const rts = [
          ...(o.responsaveisTecnicos || []),
          ...(o.rtOutros || []).filter((n) => n.trim()),
        ].map((nome) => ({ nome, registroProfissional: o.art }));
        const res = await syncEntitiesFromForm({
          existingEmpreendedorId: o.empreendedorId,
          existingBarragemId: o.barragemId,
          empreendedorNome: o.interessado,
          cpfCnpj: o.cpfCnpj,
          logradouro: o.logradouro,
          numero: o.numero,
          complemento: o.complemento,
          bairro: o.bairro,
          municipio: o.municipio || o.cidadeUf,
          cep: o.cep,
          nomeBarragem: o.empreendimento,
          processo: o.processo || o.protocolo,
          coordenadasGMS: o.coordenadasGMS,
          responsaveisTecnicos: rts,
          analista: o.analistas?.[0],
        });
        if (res.createdEmpreendedor) createdEmps++;
        if (res.createdBarragem) createdBars++;
        createdRTs += res.createdRTCount;
      }

      for (const n of notificacoes) {
        const res = await syncEntitiesFromForm({
          existingEmpreendedorId: n.empreendedorId,
          existingBarragemId: n.barragemId,
          empreendedorNome: n.empreendedorNome,
          tipoPessoa: n.tipoDocumentoIdentificacao,
          cpfCnpj: n.documentoIdentificacao,
          telefone: n.telefone,
          logradouro: n.logradouro,
          numero: n.numero,
          complemento: n.complemento,
          bairro: n.bairro,
          municipio: n.municipioEmpreendimento,
          uf: n.ufCorrespondencia,
          cep: n.cepCorrespondencia,
          carMt: n.carMt,
          nomeBarragem: n.nomeFantasia || n.barragens?.[0]?.nome,
          processo: n.numProcesso,
          analista: n.analista || n.analistas?.[0],
        });
        if (res.createdEmpreendedor) createdEmps++;
        if (res.createdBarragem) createdBars++;
        createdRTs += res.createdRTCount;
      }

      await refreshEcosystem();
      toast.success(
        `Sincronização concluída: ${createdEmps} novos empreendedores, ${createdBars} novas barragens e ${createdRTs} novos RTs.`
      );
    } finally {
      setIsSyncingExisting(false);
    }
  };

  const handleReviewSubmit = async (req: ChangeRequest, decision: 'APROVADA' | 'REPROVADA') => {
    if (!reviewerName.trim()) {
      toast.error('Informe o nome do analista/administrador responsável pela análise.');
      return;
    }
    const res = await reviewChangeRequest(req.id, decision, reviewerName.trim(), reviewNotes.trim());
    if (!res.success) {
      toast.error(res.message || 'Erro ao processar análise da solicitação.');
      return;
    }
    toast.success(
      decision === 'APROVADA'
        ? 'Solicitação aprovada e registro atualizado na base do Administra!'
        : 'Solicitação reprovada.'
    );
    setReviewingRequestId(null);
    setReviewNotes('');
  };

  const handlePullIntegratedSystems = async (targetSystem?: EcosystemSystemId) => {
    const payload = await pullFromIntegratedSystems(targetSystem);
    const diagList = Object.values(payload.diagnostics || {}) as EcosystemRemoteSystemDiagnostic[];
    const totalEmps = payload.empreendedores.length;
    const totalBars = payload.barragens.length;
    const totalRts = payload.responsaveisTecnicos.length;
    const totalProds = payload.products.length;
    const denied = diagList.filter((d) => d.authDenied).map((d) => ECOSYSTEM_SYSTEM_LABELS[d.systemId].shortName);
    const missing = diagList
      .filter((d) => !d.remoteConfigured && (d.systemId === 'CLASSIFICA' || d.systemId === 'FISCALIZA'))
      .map((d) => ECOSYSTEM_SYSTEM_LABELS[d.systemId].shortName);

    if (denied.length > 0) {
      toast.warning(
        `Leitura realizada, mas ${denied.join(', ')} bloqueou acesso (RLS/permissão). Pode ser necessária chave Service Role no servidor.`
      );
    } else if (missing.length > 0 && totalEmps === 0 && totalBars === 0 && totalRts === 0) {
      toast.info(
        `Configure as chaves de acesso de ${missing.join(', ')} no servidor para puxar registros remotos.`
      );
    } else {
      toast.success(
        `Leitura dos sistemas concluída: ${totalEmps} empreendedores, ${totalBars} barragens, ${totalRts} RTs e ${totalProds} documentos.`
      );
    }
  };

  const handleBatchImportTab = async () => {
    setIsBatchImporting(true);
    let count = 0;
    try {
      if (activeTab === 'empreendedores') {
        const toImport = filteredEmpreendedores.filter((x) => x.isExternalPreview && !x.alreadyInAdministra);
        for (const { item } of toImport) {
          const res = await importEmpreendedorToAdministra(item);
          if (res.success) count++;
        }
      } else if (activeTab === 'barragens') {
        const toImport = filteredBarragens.filter((x) => x.isExternalPreview && !x.alreadyInAdministra);
        for (const { item } of toImport) {
          const res = await importBarragemToAdministra(item);
          if (res.success) count++;
        }
      } else if (activeTab === 'rts') {
        const toImport = filteredRTs.filter((x) => x.isExternalPreview && !x.alreadyInAdministra);
        for (const { item } of toImport) {
          const res = await importRTToAdministra(item);
          if (res.success) count++;
        }
      }
      if (count > 0) {
        toast.success(`${count} registro(s) importado(s) para a base central do Administra!`);
      } else {
        toast.info('Todos os registros exibidos já estão sincronizados na base do Administra.');
      }
    } finally {
      setIsBatchImporting(false);
    }
  };

  const unimportedCountInTab = useMemo(() => {
    if (activeTab === 'empreendedores') {
      return filteredEmpreendedores.filter((x) => x.isExternalPreview && !x.alreadyInAdministra).length;
    }
    if (activeTab === 'barragens') {
      return filteredBarragens.filter((x) => x.isExternalPreview && !x.alreadyInAdministra).length;
    }
    if (activeTab === 'rts') {
      return filteredRTs.filter((x) => x.isExternalPreview && !x.alreadyInAdministra).length;
    }
    return 0;
  }, [activeTab, filteredEmpreendedores, filteredBarragens, filteredRTs]);

  return (
    <div className="p-3 sm:p-5 md:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-6 pb-20">
      {/* Top Banner */}
      <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 sm:px-3 py-1 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-widest rounded-lg">
                Arquitetura Federada CSB
              </span>
              <span className="px-2.5 sm:px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded-lg">
                Leitura Integrada • Administra, Classifica, Fiscaliza &amp; Notifica
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight">
              Ecossistema CSB &amp; Base <span className="text-emerald-400">Administra Barragens</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Leitura unificada de <strong>Empreendedor</strong>, <strong>Barragem Cadastrada</strong> e{' '}
              <strong>Responsável Técnico</strong> diretamente dos sistemas integrados (<strong>Administra</strong>,{' '}
              <strong>Classifica</strong>, <strong>Fiscaliza</strong> e <strong>Notifica</strong>), com importação
              direta para a base central e solicitação formal de alteração entre sistemas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handlePullIntegratedSystems()}
              disabled={isPullingExternal}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-sky-600/20 transition-all disabled:opacity-50"
            >
              <Download size={14} className={isPullingExternal ? 'animate-bounce' : ''} />
              {isPullingExternal ? 'Puxando Sistemas...' : 'Puxar dos Demais Sistemas'}
            </button>
            <button
              type="button"
              onClick={handleSyncExistingLocalDocs}
              disabled={isSyncingExisting}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncingExisting ? 'animate-spin' : ''} />
              Sincronizar Docs do Notifica
            </button>
            <button
              type="button"
              onClick={() => refreshEcosystem()}
              disabled={loading}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
            >
              <Database size={14} />
              Atualizar Base
            </button>
          </div>
        </div>

        {/* Summary Counters + Remote System Indicators */}
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab('empreendedores');
              setSystemFilter('TODOS');
            }}
            className={`text-left rounded-2xl p-3.5 transition-all cursor-pointer border ${
              activeTab === 'empreendedores' && systemFilter === 'TODOS'
                ? 'bg-emerald-500/15 border-emerald-400/60 ring-1 ring-emerald-400/30'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 hover:border-slate-500'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Empreendedor</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-2xl font-black text-white">{empreendedores.length}</p>
              {externalEmpreendedores.length > 0 && (
                <span className="text-[11px] font-bold text-sky-300">
                  +{externalEmpreendedores.length} externos
                </span>
              )}
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('barragens');
              setSystemFilter('TODOS');
            }}
            className={`text-left rounded-2xl p-3.5 transition-all cursor-pointer border ${
              activeTab === 'barragens' && systemFilter === 'TODOS'
                ? 'bg-emerald-500/15 border-emerald-400/60 ring-1 ring-emerald-400/30'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 hover:border-slate-500'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Barragem Cadastrada</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-2xl font-black text-white">{barragens.length}</p>
              {externalBarragens.length > 0 && (
                <span className="text-[11px] font-bold text-sky-300">
                  +{externalBarragens.length} externas
                </span>
              )}
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('rts');
              setSystemFilter('TODOS');
            }}
            className={`text-left rounded-2xl p-3.5 transition-all cursor-pointer border ${
              activeTab === 'rts' && systemFilter === 'TODOS'
                ? 'bg-emerald-500/15 border-emerald-400/60 ring-1 ring-emerald-400/30'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 hover:border-slate-500'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Responsável Técnico</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-2xl font-black text-white">{responsaveisTecnicos.length}</p>
              {externalResponsaveisTecnicos.length > 0 && (
                <span className="text-[11px] font-bold text-sky-300">
                  +{externalResponsaveisTecnicos.length} externos
                </span>
              )}
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('integracao');
              setSystemFilter('TODOS');
              requestAnimationFrame(() => {
                document.getElementById('ecosystem-products-section')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              });
            }}
            className={`text-left rounded-2xl p-3.5 transition-all cursor-pointer border ${
              activeTab === 'integracao' && systemFilter === 'TODOS'
                ? 'bg-emerald-500/15 border-emerald-400/60 ring-1 ring-emerald-400/30'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 hover:border-slate-500'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Produtos no Ecossistema
            </p>
            <p className="text-2xl font-black text-emerald-400 mt-0.5">{allEcosystemProducts.length}</p>
          </button>
        </div>

        {/* Live System Connection Strip */}
        <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4">
          {connections.map((conn) => {
            const diag = remoteDiagnostics[conn.systemId];
            const isSelected = systemFilter === conn.systemId;
            return (
              <button
                key={conn.systemId}
                type="button"
                onClick={() => {
                  const nextFilter = isSelected ? 'TODOS' : conn.systemId;
                  setSystemFilter(nextFilter);
                  if (nextFilter !== 'TODOS') {
                    const hasProductsForSys = externalProducts.some((p) => p.systemId === nextFilter);
                    const hasEntitiesInCurrentTab =
                      (activeTab === 'empreendedores' &&
                        combinedEmpreendedores.some((x) => x.item.sourceSystem === nextFilter)) ||
                      (activeTab === 'barragens' &&
                        combinedBarragens.some((x) => x.item.sourceSystem === nextFilter)) ||
                      (activeTab === 'rts' &&
                        combinedRTs.some((x) => x.item.sourceSystem === nextFilter));

                    if (!hasEntitiesInCurrentTab && (hasProductsForSys || diag?.authDenied)) {
                      setActiveTab('integracao');
                      requestAnimationFrame(() => {
                        document.getElementById('ecosystem-products-section')?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      });
                    }
                  }
                }}
                className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-sky-400 ring-1 ring-sky-400/40'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 hover:border-slate-500'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-black text-white truncate">{ECOSYSTEM_SYSTEM_LABELS[conn.systemId].shortName}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {diag?.authDenied
                      ? 'Permissão RLS negada'
                      : conn.mode === 'remote-configured'
                        ? diag?.reachable
                          ? `${diag.empreendedoresCount} emp • ${diag.barragensCount} bar • ${diag.productsCount} doc`
                          : 'Chave configurada (pronto)'
                        : 'Aguardando chave no servidor'}
                  </p>
                </div>
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    diag?.authDenied
                      ? 'bg-amber-400'
                      : conn.mode === 'remote-configured'
                        ? 'bg-emerald-400'
                        : 'bg-slate-500'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation Tabs & Search */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-wrap gap-1.5 sm:gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab('empreendedores')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                activeTab === 'empreendedores'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Building2 size={14} /> Empreendedor ({combinedEmpreendedores.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('barragens')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                activeTab === 'barragens'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Waves size={14} /> Barragem Cadastrada ({combinedBarragens.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rts')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                activeTab === 'rts'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <UserCheck size={14} /> Responsável Técnico ({combinedRTs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('integracao')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                activeTab === 'integracao'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <GitPullRequest size={14} /> Solicitações &amp; Integração
              {pendingIncomingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-900 text-[10px] font-black">
                  {pendingIncomingCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar registros..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-emerald-600 outline-none shadow-xs"
              />
            </div>

            {unimportedCountInTab > 0 && activeTab !== 'integracao' && (
              <button
                type="button"
                onClick={handleBatchImportTab}
                disabled={isBatchImporting}
                className="px-3.5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shrink-0 disabled:opacity-50"
              >
                <Download size={14} /> Importar {unimportedCountInTab} p/ Administra
              </button>
            )}

            {activeTab === 'empreendedores' && (
              <button
                type="button"
                onClick={openNewEmpreendedor}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shrink-0"
              >
                <Plus size={15} /> Novo Empreendedor
              </button>
            )}
            {activeTab === 'barragens' && (
              <button
                type="button"
                onClick={openNewBarragem}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shrink-0"
              >
                <Plus size={15} /> Nova Barragem
              </button>
            )}
            {activeTab === 'rts' && (
              <button
                type="button"
                onClick={openNewRT}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shrink-0"
              >
                <Plus size={15} /> Novo RT
              </button>
            )}
          </div>
        </div>

        {/* Origin System Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">
              Origem dos Dados:
            </span>
            {(['TODOS', 'ADMINISTRA', 'CLASSIFICA', 'FISCALIZA', 'NOTIFICA'] as const).map((sys) => (
              <button
                key={sys}
                type="button"
                onClick={() => setSystemFilter(sys)}
                className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${
                  systemFilter === sys
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {sys === 'TODOS' ? 'Todos os Sistemas' : ECOSYSTEM_SYSTEM_LABELS[sys].shortName}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            {lastExternalSyncAt && (
              <span>
                Última leitura integrada: <strong>{new Date(lastExternalSyncAt).toLocaleTimeString('pt-BR')}</strong>
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                handlePullIntegratedSystems(systemFilter === 'TODOS' ? undefined : systemFilter)
              }
              disabled={isPullingExternal}
              className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={12} className={isPullingExternal ? 'animate-spin' : ''} />
              Puxar {systemFilter === 'TODOS' ? 'Todos' : ECOSYSTEM_SYSTEM_LABELS[systemFilter].shortName}
            </button>
          </div>
        </div>
      </div>

      {/* TAB: EMPREENDEDOR */}
      {activeTab === 'empreendedores' && (
        <div className="space-y-4">
          {filteredEmpreendedores.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-2">
              <Building2 size={32} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">
                Nenhum empreendedor localizado para o filtro atual.
              </p>
              <p className="text-xs text-slate-400">
                Clique em <strong>Puxar dos Demais Sistemas</strong> para buscar no Classifica e Fiscaliza ou
                cadastre um novo empreendedor aqui.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEmpreendedores.map(({ item: emp, isExternalPreview, alreadyInAdministra }) => {
                const editable = !isExternalPreview && canEditDirectly(emp.sourceSystem);
                const linkedBarragens = barragensByEmpKey.get(`${emp.sourceSystem}-${emp.id}`) || [];
                const linkedProducts = getEmpreendedorEcosystemProducts(emp, linkedBarragens);

                return (
                  <div
                    key={`${isExternalPreview ? 'ext' : 'adm'}-${emp.sourceSystem}-${emp.id}`}
                    className={`bg-white rounded-2xl sm:rounded-3xl border p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 min-w-0 ${
                      isExternalPreview && !alreadyInAdministra ? 'border-sky-300 ring-1 ring-sky-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-3 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[emp.sourceSystem]}`}
                            >
                              {editable ? <ShieldCheck size={11} /> : <Lock size={11} />}
                              Origem: {ECOSYSTEM_SYSTEM_LABELS[emp.sourceSystem].shortName}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                                linkedBarragens.length > 0
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              <Waves size={11} />
                              {linkedBarragens.length > 0
                                ? `Barragem vinculada: Sim (${linkedBarragens.length})`
                                : 'Barragem vinculada: Não (0)'}
                            </span>
                            {isExternalPreview && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                  alreadyInAdministra
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-sky-50 text-sky-700 border border-sky-200'
                                }`}
                              >
                                {alreadyInAdministra ? 'Já vinculado ao Administra' : 'Lido de sistema integrado'}
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-black text-slate-900 mt-1.5">{emp.nome}</h3>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700">
                            {emp.cpfCnpj || 'S/Doc'}
                          </span>
                          <button
                            type="button"
                            title="Ver detalhes, barragens vinculadas e documentos no ecossistema"
                            onClick={() =>
                              setEmpDetailModal({
                                isOpen: true,
                                emp,
                                linkedBarragens,
                                linkedProducts,
                              })
                            }
                            className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">
                            Município/UF
                          </span>
                          <span className="font-bold text-slate-700">
                            {emp.municipio || '---'} / {emp.uf || 'MT'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">CAR/MT</span>
                          <span className="font-bold text-slate-700">{emp.carMt || '---'}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">
                            Barragens Vinculadas
                          </span>
                          <span className="font-bold text-slate-700">
                            {linkedBarragens.length > 0
                              ? `${linkedBarragens.length} ${linkedBarragens.length === 1 ? 'barragem' : 'barragens'}`
                              : 'Nenhuma'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">
                            Docs no Ecossistema
                          </span>
                          <span className="font-bold text-slate-700">
                            {linkedProducts.length > 0 ? `Sim (${linkedProducts.length})` : 'Nenhum (0)'}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="block text-[9px] font-black uppercase text-slate-400">
                            Endereço
                          </span>
                          <span className="font-semibold text-slate-700">
                            {[emp.logradouro, emp.numero, emp.bairro].filter(Boolean).join(', ') || '---'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setEmpDetailModal({
                              isOpen: true,
                              emp,
                              linkedBarragens,
                              linkedProducts,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Eye size={13} /> Detalhes ({linkedBarragens.length} bar • {linkedProducts.length} doc)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setProductsModal({
                              isOpen: true,
                              title: `Documentos e produtos vinculados a ${emp.nome}`,
                              products: linkedProducts,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <FileCheck2 size={13} /> Produtos ({linkedProducts.length})
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {isExternalPreview ? (
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await importEmpreendedorToAdministra(emp);
                              if (!res.success) toast.error(res.message || 'Erro ao puxar empreendedor.');
                              else toast.success(`"${emp.nome}" puxado e salvo na base central do Administra!`);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5"
                          >
                            <Download size={13} /> {alreadyInAdministra ? 'Atualizar no Administra' : 'Puxar para Administra'}
                          </button>
                        ) : editable ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditEmpreendedor(emp)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-bold flex items-center gap-1"
                            >
                              <Edit3 size={13} /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDelete({
                                  isOpen: true,
                                  title: 'Excluir Empreendedor',
                                  message: `Deseja excluir "${emp.nome}" da base local do Administra?`,
                                  onConfirm: async () => {
                                    const res = await deleteEmpreendedor(emp.id);
                                    if (!res.success) toast.error(res.message);
                                    else toast.success('Empreendedor excluído.');
                                  },
                                })
                              }
                              className="px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 text-[11px] font-bold flex items-center gap-1"
                            >
                              <Trash2 size={13} /> Excluir
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setChangeRequestTarget({
                                isOpen: true,
                                targetType: 'EMPREENDEDOR',
                                record: emp,
                              })
                            }
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5"
                          >
                            <GitPullRequest size={13} /> Solicitar Alteração
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: BARRAGEM CADASTRADA */}
      {activeTab === 'barragens' && (
        <div className="space-y-4">
          {filteredBarragens.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-2">
              <Waves size={32} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">
                Nenhuma barragem cadastrada localizada para o filtro atual.
              </p>
              <p className="text-xs text-slate-400">
                Clique em <strong>Puxar dos Demais Sistemas</strong> para buscar barragens no Classifica e Fiscaliza
                ou conclua um documento no Notifica CSB.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredBarragens.map(({ item: bar, isExternalPreview, alreadyInAdministra }) => {
                const editable = !isExternalPreview && canEditDirectly(bar.sourceSystem);
                const linkedEmpreendedor = empreendedorByBarKey.get(`${bar.sourceSystem}-${bar.id}`) || null;
                const linkedEmpName = linkedEmpreendedor?.nome || bar.empreendedorNome || '';
                const linkedEmpDoc = linkedEmpreendedor?.cpfCnpj || bar.empreendedorCpfCnpj || '';
                const linkedProducts = getProductsForEntity({
                  barragemId: bar.id,
                  codigoSnisb: bar.codigoSnisb,
                  nomeBarragem: bar.nomeBarragem,
                });

                return (
                  <div
                    key={`${isExternalPreview ? 'ext' : 'adm'}-${bar.sourceSystem}-${bar.id}`}
                    className={`bg-white rounded-2xl sm:rounded-3xl border p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 min-w-0 ${
                      isExternalPreview && !alreadyInAdministra ? 'border-sky-300 ring-1 ring-sky-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-3 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[bar.sourceSystem]}`}
                            >
                              {editable ? <ShieldCheck size={11} /> : <Lock size={11} />}
                              Origem: {ECOSYSTEM_SYSTEM_LABELS[bar.sourceSystem].shortName}
                            </span>
                            {isExternalPreview && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                  alreadyInAdministra
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-sky-50 text-sky-700 border border-sky-200'
                                }`}
                              >
                                {alreadyInAdministra ? 'Já vinculada ao Administra' : 'Lida de sistema integrado'}
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-black text-slate-900 mt-1.5">
                            {bar.nomeBarragem}
                          </h3>
                          <p className="text-xs font-semibold text-slate-600 mt-0.5 flex items-center gap-1.5">
                            <Building2 size={12} className="text-slate-400 shrink-0" />
                            <span>
                              Empreendedor vinculado:{' '}
                              <strong className={linkedEmpName ? 'text-slate-800' : 'text-slate-400'}>
                                {linkedEmpName || 'Não vinculado'}
                              </strong>
                              {linkedEmpDoc ? ` (${linkedEmpDoc})` : ''}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {bar.codigoSnisb && (
                            <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700">
                              SNISB: {bar.codigoSnisb}
                            </span>
                          )}
                          <button
                            type="button"
                            title="Ver detalhes da barragem, empreendedor vinculado e documentos no ecossistema"
                            onClick={() =>
                              setBarDetailModal({
                                isOpen: true,
                                bar,
                                linkedEmpreendedor,
                                linkedProducts,
                              })
                            }
                            className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">Município</span>
                          <span className="font-bold text-slate-700">{bar.municipio || '---'}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">DPA / CRI</span>
                          <span className="font-bold text-slate-700">
                            {bar.classificacaoDPA || '--'} / {bar.classificacaoCRI || '--'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">
                            Altura / Volume
                          </span>
                          <span className="font-bold text-slate-700">
                            {bar.altura ? `${bar.altura}m` : '--'} / {bar.volume ? `${bar.volume}hm³` : '--'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setBarDetailModal({
                              isOpen: true,
                              bar,
                              linkedEmpreendedor,
                              linkedProducts,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Eye size={13} /> Detalhes
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setProductsModal({
                              isOpen: true,
                              title: `Produtos vinculados à barragem ${bar.nomeBarragem}`,
                              products: linkedProducts,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <FileCheck2 size={13} /> Produtos ({linkedProducts.length})
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {isExternalPreview ? (
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await importBarragemToAdministra(bar);
                              if (!res.success) toast.error(res.message || 'Erro ao puxar barragem.');
                              else toast.success(`Barragem "${bar.nomeBarragem}" puxada e salva no Administra!`);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5"
                          >
                            <Download size={13} /> {alreadyInAdministra ? 'Atualizar no Administra' : 'Puxar para Administra'}
                          </button>
                        ) : editable ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditBarragem(bar)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-bold flex items-center gap-1"
                            >
                              <Edit3 size={13} /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDelete({
                                  isOpen: true,
                                  title: 'Excluir Barragem',
                                  message: `Deseja excluir "${bar.nomeBarragem}" da base local do Administra?`,
                                  onConfirm: async () => {
                                    const res = await deleteBarragem(bar.id);
                                    if (!res.success) toast.error(res.message);
                                    else toast.success('Barragem excluída.');
                                  },
                                })
                              }
                              className="px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 text-[11px] font-bold flex items-center gap-1"
                            >
                              <Trash2 size={13} /> Excluir
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setChangeRequestTarget({
                                isOpen: true,
                                targetType: 'BARRAGEM',
                                record: bar,
                              })
                            }
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5"
                          >
                            <GitPullRequest size={13} /> Solicitar Alteração
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: RESPONSÁVEL TÉCNICO */}
      {activeTab === 'rts' && (
        <div className="space-y-4">
          {filteredRTs.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-2">
              <UserCheck size={32} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">
                Nenhum Responsável Técnico localizado para o filtro atual.
              </p>
              <p className="text-xs text-slate-400">
                Clique em <strong>Puxar dos Demais Sistemas</strong> ou vincule RTs ao salvar Pareceres e Ofícios.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRTs.map(({ item: rt, isExternalPreview, alreadyInAdministra }) => {
                const editable = !isExternalPreview && canEditDirectly(rt.sourceSystem);
                return (
                  <div
                    key={`${isExternalPreview ? 'ext' : 'adm'}-${rt.sourceSystem}-${rt.id}`}
                    className={`bg-white rounded-2xl sm:rounded-3xl border p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4 min-w-0 ${
                      isExternalPreview && !alreadyInAdministra ? 'border-sky-300 ring-1 ring-sky-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[rt.sourceSystem]}`}
                        >
                          {editable ? <ShieldCheck size={11} /> : <Lock size={11} />}
                          Origem: {ECOSYSTEM_SYSTEM_LABELS[rt.sourceSystem].shortName}
                        </span>
                        {isExternalPreview && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                              alreadyInAdministra
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-sky-50 text-sky-700 border border-sky-200'
                            }`}
                          >
                            {alreadyInAdministra ? 'Já no Administra' : 'Sistema integrado'}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-black text-slate-900">{rt.nome}</h3>
                      <p className="text-xs font-bold text-slate-600">
                        {rt.formacaoProfissional || 'Formação não informada'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Registro: <strong>{rt.registroProfissional || '---'}</strong> • CPF:{' '}
                        <strong>{rt.cpf || '---'}</strong>
                      </p>
                      {(rt.art || (rt.artsVinculadas && rt.artsVinculadas.length > 0)) && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {(rt.artsVinculadas && rt.artsVinculadas.length > 0
                            ? rt.artsVinculadas
                            : rt.art
                              ? [{ art: rt.art }]
                              : []
                          )
                            .slice(0, 4)
                            .map((entry, idx) => (
                              <span
                                key={`${rt.id}-art-${idx}`}
                                className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold"
                                title={entry.barragemNome || undefined}
                              >
                                ART: {entry.art}
                                {entry.barragemNome ? ` • ${entry.barragemNome}` : ''}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                      {isExternalPreview ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await importRTToAdministra(rt);
                            if (!res.success) toast.error(res.message || 'Erro ao puxar RT.');
                            else toast.success(`"${rt.nome}" puxado e salvo na base central do Administra!`);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5"
                        >
                          <Download size={13} /> {alreadyInAdministra ? 'Atualizar no Administra' : 'Puxar para Administra'}
                        </button>
                      ) : editable ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditRT(rt)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-bold flex items-center gap-1"
                          >
                            <Edit3 size={13} /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete({
                                isOpen: true,
                                title: 'Excluir Responsável Técnico',
                                message: `Deseja excluir "${rt.nome}" da base local do Administra?`,
                                onConfirm: async () => {
                                  const res = await deleteResponsavelTecnico(rt.id);
                                  if (!res.success) toast.error(res.message);
                                  else toast.success('Responsável Técnico excluído.');
                                },
                              })
                            }
                            className="px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 text-[11px] font-bold flex items-center gap-1"
                          >
                            <Trash2 size={13} /> Excluir
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setChangeRequestTarget({
                              isOpen: true,
                              targetType: 'RESPONSAVEL_TECNICO',
                              record: rt,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5"
                        >
                          <GitPullRequest size={13} /> Solicitar Alteração
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: SOLICITAÇÕES & INTEGRAÇÃO */}
      {activeTab === 'integracao' && (
        <div className="space-y-8">
          {/* Ecosystem Systems Topology */}
          <div className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Globe size={15} className="text-emerald-600" /> Sistemas do Ecossistema CSB &amp; Leitura Remota
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {connections.map((conn) => {
                const diag = remoteDiagnostics[conn.systemId];
                return (
                  <div
                    key={conn.systemId}
                    className={`p-5 rounded-3xl border shadow-xs flex flex-col justify-between gap-3 ${
                      conn.isCurrentSystem
                        ? 'bg-emerald-50/60 border-emerald-300'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[conn.systemId]}`}
                        >
                          {conn.systemId}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            diag?.authDenied
                              ? 'bg-amber-100 text-amber-800'
                              : conn.mode === 'remote-configured'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {diag?.authDenied
                            ? 'Requer Permissão / Chave'
                            : conn.mode === 'remote-configured'
                              ? 'Integração Ativa'
                              : 'Chave Pendente'}
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-slate-900">{conn.name}</h3>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{conn.role}</p>

                      {diag && diag.remoteConfigured && (
                        <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-700 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Empreendedores lidos:</span>
                            <strong>{diag.empreendedoresCount}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Barragens lidas:</span>
                            <strong>{diag.barragensCount}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>RTs lidos:</span>
                            <strong>{diag.rtsCount}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Produtos/Docs lidos:</span>
                            <strong>{diag.productsCount}</strong>
                          </div>
                        </div>
                      )}

                      {diag?.authDenied && (
                        <div className="mt-2 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-1.5">
                          <AlertCircle size={13} className="shrink-0 mt-0.5" />
                          <span>Leitura bloqueada por RLS. Configure a chave Service Role no servidor.</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-500">
                        {conn.isCurrentSystem ? 'Escrita direta local' : 'Leitura federada'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePullIntegratedSystems(conn.systemId)}
                        disabled={isPullingExternal || conn.mode !== 'remote-configured'}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                      >
                        Ler Agora
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Products read from Administra catalog / Classifica / Fiscaliza */}
          <div id="ecosystem-products-section" className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <FileCheck2 size={15} className="text-sky-600" /> Documentos &amp; Produtos Catalogados no Ecossistema ({filteredExternalProducts.length})
            </h2>
            {filteredExternalProducts.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-8 text-center space-y-2">
                <p className="text-sm font-bold text-slate-600">
                  Nenhum documento externo lido dos sistemas integrados no momento.
                </p>
                <p className="text-xs text-slate-400">
                  Use <strong>Puxar dos Demais Sistemas</strong> após configurar as credenciais de acesso dos
                  sistemas Classifica e Fiscaliza nas variáveis de ambiente do servidor.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredExternalProducts.slice(0, 150).map((prod, idx) => (
                  <div
                    key={`${prod.systemId}-${prod.id}-${idx}`}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[prod.systemId]}`}
                      >
                        {ECOSYSTEM_SYSTEM_LABELS[prod.systemId].shortName}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {prod.dataEmissao || 'Sem data'}
                      </span>
                    </div>
                    <p className="text-xs font-black text-slate-900">
                      {prod.tipoDocumento} {prod.numeroDocumento ? `• ${prod.numeroDocumento}` : ''}
                    </p>
                    {prod.empreendedorNome && (
                      <p className="text-[11px] text-slate-600 truncate">
                        Empreendedor: <strong>{prod.empreendedorNome}</strong>
                      </p>
                    )}
                    {prod.barragemNome && (
                      <p className="text-[11px] text-slate-600 truncate">
                        Barragem: <strong>{prod.barragemNome}</strong>
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500">
                      Processo: <strong>{prod.processo || '---'}</strong> • Status: <strong>{prod.status || '---'}</strong>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Change Requests Queue */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <GitPullRequest size={15} className="text-amber-600" /> Fila de Solicitações de Alteração
              </h2>
              <div className="flex gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                {(['TODAS', 'PENDENTE', 'APROVADA', 'REPROVADA'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setRequestStatusFilter(status)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${
                      requestStatusFilter === status
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center space-y-2">
                <GitPullRequest size={28} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-600">
                  Nenhuma solicitação de alteração registrada.
                </p>
                <p className="text-xs text-slate-400">
                  Quando um analista solicitar alteração em um registro pertencente a outro sistema,
                  a solicitação aparecerá aqui para aprovação ou reprovação pelo sistema de origem.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((req) => {
                  const canReview =
                    req.status === 'PENDENTE' && req.targetOwnerSystem === CURRENT_SYSTEM_ID;
                  const proposedKeys = Object.keys(req.proposedChanges || {});

                  return (
                    <div
                      key={req.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                                req.status === 'PENDENTE'
                                  ? 'bg-amber-100 text-amber-800'
                                  : req.status === 'APROVADA'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {req.status}
                            </span>
                            <span className="text-[10px] font-black uppercase text-slate-500">
                              {req.targetType}
                            </span>
                            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                              {ECOSYSTEM_SYSTEM_LABELS[req.requestingSystem].shortName}
                              <ArrowRight size={11} />
                              {ECOSYSTEM_SYSTEM_LABELS[req.targetOwnerSystem].shortName}
                            </span>
                          </div>
                          <h3 className="text-base font-black text-slate-900">{req.targetLabel}</h3>
                          <p className="text-xs text-slate-500">
                            Solicitado por <strong>{req.requestedByName}</strong> em{' '}
                            {new Date(req.createdAt).toLocaleString('pt-BR')}
                          </p>
                        </div>

                        {req.status === 'PENDENTE' && !canReview && (
                          <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                            Aguardando analista/adm de{' '}
                            {ECOSYSTEM_SYSTEM_LABELS[req.targetOwnerSystem].name}
                          </span>
                        )}
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                        <strong className="uppercase text-[10px] tracking-wider text-slate-500 block mb-1">
                          Justificativa Técnica:
                        </strong>
                        {req.justification}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {proposedKeys.map((key) => (
                          <div
                            key={key}
                            className="p-3 rounded-2xl border border-slate-200 bg-white text-xs space-y-1"
                          >
                            <span className="text-[10px] font-black uppercase text-slate-400 block">
                              {key}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="line-through text-rose-600">
                                {String(req.currentSnapshot?.[key] || '(vazio)')}
                              </span>
                              <ArrowRight size={12} className="text-emerald-600" />
                              <span className="font-bold text-emerald-700">
                                {String(req.proposedChanges?.[key] || '(vazio)')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {req.status !== 'PENDENTE' && (
                        <div className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                          Analisado por <strong>{req.reviewedByName}</strong>
                          {req.reviewedAt
                            ? ` em ${new Date(req.reviewedAt).toLocaleString('pt-BR')}`
                            : ''}
                          {req.reviewNotes ? ` — Observação: "${req.reviewNotes}"` : ''}
                        </div>
                      )}

                      {canReview && (
                        <div className="pt-3 border-t border-slate-100 space-y-3">
                          {reviewingRequestId === req.id ? (
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <input
                                  type="text"
                                  list="reviewers-datalist"
                                  value={reviewerName}
                                  onChange={(e) => setReviewerName(e.target.value)}
                                  placeholder="Nome do analista/adm revisor *"
                                  className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                                />
                                <datalist id="reviewers-datalist">
                                  {OPS_ANALISTA.map((a) => (
                                    <option key={a} value={a} />
                                  ))}
                                </datalist>
                                <input
                                  type="text"
                                  value={reviewNotes}
                                  onChange={(e) => setReviewNotes(e.target.value)}
                                  placeholder="Parecer / observação da análise (opcional)"
                                  className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                                />
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setReviewingRequestId(null)}
                                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 bg-white"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewSubmit(req, 'REPROVADA')}
                                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                                >
                                  <XCircle size={13} /> Reprovar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewSubmit(req, 'APROVADA')}
                                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                                >
                                  <CheckCircle2 size={13} /> Aprovar Alteração
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setReviewingRequestId(req.id)}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider"
                              >
                                Analisar (Aprovar / Reprovar)
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: PRODUCTS LINKED */}
      {productsModal.isOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-black text-sm tracking-tight">{productsModal.title}</h3>
              <button
                type="button"
                onClick={() => setProductsModal({ isOpen: false, title: '', products: [] })}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {productsModal.products.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  Nenhum produto localizado no ecossistema para este registro até o momento.
                </p>
              ) : (
                productsModal.products.map((prod, idx) => (
                  <div
                    key={`${prod.systemId}-${prod.id}-${idx}`}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[prod.systemId]}`}
                      >
                        {ECOSYSTEM_SYSTEM_LABELS[prod.systemId].name}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {prod.dataEmissao || 'Sem data'}
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-900">
                      {prod.tipoDocumento} {prod.numeroDocumento ? `• ${prod.numeroDocumento}` : ''}
                    </p>
                    <p className="text-xs text-slate-600">
                      Processo: <strong>{prod.processo || '---'}</strong> • Status:{' '}
                      <strong>{prod.status || '---'}</strong>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EMPREENDEDOR DETAILS (BARRAGENS + DOCUMENTOS NO ECOSSISTEMA) */}
      {empDetailModal.isOpen && empDetailModal.emp && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                  Detalhes do Empreendedor
                </span>
                <h3 className="font-black text-base tracking-tight truncate">{empDetailModal.emp.nome}</h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEmpDetailModal({ isOpen: false, emp: null, linkedBarragens: [], linkedProducts: [] })
                }
                className="p-1.5 text-slate-400 hover:text-white rounded-lg shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Empreendedor info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="block text-[9px] font-black uppercase text-slate-400">CPF / CNPJ</span>
                  <span className="font-bold text-slate-800">{empDetailModal.emp.cpfCnpj || '---'}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black uppercase text-slate-400">Município / UF</span>
                  <span className="font-bold text-slate-800">
                    {empDetailModal.emp.municipio || '---'} / {empDetailModal.emp.uf || 'MT'}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-black uppercase text-slate-400">CAR / MT</span>
                  <span className="font-bold text-slate-800 break-words">{empDetailModal.emp.carMt || '---'}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black uppercase text-slate-400">Telefone</span>
                  <span className="font-bold text-slate-800">{empDetailModal.emp.telefone || '---'}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black uppercase text-slate-400">E-mail</span>
                  <span className="font-bold text-slate-800 break-all">{empDetailModal.emp.email || '---'}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black uppercase text-slate-400">Sistema Origem</span>
                  <span className="font-bold text-slate-800">
                    {ECOSYSTEM_SYSTEM_LABELS[empDetailModal.emp.sourceSystem].shortName}
                  </span>
                </div>
                <div className="sm:col-span-2 md:col-span-3">
                  <span className="block text-[9px] font-black uppercase text-slate-400">Endereço Completo</span>
                  <span className="font-semibold text-slate-700">
                    {[
                      empDetailModal.emp.logradouro,
                      empDetailModal.emp.numero,
                      empDetailModal.emp.complemento,
                      empDetailModal.emp.bairro,
                      empDetailModal.emp.cep ? `CEP: ${empDetailModal.emp.cep}` : '',
                    ]
                      .filter(Boolean)
                      .join(', ') || '---'}
                  </span>
                </div>
              </div>

              {/* Linked Dams */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                    <Waves size={15} className="text-emerald-600" /> Barragens Vinculadas ({empDetailModal.linkedBarragens.length})
                  </h4>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                      empDetailModal.linkedBarragens.length > 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {empDetailModal.linkedBarragens.length > 0 ? 'Possui vínculo' : 'Sem barragem vinculada'}
                  </span>
                </div>

                {empDetailModal.linkedBarragens.length === 0 ? (
                  <div className="p-5 rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    Nenhuma barragem cadastrada vinculada a este empreendedor.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {empDetailModal.linkedBarragens.map((bar) => (
                      <div
                        key={`detail-bar-${bar.sourceSystem}-${bar.id}`}
                        className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-black text-slate-900">{bar.nomeBarragem}</p>
                          <div className="flex items-center gap-1.5">
                            {bar.codigoSnisb && (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-700">
                                SNISB: {bar.codigoSnisb}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[bar.sourceSystem]}`}
                            >
                              {ECOSYSTEM_SYSTEM_LABELS[bar.sourceSystem].shortName}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                          <div>
                            <span className="block text-[9px] font-black uppercase text-slate-400">Município</span>
                            <strong className="text-slate-800">{bar.municipio || '---'}</strong>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black uppercase text-slate-400">Curso d&apos;Água</span>
                            <strong className="text-slate-800">{bar.cursoAguaBarrado || '---'}</strong>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black uppercase text-slate-400">DPA / CRI</span>
                            <strong className="text-slate-800">
                              {bar.classificacaoDPA || '--'} / {bar.classificacaoCRI || '--'}
                            </strong>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black uppercase text-slate-400">Altura / Volume</span>
                            <strong className="text-slate-800">
                              {bar.altura ? `${bar.altura}m` : '--'} / {bar.volume ? `${bar.volume}hm³` : '--'}
                            </strong>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black uppercase text-slate-400">Processo</span>
                            <strong className="text-slate-800">{bar.processoReferencia || '---'}</strong>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black uppercase text-slate-400">Situação</span>
                            <strong className="text-slate-800">{bar.situacaoEmpreendimento || '---'}</strong>
                          </div>
                          <div className="col-span-2">
                            <span className="block text-[9px] font-black uppercase text-slate-400">Coordenadas GMS</span>
                            <strong className="text-slate-800">
                              {bar.coordenadasGMS
                                ? `${bar.coordenadasGMS.lat.g}°${bar.coordenadasGMS.lat.m}'${bar.coordenadasGMS.lat.s}"S • ${bar.coordenadasGMS.long.g}°${bar.coordenadasGMS.long.m}'${bar.coordenadasGMS.long.s}"W`
                                : '---'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Linked Ecosystem Documents */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                    <FileText size={15} className="text-sky-600" /> Documentos Emitidos nos Ecossistemas ({empDetailModal.linkedProducts.length})
                  </h4>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                      empDetailModal.linkedProducts.length > 0
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {empDetailModal.linkedProducts.length > 0 ? 'Possui documentos emitidos' : 'Sem documentos'}
                  </span>
                </div>

                {empDetailModal.linkedProducts.length === 0 ? (
                  <div className="p-5 rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    Nenhum documento emitido localizado nos sistemas do ecossistema para este empreendedor ou suas barragens.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {empDetailModal.linkedProducts.map((prod, idx) => (
                      <div
                        key={`emp-prod-${prod.systemId}-${prod.id}-${idx}`}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[prod.systemId]}`}
                          >
                            {ECOSYSTEM_SYSTEM_LABELS[prod.systemId].name}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500">
                            {prod.dataEmissao || 'Sem data'}
                          </span>
                        </div>
                        <p className="text-xs font-black text-slate-900">
                          {prod.tipoDocumento} {prod.numeroDocumento ? `• ${prod.numeroDocumento}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Processo: <strong>{prod.processo || '---'}</strong> • Status:{' '}
                          <strong>{prod.status || '---'}</strong>
                          {prod.barragemNome ? ` • Barragem: ${prod.barragemNome}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BARRAGEM DETAILS (DADOS TÉCNICOS + EMPREENDEDOR VINCULADO + DOCUMENTOS) */}
      {barDetailModal.isOpen && barDetailModal.bar && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                  Detalhes da Barragem Cadastrada
                </span>
                <h3 className="font-black text-base tracking-tight truncate">{barDetailModal.bar.nomeBarragem}</h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBarDetailModal({
                    isOpen: false,
                    bar: null,
                    linkedEmpreendedor: null,
                    linkedProducts: [],
                  })
                }
                className="p-1.5 text-slate-400 hover:text-white rounded-lg shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
              {/* Linked Empreendedor */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                  <Building2 size={15} className="text-indigo-600" /> Empreendedor Vinculado
                </h4>
                {barDetailModal.linkedEmpreendedor || barDetailModal.bar.empreendedorNome ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200 text-xs">
                    <div className="sm:col-span-2">
                      <span className="block text-[9px] font-black uppercase text-slate-400">Nome / Razão Social</span>
                      <span className="font-black text-slate-900">
                        {barDetailModal.linkedEmpreendedor?.nome || barDetailModal.bar.empreendedorNome}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black uppercase text-slate-400">CPF / CNPJ</span>
                      <span className="font-bold text-slate-800">
                        {barDetailModal.linkedEmpreendedor?.cpfCnpj || barDetailModal.bar.empreendedorCpfCnpj || '---'}
                      </span>
                    </div>
                    {barDetailModal.linkedEmpreendedor && (
                      <>
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">Município / UF</span>
                          <span className="font-bold text-slate-800">
                            {barDetailModal.linkedEmpreendedor.municipio || '---'} /{' '}
                            {barDetailModal.linkedEmpreendedor.uf || 'MT'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">CAR / MT</span>
                          <span className="font-bold text-slate-800 break-words">
                            {barDetailModal.linkedEmpreendedor.carMt || '---'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">Telefone</span>
                          <span className="font-bold text-slate-800">
                            {barDetailModal.linkedEmpreendedor.telefone || '---'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500">
                    Nenhum empreendedor vinculado a esta barragem.
                  </div>
                )}
              </div>

              {/* Technical Info of Barragem */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                  <Waves size={15} className="text-emerald-600" /> Características da Barragem
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">Código SNISB</span>
                    <span className="font-bold text-slate-800">{barDetailModal.bar.codigoSnisb || '---'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">Município / UF</span>
                    <span className="font-bold text-slate-800">
                      {barDetailModal.bar.municipio || '---'} / {barDetailModal.bar.uf || 'MT'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">Processo</span>
                    <span className="font-bold text-slate-800">{barDetailModal.bar.processoReferencia || '---'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">Curso d&apos;Água Barrado</span>
                    <span className="font-bold text-slate-800">{barDetailModal.bar.cursoAguaBarrado || '---'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">Tipo / Uso</span>
                    <span className="font-bold text-slate-800">
                      {barDetailModal.bar.tipoBarragem || '--'} / {barDetailModal.bar.usoPreponderante || '--'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">Situação</span>
                    <span className="font-bold text-slate-800">
                      {barDetailModal.bar.situacaoEmpreendimento || '---'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">Altura / Volume</span>
                    <span className="font-bold text-slate-800">
                      {barDetailModal.bar.altura ? `${barDetailModal.bar.altura}m` : '--'} /{' '}
                      {barDetailModal.bar.volume ? `${barDetailModal.bar.volume}hm³` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">DPA / CRI</span>
                    <span className="font-bold text-slate-800">
                      {barDetailModal.bar.classificacaoDPA || '--'} / {barDetailModal.bar.classificacaoCRI || '--'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400">Portaria / Parecer Classif.</span>
                    <span className="font-bold text-slate-800">
                      {barDetailModal.bar.portariaClassificacao || '--'} /{' '}
                      {barDetailModal.bar.parecerClassificacao || '--'}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <span className="block text-[9px] font-black uppercase text-slate-400">Coordenadas GMS</span>
                    <span className="font-bold text-slate-800">
                      {barDetailModal.bar.coordenadasGMS
                        ? `${barDetailModal.bar.coordenadasGMS.lat.g}°${barDetailModal.bar.coordenadasGMS.lat.m}'${barDetailModal.bar.coordenadasGMS.lat.s}"S • ${barDetailModal.bar.coordenadasGMS.long.g}°${barDetailModal.bar.coordenadasGMS.long.m}'${barDetailModal.bar.coordenadasGMS.long.s}"W`
                        : '---'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Linked Ecosystem Documents */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                    <FileText size={15} className="text-sky-600" /> Documentos Emitidos nos Ecossistemas ({barDetailModal.linkedProducts.length})
                  </h4>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                      barDetailModal.linkedProducts.length > 0
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {barDetailModal.linkedProducts.length > 0 ? 'Possui documentos emitidos' : 'Sem documentos'}
                  </span>
                </div>

                {barDetailModal.linkedProducts.length === 0 ? (
                  <div className="p-5 rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    Nenhum documento emitido localizado nos sistemas do ecossistema para esta barragem.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {barDetailModal.linkedProducts.map((prod, idx) => (
                      <div
                        key={`bar-prod-${prod.systemId}-${prod.id}-${idx}`}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[prod.systemId]}`}
                          >
                            {ECOSYSTEM_SYSTEM_LABELS[prod.systemId].name}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500">
                            {prod.dataEmissao || 'Sem data'}
                          </span>
                        </div>
                        <p className="text-xs font-black text-slate-900">
                          {prod.tipoDocumento} {prod.numeroDocumento ? `• ${prod.numeroDocumento}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Processo: <strong>{prod.processo || '---'}</strong> • Status:{' '}
                          <strong>{prod.status || '---'}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT EMPREENDEDOR */}
      {empModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-black text-base">
                {empForm.id ? 'Editar Empreendedor (Administra)' : 'Novo Empreendedor (Administra)'}
              </h3>
              <button
                type="button"
                onClick={() => setEmpModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveEmpreendedor} className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Nome / Razão Social *</label>
                <input
                  type="text"
                  required
                  value={empForm.nome}
                  onChange={(e) => setEmpForm((p) => ({ ...p, nome: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">CPF / CNPJ</label>
                <input
                  type="text"
                  value={empForm.cpfCnpj}
                  onChange={(e) => setEmpForm((p) => ({ ...p, cpfCnpj: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">CAR/MT</label>
                <input
                  type="text"
                  value={empForm.carMt}
                  onChange={(e) => setEmpForm((p) => ({ ...p, carMt: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Telefone</label>
                <input
                  type="text"
                  value={empForm.telefone}
                  onChange={(e) => setEmpForm((p) => ({ ...p, telefone: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Município</label>
                <select
                  value={empForm.municipio}
                  onChange={(e) => setEmpForm((p) => ({ ...p, municipio: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold bg-white"
                >
                  {OPS_MUNICIPIOS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Logradouro</label>
                <input
                  type="text"
                  value={empForm.logradouro}
                  onChange={(e) => setEmpForm((p) => ({ ...p, logradouro: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Bairro</label>
                <input
                  type="text"
                  value={empForm.bairro}
                  onChange={(e) => setEmpForm((p) => ({ ...p, bairro: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">CEP</label>
                <input
                  type="text"
                  value={empForm.cep}
                  onChange={(e) => setEmpForm((p) => ({ ...p, cep: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEmpModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider"
                >
                  Salvar no Administra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT BARRAGEM */}
      {barModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-black text-base">
                {barForm.id ? 'Editar Barragem (Administra)' : 'Nova Barragem (Administra)'}
              </h3>
              <button
                type="button"
                onClick={() => setBarModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveBarragem} className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Empreendedor Vinculado</label>
                <select
                  value={barForm.empreendedorId}
                  onChange={(e) => setBarForm((p) => ({ ...p, empreendedorId: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold bg-white"
                >
                  <option value="">Sem vínculo específico</option>
                  {empreendedores.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome} {emp.cpfCnpj ? `(${emp.cpfCnpj})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">
                  Nome da Barragem / Empreendimento *
                </label>
                <input
                  type="text"
                  required
                  value={barForm.nomeBarragem}
                  onChange={(e) => setBarForm((p) => ({ ...p, nomeBarragem: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Código SNISB</label>
                <input
                  type="text"
                  value={barForm.codigoSnisb}
                  onChange={(e) => setBarForm((p) => ({ ...p, codigoSnisb: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Município</label>
                <select
                  value={barForm.municipio}
                  onChange={(e) => setBarForm((p) => ({ ...p, municipio: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold bg-white"
                >
                  {OPS_MUNICIPIOS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Uso Preponderante</label>
                <select
                  value={barForm.usoPreponderante}
                  onChange={(e) => setBarForm((p) => ({ ...p, usoPreponderante: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold bg-white"
                >
                  <option value="">Selecione...</option>
                  {OPS_USO_PREPONDERANTE.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Tipo de Barragem</label>
                <select
                  value={barForm.tipoBarragem}
                  onChange={(e) => setBarForm((p) => ({ ...p, tipoBarragem: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold bg-white"
                >
                  <option value="">Selecione...</option>
                  {OPS_TIPO_BARRAGEM.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Altura (m)</label>
                <input
                  type="text"
                  value={barForm.altura}
                  onChange={(e) => setBarForm((p) => ({ ...p, altura: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Volume (hm³)</label>
                <input
                  type="text"
                  value={barForm.volume}
                  onChange={(e) => setBarForm((p) => ({ ...p, volume: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setBarModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider"
                >
                  Salvar no Administra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT RT */}
      {rtModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-black text-base">
                {rtForm.id ? 'Editar Responsável Técnico' : 'Novo Responsável Técnico'}
              </h3>
              <button
                type="button"
                onClick={() => setRtModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveRT} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={rtForm.nome}
                  onChange={(e) => setRtForm((p) => ({ ...p, nome: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Registro CREA / CFT</label>
                <input
                  type="text"
                  value={rtForm.registroProfissional}
                  onChange={(e) => setRtForm((p) => ({ ...p, registroProfissional: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">Formação Profissional</label>
                <input
                  type="text"
                  value={rtForm.formacaoProfissional}
                  onChange={(e) => setRtForm((p) => ({ ...p, formacaoProfissional: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-600">CPF</label>
                <input
                  type="text"
                  value={rtForm.cpf}
                  onChange={(e) => setRtForm((p) => ({ ...p, cpf: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRtModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider"
                >
                  Salvar no Administra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ChangeRequestModal
        isOpen={changeRequestTarget.isOpen}
        onClose={() => setChangeRequestTarget((prev) => ({ ...prev, isOpen: false }))}
        targetType={changeRequestTarget.targetType}
        record={changeRequestTarget.record}
      />

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title={confirmDelete.title}
        message={confirmDelete.message}
        variant="danger"
        confirmLabel="Excluir"
        onConfirm={() => {
          void confirmDelete.onConfirm();
        }}
        onClose={() => setConfirmDelete((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
