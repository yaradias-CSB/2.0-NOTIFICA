import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { 
  Search, Map as MapIcon, Bell, Database, Filter, ChevronLeft, ChevronRight, 
  ArrowUpDown, Download, Loader2, Info, MapPin, Globe, List, ChevronDown,
  Eye, Edit, Trash2, X, AlertTriangle, FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { DataContext } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import ConfirmModal from '../components/ui/ConfirmModal';
import { NotificacaoData, NotificacaoAntigaData, BarragemSNISB } from '../types';
import { MTMap } from '../components/dashboard/MTMap';
import { OPS_MUNICIPIOS } from '../constants';
import { parseGMS, parseCoordinate } from '../lib/coordinates';
import {
  canUserDeleteDraft,
  canUserEditDraft,
  isConcludedStatus,
} from '../lib/documentPermissions';

const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsNA_kn1hwAKLrBlErzLUV8yod3P_nRqHlzLHr6cWStOw8sEuodQTQLMycPfOQmA/pub?output=xlsx';
const SNISB_CSV_URL = 'https://docs.google.com/spreadsheets/d/18VwJZSAAsKU_qoJzAtxK3OxsyPNvkUD_rpZaZ1bdMnA/export?format=csv&gid=0';
const ANEEL_CSV_URL = 'https://docs.google.com/spreadsheets/d/1v0aoi5XIGqwlI7pyhev5bWEoiNW98ToNQbXtXaYCdwc/export?format=csv&gid=0';

const fixEncoding = (str: string): string => {
  if (!str) return '';
  let fixed = str
    .replace(/Ã¡/g, 'á')
    .replace(/Ã /g, 'à')
    .replace(/Ã¢/g, 'â')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã©/g, 'é')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã´/g, 'ô')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã€/g, 'À')
    .replace(/Ã /g, 'Á')
    .replace(/Ã‚/g, 'Â')
    .replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‰/g, 'É')
    .replace(/ÃŠ/g, 'Ê')
    .replace(/Ã /g, 'Í')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ã”/g, 'Ô')
    .replace(/Ã•/g, 'Õ')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‡/g, 'Ç');

  fixed = fixed.replace(/NÃVIO/g, 'NÉVIO');
  fixed = fixed.replace(/AUTUAÃÃO/g, 'AUTUAÇÃO');
  fixed = fixed.replace(/AUTUAÃ‡ÃƒO/g, 'AUTUAÇÃO');
  fixed = fixed.replace(/Ã‡ÃƒO/g, 'ÇÃO');
  fixed = fixed.replace(/Ã‡/g, 'Ç');
  fixed = fixed.replace(/Ãƒ/g, 'Ã');
  fixed = fixed.replace(/Ã‰/g, 'É');
  fixed = fixed.replace(/Ã /g, 'Á');
  
  return fixed;
};

const matchMunicipio = (muni1: string, muni2: string): boolean => {
  if (!muni1 || !muni2) return false;
  const clean = (s: string) => s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'’]/g, "'")
    .replace(/\s+/g, '')
    .trim();
  return clean(muni1) === clean(muni2);
};

const normalizeDate = (dateVal: any): string => {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    return `${String(dateVal.getDate()).padStart(2, '0')}/${String(dateVal.getMonth() + 1).padStart(2, '0')}/${dateVal.getFullYear()}`;
  }
  let str = String(dateVal).trim();
  if (!str) return '';
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [y, m, d] = str.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  }
  const parts = str.split(/[/-]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0]);
    let p2 = parseInt(parts[1]);
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    if (p2 > 12) return `${String(p2).padStart(2, '0')}/${String(p1).padStart(2, '0')}/${year}`;
    return `${String(p1).padStart(2, '0')}/${String(p2).padStart(2, '0')}/${year}`;
  }
  return str;
};

const getAnalistaName = (item: any): string => {
  if (!item) return '';
  const rawList = Array.isArray(item.analistas) && item.analistas.length > 0 
    ? item.analistas 
    : (Array.isArray(item.raw?.analistas) && item.raw.analistas.length > 0 ? item.raw.analistas : []);

  if (rawList.length > 0) {
    const names = rawList.map((a: string) => {
      let cleaned = String(a || '').split('/')[0].trim();
      if (cleaned.includes('–')) cleaned = cleaned.split('–')[0].trim();
      if (cleaned.includes('-')) cleaned = cleaned.split('-')[0].trim();
      return cleaned;
    }).filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }

  const single = item.analista || item.raw?.analista || item.raw?.analistasOutros?.[0] || '';
  if (!single || typeof single !== 'string') return '';
  let cleaned = single.split('/')[0].trim();
  if (cleaned.includes('–')) cleaned = cleaned.split('–')[0].trim();
  if (cleaned.includes('-')) cleaned = cleaned.split('-')[0].trim();
  return cleaned || single;
};

const formatCoordGMS = (input: any): string => {
  if (!input) return '';
  const str = String(input).trim();
  if (!str) return '';
  if (/^\d{2}°\d{2}'\d{2},\d{2}"$/.test(str)) {
    return str;
  }
  const decimal = typeof input === 'number' ? input : parseGMS(input);
  if (isNaN(decimal)) return '';
  const abs = Math.abs(decimal);
  let deg = Math.floor(abs);
  let minDec = (abs - deg) * 60;
  let min = Math.floor(minDec);
  let sec = (minDec - min) * 60;
  if (sec >= 59.995) {
    sec = 0;
    min += 1;
    if (min >= 60) {
      min = 0;
      deg += 1;
    }
  }
  const gg = String(deg).padStart(2, '0');
  const mm = String(min).padStart(2, '0');
  const secStr = sec.toFixed(2).padStart(5, '0').replace('.', ',');
  return `${gg}°${mm}'${secStr}"`;
};

interface ControleNotificacoesProps {
  onEditNotificacao?: (notificacao: NotificacaoData) => void;
  onViewNotificacao?: (notificacao: NotificacaoData) => void;
}

