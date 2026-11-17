import React, { useState, useMemo, useRef, useEffect, useContext } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, Rectangle
} from 'recharts';
import { 
  FileText, Clock, AlertTriangle, Plus, Search, ChevronDown, ChevronUp, Check, X, Map as MapIcon,
  Eye, Edit, Trash2, Trophy, Database, Download, Loader2, ClipboardList, Info
} from 'lucide-react';
import { 
  OPS_MUNICIPIOS, OPS_ANALISTA, OPS_RESPONSAVEL_TECNICO, OPS_DPA1_VOLUME, MUNICIPALITY_COORDS
} from '../constants';
import { ParecerData, RiscoEnum, DanoEnum, OficioData, NotificacaoData } from '../types';
import { DataContext, AppDocument } from '../contexts/DataContext';
import { MultiSelect } from './dashboard/MultiSelect';
import { ProductivityTooltip } from './dashboard/ProductivityTooltip';
import { FilterSection } from './dashboard/FilterSection';
import { StatsCards } from './dashboard/StatsCards';
import { DocumentTypeChart } from './dashboard/DocumentTypeChart';
import { ProductivityCharts } from './dashboard/ProductivityCharts';
import { DocumentList } from './dashboard/DocumentList';
import { MTMap } from './dashboard/MTMap';

interface DashboardProps {
  onNewParecer: () => void;
  onNewOficio: () => void;
  onNewNotificacao: () => void;
  onEditParecer?: (parecer: ParecerData) => void;
  onViewParecer?: (parecer: ParecerData) => void;
  onEditOficio?: (oficio: OficioData) => void;
  onViewOficio?: (oficio: OficioData) => void;
  onEditNotificacao?: (notificacao: NotificacaoData) => void;
  onViewNotificacao?: (notificacao: NotificacaoData) => void;
}

const COLORS = {
  emerald: ['#34d399', '#10b981', '#059669', '#047857'],
  blue: ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'],
  amber: ['#fbbf24', '#f59e0b', '#d97706', '#b45309'],
  rose: ['#fb7185', '#f43f5e', '#e11d48', '#be123c'],
  gray: '#94a3b8'
};

