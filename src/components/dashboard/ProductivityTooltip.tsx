import React from 'react';

export const ProductivityTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const total = data.value;
    
    const items = [
      { label: 'Parecer (Concluído)', value: data.parecerConcluido, color: '#0000CD' },
      { label: 'Parecer (Rascunho)', value: data.parecerRascunho, color: '#87CEEB' },
      { label: 'Ofício (Cumprido)', value: data.oficioCumprido, color: '#10b981' },
      { label: 'Ofício (Pendente)', value: data.oficioPendente, color: '#FBBF24' },
      { label: 'Ofício (Expirado)', value: data.oficioExpirado, color: '#EF4444' },
      { label: 'Ofício (Arquivado)', value: data.oficioArquivado, color: '#94A3B8' },
    ].filter(item => item.value > 0);

    return (
      <div className="bg-white p-4 rounded-xl shadow-2xl border border-slate-100 min-w-[240px] animate-in fade-in zoom-in duration-200">
        <p className="text-xs font-black text-slate-900 uppercase tracking-widest mb-3 border-b border-slate-50 pb-2">
          {data.full || label}
        </p>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{item.label}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-slate-900 block leading-none">{item.value}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                  {total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produção Total</span>
            <span className="text-sm font-black text-emerald-600">{total}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};
