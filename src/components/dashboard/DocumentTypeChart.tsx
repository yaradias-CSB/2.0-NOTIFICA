import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

interface DocumentTypeChartProps {
  data: any[];
  totalDocuments: number;
}

export const DocumentTypeChart = React.memo<DocumentTypeChartProps>(({ data, totalDocuments }) => {
  return (
    <div className="lg:col-span-1 bg-white p-4 md:p-8 rounded-2xl shadow-md border border-slate-200 flex flex-col">
      <h3 className="font-bold text-slate-800 text-xs md:text-sm uppercase tracking-widest mb-6">Tipos de Documentos</h3>
      <div className="flex-1 min-h-[250px] sm:min-h-[300px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={90}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
              itemStyle={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-4xl font-black text-slate-900 leading-none">{totalDocuments}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 mt-6">
        {data.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 group hover:bg-white hover:border-slate-200 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900">{item.value}</span>
              <span className="text-[10px] font-bold text-slate-400">({totalDocuments > 0 ? ((item.value / totalDocuments) * 100).toFixed(0) : 0}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
