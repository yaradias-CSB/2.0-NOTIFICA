import React, { useState, useContext, useEffect, useMemo } from 'react';
import { 
  Save, Download, ArrowLeft, FileText, Plus, Trash2, X, CheckCircle, Loader2, 
  RotateCcw, Calendar, AlertTriangle, Edit2, Info, MapPin, ClipboardList, Shield,
  ChevronDown, Check, Search
} from 'lucide-react';
import { OPS_ANALISTA, OPS_MUNICIPIOS, OPS_RESPONSAVEL_TECNICO } from '../constants';
import { DataContext } from '../contexts/DataContext';
import { EcosystemContext } from '../contexts/EcosystemContext';
import { logActivity } from '../lib/audit';
import { generateOficioDoc } from '../services/docxService';
import { generateOficioPDF } from '../services/pdfService';
import { OficioData, CoordenadasGMS } from '../types';
import {
  BarragemCanonica,
  CURRENT_SYSTEM_ID,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import { AdministraEntityPicker } from './ecosystem/AdministraEntityPicker';
import { CarCoordinateLookup } from './ecosystem/CarCoordinateLookup';
import { matchMunicipioMT } from '../services/carLookupService';

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

import { sanitizeObject } from '../lib/security';

interface OficioFormProps {
  onBack: () => void;
  initialData?: OficioData | null;
  readOnly?: boolean;
}

const OficioForm: React.FC<OficioFormProps> = ({ onBack, initialData, readOnly }) => {
  const { refreshData, saveOficio, deleteOficio } = useContext(DataContext);
  const { syncEntitiesFromForm } = useContext(EcosystemContext);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<OficioData>(() => {
    if (initialData) {
      return { ...INITIAL_STATE, ...initialData };
    }
    return INITIAL_STATE;
  });

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
    if (window.confirm('Tem certeza que deseja limpar todo o formulário?')) {
      setFormData(INITIAL_STATE);
    }
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

  const handleSave = async (status: 'Rascunho' | 'Concluído') => {
    // Basic Validation
    if (!formData.interessado || !formData.protocolo || !formData.municipio) {
      alert('Por favor, preencha os campos obrigatórios (Interessado, Protocolo e Município).');
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
        registroProfissional: sanitizedFormData.art,
      }));

      const syncRes = await syncEntitiesFromForm({
        existingEmpreendedorId: sanitizedFormData.empreendedorId,
        existingBarragemId: sanitizedFormData.barragemId,
        empreendedorNome: sanitizedFormData.interessado,
        cpfCnpj: sanitizedFormData.cpfCnpj,
        logradouro: sanitizedFormData.logradouro,
        numero: sanitizedFormData.numero,
        complemento: sanitizedFormData.complemento,
        bairro: sanitizedFormData.bairro,
        municipio: sanitizedFormData.municipio || sanitizedFormData.cidadeUf,
        cep: sanitizedFormData.cep,
        nomeBarragem: sanitizedFormData.empreendimento,
        processo: sanitizedFormData.processo || sanitizedFormData.protocolo,
        coordenadasGMS: sanitizedFormData.coordenadasGMS,
        responsaveisTecnicos: rtList,
        analista: sanitizedFormData.analistas?.[0] || 'Sistema Local',
      });

      const resolvedEmpreendedorId = syncRes.empreendedorId || sanitizedFormData.empreendedorId;
      const resolvedBarragemId = syncRes.barragemId || sanitizedFormData.barragemId;
      const resolvedRtIds =
        syncRes.responsavelTecnicoIds.length > 0
          ? syncRes.responsavelTecnicoIds
          : sanitizedFormData.responsavelTecnicoIds;

      const res = await saveOficio({
        ...sanitizedFormData,
        id: formData.id || undefined,
        empreendedorId: resolvedEmpreendedorId,
        barragemId: resolvedBarragemId,
        responsavelTecnicoIds: resolvedRtIds,
        sourceSystem: sanitizedFormData.sourceSystem || CURRENT_SYSTEM_ID,
        status: status,
        analista: formData.analistas?.[0] || 'Sistema Local',
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

      alert(`Ofício salvo como ${status} com sucesso!`);
      if (status === 'Concluído') onBack();
    } catch (error: any) {
      console.warn('Notice saving oficio:', error);
      alert(`Erro ao salvar ofício: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    if (!window.confirm('Tem certeza que deseja excluir este ofício?')) return;

    setLoading(true);
    try {
      const res = await deleteOficio(formData.id);
      if (!res.success) throw new Error(res.message || 'Erro ao excluir ofício.');
      alert('Ofício excluído com sucesso!');
      onBack();
    } catch (error: any) {
      console.error('Erro ao excluir ofício:', error);
      alert('Erro ao excluir ofício.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = async () => {
    try {
      await generateOficioDoc({ ...formData, totalDias, dataFinal });
      logActivity({
        action: 'DOWNLOAD_OFICIO',
        details: `Download do Ofício efetuado. Processo: ${formData.processo || 'S/P'}. Empreendedor: ${formData.interessado || '---'}`
      });
    } catch (error) {
      console.error('Erro ao gerar DOCX:', error);
      alert('Erro ao gerar o arquivo Word.');
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await generateOficioPDF({ ...formData, totalDias, dataFinal });
      logActivity({
        action: 'DOWNLOAD_OFICIO',
        details: `Download do Ofício (PDF) efetuado. Processo: ${formData.processo || 'S/P'}. Empreendedor: ${formData.interessado || '---'}`
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar o arquivo PDF.');
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
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Ofício de <span className="text-emerald-600">Pendências</span>
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
              <button onClick={handleClear} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-2">
                <RotateCcw size={14} /> Limpar
              </button>
              {formData.id && (
                <button onClick={handleDelete} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-xs hover:bg-red-50 transition-all flex items-center gap-2">
                  <Trash2 size={14} /> Excluir
                </button>
              )}
              <button onClick={() => handleSave('Rascunho')} disabled={loading} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-2">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Rascunho
              </button>
              <button onClick={() => handleSave('Concluído')} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Concluir
              </button>
            </>
          )}
          <button onClick={handleDownloadPDF} className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 transition-all flex items-center gap-2 shadow-lg shadow-rose-600/20" title="Exportar Ofício em PDF">
            <Download size={14} /> Exportar PDF
          </button>
          <button onClick={handleDownloadDocx} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20">
            <Download size={14} /> Exportar Docx
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto mt-8 px-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Main Info */}
          <section className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Info size={20} />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Informações Gerais</h2>
            </div>

            <AdministraEntityPicker
              readOnly={readOnly}
              currentDocumentId={formData.id}
              selectedEmpreendedorId={formData.empreendedorId}
              selectedBarragemId={formData.barragemId}
              cpfCnpj={formData.cpfCnpj}
              nomeBarragem={formData.empreendimento}
              onSelectEmpreendedor={(emp: EmpreendedorCanonico) => {
                setFormData(prev => ({
                  ...prev,
                  empreendedorId: emp.id,
                  interessado: emp.nome || prev.interessado,
                  cpfCnpj: emp.cpfCnpj || prev.cpfCnpj,
                  logradouro: emp.logradouro || prev.logradouro,
                  numero: emp.numero || prev.numero,
                  complemento: emp.complemento || prev.complemento,
                  bairro: emp.bairro || prev.bairro,
                  municipio: emp.municipio || prev.municipio,
                  cidadeUf: emp.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : prev.cidadeUf,
                  cep: emp.cep || prev.cep,
                }));
              }}
              onSelectBarragem={(bar: BarragemCanonica) => {
                setFormData(prev => ({
                  ...prev,
                  barragemId: bar.id,
                  empreendedorId: bar.empreendedorId || prev.empreendedorId,
                  empreendimento: bar.nomeBarragem || prev.empreendimento,
                  municipio: bar.municipio || prev.municipio,
                  coordenadasGMS: bar.coordenadasGMS || prev.coordenadasGMS,
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
                    art: prev.art || rt.registroProfissional || '',
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Protocolo / Processo</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.protocolo} 
                  onChange={(e) => handleInputChange('protocolo', e.target.value)} 
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Identificação do Empreendedor</label>
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Empreendimento (Fazenda/Barragem)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.empreendimento} 
                  onChange={(e) => handleInputChange('empreendimento', e.target.value)} 
                  disabled={readOnly} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Município do Empreendimento</label>
                <select 
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 font-bold text-slate-700 transition-all outline-none shadow-sm" 
                  value={formData.municipio || OPS_MUNICIPIOS[0]} 
                  onChange={(e) => handleInputChange('municipio', e.target.value)} 
                  disabled={readOnly}
                >
                  {OPS_MUNICIPIOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Endereço */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-slate-100/50 rounded-[2rem] border border-slate-200 shadow-inner">
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
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assunto</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-100 border-2 border-slate-200 rounded-xl font-bold text-slate-500 cursor-not-allowed shadow-inner" 
                  value={formData.assunto} 
                  disabled 
                />
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
                  onChange={(e) => handleInputChange('art', e.target.value)} 
                  disabled={readOnly} 
                />
              </div>
            </div>
          </section>

          {/* Pendencies */}
          <section className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <ClipboardList size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Listagem de Pendências</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
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
                  className="px-6 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center"
                >
                  {editingPendenciaId ? <Save size={20} /> : <Plus size={20} />}
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
    </div>
  );
};

export default OficioForm;
