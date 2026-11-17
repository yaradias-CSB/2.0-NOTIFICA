import React, { useState, useEffect, useContext, useMemo } from 'react';
import { 
  Save, Download, ArrowLeft, FileText, Plus, Trash2, X, CheckCircle, Loader2, 
  Database, Info, ChevronRight, ChevronLeft, MapPin, ClipboardList, Shield, AlertTriangle,
  ChevronDown, ChevronUp, Check, Search, User, ShieldCheck, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

interface OpinionFormProps {
  onBack: () => void;
  onNavigate?: (view: 'dashboard' | 'list' | 'form' | 'oficio' | 'info' | 'users', doc?: any) => void;
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

  const OpinionForm: React.FC<OpinionFormProps> = ({ onBack, onNavigate, initialData, readOnly }) => {
  const { refreshData, saveParecer } = useContext(DataContext);
  const { syncEntitiesFromForm } = useContext(EcosystemContext);
  const [loading, setLoading] = useState(false);

  const [activeStep, setActiveStep] = useState(1);
  const [formData, setFormData] = useState<ParecerData>(() => {
    if (initialData) {
      return { ...INITIAL_STATE, ...initialData };
    }
    return INITIAL_STATE;
  });

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

  useEffect(() => {
    if (activeStep === 6 && !formData.revisaoParecer) {
      const rts = [...(formData.responsaveisTecnicos || []), ...(formData.rtOutros || []).filter(n => n.trim() !== '')].join(', ');
      const template = `PARECER TÉCNICO Nº ${formData.processo || '___'}/SEMA-MT\n\n` +
        `1. INFORMAÇÕES GERAIS\n` +
        `Empreendedor: ${formData.identificacaoEmpreendedor || '___'}\n` +
        `CPF/CNPJ: ${formData.cpfCnpj || '___'}\n` +
        `Localização: ${formData.localizacaoEmpreendimento || '___'}\n` +
        `Município: ${formData.municipio || '___'}\n` +
        `Responsável Técnico: ${rts || '___'}\n` +
        `ART CREA/MT: ${formData.artCreaMt || '___'}\n\n` +
        `4. ANÁLISE TÉCNICA\n` +
        `${formData.analiseTecnica || '___'}\n\n` +
        `5. CONCLUSÃO\n` +
        `${formData.conclusao || '___'}`;
      setFormData(prev => ({ ...prev, revisaoParecer: template }));
    }
  }, [activeStep, formData.processo, formData.identificacaoEmpreendedor, formData.cpfCnpj, formData.localizacaoEmpreendimento, formData.municipio, formData.analiseTecnica, formData.conclusao, formData.revisaoParecer, formData.responsaveisTecnicos, formData.rtOutros, formData.artCreaMt]);

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

  const filteredRTs = useMemo(() => {
    return OPS_RESPONSAVEL_TECNICO.filter(name => 
      name.toLowerCase().includes(rtSearch.toLowerCase())
    );
  }, [rtSearch]);

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

  const handleSave = async (status: 'Rascunho' | 'Concluído' | 'Ofício de Pendências') => {
    // Basic Validation
    if (!formData.identificacaoEmpreendedor || !formData.cpfCnpj || !formData.processo || !formData.municipio) {
      alert('Por favor, preencha os campos obrigatórios (Empreendedor, CPF/CNPJ, Processo e Município).');
      return;
    }

    setLoading(true);
    try {
      const sanitizedFormData = sanitizeObject(formData);
      const rtList = [
        ...(sanitizedFormData.responsaveisTecnicos || []),
        ...(sanitizedFormData.rtOutros || []).filter((n) => n.trim() !== ''),
      ].map((nome) => ({
        nome,
        registroProfissional: sanitizedFormData.registroProfissionalRT || sanitizedFormData.artCreaMt,
        formacaoProfissional: sanitizedFormData.formacaoProfissionalRT,
        cpf: sanitizedFormData.cpfRT,
      }));

      const syncRes = await syncEntitiesFromForm({
        existingEmpreendedorId: sanitizedFormData.empreendedorId,
        existingBarragemId: sanitizedFormData.barragemId,
        empreendedorNome: sanitizedFormData.identificacaoEmpreendedor,
        cpfCnpj: sanitizedFormData.cpfCnpj,
        logradouro: sanitizedFormData.logradouro,
        numero: sanitizedFormData.numero,
        complemento: sanitizedFormData.complemento,
        bairro: sanitizedFormData.bairro,
        municipio: sanitizedFormData.municipio,
        cep: sanitizedFormData.cep,
        carMt: sanitizedFormData.numCarMt,
        nomeBarragem: sanitizedFormData.nomeBarragem || sanitizedFormData.localizacaoEmpreendimento,
        codigoSnisb: sanitizedFormData.snisb,
        processo: sanitizedFormData.processo,
        cursoAguaBarrado: sanitizedFormData.nomeCursoAguaBarrado,
        usoPreponderante: sanitizedFormData.usoPreponderante,
        situacaoEmpreendimento: sanitizedFormData.situacaoEmpreendimento,
        tipoBarragem: sanitizedFormData.tipoBarragem,
        coordenadasGMS: sanitizedFormData.coordenadasGMS,
        altura: sanitizedFormData.alturaBarragem,
        volume: sanitizedFormData.volumeBarragem,
        larguraCoroamento: sanitizedFormData.larguraCoroamento,
        comprimentoCoroamento: sanitizedFormData.comprimentoCoroamento,
        classificacaoBarragem: sanitizedFormData.classificacaoBarragem,
        classificacaoDPA: sanitizedFormData.classificacaoDPA,
        classificacaoCRI: sanitizedFormData.classificacaoCRI,
        portariaClassificacao: sanitizedFormData.portariaClassificacao,
        parecerClassificacao: sanitizedFormData.parecerClassificacao,
        responsaveisTecnicos: rtList,
        analista: sanitizedFormData.analistas?.[0] || 'Sistema Local',
      });

      const resolvedEmpreendedorId = syncRes.empreendedorId || sanitizedFormData.empreendedorId;
      const resolvedBarragemId = syncRes.barragemId || sanitizedFormData.barragemId;
      const resolvedRtIds =
        syncRes.responsavelTecnicoIds.length > 0
          ? syncRes.responsavelTecnicoIds
          : sanitizedFormData.responsavelTecnicoIds;

      const res = await saveParecer({
        ...sanitizedFormData,
        id: formData.id || undefined,
        empreendedorId: resolvedEmpreendedorId,
        barragemId: resolvedBarragemId,
        responsavelTecnicoIds: resolvedRtIds,
        sourceSystem: sanitizedFormData.sourceSystem || CURRENT_SYSTEM_ID,
        analista: formData.analistas?.[0] || 'Sistema Local',
        status: status,
        dataParecer: new Date().toISOString().split('T')[0],
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
          empreendedorId: resolvedEmpreendedorId,
          barragemId: resolvedBarragemId,
          responsavelTecnicoIds: resolvedRtIds,
          sourceSystem: savedDoc.sourceSystem || CURRENT_SYSTEM_ID,
        }));
      }

      await refreshData?.();

      alert(`Parecer salvo como ${status === 'Ofício de Pendências' ? 'Rascunho' : status} com sucesso!`);
      
      if (status === 'Ofício de Pendências') {
        alert('Redirecionando para Ofício de Pendências...');
        // Use onNavigate instead of window.location.href
        if (onNavigate) {
          onNavigate('oficio', {
            parecerId: formData.id || savedDoc?.id,
            processo: formData.processo,
            identificacaoEmpreendedor: formData.identificacaoEmpreendedor,
            tipo_documento: '1° Oficio de Pendencias'
          });
        }
      }

      if (status === 'Concluído') onBack();
    } catch (error: any) {
      console.error('Erro ao salvar parecer:', error);
      alert(`Erro ao salvar parecer: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = () => {
    generateParecerDoc(formData);
    logActivity({
      action: 'DOWNLOAD_PARECER',
      details: `Download do Parecer Técnico efetuado. Processo: ${formData.processo || 'S/P'}. Empreendedor: ${formData.identificacaoEmpreendedor || '---'}`
    });
  };

  const handleDownloadPDF = async () => {
    try {
      await generateParecerPDF(formData);
      logActivity({
        action: 'DOWNLOAD_PARECER',
        details: `Download do Parecer Técnico (PDF) efetuado. Processo: ${formData.processo || 'S/P'}. Empreendedor: ${formData.identificacaoEmpreendedor || '---'}`
      });
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar o arquivo PDF.');
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
      {/* Sticky Top Section (Header + Stepper) */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Parecer Técnico <span className="text-emerald-600">Fiscalização-CSB</span>
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {formData.id ? `Editando: ${formData.protocolo}` : 'Novo Documento'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!readOnly && (
              <>
                <button 
                  onClick={() => handleSave('Rascunho')} 
                  disabled={loading}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar Rascunho
                </button>
                <button 
                  onClick={() => handleSave('Concluído')} 
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Concluir Parecer
                </button>
              </>
            )}
            <button 
              onClick={handleDownloadPDF}
              className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 transition-all flex items-center gap-2 shadow-lg shadow-rose-600/20"
              title="Exportar Parecer Técnico em PDF"
            >
              <Download size={14} />
              Exportar PDF
            </button>
            <button 
              onClick={handleDownloadDocx}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
            >
              <Download size={14} />
              Exportar Word
            </button>
          </div>
        </div>

        {/* Stepper */}
        <div className="py-4 border-t border-slate-100">
          <div className="max-w-4xl mx-auto px-4 md:px-6">
            <div className="flex justify-between items-center relative overflow-x-auto pb-2 md:pb-0 custom-scrollbar gap-4 md:gap-0">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 -translate-y-1/2 z-0 hidden md:block"></div>
              {steps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`relative z-10 flex flex-col items-center gap-2 group min-w-[80px] md:min-w-0`}
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
                  <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest text-center leading-tight ${
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
      <div className="max-w-4xl mx-auto px-6 mt-8">
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8 md:p-12">
          
          {activeStep === 1 && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Info size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">1. Informações Gerais</h2>
              </div>

              <AdministraEntityPicker
                readOnly={readOnly}
                currentDocumentId={formData.id}
                selectedEmpreendedorId={formData.empreendedorId}
                selectedBarragemId={formData.barragemId}
                cpfCnpj={formData.cpfCnpj}
                codigoSnisb={formData.snisb}
                nomeBarragem={formData.nomeBarragem || formData.localizacaoEmpreendimento}
                onSelectEmpreendedor={(emp: EmpreendedorCanonico) => {
                  const matchedMun = matchMunicipioMT(emp.municipio);
                  setFormData(prev => ({
                    ...prev,
                    empreendedorId: emp.id,
                    identificacaoEmpreendedor: emp.nome || prev.identificacaoEmpreendedor,
                    cpfCnpj: emp.cpfCnpj || prev.cpfCnpj,
                    logradouro: emp.logradouro || prev.logradouro,
                    numero: emp.numero || prev.numero,
                    complemento: emp.complemento || prev.complemento,
                    bairro: emp.bairro || prev.bairro,
                    cidadeUf: emp.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : prev.cidadeUf,
                    municipio: matchedMun || prev.municipio,
                    cep: emp.cep || prev.cep,
                    numCarMt: emp.carMt || prev.numCarMt,
                  }));
                }}
                onSelectBarragem={(bar: BarragemCanonica) => {
                  setFormData(prev => ({
                    ...prev,
                    barragemId: bar.id,
                    empreendedorId: bar.empreendedorId || prev.empreendedorId,
                    nomeBarragem: bar.nomeBarragem || prev.nomeBarragem,
                    localizacaoEmpreendimento: bar.nomeBarragem || prev.localizacaoEmpreendimento,
                    snisb: bar.codigoSnisb || prev.snisb,
                    municipio: bar.municipio || prev.municipio,
                    coordenadasGMS: bar.coordenadasGMS || prev.coordenadasGMS,
                    situacaoEmpreendimento: bar.situacaoEmpreendimento || prev.situacaoEmpreendimento,
                    tipoBarragem: bar.tipoBarragem || prev.tipoBarragem,
                    nomeCursoAguaBarrado: bar.cursoAguaBarrado || prev.nomeCursoAguaBarrado,
                    usoPreponderante: bar.usoPreponderante || prev.usoPreponderante,
                    alturaBarragem: bar.altura || prev.alturaBarragem,
                    volumeBarragem: bar.volume || prev.volumeBarragem,
                    larguraCoroamento: bar.larguraCoroamento || prev.larguraCoroamento,
                    comprimentoCoroamento: bar.comprimentoCoroamento || prev.comprimentoCoroamento,
                    classificacaoBarragem: bar.classificacaoBarragem || prev.classificacaoBarragem,
                    classificacaoDPA: bar.classificacaoDPA || prev.classificacaoDPA,
                    classificacaoCRI: bar.classificacaoCRI || prev.classificacaoCRI,
                    portariaClassificacao: bar.portariaClassificacao || prev.portariaClassificacao,
                    parecerClassificacao: bar.parecerClassificacao || prev.parecerClassificacao,
                  }));
                }}
                onSelectRT={(rt: ResponsavelTecnicoCanonico) => {
                  setFormData(prev => {
                    const isKnown = OPS_RESPONSAVEL_TECNICO.includes(rt.nome);
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
                      artCreaMt: prev.artCreaMt || rt.registroProfissional || '',
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

              {/* Informações do Empreendedor */}
              <div className="space-y-6">
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => toggleSection('empreendedor')}
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-xs">1</div>
                    <h3 className="text-sm font-black uppercase tracking-widest">Informações do Empreendedor</h3>
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
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Tipo de Documento</label>
                          <input 
                            type="text"
                            className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-300 rounded-xl font-bold text-slate-700 shadow-sm outline-none"
                            value="Parecer Técnico"
                            readOnly
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Processo SEMA/MT</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-700 shadow-sm"
                            value={formData.processo}
                            onChange={(e) => handleInputChange('processo', e.target.value)}
                            disabled={readOnly}
                            placeholder="Ex: 123456/2024"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Identificação do Empreendedor</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-700 shadow-sm"
                            value={formData.identificacaoEmpreendedor}
                            onChange={(e) => handleInputChange('identificacaoEmpreendedor', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">CPF / CNPJ</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold text-slate-700 shadow-sm"
                            value={formData.cpfCnpj}
                            onChange={(e) => handleInputChange('cpfCnpj', e.target.value)}
                            disabled={readOnly}
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
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Empreendimento (Fazenda/Barragem)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm"
                            value={formData.localizacaoEmpreendimento}
                            onChange={(e) => handleInputChange('localizacaoEmpreendimento', e.target.value)}
                            disabled={readOnly}
                            placeholder="Ex: Fazenda Santa Fé"
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

                {formData.temOficioPendencia && (
                  <div className="space-y-4 animate-in zoom-in-95 duration-300">
                    <button 
                      onClick={() => handleSave('Ofício de Pendências')}
                      className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-amber-700 transition-all shadow-xl shadow-amber-600/20"
                    >
                      Gerar Ofício e Salvar Rascunho
                    </button>
                    <div className="pt-6 border-t border-slate-200 flex justify-center gap-4">
                      <button className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all">Visualizar</button>
                      <button className="px-4 py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition-all">Editar</button>
                      <button className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all">Excluir</button>
                    </div>
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
                      <p className="font-bold uppercase">Parecer Técnico – CSB/CCRH/SEMA-MT</p>
                    </div>

                    <div className="space-y-4">
                      <p className="font-bold">Processo n° {formData.processo || '___'}</p>
                      
                      <p className="text-justify">
                        <span className="font-bold">Assunto: </span>
                        Parecer Técnico da análise do Relatório de {formData.pecasTecnicas?.join(', ') || '___'} do empreendimento {formData.localizacaoEmpreendimento || '___'} do empreendedor {formData.identificacaoEmpreendedor || '___'} no município de {formData.municipio || '___'}/MT sob as coordenadas {`Lat: ${formData.coordenadasGMS.lat.g}°${formData.coordenadasGMS.lat.m}'${formData.coordenadasGMS.lat.s}" Long: ${formData.coordenadasGMS.long.g}°${formData.coordenadasGMS.long.m}'${formData.coordenadasGMS.long.s}"`}.
                      </p>

                      <div className="space-y-1 pt-4">
                        <p className="font-bold uppercase border-b border-slate-200 pb-1">Dados do Empreendimento</p>
                        <div className="grid grid-cols-1 gap-1 pt-2">
                          <p><span className="font-bold">Empreendedor:</span> {formData.identificacaoEmpreendedor || '___'}</p>
                          <p><span className="font-bold">CPF/CNPJ:</span> {formData.cpfCnpj || '___'}</p>
                          <p><span className="font-bold">Empreendimento (Fazenda/Barragem):</span> {formData.localizacaoEmpreendimento || '___'}</p>
                          <p><span className="font-bold">Nº CAR:</span> {formData.numCarMt || '___'}</p>
                          <p><span className="font-bold">Município/UF:</span> {formData.municipio || '___'}/MT</p>
                          <p><span className="font-bold">Finalidade do barramento:</span> {formData.usoPreponderante === 'Outro' ? formData.usoPreponderanteOutro : formData.usoPreponderante || '___'}</p>
                          <p><span className="font-bold">Situação do empreendimento:</span> {formData.situacaoEmpreendimento === 'Outro' ? formData.situacaoEmpreendimentoOutro : formData.situacaoEmpreendimento || '___'}</p>
                          <p><span className="font-bold">Nome do Curso d’água barrado:</span> {formData.nomeCursoAguaBarrado || '___'}</p>
                          <p><span className="font-bold">Código SNISB:</span> {formData.snisb || '___'}</p>
                          <p><span className="font-bold">Nº do Processo:</span> {formData.processo || '___'}</p>
                          <p><span className="font-bold">Coordenadas:</span> {`Lat: ${formData.coordenadasGMS.lat.g}°${formData.coordenadasGMS.lat.m}'${formData.coordenadasGMS.lat.s}" Long: ${formData.coordenadasGMS.long.g}°${formData.coordenadasGMS.long.m}'${formData.coordenadasGMS.long.s}"`}</p>
                          <p><span className="font-bold">Portaria de Classificação:</span> {formData.portariaClassificacao || '___'}</p>
                          <p><span className="font-bold">Classe da Barragem:</span> {formData.classificacaoBarragem || '___'}</p>
                          <p><span className="font-bold">Altura do talude:</span> {formData.alturaBarragem || '___'} m</p>
                          <p><span className="font-bold">Largura do coroamento:</span> {formData.larguraCoroamento || '___'} m</p>
                          <p><span className="font-bold">Volume armazenado de projeto:</span> {formData.volumeBarragem || '___'} hm³</p>
                          <p><span className="font-bold">Comprimento do Coroamento (m):</span> {formData.comprimentoCoroamento || '___'} m</p>
                        </div>
                        <p className="text-xs italic pt-2">
                          *Dados apresentados pelo responsável técnico {formData.responsavelTecnico || '___'} mediado pela ART CREA/MT n° {formData.artCreaMt || '___'}
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
                          Este Parecer Técnico vem analisar os documentos apresentados mediante o protocolo n° {formData.numProtocoloAnalisado || '___'} de {formData.dataProtocolo || '___'} pelo responsável técnico {formData.responsavelTecnico || '___'} mediado pela ART CREA/MT n° {formData.artCreaMt || '___'} para a atividade de {formData.artAtividade || '___'}.
                        </p>
                      </div>

                      {/* APRESENTAÇÃO DO RELATÓRIO */}
                      {formData.pecasTecnicas.map((peca, idx) => (
                        <div key={idx} className="space-y-4 pt-4">
                          <p className="font-bold uppercase">{idx + 2}. APRESENTAÇÃO DO RELATÓRIO DE {peca.toUpperCase()}</p>
                          <p className="text-justify">
                            Os documentos analisados foram apresentados pelo responsável técnico {formData.responsavelTecnico || '___'} mediado pela ART CREA/MT n° {formData.artCreaMt || '___'} para a atividade de {formData.artAtividade || '___'}, protocolizados em {formData.dataProtocolo || '___'} sob numeração de {formData.numProtocoloAnalisado || '___'}, juntados ao processo administrativo n° {formData.processo || '___'}.
                          </p>
                          <p className="text-justify">
                            Foi apresentado Relatório de {peca}. Conforme relatório apresentado, a inspeção visual ocorreu em {formData.dataInspecao || '___'}, sob responsabilidade técnica de {formData.responsavelTecnico || '___'}.
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
                          Os documentos em análise foram protocolados sob n° {formData.numProtocoloAnalisado || '___'} em {formData.dataProtocolo || '___'} juntados ao processo administrativo n° {formData.processo || '___'}, elaborado por {formData.responsavelTecnico || '___'} mediado pela ART CREA/MT n° {formData.artCreaMt || '___'} para a atividade de {formData.artAtividade || '___'}.
                        </p>
                        <p className="text-justify">
                          Conforme informações prestadas pelo responsável técnico, as anomalias a serem adequadas não apresentam nível de perigo de alerta ou emergência à barragem, porém faz-se necessária adoção de adequações para que não evoluam, portanto, entendemos que o Relatório Técnico de {formData.pecasTecnicas.join(', ') || '___'} contemplou os itens mínimos a serem apreciados.
                        </p>
                        <p className="text-justify">
                          Recomendamos que sejam realizadas as adequações e manutenções indicadas no Relatório de {formData.pecasTecnicas.join(', ') || '___'} encaminhado por {formData.responsavelTecnico || '___'}. Mesmo a barragem não estando submetida a PNSB, é de suma importância que sejam realizadas as adequações e manutenções conforme as boas práticas da engenharia, estando o empreendedor passível de atividades de fiscalizações do órgão regulador.
                        </p>
                        <p className="text-justify">
                          A aprovação do rol documental apresentado não isenta de uma possível reclassificação futura, devendo o empreendedor informar ao órgão ser houver instalação de estruturas civis na área afetada a jusante. Ainda, é responsabilidade do empreendedor a gestão de segurança da barragem e reparação de danos decorrentes de seu rompimento, vazamento ou mau funcionamento independentemente da existência de culpa.
                        </p>
                      </div>

                      {/* TÓPICOS EXTRAS */}
                      {formData.topicosExtras.map((topico, tIdx) => (
                        <div key={topico.id} className="space-y-4 pt-4 relative group">
                          <button 
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
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Edição Manual da Revisão Final (Opcional)</label>
                  <textarea 
                    className="w-full p-6 bg-white border border-slate-200 rounded-[2rem] min-h-[200px]"
                    value={formData.revisaoParecer}
                    onChange={(e) => handleInputChange('revisaoParecer', e.target.value)}
                    placeholder="Altere o texto final se necessário para o documento exportado..."
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
    </div>
  );
};

export default OpinionForm;
