import React, { useContext, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  Edit3,
  FileCheck2,
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
  EcosystemSystemId,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import { OPS_ANALISTA, OPS_MUNICIPIOS, OPS_TIPO_BARRAGEM, OPS_USO_PREPONDERANTE } from '../constants';
import { formatCpfCnpj, isValidCpfCnpj, normalizeDocumentNumber } from '../lib/security';
import { ChangeRequestModal } from '../components/ecosystem/ChangeRequestModal';
import ConfirmModal from '../components/ui/ConfirmModal';

type TabId = 'empreendedores' | 'barragens' | 'rts' | 'integracao';

const SYSTEM_BADGE_CLASSES: Record<EcosystemSystemId, string> = {
  ADMINISTRA: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  CLASSIFICA: 'bg-sky-100 text-sky-800 border-sky-200',
  NOTIFICA: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FISCALIZA: 'bg-amber-100 text-amber-800 border-amber-200',
};

export const EcossistemaAdministra: React.FC = () => {
  const {
    empreendedores,
    barragens,
    responsaveisTecnicos,
    changeRequests,
    allEcosystemProducts,
    connections,
    pendingIncomingCount,
    loading,
    refreshEcosystem,
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
  const [searchTerm, setSearchTerm] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'TODAS' | 'PENDENTE' | 'APROVADA' | 'REPROVADA'>('TODAS');
  const [isSyncingExisting, setIsSyncingExisting] = useState(false);

  // Selected entity for viewing linked products across the ecosystem
  const [productsModal, setProductsModal] = useState<{
    isOpen: boolean;
    title: string;
    products: EcosystemProductSummary[];
  }>({ isOpen: false, title: '', products: [] });

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

  const filteredEmpreendedores = useMemo(() => {
    const raw = searchTerm.trim();
    if (!raw) return empreendedores;
    const q = raw.toLowerCase();
    const digits = normalizeDocumentNumber(raw);
    const carQ = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return empreendedores.filter(
      (e) =>
        (e.nome || '').toLowerCase().includes(q) ||
        (e.cpfCnpj || '').toLowerCase().includes(q) ||
        (digits.length >= 2 && (e.cpfCnpjNormalizado || '').includes(digits)) ||
        (e.municipio || '').toLowerCase().includes(q) ||
        (e.carMt || '').toLowerCase().includes(q) ||
        (carQ.length >= 3 && (e.carMt || '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes(carQ))
    );
  }, [empreendedores, searchTerm]);

  const filteredBarragens = useMemo(() => {
    const raw = searchTerm.trim();
    if (!raw) return barragens;
    const q = raw.toLowerCase();
    const digits = normalizeDocumentNumber(raw);
    return barragens.filter(
      (b) =>
        (b.nomeBarragem || '').toLowerCase().includes(q) ||
        (b.codigoSnisb || '').toLowerCase().includes(q) ||
        (b.municipio || '').toLowerCase().includes(q) ||
        (b.empreendedorNome || '').toLowerCase().includes(q) ||
        (digits.length >= 2 && normalizeDocumentNumber(b.empreendedorCpfCnpj || '').includes(digits))
    );
  }, [barragens, searchTerm]);

  const filteredRTs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return responsaveisTecnicos;
    return responsaveisTecnicos.filter(
      (rt) =>
        (rt.nome || '').toLowerCase().includes(q) ||
        (rt.registroProfissional || '').toLowerCase().includes(q) ||
        (rt.formacaoProfissional || '').toLowerCase().includes(q)
    );
  }, [responsaveisTecnicos, searchTerm]);

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

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      {/* Top Banner */}
      <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-widest rounded-lg">
                Arquitetura Federada CSB
              </span>
              <span className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded-lg">
                Operação Integrada • Base Central CSB
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Ecossistema CSB &amp; Base <span className="text-emerald-400">Administra Barragens</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Consulta unificada de <strong>Empreendedores</strong>, <strong>Barragens</strong>,{' '}
              <strong>Responsáveis Técnicos</strong> e produtos gerados nos sistemas{' '}
              <strong>Administra</strong>, <strong>Classifica</strong>, <strong>Notifica</strong> e{' '}
              <strong>Fiscaliza</strong>. Registros de outros sistemas são protegidos contra edição
              direta e utilizam fluxo formal de solicitação de alteração.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
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

        {/* Summary Counters */}
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-3.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Empreendedores</p>
            <p className="text-2xl font-black text-white mt-0.5">{empreendedores.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-3.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Barragens</p>
            <p className="text-2xl font-black text-white mt-0.5">{barragens.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-3.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resp. Técnicos</p>
            <p className="text-2xl font-black text-white mt-0.5">{responsaveisTecnicos.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-3.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Produtos no Ecossistema
            </p>
            <p className="text-2xl font-black text-emerald-400 mt-0.5">{allEcosystemProducts.length}</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('empreendedores')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
              activeTab === 'empreendedores'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 size={14} /> Empreendedores ({empreendedores.length})
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
            <Waves size={14} /> Barragens ({barragens.length})
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
            <UserCheck size={14} /> RTs ({responsaveisTecnicos.length})
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

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-72">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar registros..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-emerald-600 outline-none shadow-xs"
            />
          </div>

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

      {/* TAB: EMPREENDEDORES */}
      {activeTab === 'empreendedores' && (
        <div className="space-y-4">
          {filteredEmpreendedores.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-2">
              <Building2 size={32} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">
                Nenhum empreendedor registrado na base local do Administra.
              </p>
              <p className="text-xs text-slate-400">
                Cadastre um novo empreendedor aqui ou salve um Parecer, Ofício ou Notificação para
                alimentar a base automaticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEmpreendedores.map((emp) => {
                const editable = canEditDirectly(emp.sourceSystem);
                const linkedProducts = getProductsForEntity({
                  empreendedorId: emp.id,
                  cpfCnpj: emp.cpfCnpj,
                });

                return (
                  <div
                    key={emp.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[emp.sourceSystem]}`}
                          >
                            {editable ? <ShieldCheck size={11} /> : <Lock size={11} />}
                            Origem: {ECOSYSTEM_SYSTEM_LABELS[emp.sourceSystem].shortName}
                          </span>
                          <h3 className="text-base font-black text-slate-900 mt-1.5">{emp.nome}</h3>
                        </div>
                        <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700 shrink-0">
                          {emp.cpfCnpj || 'S/Doc'}
                        </span>
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
                      <button
                        type="button"
                        onClick={() =>
                          setProductsModal({
                            isOpen: true,
                            title: `Produtos vinculados a ${emp.nome}`,
                            products: linkedProducts,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <FileCheck2 size={13} /> Produtos ({linkedProducts.length})
                      </button>

                      <div className="flex items-center gap-2">
                        {editable ? (
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

      {/* TAB: BARRAGENS */}
      {activeTab === 'barragens' && (
        <div className="space-y-4">
          {filteredBarragens.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-2">
              <Waves size={32} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">
                Nenhuma barragem registrada na base local do Administra.
              </p>
              <p className="text-xs text-slate-400">
                Cadastre uma barragem ou conclua um documento no Notifica CSB para registrar
                automaticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredBarragens.map((bar) => {
                const editable = canEditDirectly(bar.sourceSystem);
                const linkedProducts = getProductsForEntity({
                  barragemId: bar.id,
                  codigoSnisb: bar.codigoSnisb,
                  nomeBarragem: bar.nomeBarragem,
                });

                return (
                  <div
                    key={bar.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[bar.sourceSystem]}`}
                          >
                            {editable ? <ShieldCheck size={11} /> : <Lock size={11} />}
                            Origem: {ECOSYSTEM_SYSTEM_LABELS[bar.sourceSystem].shortName}
                          </span>
                          <h3 className="text-base font-black text-slate-900 mt-1.5">
                            {bar.nomeBarragem}
                          </h3>
                          {bar.empreendedorNome && (
                            <p className="text-xs font-semibold text-slate-500">
                              Empreendedor: {bar.empreendedorNome}
                            </p>
                          )}
                        </div>
                        {bar.codigoSnisb && (
                          <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700 shrink-0">
                            SNISB: {bar.codigoSnisb}
                          </span>
                        )}
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

                      <div className="flex items-center gap-2">
                        {editable ? (
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

      {/* TAB: RESPONSÁVEIS TÉCNICOS */}
      {activeTab === 'rts' && (
        <div className="space-y-4">
          {filteredRTs.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-2">
              <UserCheck size={32} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">
                Nenhum Responsável Técnico registrado na base local do Administra.
              </p>
              <p className="text-xs text-slate-400">
                Cadastre manualmente aqui ou vincule RTs ao salvar Pareceres e Ofícios.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRTs.map((rt) => {
                const editable = canEditDirectly(rt.sourceSystem);
                return (
                  <div
                    key={rt.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[rt.sourceSystem]}`}
                      >
                        {editable ? <ShieldCheck size={11} /> : <Lock size={11} />}
                        Origem: {ECOSYSTEM_SYSTEM_LABELS[rt.sourceSystem].shortName}
                      </span>
                      <h3 className="text-base font-black text-slate-900">{rt.nome}</h3>
                      <p className="text-xs font-bold text-slate-600">
                        {rt.formacaoProfissional || 'Formação não informada'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Registro: <strong>{rt.registroProfissional || '---'}</strong> • CPF:{' '}
                        <strong>{rt.cpf || '---'}</strong>
                      </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                      {editable ? (
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
              <Globe size={15} className="text-emerald-600" /> Sistemas do Ecossistema CSB
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {connections.map((conn) => (
                <div
                  key={conn.systemId}
                  className={`p-5 rounded-3xl border shadow-xs ${
                    conn.isCurrentSystem
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${SYSTEM_BADGE_CLASSES[conn.systemId]}`}
                    >
                      {conn.systemId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        conn.mode === 'remote-configured'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {conn.mode === 'remote-configured' ? 'Integração Ativa' : 'Base Local'}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-slate-900">{conn.name}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{conn.role}</p>
                  <p className="text-[10px] font-bold text-slate-500 mt-3 pt-2 border-t border-slate-200/70">
                    {conn.isCurrentSystem
                      ? 'Escrita direta de produtos + registros criados no Notifica'
                      : 'Leitura federada + solicitação de alteração para modificações'}
                  </p>
                </div>
              ))}
            </div>
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
                productsModal.products.map((prod) => (
                  <div
                    key={`${prod.systemId}-${prod.id}`}
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
