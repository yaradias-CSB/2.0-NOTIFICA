import React, { useState, useEffect, useContext } from 'react';
import { 
  Save, Download, ArrowLeft, Eraser, FileDown, CheckCircle, Loader2, 
  MapPin, Phone, Building2, FileText, ClipboardList, Eye,
  ChevronDown, ChevronUp, Users, Plus, X, Search, Globe, RefreshCw,
  Trash2, ArrowUp, ArrowDown, Crosshair
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import ConfirmModal from './ui/ConfirmModal';
import { NotificacaoData, BarragemCoordenada } from '../types';
import { generateNotificacaoDoc } from '../services/docxService';
import { generateNotificacaoPDF } from '../services/pdfService';
import { logActivity } from '../lib/audit';
import { DataContext } from '../contexts/DataContext';
import { EcosystemContext } from '../contexts/EcosystemContext';
import { OPS_MUNICIPIOS, OPS_ANALISTA } from '../constants';
import { NotificacaoMiniMap } from './NotificacaoMiniMap';
import {
  BarragemCanonica,
  CURRENT_SYSTEM_ID,
  EmpreendedorCanonico,
} from '../types/ecosystem';
import { AdministraEntityPicker } from './ecosystem/AdministraEntityPicker';
import { CarCoordinateLookup } from './ecosystem/CarCoordinateLookup';
import { matchMunicipioMT } from '../services/carLookupService';

import { sanitizeObject } from '../lib/security';
import RelatorioTecnicoSection from './RelatorioTecnicoSection';

interface NotificaFormProps {
  onBack: () => void;
  initialData?: NotificacaoData | null;
  readOnly?: boolean;
}

const INITIAL_DATA: NotificacaoData = {
  id: crypto.randomUUID(),
  empreendedorNome: '',
  tipoDocumentoIdentificacao: 'CPF',
  documentoIdentificacao: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  municipioCorrespondencia: '',
  ufCorrespondencia: 'MT',
  cepCorrespondencia: '',
  telefone: '',
  nomeFantasia: '',
  atividade: 'Barragem',
  carMt: '',
  lat: '',
  long: '',
  barragens: [],
  enderecoEmpreendimento: '',
  municipioEmpreendimento: OPS_MUNICIPIOS[0],
  cepEmpreendimento: '',
  numProcesso: '',
  prazoVencimento: '90',
  objetivo: 'Notificação para o cadastro e a classificação do Dano Potencial Associado e Categoria de Risco, para barragens.',
  notificacaoGerada: '',
  oficioGerado: '',
  dataNotificacao: new Date().toISOString().split('T')[0],
  analistas: [],
  textoNotificacao: '',
  textoSigaDoc: '',
  anotacoesInternas: '',
  status: 'Rascunho',
  tipo_documento: 'Notificação',
  situacao: 'Em aberto'
};

const formatGMS = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 0) return '';
  let formatted = digits.slice(0, 2);
  if (digits.length > 2) formatted += '°' + digits.slice(2, 4);
  if (digits.length > 4) formatted += "'" + digits.slice(4, 6);
  if (digits.length > 6) formatted += "," + digits.slice(6, 8);
  if (digits.length === 8) formatted += '"';
  return formatted;
};

const formatCPF = (v: string) => {
  v = v.replace(/\D/g, "");
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
  if (v.length <= 9) return v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
};

const formatCNPJ = (v: string) => {
  v = v.replace(/\D/g, "");
  if (v.length > 14) v = v.slice(0, 14);
  if (v.length <= 2) return v;
  if (v.length <= 5) return v.replace(/(\d{2})(\d{0,3})/, "$1.$2");
  if (v.length <= 8) return v.replace(/(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
  if (v.length <= 12) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
  return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
};

const formatPhone = (v: string) => {
  v = v.replace(/\D/g, "");
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 10) {
    return v.replace(/(\d{2})(\d{5})(\d{4})/, "($1)$2-$3");
  } else if (v.length > 2) {
    return v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1)$2-$3");
  }
  return v;
};

const formatCEP = (v: string) => {
  v = v.replace(/\D/g, "");
  if (v.length > 8) v = v.slice(0, 8);
  return v.replace(/(\d{5})(\d{3})/, "$1-$2");
};

const formatCARMT = (v: string) => {
  const digits = v.replace(/\D/g, "");
  if (digits.length === 0) return "";
  let res = "MT" + digits.slice(0, 6);
  if (digits.length > 6) {
    res += "/" + digits.slice(6, 10);
  }
  return res;
};

