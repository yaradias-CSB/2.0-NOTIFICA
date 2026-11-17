import React, { useState, useMemo, useRef, useEffect, useContext } from 'react';
import { Search, ChevronDown, ChevronUp, Check, Eye, Edit, Trash2, Database, Filter, ArrowUpDown, ArrowUp, ArrowDown, Loader2, ChevronLeft, ChevronRight, Download, FileDown } from 'lucide-react';
import { generateParecerPDF, generateOficioPDF, generateNotificacaoPDF } from '../services/pdfService';
import { OPS_MUNICIPIOS, OPS_ANALISTA, OPS_RESPONSAVEL_TECNICO } from '../constants';
import { RiscoEnum, DanoEnum, ParecerData, OficioData } from '../types';
import { DataContext, AppDocument } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../lib/audit';
import * as XLSX from 'xlsx';

// --- MultiSelect Component (Reused) ---
interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchable?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selected, onChange, searchable }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-xs font-bold text-slate-500 mb-1">{label}</label>
      <div 
        className="w-full border border-slate-300 rounded-lg p-2 bg-white flex items-center justify-between cursor-pointer hover:border-emerald-500 transition-colors min-h-[42px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex flex-wrap gap-1 max-w-[90%] overflow-hidden">
          {selected.length === 0 ? (
            <span className="text-sm text-slate-400">Selecionar...</span>
          ) : (
            <span className="text-sm text-slate-700 font-medium">
              {selected.length === 1 ? selected[0] : `${selected.length} selecionados`}
            </span>
          )}
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-hidden flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  className="w-full pl-8 pr-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-emerald-500"
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()} 
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto flex-1 p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt} 
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer ${selected.includes(opt) ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'}`}
                  onClick={() => toggleOption(opt)}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${selected.includes(opt) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                    {selected.includes(opt) && <Check size={12} className="text-white" />}
                  </div>
                  {opt}
                </div>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-slate-400">Nenhum resultado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ParecerListProps {
  onEditParecer?: (parecer: ParecerData) => void;
  onViewParecer?: (parecer: ParecerData) => void;
}

const ParecerList: React.FC<ParecerListProps> = ({ onEditParecer, onViewParecer }) => {
  const { documents: pareceres, loading, refreshData, deleteParecer, deleteOficio, deleteNotificacao, deleteFiscalizacao } = useContext(DataContext);
  const { canEdit, canDelete } = useAuth();
  const [filters, setFilters] = useState({
    municipios: [] as string[],
    dpa: [] as string[],
    cri: [] as string[],
    pnsb: [] as string[],
    analistas: [] as string[],
    rt: [] as string[],
    status: [] as string[],
    classificacao: [] as string[],
    tipo: [] as string[],
    mesAno: [] as string[],
    empreendedores: [] as string[],
    car: [] as string[],
    cpfCnpj: [] as string[],
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: 'data',
    direction: 'desc',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, searchTerm]);

  const clearFilters = () => {
    setFilters({
      municipios: [], dpa: [], cri: [], pnsb: [], analistas: [], rt: [], status: [], classificacao: [], tipo: [], mesAno: [],
      empreendedores: [], car: [], cpfCnpj: []
    });
    setSortConfig({ key: 'data', direction: 'desc' });
    setCurrentPage(1);
  };

  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
  };

  const exportToExcel = () => {
    if (filteredData.length === 0) return;

    // Helper to flatten nested objects
    const flattenObject = (obj: any, prefix = ''): any => {
      return Object.keys(obj).reduce((acc: any, k) => {
        const pre = prefix.length ? prefix + '_' : '';
        const value = obj[k];
        
        if (value === null || value === undefined) {
          acc[pre + k] = '';
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(acc, flattenObject(value, pre + k));
        } else if (Array.isArray(value)) {
          acc[pre + k] = value.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join('; ');
        } else {
          acc[pre + k] = value;
        }
        return acc;
      }, {});
    };

    // Flatten all documents and collect all unique keys
    const flattenedDocs = filteredData.map(doc => {
      const { tipo_documento, ...rest } = doc;
      const flattened = flattenObject(rest);
      // Ensure "Tipo de documento" is explicitly present and clear
      flattened['Tipo de documento'] = doc.tipo_documento;
      flattened['Número do Documento'] = getDocumentNumber(doc);
      
      // Add calculated fields for easier reading in Excel
      flattened['Data Formatada'] = getFormattedDate(doc);
      flattened['Coordenadas Formatadas'] = getCoordinates(doc);
      flattened['CPF_CNPJ_Formatado'] = getCpfCnpj(doc);
      flattened['Analista Responsável'] = getAnalistaResponsavel(doc);
      flattened['Empreendimento Detalhado'] = getEmpreendimentoDetailed(doc);
      
      return flattened;
    });

    const allKeys = new Set<string>();
    // Put important keys first
    const priorityKeys = [
      'Tipo de documento', 
      'Número do Documento',
      'Data Formatada',
      'id', 
      'processo', 
      'protocolo', 
      'numProcesso',
      'Empreendimento Detalhado',
      'CPF_CNPJ_Formatado',
      'Coordenadas Formatadas',
      'Analista Responsável',
      'municipio', 
      'status', 
      'created_at'
    ];
    priorityKeys.forEach(key => allKeys.add(key));

    flattenedDocs.forEach(doc => {
      Object.keys(doc).forEach(key => allKeys.add(key));
    });

    const headers = Array.from(allKeys);
    
    // Prepare data for XLSX
    const data = flattenedDocs.map(doc => {
      const row: any = {};
      headers.forEach(header => {
        row[header] = doc[header] === undefined || doc[header] === null ? '' : doc[header];
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Banco de Dados");
    
    XLSX.writeFile(workbook, `banco_de_dados_notifica_csb_${new Date().toISOString().split('T')[0]}.xlsx`);

    logActivity({
      action: 'EXPORT_EXCEL',
      details: `Exportação de Banco de Dados Gerada. Total de registros exportados: ${filteredData.length}`
    });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key || !sortConfig.direction) return <ArrowUpDown size={14} className="text-slate-300" />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-emerald-500" /> : <ArrowDown size={14} className="text-emerald-500" />;
  };

  const getFormattedDate = (item: AppDocument) => {
    const date = item.updated_at || item.created_at || (item as any).data || (item as any).dataParecer || (item as any).dataEmissao || (item as any).dataNotificacao;
    if (!date) return '---';
    try {
      return new Date(date).toLocaleDateString('pt-BR');
    } catch (e) {
      return '---';
    }
  };

  const getCoordinates = (item: AppDocument) => {
    const itemAny = item as any;
    
    // Check for GMS coordinates
    if (itemAny.coordenadasGMS && itemAny.coordenadasGMS.lat && itemAny.coordenadasGMS.long) {
      const lat = itemAny.coordenadasGMS.lat;
      const long = itemAny.coordenadasGMS.long;
      
      const formatPart = (p: any) => {
        if (!p) return '00';
        return `${p.g || '00'}°${p.m || '00'}'${p.s || '00'}"`;
      };
      
      return `${formatPart(lat)}S / ${formatPart(long)}O`;
    }
    
    // Check for direct lat/long strings (like in Notificacao)
    if (itemAny.lat && itemAny.long) {
      return `${itemAny.lat}S / ${itemAny.long}O`;
    }
    
    // Check for decimal latitude/longitude
    if (itemAny.latitude !== undefined && itemAny.longitude !== undefined) {
      return `${itemAny.latitude.toFixed(4)} / ${itemAny.longitude.toFixed(4)}`;
    }

    return '---';
  };

  const getCpfCnpj = (item: AppDocument) => {
    return (item as any).cpfCnpj || (item as any).documentoIdentificacao || '---';
  };

  const getEmpreendedorName = (item: AppDocument) => {
    const itemAny = item as any;
    return itemAny.identificacaoEmpreendedor || itemAny.razaoSocial || itemAny.interessado || itemAny.empreendedorNome || '---';
  };

  const getEmpreendimentoOnly = (item: AppDocument) => {
    const itemAny = item as any;
    const parts = [
      itemAny.empreendimento,
      itemAny.localizacaoEmpreendimento,
      itemAny.nomeFantasia,
      itemAny.enderecoEmpreendimento
    ].filter(Boolean);
    return parts.join(' / ') || '---';
  };

  const getEmpreendimentoDetailed = (item: AppDocument) => {
    const itemAny = item as any;
    const parts = [
      itemAny.empreendimento,
      itemAny.localizacaoEmpreendimento,
      itemAny.nomeFantasia,
      itemAny.enderecoEmpreendimento
    ].filter(Boolean);
    
    if (parts.length === 0) {
      return itemAny.identificacaoEmpreendedor || itemAny.razaoSocial || itemAny.interessado || itemAny.empreendedorNome || '---';
    }
    
    return parts.join(' / ');
  };

  const getAnalistaResponsavel = (item: AppDocument): string => {
    const itemAny = item as any;
    const raw = itemAny.analistas?.[0] || itemAny.analista || itemAny.analistasOutros?.[0] || itemAny.analistaOutro || '';
    if (!raw || typeof raw !== 'string' || !raw.trim()) return '---';
    
    // Deixar apenas o nome do analista, removendo o cargo e SEMA/MT
    // Ex: "Thiago Silveira da Silva / Residente Técnico – SEMA/MT" -> "Thiago Silveira da Silva"
    let name = raw.split('/')[0].trim();
    if (name.includes(' – ')) {
      name = name.split(' – ')[0].trim();
    } else if (name.includes(' - ')) {
      name = name.split(' - ')[0].trim();
    }
    return name || '---';
  };

  const getDocumentNumber = (item: AppDocument): string => {
    const itemAny = item as any;
    if (!itemAny) return 'S/N';

    if (item.tipo_documento === 'Notificação') {
      const num = itemAny.notificacaoGerada || itemAny.notificacao_gerada || itemAny.numNotificacao || itemAny.num_notificacao;
      if (num) return `Nº ${num}`;
      if (itemAny.oficioGerado || itemAny.oficio_gerado) return `Ofício Nº ${itemAny.oficioGerado || itemAny.oficio_gerado}`;
      if (itemAny.numero) return `Nº ${itemAny.numero}`;
      if (itemAny.numProcesso || itemAny.processo || itemAny.protocolo) return `Proc. Nº ${itemAny.numProcesso || itemAny.processo || itemAny.protocolo}`;
      return 'S/N';
    }

    if (item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral') {
      const num = itemAny.numero || itemAny.numeroOficio || itemAny.oficioGerado || itemAny.numero_oficio || itemAny.oficio_gerado;
      if (num) return `Nº ${num}`;
      if (itemAny.protocolo || itemAny.processo) return `Proc. Nº ${itemAny.protocolo || itemAny.processo}`;
      return 'S/N';
    }

    if (item.tipo_documento?.startsWith('Parecer Técnico') || item.tipo_documento === 'Fiscalização') {
      const num = itemAny.numParecerTecnico || itemAny.num_parecer_tecnico || itemAny.numero || itemAny.parecerNumero || itemAny.numParecer;
      if (num) return `Nº ${num}`;
      if (itemAny.processo || itemAny.protocolo) return `Proc. Nº ${itemAny.processo || itemAny.protocolo}`;
      return 'S/N';
    }

    const generalNum = itemAny.notificacaoGerada || itemAny.numParecerTecnico || itemAny.numero || itemAny.numeroOficio || itemAny.numNotificacao || itemAny.oficioGerado || itemAny.processo || itemAny.protocolo || itemAny.numProcesso;
    return generalNum ? `Nº ${generalNum}` : 'S/N';
  };

  const empreendedorOptions = useMemo(() => {
    const list = new Set<string>();
    pareceres.forEach(item => {
      const name = getEmpreendedorName(item);
      if (name && name !== '---') {
        list.add(name);
      }
    });
    return Array.from(list).sort();
  }, [pareceres]);

  const carOptions = useMemo(() => {
    const list = new Set<string>();
    pareceres.forEach(item => {
      const itemAny = item as any;
      const car = itemAny.carMt || itemAny.numCarMt;
      if (car && car.trim() !== '') {
        list.add(car.trim());
      }
    });
    return Array.from(list).sort();
  }, [pareceres]);

  const cpfCnpjOptions = useMemo(() => {
    const list = new Set<string>();
    pareceres.forEach(item => {
      const val = getCpfCnpj(item);
      if (val && val !== '---') {
        list.add(val.trim());
      }
    });
    return Array.from(list).sort();
  }, [pareceres]);

  const filteredData = useMemo(() => {
    const relevantDocs = pareceres;

    let result = relevantDocs.filter(item => {
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const itemAny = item as any;
        const searchFields = [
          itemAny.processo,
          itemAny.protocolo,
          itemAny.numProcesso,
          itemAny.notificacaoGerada,
          itemAny.numNotificacao,
          itemAny.oficioGerado,
          itemAny.numeroOficio,
          itemAny.oficioId,
          itemAny.numParecerTecnico,
          itemAny.identificacaoEmpreendedor,
          itemAny.interessado,
          itemAny.empreendedorNome,
          itemAny.empreendimento,
          itemAny.nomeFantasia,
          itemAny.municipio,
          itemAny.municipioEmpreendimento,
          itemAny.cidadeUf,
          itemAny.cpfCnpj,
          itemAny.documentoIdentificacao,
          itemAny.razaoSocial,
          ...(itemAny.analistas || []),
          itemAny.analista,
          itemAny.responsavelTecnico,
          itemAny.art,
          itemAny.artCreaMt
        ].filter(Boolean).map(f => String(f).toLowerCase());

        const matches = searchFields.some(field => field.includes(lower));
        if (!matches) return false;
      }

      const itemMunicipio = (item as any).municipio || (item as any).municipioEmpreendimento || (item as any).cidadeUf || "";
      if (filters.municipios.length > 0 && !filters.municipios.includes(itemMunicipio)) return false;
      
      if (item.tipo_documento?.startsWith('Parecer')) {
        const p = item as ParecerData;
        const classificacao = (p as any).classificacao;
        const dpa = classificacao?.dpaClass || p.classificacaoDPA || "";
        const cri = classificacao?.risco || p.classificacaoCRI || "";
        if (filters.dpa.length > 0 && !filters.dpa.includes(dpa)) return false;
        if (filters.cri.length > 0 && !filters.cri.includes(cri)) return false;
      }

      if (filters.analistas.length > 0) {
        const itemAnalysts: string[] = [];
        if (Array.isArray((item as any).analistas)) {
          itemAnalysts.push(...(item as any).analistas);
        }
        if ((item as any).analista) {
          itemAnalysts.push((item as any).analista);
        }
        if (Array.isArray((item as any).analistasOutros)) {
          itemAnalysts.push(...(item as any).analistasOutros);
        }
        if ((item as any).analistaOutro) {
          itemAnalysts.push((item as any).analistaOutro);
        }

        const cleanName = (val: string) => val.split('/')[0].trim().toLowerCase();
        const hasMatch = itemAnalysts.some(docAnalyst => {
          if (!docAnalyst) return false;
          const cleanedDoc = cleanName(docAnalyst);
          return filters.analistas.some(f => cleanName(f) === cleanedDoc);
        });

        if (!hasMatch) return false;
      }
      if (filters.status.length > 0 && !filters.status.includes(item.status || "")) return false;
      if (filters.tipo.length > 0 && !filters.tipo.includes(item.tipo_documento)) return false;

      const itemEmpreendedor = getEmpreendedorName(item);
      if (filters.empreendedores.length > 0 && !filters.empreendedores.includes(itemEmpreendedor)) return false;

      const itemAnyFilter = item as any;
      const itemCar = itemAnyFilter.carMt || itemAnyFilter.numCarMt || '';
      if (filters.car.length > 0 && !filters.car.includes(itemCar.trim())) return false;

      const itemCpfCnpj = getCpfCnpj(item);
      if (filters.cpfCnpj.length > 0 && !filters.cpfCnpj.includes(itemCpfCnpj.trim())) return false;

      return true;
    });

    if (sortConfig.key && sortConfig.direction) {
      result.sort((a: any, b: any) => {
        let aValue = a[sortConfig.key] || "";
        let bValue = b[sortConfig.key] || "";
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [pareceres, filters, searchTerm, sortConfig]);

  const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    if (itemsPerPage === -1) {
      return filteredData;
    }
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: Math.max(1, totalPages) }, (_, i) => i + 1);
    }
    let start = currentPage - 2;
    let end = currentPage + 2;

    if (start < 1) {
      end += (1 - start);
      start = 1;
    }
    if (end > totalPages) {
      start -= (end - totalPages);
      end = totalPages;
    }
    start = Math.max(1, start);

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [totalPages, currentPage]);

  const handleEdit = (item: AppDocument) => {
    if (!canEdit) {
      onViewParecer?.(item as any);
      return;
    }
    if (item.status === 'Concluído') {
      if (window.confirm(`Este ${item.tipo_documento.toLowerCase()} já está concluído. Deseja realmente alterá-lo?`)) {
        onEditParecer?.(item as any);
      }
    } else {
      onEditParecer?.(item as any);
    }
  };

  const handleExportPDF = async (item: AppDocument) => {
    try {
      if (item.tipo_documento.startsWith('Parecer Técnico')) {
        await generateParecerPDF(item as ParecerData);
      } else if (item.tipo_documento.includes('Ofício') || item.tipo_documento.includes('Oficio')) {
        await generateOficioPDF(item as OficioData);
      } else if (item.tipo_documento === 'Notificação') {
        await generateNotificacaoPDF(item as any);
      } else {
        await generateParecerPDF(item as any);
      }

      logActivity({
        action: 'DOWNLOAD_DOCUMENT',
        details: `Exportação em PDF do documento ${item.tipo_documento} realizada com sucesso.`
      });
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      alert('Erro ao gerar o arquivo PDF.');
    }
  };

  const handleDelete = async (id: string, item: AppDocument) => {
    if (!canDelete) return;
    if (window.confirm(`Tem certeza que deseja excluir este ${item.tipo_documento.toLowerCase()}?`)) {
      let result;
      if (item.tipo_documento.startsWith('Parecer Técnico')) {
        result = await deleteParecer(id);
      } else if (item.tipo_documento === 'Ofício de Pendências') {
        result = await deleteOficio(id);
      } else if (item.tipo_documento === 'Notificação') {
        result = await deleteNotificacao(id);
      } else if (item.tipo_documento === 'Fiscalização') {
        result = await deleteFiscalizacao(id);
      } else {
        // Fallback
        result = await deleteParecer(id);
      }

      if (result.success) {
        alert(`${item.tipo_documento} excluído com sucesso!`);
      } else {
        alert(result.message || `Erro ao excluir ${item.tipo_documento.toLowerCase()}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 md:p-8 lg:p-12 max-w-[1600px] mx-auto w-full animate-fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 sm:mb-8">
            <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 hover:scale-105 transition-transform">
                  <img 
                    src="https://lh3.googleusercontent.com/d/11OtFjZyub-hYsCvNr8N88CHVtcGM1QKU" 
                    alt="Logo Notifica CSB" 
                    className="w-9 h-9 sm:w-11 sm:h-11 object-contain" 
                    referrerPolicy="no-referrer" 
                  />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
                      Banco de Dados
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Listagem completa e detalhada dos pareceres e ofícios emitidos.</p>
                  </div>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full md:w-auto">
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all touch-manipulation active:scale-95 ${showFilters ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <Filter size={18} />
                  Filtros
                  {Object.values(filters).some((f: any) => f.length > 0) && (
                    <span className="ml-1 w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[10px] font-black">
                      {Object.values(filters).filter((f: any) => f.length > 0).length}
                    </span>
                  )}
                </button>
                <div className="relative flex-1 w-full md:w-80 md:flex-none">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" placeholder="Buscar por protocolo, interessado, nº notificação, nº ofício..." 
                      className="w-full pl-10 pr-4 py-2.5 bg-white sm:bg-[#F5F5F5] border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                      value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
        </div>

        {showFilters && (
            <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 mb-8 animate-in slide-in-from-top-4 duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                        <Filter size={14} className="text-emerald-600" />
                        Filtrar Resultados
                    </h3>
                    <button onClick={clearFilters} className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700 transition-colors">
                        Limpar Filtros
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MultiSelect 
                      label="Tipo de Documento"
                      options={[
                        'Parecer Técnico de ISR', 
                        'Parecer Técnico de ISE', 
                        'Parecer Técnico de PSB', 
                        'Parecer Técnico de PAE', 
                        'Parecer Técnico de RPSB', 
                        'Parecer Técnico de Obras', 
                        'Ofício de Pendências', 
                        'Notificação',
                        'Fiscalização'
                      ]}
                      selected={filters.tipo}
                      onChange={(val) => setFilters(prev => ({ ...prev, tipo: val }))}
                    />
                    <MultiSelect 
                      label="Município"
                      options={OPS_MUNICIPIOS}
                      selected={filters.municipios}
                      onChange={(val) => setFilters(prev => ({ ...prev, municipios: val }))}
                      searchable
                    />
                    <MultiSelect 
                      label="Analista Responsável"
                      options={OPS_ANALISTA}
                      selected={filters.analistas}
                      onChange={(val) => setFilters(prev => ({ ...prev, analistas: val }))}
                      searchable
                    />
                    <MultiSelect 
                      label="Status"
                      options={['Rascunho', 'Concluído']}
                      selected={filters.status}
                      onChange={(val) => setFilters(prev => ({ ...prev, status: val }))}
                    />
                    <MultiSelect 
                      label="Empreendedor"
                      options={empreendedorOptions}
                      selected={filters.empreendedores}
                      onChange={(val) => setFilters(prev => ({ ...prev, empreendedores: val }))}
                      searchable
                    />
                    <MultiSelect 
                      label="CAR"
                      options={carOptions}
                      selected={filters.car}
                      onChange={(val) => setFilters(prev => ({ ...prev, car: val }))}
                      searchable
                    />
                    <MultiSelect 
                      label="CPF / CNPJ"
                      options={cpfCnpjOptions}
                      selected={filters.cpfCnpj}
                      onChange={(val) => setFilters(prev => ({ ...prev, cpfCnpj: val }))}
                      searchable
                    />
                </div>
            </div>
        )}

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <span className="font-bold text-slate-700 text-sm">Registros encontrados: {filteredData.length}</span>
                <button 
                  onClick={exportToExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Exportar Excel</span>
                  <span className="sm:hidden">Exportar</span>
                </button>
            </div>

            {/* Mobile View: Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedData.map((item) => (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-0.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider w-fit ${
                        item.tipo_documento.startsWith('Parecer Técnico') ? 'bg-blue-50 text-blue-700 border border-blue-100' : 
                        item.tipo_documento === 'Ofício de Pendências' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 
                        item.tipo_documento === 'Notificação' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {item.tipo_documento.startsWith('Parecer Técnico') ? 'Parecer' : 
                         item.tipo_documento === 'Notificação' ? 'Notificação' : 
                         item.tipo_documento === 'Ofício de Pendências' ? 'Ofício' : 'Fiscalização'}
                      </span>
                      <span className="text-[11px] font-black font-mono text-slate-900">
                        {getDocumentNumber(item)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                      <button onClick={() => onViewParecer?.(item)} className="p-2 sm:p-2.5 text-slate-500 hover:text-emerald-600 bg-slate-100 hover:bg-emerald-50 rounded-xl transition-colors active:scale-95 touch-manipulation" title="Visualizar"><Eye size={15} /></button>
                      {canEdit && (
                        <button onClick={() => handleEdit(item)} className="p-2 sm:p-2.5 text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-xl transition-colors active:scale-95 touch-manipulation" title="Editar"><Edit size={15} /></button>
                      )}
                      <button onClick={() => handleExportPDF(item)} className="p-2 sm:p-2.5 text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-xl transition-colors active:scale-95 touch-manipulation" title="Exportar PDF"><FileDown size={15} /></button>
                      {canDelete && (
                        <button onClick={() => item.id && handleDelete(item.id, item)} className="p-2 sm:p-2.5 text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-xl transition-colors active:scale-95 touch-manipulation" title="Excluir"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Protocolo / Empreendedor</p>
                    <p className="text-sm font-black text-slate-900">{(item as any).processo || (item as any).protocolo || (item as any).numProcesso}</p>
                    <p className="text-xs font-bold text-slate-700">{getEmpreendedorName(item)}</p>
                    <p className="text-[10px] text-slate-500 italic line-clamp-1">{getEmpreendimentoOnly(item)}</p>
                  </div>
                  <div className="flex justify-between items-center py-1 border-y border-slate-50">
                    <div className="flex flex-col">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Coordenadas / Município</p>
                      <p className="text-[10px] font-mono text-slate-600">{getCoordinates(item)}</p>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase">{(item as any).municipio || (item as any).municipioEmpreendimento || (item as any).cidadeUf || '---'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</p>
                      <p className="text-xs font-medium text-slate-700">{getFormattedDate(item)}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Analista Responsável</p>
                      <p className="text-xs font-bold text-slate-700">{getAnalistaResponsavel(item)}</p>
                    </div>
                    <div>
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                        item.status === 'Concluído' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {paginatedData.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm font-bold italic">
                  Nenhum documento encontrado.
                </div>
              )}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs tracking-wider border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4">Tipo</th>
                        <th className="px-6 py-4">Data</th>
                        <th className="px-6 py-4">Protocolo</th>
                        <th className="px-6 py-4">Empreendedor / Empreendimento</th>
                        <th className="px-6 py-4 hidden xl:table-cell">CPF/CNPJ</th>
                        <th className="px-6 py-4 hidden lg:table-cell">Coordenadas / Município</th>
                        <th className="px-6 py-4 hidden xl:table-cell">Analista Responsável</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {paginatedData.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4">
                                <div className="flex flex-col gap-1 items-start">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        item.tipo_documento.startsWith('Parecer Técnico') ? 'bg-blue-50 text-blue-700' : 
                                        item.tipo_documento === 'Ofício de Pendências' ? 'bg-amber-50 text-amber-700' : 
                                        item.tipo_documento === 'Notificação' ? 'bg-purple-50 text-purple-700' :
                                        'bg-emerald-50 text-emerald-700'
                                    }`}>
                                        {item.tipo_documento.startsWith('Parecer Técnico') ? 'Parecer' : 
                                         item.tipo_documento === 'Ofício de Pendências' ? 'Ofício' : 
                                         item.tipo_documento === 'Notificação' ? 'Notificação' :
                                         'Fiscalização'}
                                    </span>
                                    <span className="text-xs font-black font-mono text-slate-900 tracking-tight">
                                        {getDocumentNumber(item)}
                                    </span>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                        item.status === 'Concluído' ? 'text-emerald-600' : 'text-slate-400'
                                    }`}>
                                        {item.status === 'Concluído' ? 'Homologado' : 'Rascunho'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs">{getFormattedDate(item)}</td>
                            <td className="px-6 py-4 font-bold whitespace-nowrap">{(item as any).processo || (item as any).protocolo || (item as any).numProcesso || '---'}</td>
                            <td className="px-6 py-4 min-w-[200px] lg:min-w-[280px]">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-900 line-clamp-1">{getEmpreendedorName(item)}</span>
                                    <span className="text-[10px] text-slate-500 line-clamp-1 italic">{getEmpreendimentoOnly(item)}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs hidden xl:table-cell">{getCpfCnpj(item)}</td>
                            <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-mono text-slate-700">{getCoordinates(item)}</span>
                                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{(item as any).municipio || (item as any).municipioEmpreendimento || (item as any).cidadeUf || '---'}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-xs hidden xl:table-cell">{getAnalistaResponsavel(item)}</td>
                            <td className="px-6 py-4">
                                {item.tipo_documento === 'Ofício de Pendências' ? (
                                    <div className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full ${
                                            (item as any).situacaoCumprimento === 'Pendente / Em aberto' ? 'bg-yellow-400' :
                                            (item as any).situacaoCumprimento === 'Cumprido' ? 'bg-yellow-400 ring-1 ring-emerald-500 ring-offset-1' :
                                            (item as any).situacaoCumprimento === 'Não cumprido no prazo' ? 'bg-red-500' :
                                            (item as any).situacaoCumprimento === 'Arquivado' ? 'bg-slate-400' : 'bg-slate-200'
                                        }`}></div>
                                        <span className="text-[10px] font-bold uppercase text-slate-500">
                                            {(item as any).situacaoCumprimento || 'Pendente'}
                                        </span>
                                    </div>
                                ) : item.tipo_documento === 'Notificação' ? (
                                    <div className="flex items-center gap-2">
                                        {(item as any).situacao === 'Não cumprida no prazo' ? (
                                            <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#FF9800] shadow-sm">
                                                <div className="w-2.5 h-2.5 rounded-full bg-[#7B3FE4] flex items-center justify-center text-[7px] text-white font-black leading-none border border-white/20">!</div>
                                            </div>
                                        ) : (
                                            <div className={`w-3 h-3 rounded-full flex items-center justify-center ${
                                                (item as any).situacao === 'Em aberto' ? 'bg-[#7B3FE4]' :
                                                (item as any).situacao === 'Cumprida' ? 'bg-white border border-[#7B3FE4] text-[6px] text-[#7B3FE4] font-bold' :
                                                (item as any).situacao === 'Arquivada' ? 'bg-[#9C8ACF]' : 'bg-slate-200'
                                            }`}>
                                                {(item as any).situacao === 'Cumprida' && '✓'}
                                            </div>
                                        )}
                                        <span className="text-[10px] font-bold uppercase text-slate-500">
                                            {(item as any).situacao || 'Em aberto'}
                                        </span>
                                    </div>
                                ) : (
                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase ${item.status === 'Concluído' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        {item.status}
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => onViewParecer?.(item as any)} className="p-2 text-slate-400 hover:text-emerald-600" title="Visualizar"><Eye size={16} /></button>
                                    {canEdit && (
                                      <button onClick={() => handleEdit(item)} className="p-2 text-slate-400 hover:text-blue-600" title="Editar"><Edit size={16} /></button>
                                    )}
                                    <button onClick={() => handleExportPDF(item)} className="p-2 text-slate-400 hover:text-rose-600" title="Exportar PDF"><FileDown size={16} /></button>
                                    {canDelete && (
                                      <button onClick={() => item.id && handleDelete(item.id, item)} className="p-2 text-slate-400 hover:text-red-600" title="Excluir"><Trash2 size={16} /></button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
            <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row justify-between items-center gap-4 w-full">
                <div className="flex flex-col sm:flex-row items-center justify-between sm:justify-start gap-2.5 sm:gap-4 w-full lg:w-auto text-center sm:text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest shrink-0">
                      Exibir:
                    </span>
                    <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl border border-slate-200">
                      {[10, 20, 30, -1].map((val) => (
                        <button
                          key={val}
                          onClick={() => {
                            setItemsPerPage(val);
                            setCurrentPage(1);
                          }}
                          className={`min-w-[36px] sm:min-w-[42px] px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all touch-manipulation active:scale-95 ${
                            itemsPerPage === val 
                              ? 'bg-emerald-600 text-white shadow-sm' 
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                          }`}
                        >
                          {val === -1 ? 'Todos' : val}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500">
                    Mostrando {paginatedData.length} de {filteredData.length} registros (Pág. {currentPage} de {totalPages || 1})
                  </span>
                </div>

                <div className="flex items-center justify-center gap-1 sm:gap-2 w-full lg:w-auto overflow-x-auto py-1">
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                      disabled={currentPage === 1 || totalPages <= 1} 
                      className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-all flex items-center gap-1 text-xs font-bold shrink-0 touch-manipulation active:scale-95"
                      title="Página anterior"
                    >
                      <ChevronLeft size={16} />
                      <span className="hidden sm:inline">Anterior</span>
                    </button>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      {pageNumbers.map(pageNum => (
                        <button 
                          key={pageNum} 
                          onClick={() => setCurrentPage(pageNum)} 
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl font-bold text-xs sm:text-sm border transition-all touch-manipulation active:scale-95 ${
                            currentPage === pageNum 
                              ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          {pageNum}
                        </button>
                      ))}
                    </div>

                    <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                      disabled={currentPage === totalPages || totalPages <= 1} 
                      className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-all flex items-center gap-1 text-xs font-bold shrink-0 touch-manipulation active:scale-95"
                      title="Próxima página"
                    >
                      <span className="hidden sm:inline">Próxima</span>
                      <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default ParecerList;
