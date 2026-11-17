import React from 'react';
import { Database } from 'lucide-react';
import { MultiSelect } from './MultiSelect';
import { OPS_MUNICIPIOS, OPS_ANALISTA, OPS_RESPONSAVEL_TECNICO } from '../../constants';

interface FilterSectionProps {
  filters: {
    municipios: string[];
    dpa: string[];
    cri: string[];
    rt: string[];
    analistas: string[];
    status: string[];
    tipoDocumento: string[];
    datas: string[];
  };
  setFilters: React.Dispatch<React.SetStateAction<{
    municipios: string[];
    dpa: string[];
    cri: string[];
    rt: string[];
    analistas: string[];
    status: string[];
    tipoDocumento: string[];
    datas: string[];
  }>>;
  availableMonths: string[];
}

export const FilterSection: React.FC<FilterSectionProps> = ({ filters, setFilters, availableMonths }) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-emerald-100 animate-in slide-in-from-top-4 duration-300">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
          <Database size={16} className="text-emerald-500" /> Filtros Avançados
        </h4>
        <button 
          onClick={() => setFilters({
            municipios: [], dpa: [], cri: [], rt: [], analistas: [], status: [], tipoDocumento: [], datas: []
          })}
          className="text-[10px] font-bold text-slate-400 uppercase hover:text-red-500 transition-colors"
        >
          Limpar Todos
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MultiSelect 
          label="Município" 
          options={OPS_MUNICIPIOS} 
          selected={filters.municipios} 
          onChange={(val) => setFilters(prev => ({ ...prev, municipios: val }))} 
          searchable 
        />
        <MultiSelect 
          label="Tipo de Documento" 
          options={['Parecer Técnico', '1° Oficio de Pendencias', '2° Oficio de Pendencias', 'Oficio Geral', 'Notificação']} 
          selected={filters.tipoDocumento} 
          onChange={(val) => setFilters(prev => ({ ...prev, tipoDocumento: val }))} 
        />
        <MultiSelect 
          label="Data (Mês/Ano)" 
          options={availableMonths} 
          selected={filters.datas} 
          onChange={(val) => setFilters(prev => ({ ...prev, datas: val }))} 
        />
        <MultiSelect 
          label="Analista" 
          options={OPS_ANALISTA} 
          selected={filters.analistas} 
          onChange={(val) => setFilters(prev => ({ ...prev, analistas: val }))} 
          searchable 
        />
        <MultiSelect 
          label="DPA" 
          options={['Baixo', 'Médio', 'Alto']} 
          selected={filters.dpa} 
          onChange={(val) => setFilters(prev => ({ ...prev, dpa: val }))} 
        />
        <MultiSelect 
          label="CRI" 
          options={['Baixa', 'Média', 'Alta']} 
          selected={filters.cri} 
          onChange={(val) => setFilters(prev => ({ ...prev, cri: val }))} 
        />
        <MultiSelect 
          label="Status" 
          options={['Rascunho', 'Concluído', 'Pendente / Em aberto', 'Cumprido', 'Não cumprido no prazo', 'Arquivado']} 
          selected={filters.status} 
          onChange={(val) => setFilters(prev => ({ ...prev, status: val }))} 
        />
        <MultiSelect 
          label="Responsável Técnico" 
          options={OPS_RESPONSAVEL_TECNICO} 
          selected={filters.rt} 
          onChange={(val) => setFilters(prev => ({ ...prev, rt: val }))} 
          searchable 
        />
      </div>
    </div>
  );
};
