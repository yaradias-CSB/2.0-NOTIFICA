import React from 'react';

interface StatsCardsProps {
  stats: {
    totalPareceres: number;
    pareceresConcluidos: number;
    pareceresRascunhos: number;
    totalOficios: number;
    oficiosPendentes: number;
    oficiosExpirados: number;
    oficiosCumpridos: number;
    oficiosArquivados: number;
    totalNotificacoes: number;
    notificacoesEmAberto: number;
    notificacoesCumpridas: number;
    notificacoesAtrasadas: number;
    notificacoesArquivadas: number;
    notificacoesConcluidas: number;
  };
}

export const StatsCards = React.memo<StatsCardsProps>(({ stats }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {/* Total de Pareceres */}
      <div className="bg-white p-4 md:p-6 rounded-2xl shadow-md border border-slate-200 relative group cursor-help transition-all hover:shadow-lg">
        <p className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Pareceres</p>
        <div className="flex items-baseline justify-between">
          <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 font-mono tracking-tighter">{stats.totalPareceres}</h3>
          <div className="flex flex-col items-end">
            <span className="text-[9px] md:text-[10px] font-bold text-emerald-600">Concluídos: {stats.pareceresConcluidos}</span>
            <span className="text-[9px] md:text-[10px] font-bold text-amber-500">Rascunhos: {stats.pareceresRascunhos}</span>
          </div>
        </div>
        
        <div className="absolute top-full left-0 mt-2 w-full bg-white text-slate-900 p-4 rounded-xl shadow-2xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-slate-200">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider border-b border-slate-100 pb-2 mb-2 text-slate-400">
              <span>Status do Parecer</span>
              <span>Qtd</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: '#0000CD' }}></div>
                <span className="text-slate-600 font-medium">Parecer (Concluído)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.pareceresConcluidos}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: '#87CEEB' }}></div>
                <span className="text-slate-600 font-medium">Parecer (Rascunho)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.pareceresRascunhos}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Total de Ofícios */}
      <div className="bg-white p-4 md:p-6 rounded-2xl shadow-md border border-slate-200 relative group cursor-help transition-all hover:shadow-lg">
        <p className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Ofícios</p>
        <div className="flex items-baseline justify-between">
          <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 font-mono tracking-tighter">{stats.totalOficios}</h3>
          <div className="flex flex-col items-end">
            <span className="text-[9px] md:text-[10px] font-bold text-emerald-600">Cumpridos: {stats.oficiosCumpridos}</span>
            <span className="text-[9px] md:text-[10px] font-bold text-amber-500">Pendentes: {stats.oficiosPendentes}</span>
          </div>
        </div>

        <div className="absolute top-full left-0 mt-2 w-full bg-white text-slate-900 p-4 rounded-xl shadow-2xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-slate-200">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider border-b border-slate-100 pb-2 mb-2 text-slate-400">
              <span>Status do Ofício</span>
              <span>Qtd</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm" style={{ background: 'repeating-linear-gradient(45deg, #fbbf24, #fbbf24 2px, #10b981 2px, #10b981 4px)' }}></div>
                <span className="text-slate-600 font-medium">Ofício (Cumprido)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.oficiosCumpridos}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: '#FBBF24' }}></div>
                <span className="text-slate-600 font-medium">Ofício (Pendente)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.oficiosPendentes}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: '#EF4444' }}></div>
                <span className="text-slate-600 font-medium">Ofício (Expirado)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.oficiosExpirados}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: '#94A3B8' }}></div>
                <span className="text-slate-600 font-medium">Ofício (Arquivado)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.oficiosArquivados}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Total de Notificações */}
      <div className="bg-white p-4 md:p-6 rounded-2xl shadow-md border border-slate-200 relative group cursor-help transition-all hover:shadow-lg">
        <p className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Notificações</p>
        <div className="flex items-baseline justify-between">
          <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 font-mono tracking-tighter">{stats.totalNotificacoes}</h3>
          <div className="flex flex-col items-end">
            <span className="text-[9px] md:text-[10px] font-bold text-emerald-600">Concluídas: {stats.notificacoesConcluidas}</span>
            <span className="text-[9px] md:text-[10px] font-bold text-amber-500">Em Aberto: {stats.notificacoesEmAberto}</span>
          </div>
        </div>

        <div className="absolute top-full left-0 mt-2 w-full bg-white text-slate-900 p-4 rounded-xl shadow-2xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-slate-200">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider border-b border-slate-100 pb-2 mb-2 text-slate-400">
              <span>Status da Notificação</span>
              <span>Qtd</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm flex items-center justify-center text-[6px] text-white font-bold" style={{ backgroundColor: '#7B3FE4' }}>!</div>
                <span className="text-slate-600 font-medium">Notif. (Em aberto)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.notificacoesEmAberto}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-[#7B3FE4] shadow-sm flex items-center justify-center text-[6px] text-[#7B3FE4] font-bold" style={{ backgroundColor: '#FFFFFF' }}>✓</div>
                <span className="text-slate-600 font-medium">Notif. (Cumprida)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.notificacoesCumpridas}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#FF9800] shadow-sm">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#7B3FE4] flex items-center justify-center text-[7px] text-white font-black leading-none border border-white/20">!</div>
                </div>
                <span className="text-slate-600 font-medium ml-1">Notif. (Atrasada)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.notificacoesAtrasadas}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm flex items-center justify-center text-[6px] text-white font-bold" style={{ backgroundColor: '#9C8ACF' }}>📁</div>
                <span className="text-slate-600 font-medium">Notif. (Arquivada)</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{stats.notificacoesArquivadas}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