const CHART_COLORS = [COLORS.emerald[1], COLORS.blue[1], COLORS.amber[1], COLORS.rose[1], '#8b5cf6', '#ec4899'];

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const Dashboard: React.FC<DashboardProps> = ({ 
  onNewParecer, 
  onNewOficio, 
  onNewNotificacao, 
  onEditParecer, 
  onViewParecer, 
  onEditOficio, 
  onViewOficio,
  onEditNotificacao,
  onViewNotificacao
}) => {
  const { pareceres, oficios, notificacoes, documents, loading, deleteParecer, deleteOficio, deleteNotificacao } = useContext(DataContext);
  
  const [filters, setFilters] = useState({
    municipios: [] as string[],
    dpa: [] as string[],
    cri: [] as string[],
    rt: [] as string[],
    analistas: [] as string[],
    status: [] as string[],
    tipoDocumento: [] as string[],
    datas: [] as string[],
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [selectedAnalyst, setSelectedAnalyst] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [optimizeMap, setOptimizeMap] = useState(false);

  const handleEdit = React.useCallback((item: AppDocument) => {
    if (item.tipo_documento?.startsWith('Parecer Técnico')) {
      const p = item as ParecerData;
      if (p.status === 'Concluído') {
        if (window.confirm('Este parecer já está concluído. Deseja realmente alterá-lo?')) {
          onEditParecer?.(p);
        }
      } else {
        onEditParecer?.(p);
      }
    } else if (item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral') {
      onEditOficio?.(item as OficioData);
    } else if (item.tipo_documento === 'Notificação') {
      const n = item as NotificacaoData;
      if (onEditNotificacao) {
        onEditNotificacao(n);
      } else {
        onViewNotificacao?.(n);
      }
    }
  }, [onEditParecer, onEditOficio, onEditNotificacao, onViewNotificacao]);

  const handleDelete = React.useCallback(async (id: string, item: AppDocument) => {
    const docName = item.tipo_documento?.startsWith('Parecer Técnico') ? 'parecer' : 
                    (item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral') ? 'ofício' : 'notificação';
    if (window.confirm(`Tem certeza que deseja excluir este ${docName}?`)) {
      const result = item.tipo_documento?.startsWith('Parecer Técnico') 
        ? await deleteParecer(id)
        : (item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral')
          ? await deleteOficio(id)
          : await deleteNotificacao(id);
      if (result.success) {
        alert(`${docName.charAt(0).toUpperCase() + docName.slice(1)} excluído com sucesso!`);
      } else {
        alert(`Erro ao excluir: ${result.message}`);
      }
    }
  }, [deleteParecer, deleteOficio, deleteNotificacao]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    documents.forEach(doc => {
      const date = doc.updated_at || doc.created_at || doc.data || (doc as any).dataParecer || (doc as any).dataEmissao || (doc as any).dataNotificacao;
      if (date) {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          const monthYear = `${MONTHS[d.getMonth()]}/${d.getFullYear()}`;
          months.add(monthYear);
        }
      }
    });
    return Array.from(months).sort((a, b) => {
      const [mA, yA] = a.split('/');
      const [mB, yB] = b.split('/');
      if (yA !== yB) return parseInt(yB) - parseInt(yA);
      return MONTHS.indexOf(mB) - MONTHS.indexOf(mA);
    });
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents.filter(item => {
      // Search filter
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const protocolo = String((item as any).processo || (item as any).protocolo || (item as any).numProcesso || '').toLowerCase();
        const empreendedor = String((item as any).identificacaoEmpreendedor || (item as any).razaoSocial || (item as any).interessado || (item as any).empreendedorNome || '').toLowerCase();
        const analista = String((item as any).analistas?.[0] || (item as any).analista || '').toLowerCase();
        const numNotificacao = String((item as any).notificacaoGerada || (item as any).numNotificacao || '').toLowerCase();
        const numOficio = String((item as any).oficioGerado || (item as any).numeroOficio || (item as any).oficioId || '').toLowerCase();
        const numParecer = String((item as any).numParecerTecnico || '').toLowerCase();
        const empreendimento = String((item as any).empreendimento || (item as any).nomeFantasia || '').toLowerCase();

        const matches = 
          protocolo.includes(lower) || 
          empreendedor.includes(lower) || 
          analista.includes(lower) ||
          numNotificacao.includes(lower) ||
          numOficio.includes(lower) ||
          numParecer.includes(lower) ||
          empreendimento.includes(lower);
        if (!matches) return false;
      }

      // Date filter
      if (filters.datas.length > 0) {
        const date = item.updated_at || item.created_at || item.data || (item as any).dataParecer || (item as any).dataEmissao || (item as any).dataNotificacao;
        if (date) {
          const d = new Date(date);
          const monthYear = `${MONTHS[d.getMonth()]}/${d.getFullYear()}`;
          if (!filters.datas.includes(monthYear)) return false;
        } else {
          return false;
        }
      }

      // Type specific filters
      if (item.tipo_documento?.startsWith('Parecer')) {
        const p = item as ParecerData;
        if (filters.municipios.length > 0 && !filters.municipios.includes(p.municipio)) return false;
        
        const dpaClass = (p as any).classificacao?.dpaClass || p.classificacaoDPA || '';
        const risco = (p as any).classificacao?.risco || p.classificacaoCRI || '';

        if (filters.dpa.length > 0 && !filters.dpa.includes(dpaClass)) return false;
        if (filters.cri.length > 0 && !filters.cri.includes(risco)) return false;
        
        if (filters.rt.length > 0) {
          const rt = p.responsavelTecnico || '';
          if (!filters.rt.includes(rt)) return false;
        }
      } else if (item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral') {
        const o = item as OficioData;
        if (filters.municipios.length > 0 && !filters.municipios.includes((o as any).municipio)) return false;
      } else if (item.tipo_documento === 'Notificação') {
        const n = item as NotificacaoData;
        if (filters.municipios.length > 0 && !filters.municipios.includes(n.municipioEmpreendimento)) return false;
      }

      const analista = (item as any).analistas?.[0] || (item as any).analista || '';
      if (filters.analistas.length > 0 && !filters.analistas.includes(analista)) return false;
      
      const currentStatus = item.status || (item as any).situacaoCumprimento || (item as any).situacao || '';
      if (filters.status.length > 0 && !filters.status.includes(currentStatus)) return false;
      
      if (filters.tipoDocumento.length > 0 && !filters.tipoDocumento.includes(item.tipo_documento)) return false;

      return true;
    });
  }, [documents, filters, searchTerm]);

  const filteredPareceres = useMemo(() => {
    return filteredDocuments.filter(d => d.tipo_documento?.startsWith('Parecer')) as ParecerData[];
  }, [filteredDocuments]);

  const filteredOficios = useMemo(() => {
    return filteredDocuments.filter(d => d.tipo_documento === 'Ofício de Pendências' || d.tipo_documento === '1° Oficio de Pendencias' || d.tipo_documento === '2° Oficio de Pendencias' || d.tipo_documento === 'Oficio Geral') as OficioData[];
  }, [filteredDocuments]);

  const filteredNotificacoes = useMemo(() => {
    return filteredDocuments.filter(d => d.tipo_documento === 'Notificação') as NotificacaoData[];
  }, [filteredDocuments]);

  const stats = useMemo(() => {
    const oficios = filteredDocuments.filter(d => d.tipo_documento === 'Ofício de Pendências' || d.tipo_documento === '1° Oficio de Pendencias' || d.tipo_documento === '2° Oficio de Pendencias' || d.tipo_documento === 'Oficio Geral');
    const notificacoesList = filteredDocuments.filter(d => d.tipo_documento === 'Notificação');
    
    return { 
      totalPareceres: filteredPareceres.length, 
      pareceresConcluidos: filteredPareceres.filter(i => i.status === 'Concluído').length, 
      pareceresRascunhos: filteredPareceres.filter(i => i.status === 'Rascunho').length,
      
      totalOficios: oficios.length,
      oficiosPendentes: oficios.filter(i => (i as any).situacaoCumprimento === 'Pendente' || (i as any).situacaoCumprimento === 'Pendente / Em aberto').length,
      oficiosExpirados: oficios.filter(i => (i as any).situacaoCumprimento === 'Não cumprido no prazo').length,
      oficiosCumpridos: oficios.filter(i => (i as any).situacaoCumprimento === 'Cumprido').length,
      oficiosArquivados: oficios.filter(i => (i as any).situacaoCumprimento === 'Arquivado').length,

      totalNotificacoes: notificacoesList.length,
      notificacoesEmAberto: notificacoesList.filter(i => (i as any).situacao === 'Em aberto' || i.status === 'Rascunho').length,
      notificacoesCumpridas: notificacoesList.filter(i => (i as any).situacao === 'Cumprida' || i.status === 'Concluído').length,
      notificacoesAtrasadas: notificacoesList.filter(i => (i as any).situacao === 'Não cumprida no prazo').length,
      notificacoesArquivadas: notificacoesList.filter(i => (i as any).situacao === 'Arquivada').length,
      notificacoesRascunhos: notificacoesList.filter(i => i.status === 'Rascunho').length,
      notificacoesConcluidas: notificacoesList.filter(i => i.status === 'Concluído').length
    };
  }, [filteredPareceres, filteredDocuments]);

  const charts = useMemo(() => {
    const classMap: Record<string, number> = {};
    filteredPareceres.forEach(i => {
      let label = "Não Enquadrada";
      const resumo = i.classificacaoBarragem || (i as any).classificacao?.resumo || "";
      if (resumo.includes("CLASSE A")) label = "Classe A (CRI Alta)";
      else if (resumo.includes("CLASSE B")) label = "Classe B (CRI Média)";
      else if (resumo.includes("CLASSE C")) label = "Classe C (CRI Baixa)";
      classMap[label] = (classMap[label] || 0) + 1;
    });
    const classificationData = Object.keys(classMap).map(k => ({ name: k, value: classMap[k] }));

    const dpaData = [
      { name: 'Baixo', value: filteredPareceres.filter(i => ((i as any).classificacao?.dpaClass || '') === DanoEnum.BAIXO).length },
      { name: 'Médio', value: filteredPareceres.filter(i => ((i as any).classificacao?.dpaClass || '') === DanoEnum.MEDIO).length },
      { name: 'Alto', value: filteredPareceres.filter(i => ((i as any).classificacao?.dpaClass || '') === DanoEnum.ALTO).length },
    ].filter(d => d.value > 0);

    const criData = [
      { name: 'Baixa', value: filteredPareceres.filter(i => ((i as any).classificacao?.risco || '') === RiscoEnum.BAIXO).length },
      { name: 'Média', value: filteredPareceres.filter(i => ((i as any).classificacao?.risco || '') === RiscoEnum.MEDIO).length },
      { name: 'Alta', value: filteredPareceres.filter(i => ((i as any).classificacao?.risco || '') === RiscoEnum.ALTO).length },
    ].filter(d => d.value > 0);

    const cityMap: Record<string, number> = {};
    filteredPareceres.forEach(i => {
      if (i.municipio) cityMap[i.municipio] = (cityMap[i.municipio] || 0) + 1;
    });
    const cityData = Object.keys(cityMap).map(k => ({ name: k, value: cityMap[k] })).sort((a, b) => b.value - a.value);

    const analystMap: Record<string, { 
      total: number; 
      parecerRascunho: number; 
      parecerConcluido: number; 
      oficioPendente: number; 
      oficioExpirado: number; 
      oficioCumprido: number; 
      oficioArquivado: number;
    }> = {};
    filteredDocuments.forEach(i => {
      const analista = (i as any).analistas?.[0] || (i as any).analista || 'Não Identificado';
      if (!analystMap[analista]) {
        analystMap[analista] = { 
          total: 0, 
          parecerRascunho: 0, 
          parecerConcluido: 0, 
          oficioPendente: 0, 
          oficioExpirado: 0, 
          oficioCumprido: 0, 
          oficioArquivado: 0 
        };
      }
      analystMap[analista].total += 1;
      if (i.tipo_documento?.startsWith('Parecer')) {
        if (i.status === 'Concluído') analystMap[analista].parecerConcluido += 1;
        else analystMap[analista].parecerRascunho += 1;
      } else {
        const situacao = (i as any).situacaoCumprimento;
        if (situacao === 'Cumprido') analystMap[analista].oficioCumprido += 1;
        else if (situacao === 'Não cumprido no prazo') analystMap[analista].oficioExpirado += 1;
        else if (situacao === 'Arquivado') analystMap[analista].oficioArquivado += 1;
        else analystMap[analista].oficioPendente += 1;
      }
    });
    const analystData = Object.keys(analystMap).map(k => ({ 
      name: k.split(' ')[0], 
      full: k, 
      value: analystMap[k].total, 
      parecerRascunho: analystMap[k].parecerRascunho,
      parecerConcluido: analystMap[k].parecerConcluido,
      oficioPendente: analystMap[k].oficioPendente,
      oficioExpirado: analystMap[k].oficioExpirado,
      oficioCumprido: analystMap[k].oficioCumprido,
      oficioArquivado: analystMap[k].oficioArquivado
    })).sort((a, b) => b.value - a.value);

    const monthlyMap: Record<string, { 
      total: number; 
      parecerRascunho: number; 
      parecerConcluido: number; 
      oficioPendente: number; 
      oficioExpirado: number; 
      oficioCumprido: number; 
      oficioArquivado: number;
      notificacaoRascunho: number;
      notificacaoConcluida: number;
    }> = {};
    MONTHS.forEach(m => {
      monthlyMap[m] = { 
        total: 0, 
        parecerRascunho: 0, 
        parecerConcluido: 0, 
        oficioPendente: 0, 
        oficioExpirado: 0, 
        oficioCumprido: 0, 
        oficioArquivado: 0,
        notificacaoRascunho: 0,
        notificacaoConcluida: 0
      };
    });
    const productivitySource = selectedAnalyst ? filteredDocuments.filter(i => ((i as any).analistas?.[0] || (i as any).analista) === selectedAnalyst) : filteredDocuments;
    productivitySource.forEach(i => {
      const dateStr = i.tipo_documento?.startsWith('Parecer') ? ((i as ParecerData).dataParecer || (i as ParecerData).data || i.created_at) : 
                     i.tipo_documento?.includes('Of') ? (i as OficioData).dataEmissao : 
                     (i as any).dataNotificacao || i.created_at;
      const date = new Date(dateStr || 0);
      if (!isNaN(date.getTime())) {
        const monthName = MONTHS[date.getMonth()];
        if (monthlyMap[monthName]) {
          monthlyMap[monthName].total += 1;
          if (i.tipo_documento?.startsWith('Parecer')) {
            if (i.status === 'Concluído') monthlyMap[monthName].parecerConcluido += 1;
            else monthlyMap[monthName].parecerRascunho += 1;
          } else if (i.tipo_documento === 'Ofício de Pendências' || i.tipo_documento === '1° Oficio de Pendencias' || i.tipo_documento === '2° Oficio de Pendencias' || i.tipo_documento === 'Oficio Geral') {
            const situacao = (i as any).situacaoCumprimento;
            if (situacao === 'Cumprido') monthlyMap[monthName].oficioCumprido += 1;
            else if (situacao === 'Não cumprido no prazo') monthlyMap[monthName].oficioExpirado += 1;
            else if (situacao === 'Arquivado') monthlyMap[monthName].oficioArquivado += 1;
            else monthlyMap[monthName].oficioPendente += 1;
          } else if (i.tipo_documento === 'Notificação') {
            if (i.status === 'Concluído') monthlyMap[monthName].notificacaoConcluida += 1;
            else monthlyMap[monthName].notificacaoRascunho += 1;
          }
        }
      }
    });
    const sectorProductivityData = MONTHS.map(m => ({ 
      month: m, 
      value: monthlyMap[m].total, 
      parecerRascunho: monthlyMap[m].parecerRascunho,
      parecerConcluido: monthlyMap[m].parecerConcluido,
      oficioPendente: monthlyMap[m].oficioPendente,
      oficioExpirado: monthlyMap[m].oficioExpirado,
      oficioCumprido: monthlyMap[m].oficioCumprido,
      oficioArquivado: monthlyMap[m].oficioArquivado,
      notificacaoRascunho: monthlyMap[m].notificacaoRascunho,
      notificacaoConcluida: monthlyMap[m].notificacaoConcluida
    }));

    const docTypeData = [
      { name: 'Parecer Técnico', value: filteredDocuments.filter(d => d.tipo_documento?.startsWith('Parecer')).length, color: '#0000CD' },
      { name: 'Ofício de Pendências', value: filteredDocuments.filter(d => d.tipo_documento === 'Ofício de Pendências' || d.tipo_documento === '1° Oficio de Pendencias' || d.tipo_documento === '2° Oficio de Pendencias' || d.tipo_documento === 'Oficio Geral').length, color: '#10b981' },
      { name: 'Notificação', value: filteredDocuments.filter(d => d.tipo_documento === 'Notificação').length, color: '#7B3FE4' },
    ].filter(d => d.value > 0);

    return { classificationData, dpaData, criData, cityData, analystData, sectorProductivityData, docTypeData };
  }, [filteredDocuments, filteredPareceres, selectedAnalyst]);

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="p-3 sm:p-6 md:p-10 space-y-6 sm:space-y-8 max-w-[1600px] mx-auto w-full animate-fade-in">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 sm:gap-6 border-b border-slate-200 pb-6 sm:pb-8">
        <div className="space-y-2 w-full lg:w-auto">
          <p className="text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] animate-in fade-in slide-in-from-left-4 duration-700">
            Olá! {getGreeting()}
          </p>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 hover:scale-105 transition-transform">
              <img 
                src="https://lh3.googleusercontent.com/d/11OtFjZyub-hYsCvNr8N88CHVtcGM1QKU" 
                alt="Logo Notifica CSB" 
                className="w-9 h-9 sm:w-11 sm:h-11 object-contain" 
                referrerPolicy="no-referrer" 
              />
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tighter">
              <span className="text-emerald-600">Notifica</span> CSB
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-slate-500 font-medium text-sm md:text-base">Painel de monitoramento e gestão de segurança de barragens.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto">
          <div className="relative flex-1 min-w-[200px] lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" placeholder="Filtrar por protocolo, interessado, nº notificação, nº ofício..." 
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              className={`flex-1 sm:flex-none px-4 py-3 rounded-xl shadow-sm transition-all font-bold flex items-center justify-center gap-2 border text-xs ${
                showFilters ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-500'
              }`}
            >
              <Database size={18} /> Filtros {filters.municipios.length + filters.dpa.length + filters.cri.length + filters.rt.length + filters.analistas.length + filters.status.length + filters.tipoDocumento.length + filters.datas.length > 0 && `(${filters.municipios.length + filters.dpa.length + filters.cri.length + filters.rt.length + filters.analistas.length + filters.status.length + filters.tipoDocumento.length + filters.datas.length})`}
            </button>
            <button onClick={onNewParecer} className="flex-1 sm:flex-none bg-slate-900 hover:bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg transition-all font-bold flex items-center justify-center gap-2 text-xs">
              <Plus size={18} /> Parecer
            </button>
            <button onClick={onNewOficio} className="flex-1 sm:flex-none bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 px-4 py-3 rounded-xl shadow-sm transition-all font-bold flex items-center justify-center gap-2 text-xs">
              <FileText size={18} /> Ofício
            </button>
            <button onClick={onNewNotificacao} className="flex-1 sm:flex-none bg-white border border-slate-200 hover:border-amber-500 text-slate-700 px-4 py-3 rounded-xl shadow-sm transition-all font-bold flex items-center justify-center gap-2 text-xs">
              <Plus size={18} className="text-amber-500" /> Notificação
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <FilterSection 
          filters={filters} 
          setFilters={setFilters} 
          availableMonths={availableMonths} 
        />
      )}

      <StatsCards stats={stats} />

      <div className="space-y-6 md:space-y-8">
        <div className="bg-white p-4 md:p-8 rounded-2xl shadow-md border border-slate-200 h-[400px] sm:h-[500px] md:h-[600px] lg:h-[700px] flex flex-col relative overflow-hidden">
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <input 
              type="checkbox" 
              id="optimizeMap" 
              checked={optimizeMap} 
              onChange={(e) => setOptimizeMap(e.target.checked)}
              className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="optimizeMap" className="text-[10px] font-bold text-slate-600 uppercase tracking-wider cursor-pointer select-none">
              Desativar para otimizar o sistema
            </label>
          </div>

          {optimizeMap ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <MapIcon className="w-12 h-12 text-slate-200 mx-auto" />
                <p className="text-slate-400 font-medium italic">Mapa desativado para otimização</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 w-full h-full">
              <MTMap 
                pareceres={filteredPareceres} 
                oficios={filteredOficios} 
                notificacoes={filteredNotificacoes} 
                hoveredCity={hoveredCity} 
                setHoveredCity={setHoveredCity}
              />
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <DocumentTypeChart 
            data={charts.docTypeData} 
            totalDocuments={filteredDocuments.length} 
          />
          <div className="lg:col-span-2">
            {/* Espaço reservado ou pode ser usado para outros widgets futuramente */}
          </div>
        </div>
      </div>

      <ProductivityCharts 
        sectorProductivityData={charts.sectorProductivityData}
        analystData={charts.analystData}
        allDocuments={documents}
        availableMonths={availableMonths}
        selectedAnalyst={selectedAnalyst}
        setSelectedAnalyst={setSelectedAnalyst}
      />

      <DocumentList 
        documents={filteredDocuments}
        handleEdit={handleEdit}
        handleDelete={handleDelete}
      />
    </div>
  );
};

export default Dashboard;
