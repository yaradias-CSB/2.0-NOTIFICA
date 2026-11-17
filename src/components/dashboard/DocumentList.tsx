import React from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { AppDocument } from '../../contexts/DataContext';

interface DocumentListProps {
  documents: AppDocument[];
  handleEdit: (item: AppDocument) => void;
  handleDelete: (id: string, item: AppDocument) => void;
}

export const DocumentList = React.memo<DocumentListProps>(({ documents, handleEdit, handleDelete }) => {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <h3 className="text-base md:text-lg font-black text-slate-900 tracking-tight">Listagem de Documentos</h3>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white px-2 py-1 rounded-lg border border-slate-100">
          {documents.length} Itens
        </span>
      </div>
      
      {/* Mobile View: Cards */}
      <div className="md:hidden divide-y divide-slate-100">
        {documents.map((item) => (
          <div key={item.id} className="p-4 space-y-3">
            <div className="flex justify-between items-start">
              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                item.tipo_documento?.startsWith('Parecer') ? 'bg-[#0000CD] text-white' : 
                (item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral') ? 'bg-[#FBBF24] text-white' :
                'bg-[#7B3FE4] text-white'
              }`}>
                {item.tipo_documento?.startsWith('Parecer') ? 'Parecer' : 
                 item.tipo_documento === 'Notificação' ? 'Notificação' : 'Ofício'}
              </span>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(item)} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-lg"><Edit size={14} /></button>
                <button onClick={() => item.id && handleDelete(item.id, item)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Protocolo / Interessado</p>
              <p className="text-sm font-black text-slate-900">{(item as any).processo || (item as any).protocolo}</p>
              <p className="text-xs text-slate-600 line-clamp-1">{(item as any).identificacaoEmpreendedor || (item as any).razaoSocial || (item as any).interessado || (item as any).empreendedorNome}</p>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Analista / Data</p>
                <p className="text-xs font-bold text-slate-700">{(item as any).analistas?.[0] || (item as any).analista || 'S/A'}</p>
                <p className="text-[9px] text-slate-400">{(item.updated_at || item.created_at || item.data) ? new Date(item.updated_at || item.created_at || item.data!).toLocaleDateString('pt-BR') : '-'}</p>
              </div>
              <div>
                {(item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral') ? (
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                    <div className={`w-2 h-2 rounded-full ${
                      (item as any).situacaoCumprimento === 'Pendente / Em aberto' ? 'bg-yellow-400' :
                      (item as any).situacaoCumprimento === 'Cumprido' ? 'bg-emerald-500' :
                      (item as any).situacaoCumprimento === 'Não cumprido no prazo' ? 'bg-red-500' :
                      (item as any).situacaoCumprimento === 'Arquivado' ? 'bg-slate-400' : 'bg-slate-200'
                    }`}></div>
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-tighter">
                      {(item as any).situacaoCumprimento || 'Pendente'}
                    </span>
                  </div>
                ) : (
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                    item.status === 'Concluído' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {documents.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm font-bold italic">
            Nenhum documento encontrado com os filtros aplicados.
          </div>
        )}
      </div>

      {/* Desktop View: Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocolo / Interessado</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Analista</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Data</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {documents.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                    item.tipo_documento?.startsWith('Parecer') ? 'bg-[#0000CD] text-white' : 
                    (item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral') ? 'bg-[#FBBF24] text-white' :
                    'bg-[#7B3FE4] text-white'
                  }`}>
                    {item.tipo_documento?.startsWith('Parecer') ? 'Parecer' : 
                     item.tipo_documento === 'Notificação' ? 'Notificação' : 'Ofício'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-slate-900 tracking-tight">{(item as any).processo || (item as any).protocolo}</span>
                    <span className="text-xs text-slate-500 font-medium line-clamp-1">{(item as any).identificacaoEmpreendedor || (item as any).razaoSocial || (item as any).interessado || (item as any).empreendedorNome}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="text-xs font-bold text-slate-700">{(item as any).analistas?.[0] || (item as any).analista || 'S/A'}</span>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="text-xs font-mono text-slate-500">{(item.updated_at || item.created_at || item.data) ? new Date(item.updated_at || item.created_at || item.data!).toLocaleDateString('pt-BR') : '-'}</span>
                </td>
                <td className="px-6 py-4 text-center">
                  {(item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === '1° Oficio de Pendencias' || item.tipo_documento === '2° Oficio de Pendencias' || item.tipo_documento === 'Oficio Geral') ? (
                    <div className="inline-flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                      <div className={`w-2 h-2 rounded-full ${
                        (item as any).situacaoCumprimento === 'Pendente / Em aberto' ? 'bg-yellow-400' :
                        (item as any).situacaoCumprimento === 'Cumprido' ? 'bg-emerald-500' :
                        (item as any).situacaoCumprimento === 'Não cumprido no prazo' ? 'bg-red-500' :
                        (item as any).situacaoCumprimento === 'Arquivado' ? 'bg-slate-400' : 'bg-slate-200'
                      }`}></div>
                      <span className="text-[9px] font-black uppercase text-slate-500 tracking-tighter">
                        {(item as any).situacaoCumprimento || 'Pendente'}
                      </span>
                    </div>
                  ) : (
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                      item.status === 'Concluído' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.status}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(item)} className="p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-100 rounded-lg shadow-sm transition-all hover:scale-110" title="Editar"><Edit size={14} /></button>
                    <button onClick={() => item.id && handleDelete(item.id, item)} className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-100 rounded-lg shadow-sm transition-all hover:scale-110" title="Excluir"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm font-bold italic">
                  Nenhum documento encontrado com os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
