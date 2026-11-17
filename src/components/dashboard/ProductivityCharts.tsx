import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ProductivityTooltip } from './ProductivityTooltip';
import { Calendar, Filter } from 'lucide-react';

interface ProductivityChartsProps {
  sectorProductivityData: any[];
  analystData: any[];
  allDocuments: any[];
  availableMonths: string[];
  selectedAnalyst: string | null;
  setSelectedAnalyst: (analyst: string | null) => void;
}

export const ProductivityCharts = React.memo<ProductivityChartsProps>(({ 
  sectorProductivityData, 
  analystData, 
  allDocuments,
  availableMonths,
  selectedAnalyst, 
  setSelectedAnalyst 
}) => {
  const [analystViewMode, setAnalystViewMode] = useState<'total' | 'monthly'>('total');
  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0] || '');

  const displayAnalystData = useMemo(() => {
    if (analystViewMode === 'total') return analystData;

    // Calculate monthly data locally
    const analystMap: Record<string, any> = {};
    const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    allDocuments.forEach(i => {
      const dateStr = i.tipo_documento === 'Parecer Técnico' ? (i as any).data : 
                     (i.tipo_documento === 'Ofício de Pendências' || i.tipo_documento === '1° Oficio de Pendencias' || i.tipo_documento === '2° Oficio de Pendencias' || i.tipo_documento === 'Oficio Geral') ? (i as any).dataEmissao : 
                     (i as any).dataNotificacao || i.created_at;
                     
      if (!dateStr) return;
      
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      
      const monthYear = `${MONTHS[d.getMonth()]}/${d.getFullYear()}`;
      
      if (monthYear !== selectedMonth) return;

      const analista = (i as any).analistas?.[0] || (i as any).analista || 'Não Identificado';
      if (!analystMap[analista]) {
        analystMap[analista] = {
          name: analista.split(' ')[0],
          full: analista,
          parecerConcluido: 0,
          parecerRascunho: 0,
          oficioPendente: 0,
          oficioExpirado: 0,
          oficioCumprido: 0,
          oficioArquivado: 0,
          notificacaoConcluida: 0,
          notificacaoRascunho: 0,
          total: 0
        };
      }

      const docType = i.tipo_documento;
      const status = i.status;

      if (docType === 'Parecer Técnico') {
        if (status === 'Concluído') analystMap[analista].parecerConcluido++;
        else analystMap[analista].parecerRascunho++;
      } else if (docType?.includes('Oficio')) {
        if (status === 'Cumprido') analystMap[analista].oficioCumprido++;
        else if (status === 'Expirado') analystMap[analista].oficioExpirado++;
        else if (status === 'Arquivado') analystMap[analista].oficioArquivado++;
        else analystMap[analista].oficioPendente++;
      } else if (docType === 'Notificação') {
        if (status === 'Concluído') analystMap[analista].notificacaoConcluida++;
        else analystMap[analista].notificacaoRascunho++;
      }
      
      analystMap[analista].total++;
    });

    return Object.values(analystMap).sort((a, b) => b.total - a.total);
  }, [analystViewMode, selectedMonth, analystData, allDocuments]);

  return (
    <div className="space-y-8">
      {/* Produtividade Mensal */}
      <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest mb-8 flex items-center justify-between">
          <span>Produtividade Mensal</span>
          {selectedAnalyst && (
            <span className="text-[10px] text-blue-600 lowercase bg-blue-50 px-2 py-0.5 rounded-full">
              Filtrado: {selectedAnalyst.split(' ')[0]}
            </span>
          )}
        </h3>
        <div className="h-[400px] md:h-[500px] lg:h-[600px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sectorProductivityData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip content={<ProductivityTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              <Bar dataKey="parecerConcluido" name="Parecer (Concluído)" stackId="a" fill="#0000CD" />
              <Bar dataKey="parecerRascunho" name="Parecer (Rascunho)" stackId="a" fill="#87CEEB" />
              <Bar dataKey="oficioCumprido" name="Ofício (Cumprido)" stackId="a" fill="#10b981" />
              <Bar dataKey="oficioPendente" name="Ofício (Pendente)" stackId="a" fill="#FBBF24" />
              <Bar dataKey="oficioExpirado" name="Ofício (Expirado)" stackId="a" fill="#EF4444" />
              <Bar dataKey="oficioArquivado" name="Ofício (Arquivado)" stackId="a" fill="#94A3B8" />
              <Bar dataKey="notificacaoConcluida" name="Notif. (Concluída)" stackId="a" fill="#7B3FE4" />
              <Bar dataKey="notificacaoRascunho" name="Notif. (Rascunho)" stackId="a" fill="#9C8ACF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Produtividade por Analista */}
      <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">Produtividade por Analista</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {analystViewMode === 'total' ? 'Visualizando Total Acumulado' : `Visualizando Mês: ${selectedMonth}`}
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setAnalystViewMode('total')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  analystViewMode === 'total' 
                    ? 'bg-white text-emerald-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Filter size={12} /> Geral
              </button>
              <button
                onClick={() => setAnalystViewMode('monthly')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  analystViewMode === 'monthly' 
                    ? 'bg-white text-emerald-600 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Calendar size={12} /> Por Mês
              </button>
            </div>

            {analystViewMode === 'monthly' && (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white border-2 border-slate-200 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 outline-none focus:border-emerald-500 transition-all"
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}

            {selectedAnalyst && (
              <button 
                onClick={() => setSelectedAnalyst(null)}
                className="text-[10px] font-bold text-blue-600 uppercase hover:underline ml-auto md:ml-0"
              >
                Limpar Filtro
              </button>
            )}
          </div>
        </div>

        <div className="h-[400px] md:h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={displayAnalystData} 
              layout="horizontal"
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              onClick={(data: any) => {
                if (data && data.activePayload && data.activePayload.length > 0) {
                  setSelectedAnalyst(data.activePayload[0].payload.full);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} />
              <YAxis />
              <Tooltip content={<ProductivityTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              <Bar dataKey="parecerConcluido" name="Parecer (Concluído)" stackId="a" fill="#0000CD" className="cursor-pointer" />
              <Bar dataKey="parecerRascunho" name="Parecer (Rascunho)" stackId="a" fill="#87CEEB" className="cursor-pointer" />
              <Bar dataKey="oficioCumprido" name="Ofício (Cumprido)" stackId="a" fill="#10b981" className="cursor-pointer" />
              <Bar dataKey="oficioPendente" name="Ofício (Pendente)" stackId="a" fill="#FBBF24" className="cursor-pointer" />
              <Bar dataKey="oficioExpirado" name="Ofício (Expirado)" stackId="a" fill="#EF4444" className="cursor-pointer" />
              <Bar dataKey="oficioArquivado" name="Ofício (Arquivado)" stackId="a" fill="#94A3B8" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});
