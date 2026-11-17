import { AuditLogRecord, AuditRepository } from './types';
import { safeJsonParse, sanitizeObject, stripSensitiveFields } from '../lib/security';

const AUDIT_STORAGE_KEY = 'notifica_csb_audit_logs';
const LEGACY_AUDIT_KEY = 'sema_mt_local_audit_logs';
const MAX_LOCAL_LOGS = 200;

export class LocalAuditRepository implements AuditRepository {
  async getLogs(): Promise<AuditLogRecord[]> {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY) || localStorage.getItem(LEGACY_AUDIT_KEY);
      const parsed = safeJsonParse<unknown[]>(raw, []);
      return Array.isArray(parsed) ? (parsed as AuditLogRecord[]) : [];
    } catch (err) {
      console.warn('Erro ao ler logs de auditoria locais:', err);
      return [];
    }
  }

  async addLog(entry: Omit<AuditLogRecord, 'id' | 'created_at'>): Promise<AuditLogRecord> {
    const sanitizedEntry = sanitizeObject(stripSensitiveFields(entry));
    const newLog: AuditLogRecord = {
      ...sanitizedEntry,
      id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
    };

    try {
      const existing = await this.getLogs();
      const updated = [newLog, ...existing].slice(0, MAX_LOCAL_LOGS);
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('Erro ao salvar log de auditoria local:', err);
    }

    return newLog;
  }

  async clearLogs(): Promise<void> {
    try {
      localStorage.removeItem(AUDIT_STORAGE_KEY);
      localStorage.removeItem(LEGACY_AUDIT_KEY);
    } catch (err) {
      console.warn('Erro ao limpar logs de auditoria locais:', err);
    }
  }
}
