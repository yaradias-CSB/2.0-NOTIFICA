import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  variant = 'warning',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case 'danger': return <AlertCircle className="text-red-500" size={24} />;
      case 'warning': return <AlertTriangle className="text-amber-500" size={24} />;
      case 'info': return <Info className="text-blue-500" size={24} />;
      default: return <AlertTriangle className="text-amber-500" size={24} />;
    }
  };

  const getButtonClass = () => {
    switch (variant) {
      case 'danger': return 'bg-red-600 hover:bg-red-700';
      case 'warning': return 'bg-amber-600 hover:bg-amber-700';
      case 'info': return 'bg-blue-600 hover:bg-blue-700';
      default: return 'bg-amber-600 hover:bg-amber-700';
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={onCancel}
        />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-full ${variant === 'danger' ? 'bg-red-50' : variant === 'info' ? 'bg-blue-50' : 'bg-amber-50'}`}>
                {getIcon()}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <button 
                onClick={onCancel}
                className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed mb-8">
              {message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold text-sm transition-all shadow-lg ${getButtonClass()}`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ConfirmModal;
