import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import { 
  Search, 
  X, 
  FileText, 
  FileWarning, 
  Bell, 
  Eye, 
  Edit3, 
  CornerDownLeft, 
  Clock, 
  MapPin, 
  Building2, 
  Hash, 
  ExternalLink,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { DataContext, AppDocument } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { ParecerData, OficioData, NotificacaoData } from '../types';

interface GlobalSearchBarProps {
  onSelectDocument: (doc: AppDocument, viewOnly?: boolean) => void;
  onNavigateView?: (view: any) => void;
}

interface SearchItem {
  id: string;
  category: 'parecer' | 'oficio' | 'notificacao';
  tipo: string;
  numeroIdentificador: string;
  processo: string;
  interessado: string;
  empreendimento: string;
  municipio: string;
  cpfCnpj: string;
  status: string;
  data: string;
  analista: string;
  rawDoc: AppDocument;
}

// Normalize text for diacritic/case insensitive matching
const normalizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({ 
  onSelectDocument,
  onNavigateView 
}) => {
  const { pareceres, oficios, notificacoes } = useContext(DataContext);
  const { canEdit } = useAuth();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'todos' | 'parecer' | 'oficio' | 'notificacao'>('todos');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global hotkey: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format date helper
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Convert raw items into standardized searchable records
  const searchIndex: SearchItem[] = useMemo(() => {
    const list: SearchItem[] = [];

    // 1. Pareceres
    pareceres.forEach((p) => {
      const numParecer = p.numParecerTecnico || (p as any).numParecer || 'S/N';
      list.push({
        id: `parecer-${p.id || numParecer}`,
        category: 'parecer',
        tipo: p.tipo_documento || 'Parecer Técnico',
        numeroIdentificador: `Parecer nº ${numParecer}`,
        processo: p.processo || '',
        interessado: p.identificacaoEmpreendedor || (p as any).interessado || '',
        empreendimento: p.nomeBarragem || p.localizacaoEmpreendimento || '',
        municipio: p.municipio || '',
        cpfCnpj: p.cpfCnpj || '',
        status: p.status || 'Rascunho',
        data: formatDate(p.dataParecer || p.data || p.created_at),
        analista: Array.isArray(p.analistas) ? p.analistas.join(', ') : '',
        rawDoc: { ...p, tipo_documento: (p.tipo_documento || 'Parecer Técnico') as any }
      });
    });

    // 2. Ofícios
    oficios.forEach((o) => {
      const numOficio = (o as any).numeroOficio || o.protocolo || (o as any).oficioNumero || 'S/N';
      list.push({
        id: `oficio-${o.id || numOficio}`,
        category: 'oficio',
        tipo: o.tipo_documento || 'Ofício de Pendências',
        numeroIdentificador: `Ofício nº ${numOficio}`,
        processo: o.protocolo || (o as any).numeroProcesso || '',
        interessado: o.interessado || '',
        empreendimento: o.empreendimento || '',
        municipio: o.cidadeUf || (o as any).municipio || '',
        cpfCnpj: (o as any).cpfCnpj || '',
        status: o.situacaoCumprimento || o.status || 'Pendente / Em aberto',
        data: formatDate(o.dataEmissao || o.created_at),
        analista: Array.isArray(o.analistas) ? o.analistas.join(', ') : '',
        rawDoc: { ...o, tipo_documento: (o.tipo_documento || 'Ofício de Pendências') as any }
      });
    });

    // 3. Notificações
    notificacoes.forEach((n) => {
      const numNotif = n.notificacaoGerada || (n as any).numNotificacao || (n as any).numeroNotificacao || 'S/N';
      const oficioVinculado = n.oficioGerado ? ` (Ofício: ${n.oficioGerado})` : '';
      list.push({
        id: `notificacao-${n.id || numNotif}`,
        category: 'notificacao',
        tipo: 'Notificação',
        numeroIdentificador: `Notificação nº ${numNotif}${oficioVinculado}`,
        processo: n.numProcesso || (n as any).processo || '',
        interessado: n.empreendedorNome || (n as any).empreendedor || '',
        empreendimento: n.nomeFantasia || n.enderecoEmpreendimento || '',
        municipio: n.municipioEmpreendimento || (n as any).municipio || '',
        cpfCnpj: n.documentoIdentificacao || (n as any).cpfCnpj || '',
        status: n.situacao || n.status || 'Em aberto',
        data: formatDate(n.dataNotificacao || n.created_at),
        analista: Array.isArray(n.analistas) ? n.analistas.join(', ') : '',
        rawDoc: { ...n, tipo_documento: 'Notificação' as const }
      });
    });

    return list;
  }, [pareceres, oficios, notificacoes]);

  // Filter based on search query and category tab
  const filteredResults = useMemo(() => {
    const rawQ = query.trim();
    const cleanQ = normalizeText(rawQ);

    let base = searchIndex;
    if (activeTab !== 'todos') {
      base = base.filter((item) => item.category === activeTab);
    }

    if (!cleanQ) {
      // If no query, show top 8 most recent
      return base.slice(0, 8);
    }

    // Split query by spaces to support multi-keyword matching (e.g. "12/2024 cuiaba")
    const terms = cleanQ.split(/\s+/).filter(Boolean);

    return base.filter((item) => {
      const searchableStr = normalizeText(
        `${item.numeroIdentificador} ${item.processo} ${item.interessado} ${item.empreendimento} ${item.municipio} ${item.cpfCnpj} ${item.tipo} ${item.status} ${item.analista} ${item.data}`
      );

      return terms.every((term) => searchableStr.includes(term));
    }).slice(0, 30);
  }, [searchIndex, query, activeTab]);

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResults]);

  // Handle arrow navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredResults.length - 1 ? prev + 1 : prev));
      scrollToSelected(selectedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      scrollToSelected(selectedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelect(filteredResults[selectedIndex], !canEdit);
      }
    }
  };

  const scrollToSelected = (index: number) => {
    if (!listRef.current) return;
    const elements = listRef.current.querySelectorAll('.search-result-row');
    if (elements[index]) {
      (elements[index] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  };

  const handleSelect = (item: SearchItem, viewOnly: boolean = false) => {
    onSelectDocument(item.rawDoc, viewOnly || !canEdit);
    setIsOpen(false);
  };

  // Helper highlight function
  const renderHighlighted = (text: string) => {
    if (!query.trim()) return text;
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return text;

    const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) => 
          terms.some(t => normalizeText(t) === normalizeText(part)) ? (
            <mark key={i} className="bg-amber-200 text-slate-900 font-extrabold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Counts for tabs
  const counts = useMemo(() => {
    const rawQ = query.trim();
    const cleanQ = normalizeText(rawQ);

    let base = searchIndex;
    if (cleanQ) {
      const terms = cleanQ.split(/\s+/).filter(Boolean);
      base = base.filter((item) => {
        const searchableStr = normalizeText(
          `${item.numeroIdentificador} ${item.processo} ${item.interessado} ${item.empreendimento} ${item.municipio} ${item.cpfCnpj} ${item.tipo} ${item.status} ${item.analista} ${item.data}`
        );
        return terms.every((term) => searchableStr.includes(term));
      });
    }

    return {
      todos: base.length,
      parecer: base.filter((i) => i.category === 'parecer').length,
      oficio: base.filter((i) => i.category === 'oficio').length,
      notificacao: base.filter((i) => i.category === 'notificacao').length
    };
  }, [searchIndex, query]);

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      {/* Search Input Box */}
      <div 
        className={`
          relative flex items-center w-full bg-slate-50/90 hover:bg-white focus-within:bg-white
          border rounded-2xl transition-all duration-200 shadow-xs
          ${isOpen 
            ? 'border-emerald-500 ring-4 ring-emerald-500/10 shadow-md bg-white' 
            : 'border-slate-200/90 hover:border-slate-300'
          }
        `}
      >
        <div className="pl-3.5 pr-2 flex items-center pointer-events-none text-slate-400">
          <Search size={18} className="text-emerald-600 transition-colors" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar por documentos, notificações, nº de ofício, processo, interessado..."
          className="w-full py-2.5 pr-20 text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 bg-transparent outline-none border-none focus:ring-0"
        />

        {/* Clear and Hotkey Badge */}
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {query ? (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Limpar busca"
            >
              <X size={15} />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-md shadow-2xs pointer-events-none uppercase tracking-wider">
              <span>Ctrl</span>
              <span>K</span>
            </kbd>
          )}
        </div>
      </div>

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-[100] animate-in fade-in-0 zoom-in-95 duration-150">
          
          {/* Header with filter tabs */}
          <div className="p-2 sm:p-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('todos')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'todos'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <span>Todos</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'todos' ? 'bg-emerald-700/60 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {counts.todos}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('parecer')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'parecer'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <FileText size={13} />
                <span>Pareceres</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'parecer' ? 'bg-blue-700/60 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {counts.parecer}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('oficio')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'oficio'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <FileWarning size={13} />
                <span>Ofícios</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'oficio' ? 'bg-amber-700/60 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {counts.oficio}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('notificacao')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'notificacao'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <Bell size={13} />
                <span>Notificações</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'notificacao' ? 'bg-violet-700/60 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {counts.notificacao}
                </span>
              </button>
            </div>

            <span className="hidden sm:inline-block text-[10px] text-slate-400 font-bold uppercase tracking-wider pr-1">
              ESC para fechar
            </span>
          </div>

          {/* Results list */}
          <div ref={listRef} className="max-h-[380px] sm:max-h-[460px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
            {filteredResults.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Search size={22} />
                </div>
                <p className="text-sm font-bold text-slate-700">
                  Nenhum registro encontrado para "{query}"
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Tente buscar pelo número exato do ofício (ex: <span className="font-semibold text-slate-700">12/2024</span>), parecer, notificação, número de processo ou nome do empreendedor.
                </p>
              </div>
            ) : (
              <div>
                {!query.trim() && (
                  <div className="px-4 py-2 bg-slate-50/50 text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Clock size={12} />
                    <span>Registros Recentes no Banco de Dados:</span>
                  </div>
                )}

                {filteredResults.map((item, idx) => {
                  const isSelected = idx === selectedIndex;

                  // Category styling
                  const categoryMeta = {
                    parecer: {
                      icon: <FileText size={16} className="text-blue-600" />,
                      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
                      tagLabel: 'Parecer Técnico'
                    },
                    oficio: {
                      icon: <FileWarning size={16} className="text-amber-600" />,
                      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
                      tagLabel: 'Ofício de Pendências'
                    },
                    notificacao: {
                      icon: <Bell size={16} className="text-violet-600" />,
                      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
                      tagLabel: 'Notificação'
                    }
                  }[item.category];

                  // Status styling
                  const isConcluido = item.status === 'Concluído' || item.status === 'Cumprida' || item.status === 'SIM';
                  const isPendente = item.status?.includes('Pendente') || item.status === 'Em aberto' || item.status === 'Rascunho';

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item, !canEdit)}
                      className={`
                        search-result-row px-4 py-3 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group
                        ${isSelected ? 'bg-emerald-50/70 border-l-4 border-emerald-500 pl-3' : 'hover:bg-slate-50/80'}
                      `}
                    >
                      {/* Left: Document info */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="mt-0.5 p-2 rounded-xl bg-white border border-slate-200 shadow-2xs shrink-0 group-hover:scale-105 transition-transform">
                          {categoryMeta.icon}
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          {/* Tags row */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border tracking-wider ${categoryMeta.badgeClass}`}>
                              {item.tipo || categoryMeta.tagLabel}
                            </span>

                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              isConcluido
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isPendente
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {item.status}
                            </span>

                            {item.data && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                • {item.data}
                              </span>
                            )}
                          </div>

                          {/* Identifier & Process */}
                          <div className="flex flex-wrap items-baseline gap-2">
                            <h4 className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                              {renderHighlighted(item.numeroIdentificador)}
                            </h4>
                            {item.processo && (
                              <span className="text-xs font-bold text-slate-500 font-mono">
                                Proc: {renderHighlighted(item.processo)}
                              </span>
                            )}
                          </div>

                          {/* Details line */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            {item.interessado && (
                              <div className="flex items-center gap-1 truncate max-w-xs" title={item.interessado}>
                                <Building2 size={12} className="text-slate-400 shrink-0" />
                                <span className="font-semibold truncate">{renderHighlighted(item.interessado)}</span>
                              </div>
                            )}

                            {item.municipio && (
                              <div className="flex items-center gap-1 text-slate-500">
                                <MapPin size={12} className="text-slate-400 shrink-0" />
                                <span>{renderHighlighted(item.municipio)}</span>
                              </div>
                            )}

                            {item.empreendimento && (
                              <div className="text-[11px] text-slate-400 truncate max-w-xs italic hidden md:block">
                                {renderHighlighted(item.empreendimento)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Action buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 pt-1 sm:pt-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(item, true);
                          }}
                          className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-emerald-700 hover:bg-emerald-100/50 rounded-lg border border-slate-200 hover:border-emerald-300 transition-colors flex items-center gap-1 shadow-2xs"
                          title="Visualizar documento"
                        >
                          <Eye size={13} />
                          <span className="hidden sm:inline">Visualizar</span>
                        </button>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelect(item, false);
                            }}
                            className="px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                            title="Editar / Abrir documento"
                          >
                            <Edit3 size={13} />
                            <span>Abrir</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with keyboard hints */}
          <div className="p-2 sm:px-4 sm:py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-bold text-[10px]">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-bold text-[10px]">↓</kbd>
                <span className="text-slate-400">navegar</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-bold text-[10px]">Enter</kbd>
                <span className="text-slate-400">abrir</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-bold text-[10px]">Esc</kbd>
                <span className="text-slate-400">fechar</span>
              </span>
            </div>

            <div className="text-[10px] text-slate-400 font-medium">
              Total no banco: <span className="font-bold text-slate-600">{searchIndex.length}</span> documentos
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default GlobalSearchBar;
