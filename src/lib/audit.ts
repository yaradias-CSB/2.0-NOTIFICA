import { auditRepository, AuditLogRecord } from '../data';
import { getActiveAuthUser } from './supabase';

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
    const activeUser = getActiveAuthUser();
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : 'Server/Unknown';
    const simplifiedAgent = userAgent.replace(/\s+/g, ' ').substring(0, 200);

    await auditRepository.addLog({
      user_id: params.user_id ?? activeUser?.id ?? null,
      username: params.username || activeUser?.email || '',
      name: params.name || activeUser?.name || activeUser?.email || '',
      role: params.role ?? activeUser?.role ?? null,
      action: params.action,
      details: params.details,
      ip_address: simplifiedAgent,
    });
  } catch (err) {
    console.warn('Erro ao registrar log de auditoria:', err);
  }
};
