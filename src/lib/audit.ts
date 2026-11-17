import { auditRepository, AuditLogRecord } from '../data';

export type AuditLog = AuditLogRecord;

export const logActivity = async (params: {
  user_id?: string | null;
  username?: string;
  name?: string | null;
  role?: string | null;
  action: string;
  details: string;
}) => {
  try {
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : 'Server/Unknown';
    const simplifiedAgent = userAgent.replace(/\s+/g, ' ').substring(0, 200);

    await auditRepository.addLog({
      user_id: params.user_id || null,
      username: params.username || 'sistema',
      name: params.name || 'Operação Local',
      role: params.role || null,
      action: params.action,
      details: params.details,
      ip_address: simplifiedAgent,
    });
  } catch (err) {
    console.warn('Erro ao registrar log de auditoria:', err);
  }
};
