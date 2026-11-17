import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { DataContext } from './DataContext';

interface NotificationContextType {
  pendingCount: number;
  importantUpdate: boolean;
  setImportantUpdate: (val: boolean) => void;
  refreshPendingCount: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  pendingCount: 0,
  importantUpdate: false,
  setImportantUpdate: () => {},
  refreshPendingCount: () => {},
});

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [importantUpdate, setImportantUpdate] = useState(false);
  const { documents } = useContext(DataContext);

  const refreshPendingCount = () => {
    if (!documents) {
      console.log('NotificationProvider: No documents available');
      setPendingCount(0);
      return;
    }
    
    const pendingItems = documents.filter((item: any) => 
      item.tipo_documento === 'Notificação' && 
      (item.status === 'Rascunho' || item.status === 'Pendente')
    );
    
    console.log('NotificationProvider: refreshPendingCount', {
      totalDocuments: documents.length,
      pendingNotificacoes: pendingItems.length
    });
    
    if (pendingItems.length > 0) {
      console.log('NotificationProvider: Pending items sample:', pendingItems.slice(0, 2).map(i => ({ id: i.id, status: i.status, tipo: i.tipo_documento })));
    }
    
    setPendingCount(pendingItems.length);
  };

  useEffect(() => {
    console.log('NotificationProvider: documents changed, length:', documents?.length);
    refreshPendingCount();
  }, [documents]);

  return (
    <NotificationContext.Provider value={{ pendingCount, importantUpdate, setImportantUpdate, refreshPendingCount }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
