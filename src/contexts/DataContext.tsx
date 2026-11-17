import React, { createContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { ParecerData, OficioData, FiscalizacaoData, NotificacaoData } from '../types';
import { documentRepository } from '../data';
import { logActivity } from '../lib/audit';

export type AppDocument = 
  | (ParecerData & { tipo_documento: 'Parecer Técnico' | 'Parecer Técnico de ISR' | 'Parecer Técnico de ISE' | 'Parecer Técnico de PSB' | 'Parecer Técnico de PAE' | 'Parecer Técnico de RPSB' | 'Parecer Técnico de Obras' | 'Ofício de Pendências' | '1° Oficio de Pendencias' | '2° Oficio de Pendencias' | 'Oficio Geral' }) 
  | (OficioData & { tipo_documento: 'Parecer Técnico' | 'Parecer Técnico de ISR' | 'Parecer Técnico de ISE' | 'Parecer Técnico de PSB' | 'Parecer Técnico de PAE' | 'Parecer Técnico de RPSB' | 'Parecer Técnico de Obras' | 'Ofício de Pendências' | '1° Oficio de Pendencias' | '2° Oficio de Pendencias' | 'Oficio Geral' })
  | (FiscalizacaoData & { tipo_documento: 'Fiscalização' })
  | (NotificacaoData & { tipo_documento: 'Notificação' });

interface DataContextType {
  pareceres: ParecerData[];
  oficios: OficioData[];
  fiscalizacoes: FiscalizacaoData[];
  notificacoes: NotificacaoData[];
  fiscalizacaoOficios: OficioData[];
  fiscalizacaoPareceres: FiscalizacaoData[];
  documents: AppDocument[];
  loading: boolean;
  refreshData: () => Promise<void>;
  saveParecer: (data: ParecerData) => Promise<{ success: boolean; data?: ParecerData; message?: string }>;
  saveOficio: (data: OficioData) => Promise<{ success: boolean; data?: OficioData; message?: string }>;
  saveNotificacao: (data: NotificacaoData) => Promise<{ success: boolean; data?: NotificacaoData; message?: string }>;
  deleteParecer: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteOficio: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteFiscalizacao: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteNotificacao: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteFiscalizacaoOficio: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteFiscalizacaoParecer: (id: string) => Promise<{ success: boolean; message?: string }>;
}

export const DataContext = createContext<DataContextType>({
  pareceres: [],
  oficios: [],
  fiscalizacoes: [],
  notificacoes: [],
  fiscalizacaoOficios: [],
  fiscalizacaoPareceres: [],
  documents: [],
  loading: true,
  refreshData: async () => {},
  saveParecer: async () => ({ success: false }),
  saveOficio: async () => ({ success: false }),
  saveNotificacao: async () => ({ success: false }),
  deleteParecer: async () => ({ success: false }),
  deleteOficio: async () => ({ success: false }),
  deleteFiscalizacao: async () => ({ success: false }),
  deleteNotificacao: async () => ({ success: false }),
  deleteFiscalizacaoOficio: async () => ({ success: false }),
  deleteFiscalizacaoParecer: async () => ({ success: false }),
});

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pareceres, setPareceres] = useState<ParecerData[]>([]);
  const [oficios, setOficios] = useState<OficioData[]>([]);
  const [fiscalizacoes, setFiscalizacoes] = useState<FiscalizacaoData[]>([]);
  const [fiscalizacaoOficios, setFiscalizacaoOficios] = useState<OficioData[]>([]);
  const [fiscalizacaoPareceres, setFiscalizacaoPareceres] = useState<FiscalizacaoData[]>([]);
  const [notificacoes, setNotificacoes] = useState<NotificacaoData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedPareceres, loadedOficios, loadedNotificacoes, loadedFiscalizacoes] = await Promise.all([
        documentRepository.getPareceres(),
        documentRepository.getOficios(),
        documentRepository.getNotificacoes(),
        documentRepository.getFiscalizacoes(),
      ]);

      setPareceres(loadedPareceres);
      setOficios(loadedOficios);
      setFiscalizacaoOficios(loadedOficios);
      setNotificacoes(loadedNotificacoes);
      setFiscalizacoes(loadedFiscalizacoes);
      setFiscalizacaoPareceres(loadedFiscalizacoes);
    } catch (err) {
      console.warn('Erro ao carregar documentos locais:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const saveParecer = async (data: ParecerData): Promise<{ success: boolean; data?: ParecerData; message?: string }> => {
    try {
      const savedDoc = await documentRepository.saveParecer(data);
      setPareceres(prev => [savedDoc, ...prev.filter(p => p.id !== savedDoc.id)]);
      return { success: true, data: savedDoc };
    } catch (e: any) {
      console.error('Erro ao salvar parecer:', e);
      return { success: false, message: e.message || 'Erro ao salvar parecer' };
    }
  };

  const saveOficio = async (data: OficioData): Promise<{ success: boolean; data?: OficioData; message?: string }> => {
    try {
      const savedDoc = await documentRepository.saveOficio(data);
      setOficios(prev => [savedDoc, ...prev.filter(o => o.id !== savedDoc.id)]);
      setFiscalizacaoOficios(prev => [savedDoc, ...prev.filter(o => o.id !== savedDoc.id)]);
      return { success: true, data: savedDoc };
    } catch (e: any) {
      console.error('Erro ao salvar ofício:', e);
      return { success: false, message: e.message || 'Erro ao salvar ofício' };
    }
  };

  const saveNotificacao = async (data: NotificacaoData): Promise<{ success: boolean; data?: NotificacaoData; message?: string }> => {
    try {
      const savedDoc = await documentRepository.saveNotificacao(data);
      setNotificacoes(prev => [savedDoc, ...prev.filter(n => n.id !== savedDoc.id)]);
      return { success: true, data: savedDoc };
    } catch (e: any) {
      console.error('Erro ao salvar notificação:', e);
      return { success: false, message: e.message || 'Erro ao salvar notificação' };
    }
  };

  const deleteParecer = async (id: string) => {
    try {
      await documentRepository.deleteParecer(id);
      setPareceres(prev => prev.filter(p => p.id !== id));

      logActivity({
        action: 'DELETE_PARECER',
        details: `Parecer ID: ${id} excluído com sucesso.`
      });

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao excluir parecer:', err);
      return { success: false, message: err?.message || 'Erro ao excluir parecer' };
    }
  };

  const deleteOficio = async (id: string) => {
    try {
      await documentRepository.deleteOficio(id);
      setOficios(prev => prev.filter(o => o.id !== id));
      setFiscalizacaoOficios(prev => prev.filter(o => o.id !== id));

      logActivity({
        action: 'DELETE_OFICIO',
        details: `Ofício ID: ${id} excluído com sucesso.`
      });

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao excluir ofício:', err);
      return { success: false, message: err?.message || 'Erro ao excluir ofício' };
    }
  };

  const deleteFiscalizacao = async (id: string) => {
    try {
      await documentRepository.deleteFiscalizacao(id);
      setFiscalizacoes(prev => prev.filter(f => f.id !== id));
      setFiscalizacaoPareceres(prev => prev.filter(f => f.id !== id));

      logActivity({
        action: 'DELETE_FISCALIZACAO',
        details: `Classificação Fiscalização ID: ${id} excluída com sucesso.`
      });

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao excluir fiscalização:', err);
      return { success: false, message: err?.message || 'Erro ao excluir fiscalização' };
    }
  };

  const deleteFiscalizacaoOficio = async (id: string) => {
    return deleteOficio(id);
  };

  const deleteFiscalizacaoParecer = async (id: string) => {
    return deleteFiscalizacao(id);
  };

  const deleteNotificacao = async (id: string) => {
    try {
      await documentRepository.deleteNotificacao(id);
      setNotificacoes(prev => prev.filter(n => n.id !== id));

      logActivity({
        action: 'DELETE_NOTIFICACAO',
        details: `Notificação ID: ${id} excluída com sucesso.`
      });

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao excluir notificação:', err);
      return { success: false, message: err?.message || 'Erro ao excluir notificação' };
    }
  };

  const documents = useMemo(() => {
    const allDocs = [
      ...pareceres.map(p => ({ ...p, tipo_documento: (p.tipo_documento || 'Parecer Técnico') as any })),
      ...oficios.map(o => ({ ...o, tipo_documento: (o.tipo_documento || 'Ofício de Pendências') as any })),
      ...notificacoes.map(n => ({ ...n, tipo_documento: 'Notificação' as const })),
    ];

    return allDocs.sort((a, b) => {
      const dateA = new Date(a.created_at || (a as any).data || (a as any).dataEmissao || 0).getTime();
      const dateB = new Date(b.created_at || (b as any).data || (b as any).dataEmissao || 0).getTime();
      return dateB - dateA;
    }) as AppDocument[];
  }, [pareceres, oficios, notificacoes]);

  return (
    <DataContext.Provider value={{ 
      pareceres, 
      oficios, 
      fiscalizacoes,
      notificacoes,
      fiscalizacaoOficios,
      fiscalizacaoPareceres,
      documents, 
      loading, 
      refreshData: fetchAllData, 
      saveParecer,
      saveOficio,
      saveNotificacao,
      deleteParecer,
      deleteOficio,
      deleteFiscalizacao,
      deleteNotificacao,
      deleteFiscalizacaoOficio,
      deleteFiscalizacaoParecer
    }}>
      {children}
    </DataContext.Provider>
  );
};
