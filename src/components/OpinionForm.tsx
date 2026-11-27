import React, { useState, useEffect, useContext, useMemo } from 'react';
import { 
  Save, Download, ArrowLeft, FileText, Plus, PlusCircle, Trash2, X, CheckCircle, CheckCircle2, Loader2, 
  Database, Info, ChevronRight, ChevronLeft, MapPin, ClipboardList, Shield, AlertTriangle,
  ChevronDown, ChevronUp, Check, Search, User, ShieldCheck, Users, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { 
  OPS_MUNICIPIOS, OPS_ANALISTA, OPS_RESPONSAVEL_TECNICO, OPS_DPA1_VOLUME,
  OPS_USO_PREPONDERANTE, OPS_SITUACAO_EMPREENDIMENTO, OPS_TIPO_BARRAGEM,
  OPS_CLASSIFICACAO_DPA, OPS_CLASSIFICACAO_CRI
} from '../constants';
import { DataContext } from '../contexts/DataContext';
import { EcosystemContext } from '../contexts/EcosystemContext';
import { logActivity } from '../lib/audit';
import { generateParecerDoc } from '../services/docxService';
import { generateParecerPDF } from '../services/pdfService';
import { buildParecerRevisaoText } from '../services/documentTemplates';
import { 
  ParecerData, RiscoEnum, DanoEnum, ClassificacaoData, DocItem, ResponsavelTecnico, 
  BarramentoData, EstruturaHidraulica, CoordenadaGMS, CoordenadasGMS 
} from '../types';
import {
  BarragemCanonica,
  CURRENT_SYSTEM_ID,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import { AdministraEntityPicker } from './ecosystem/AdministraEntityPicker';
import { CarCoordinateLookup } from './ecosystem/CarCoordinateLookup';
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

interface OpinionFormProps {
  onBack: () => void;
  onNavigate?: (view: 'dashboard' | 'list' | 'form' | 'oficio' | 'info' | 'users' | 'mesa_virtual', doc?: any) => void;
  initialData?: ParecerData;
  readOnly?: boolean;
}

const INITIAL_CLASSIFICACAO: ClassificacaoData = {
  dpa1Select: '',
  dpa2Select: '',
  dpa3Select: '',
  dpa4Select: '',
  scoreDpa1: 0,
  scoreDpa2: 0,
  scoreDpa3: 0,
  scoreDpa4: 0,
  totalDpa: 0,
  dpaClass: DanoEnum.BAIXO,
  rupturaTexto: '',
  legendaDPA: '',
  criPreClassificacao: false,
  scoreCt1: 0,
  scoreCt2: 0,
  scoreCt3: 0,
  scoreCt4: 0,
  scoreCt5: 0,
  ct6Select: '',
  scoreCt6: 0,
  ec1Select: '', scoreEc1: 0,
  ec2Select: '', scoreEc2: 0,
  ec3Select: '', scoreEc3: 0,
  ec4Select: '', scoreEc4: 0,
  ec5Select: '', scoreEc5: 0,
  ps1Select: '', scorePs1: 0,
  ps2Select: '', scorePs2: 0,
  ps3Select: '', scorePs3: 0,
  ps4Select: '', scorePs4: 0,
  ps5Select: '', scorePs5: 0,
  ps6Select: '', scorePs6: 0,
  totalCT: 0,
  totalEC: 0,
  totalPS: 0,
  riskGeral: RiscoEnum.BAIXO,
  valGeral: 0,
  riskPercolacao: RiscoEnum.BAIXO,
  valPercolacao: 0,
  riskGalgamento: RiscoEnum.BAIXO,
  valGalgamento: 0,
  riskGerencial: RiscoEnum.BAIXO,
  valGerencial: 0,
  risco: RiscoEnum.BAIXO,
  resumo: ''
};

const INITIAL_BARRAMENTO: BarramentoData = {
  id: '',
  nome: '',
  snisb: '',
  lat: '',
  long: '',
  alturaMaxima: '',
  alturaMaximaFls: '',
  bordaLivre: '',
  bordaLivreFls: '',
  cotaCoroamento: '',
  cotaCoroamentoFls: '',
  comprimentoCoroamento: '',
  comprimentoCoroamentoFls: '',
  larguraCoroamento: '',
  larguraCoroamentoFls: '',
  tipoEstrutural: '',
  tipoFundacao: '',
  idade: '',
  scoreIdade: 0,
  cotaNNO: '',
  cotaNMM: '',
  areaNNO: '',
  areaNMM: '',
  volumeNMO: '',
  volumeNMM: '',
  vazaoMaxima: '',
  possuiAdequacao: false,
  adequacaoVazao: '',
  adequacaoCota: '',
  adequacaoLocalizacao: '',
  adequacaoVazaoRemanescente: '',
  adequacaoSeguranca: '',
  estruturas: []
};

const INITIAL_STATE: ParecerData = {
  processo: '',
  dataRecebimentoProcesso: '',
  identificacaoEmpreendedor: '',
  cpfCnpj: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidadeUf: '',
  cep: '',
  localizacaoEmpreendimento: '',
  coordenadasGMS: {
    lat: { g: '', m: '', s: '' },
    long: { g: '', m: '', s: '' }
  },
  municipio: OPS_MUNICIPIOS[0],
  responsavelTecnico: '',
  responsaveisTecnicos: [],
  rtOutros: [],
  temRTOutro: false,
  artCreaMt: '',
  numCarMt: '',
  numArt: '',
  usoPreponderante: '',
  usoPreponderanteOutro: '',
  classificacaoBarragem: '',
  nomeBarragem: '',
  situacaoEmpreendimento: '',
  situacaoEmpreendimentoOutro: '',
  tipoBarragem: '',
  tipoBarragemOutro: '',
  nomeCursoAguaBarrado: '',
  portariaClassificacao: '1.234, de 18 de outubro de 2026',
  parecerClassificacao: '12345/CSB/SURH/2026',
  numProtocoloAnalisado: '',
  dataProtocolo: '',
  artAtividade: 'Inspeção de Segurança de Barragem',
  classificacaoDPA: '',
  classificacaoCRI: '',
  dataInspecao: '',
  snisb: '',
  alturaBarragem: '',
  volumeBarragem: '',
  larguraCoroamento: '',
  comprimentoCoroamento: '',
  analistas: [],
  analistasOutros: [],
  temAnalistaOutro: false,
  cpfRT: '',
  formacaoProfissionalRT: '',
  registroProfissionalRT: '',
  numParecerTecnico: '',
  dataParecer: '',
  pecasTecnicas: [],
  temOficioPendencia: false,
  analiseTecnica: '',
  conclusao: '',
  introducaoParticularidade: '',
  apresentacaoRelatorioConclusao: 'Diante destas informações, foi-nos encaminhado para apreciação o Relatório Técnico de Inspeção, o qual nos conclui que “Em comparação com a inspeção inicial, constatou-se que alguns itens previstos no cronograma de obras foram concluídos. Entre as realizações destacam-se: a aplicação de revestimento no coroamento do barramento principal, a limpeza dos barramentos (...) as estruturas extravasoras de ambos os barramentos se encontram em bom estado de conservação. Contudo, destaca-se a necessidade de realizar a limpeza da vegetação atual, que pode, no futuro, comprometer o fluxo e a funcionalidade dessas estruturas.”',
  dpaNaoPnsbTexto: 'desobrigando a apresentação de demais peças técnicas, porém não desobrigando o empreendedor pela responsabilidade da integridade do barramento, responsabilidade a qual denota de manutenção e cuidados operacionais.',
  topicosExtras: [],
  revisaoParecer: '',
  status: 'Rascunho',
  tipo_documento: 'Parecer Técnico'
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

const CHECKLISTS: { [key: string]: string[] } = {
  'ISR – Inspeção de Segurança Regular': [
    'Relatório de inspeção assinado',
    'ART do responsável técnico',
    'Registro fotográfico',
    'Classificação quanto ao CRI e DPA',
    'Ficha de inspeção preenchida'
  ],
  'ISE – Inspeção de Segurança Especial': [
    'Justificativa para a inspeção especial',
    'Análise detalhada das anomalias',
    'Proposição de medidas corretivas',
    'Cronograma de execução das obras'
  ],
  'PSB – Plano de Segurança da Barragem': [
    'Dados gerais do empreendimento',
    'Documentação técnica (projetos, as-built)',
    'Planos e procedimentos de operação',
    'Relatórios de inspeção',
    'Revisão periódica de segurança'
  ],
  'PAE – Plano de Ação de Emergência': [
    'Estudo de inundação (Dam Break)',
    'Identificação de áreas afetadas',
    'Sistemas de alerta e notificação',
    'Responsabilidades e contatos',
    'Mapa de inundação'
  ],
  'RPSB – Relatório de Periodicidade de Segurança de Barragens': [
    'Análise da evolução da segurança',
    'Avaliação do cumprimento de recomendações',
    'Atualização de dados técnicos'
  ],
  'Obras de Adequações': [
    'Projeto executivo das obras',
    'ART de execução',
    'Cronograma de obras',
    'Relatório de conclusão (se aplicável)'
  ]
};

  const OpinionForm: React.FC<OpinionFormProps> = ({ onBack, onNavigate, initialData, readOnly: readOnlyProp }) => {
  const { refreshData, saveParecer } = useContext(DataContext);
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

  const [activeStep, setActiveStep] = useState(1);
  const [formData, setFormData] = useState<ParecerData>(() => {
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

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    empreendedor: true,
    empreendimento: true,
    responsabilidade: true,
    classificacao: true,
    analistas: true,
    endereco: false,
    coordenadas: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const dynamicParecerText = useMemo(() => {
    return buildParecerRevisaoText(formData);
  }, [formData]);

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

  const handleRTToggle = (name: string) => {
    setFormData(prev => {
      const current = prev.responsaveisTecnicos || [];
      if (current.includes(name)) {
        return { ...prev, responsaveisTecnicos: current.filter(n => n !== name) };
      }
      return { ...prev, responsaveisTecnicos: [...current, name] };
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

  const handlePecaToggle = (peca: string) => {
    setFormData(prev => {
      const current = prev.pecasTecnicas || [];
      if (current.includes(peca)) {
        return { ...prev, pecasTecnicas: current.filter(p => p !== peca) };
      }
      return { ...prev, pecasTecnicas: [...current, peca] };
    });
  };

  const handleInputChange = (field: keyof ParecerData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const syncParecerEntitiesToAdministra = async (source: ParecerData) => {
    const sanitized = sanitizeObject(source);
    const rtNames = [
      ...(sanitized.responsaveisTecnicos || []),
      ...(sanitized.rtOutros || []).filter((n) => n.trim() !== ''),
    ];
    const rtList = rtNames.map((nome, idx) => ({
      nome,
      registroProfissional:
        (idx === 0 ? sanitized.registroProfissionalRT : '') || sanitized.artCreaMt || undefined,
      art: idx === 0 ? sanitized.artCreaMt || undefined : undefined,
      formacaoProfissional: idx === 0 ? sanitized.formacaoProfissionalRT || undefined : undefined,
      cpf: idx === 0 ? sanitized.cpfRT || undefined : undefined,
    }));

    return syncEntitiesFromForm({
      existingEmpreendedorId: sanitized.empreendedorId,
      existingBarragemId: sanitized.barragemId,
      empreendedorNome: sanitized.identificacaoEmpreendedor,
      cpfCnpj: sanitized.cpfCnpj,
      logradouro: sanitized.logradouro,
      numero: sanitized.numero,
      complemento: sanitized.complemento,
      bairro: sanitized.bairro,
      municipio: sanitized.municipio,
      cep: sanitized.cep,
      carMt: sanitized.numCarMt,
      nomeBarragem: sanitized.nomeBarragem || sanitized.localizacaoEmpreendimento,
      codigoSnisb: sanitized.snisb,
      processo: sanitized.processo,
      cursoAguaBarrado: sanitized.nomeCursoAguaBarrado,
      usoPreponderante:
        sanitized.usoPreponderante === 'Outro'
          ? sanitized.usoPreponderanteOutro || 'Outro'
          : sanitized.usoPreponderante,
      situacaoEmpreendimento:
        sanitized.situacaoEmpreendimento === 'Outro'
          ? sanitized.situacaoEmpreendimentoOutro || 'Outro'
          : sanitized.situacaoEmpreendimento,
      tipoBarragem:
        sanitized.tipoBarragem === 'OUTRO'
          ? sanitized.tipoBarragemOutro || 'OUTRO'
          : sanitized.tipoBarragem,
      coordenadasGMS: sanitized.coordenadasGMS,
      altura: sanitized.alturaBarragem,
      volume: sanitized.volumeBarragem,
      larguraCoroamento: sanitized.larguraCoroamento,
      comprimentoCoroamento: sanitized.comprimentoCoroamento,
      classificacaoBarragem: sanitized.classificacaoBarragem,
      classificacaoDPA: sanitized.classificacaoDPA,
      classificacaoCRI: sanitized.classificacaoCRI,
      portariaClassificacao: sanitized.portariaClassificacao,
      parecerClassificacao: sanitized.parecerClassificacao,
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

    if (
      !formData.identificacaoEmpreendedor?.trim() &&
      !formData.nomeBarragem?.trim() &&
      !formData.localizacaoEmpreendimento?.trim() &&
      !hasRt
    ) {
      toast.error('Informe ao menos Empreendedor, Barragem ou Responsável Técnico para salvar no Administra.');
      return;
    }

    setSavingToAdministra(true);
    try {
      const syncRes = await syncParecerEntitiesToAdministra(formData);
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
    formData.identificacaoEmpreendedor?.trim() || formData.cpfCnpj?.trim()
  );
  const hasBarragemManual = Boolean(
    formData.nomeBarragem?.trim() ||
      formData.localizacaoEmpreendimento?.trim() ||
      formData.snisb?.trim() ||
      formData.coordenadasGMS?.lat?.g ||
      formData.coordenadasGMS?.long?.g
  );

  const handleRegisterEmpreendedor = async () => {
    const sanitized = sanitizeObject(formData);
    const nome = sanitized.identificacaoEmpreendedor?.trim();
    if (!nome) {
      toast.error('Informe o nome/identificação do Empreendedor antes de cadastrar na base de dados.');
      return;
    }

    setRegisteringEntity('empreendedor');
    try {
      const digits = (sanitized.cpfCnpj || '').replace(/\D/g, '');
      const carNorm = normalizeLookupKey(sanitized.numCarMt).replace(/[^a-z0-9]/g, '');
      const nomeNorm = normalizeLookupKey(nome);

      const matched =
        (sanitized.empreendedorId
          ? administraEmps.find((e) => e.id === sanitized.empreendedorId)
          : undefined) ||
        (digits ? administraEmps.find((e) => (e.cpfCnpjNormalizado || '') === digits) : undefined) ||
        (carNorm
          ? administraEmps.find(
              (e) => normalizeLookupKey(e.carMt).replace(/[^a-z0-9]/g, '') === carNorm
            )
          : undefined) ||
        (!digits ? administraEmps.find((e) => normalizeLookupKey(e.nome) === nomeNorm) : undefined);

      const cidadeParts = (sanitized.cidadeUf || '').split('/');
      const municipioRes = cidadeParts[0]?.trim() || sanitized.municipio || matched?.municipio;
      const ufRes = cidadeParts[1]?.trim() || matched?.uf || 'MT';

      const res = await saveEmpreendedor(
        {
          ...(matched ? { id: matched.id } : {}),
          nome,
          tipoPessoa:
            matched?.tipoPessoa || (digits.length === 14 ? 'CNPJ' : 'CPF'),
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
          carMt: sanitized.numCarMt?.trim() || matched?.carMt,
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
    const nomeBarragem =
      sanitized.nomeBarragem?.trim() || sanitized.localizacaoEmpreendimento?.trim();
    if (!nomeBarragem) {
      toast.error('Informe o Nome da Barragem / Empreendimento antes de cadastrar na base de dados.');
      return;
    }

    setRegisteringEntity('barragem');
    try {
      const snisbNorm = normalizeLookupKey(sanitized.snisb);
      const nameNorm = normalizeLookupKey(nomeBarragem);
      const matched =
        (sanitized.barragemId
          ? administraBars.find((b) => b.id === sanitized.barragemId)
          : undefined) ||
        (snisbNorm
          ? administraBars.find((b) => normalizeLookupKey(b.codigoSnisb) === snisbNorm)
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
          empreendedorNome:
            sanitized.identificacaoEmpreendedor?.trim() || matched?.empreendedorNome,
          empreendedorCpfCnpj: sanitized.cpfCnpj?.trim() || matched?.empreendedorCpfCnpj,
          nomeBarragem,
          codigoSnisb: sanitized.snisb?.trim() || matched?.codigoSnisb,
          processo: sanitized.processo?.trim() || matched?.processo,
          municipio: sanitized.municipio || matched?.municipio,
          uf: 'MT',
          cursoAguaBarrado: sanitized.nomeCursoAguaBarrado?.trim() || matched?.cursoAguaBarrado,
          usoPreponderante:
            sanitized.usoPreponderante === 'Outro'
              ? sanitized.usoPreponderanteOutro || 'Outro'
              : sanitized.usoPreponderante || matched?.usoPreponderante,
          situacaoEmpreendimento:
            sanitized.situacaoEmpreendimento === 'Outro'
              ? sanitized.situacaoEmpreendimentoOutro || 'Outro'
              : sanitized.situacaoEmpreendimento || matched?.situacaoEmpreendimento,
          tipoBarragem:
            sanitized.tipoBarragem === 'OUTRO'
              ? sanitized.tipoBarragemOutro || 'OUTRO'
              : sanitized.tipoBarragem || matched?.tipoBarragem,
          coordenadasGMS: sanitized.coordenadasGMS || matched?.coordenadasGMS,
          altura: sanitized.alturaBarragem || matched?.altura,
          volume: sanitized.volumeBarragem || matched?.volume,
          larguraCoroamento: sanitized.larguraCoroamento || matched?.larguraCoroamento,
          comprimentoCoroamento: sanitized.comprimentoCoroamento || matched?.comprimentoCoroamento,
          classificacaoBarragem: sanitized.classificacaoBarragem || matched?.classificacaoBarragem,
          classificacaoDPA: sanitized.classificacaoDPA || matched?.classificacaoDPA,
          classificacaoCRI: sanitized.classificacaoCRI || matched?.classificacaoCRI,
          portariaClassificacao: sanitized.portariaClassificacao || matched?.portariaClassificacao,
          parecerClassificacao: sanitized.parecerClassificacao || matched?.parecerClassificacao,
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

        const artValue = idx === 0 ? sanitized.artCreaMt?.trim() : undefined;
        const regValue =
          (idx === 0 ? sanitized.registroProfissionalRT?.trim() : '') || artValue;
        const cpfValue = idx === 0 ? sanitized.cpfRT?.trim() : undefined;
        const formacaoValue = idx === 0 ? sanitized.formacaoProfissionalRT?.trim() : undefined;

        if (artValue) {
          const linkRes = await linkArtToRT({
            rtNome: nome,
            registroProfissional: regValue,
            formacaoProfissional: formacaoValue,
            cpf: cpfValue,
            art: artValue,
            barragemId: sanitized.barragemId || undefined,
            barragemNome:
              sanitized.nomeBarragem?.trim() ||
              sanitized.localizacaoEmpreendimento?.trim() ||
              undefined,
            empreendedorId: sanitized.empreendedorId || undefined,
            empreendedorNome: sanitized.identificacaoEmpreendedor?.trim() || undefined,
            processo: sanitized.processo?.trim() || undefined,
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

  const handleSave = async (status: 'Rascunho' | 'Concluído' | 'Ofício de Pendências') => {
    if (readOnly) {
      toast.error('Este documento está bloqueado para edição direta.');
      return;
    }
    if (!formData.identificacaoEmpreendedor || !formData.cpfCnpj || !formData.processo || !formData.municipio) {
      toast.error('Por favor, preencha os campos obrigatórios (Empreendedor, CPF/CNPJ, Processo e Município).');
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

      const resolvedDataParecer = sanitizedFormData.dataParecer || new Date().toISOString().split('T')[0];

      const res = await saveParecer({
        ...sanitizedFormData,
        id: formData.id || undefined,
        empreendedorId: resolvedEmpreendedorId,
        barragemId: resolvedBarragemId,
        responsavelTecnicoIds: resolvedRtIds,
        sourceSystem: sanitizedFormData.sourceSystem || CURRENT_SYSTEM_ID,
        analista:
          formData.analistas?.[0] ||
          formData.analistasOutros?.[0] ||
          getActiveAuthUser()?.name ||
          getActiveAuthUser()?.email ||
          '',
        status: status,
        dataParecer: resolvedDataParecer,
        tipo_documento: formData.tipo_documento
      });

      if (!res.success) {
        throw new Error(res.message || 'Erro ao salvar parecer');
      }

      const isEditing = !!formData.id;
      logActivity({
        action: isEditing ? 'UPDATE_PARECER' : 'CREATE_PARECER',
        details: `${isEditing ? 'Edição' : 'Criação'} de Parecer Técnico efetuada. Empreendedor: ${formData.identificacaoEmpreendedor || '---'}. Processo: ${formData.processo || '---'}`
      });

      const savedDoc = res.data;
      if (savedDoc) {
        setFormData(prev => ({
          ...prev,
          id: savedDoc.id,
          status,
          dataParecer: resolvedDataParecer,
          empreendedorId: resolvedEmpreendedorId,
          barragemId: resolvedBarragemId,
          responsavelTecnicoIds: resolvedRtIds,
          sourceSystem: savedDoc.sourceSystem || CURRENT_SYSTEM_ID,
        }));
      }

      await refreshData?.();

      toast.success(
        isFinalizing
          ? 'Parecer concluído e salvo no Notifica!'
          : 'Rascunho salvo no Notifica.'
      );
      if (isFinalizing && hasUnlinkedEntities) {
        toast.warning(
          'Cadastro no Administra não realizado: o parecer foi salvo no Notifica sem gravar novos cadastros na base do Administra.'
        );
      }
      
      if (status === 'Ofício de Pendências') {
        toast.info('Abrindo Ofício de Pendências com os dados vinculados...');
        if (onNavigate) {
          onNavigate('oficio', {
            parecerId: formData.id || savedDoc?.id,
            protocolo: '',
            processo: formData.processo,
            interessado: formData.identificacaoEmpreendedor,
            cpfCnpj: formData.cpfCnpj,
            empreendimento: formData.nomeBarragem || formData.localizacaoEmpreendimento,
            municipio: formData.municipio,
            empreendedorId: resolvedEmpreendedorId,
            barragemId: resolvedBarragemId,
            responsavelTecnicoIds: resolvedRtIds,
            coordenadasGMS: formData.coordenadasGMS,
            logradouro: formData.logradouro,
            numero: formData.numero,
            complemento: formData.complemento,
            bairro: formData.bairro,
            cidadeUf: formData.cidadeUf,
            cep: formData.cep,
            responsaveisTecnicos: formData.responsaveisTecnicos,
            rtOutros: formData.rtOutros,
            temRTOutro: formData.temRTOutro,
            art: formData.artCreaMt || formData.registroProfissionalRT || '',
            analistas: formData.analistas,
            analistasOutros: formData.analistasOutros,
            temAnalistaOutro: formData.temAnalistaOutro,
            tipo_documento: '1° Oficio de Pendencias'
          });
        }
      }

      if (status === 'Concluído') onBack();
    } catch (error: any) {
      console.error('Erro ao salvar parecer:', error);
      toast.error(`Erro ao salvar parecer: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = () => {
    try {
      generateParecerDoc(formData);
      logActivity({
        action: 'DOWNLOAD_PARECER',
        details: `Download do Parecer Técnico efetuado. Processo: ${formData.processo || 'S/P'}. Empreendedor: ${formData.identificacaoEmpreendedor || '---'}`
      });
      toast.success('Documento Word (.docx) gerado.');
    } catch (err) {
      console.error('Erro ao gerar DOCX:', err);
      toast.error('Erro ao gerar o arquivo Word.');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateParecerPDF(formData);
      logActivity({
        action: 'DOWNLOAD_PARECER',
        details: `Download do Parecer Técnico (PDF) efetuado. Processo: ${formData.processo || 'S/P'}. Empreendedor: ${formData.identificacaoEmpreendedor || '---'}`
      });
      toast.success('Documento PDF gerado.');
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      toast.error('Erro ao gerar o arquivo PDF.');
    }
  };

  const steps = [
    { id: 1, title: 'Geral', icon: <Info size={18} /> },
    { id: 2, title: 'Peças', icon: <ClipboardList size={18} /> },
    { id: 3, title: 'Pendências', icon: <AlertTriangle size={18} /> },
    { id: 4, title: 'Análise', icon: <FileText size={18} /> },
    { id: 5, title: 'Conclusão', icon: <CheckCircle size={18} /> },
    { id: 6, title: 'Revisão', icon: <ClipboardList size={18} /> },
    { id: 7, title: 'Finalizar', icon: <Save size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Section (Header + Stepper) */}
      <div className="static md:sticky md:top-[61px] z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        {/* Header */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
                Parecer Técnico <span className="text-emerald-600">Fiscalização-CSB</span>
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                  {formData.id ? `Editando: ${formData.numParecerTecnico || formData.processo || 'Parecer'}` : 'Novo Documento'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {!readOnly && (
              <>
                <button 
                  onClick={() => handleSave('Rascunho')} 
                  disabled={loading}
                  className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar Rascunho
                </button>
                <button 
                  onClick={() => handleSave('Concluído')} 
                  disabled={loading}
                  className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Concluir Parecer
                </button>
              </>
            )}
            <button 
              onClick={handleDownloadPDF}
              className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 transition-all flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
              title="Exportar Parecer Técnico em PDF"
            >
              <Download size={14} />
              Exportar PDF
            </button>
            <button 
              onClick={handleDownloadDocx}
              className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
            >
              <Download size={14} />
              Exportar Word
            </button>
            {canRectify && (
              <button
                type="button"
                onClick={() => setIsRetificarOpen(true)}
                className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-xs hover:bg-amber-700 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw size={14} />
                Retificar documento
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setIsSolicitarVistoriaOpen(true)}
                className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-lg shadow-slate-900/15 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardList size={14} />
                Solicitar vistoria
              </button>
            )}
          </div>
        </div>

        {(readOnly || formData.retificadoDeId) && (
          <div className="px-3 sm:px-6 pb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            {isConcludedStatus(formData.status) && (
              <div className="w-full p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Documento concluído em modo somente leitura. Alterações exigem retificação auditável preservando o registro original.
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
              <div className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-700">
                Visualização somente leitura: documento pertence a outro autor ou seu perfil não possui permissão de edição.
              </div>
            )}
            {formData.retificadoDeId && (
              <div className="w-full p-2.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-900">
                Retificação v{formData.versaoRetificacao || 2} originada de <strong>{formData.retificadoDeId}</strong>
                {formData.retificacaoJustificativa ? ` — Justificativa: ${formData.retificacaoJustificativa}` : ''}
              </div>
            )}
          </div>
        )}

        {/* Stepper */}
        <div className="py-3 sm:py-4 border-t border-slate-100">
          <div className="max-w-4xl mx-auto px-3 sm:px-6">
            <div className="flex justify-between items-center relative overflow-x-auto touch-scroll-x pb-2 md:pb-0 custom-scrollbar gap-3 md:gap-0">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 -translate-y-1/2 z-0 hidden md:block"></div>
              {steps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`relative z-10 flex flex-col items-center gap-2 group min-w-[72px] md:min-w-0`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shrink-0 ${
                    activeStep === step.id 
                      ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                      : activeStep > step.id 
                        ? 'bg-emerald-100 border-emerald-500 text-emerald-600'
                        : 'bg-white border-slate-200 text-slate-400'
                  }`}>
                    {activeStep > step.id ? <CheckCircle size={16} /> : React.cloneElement(step.icon as React.ReactElement, { size: 14 })}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest text-center leading-tight ${
                    activeStep === step.id ? 'text-emerald-600' : 'text-slate-400'
                  }`}>
                    {step.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 mt-4 sm:mt-8">
        <div className="bg-white rounded-2xl sm:rounded-[2rem] shadow-xl border border-slate-100 p-4 sm:p-8 md:p-12">
          
          {activeStep === 1 && (
            <div className="space-y-8 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Info size={20} />
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">1. Informações Gerais</h2>
              </div>

              <AdministraEntityPicker
                readOnly={readOnly}
                currentDocumentId={formData.id}
                selectedEmpreendedorId={formData.empreendedorId}
                selectedBarragemId={formData.barragemId}
                cpfCnpj={formData.cpfCnpj}
                codigoSnisb={formData.snisb}
                nomeBarragem={formData.nomeBarragem || formData.localizacaoEmpreendimento}
                processo={formData.processo}
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
                  const proposals: FieldProposal<ParecerData>[] = [
                    { key: 'identificacaoEmpreendedor', label: 'Empreendedor', incomingValue: emp.nome },
                    { key: 'cpfCnpj', label: 'CPF/CNPJ', incomingValue: emp.cpfCnpj },
                    { key: 'logradouro', label: 'Logradouro', incomingValue: emp.logradouro },
                    { key: 'numero', label: 'Número', incomingValue: emp.numero },
                    { key: 'complemento', label: 'Complemento', incomingValue: emp.complemento },
                    { key: 'bairro', label: 'Bairro', incomingValue: emp.bairro },
                    {
                      key: 'cidadeUf',
                      label: 'Cidade/UF',
                      incomingValue: emp.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : undefined,
                    },
                    { key: 'municipio', label: 'Município', incomingValue: matchedMun || undefined },
                    { key: 'cep', label: 'CEP', incomingValue: emp.cep },
                    { key: 'numCarMt', label: 'CAR/MT', incomingValue: emp.carMt },
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
                  const proposals: FieldProposal<ParecerData>[] = [
                    { key: 'nomeBarragem', label: 'Nome da barragem', incomingValue: bar.nomeBarragem },
                    { key: 'localizacaoEmpreendimento', label: 'Empreendimento', incomingValue: bar.nomeBarragem },
                    { key: 'snisb', label: 'Código SNISB', incomingValue: bar.codigoSnisb },
                    { key: 'municipio', label: 'Município', incomingValue: bar.municipio },
                    { key: 'coordenadasGMS', label: 'Coordenadas GMS', incomingValue: bar.coordenadasGMS },
                    { key: 'situacaoEmpreendimento', label: 'Situação', incomingValue: bar.situacaoEmpreendimento },
                    { key: 'tipoBarragem', label: 'Tipo de barragem', incomingValue: bar.tipoBarragem },
                    { key: 'nomeCursoAguaBarrado', label: "Curso d'água", incomingValue: bar.cursoAguaBarrado },
                    { key: 'usoPreponderante', label: 'Uso preponderante', incomingValue: bar.usoPreponderante },
                    { key: 'alturaBarragem', label: 'Altura', incomingValue: bar.altura },
                    { key: 'volumeBarragem', label: 'Volume', incomingValue: bar.volume },
                    { key: 'larguraCoroamento', label: 'Largura do coroamento', incomingValue: bar.larguraCoroamento },
                    { key: 'comprimentoCoroamento', label: 'Comprimento do coroamento', incomingValue: bar.comprimentoCoroamento },
                    { key: 'classificacaoBarragem', label: 'Classificação', incomingValue: bar.classificacaoBarragem },
                    { key: 'classificacaoDPA', label: 'DPA', incomingValue: bar.classificacaoDPA },
                    { key: 'classificacaoCRI', label: 'CRI', incomingValue: bar.classificacaoCRI },
                    { key: 'portariaClassificacao', label: 'Portaria classificação', incomingValue: bar.portariaClassificacao },
                    { key: 'parecerClassificacao', label: 'Parecer classificação', incomingValue: bar.parecerClassificacao },
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
                      registroProfissionalRT: rt.registroProfissional || prev.registroProfissionalRT,
                      formacaoProfissionalRT: rt.formacaoProfissional || prev.formacaoProfissionalRT,
                      cpfRT: rt.cpf || prev.cpfRT,
                      artCreaMt: selectedArt
                        ? selectedArt
                        : prev.artCreaMt || rt.art || rt.registroProfissional || '',
                      responsavelTecnicoIds: Array.from(new Set([...(prev.responsavelTecnicoIds || []), rt.id])),
                    };
                  });
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

              {/* Metadados Pesquisáveis do Parecer */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-6 bg-slate-100/60 rounded-[2rem] border border-slate-200 shadow-inner">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Tipo de Parecer *</label>
                  <select
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                    value={formData.tipo_documento || 'Parecer Técnico'}
                    onChange={(e) => handleInputChange('tipo_documento', e.target.value)}
                    disabled={readOnly}
                  >
                    <option value="Parecer Técnico">Parecer Técnico</option>
                    <option value="Parecer Técnico de ISR">Parecer Técnico de ISR</option>
                    <option value="Parecer Técnico de ISE">Parecer Técnico de ISE</option>
                    <option value="Parecer Técnico de PSB">Parecer Técnico de PSB</option>
                    <option value="Parecer Técnico de PAE">Parecer Técnico de PAE</option>
                    <option value="Parecer Técnico de RPSB">Parecer Técnico de RPSB</option>
                    <option value="Parecer Técnico de Obras">Parecer Técnico de Obras</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nº do Parecer Técnico</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                    value={formData.numParecerTecnico || ''}
                    onChange={(e) => handleInputChange('numParecerTecnico', e.target.value)}
                    disabled={readOnly}
                    placeholder="Ex: 123/CSB/SURH/2026"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Processo SEMA/MT *</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                    value={formData.processo}
                    onChange={(e) => handleInputChange('processo', e.target.value)}
                    disabled={readOnly}
                    placeholder="Ex: 123456/2026"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Data de Recebimento</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                    value={formData.dataRecebimentoProcesso || ''}
                    onChange={(e) => handleInputChange('dataRecebimentoProcesso', e.target.value)}
                    disabled={readOnly}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Data do Parecer</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                    value={formData.dataParecer || ''}
                    onChange={(e) => handleInputChange('dataParecer', e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              </div>

              {/* Informações do Empreendedor */}
              <div className="space-y-6">
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => toggleSection('empreendedor')}
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-xs">1</div>
                    <h3 className="text-sm font-black uppercase tracking-widest">Informações do Empreendedor (Administra)</h3>
                  </div>
                  <div className="p-2 rounded-full hover:bg-emerald-50 text-emerald-600 transition-colors">
                    {expandedSections.empreendedor ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>
                
                <AnimatePresence>
                  {expandedSections.empreendedor && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-100/50 rounded-[2rem] border border-slate-200 shadow-inner">
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Identificação do Empreendedor *</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-700 shadow-sm"
                            value={formData.identificacaoEmpreendedor}
                            onChange={(e) => handleInputChange('identificacaoEmpreendedor', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">CPF / CNPJ *</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-700 shadow-sm"
                            value={formData.cpfCnpj}
                            onChange={(e) => handleInputChange('cpfCnpj', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nº CAR/MT</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-700 shadow-sm"
                            value={formData.numCarMt}
                            onChange={(e) => handleInputChange('numCarMt', e.target.value)}
                            disabled={readOnly}
                            placeholder="MT-0000000-..."
                          />
                        </div>

                        {/* Endereço para correspondência */}
                        <div className="md:col-span-2 space-y-4 pt-4 border-t border-slate-200/60">
                          <div 
                            className="flex items-center justify-between cursor-pointer group"
                            onClick={() => toggleSection('endereco')}
                          >
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 cursor-pointer">
                              <MapPin size={12} /> Endereço para correspondência
                            </label>
                            <div className="p-1 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                              {expandedSections.endereco ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </div>

                          <AnimatePresence>
                            {expandedSections.endereco && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                  <div className="md:col-span-2 space-y-2">
                                    <label className="text-[9px] font-bold uppercase text-slate-500">Logradouro</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-4 py-2 bg-white border-2 border-slate-300 rounded-lg text-sm focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all shadow-sm"
                                      value={formData.logradouro}
                                      onChange={(e) => handleInputChange('logradouro', e.target.value)}
                                      disabled={readOnly}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase text-slate-500">N°</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-4 py-2 bg-white border-2 border-slate-300 rounded-lg text-sm focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all shadow-sm"
                                      value={formData.numero}
                                      onChange={(e) => handleInputChange('numero', e.target.value)}
                                      disabled={readOnly}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase text-slate-500">Complemento</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-4 py-2 bg-white border-2 border-slate-300 rounded-lg text-sm focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all shadow-sm"
                                      value={formData.complemento}
                                      onChange={(e) => handleInputChange('complemento', e.target.value)}
                                      disabled={readOnly}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase text-slate-500">Bairro</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-4 py-2 bg-white border-2 border-slate-300 rounded-lg text-sm focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all shadow-sm"
                                      value={formData.bairro}
                                      onChange={(e) => handleInputChange('bairro', e.target.value)}
                                      disabled={readOnly}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase text-slate-500">Cidade/UF</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-4 py-2 bg-white border-2 border-slate-300 rounded-lg text-sm focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all shadow-sm"
                                      value={formData.cidadeUf}
                                      onChange={(e) => handleInputChange('cidadeUf', e.target.value)}
                                      disabled={readOnly}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase text-slate-500">CEP</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-4 py-2 bg-white border-2 border-slate-300 rounded-lg text-sm focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all shadow-sm"
                                      value={formData.cep}
                                      onChange={(e) => handleInputChange('cep', e.target.value)}
                                      disabled={readOnly}
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {!readOnly && (
                          <div className="md:col-span-2 pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            {formData.empreendedorId ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                Empreendedor cadastrado e vinculado à base Administra.
                              </span>
                            ) : (
                              <>
                                <span className="text-xs font-semibold text-amber-800">
                                  Empreendedor não vinculado no Administra (temporário apenas no rascunho).
                                </span>
                                <button
                                  type="button"
                                  disabled={registeringEntity !== null}
                                  onClick={() => void handleRegisterEmpreendedor()}
                                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                                >
                                  {registeringEntity === 'empreendedor' ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <PlusCircle size={14} />
                                  )}
                                  Cadastrar Empreendedor na Base de Dados
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Informações do Empreendimento */}
              <div className="space-y-6">
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => toggleSection('empreendimento')}
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-xs">2</div>
                    <h3 className="text-sm font-black uppercase tracking-widest">Informações do Empreendimento</h3>
                  </div>
                  <div className="p-2 rounded-full hover:bg-emerald-50 text-emerald-600 transition-colors">
                    {expandedSections.empreendimento ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                <AnimatePresence>
                  {expandedSections.empreendimento && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-100/50 rounded-[2rem] border border-slate-200 shadow-inner">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nome da Barragem / Fazenda (Administra)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                            value={formData.nomeBarragem || formData.localizacaoEmpreendimento}
                            onChange={(e) => {
                              handleInputChange('nomeBarragem', e.target.value);
                              handleInputChange('localizacaoEmpreendimento', e.target.value);
                            }}
                            disabled={readOnly}
                            placeholder="Ex: Barragem Fazenda Santa Fé"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Código SNISB (Administra)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                            value={formData.snisb}
                            onChange={(e) => handleInputChange('snisb', e.target.value)}
                            disabled={readOnly}
                            placeholder="Ex: 12345"
                          />
                        </div>

                        <div className="md:col-span-2 p-6 bg-white rounded-2xl border border-slate-200 space-y-6">
                          <div 
                            className="flex items-center justify-between cursor-pointer group"
                            onClick={() => toggleSection('coordenadas')}
                          >
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Coordenadas (GMS)</h3>
                            <div className="p-1 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                              {expandedSections.coordenadas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </div>

                          <AnimatePresence>
                            {expandedSections.coordenadas && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Latitude</label>
                                    <input 
                                      placeholder="Ex: 15121234" 
                                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20" 
                                      value={getGMSDisplayValue('lat')} 
                                      onChange={(e) => handleGMSInputChange('lat', e.target.value)} 
                                      disabled={readOnly}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Longitude</label>
                                    <input 
                                      placeholder="Ex: 56121234" 
                                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20" 
                                      value={getGMSDisplayValue('long')} 
                                      onChange={(e) => handleGMSInputChange('long', e.target.value)} 
                                      disabled={readOnly}
                                    />
                                  </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 mt-4">
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
                                        numCarMt: car.codigoCar || prev.numCarMt,
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
                                        identificacaoEmpreendedor: emp?.nome || cad.empreendedorNome || prev.identificacaoEmpreendedor,
                                        cpfCnpj: emp?.cpfCnpj || cad.cpfCnpj || prev.cpfCnpj,
                                        logradouro: emp?.logradouro || prev.logradouro,
                                        numero: emp?.numero || prev.numero,
                                        complemento: emp?.complemento || prev.complemento,
                                        bairro: emp?.bairro || prev.bairro,
                                        cidadeUf: emp?.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : prev.cidadeUf,
                                        cep: emp?.cep || prev.cep,
                                        numCarMt: emp?.carMt || cad.carMt || primaryCar?.codigoCar || prev.numCarMt,
                                        nomeBarragem: bar?.nomeBarragem || cad.nomeBarragem || prev.nomeBarragem,
                                        localizacaoEmpreendimento: bar?.nomeBarragem || cad.nomeBarragem || prev.localizacaoEmpreendimento,
                                        snisb: bar?.codigoSnisb || cad.codigoSnisb || prev.snisb,
                                        municipio: matchedMun || bar?.municipio || prev.municipio,
                                        usoPreponderante: bar?.usoPreponderante || cad.usoPreponderante || prev.usoPreponderante,
                                        classificacaoDPA: bar?.classificacaoDPA || cad.classificacaoDPA || prev.classificacaoDPA,
                                        processo: cad.processo || prev.processo,
                                      }));
                                    }}
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Município</label>
                          <select 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.municipio}
                            onChange={(e) => handleInputChange('municipio', e.target.value)}
                            disabled={readOnly}
                          >
                            {OPS_MUNICIPIOS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Situação do empreendimento</label>
                          <select 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.situacaoEmpreendimento}
                            onChange={(e) => handleInputChange('situacaoEmpreendimento', e.target.value)}
                            disabled={readOnly}
                          >
                            <option value="">Selecione...</option>
                            {OPS_SITUACAO_EMPREENDIMENTO.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          {formData.situacaoEmpreendimento === 'Outro' && (
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 mt-2 bg-white border border-emerald-200 rounded-xl animate-in slide-in-from-top-2 duration-200"
                              placeholder="Especifique a situação..."
                              value={formData.situacaoEmpreendimentoOutro}
                              onChange={(e) => handleInputChange('situacaoEmpreendimentoOutro', e.target.value)}
                              disabled={readOnly}
                            />
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de Barragem</label>
                          <select 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.tipoBarragem}
                            onChange={(e) => handleInputChange('tipoBarragem', e.target.value)}
                            disabled={readOnly}
                          >
                            <option value="">Selecione...</option>
                            {OPS_TIPO_BARRAGEM.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          {formData.tipoBarragem === 'OUTRO' && (
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 mt-2 bg-white border border-emerald-200 rounded-xl animate-in slide-in-from-top-2 duration-200"
                              placeholder="Especifique o tipo..."
                              value={formData.tipoBarragemOutro}
                              onChange={(e) => handleInputChange('tipoBarragemOutro', e.target.value)}
                              disabled={readOnly}
                            />
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nome do curso d’agua barrado</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.nomeCursoAguaBarrado}
                            onChange={(e) => handleInputChange('nomeCursoAguaBarrado', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Uso Preponderante</label>
                          <select 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.usoPreponderante}
                            onChange={(e) => handleInputChange('usoPreponderante', e.target.value)}
                            disabled={readOnly}
                          >
                            <option value="">Selecione...</option>
                            {OPS_USO_PREPONDERANTE.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          {formData.usoPreponderante === 'Outro' && (
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 mt-2 bg-white border border-emerald-200 rounded-xl animate-in slide-in-from-top-2 duration-200"
                              placeholder="Especifique o uso..."
                              value={formData.usoPreponderanteOutro}
                              onChange={(e) => handleInputChange('usoPreponderanteOutro', e.target.value)}
                              disabled={readOnly}
                            />
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">N° CAR/MT</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.numCarMt}
                            onChange={(e) => handleInputChange('numCarMt', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Altura da Barragem (m)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.alturaBarragem}
                            onChange={(e) => handleInputChange('alturaBarragem', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Volume da Barragem (hm³)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.volumeBarragem}
                            onChange={(e) => handleInputChange('volumeBarragem', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Largura do Coroamento (m)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.larguraCoroamento}
                            onChange={(e) => handleInputChange('larguraCoroamento', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Comprimento do Coroamento (m)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.comprimentoCoroamento}
                            onChange={(e) => handleInputChange('comprimentoCoroamento', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        {!readOnly && (
                          <div className="md:col-span-2 pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            {formData.barragemId ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                Barragem cadastrada e vinculada à base Administra.
                              </span>
                            ) : (
                              <>
                                <span className="text-xs font-semibold text-amber-800">
                                  Barragem não vinculada no Administra (temporária apenas no rascunho).
                                </span>
                                <button
                                  type="button"
                                  disabled={registeringEntity !== null}
                                  onClick={() => void handleRegisterBarragem()}
                                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                                >
                                  {registeringEntity === 'barragem' ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <PlusCircle size={14} />
                                  )}
                                  Cadastrar Barragem na Base de Dados
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Informações sobre a Responsabilidade Técnica */}
              <div className={`space-y-6 pt-6 border-t border-slate-100 relative transition-all ${showRTDropdown ? 'z-50' : 'z-10'}`}>
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => toggleSection('responsabilidade')}
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-xs">3</div>
                    <h3 className="text-sm font-black uppercase tracking-widest">Informações sobre a Responsabilidade Técnica</h3>
                  </div>
                  <div className="p-2 rounded-full hover:bg-emerald-50 text-emerald-600 transition-colors">
                    {expandedSections.responsabilidade ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                <AnimatePresence>
                  {expandedSections.responsabilidade && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="grid grid-cols-1 gap-6 p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100">
                        {/* Responsável Técnico Selection */}
                        <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <ClipboardList size={14} /> Responsável Técnico
                          </label>
                          
                          <div className="relative" ref={rtDropdownRef}>
                            <div 
                              onClick={() => !readOnly && setShowRTDropdown(!showRTDropdown)}
                              className={`w-full px-4 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer flex justify-between items-center min-h-[48px] transition-all ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20'}`}
                            >
                              <div className="flex flex-wrap gap-2">
                                {(formData.responsaveisTecnicos || []).length > 0 ? (
                                  (formData.responsaveisTecnicos || []).map(name => (
                                    <span key={name} className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2 animate-in zoom-in-95 duration-200">
                                      {name}
                                      {!readOnly && (
                                        <X 
                                          size={14} 
                                          className="hover:text-emerald-900 cursor-pointer" 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRTToggle(name);
                                          }}
                                        />
                                      )}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-400 text-sm italic">Clique para selecionar os responsáveis técnicos...</span>
                                )}
                              </div>
                              <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 ${showRTDropdown ? 'rotate-180' : ''}`} />
                            </div>

                            {showRTDropdown && (
                              <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 origin-top">
                                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                                  <Search size={16} className="text-slate-400" />
                                  <input 
                                    type="text"
                                    placeholder="Pesquisar responsável..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-slate-700 placeholder:text-slate-400"
                                    value={rtSearch}
                                    onChange={(e) => setRtSearch(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                  />
                                </div>
                                <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                                  {filteredRTs.map(name => {
                                    const isSelected = (formData.responsaveisTecnicos || []).includes(name);
                                    return (
                                      <div 
                                        key={name}
                                        onClick={() => handleRTToggle(name)}
                                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all mb-1 ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                      >
                                        <span className={`text-sm ${isSelected ? 'font-bold' : 'font-medium'}`}>{name}</span>
                                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 bg-white'}`}>
                                          {isSelected && <Check size={14} strokeWidth={3} />}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {filteredRTs.length === 0 && (
                                    <div className="p-8 text-center space-y-2">
                                      <p className="text-sm text-slate-400 italic">Nenhum responsável encontrado.</p>
                                    </div>
                                  )}
                                </div>
                                <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                                  <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer group shadow-sm">
                                    <input
                                      type="checkbox"
                                      className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20"
                                      checked={formData.temRTOutro}
                                      onChange={(e) => {
                                        handleInputChange('temRTOutro', e.target.checked);
                                        if (e.target.checked && (formData.rtOutros || []).length === 0) {
                                          addRTOutro();
                                        }
                                      }}
                                      disabled={readOnly}
                                    />
                                    <span className="text-sm font-bold text-emerald-600">Inserir Manualmente (Outro)</span>
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>

                          {formData.temRTOutro && (
                            <div className="mt-4 p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-4 animate-in slide-in-from-top-4 duration-300">
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Outros Responsáveis Técnicos</h4>
                                <button
                                  type="button"
                                  onClick={addRTOutro}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
                                  disabled={readOnly}
                                >
                                  <Plus size={14} /> Adicionar Outro
                                </button>
                              </div>
                              <div className="space-y-3">
                                {(formData.rtOutros || []).map((name, index) => (
                                  <div key={index} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                    <input
                                      type="text"
                                      className="flex-1 px-4 py-2 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 text-sm"
                                      placeholder="Nome do Responsável Técnico"
                                      value={name}
                                      onChange={(e) => handleRTOutroChange(index, e.target.value)}
                                      disabled={readOnly}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeRTOutro(index)}
                                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                      disabled={readOnly}
                                    >
                                      <X size={18} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">CPF do RT (Administra)</label>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                              value={formData.cpfRT || ''}
                              onChange={(e) => handleInputChange('cpfRT', e.target.value)}
                              disabled={readOnly}
                              placeholder="000.000.000-00"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Formação Profissional (Administra)</label>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                              value={formData.formacaoProfissionalRT || ''}
                              onChange={(e) => handleInputChange('formacaoProfissionalRT', e.target.value)}
                              disabled={readOnly}
                              placeholder="Ex: Engenheiro Civil"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registro Profissional / CREA (Administra)</label>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                              value={formData.registroProfissionalRT || ''}
                              onChange={(e) => handleInputChange('registroProfissionalRT', e.target.value)}
                              disabled={readOnly}
                              placeholder="Ex: CREA-MT 12345"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">n° ART</label>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                              value={formData.artCreaMt}
                              onChange={(e) => handleInputChange('artCreaMt', e.target.value)}
                              disabled={readOnly}
                              placeholder="Ex: 123456"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">ART Atividade</label>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                              value={formData.artAtividade}
                              onChange={(e) => handleInputChange('artAtividade', e.target.value)}
                              disabled={readOnly}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data da Inspeção</label>
                            <input 
                              type="date" 
                              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                              value={formData.dataInspecao}
                              onChange={(e) => handleInputChange('dataInspecao', e.target.value)}
                              disabled={readOnly}
                            />
                          </div>
                        </div>

                        {!readOnly && usedRtNames.length > 0 && (
                          <div className="pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Classificação e Protocolo */}
              <div className="space-y-6 pt-6 border-t border-slate-100">
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => toggleSection('classificacao')}
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-xs">4</div>
                    <h3 className="text-sm font-black uppercase tracking-widest">Classificação e Protocolo</h3>
                  </div>
                  <div className="p-2 rounded-full hover:bg-emerald-50 text-emerald-600 transition-colors">
                    {expandedSections.classificacao ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                <AnimatePresence>
                  {expandedSections.classificacao && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Portaria de Classificação</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.portariaClassificacao}
                            onChange={(e) => handleInputChange('portariaClassificacao', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parecer de Classificação</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.parecerClassificacao}
                            onChange={(e) => handleInputChange('parecerClassificacao', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">N° do Protocolo analisado</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.numProtocoloAnalisado}
                            onChange={(e) => handleInputChange('numProtocoloAnalisado', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data do protocolo</label>
                          <input 
                            type="date" 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.dataProtocolo}
                            onChange={(e) => handleInputChange('dataProtocolo', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Classificação do DPA</label>
                          <select 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.classificacaoDPA}
                            onChange={(e) => handleInputChange('classificacaoDPA', e.target.value)}
                            disabled={readOnly}
                          >
                            <option value="">Selecione...</option>
                            {OPS_CLASSIFICACAO_DPA.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Classificação da CRI</label>
                          <select 
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={formData.classificacaoCRI}
                            onChange={(e) => handleInputChange('classificacaoCRI', e.target.value)}
                            disabled={readOnly}
                          >
                            <option value="">Selecione...</option>
                            {OPS_CLASSIFICACAO_CRI.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Analistas Responsáveis */}
              <div className={`space-y-8 pt-8 border-t border-slate-100 relative transition-all ${showAnalistaDropdown ? 'z-50' : 'z-10'}`}>
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => toggleSection('analistas')}
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <Users size={18} />
                    <h3 className="text-sm font-black uppercase tracking-widest">Analistas Responsáveis</h3>
                  </div>
                  <div className="p-2 rounded-full hover:bg-emerald-50 text-emerald-600 transition-colors">
                    {expandedSections.analistas ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                <AnimatePresence>
                  {expandedSections.analistas && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="grid grid-cols-1 gap-8 p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100">
                        <div className="md:col-span-2 space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <ClipboardList size={14} /> Analistas Responsáveis
                          </label>
                          
                          <div className="relative" ref={analistaDropdownRef}>
                            <div 
                              onClick={() => !readOnly && setShowAnalistaDropdown(!showAnalistaDropdown)}
                              className={`w-full px-4 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer flex justify-between items-center min-h-[48px] transition-all ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20'}`}
                            >
                              <div className="flex flex-wrap gap-2">
                                {(formData.analistas || []).length > 0 ? (
                                  (formData.analistas || []).map(fullName => {
                                    const name = fullName.split('/')[0];
                                    return (
                                      <span key={fullName} className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2 animate-in zoom-in-95 duration-200">
                                        {name}
                                        {!readOnly && (
                                          <X 
                                            size={14} 
                                            className="hover:text-emerald-900 cursor-pointer" 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleAnalistaToggle(name);
                                            }}
                                          />
                                        )}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-slate-400 text-sm italic">Clique para selecionar os analistas...</span>
                                )}
                              </div>
                              <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 ${showAnalistaDropdown ? 'rotate-180' : ''}`} />
                            </div>

                            {showAnalistaDropdown && (
                              <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 origin-top">
                                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                                  <Search size={16} className="text-slate-400" />
                                  <input 
                                    type="text" 
                                    placeholder="Pesquisar analista..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-slate-700 placeholder:text-slate-400"
                                    value={analistaSearch}
                                    onChange={(e) => setAnalistaSearch(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                  />
                                </div>
                                <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                                  {filteredAnalistas.map(name => {
                                    const isThiago = name === 'Thiago Silveira da Silva';
                                    const cargo = isThiago ? 'Residente Técnico' : 'Analista de Meio Ambiente';
                                    const fullName = `${name}/${cargo}- SEMA/MT`;
                                    const isSelected = (formData.analistas || []).includes(fullName);
                                    return (
                                      <div 
                                        key={name}
                                        onClick={() => handleAnalistaToggle(name)}
                                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all mb-1 ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                      >
                                        <span className={`text-sm ${isSelected ? 'font-bold' : 'font-medium'}`}>{name}</span>
                                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 bg-white'}`}>
                                          {isSelected && <Check size={14} strokeWidth={3} />}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {filteredAnalistas.length === 0 && (
                                    <div className="p-8 text-center space-y-2">
                                      <p className="text-sm text-slate-400 italic">Nenhum analista encontrado.</p>
                                    </div>
                                  )}
                                </div>
                                <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                                  <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer group shadow-sm">
                                    <input
                                      type="checkbox"
                                      className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20"
                                      checked={formData.temAnalistaOutro}
                                      onChange={(e) => {
                                        handleInputChange('temAnalistaOutro', e.target.checked);
                                        if (e.target.checked && (formData.analistasOutros || []).length === 0) {
                                          addAnalistaOutro();
                                        }
                                      }}
                                      disabled={readOnly}
                                    />
                                    <span className="text-sm font-bold text-emerald-600">Inserir Manualmente (Outro)</span>
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>

                          {formData.temAnalistaOutro && (
                            <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-4 animate-in slide-in-from-top-4 duration-300">
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Outros Analistas Responsáveis</h4>
                                <button
                                  type="button"
                                  onClick={addAnalistaOutro}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
                                  disabled={readOnly}
                                >
                                  <Plus size={14} /> Adicionar Outro
                                </button>
                              </div>
                              <div className="space-y-3">
                                {(formData.analistasOutros || []).map((name, index) => (
                                  <div key={index} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                    <input
                                      type="text"
                                      className="flex-1 px-4 py-2 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 text-sm"
                                      placeholder="Nome do Analista Responsável"
                                      value={name}
                                      onChange={(e) => handleAnalistaOutroChange(index, e.target.value)}
                                      disabled={readOnly}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeAnalistaOutro(index)}
                                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                      disabled={readOnly}
                                    >
                                      <X size={18} />
                                    </button>
                                  </div>
                                ))}
                                {(!formData.analistasOutros || formData.analistasOutros.length === 0) && (
                                  <p className="text-xs text-emerald-600 italic">Clique em "Adicionar Outro" para inserir nomes manualmente.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

        {activeStep === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <ClipboardList size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">2. Peças Técnicas para Análise</h2>
              </div>

              <div className="space-y-6">
                {['ISR – Inspeção de Segurança Regular', 'ISE – Inspeção de Segurança Especial', 'PSB – Plano de Segurança da Barragem', 'PAE – Plano de Ação de Emergência', 'RPSB – Relatório de Periodicidade de Segurança de Barragens', 'Obras de Adequações', 'Outros documentos'].map(peca => (
                  <div key={peca} className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 text-emerald-600 rounded"
                        checked={formData.pecasTecnicas?.includes(peca)}
                        onChange={() => handlePecaToggle(peca)}
                      />
                      <span className="text-sm font-black text-slate-800 uppercase tracking-tight">{peca}</span>
                    </label>

                    {formData.pecasTecnicas?.includes(peca) && (
                      <div className="pl-8 space-y-6 animate-in slide-in-from-top-2 duration-300">
                        {peca === 'Outros documentos' && (
                          <input 
                            placeholder="Nome do documento..."
                            className="w-full px-4 py-2 border rounded-lg text-sm"
                            value={formData.pecasTecnicasOutro}
                            onChange={(e) => handleInputChange('pecasTecnicasOutro', e.target.value)}
                          />
                        )}
                        
                        <div className="space-y-3">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Checklist Mínimo</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(CHECKLISTS[peca] || ['Documentação completa', 'Assinatura do responsável', 'ART vinculada']).map(item => (
                              <label key={item} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100 text-[11px] text-slate-600">
                                <input type="checkbox" className="rounded text-emerald-600" />
                                {item}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Análise do Fiscalizador</p>
                          <textarea 
                            className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm min-h-[100px] focus:ring-2 focus:ring-emerald-500/20"
                            placeholder={`Descreva a análise técnica para ${peca}...`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">3. Ofício de Pendências</h2>
              </div>

              <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-200 text-center space-y-6">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-slate-900">Necessário emitir pendências?</h3>
                  <p className="text-sm text-slate-500 max-w-md mx-auto">
                    Ao selecionar esta opção, o formulário será salvo como rascunho e você será redirecionado para a criação do Ofício de Pendências.
                  </p>
                </div>

                <label className="inline-flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:border-emerald-500 transition-all">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 text-emerald-600 rounded"
                    checked={formData.temOficioPendencia}
                    onChange={(e) => handleInputChange('temOficioPendencia', e.target.checked)}
                  />
                  <span className="font-bold text-slate-700">Sim, lavrar Ofício de Pendências</span>
                </label>

                {!readOnly && formData.temOficioPendencia && (
                  <div className="space-y-4 animate-in zoom-in-95 duration-300">
                    <button 
                      type="button"
                      onClick={() => handleSave('Ofício de Pendências')}
                      disabled={loading || readOnly}
                      className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-amber-700 transition-all shadow-xl shadow-amber-600/20 disabled:opacity-50"
                    >
                      Gerar Ofício e Salvar Rascunho
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <FileText size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">4. Análise Técnica</h2>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parecer Técnico Detalhado</label>
                <textarea 
                  className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[2rem] min-h-[300px] focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  value={formData.analiseTecnica}
                  onChange={(e) => handleInputChange('analiseTecnica', e.target.value)}
                  placeholder="Insira aqui a análise técnica completa..."
                />
              </div>
            </div>
          )}

          {activeStep === 5 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <CheckCircle size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">5. Conclusão</h2>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Considerações Finais</label>
                <textarea 
                  className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[2rem] min-h-[200px] focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  value={formData.conclusao}
                  onChange={(e) => handleInputChange('conclusao', e.target.value)}
                  placeholder="Insira a conclusão do parecer..."
                />
              </div>
            </div>
          )}

          {activeStep === 6 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                  <ClipboardList size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">6. Revisão do Parecer</h2>
              </div>

              <div className="space-y-6">
                <div className="bg-white border border-slate-200 shadow-2xl rounded-[2rem] overflow-hidden max-w-4xl mx-auto">
                  <div className="p-12 text-slate-800 font-serif leading-relaxed text-sm space-y-6">
                      {/* Header Simulation */}
                    <div className="text-center space-y-1 mb-8">
                      <p className="font-bold uppercase">Estado de Mato Grosso</p>
                      <p className="font-bold uppercase">Secretaria de Estado de Meio Ambiente</p>
                      <p className="font-bold uppercase">
                        {formData.tipo_documento || 'Parecer Técnico'} Nº {formData.numParecerTecnico || formData.processo || '___'} – CSB/CCRH/SEMA-MT
                      </p>
                    </div>

                    <div className="space-y-4">
                      <p className="font-bold">Processo n° {formData.processo || '___'}</p>
                      
                      <p className="text-justify">
                        <span className="font-bold">Assunto: </span>
                        {formData.tipo_documento || 'Parecer Técnico'} da análise do Relatório de {formData.pecasTecnicas?.join(', ') || '___'} do empreendimento {formData.nomeBarragem || formData.localizacaoEmpreendimento || '___'} do empreendedor {formData.identificacaoEmpreendedor || '___'} no município de {formData.municipio || '___'}/MT sob as coordenadas {`Lat: ${formData.coordenadasGMS.lat.g}°${formData.coordenadasGMS.lat.m}'${formData.coordenadasGMS.lat.s}" Long: ${formData.coordenadasGMS.long.g}°${formData.coordenadasGMS.long.m}'${formData.coordenadasGMS.long.s}"`}.
                      </p>

                      <div className="space-y-1 pt-4">
                        <p className="font-bold uppercase border-b border-slate-200 pb-1">Dados do Empreendimento</p>
                        <div className="grid grid-cols-1 gap-1 pt-2">
                          <p><span className="font-bold">Empreendedor:</span> {formData.identificacaoEmpreendedor || '___'}</p>
                          <p><span className="font-bold">CPF/CNPJ:</span> {formData.cpfCnpj || '___'}</p>
                          <p><span className="font-bold">Empreendimento (Fazenda/Barragem):</span> {formData.nomeBarragem || formData.localizacaoEmpreendimento || '___'}</p>
                          <p><span className="font-bold">Nº CAR:</span> {formData.numCarMt || '___'}</p>
                          <p><span className="font-bold">Município/UF:</span> {formData.municipio || '___'}/MT</p>
                          <p><span className="font-bold">Finalidade do barramento:</span> {formData.usoPreponderante === 'Outro' ? formData.usoPreponderanteOutro : formData.usoPreponderante || '___'}</p>
                          <p><span className="font-bold">Situação do empreendimento:</span> {formData.situacaoEmpreendimento === 'Outro' ? formData.situacaoEmpreendimentoOutro : formData.situacaoEmpreendimento || '___'}</p>
                          <p><span className="font-bold">Nome do Curso d’água barrado:</span> {formData.nomeCursoAguaBarrado || '___'}</p>
                          <p><span className="font-bold">Código SNISB:</span> {formData.snisb || '___'}</p>
                          <p><span className="font-bold">Nº do Processo:</span> {formData.processo || '___'}</p>
                          <p><span className="font-bold">Coordenadas:</span> {`Lat: ${formData.coordenadasGMS.lat.g}°${formData.coordenadasGMS.lat.m}'${formData.coordenadasGMS.lat.s}" Long: ${formData.coordenadasGMS.long.g}°${formData.coordenadasGMS.long.m}'${formData.coordenadasGMS.long.s}"`}</p>
                          <p><span className="font-bold">Portaria de Classificação:</span> {formData.portariaClassificacao || '___'}</p>
                          <p><span className="font-bold">Classe / DPA / CRI:</span> {formData.classificacaoBarragem || '___'} | DPA: {formData.classificacaoDPA || '___'} | CRI: {formData.classificacaoCRI || '___'}</p>
                          <p><span className="font-bold">Altura do talude:</span> {formData.alturaBarragem || '___'} m</p>
                          <p><span className="font-bold">Largura do coroamento:</span> {formData.larguraCoroamento || '___'} m</p>
                          <p><span className="font-bold">Volume armazenado de projeto:</span> {formData.volumeBarragem || '___'} hm³</p>
                          <p><span className="font-bold">Comprimento do Coroamento (m):</span> {formData.comprimentoCoroamento || '___'} m</p>
                        </div>
                        <p className="text-xs italic pt-2">
                          *Dados apresentados pelo responsável técnico {[...(formData.responsaveisTecnicos || []), ...(formData.rtOutros || []).filter(Boolean)].join(', ') || formData.responsavelTecnico || '___'} mediado pela ART CREA/MT n° {formData.artCreaMt || '___'}
                        </p>
                      </div>

                      <div className="space-y-4 pt-4">
                        <p className="font-bold uppercase">Introdução</p>
                        <p className="text-justify">
                          De acordo com a Política Nacional de Segurança de Barragens, Lei nº 12.334, de 20 de setembro de 2010, em seu artigo 5º inciso I, a fiscalização da segurança de barragens compete à entidade que outorga o direito de uso dos recursos hídricos, observado o domínio do corpo hídrico, quando o objeto for de acumulação de água, exceto para fins de aproveitamento hidrelétrico. A fiscalização deve se basear em análise documental, no caso em tela, a análise trata-se especificamente da análise de {formData.pecasTecnicas?.join(', ') || '___'}, apresentado mediante protocolo n° {formData.numProtocoloAnalisado || '___'} de {formData.dataProtocolo || '___'}.
                        </p>
                        <p className="text-justify">
                          No estado de Mato Grosso, os critérios técnicos a serem aplicados e os procedimentos administrativos estão estabelecidos na Resolução CNRH nº 241/2024, Resolução ANA nº 132/2016, Instrução Normativa nº 08, de 18 de dezembro de 2023 e na Resolução nº 163/2023 do CEHIDRO.
                        </p>
                        
                        <div className="space-y-2 py-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Particularidade na Introdução</label>
                          <textarea 
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-serif"
                            value={formData.introducaoParticularidade}
                            onChange={(e) => handleInputChange('introducaoParticularidade', e.target.value)}
                            placeholder={`Ex: O empreendimento conta com a Portaria de Classificação n° ${formData.portariaClassificacao || '___'} que define que ...`}
                          />
                        </div>

                        <p className="text-justify">
                          Este {formData.tipo_documento || 'Parecer Técnico'} vem analisar os documentos apresentados mediante o protocolo n° {formData.numProtocoloAnalisado || '___'} de {formData.dataProtocolo || '___'} pelo responsável técnico {[...(formData.responsaveisTecnicos || []), ...(formData.rtOutros || []).filter(Boolean)].join(', ') || formData.responsavelTecnico || '___'} mediado pela ART CREA/MT n° {formData.artCreaMt || '___'} para a atividade de {formData.artAtividade || '___'}.
                        </p>
                      </div>

                      {/* APRESENTAÇÃO DO RELATÓRIO */}
                      {formData.pecasTecnicas.map((peca, idx) => (
                        <div key={idx} className="space-y-4 pt-4">
                          <p className="font-bold uppercase">{idx + 2}. APRESENTAÇÃO DO RELATÓRIO DE {peca.toUpperCase()}</p>
                          <p className="text-justify">
                            Os documentos analisados foram apresentados pelo responsável técnico {[...(formData.responsaveisTecnicos || []), ...(formData.rtOutros || []).filter(Boolean)].join(', ') || formData.responsavelTecnico || '___'} mediado pela ART CREA/MT n° {formData.artCreaMt || '___'} para a atividade de {formData.artAtividade || '___'}, protocolizados em {formData.dataProtocolo || '___'} sob numeração de {formData.numProtocoloAnalisado || '___'}, juntados ao processo administrativo n° {formData.processo || '___'}.
                          </p>
                          <p className="text-justify">
                            Foi apresentado Relatório de {peca}. Conforme relatório apresentado, a inspeção visual ocorreu em {formData.dataInspecao || '___'}, sob responsabilidade técnica de {[...(formData.responsaveisTecnicos || []), ...(formData.rtOutros || []).filter(Boolean)].join(', ') || formData.responsavelTecnico || '___'}.
                          </p>
                          <p className="text-justify">
                            Conforme informações prestadas, o barramento localizado nas coordenadas Lat: {formData.coordenadasGMS.lat.g}°{formData.coordenadasGMS.lat.m}'{formData.coordenadasGMS.lat.s}" Long: {formData.coordenadasGMS.long.g}°{formData.coordenadasGMS.long.m}'{formData.coordenadasGMS.long.s}", possui altura de {formData.alturaBarragem || '___'}m, comprimento de {formData.comprimentoCoroamento || '___'}m, capacidade do reservatório {formData.volumeBarragem || '___'} hm³.
                          </p>
                          <p className="text-justify">
                            Conforme o Parecer Técnico n° {formData.parecerClassificacao || '___'} e Portaria de Classificação n° {formData.portariaClassificacao || '___'}, o DPA encontra-se graduado como {formData.classificacaoDPA || '___'}.
                          </p>
                          
                          {formData.classificacaoDPA.toLowerCase().includes('não enquadrado') && (
                            <div className="space-y-2 py-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nota DPA (Não Enquadrado)</label>
                              <textarea 
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-serif"
                                value={formData.dpaNaoPnsbTexto}
                                onChange={(e) => handleInputChange('dpaNaoPnsbTexto', e.target.value)}
                              />
                            </div>
                          )}

                          <div className="space-y-2 py-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Conclusão do Relatório de {peca}</label>
                            <textarea 
                              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-serif"
                              value={formData.apresentacaoRelatorioConclusao}
                              onChange={(e) => handleInputChange('apresentacaoRelatorioConclusao', e.target.value)}
                            />
                          </div>
                        </div>
                      ))}

                      {/* PARECER */}
                      <div className="space-y-4 pt-4">
                        <p className="font-bold uppercase">{formData.pecasTecnicas.length + 2}. PARECER</p>
                        <p className="text-justify">
                          Os documentos em análise foram protocolados sob n° {formData.numProtocoloAnalisado || '___'} em {formData.dataProtocolo || '___'} juntados ao processo administrativo n° {formData.processo || '___'}, elaborado por {[...(formData.responsaveisTecnicos || []), ...(formData.rtOutros || []).filter(Boolean)].join(', ') || formData.responsavelTecnico || '___'} mediado pela ART CREA/MT n° {formData.artCreaMt || '___'} para a atividade de {formData.artAtividade || '___'}.
                        </p>
                        <p className="text-justify">
                          Conforme informações prestadas pelo responsável técnico, as anomalias a serem adequadas não apresentam nível de perigo de alerta ou emergência à barragem, porém faz-se necessária adoção de adequações para que não evoluam, portanto, entendemos que o Relatório Técnico de {formData.pecasTecnicas.join(', ') || '___'} contemplou os itens mínimos a serem apreciados.
                        </p>
                        <p className="text-justify">
                          Recomendamos que sejam realizadas as adequações e manutenções indicadas no Relatório de {formData.pecasTecnicas.join(', ') || '___'} encaminhado por {[...(formData.responsaveisTecnicos || []), ...(formData.rtOutros || []).filter(Boolean)].join(', ') || formData.responsavelTecnico || '___'}. Mesmo a barragem não estando submetida a PNSB, é de suma importância que sejam realizadas as adequações e manutenções conforme as boas práticas da engenharia, estando o empreendedor passível de atividades de fiscalizações do órgão regulador.
                        </p>
                        <p className="text-justify">
                          A aprovação do rol documental apresentado não isenta de uma possível reclassificação futura, devendo o empreendedor informar ao órgão ser houver instalação de estruturas civis na área afetada a jusante. Ainda, é responsabilidade do empreendedor a gestão de segurança da barragem e reparação de danos decorrentes de seu rompimento, vazamento ou mau funcionamento independentemente da existência de culpa.
                        </p>
                      </div>

                      {/* TÓPICOS EXTRAS */}
                      {formData.topicosExtras.map((topico, tIdx) => (
                        <div key={topico.id} className="space-y-4 pt-4 relative group">
                          <button 
                            type="button"
                            onClick={() => {
                              const newTopicos = formData.topicosExtras.filter(t => t.id !== topico.id);
                              handleInputChange('topicosExtras', newTopicos);
                            }}
                            className="absolute -right-12 top-4 p-2 text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X size={16} />
                          </button>
                          <div className="space-y-2">
                            <input 
                              className="w-full bg-transparent font-bold uppercase border-b border-slate-200 focus:border-emerald-500 outline-none"
                              value={topico.titulo}
                              onChange={(e) => {
                                const newTopicos = [...formData.topicosExtras];
                                newTopicos[tIdx].titulo = e.target.value;
                                handleInputChange('topicosExtras', newTopicos);
                              }}
                              placeholder="TÍTULO DO TÓPICO EXTRA"
                            />
                            <textarea 
                              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-serif"
                              value={topico.conteudo}
                              onChange={(e) => {
                                const newTopicos = [...formData.topicosExtras];
                                newTopicos[tIdx].conteudo = e.target.value;
                                handleInputChange('topicosExtras', newTopicos);
                              }}
                              placeholder="Conteúdo do tópico extra..."
                            />
                          </div>
                        </div>
                      ))}

                      <button 
                        type="button"
                        onClick={() => {
                          const newTopicos = [...formData.topicosExtras, { id: crypto.randomUUID(), titulo: 'CONDICIONANTES', conteudo: '' }];
                          handleInputChange('topicosExtras', newTopicos);
                        }}
                        className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-widest hover:border-emerald-500 hover:text-emerald-500 transition-all mt-4"
                      >
                        + Adicionar Tópico Extra (ex: Condicionantes)
                      </button>

                      {/* DISPOSIÇÕES FINAIS */}
                      <div className="space-y-4 pt-4">
                        <p className="font-bold uppercase">{formData.pecasTecnicas.length + formData.topicosExtras.length + 3}. DISPOSIÇÕES FINAIS</p>
                        <p className="text-justify">
                          É responsabilidade do empreendedor comunicar ao fiscalizador sobre qualquer alteração na sua barragem, bem como, fazer a gestão de segurança da barragem e reparação de danos decorrentes de seu rompimento, vazamento ou mau funcionamento independentemente da existência de culpa.
                        </p>
                        <p className="text-justify">
                          O empreendedor deverá permitir o acesso irrestrito do órgão fiscalizador e dos órgãos integrantes do Sistema Nacional de Proteção e Defesa Civil (SINPDEC) ao local da barragem e à sua documentação de segurança.
                        </p>
                        <p className="text-justify">
                          Salienta-se que este parecer não autoriza obras no barramento e que o empreendedor deve obter as licenças antes de quaisquer obras em conformidade com a lei ambiental vigente.
                        </p>
                      </div>

                      <div className="pt-12 text-right">
                        <p>Cuiabá, {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Edição Manual da Revisão Final (Opcional — deixe vazio para usar o texto dinâmico em código)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleInputChange('revisaoParecer', dynamicParecerText)}
                        disabled={readOnly}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100 flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw size={11} /> Carregar Texto Dinâmico para Edição
                      </button>
                      {formData.revisaoParecer && (
                        <button
                          type="button"
                          onClick={() => handleInputChange('revisaoParecer', '')}
                          disabled={readOnly}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 transition-colors"
                        >
                          Usar Padrão Automático
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea 
                    className="w-full p-6 bg-white border border-slate-200 rounded-[2rem] min-h-[220px] font-serif text-sm text-slate-800"
                    value={formData.revisaoParecer}
                    onChange={(e) => handleInputChange('revisaoParecer', e.target.value)}
                    disabled={readOnly}
                    placeholder={dynamicParecerText}
                  />
                </div>
              </div>
            </div>
          )}

          {activeStep === 7 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
               <div className="flex flex-col items-center gap-6 py-12">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                  <CheckCircle size={48} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">7. Conclusão Final</h2>
                  <p className="text-slate-500 max-w-md mx-auto">
                    Documento pronto para emissão. Verifique todos os dados antes de concluir.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                  {!readOnly && (
                    <>
                      <button 
                        onClick={() => handleSave('Concluído')} 
                        className="py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20"
                      >
                        Concluir e Finalizar
                      </button>
                      <button 
                        onClick={() => handleSave('Rascunho')}
                        className="py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-50 transition-all"
                      >
                        Salvar Rascunho
                      </button>
                    </>
                  )}
                  <button 
                    onClick={handleDownloadPDF}
                    className="py-4 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-rose-700 transition-all shadow-xl shadow-rose-600/20 flex items-center justify-center gap-2"
                  >
                    <Download size={16} /> Exportar PDF
                  </button>
                  <button 
                    onClick={handleDownloadDocx}
                    className="py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    <Download size={16} /> Exportar DOCX
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between">
            <button
              onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
              disabled={activeStep === 1}
              className="flex items-center gap-2 px-6 py-3 text-slate-400 font-bold hover:text-slate-600 disabled:opacity-0 transition-all"
            >
              <ChevronLeft size={20} /> Anterior
            </button>
            {activeStep < 7 ? (
              <button
                onClick={() => setActiveStep(prev => Math.min(7, prev + 1))}
                className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg"
              >
                Próximo <ChevronRight size={20} />
              </button>
            ) : (
              <div className="w-20"></div>
            )}
          </div>

        </div>
      </div>

      <SolicitarVistoriaModal
        isOpen={isSolicitarVistoriaOpen}
        onClose={() => setIsSolicitarVistoriaOpen(false)}
        prefill={{
          tipoReferencia: 'parecer',
          referenciaId: formData.id || '',
          processo: formData.processo || formData.numProtocoloAnalisado || '',
          barragemId: formData.barragemId || '',
          nomeBarragem: formData.nomeBarragem || '',
          municipio: formData.municipio || '',
          cursoAgua: formData.nomeCursoAguaBarrado || '',
          coordenadas: formatCoordenadasGmsString(formData.coordenadasGMS),
          empreendedorId: formData.empreendedorId || '',
          empreendedorNome: formData.identificacaoEmpreendedor || '',
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

export default OpinionForm;