const NotificaForm: React.FC<NotificaFormProps> = ({ onBack, initialData, readOnly }) => {
  const { refreshData, saveNotificacao } = useContext(DataContext);
  const { syncEntitiesFromForm } = useContext(EcosystemContext);
  
  const [formData, setFormData] = useState<NotificacaoData>(() => {
    const base = initialData ? { ...INITIAL_DATA, ...initialData } : { ...INITIAL_DATA, id: crypto.randomUUID() };

    let initialBarragens: BarragemCoordenada[] = (base.barragens && Array.isArray(base.barragens) && base.barragens.length > 0)
      ? [...base.barragens]
      : [];

    if (initialBarragens.length === 0) {
      if (base.lat || base.long) {
        initialBarragens = [{
          id: crypto.randomUUID(),
          nome: 'Barragem 1',
          lat: base.lat || '',
          long: base.long || ''
        }];
      } else {
        initialBarragens = [{
          id: crypto.randomUUID(),
          nome: 'Barragem 1',
          lat: '',
          long: ''
        }];
      }
    }

    return {
      ...base,
      barragens: initialBarragens,
      lat: initialBarragens[0]?.lat || base.lat || '',
      long: initialBarragens[0]?.long || base.long || ''
    };
  });

  const [isTextoEdited, setIsTextoEdited] = useState(() => {
    return !!(initialData && initialData.textoNotificacao);
  });

  const [isSaving, setIsSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true });
  const [showAnalistaDropdown, setShowAnalistaDropdown] = useState(false);
  const [analistaSearch, setAnalistaSearch] = useState('');
  const analistaDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (analistaDropdownRef.current && !analistaDropdownRef.current.contains(event.target as Node)) {
        setShowAnalistaDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAnalistaToggle = (fullName: string) => {
    const currentAnalistas = formData.analistas || [];
    if (currentAnalistas.includes(fullName)) {
      handleInputChange('analistas', currentAnalistas.filter(a => a !== fullName));
    } else {
      handleInputChange('analistas', [...currentAnalistas, fullName]);
    }
  };

  const handleManualAnalistaAdd = () => {
    if (!analistaSearch.trim()) return;
    const name = analistaSearch.trim();
    const isThiago = name.toLowerCase() === 'thiago silveira da silva';
    const cargo = isThiago ? 'Residente Técnico' : 'Analista de Meio Ambiente';
    const fullName = `${name} / ${cargo} – SEMA/MT`;
    const currentAnalistas = formData.analistas || [];
    if (!currentAnalistas.includes(fullName)) {
      handleInputChange('analistas', [...currentAnalistas, fullName]);
    }
    setAnalistaSearch('');
  };

  const filteredAnalistas = OPS_ANALISTA.filter(name => 
    name.toLowerCase().includes(analistaSearch.toLowerCase())
  );

  // Barragem atualmente em edição / selecionada como alvo de captura do minimapa
  const [activeBarragemIndex, setActiveBarragemIndex] = useState<number>(0);

  // Manipulação dinâmica de coordenadas de barragens e ordem hierárquica
  const handleAddBarragem = () => {
    setFormData(prev => {
      const current = prev.barragens || [];
      const newIndex = current.length + 1;
      const updated: BarragemCoordenada[] = [
        ...current,
        {
          id: crypto.randomUUID(),
          nome: `Barragem ${newIndex}`,
          lat: '',
          long: ''
        }
      ];
      setIsTextoEdited(false);
      // Seleciona imediatamente a nova barragem adicionada para edição
      setActiveBarragemIndex(current.length);
      return {
        ...prev,
        barragens: updated
      };
    });
    toast.success('Novo campo de coordenadas de barragem adicionado e selecionado para edição.');
  };

  const handleRemoveBarragem = (indexToRemove: number) => {
    setFormData(prev => {
      const current = prev.barragens || [];
      if (current.length <= 1) {
        toast.warning('A notificação deve conter pelo menos uma coordenada de barragem.');
        return prev;
      }
      const updated = current.filter((_, idx) => idx !== indexToRemove);
      setIsTextoEdited(false);
      setActiveBarragemIndex(prevIdx => {
        if (prevIdx === indexToRemove) return Math.max(0, indexToRemove - 1);
        if (prevIdx > indexToRemove) return prevIdx - 1;
        return prevIdx;
      });
      return {
        ...prev,
        barragens: updated,
        lat: updated[0]?.lat || '',
        long: updated[0]?.long || ''
      };
    });
    toast.info('Coordenada de barragem removida.');
  };

  const handleMoveBarragem = (index: number, direction: 'up' | 'down') => {
    setFormData(prev => {
      const current = [...(prev.barragens || [])];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return prev;

      const item = current[index];
      current[index] = current[targetIndex];
      current[targetIndex] = item;

      setIsTextoEdited(false);
      // Mantém a barragem movimentada selecionada
      setActiveBarragemIndex(targetIndex);
      return {
        ...prev,
        barragens: current,
        lat: current[0]?.lat || '',
        long: current[0]?.long || ''
      };
    });
    toast.success(`Ordem alterada: barragem ${direction === 'up' ? 'subiu' : 'desceu'} na hierarquia.`);
  };

  const handleBarragemChange = (index: number, field: 'nome' | 'lat' | 'long', value: string) => {
    setActiveBarragemIndex(index);
    setFormData(prev => {
      const current = [...(prev.barragens || [])];
      if (!current[index]) return prev;

      current[index] = {
        ...current[index],
        [field]: value
      };

      const updates: Partial<NotificacaoData> = {
        barragens: current
      };

      if (index === 0 && (field === 'lat' || field === 'long')) {
        updates[field] = value;
      }

      setIsTextoEdited(false);
      return {
        ...prev,
        ...updates
      };
    });
  };

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; 
    title: string; 
    message: string; 
    onConfirm: () => void; 
    variant: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
    cancelLabel?: string;
  }>({ 
    isOpen: false, 
    title: '', 
    message: '', 
    onConfirm: () => {}, 
    variant: 'warning',
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar'
  });

  const generateNotificationText = (data: NotificacaoData): string => {
    const { 
      empreendedorNome, 
      tipoDocumentoIdentificacao, 
      documentoIdentificacao, 
      carMt,
      municipioEmpreendimento,
      lat, 
      long, 
      barragens,
      prazoVencimento, 
      objetivo, 
      analistas,
      dataNotificacao
    } = data;

    const dateToFormat = dataNotificacao ? new Date(dataNotificacao + 'T12:00:00') : new Date();
    const formattedDate = !isNaN(dateToFormat.getTime()) 
      ? dateToFormat.toLocaleDateString('pt-BR') 
      : new Date().toLocaleDateString('pt-BR');
    
    const analystsText = (analistas || []).length > 0 
      ? "\n\n" + analistas.join("\n")
      : "";

    const activeBarragens = (barragens && barragens.length > 0)
      ? barragens
      : [{ id: '1', nome: 'Barragem 1', lat: lat || '', long: long || '' }];

    let solicitacaoItemI = '';

    if (activeBarragens.length > 1) {
      // Elenca todas as barragens inseridas em ordem hierárquica
      const coordsList = activeBarragens.map((b, idx) => {
        const bLat = b.lat || "00°00'00,00\"";
        const bLong = b.long || "00°00'00,00\"";
        return `${idx + 1}. LAT ${bLat} S e LONG ${bLong} O,`;
      }).join('\n\n\n\n');

      solicitacaoItemI = `I. Notificamos ${empreendedorNome || '________________'} de ${tipoDocumentoIdentificacao || 'CPF'} ${documentoIdentificacao || '________________'}, responsável pela área vinculada ao CAR/MT nº ${carMt || '________________'}, a providenciar a classificação de segurança por meio de cadastro e classificação das barragns localizada no município de ${municipioEmpreendimento || '________________'}, nas coordenadas:\n\n\n\n\n\n${coordsList}\n\n em conformidade com o enquadramento estabelecido na legislação vigente, considerando o que dispõe a Lei nº 12.334, a Resolução CEHIDRO nº 163 de 18 de maio de 2023, a Instrução Normativa nº 08 de 18 de dezembro de 2023 e o Termo de Referência nº 17, disponíveis no sítio eletrônico da SEMA/MT; prazo para atendimento das solicitações: ${prazoVencimento || '90'} dias;`;
    } else {
      const bLat = activeBarragens[0]?.lat || lat || "00°00'00,00\"";
      const bLong = activeBarragens[0]?.long || long || "00°00'00,00\"";
      solicitacaoItemI = `I. Notificamos ${empreendedorNome || '________________'} de ${tipoDocumentoIdentificacao || 'CPF'} ${documentoIdentificacao || '________________'}, responsável pela área vinculada ao CAR/MT nº ${carMt || '________________'}, a providenciar a classificação de segurança por meio de cadastro e classificação da barragem localizada no município de ${municipioEmpreendimento || '________________'}, utilizando como coordenada de referência (sede ou barragem) LAT ${bLat} S e LONG ${bLong} O, em conformidade com o enquadramento estabelecido na legislação vigente, considerando o que dispõe a Lei nº 12.334, a Resolução CEHIDRO nº 163 de 18 de maio de 2023, a Instrução Normativa nº 08 de 18 de dezembro de 2023 e o Termo de Referência nº 17, disponíveis no sítio eletrônico da SEMA/MT; prazo para atendimento das solicitações: ${prazoVencimento || '90'} dias;`;
    }

    return `OBJETIVO:

${objetivo || 'Notificação para o cadastro e a classificação do Dano Potencial Associado e Categoria de Risco, para barragens.'}

SOLICITAÇÕES:

${solicitacaoItemI}

II. O não atendimento destas solicitações, no prazo estabelecido, acarretará as sanções administrativas cabíveis, nos termos da Lei nº 12.334, de 20 de setembro de 2010 e suas alterações, e da Resolução CNRH nº 230 de 22 de março de 2022.

INFORMAÇÕES GERAIS ORIENTATIVAS

I.\tCabe ressaltar que o empreendedor é responsável pela segurança da barragem, esteja ela submetida ou não à referida Lei, devendo zelar pela sua manutenção e operação, de maneira a reduzir a possibilidade de acidente e suas consequências;

II.\tA manutenção da barragem deve ser realizada conforme orientações apresentadas na Cartilha de Ações de Manutenção em Barragens de Terra. Disponível em: http://www.sema.mt.gov.br/site/phocadownload/SURH2/Cartilha%20de%20Aes%20de%20Manuteno%20em%20Barragens%20de%20Terra.pdf; e http://www.sema.mt.gov.br/site/index.php/unidades-administrativas/recursos-hidricos/category/394-seguran%C3%A7a-de-barragens.

III. Informações sobre Legislações e Normativas (base legal para segurança de barragens em MT) podem ser acessas no SISB-MT (Sistema de Informações sobre Segurança de Barragens de Acumulação de água para Usos Múltiplos (exceto geração de energia) do Estado de Mato Grosso), no link https://sisb-mt-csb.vercel.app/#informacoes

IV. Considerando as características dos espelhos d’água identificados na imagem do Cadastro Ambiental Rural ${carMt || '<<CAR/MT>>'}, bem como as condições e características técnicas estabelecidas no art. 24 da Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023, para fins de verificação da necessidade de classificação e cadastro, será obrigatória a classificação de segurança de toda barragem em operação que apresente, no mínimo, as seguintes características:
1 – Dano Potencial Associado (DPA) baixo;
2 – Altura do maciço, medida do ponto mais baixo do talude de jusante até o ponto mais alto da crista, maior ou igual a 3 m (três metros);
3 – Capacidade total do reservatório maior ou igual a 500.000 m³ (quinhentos mil metros cúbicos);
4 – Área de drenagem até o ponto do barramento maior ou igual a 2,0 km² (dois quilômetros quadrados).
Ressalta-se que, em observância ao disposto no art. 24 da Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023, quanto aos critérios para a obrigatoriedade de classificação de segurança de barragens, caso as barragens existentes na referida propriedade não se enquadrem nos critérios previstos no referido artigo, deverão ser apresentadas informações suficientes para sua caracterização e para a comprovação da não obrigatoriedade de classificação.

Cuiabá/MT, ${formattedDate}.${analystsText}`;
  };

  const generateSigaDocText = (data: NotificacaoData): string => {
    const { 
      empreendedorNome, 
      tipoDocumentoIdentificacao, 
      documentoIdentificacao, 
      carMt,
      municipioEmpreendimento,
      lat, 
      long, 
      barragens,
      prazoVencimento, 
      analistas,
      dataNotificacao,
      notificacaoGerada
    } = data;

    const dateToFormat = dataNotificacao ? new Date(dataNotificacao + 'T12:00:00') : new Date();
    const formattedDate = !isNaN(dateToFormat.getTime()) 
      ? dateToFormat.toLocaleDateString('pt-BR') 
      : new Date().toLocaleDateString('pt-BR');

    const analystsNames = (analistas || []).map(a => a.split('/')[0].trim()).join(', ');

    const activeBarragens = (barragens && barragens.length > 0)
      ? barragens
      : [{ id: '1', nome: 'Barragem 1', lat: lat || '', long: long || '' }];

    let coordsRefText = '';
    if (activeBarragens.length > 1) {
      coordsRefText = `nas coordenadas: ${activeBarragens.map((b, i) => `${i + 1}. LAT ${b.lat || "00°00'00,00\""} S e LONG ${b.long || "00°00'00,00\""} O`).join('; ')}`;
    } else {
      coordsRefText = `com coordenada de referência (sede ou barragem) em LAT ${activeBarragens[0]?.lat || lat || "00°00'00,00\""} S e LONG ${activeBarragens[0]?.long || long || "00°00'00,00\""} O`;
    }

    return `     Em cumprimento à Notificação nº ${notificacaoGerada || '____'}/CSB/SURH/SEMA-MT, emitida em ${formattedDate} por ${analystsNames || '________________'}, o(a) notificado(a) ${empreendedorNome || '________________'}, ${tipoDocumentoIdentificacao || 'CPF'} ${documentoIdentificacao || '________________'}, responsável pela área vinculada ao CAR/MT nº ${carMt || '________________'}, localizada em ${municipioEmpreendimento || '________________'}, ${coordsRefText}, fica ciente da obrigatoriedade de realizar o cadastro e a classificação da barragem, incluindo Dano Potencial Associado (DPA) e Categoria de Risco (CRI), e de apresentar a documentação técnica correspondente, nos termos da Lei nº 12.334/2010 e alterações, Resolução CEHIDRO nº 163/2023, Instrução Normativa nº 08/2023 e Termo de Referência nº 17, no prazo de ${prazoVencimento || '90'} dias.
     O não atendimento ao disposto na notificação, no prazo estabelecido, sujeitará o(a) notificado(a) às sanções administrativas previstas na Resolução CNRH n°230 de 22 de março de 2022, sem prejuízo de outras responsabilizações.
     Cuiabá/MT, ${formattedDate}.`;
  };

  useEffect(() => {
    const texto = generateNotificationText(formData);
    const sigaDoc = generateSigaDocText(formData);

    setFormData(prev => {
      const updates: Partial<NotificacaoData> = { textoSigaDoc: sigaDoc };
      if (!isTextoEdited) {
        updates.textoNotificacao = texto;
      }
      return { ...prev, ...updates };
    });
  }, [
    formData.empreendedorNome, 
    formData.tipoDocumentoIdentificacao, 
    formData.documentoIdentificacao, 
    formData.carMt,
    formData.municipioEmpreendimento,
    formData.lat, 
    formData.long, 
    formData.barragens,
    formData.prazoVencimento, 
    formData.objetivo, 
    formData.analistas,
    formData.dataNotificacao,
    formData.notificacaoGerada,
    isTextoEdited
  ]);

  const handleForceUpdateText = () => {
    const novoTexto = generateNotificationText(formData);
    const novoSigaDoc = generateSigaDocText(formData);
    setIsTextoEdited(false);
    setFormData(prev => ({
      ...prev,
      textoNotificacao: novoTexto,
      textoSigaDoc: novoSigaDoc
    }));
    toast.success('Texto da notificação atualizado com as informações do formulário!');
  };

  const toggleSection = (section: number) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleInputChange = (field: keyof NotificacaoData, value: any) => {
    if (field !== 'textoNotificacao' && field !== 'textoSigaDoc') {
      setIsTextoEdited(false);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (status: 'Rascunho' | 'Concluído') => {
    // Validation: Only mandatory for "Concluído"
    if (status === 'Concluído') {
      if (!formData.empreendedorNome || !formData.documentoIdentificacao || !formData.numProcesso) {
        toast.error('Por favor, preencha os campos obrigatórios (Empreendedor, CPF/CNPJ e Processo) para concluir.');
        return;
      }

      if (formData.tipoDocumentoIdentificacao === 'CPF' && formData.documentoIdentificacao.length < 14) {
        toast.error('CPF inválido.');
        return;
      }

      if (formData.tipoDocumentoIdentificacao === 'CNPJ' && formData.documentoIdentificacao.length < 18) {
        toast.error('CNPJ inválido.');
        return;
      }
    } else {
      // For Rascunho, at least a name or process might be helpful but not strictly required by the db usually
      if (!formData.empreendedorNome && !formData.numProcesso) {
        toast.error('Preencha ao menos o nome do empreendedor ou o número do processo para salvar o rascunho.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const sanitizedFormData = sanitizeObject(formData);
      const primaryBarragemNome =
        sanitizedFormData.nomeFantasia || sanitizedFormData.barragens?.[0]?.nome || '';

      const syncRes = await syncEntitiesFromForm({
        existingEmpreendedorId: sanitizedFormData.empreendedorId,
        existingBarragemId: sanitizedFormData.barragemId,
        empreendedorNome: sanitizedFormData.empreendedorNome,
        tipoPessoa: sanitizedFormData.tipoDocumentoIdentificacao,
        cpfCnpj: sanitizedFormData.documentoIdentificacao,
        telefone: sanitizedFormData.telefone,
        logradouro: sanitizedFormData.logradouro,
        numero: sanitizedFormData.numero,
        complemento: sanitizedFormData.complemento,
        bairro: sanitizedFormData.bairro,
        municipio: sanitizedFormData.municipioEmpreendimento,
        uf: sanitizedFormData.ufCorrespondencia,
        cep: sanitizedFormData.cepCorrespondencia,
        carMt: sanitizedFormData.carMt,
        nomeBarragem: primaryBarragemNome,
        processo: sanitizedFormData.numProcesso,
        analista: sanitizedFormData.analistas?.[0] || 'Sistema Local',
      });

      const resolvedEmpreendedorId = syncRes.empreendedorId || sanitizedFormData.empreendedorId;
      const resolvedBarragemId = syncRes.barragemId || sanitizedFormData.barragemId;

      const res = await saveNotificacao({
        ...sanitizedFormData,
        id: formData.id || undefined,
        empreendedorId: resolvedEmpreendedorId,
        barragemId: resolvedBarragemId,
        sourceSystem: sanitizedFormData.sourceSystem || CURRENT_SYSTEM_ID,
        analista: formData.analistas?.[0] || 'Sistema Local',
        numProcesso: formData.numProcesso || 'S/N',
        empreendedorNome: formData.empreendedorNome || 'Rascunho sem nome',
        documentoIdentificacao: formData.documentoIdentificacao || '',
        municipioEmpreendimento: formData.municipioEmpreendimento,
        oficioGerado: formData.oficioGerado,
        status: status,
        tipo_documento: 'Notificação'
      });

      if (!res.success) {
        toast.error('Erro ao salvar no banco de dados.');
        return;
      }

      if (res.data) {
        setFormData(prev => ({
          ...prev,
          id: res.data.id,
          status,
          empreendedorId: resolvedEmpreendedorId,
          barragemId: resolvedBarragemId,
          sourceSystem: res.data.sourceSystem || CURRENT_SYSTEM_ID,
        }));
      }

      toast.success(`Notificação salva como ${status}!`);
      
      await refreshData();
      
      if (status === 'Concluído') {
        // Para concluído, pergunta se quer voltar
        setConfirmModal({
          isOpen: true,
          title: 'Notificação Concluída!',
          message: 'O documento foi salvo com sucesso no sistema. Deseja voltar para o painel de controle?',
          variant: 'info',
          confirmLabel: 'Voltar ao Painel',
          cancelLabel: 'Continuar aqui',
          onConfirm: () => {
            onBack();
          }
        });
      }
      // Se for rascunho, apenas mantém na página com o toast que já apareceu
    } catch (error) {
      console.error('Erro inesperado ao salvar notificação:', error);
      toast.error('Erro inesperado ao salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Formulário',
      message: 'Tem certeza que deseja limpar todos os campos? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: () => {
        setFormData({ ...INITIAL_DATA, id: formData.id });
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        toast.info('Formulário limpo.');
      }
    });
  };

  const handleDownloadDocx = async () => {
    try {
      await generateNotificacaoDoc(formData);
      toast.success('Documento gerado com sucesso!');
      logActivity({
        action: 'DOWNLOAD_NOTIFICACAO',
        details: `Download da Notificação efetuada. Notificado: ${formData.interessado || formData.empreendedorNome || '---'}. Município: ${formData.municipioEmpreendimento || '---'}`
      });
    } catch (error) {
      toast.error('Erro ao gerar documento.');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateNotificacaoPDF(formData as any);
      toast.success('PDF da notificação gerado com sucesso!');
      logActivity({
        action: 'DOWNLOAD_NOTIFICACAO',
        details: `Download da Notificação (PDF) efetuada. Notificado: ${formData.interessado || formData.empreendedorNome || '---'}. Município: ${formData.municipioEmpreendimento || '---'}`
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF da notificação.');
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-20 w-full">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-4 mb-6 sticky top-0 bg-slate-50 z-30 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Nova Notificação</h1>
            <p className="text-xs text-slate-500">Preencha os dados para gerar o documento oficial</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {!readOnly && (
            <>
              <button 
                onClick={handleClear}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
              >
                <Eraser size={16} /> Limpar
              </button>
              <button 
                onClick={() => handleSave('Rascunho')}
                disabled={isSaving}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar Rascunho
              </button>
              <button 
                onClick={() => handleSave('Concluído')}
                disabled={isSaving}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Concluir
              </button>
            </>
          )}
          <button 
            onClick={handleDownloadPDF}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-all shadow-md shadow-rose-200"
            title="Exportar Notificação em PDF"
          >
            <FileDown size={16} /> Salvar PDF
          </button>
          <button 
            onClick={handleDownloadDocx}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
          >
            <FileDown size={16} /> Salvar Docx
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Floating Navigation Menu */}
        <div className="fixed right-6 top-32 hidden lg:flex flex-col gap-2 z-40">
          {[
            { id: 1, icon: <Building2 size={16} />, label: 'Empreendedor' },
            { id: 2, icon: <MapPin size={16} />, label: 'Empreendimento' },
            { id: 'minimapa', icon: <Globe size={16} />, label: 'Minimapa' },
            { id: 3, icon: <ClipboardList size={16} />, label: 'Trâmites' },
            { id: 4, icon: <Eye size={16} />, label: 'Revisão' },
            { id: 5, icon: <CheckCircle size={16} />, label: 'Conclusão' },
            { id: 6, icon: <FileText size={16} />, label: 'Relatório Técnico' },
            { id: 7, icon: <FileText size={16} />, label: 'SigaDoc' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                const targetId = typeof item.id === 'number' ? `section-${item.id}` : `section-${item.id}`;
                const el = document.getElementById(targetId);
                if (el) {
                  const offset = 100;
                  const bodyRect = document.body.getBoundingClientRect().top;
                  const elementRect = el.getBoundingClientRect().top;
                  const elementPosition = elementRect - bodyRect;
                  const offsetPosition = elementPosition - offset;

                  window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                  });
                  
                  if (typeof item.id === 'number' && !expandedSections[item.id]) {
                    toggleSection(item.id);
                  }
                }
              }}
              className="group flex items-center gap-3 p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-lg hover:border-emerald-500 hover:shadow-emerald-200 transition-all text-slate-400 hover:text-emerald-600"
              title={item.label}
            >
              <div className="bg-slate-50 group-hover:bg-emerald-50 p-2 rounded-xl transition-colors">
                {item.icon}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest pr-2 hidden group-hover:block whitespace-nowrap">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        <AdministraEntityPicker
          readOnly={readOnly}
          currentDocumentId={formData.id}
          selectedEmpreendedorId={formData.empreendedorId}
          selectedBarragemId={formData.barragemId}
          cpfCnpj={formData.documentoIdentificacao}
          nomeBarragem={formData.nomeFantasia || formData.barragens?.[0]?.nome}
          onSelectEmpreendedor={(emp: EmpreendedorCanonico) => {
            setIsTextoEdited(false);
            setFormData(prev => ({
              ...prev,
              empreendedorId: emp.id,
              empreendedorNome: emp.nome || prev.empreendedorNome,
              tipoDocumentoIdentificacao: emp.tipoPessoa || prev.tipoDocumentoIdentificacao,
              documentoIdentificacao: emp.cpfCnpj || prev.documentoIdentificacao,
              telefone: emp.telefone || prev.telefone,
              logradouro: emp.logradouro || prev.logradouro,
              numero: emp.numero || prev.numero,
              complemento: emp.complemento || prev.complemento,
              bairro: emp.bairro || prev.bairro,
              municipioCorrespondencia: emp.municipio
                ? `${emp.municipio}/${emp.uf || 'MT'}`
                : prev.municipioCorrespondencia,
              ufCorrespondencia: emp.uf || prev.ufCorrespondencia,
              cepCorrespondencia: emp.cep || prev.cepCorrespondencia,
              carMt: emp.carMt || prev.carMt,
            }));
          }}
          onSelectBarragem={(bar: BarragemCanonica) => {
            setIsTextoEdited(false);
            setFormData(prev => {
              const gmsToStr = (c?: { g: string; m: string; s: string }) =>
                c && (c.g || c.m || c.s) ? `${c.g || '00'}°${c.m || '00'}'${c.s || '00'}"` : '';
              const latStr = gmsToStr(bar.coordenadasGMS?.lat);
              const longStr = gmsToStr(bar.coordenadasGMS?.long);
              const nextBarragens = [...(prev.barragens || [])];
              if (nextBarragens.length > 0) {
                nextBarragens[0] = {
                  ...nextBarragens[0],
                  nome: bar.nomeBarragem || nextBarragens[0].nome,
                  lat: latStr || nextBarragens[0].lat,
                  long: longStr || nextBarragens[0].long,
                };
              }
              return {
                ...prev,
                barragemId: bar.id,
                empreendedorId: bar.empreendedorId || prev.empreendedorId,
                nomeFantasia: bar.nomeBarragem || prev.nomeFantasia,
                municipioEmpreendimento: bar.municipio || prev.municipioEmpreendimento,
                lat: latStr || prev.lat,
                long: longStr || prev.long,
                barragens: nextBarragens,
              };
            });
          }}
          onClearLinks={() => {
            setFormData(prev => ({
              ...prev,
              empreendedorId: undefined,
              barragemId: undefined,
            }));
          }}
        />

        {/* Topic 1 */}
        <section id="section-1" className="bg-white rounded-xl shadow-sm border border-slate-200 relative z-10">
          <button 
            onClick={() => toggleSection(1)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Building2 className="text-emerald-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">1. Identificação do Empreendedor</h2>
            </div>
            {expandedSections[1] ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>
          
          <AnimatePresence>
            {expandedSections[1] && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="p-6 pt-0 border-t border-slate-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Identificação do Empreendedor</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                        value={formData.empreendedorNome}
                        onChange={(e) => handleInputChange('empreendedorNome', e.target.value)}
                        placeholder="Ex: Fazenda Santa Yara Dias Ltda"
                        disabled={readOnly}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de Documento</label>
                      <div className="flex gap-4 p-1 bg-slate-100 rounded-lg">
                        {['CPF', 'CNPJ'].map(tipo => (
                          <button
                            key={tipo}
                            onClick={() => handleInputChange('tipoDocumentoIdentificacao', tipo)}
                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${formData.tipoDocumentoIdentificacao === tipo ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            disabled={readOnly}
                          >
                            {tipo}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{formData.tipoDocumentoIdentificacao}</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                        value={formData.documentoIdentificacao}
                        onChange={(e) => {
                          const val = e.target.value;
                          const formatted = formData.tipoDocumentoIdentificacao === 'CPF' ? formatCPF(val) : formatCNPJ(val);
                          handleInputChange('documentoIdentificacao', formatted);
                        }}
                        placeholder={formData.tipoDocumentoIdentificacao === 'CPF' ? "000.000.000-00" : "00.000.000/0000-00"}
                        disabled={readOnly}
                      />
                    </div>
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Logradouro</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                          value={formData.logradouro}
                          onChange={(e) => handleInputChange('logradouro', e.target.value)}
                          disabled={readOnly}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Número</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                          value={formData.numero}
                          onChange={(e) => handleInputChange('numero', e.target.value)}
                          disabled={readOnly}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Complemento</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                          value={formData.complemento}
                          onChange={(e) => handleInputChange('complemento', e.target.value)}
                          disabled={readOnly}
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bairro</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                          value={formData.bairro}
                          onChange={(e) => handleInputChange('bairro', e.target.value)}
                          disabled={readOnly}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Município/UF</label>
                        <input 
                          type="text"
                          className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                          value={formData.municipioCorrespondencia}
                          onChange={(e) => handleInputChange('municipioCorrespondencia', e.target.value)}
                          placeholder="Ex: Cuiabá/MT"
                          disabled={readOnly}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CEP</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                          value={formData.cepCorrespondencia}
                          onChange={(e) => handleInputChange('cepCorrespondencia', formatCEP(e.target.value))}
                          placeholder="00000-000"
                          disabled={readOnly}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="text" 
                          className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                          value={formData.telefone}
                          onChange={(e) => handleInputChange('telefone', formatPhone(e.target.value))}
                          placeholder="(65)99999-9999"
                          disabled={readOnly}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Topic 2 */}
        <section id="section-2" className="bg-white rounded-xl shadow-sm border border-slate-200 relative z-10">
          <button 
            onClick={() => toggleSection(2)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <MapPin className="text-emerald-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">2. Identificação do Empreendimento</h2>
            </div>
            {expandedSections[2] ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>

          <AnimatePresence>
            {expandedSections[2] && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-100/50 rounded-[2rem] border border-slate-200 shadow-inner">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Empreendimento (Fazenda/Barragem)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.nomeFantasia}
                            onChange={(e) => handleInputChange('nomeFantasia', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Atividade</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.atividade}
                            onChange={(e) => handleInputChange('atividade', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CAR/MT</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.carMt || ''}
                            onChange={(e) => handleInputChange('carMt', formatCARMT(e.target.value))}
                            placeholder="MT123456/2026"
                            disabled={readOnly}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Endereço do Empreendimento</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.enderecoEmpreendimento}
                            onChange={(e) => handleInputChange('enderecoEmpreendimento', e.target.value)}
                            placeholder="Ex: Fazenda Santa Yara Dias"
                            disabled={readOnly}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Município</label>
                          <select 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.municipioEmpreendimento}
                            onChange={(e) => handleInputChange('municipioEmpreendimento', e.target.value)}
                            disabled={readOnly}
                          >
                            {OPS_MUNICIPIOS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CEP</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.cepEmpreendimento}
                            onChange={(e) => handleInputChange('cepEmpreendimento', formatCEP(e.target.value))}
                            placeholder="18101-810"
                            disabled={readOnly}
                          />
                        </div>
                        {/* Coordenadas das Barragens (Formato GMS) - Múltiplas com Hierarquia */}
                        <div className="md:col-span-2 space-y-3 pt-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                                Coordenadas das Barragens (Formato GMS)
                              </label>
                              <p className="text-[11px] text-slate-500 font-medium">
                                Adicione as barragens identificadas no imóvel. Use as setas para alterar a ordem hierárquica.
                              </p>
                            </div>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={handleAddBarragem}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0 self-start sm:self-auto"
                              >
                                <Plus size={14} />
                                <span>Adicionar Barragem (+)</span>
                              </button>
                            )}
                          </div>

                          {/* Lista ordenada de barragens */}
                          {/* Lista ordenada de barragens */}
                          <div className="space-y-3">
                            {(formData.barragens && formData.barragens.length > 0 ? formData.barragens : [{ id: '1', nome: 'Barragem 1', lat: formData.lat || '', long: formData.long || '' }]).map((barragem, index, array) => {
                              const isSelected = activeBarragemIndex === index;
                              return (
                                <div 
                                  key={barragem.id || index}
                                  onClick={() => setActiveBarragemIndex(index)}
                                  className={`p-4 rounded-2xl shadow-xs transition-all cursor-pointer ${
                                    isSelected 
                                      ? 'bg-emerald-50/40 border-2 border-emerald-500 ring-4 ring-emerald-500/10 shadow-md' 
                                      : 'bg-white border-2 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                      <span className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center shadow-xs transition-all ${
                                        isSelected 
                                          ? 'bg-emerald-600 text-white ring-2 ring-amber-400' 
                                          : 'bg-slate-500 text-white'
                                      }`}>
                                        {index + 1}
                                      </span>
                                      <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                                        Barragem #{index + 1}
                                      </span>
                                      
                                      {/* Indicador de Seleção Ativa */}
                                      {isSelected ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                                          <Crosshair size={11} className="text-emerald-700 animate-spin-slow" />
                                          <span>Editando no Mapa</span>
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveBarragemIndex(index);
                                          }}
                                          className="text-[10px] font-bold text-slate-400 hover:text-emerald-700 underline cursor-pointer"
                                        >
                                          Selecionar para o mapa
                                        </button>
                                      )}

                                      <input
                                        type="text"
                                        value={barragem.nome || ''}
                                        onFocus={() => setActiveBarragemIndex(index)}
                                        onChange={(e) => handleBarragemChange(index, 'nome', e.target.value)}
                                        placeholder={`Nome / Identificação da Barragem ${index + 1}`}
                                        disabled={readOnly}
                                        className="text-xs font-bold px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:bg-white focus:border-emerald-500 outline-none w-48 sm:w-64"
                                      />
                                    </div>

                                    {/* Botões de Ação Hierárquica e Exclusão */}
                                    {!readOnly && (
                                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          onClick={() => handleMoveBarragem(index, 'up')}
                                          disabled={index === 0}
                                          title="Subir ordem hierárquica (mover para cima)"
                                          className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 ${
                                            index === 0 
                                              ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50' 
                                              : 'border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 cursor-pointer active:scale-95'
                                          }`}
                                        >
                                          <ArrowUp size={14} />
                                          <span className="hidden sm:inline text-[10px]">Subir</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleMoveBarragem(index, 'down')}
                                          disabled={index === array.length - 1}
                                          title="Descer ordem hierárquica (mover para baixo)"
                                          className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 ${
                                            index === array.length - 1 
                                              ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50' 
                                              : 'border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 cursor-pointer active:scale-95'
                                          }`}
                                        >
                                          <ArrowDown size={14} />
                                          <span className="hidden sm:inline text-[10px]">Descer</span>
                                        </button>

                                        {array.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveBarragem(index)}
                                            title="Excluir coordenada desta barragem"
                                            className="p-1.5 ml-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-all cursor-pointer active:scale-95"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                                        Latitude (S) — Barragem #{index + 1} {isSelected && '(Ativa)'}
                                      </label>
                                      <input 
                                        type="text" 
                                        className={`w-full px-3.5 py-2.5 rounded-xl border-2 font-bold text-slate-700 transition-all outline-none font-mono text-sm ${
                                          isSelected
                                            ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20'
                                            : 'bg-slate-50/70 border-slate-200 focus:bg-white focus:border-emerald-600'
                                        }`}
                                        value={barragem.lat}
                                        onFocus={() => setActiveBarragemIndex(index)}
                                        onChange={(e) => handleBarragemChange(index, 'lat', formatGMS(e.target.value))}
                                        placeholder={`15°12'13,44"`}
                                        disabled={readOnly}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                                        Longitude (O) — Barragem #{index + 1} {isSelected && '(Ativa)'}
                                      </label>
                                      <input 
                                        type="text" 
                                        className={`w-full px-3.5 py-2.5 rounded-xl border-2 font-bold text-slate-700 transition-all outline-none font-mono text-sm ${
                                          isSelected
                                            ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20'
                                            : 'bg-slate-50/70 border-slate-200 focus:bg-white focus:border-emerald-600'
                                        }`}
                                        value={barragem.long}
                                        onFocus={() => setActiveBarragemIndex(index)}
                                        onChange={(e) => handleBarragemChange(index, 'long', formatGMS(e.target.value))}
                                        placeholder={`56°00'00,00"`}
                                        disabled={readOnly}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Alerta de sincronização dinâmica com o mapa e documento */}
                          <div className="flex items-center justify-between text-xs text-slate-500 bg-emerald-50/70 border border-emerald-100 px-3.5 py-2 rounded-xl">
                            <div className="flex items-center gap-2">
                              <MapPin size={15} className="text-emerald-600 shrink-0" />
                              <span className="font-semibold text-slate-700 text-[11px]">
                                {formData.barragens && formData.barragens.length > 0
                                  ? `Barragem selecionada para receber coordenadas do minimapa: #${activeBarragemIndex + 1} (${formData.barragens[activeBarragemIndex]?.nome || 'Sem nome'}).`
                                  : 'Digite as coordenadas das barragens para visualizá-las numeradas no minimapa.'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById('section-minimapa');
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                            >
                              Ver no Minimapa ↓
                            </button>
                          </div>

                          <div className="pt-2">
                            <CarCoordinateLookup
                              rawLat={formData.barragens?.[activeBarragemIndex]?.lat || formData.lat}
                              rawLong={formData.barragens?.[activeBarragemIndex]?.long || formData.long}
                              disabled={readOnly}
                              onApplyCar={(car) => {
                                setIsTextoEdited(false);
                                const matchedMun = matchMunicipioMT(car.municipio);
                                setFormData(prev => ({
                                  ...prev,
                                  carMt: car.codigoCar || prev.carMt,
                                  municipioEmpreendimento: matchedMun || prev.municipioEmpreendimento,
                                }));
                              }}
                              onApplyCadastro={(cad, primaryCar) => {
                                setIsTextoEdited(false);
                                const emp = cad.empreendedorCanonico;
                                const bar = cad.barragemCanonica;
                                const matchedMun = matchMunicipioMT(cad.municipio || primaryCar?.municipio);
                                const docVal = emp?.cpfCnpj || cad.cpfCnpj || '';
                                const digits = docVal.replace(/\D/g, '');
                                setFormData(prev => {
                                  const nextBarragens = [...(prev.barragens || [])];
                                  if (nextBarragens.length > 0 && (bar?.nomeBarragem || cad.nomeBarragem)) {
                                    const idx = activeBarragemIndex < nextBarragens.length ? activeBarragemIndex : 0;
                                    nextBarragens[idx] = {
                                      ...nextBarragens[idx],
                                      nome: bar?.nomeBarragem || cad.nomeBarragem || nextBarragens[idx].nome,
                                    };
                                  }
                                  return {
                                    ...prev,
                                    empreendedorId: cad.empreendedorId || prev.empreendedorId,
                                    barragemId: cad.barragemId || prev.barragemId,
                                    empreendedorNome: emp?.nome || cad.empreendedorNome || prev.empreendedorNome,
                                    tipoDocumentoIdentificacao:
                                      emp?.tipoPessoa || (digits.length === 14 ? 'CNPJ' : digits.length === 11 ? 'CPF' : prev.tipoDocumentoIdentificacao),
                                    documentoIdentificacao: docVal || prev.documentoIdentificacao,
                                    telefone: emp?.telefone || prev.telefone,
                                    logradouro: emp?.logradouro || prev.logradouro,
                                    numero: emp?.numero || prev.numero,
                                    complemento: emp?.complemento || prev.complemento,
                                    bairro: emp?.bairro || prev.bairro,
                                    municipioCorrespondencia: emp?.municipio
                                      ? `${emp.municipio}/${emp.uf || 'MT'}`
                                      : prev.municipioCorrespondencia,
                                    cepCorrespondencia: emp?.cep || prev.cepCorrespondencia,
                                    carMt: emp?.carMt || cad.carMt || primaryCar?.codigoCar || prev.carMt,
                                    nomeFantasia: bar?.nomeBarragem || cad.nomeBarragem || prev.nomeFantasia,
                                    municipioEmpreendimento: matchedMun || bar?.municipio || prev.municipioEmpreendimento,
                                    barragens: nextBarragens,
                                  };
                                });
                              }}
                            />
                          </div>
                        </div>
                      </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Minimapa logo abaixo o tópico 2 */}
        <section id="section-minimapa" className="relative z-10 scroll-mt-24">
          <NotificacaoMiniMap
            lat={formData.lat}
            long={formData.long}
            barragens={formData.barragens}
            activeBarragemIndex={activeBarragemIndex}
            municipio={formData.municipioEmpreendimento}
            nomeEmpreendimento={formData.nomeFantasia}
            carMt={formData.carMt}
            readOnly={readOnly}
            onSelectCoords={(latGMS, longGMS) => {
              setFormData(prev => {
                const current = [...(prev.barragens || [])];
                const targetIdx = (activeBarragemIndex >= 0 && activeBarragemIndex < current.length)
                  ? activeBarragemIndex
                  : 0;

                if (current.length === 0) {
                  current.push({ id: crypto.randomUUID(), nome: 'Barragem 1', lat: latGMS, long: longGMS });
                } else {
                  current[targetIdx] = { ...current[targetIdx], lat: latGMS, long: longGMS };
                }
                setIsTextoEdited(false);
                return {
                  ...prev,
                  lat: current[0]?.lat || latGMS,
                  long: current[0]?.long || longGMS,
                  barragens: current
                };
              });
              const targetName = formData.barragens?.[activeBarragemIndex]?.nome || `Barragem #${activeBarragemIndex + 1}`;
              toast.success(`Coordenadas aplicadas na ${targetName}: Lat ${latGMS} / Long ${longGMS}`);
            }}
          />
        </section>

        {/* Topic 3 */}
        <section id="section-3" className={`bg-white rounded-xl shadow-sm border border-slate-200 relative transition-all ${showAnalistaDropdown ? 'z-50' : 'z-10'}`}>
          <button 
            onClick={() => toggleSection(3)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="text-emerald-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">3. Trâmites Administrativos</h2>
            </div>
            {expandedSections[3] ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>

          <AnimatePresence>
            {expandedSections[3] && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-100/50 rounded-[2rem] border border-slate-200 shadow-inner">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nº do Processo</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.numProcesso}
                            onChange={(e) => handleInputChange('numProcesso', e.target.value)}
                            placeholder="SEMA-PRO1810/2026"
                            disabled={readOnly}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-2">
                            Situação da Notificação
                            {formData.situacao === 'Não cumprida no prazo' && (
                              <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#FF9800] shadow-sm">
                                <div className="w-2.5 h-2.5 rounded-full bg-[#7B3FE4] flex items-center justify-center text-[7px] text-white font-black leading-none border border-white/20">!</div>
                              </div>
                            )}
                          </label>
                          <select 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.situacao || 'Em aberto'}
                            onChange={(e) => handleInputChange('situacao', e.target.value)}
                            disabled={readOnly}
                          >
                            <option value="Em aberto">Em aberto</option>
                            <option value="Cumprida">Cumprida</option>
                            <option value="Não cumprida no prazo">Não cumprida no prazo</option>
                            <option value="Arquivada">Arquivada</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prazo de Vencimento (dias)</label>
                          <input 
                            type="number" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.prazoVencimento}
                            onChange={(e) => handleInputChange('prazoVencimento', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Objetivo</label>
                          <textarea 
                            rows={2}
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.objetivo}
                            onChange={(e) => handleInputChange('objetivo', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notificação Gerada (Nº)</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.notificacaoGerada}
                            onChange={(e) => handleInputChange('notificacaoGerada', e.target.value.replace(/\D/g, ''))}
                            placeholder="181000126"
                            disabled={readOnly}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ofício Gerado</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.oficioGerado}
                            onChange={(e) => handleInputChange('oficioGerado', e.target.value)}
                            placeholder="Ex: 123/2024/CSB"
                            disabled={readOnly}
                          />
                        </div>
                        
                        {/* Analistas Responsáveis */}
                        <div className="md:col-span-2 space-y-4 pt-4 border-t border-slate-200">
                          <label className="block text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                            <Users size={14} className="text-emerald-600" /> Analistas Responsáveis
                          </label>
                          
                          <div className="relative" ref={analistaDropdownRef}>
                            <div 
                              onClick={() => !readOnly && setShowAnalistaDropdown(!showAnalistaDropdown)}
                              className={`w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl cursor-pointer flex justify-between items-center min-h-[48px] transition-all ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10'}`}
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
                                              handleAnalistaToggle(fullName);
                                            }}
                                          />
                                        )}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-slate-400 text-sm italic font-medium">Clique para selecionar os analistas...</span>
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
                                    placeholder="Pesquisar ou digitar nome..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 placeholder:text-slate-400"
                                    value={analistaSearch}
                                    onChange={(e) => setAnalistaSearch(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleManualAnalistaAdd();
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                  />
                                  {analistaSearch && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleManualAnalistaAdd();
                                      }}
                                      className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm"
                                      title="Adicionar nome manualmente"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  )}
                                </div>
                                <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                                  {analistaSearch && !OPS_ANALISTA.some(n => n.toLowerCase() === analistaSearch.toLowerCase()) && (
                                    <div 
                                      onClick={() => handleManualAnalistaAdd()}
                                      className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all mb-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 border-dashed"
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                                        <Plus size={16} />
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs font-black uppercase tracking-widest opacity-60">Adicionar Manualmente</span>
                                        <span className="text-sm font-bold">{analistaSearch}</span>
                                      </div>
                                    </div>
                                  )}
                                  {filteredAnalistas.map(name => {
                                    const isThiago = name === 'Thiago Silveira da Silva';
                                    const cargo = isThiago ? 'Residente Técnico' : 'Analista de Meio Ambiente';
                                    const fullName = `${name} / ${cargo} – SEMA/MT`;
                                    const isSelected = (formData.analistas || []).includes(fullName);
                                    return (
                                      <div 
                                        key={name}
                                        onClick={() => handleAnalistaToggle(fullName)}
                                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all mb-1 ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                      >
                                        <span className={`text-sm ${isSelected ? 'font-bold' : 'font-medium'}`}>{name}</span>
                                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 bg-white'}`}>
                                          {isSelected && <CheckCircle size={14} strokeWidth={3} />}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {filteredAnalistas.length === 0 && !analistaSearch && (
                                    <div className="p-8 text-center space-y-2">
                                      <p className="text-sm text-slate-400 italic">Nenhum analista encontrado.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data da Notificação</label>
                          <input 
                            type="date" 
                            className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none"
                            value={formData.dataNotificacao}
                            onChange={(e) => handleInputChange('dataNotificacao', e.target.value)}
                            disabled={readOnly}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

        {/* Topic 4 */}
        <section id="section-4" className="bg-white rounded-xl shadow-sm border border-slate-200 relative z-10">
          <button 
            onClick={() => toggleSection(4)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Eye className="text-emerald-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">4. Notificação - Revisão</h2>
            </div>
            {expandedSections[4] ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>

          <AnimatePresence>
            {expandedSections[4] && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="p-6 pt-0 border-t border-slate-50">
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase">Texto Gerado (Editável)</label>
                        <p className="text-[11px] text-slate-500">
                          Texto oficial gerado automaticamente a partir dos dados preenchidos nos tópicos anteriores.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleForceUpdateText}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                        title="Forçar atualização do texto com as informações dos tópicos anteriores"
                      >
                        <RefreshCw size={14} />
                        <span>Atualizar</span>
                      </button>
                    </div>
                    <textarea 
                      rows={12}
                      className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none font-mono leading-relaxed"
                      value={formData.textoNotificacao}
                      onChange={(e) => {
                        setIsTextoEdited(true);
                        handleInputChange('textoNotificacao', e.target.value);
                      }}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Topic 5 - Conclusão */}
        <section id="section-5" className="bg-slate-900 rounded-2xl shadow-xl text-white overflow-hidden">
          <button 
            onClick={() => toggleSection(5)}
            className="w-full flex items-center justify-between p-8 hover:bg-slate-800 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500 rounded-lg">
                <CheckCircle size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Conclusão da Notificação</h2>
                <p className="text-slate-400 text-sm">Revise o texto final e gere o documento oficial</p>
              </div>
            </div>
            {expandedSections[5] ? <ChevronUp size={24} className="text-slate-600" /> : <ChevronDown size={24} className="text-slate-600" />}
          </button>
          
          <AnimatePresence>
            {expandedSections[5] && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="p-8 pt-0 border-t border-slate-800">
                  <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-8 max-h-96 overflow-y-auto custom-scrollbar mt-6">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
                      {formData.textoNotificacao}
                    </pre>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                      onClick={handleDownloadPDF}
                      className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-600/20"
                    >
                      <FileDown size={20} /> SALVAR PDF
                    </button>
                    <button 
                      onClick={handleDownloadDocx}
                      className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
                    >
                      <FileDown size={20} /> SALVAR DOCX
                    </button>
                    {!readOnly && (
                      <button 
                        onClick={() => handleSave('Concluído')}
                        disabled={isSaving}
                        className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all border border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />} FINALIZAR NO SISTEMA
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Topic 6 - Relatório Técnico */}
        <section id="section-6" className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative z-10">
          <button 
            onClick={() => toggleSection(6)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
                <FileText size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">TÓPICO 6 — RELATÓRIO TÉCNICO</h2>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full uppercase">Novo Produto</span>
                </div>
                <p className="text-slate-500 text-xs">Vistoria remota com imagens de satélite, escala métrica, norte e exportação DOCX oficial</p>
              </div>
            </div>
            {expandedSections[6] ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>

          <AnimatePresence>
            {expandedSections[6] && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="p-6 pt-0 border-t border-slate-100">
                  <RelatorioTecnicoSection formData={formData} readOnly={readOnly} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Topic 7 - SIGADOC */}
        <section id="section-7" className="bg-white rounded-xl shadow-sm border border-slate-200 relative z-10">
          <button 
            onClick={() => toggleSection(7)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <FileText className="text-blue-600" size={20} />
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">7. OFÍCIO PARA O SIGADOC</h2>
            </div>
            {expandedSections[7] ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>

          <AnimatePresence>
            {expandedSections[7] && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="p-6 pt-0 border-t border-slate-50">
                  <p className="text-xs text-slate-500 mb-4 mt-4">Texto pré-formatado para copiar e inserir no sistema SigaDoc:</p>
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 relative group">
                    <textarea 
                      rows={8}
                      readOnly
                      className="w-full bg-transparent border-none focus:ring-0 font-medium text-slate-700 text-sm leading-relaxed resize-none outline-none"
                      value={formData.textoSigaDoc}
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(formData.textoSigaDoc || '');
                        toast.success('Texto copiado para a área de transferência!');
                      }}
                      className="absolute top-2 right-2 p-2 bg-white border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm opacity-0 group-hover:opacity-100"
                      title="Copiar texto"
                    >
                      <ClipboardList size={14} />
                    </button>
                  </div>

                  {/* Anotações Internas */}
                  <div className="mt-8 pt-8 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                      <Eraser size={14} /> Anotações Internas (Apenas para conhecimento interno)
                    </label>
                    <textarea 
                      rows={4}
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-medium text-slate-600 transition-all outline-none"
                      placeholder="Insira aqui observações que não devem constar no documento oficial..."
                      value={formData.anotacoesInternas}
                      onChange={(e) => handleInputChange('anotacoesInternas', e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <ConfirmModal 
        {...confirmModal} 
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
      />

      {isSaving && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4">
            <Loader2 className="text-emerald-500 animate-spin" size={40} />
            <p className="font-bold text-slate-800">Salvando Notificação...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificaForm;