const ControleNotificacoes: React.FC<ControleNotificacoesProps> = ({
  onEditNotificacao,
  onViewNotificacao
}) => {
  const { 
    notificacoes: novasNotificacoes, 
    loading: loadingNovas,
    deleteNotificacao,
    refreshData
  } = useContext(DataContext);
  const { user, profile, canEdit, canDelete } = useAuth();
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
  const [antigasNotificacoes, setAntigasNotificacoes] = useState<NotificacaoAntigaData[]>([]);
  const [snisbData, setSnisbData] = useState<BarragemSNISB[]>([]);
  const [aneelData, setAneelData] = useState<BarragemSNISB[]>([]);
  const [loadingAntigas, setLoadingAntigas] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNovas, setShowNovas] = useState(true);
  const [showAntigas, setShowAntigas] = useState(true);
  const [showSnisb, setShowSnisb] = useState(false);
  const [showAneel, setShowAneel] = useState(false);
  const [filters, setFilters] = useState({
    municipios: [] as string[],
    mesAno: '',
    dpa: [] as string[]
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [searchMarker, setSearchMarker] = useState<[number, number] | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [selectedViewNotificacao, setSelectedViewNotificacao] = useState<any | null>(null);
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canUserEdit = (item: any): boolean => {
    return item.origem === 'Nova' && canUserEditDraft(item.raw, currentActor);
  };

  const canUserDelete = (item: any): boolean => {
    return item.origem === 'Nova' && canUserDeleteDraft(item.raw, currentActor);
  };

  const handleView = (item: any) => {
    if (item.origem === 'Nova' && item.raw && onViewNotificacao) {
      onViewNotificacao(item.raw);
    } else {
      setSelectedViewNotificacao(item);
    }
  };

  const handleEdit = (item: any) => {
    if (!canUserEdit(item)) {
      toast.warning(
        item.origem === 'Nova' && isConcludedStatus(item.raw?.status)
          ? 'Notificação concluída: abra para visualizar e iniciar retificação auditável.'
          : 'Você não tem permissão para editar esta notificação.'
      );
      return;
    }
    if (item.origem === 'Nova' && item.raw && onEditNotificacao) {
      onEditNotificacao(item.raw);
    } else {
      toast.info('Notificações antigas da planilha são registros históricos e não podem ser editadas diretamente.');
    }
  };

  const handleDeleteClick = (item: any) => {
    if (!canUserDelete(item)) {
      toast.warning('Somente o autor pode excluir seu próprio rascunho.');
      return;
    }
    if (item.origem !== 'Nova' || !item.id) {
      toast.info('Notificações antigas da planilha são registros históricos e não podem ser excluídas.');
      return;
    }
    setItemToDelete(item);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !itemToDelete.id) return;
    setIsDeleting(true);
    try {
      const res = await deleteNotificacao(itemToDelete.id);
      if (res.success) {
        toast.success(`Notificação ${itemToDelete.numNotificacao} excluída com sucesso!`);
        await refreshData();
      } else {
        toast.error(res.message || 'Erro ao excluir notificação.');
      }
    } catch (err) {
      console.error('Erro ao excluir notificação:', err);
      toast.error('Erro ao excluir notificação.');
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  const [searchCoords, setSearchCoords] = useState({ lat: '', long: '' });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set([
    'notificacaoAberto', 'notificacaoCumprida', 'notificacaoAtrasada', 'notificacaoArquivada',
    'notificacaoAntigaPendente', 'notificacaoAntigaAtendida',
    'snisb'
  ]));

  const [showMuniDropdown, setShowMuniDropdown] = useState(false);
  const [showDpaDropdown, setShowDpaDropdown] = useState(false);
  const muniRef = useRef<HTMLDivElement>(null);
  const dpaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (muniRef.current && !muniRef.current.contains(event.target as Node)) {
        setShowMuniDropdown(false);
      }
      if (dpaRef.current && !dpaRef.current.contains(event.target as Node)) {
        setShowDpaDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchAntigas = async () => {
      try {
        const response = await fetch(SPREADSHEET_URL);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        
        let allMapped: NotificacaoAntigaData[] = [];
        
        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const json: any[] = XLSX.utils.sheet_to_json(sheet, { header: 'A' });
          
          // Skip header row (index 0) and filter out empty rows or non-data sheets
          const mapped: NotificacaoAntigaData[] = json.slice(1)
            .filter(row => row.B || row.D) // Ensure there's at least a notification number or entrepreneur
            .map((row, idx) => {
            const dataEmissao = normalizeDate(row.G);
            const prazo = fixEncoding(String(row.H || ''));
            const atendida = String(row.O || 'NÃO').toUpperCase();
            const diasAtraso = atendida === 'NÃO' ? calculateDelay(dataEmissao, prazo) : 0;
            const respostaOriginal = fixEncoding(String(row.N || ''));
            const atrasoTexto = diasAtraso > 0 ? `Vencido há ${diasAtraso} dias` : '';

            return {
              id: `antiga-${sheetName}-${idx}`,
              numNotificacao: fixEncoding(String(row.B || '')),
              cpfCnpj: fixEncoding(String(row.C || '')),
              empreendedor: fixEncoding(String(row.D || '')),
              propriedade: fixEncoding(String(row.E || '')),
              carMt: fixEncoding(String(row.F || '')),
              dataEmissao,
              prazo,
              lat: String(row.I || ''),
              long: String(row.J || ''),
              municipio: fixEncoding(String(row.K || '')),
              respostaFinal: (atendida === 'NÃO' && diasAtraso > 0) 
                ? `${respostaOriginal} (${atrasoTexto})`.trim() 
                : respostaOriginal,
              atendida,
              diasAtraso,
              origem: 'Antiga'
            };
          });
          
          allMapped = [...allMapped, ...mapped];
        });
        
        setAntigasNotificacoes(allMapped);
      } catch (error) {
        console.error('Erro ao carregar notificações antigas:', error);
      } finally {
        setLoadingAntigas(false);
      }
    };

    fetchAntigas();
  }, []);

  useEffect(() => {
    const fetchSNISB = async () => {
      try {
        const response = await fetch(SNISB_CSV_URL);
        const text = await response.text();
        const lines = text.split('\n');
        if (lines.length < 2) return;
        
        const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
        
        const getIdx = (name: string) => headers.findIndex(h => h.includes(name.toUpperCase()));
        
        const idxSnisb = getIdx('CÓDIGO SNISB');
        const idxNome = getIdx('NOME DA BARRAGEM');
        const idxEmpreendedor = getIdx('EMPREENDEDOR');
        const idxMunicipio = getIdx('MUNICÍPIO');
        const idxUso = getIdx('USO PRINCIPAL');
        const idxCodBarragem = getIdx('COD BARRAGEM NA ENT FISCAL');
        const idxLat = getIdx('LATITUDE');
        const idxLong = getIdx('LONGITUDE');
        const idxDpa = getIdx('DANO POTENCIAL') !== -1 ? getIdx('DANO POTENCIAL') : 14;

        const data: BarragemSNISB[] = lines.slice(1).map((line, i) => {
          if (!line.trim()) return null;
          
          // Better CSV split that handles potential quotes
          const cols: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
              cols.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          cols.push(current.trim());

          if (cols.length < Math.max(idxLat, idxLong)) return null;
          
          return {
            id: `snisb-${i}`,
            snisb: cols[idxSnisb]?.trim() || '',
            nome: cols[idxNome]?.trim() || '',
            empreendedor: cols[idxEmpreendedor]?.trim() || '',
            municipio: cols[idxMunicipio]?.trim() || '',
            uso: cols[idxUso]?.trim() || '',
            codBarragem: cols[idxCodBarragem]?.trim() || '',
            lat: cols[idxLat]?.trim() || '',
            long: cols[idxLong]?.trim() || '',
            dpa: cols[14]?.trim() || 'Não Classificado',
            type: 'snisb'
          };
        }).filter(Boolean) as BarragemSNISB[];

        setSnisbData(data);
      } catch (error) {
        console.error('Erro ao carregar dados SNISB:', error);
      }
    };
    fetchSNISB();

    const fetchANEEL = async () => {
      try {
        const response = await fetch(ANEEL_CSV_URL);
        const text = await response.text();
        const lines = text.split('\n');
        if (lines.length < 2) return;
        
        const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
        const getIdx = (name: string) => headers.findIndex(h => h.includes(name.toUpperCase()));
        
        const idxSnisb = getIdx('CÓDIGO SNISB');
        const idxNome = getIdx('NOME DA BARRAGEM');
        const idxEmpreendedor = getIdx('EMPREENDEDOR');
        const idxMunicipio = getIdx('MUNICÍPIO');
        const idxUso = getIdx('USO PRINCIPAL');
        const idxCodBarragem = getIdx('COD BARRAGEM NA ENT FISCAL');
        const idxLat = getIdx('LATITUDE');
        const idxLong = getIdx('LONGITUDE');

        const data: BarragemSNISB[] = lines.slice(1).map((line, i) => {
          if (!line.trim()) return null;
          const cols: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
              cols.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          cols.push(current.trim());

          if (cols.length < Math.max(idxLat, idxLong)) return null;
          
          return {
            id: `aneel-${i}`,
            snisb: cols[idxSnisb]?.trim() || '',
            nome: cols[idxNome]?.trim() || '',
            empreendedor: cols[idxEmpreendedor]?.trim() || '',
            municipio: cols[idxMunicipio]?.trim() || '',
            uso: cols[idxUso]?.trim() || '',
            codBarragem: cols[idxCodBarragem]?.trim() || '',
            lat: cols[idxLat]?.trim() || '',
            long: cols[idxLong]?.trim() || '',
            dpa: cols[14]?.trim() || 'Não Classificado',
            type: 'aneel'
          };
        }).filter(Boolean) as BarragemSNISB[];

        setAneelData(data);
      } catch (error) {
        console.error('Erro ao carregar dados ANEEL:', error);
      }
    };
    fetchANEEL();
  }, []);

  const dpaOptions = useMemo(() => {
    const options = new Set<string>();
    snisbData.forEach(item => {
      if (item.dpa) options.add(item.dpa);
    });
    const sorted = Array.from(options).sort();
    // Ensure "Não Classificado" or similar is present if expected but missing
    if (sorted.length === 0) return ["Não Classificado", "Baixo", "Médio", "Alto"];
    return sorted;
  }, [snisbData]);

  const allFilteredNotificacoes = useMemo(() => {
    const novas = showNovas ? novasNotificacoes.map(n => ({
      id: n.id || '',
      numNotificacao: n.notificacaoGerada ? `Notif. ${n.notificacaoGerada}` : (n.numProcesso || 'S/N'),
      notificacaoGerada: n.notificacaoGerada || '',
      oficioGerado: n.oficioGerado || '',
      numProcesso: n.numProcesso || '',
      cpfCnpj: n.documentoIdentificacao || '',
      empreendedor: n.empreendedorNome || '',
      propriedade: n.nomeFantasia || '',
      carMt: n.carMt || '',
      dataEmissao: n.dataNotificacao || '',
      prazo: n.prazoVencimento || '',
      lat: n.lat || '',
      long: n.long || '',
      municipio: n.municipioEmpreendimento || '',
      respostaFinal: n.objetivo || '',
      origem: 'Nova' as const,
      situacao: n.situacao || 'Em aberto',
      userId: n.userId || (n as any).user_id || '',
      analistas: n.analistas || [],
      analista: (n as any).analista || (n.analistas && n.analistas[0]) || '',
      raw: n
    })) : [];

    const antigas = showAntigas ? antigasNotificacoes.map(a => ({
      ...a,
      raw: a
    })) : [];
    const combined = [...novas, ...antigas];

    const lower = searchTerm.toLowerCase();
    return combined.filter(n => {
      const itemAny = n as any;
      const numNotif = String(n.numNotificacao || '').toLowerCase();
      const notifGerada = String(itemAny.notificacaoGerada || '').toLowerCase();
      const ofGerado = String(itemAny.oficioGerado || '').toLowerCase();
      const numProc = String(itemAny.numProcesso || '').toLowerCase();
      const emp = String(n.empreendedor || '').toLowerCase();
      const cpf = String(n.cpfCnpj || '').toLowerCase();
      const mun = String(n.municipio || '').toLowerCase();
      const prop = String(n.propriedade || '').toLowerCase();
      const car = String(n.carMt || '').toLowerCase();
      const resp = String(n.respostaFinal || '').toLowerCase();

      const matchesSearch = !searchTerm || (
        numNotif.includes(lower) ||
        notifGerada.includes(lower) ||
        ofGerado.includes(lower) ||
        numProc.includes(lower) ||
        emp.includes(lower) ||
        cpf.includes(lower) ||
        mun.includes(lower) ||
        prop.includes(lower) ||
        car.includes(lower) ||
        resp.includes(lower) ||
        getAnalistaName(n).toLowerCase().includes(lower) ||
        formatCoordGMS(n.lat).toLowerCase().includes(lower) ||
        formatCoordGMS(n.long).toLowerCase().includes(lower)
      );
      
      const matchesMunicipio = filters.municipios.length === 0 || filters.municipios.includes(n.municipio);
      
      const matchesData = !filters.mesAno || (n.dataEmissao && n.dataEmissao.includes(filters.mesAno));
      
      // Integration with map legend filters
      if (n.origem === 'Nova') {
        const situacao = (n as any).situacao || 'Em aberto';
        if (situacao === 'Em aberto' && !activeFilters.has('notificacaoAberto')) return false;
        if (situacao === 'Cumprida' && !activeFilters.has('notificacaoCumprida')) return false;
        if (situacao === 'Não cumprida no prazo' && !activeFilters.has('notificacaoAtrasada')) return false;
        if (situacao === 'Arquivada' && !activeFilters.has('notificacaoArquivada')) return false;
      } else {
        const isAtendida = (n as any).atendida === 'SIM';
        if (isAtendida && !activeFilters.has('notificacaoAntigaAtendida')) return false;
        if (!isAtendida && !activeFilters.has('notificacaoAntigaPendente')) return false;
      }
      
      return matchesSearch && matchesMunicipio && matchesData;
    });
  }, [novasNotificacoes, antigasNotificacoes, showNovas, showAntigas, searchTerm, filters.municipios, filters.mesAno, activeFilters]);

  const stats = useMemo(() => {
    const novasCount = novasNotificacoes.length;
    const antigasCount = antigasNotificacoes.length;
    return {
      total: novasCount + antigasCount,
      novas: novasCount,
      antigas: antigasCount
    };
  }, [novasNotificacoes, antigasNotificacoes]);

  const totalPages = Math.ceil(allFilteredNotificacoes.length / itemsPerPage);
  const paginatedNotificacoes = allFilteredNotificacoes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const calculateDelay = (dataEmissaoStr: string, prazoDiasStr: string): number => {
    if (!dataEmissaoStr) return 0;
    const parts = dataEmissaoStr.split('/');
    if (parts.length !== 3) return 0;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const dataEmissao = new Date(year, month, day);
    if (isNaN(dataEmissao.getTime())) return 0;
    const prazoDias = parseInt(prazoDiasStr.replace(/\D/g, '')) || 0;
    const dataVencimento = new Date(dataEmissao);
    dataVencimento.setDate(dataVencimento.getDate() + prazoDias);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dataVencimento.setHours(0, 0, 0, 0);
    if (hoje > dataVencimento) {
      const diffTime = Math.abs(hoje.getTime() - dataVencimento.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return 0;
  };

  const renderSituacaoBadge = (item: any) => {
    if (item.origem === 'Nova') {
      const sit = item.situacao || 'Em aberto';
      if (sit === 'Cumprida') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
            Cumprida
          </span>
        );
      }
      if (sit === 'Não cumprida no prazo') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-50 text-amber-900 border border-amber-300">
            <span className="w-2.5 h-2.5 rounded-full bg-[#7B3FE4] text-white flex items-center justify-center text-[7px] font-black leading-none shrink-0">!</span>
            Não cumprida no prazo
          </span>
        );
      }
      if (sit === 'Arquivada') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
            Arquivada
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
          Em aberto
        </span>
      );
    }

    // Notificação Antiga
    const isAtendida = item.atendida === 'SIM';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
        isAtendida 
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
          : 'bg-rose-50 text-rose-700 border-rose-200'
      }`}>
        {isAtendida ? 'Atendida' : 'Não Atendida'}
      </span>
    );
  };

  const handleLocalizar = () => {
    const lat = parseCoordinate(searchCoords.lat, true);
    const long = parseCoordinate(searchCoords.long, false);
    if (lat !== 0 && long !== 0) {
      setMapCenter([lat, long]);
      setSearchMarker([lat, long]);
    }
  };

  const handleLimparBusca = () => {
    setSearchCoords({ lat: '', long: '' });
    setSearchMarker(null);
  };

  const filteredSnisb = useMemo(() => {
    if (!showSnisb) return [];
    return snisbData.filter(item => {
      const matchesMunicipio = filters.municipios.length === 0 || filters.municipios.some(m => matchMunicipio(m, item.municipio));
      const matchesDpa = filters.dpa.length === 0 || filters.dpa.includes(item.dpa);
      return matchesMunicipio && matchesDpa;
    });
  }, [snisbData, showSnisb, filters.municipios, filters.dpa]);

  const filteredAneel = useMemo(() => {
    if (!showAneel) return [];
    return aneelData.filter(item => {
      const matchesMunicipio = filters.municipios.length === 0 || filters.municipios.some(m => matchMunicipio(m, item.municipio));
      const matchesDpa = filters.dpa.length === 0 || filters.dpa.includes(item.dpa);
      return matchesMunicipio && matchesDpa;
    });
  }, [aneelData, showAneel, filters.municipios, filters.dpa]);

  const mapData = useMemo(() => {
    return allFilteredNotificacoes.map(n => {
      const lat = parseGMS(n.lat);
      const long = parseGMS(n.long);
      return { ...n, latDecimal: lat, longDecimal: long };
    }).filter(n => !isNaN(n.latDecimal) && !isNaN(n.longDecimal) && n.latDecimal !== 0);
  }, [allFilteredNotificacoes]);

  if (loadingNovas && loadingAntigas) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando Controle de Notificações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 md:p-10 space-y-6 sm:space-y-8 max-w-[1600px] mx-auto w-full animate-fade-in">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 sm:gap-6 border-b border-slate-200 pb-6 sm:pb-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 hover:scale-105 transition-transform">
            <img 
              src="https://lh3.googleusercontent.com/d/11OtFjZyub-hYsCvNr8N88CHVtcGM1QKU" 
              alt="Logo Notifica CSB" 
              className="w-9 h-9 sm:w-11 sm:h-11 object-contain" 
              referrerPolicy="no-referrer" 
            />
          </div>
          <div className="space-y-1">
            <p className="text-slate-900 text-[10px] font-black uppercase tracking-[0.2em]">Gestão Integrada</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tighter">Controle de <span className="text-emerald-600">Notificações</span></h1>
            <p className="text-slate-500 font-medium text-xs sm:text-sm">Monitoramento unificado de notificações antigas (planilha) e novas (sistema).</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar por N° notificação, ofício, interessado, CPF..." 
              className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-5 group hover:border-emerald-500/30 transition-all">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform"><Bell size={28} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Notificações</p>
            <p className="text-3xl font-black text-slate-900 tracking-tighter">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-5 group hover:border-blue-500/30 transition-all">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform"><Database size={28} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Novas Notificações</p>
            <p className="text-3xl font-black text-slate-900 tracking-tighter">{stats.novas}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-5 group hover:border-amber-500/30 transition-all">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform"><Globe size={28} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notificações Antigas</p>
            <p className="text-3xl font-black text-slate-900 tracking-tighter">{stats.antigas}</p>
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lat:</span>
                    <input 
                      type="text" 
                      placeholder='Ex: 15° 35&apos; 55" S' 
                      className="w-32 sm:w-40 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 outline-none" 
                      value={searchCoords.lat} 
                      onChange={e => setSearchCoords({...searchCoords, lat: e.target.value})} 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Long:</span>
                    <input 
                      type="text" 
                      placeholder='Ex: 56° 05&apos; 47" W' 
                      className="w-32 sm:w-40 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 outline-none" 
                      value={searchCoords.long} 
                      onChange={e => setSearchCoords({...searchCoords, long: e.target.value})} 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleLocalizar} 
                      className="px-3 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-sm flex items-center gap-2"
                    >
                      <MapPin size={14} /> Localizar
                    </button>
                    <button 
                      onClick={handleLimparBusca} 
                      className="px-3 py-2 bg-white text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                
                <div className="h-8 w-px bg-slate-200 mx-2 hidden lg:block" />

                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`lg:hidden flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${showFilters ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  <Filter size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Filtros</span>
                </button>

                <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-wrap items-center gap-4 w-full lg:w-auto`}>
                  <div className="relative group/select">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-emerald-500/50 transition-all">
                      <Filter size={14} className="text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Mês/Ano"
                        className="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-transparent border-none focus:ring-0 w-24"
                        value={filters.mesAno}
                        onChange={(e) => setFilters(f => ({ ...f, mesAno: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="relative" ref={muniRef}>
                    <div 
                      onClick={() => {
                        setShowMuniDropdown(!showMuniDropdown);
                        setShowDpaDropdown(false);
                      }}
                      className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-emerald-500/50 transition-all min-w-[180px]"
                    >
                      <div className="flex items-center gap-2">
                        <Filter size={14} className="text-slate-400" />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest truncate max-w-[130px]">
                          {filters.municipios.length === 0 
                            ? 'Municípios' 
                            : `${filters.municipios.length} Selec.`}
                        </span>
                      </div>
                      <ChevronDown size={12} className={`text-slate-400 transition-transform ${showMuniDropdown ? 'rotate-180' : ''}`} />
                    </div>
                    
                    {showMuniDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-[1100] max-h-[400px] overflow-y-auto custom-scrollbar p-2 animate-fade-in">
                        <div className="p-2 border-b border-slate-100 mb-2 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtrar Municípios</span>
                          {filters.municipios.length > 0 && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setFilters(f => ({ ...f, municipios: [] }));
                              }}
                              className="text-[9px] font-black text-rose-500 uppercase hover:underline"
                            >
                              Limpar
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          {OPS_MUNICIPIOS.map(muni => (
                            <label key={muni} className="flex items-center gap-2 p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors active:bg-slate-100">
                              <input 
                                type="checkbox" 
                                checked={filters.municipios.includes(muni)}
                                onChange={(e) => {
                                  const next = e.target.checked 
                                    ? [...filters.municipios, muni]
                                    : filters.municipios.filter(m => m !== muni);
                                  setFilters(f => ({ ...f, municipios: next }));
                                }}
                                className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                              />
                              <span className="text-xs font-bold text-slate-700">{muni}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {showSnisb && (
                    <div className="relative" ref={dpaRef}>
                      <div 
                        onClick={() => {
                          setShowDpaDropdown(!showDpaDropdown);
                          setShowMuniDropdown(false);
                        }}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-emerald-500/50 transition-all min-w-[120px]"
                      >
                        <div className="flex items-center gap-2">
                          <Filter size={14} className="text-slate-400" />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest truncate max-w-[100px]">
                            {filters.dpa.length === 0 
                              ? 'DPA' 
                              : `${filters.dpa.length} DPA`}
                          </span>
                        </div>
                        <ChevronDown size={12} className={`text-slate-400 transition-transform ${showDpaDropdown ? 'rotate-180' : ''}`} />
                      </div>
                      
                      {showDpaDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-[1100] p-2 animate-fade-in">
                          <div className="p-2 border-b border-slate-100 mb-2 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtrar DPA</span>
                            {filters.dpa.length > 0 && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFilters(f => ({ ...f, dpa: [] }));
                                }}
                                className="text-[9px] font-black text-rose-500 uppercase hover:underline"
                              >
                                Limpar
                              </button>
                            )}
                          </div>
                          <div className="space-y-1">
                            {dpaOptions.map(dpa => (
                              <label key={dpa} className="flex items-center gap-2 p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors active:bg-slate-100">
                                <input 
                                  type="checkbox" 
                                  checked={filters.dpa.includes(dpa)}
                                  onChange={(e) => {
                                    const next = e.target.checked 
                                      ? [...filters.dpa, dpa]
                                      : filters.dpa.filter(d => d !== dpa);
                                    setFilters(f => ({ ...f, dpa: next }));
                                  }}
                                  className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                                />
                                <span className="text-xs font-bold text-slate-700">{dpa}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Atendida (Antigas)</span>
                    <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                      <button 
                        onClick={() => {
                          const next = new Set(activeFilters);
                          if (next.has('notificacaoAntigaAtendida')) next.delete('notificacaoAntigaAtendida');
                          else next.add('notificacaoAntigaAtendida');
                          setActiveFilters(next);
                        }}
                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeFilters.has('notificacaoAntigaAtendida') ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-100'}`}
                      >
                        SIM
                      </button>
                      <button 
                        onClick={() => {
                          const next = new Set(activeFilters);
                          if (next.has('notificacaoAntigaPendente')) next.delete('notificacaoAntigaPendente');
                          else next.add('notificacaoAntigaPendente');
                          setActiveFilters(next);
                        }}
                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeFilters.has('notificacaoAntigaPendente') ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-100'}`}
                      >
                        NÃO
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="hidden lg:block h-8 w-px bg-slate-200 mx-2" />

              <div className="flex flex-wrap items-center gap-4 border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 lg:pl-6 w-full lg:w-auto">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={showNovas} 
                    onChange={e => {
                      const checked = e.target.checked;
                      setShowNovas(checked);
                      const next = new Set(activeFilters);
                      const novaFilters = ['notificacaoAberto', 'notificacaoCumprida', 'notificacaoAtrasada', 'notificacaoArquivada'];
                      novaFilters.forEach(f => {
                        if (checked) next.add(f);
                        else next.delete(f);
                      });
                      setActiveFilters(next);
                    }} 
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Novas</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={showAntigas} 
                    onChange={e => {
                      const checked = e.target.checked;
                      setShowAntigas(checked);
                      const next = new Set(activeFilters);
                      const antigaFilters = ['notificacaoAntigaPendente', 'notificacaoAntigaAtendida'];
                      antigaFilters.forEach(f => {
                        if (checked) next.add(f);
                        else next.delete(f);
                      });
                      setActiveFilters(next);
                    }} 
                    className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                  />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-amber-600 transition-colors">Antigas</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={showSnisb} 
                    onChange={e => {
                      const checked = e.target.checked;
                      setShowSnisb(checked);
                      const next = new Set(activeFilters);
                      if (checked) next.add('snisb');
                      else next.delete('snisb');
                      setActiveFilters(next);
                    }} 
                    className="w-4 h-4 text-sky-400 border-slate-300 rounded focus:ring-sky-500"
                  />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-sky-400 transition-colors">SNISB</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={showAneel} 
                    onChange={e => {
                      const checked = e.target.checked;
                      setShowAneel(checked);
                      const next = new Set(activeFilters);
                      if (checked) next.add('aneel');
                      else next.delete('aneel');
                      setActiveFilters(next);
                    }} 
                    className="w-4 h-4 text-emerald-400 border-slate-300 rounded focus:ring-emerald-500"
                  />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">ANEEL</span>
                </label>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow-md border border-slate-200 h-[350px] sm:h-[450px] md:h-[600px] relative">
            <MTMap 
              pareceres={[]} oficios={[]} notificacoes={mapData as any} 
              snisbData={filteredSnisb}
              aneelData={filteredAneel}
              hoveredCity={hoveredCity} setHoveredCity={setHoveredCity}
              center={mapCenter} searchMarker={searchMarker} isNotificationControl={true}
              externalActiveFilters={activeFilters as any}
              onToggleFilter={(f) => {
                const next = new Set(activeFilters);
                if (next.has(f)) next.delete(f);
                else next.add(f);
                setActiveFilters(next);
              }}
              onSetFilters={(next) => setActiveFilters(next as any)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2"><List size={18} className="text-emerald-500" /> Listagem de Notificações</h3>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens por página:</span>
            <select className="text-xs font-bold border rounded-lg px-2 py-1 bg-white" value={itemsPerPage} onChange={e => {setItemsPerPage(Number(e.target.value)); setCurrentPage(1);}}>
              {[10, 20, 30, 40, 50, 100].map(val => (<option key={val} value={val}>{val}</option>))}
            </select>
          </div>
        </div>

        {/* Mobile / Tablet Screen Card List */}
        <div className="md:hidden divide-y divide-slate-100">
          {paginatedNotificacoes.map((n) => (
            <div 
              key={n.id} 
              className="p-5 space-y-3 cursor-pointer active:bg-slate-50 hover:bg-slate-50/40 transition-colors"
              onClick={() => {
                const lat = parseGMS(n.lat);
                const lng = parseGMS(n.long);
                if (!isNaN(lat) && !isNaN(lng)) {
                  setMapCenter([lat, lng]);
                  setSearchMarker([lat, lng]);
                  
                  // Smoothly scroll to the map on mobile and tablet
                  const mapElement = document.querySelector('.leaflet-container');
                  if (mapElement) {
                    mapElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1 items-start">
                  <span className="text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {n.numNotificacao || 'S/N'}
                  </span>
                  {renderSituacaoBadge(n)}

                  {/* Atalhos: Visualizar, editar e excluir logo abaixo da situação */}
                  <div 
                    className="flex items-center gap-1 mt-1 pt-1 border-t border-slate-100" 
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleView(n)}
                      title="Visualizar Notificação"
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                    >
                      <Eye size={14} />
                    </button>
                    
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleEdit(n)}
                        disabled={!canUserEdit(n)}
                        title={canUserEdit(n) ? "Editar Notificação" : "Registros históricos não podem ser editados"}
                        className={`p-1.5 rounded-lg transition-colors border border-transparent ${
                          canUserEdit(n) 
                            ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200' 
                            : 'text-slate-300 opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <Edit size={14} />
                      </button>
                    )}
                    
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(n)}
                        disabled={!canUserDelete(n)}
                        title={canUserDelete(n) ? "Excluir Notificação" : "Registros históricos não podem ser excluídos"}
                        className={`p-1.5 rounded-lg transition-colors border border-transparent ${
                          canUserDelete(n) 
                            ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200' 
                            : 'text-slate-300 opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                  n.origem === 'Nova' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-amber-50 text-amber-600 border-amber-200'
                }`}>
                  {n.origem}
                </span>
              </div>

              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Empreendedor / Propriedade</p>
                <p className="text-sm font-bold text-slate-900 leading-tight">{n.empreendedor}</p>
                {n.propriedade && <p className="text-xs text-slate-500 font-medium">{n.propriedade}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4 py-2 border-t border-b border-slate-50 text-xs">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Município</p>
                  <p className="font-bold text-slate-700 leading-tight">{n.municipio}</p>
                  {(n.lat || n.long) && (
                    <div className="text-[10px] font-mono text-slate-500 leading-tight mt-0.5 space-y-0.5">
                      {n.lat && <div>Lat: {formatCoordGMS(n.lat)}</div>}
                      {n.long && <div>Long: {formatCoordGMS(n.long)}</div>}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Analista / Data</p>
                  <p className="font-bold text-slate-800 leading-tight">{getAnalistaName(n) || '---'}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{n.dataEmissao || '---'}</p>
                </div>
              </div>

              <div className="flex justify-between items-end pt-1">
                <div className="max-w-[70%]">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">CPF / CNPJ</p>
                  <p className="font-mono text-xs text-slate-500">{n.cpfCnpj || '---'}</p>
                </div>
                <div className="text-right">
                  {n.origem === 'Antiga' ? (
                    <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      n.atendida === 'SIM' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-rose-500 text-white shadow-sm'
                    }`}>
                      Atendida: {n.atendida}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase">
                      Nova
                    </span>
                  )}
                </div>
              </div>

              {n.respostaFinal && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-[11px] text-slate-600 italic whitespace-normal break-words leading-relaxed">
                  <span className="font-bold uppercase text-[8px] text-slate-400 block tracking-wider not-italic mb-0.5">Resposta / Observações</span>
                  <p className="break-words whitespace-normal text-slate-700">{n.respostaFinal}</p>
                </div>
              )}
            </div>
          ))}
          {paginatedNotificacoes.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm font-bold italic">
              Nenhuma notificação encontrada.
            </div>
          )}
        </div>

        {/* Desktop Screen Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                <th className="p-4 text-left">N° Notificação</th>
                <th className="p-4 text-left">Empreendedor</th>
                <th className="p-4 text-left">CPF/CNPJ</th>
                <th className="p-4 text-left">Município</th>
                <th className="p-4 text-left">Analista</th>
                <th className="p-4 text-left">Origem</th>
                <th className="p-4 text-left min-w-[220px] max-w-[340px]">Status/Resposta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedNotificacoes.map((n) => (
                <tr 
                  key={n.id} 
                  className="hover:bg-slate-50 transition-colors group cursor-pointer"
                  onMouseEnter={() => {
                    const lat = parseGMS(n.lat);
                    const lng = parseGMS(n.long);
                    if (!isNaN(lat) && !isNaN(lng)) {
                      setHoveredCity(n.municipio);
                      setSearchMarker([lat, lng]);
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredCity(null);
                    setSearchMarker(null);
                  }}
                  onClick={() => {
                    const lat = parseGMS(n.lat);
                    const lng = parseGMS(n.long);
                    if (!isNaN(lat) && !isNaN(lng)) {
                      setMapCenter([lat, lng]);
                      setSearchMarker([lat, lng]);
                    }
                  }}
                >
                  <td className="p-4 align-top">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-sm font-black text-slate-900">{n.numNotificacao}</span>
                      {renderSituacaoBadge(n)}

                      {/* Atalhos: Visualizar, editar e excluir logo abaixo da situação */}
                      <div 
                        className="flex items-center gap-1 mt-1 pt-1.5 border-t border-slate-100" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleView(n)}
                          title="Visualizar Notificação"
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                        >
                          <Eye size={15} />
                        </button>
                        
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleEdit(n)}
                            disabled={!canUserEdit(n)}
                            title={canUserEdit(n) ? "Editar Notificação" : "Registros históricos não podem ser editados"}
                            className={`p-1.5 rounded-lg transition-colors border border-transparent ${
                              canUserEdit(n) 
                                ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200' 
                                : 'text-slate-300 opacity-40 cursor-not-allowed'
                            }`}
                          >
                            <Edit size={15} />
                          </button>
                        )}
                        
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(n)}
                            disabled={!canUserDelete(n)}
                            title={canUserDelete(n) ? "Excluir Notificação" : "Registros históricos não podem ser excluídos"}
                            className={`p-1.5 rounded-lg transition-colors border border-transparent ${
                              canUserDelete(n) 
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200' 
                                : 'text-slate-300 opacity-40 cursor-not-allowed'
                            }`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-700 align-top">
                    <div className="flex flex-col">
                      <span>{n.empreendedor}</span>
                      <span className="text-[10px] text-slate-400">{n.propriedade}</span>
                    </div>
                  </td>
                  <td className="p-4 text-xs font-mono text-slate-500 align-top">{n.cpfCnpj}</td>
                  <td className="p-4 align-top">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{n.municipio || '---'}</span>
                      {(n.lat || n.long) && (
                        <div className="text-[10px] font-mono text-slate-500 flex flex-col leading-tight mt-0.5 whitespace-nowrap">
                          {n.lat && <span>Lat: {formatCoordGMS(n.lat)}</span>}
                          {n.long && <span>Long: {formatCoordGMS(n.long)}</span>}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800">
                        {getAnalistaName(n) || '---'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {n.dataEmissao || '---'}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 align-top">
                    <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${n.origem === 'Nova' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>{n.origem}</span>
                  </td>
                  <td className="p-4 align-top text-xs text-slate-600 italic whitespace-normal break-words leading-relaxed max-w-[340px]">
                    <div className="flex flex-col gap-1.5 whitespace-normal break-words">
                      <span className="text-slate-700 leading-snug break-words">
                        {n.respostaFinal || '---'}
                      </span>
                      {n.origem === 'Antiga' && (
                        <span className={`text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 w-fit px-1.5 py-0.5 rounded ${n.atendida === 'SIM' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                          Atendida: {n.atendida}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center sm:text-left">
            Mostrando {paginatedNotificacoes.length} de {allFilteredNotificacoes.length} itens (Pág. {currentPage} de {totalPages || 1})
          </p>
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
              disabled={currentPage === 1} 
              className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-all flex items-center gap-1 text-xs font-bold touch-manipulation active:scale-95"
              title="Página anterior"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Anterior</span>
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = i + 1;
                if (totalPages > 5 && currentPage > 3) { pageNum = currentPage - 3 + i + 1; if (pageNum > totalPages) pageNum = totalPages - (4 - i); }
                return (
                  <button 
                    key={pageNum} 
                    onClick={() => setCurrentPage(pageNum)} 
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl font-bold text-xs sm:text-sm border transition-all touch-manipulation active:scale-95 ${currentPage === pageNum ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
              disabled={currentPage === totalPages} 
              className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-all flex items-center gap-1 text-xs font-bold touch-manipulation active:scale-95"
              title="Próxima página"
            >
              <span className="hidden sm:inline">Próxima</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        isOpen={Boolean(itemToDelete)}
        title="Excluir Notificação"
        message={`Tem certeza que deseja excluir a notificação ${itemToDelete?.numNotificacao || ''}? Esta ação removerá o registro permanentemente do sistema.`}
        variant="danger"
        confirmLabel={isDeleting ? "Excluindo..." : "Excluir"}
        cancelLabel="Cancelar"
        onConfirm={confirmDelete}
        onCancel={() => setItemToDelete(null)}
      />

      {/* Modal de Visualização da Notificação */}
      {selectedViewNotificacao && (
        <div 
          className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedViewNotificacao(null)}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-xl">
                    {selectedViewNotificacao.numNotificacao || 'S/N'}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                    selectedViewNotificacao.origem === 'Nova' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-amber-50 text-amber-600 border-amber-200'
                  }`}>
                    {selectedViewNotificacao.origem}
                  </span>
                  {renderSituacaoBadge(selectedViewNotificacao)}
                </div>
                <h4 className="text-lg font-black text-slate-800">
                  Detalhes da Notificação
                </h4>
              </div>
              <button 
                onClick={() => setSelectedViewNotificacao(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Empreendedor</p>
                  <p className="font-bold text-slate-900 text-sm">{selectedViewNotificacao.empreendedor || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CPF / CNPJ</p>
                  <p className="font-mono text-slate-700">{selectedViewNotificacao.cpfCnpj || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Empreendimento / Propriedade</p>
                  <p className="font-medium text-slate-700">{selectedViewNotificacao.propriedade || '---'}</p>
                </div>
                {selectedViewNotificacao.carMt && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CAR / MT</p>
                    <p className="font-mono text-slate-700">{selectedViewNotificacao.carMt}</p>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Município</p>
                  <p className="font-bold text-slate-900">{selectedViewNotificacao.municipio || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coordenadas</p>
                  <p className="font-mono text-slate-700">
                    {selectedViewNotificacao.lat ? `Lat: ${formatCoordGMS(selectedViewNotificacao.lat)}` : '---'}
                    {selectedViewNotificacao.lat && selectedViewNotificacao.long ? ' | ' : ''}
                    {selectedViewNotificacao.long ? `Long: ${formatCoordGMS(selectedViewNotificacao.long)}` : ''}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Emissão</p>
                    <p className="font-bold text-slate-700">{selectedViewNotificacao.dataEmissao || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prazo</p>
                    <p className="font-bold text-slate-700">{selectedViewNotificacao.prazo || '---'}</p>
                  </div>
                </div>
                {selectedViewNotificacao.analista && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analista Responsável</p>
                    <p className="font-medium text-slate-700">{selectedViewNotificacao.analista}</p>
                  </div>
                )}
              </div>
            </div>

            {selectedViewNotificacao.respostaFinal && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status / Resposta / Observações</p>
                <p className="text-xs text-slate-700 italic leading-relaxed whitespace-pre-line break-words">
                  {selectedViewNotificacao.respostaFinal}
                </p>
                {selectedViewNotificacao.origem === 'Antiga' && (
                  <p className="text-xs font-bold pt-2">
                    Situação de Atendimento: <span className={selectedViewNotificacao.atendida === 'SIM' ? 'text-emerald-600' : 'text-rose-600'}>{selectedViewNotificacao.atendida === 'SIM' ? 'Atendida' : 'Não Atendida'}</span>
                  </p>
                )}
              </div>
            )}

            {selectedViewNotificacao.raw?.textoNotificacao && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Texto da Notificação</p>
                <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-mono text-slate-700 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {selectedViewNotificacao.raw.textoNotificacao}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedViewNotificacao(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControleNotificacoes;
