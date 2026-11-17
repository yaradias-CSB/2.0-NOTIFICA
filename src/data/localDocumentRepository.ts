import { ParecerData, OficioData, NotificacaoData, FiscalizacaoData } from '../types';
import { CURRENT_SYSTEM_ID } from '../types/ecosystem';
import { DocumentRepository } from './types';
import { assertSafeId, safeJsonParse, sanitizeObject, stripSensitiveFields } from '../lib/security';

const STORAGE_KEYS = {
  PARECERES: 'notifica_csb_pareceres',
  OFICIOS: 'notifica_csb_oficios',
  NOTIFICACOES: 'notifica_csb_notificacoes',
  FISCALIZACOES: 'notifica_csb_fiscalizacoes',
  LEGACY_PARECERES: 'sema_mt_pareceres',
  LEGACY_OFICIOS: 'sema_mt_oficios',
  LEGACY_NOTIFICACOES: 'sema_mt_notificacoes',
  LEGACY_FISCALIZACOES: 'sema_mt_fiscalizacoes',
} as const;

function readCollection<T>(primaryKey: string, legacyKey?: string): T[] {
  try {
    const raw = localStorage.getItem(primaryKey);
    const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : null;
    const primary = raw ? safeJsonParse<unknown[]>(raw, []) : [];
    const legacy = legacyRaw ? safeJsonParse<unknown[]>(legacyRaw, []) : [];
    const listPrimary = Array.isArray(primary) ? (primary as T[]) : [];
    const listLegacy = Array.isArray(legacy) ? (legacy as T[]) : [];
    if (listLegacy.length === 0) return listPrimary;
    if (listPrimary.length === 0) return listLegacy;

    const seen = new Set(listPrimary.map((item: any) => item?.id).filter(Boolean));
    return [...listPrimary, ...listLegacy.filter((item: any) => !item?.id || !seen.has(item.id))];
  } catch (err) {
    console.warn(`Erro ao ler ${primaryKey} do armazenamento local:`, err);
  }
  return [];
}

function writeCollection<T>(primaryKey: string, items: T[]): void {
  try {
    const cleaned = items.map((item) => stripSensitiveFields(item));
    localStorage.setItem(primaryKey, JSON.stringify(cleaned));
  } catch (err) {
    console.warn(`Erro ao salvar ${primaryKey} no armazenamento local:`, err);
  }
}

async function fetchRemoteCollection<T extends { id?: string }>(kind: 'pareceres' | 'oficios' | 'notificacoes'): Promise<T[]> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return [];
  }
  try {
    const res = await fetch(`/api/documents/${kind}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? (data.items as T[]) : [];
  } catch {
    return [];
  }
}

async function syncRemoteDocument<T>(kind: 'pareceres' | 'oficios' | 'notificacoes', doc: T): Promise<void> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }
  try {
    await fetch(`/api/documents/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stripSensitiveFields(doc)),
    });
  } catch {
    // Offline or local-only cache fallback
  }
}

function mergeDocs<T extends { id?: string; updated_at?: string }>(local: T[], remote: T[]): T[] {
  if (remote.length === 0) return local;
  const map = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const prevTs = new Date(prev.updated_at || 0).getTime();
    const nextTs = new Date(item.updated_at || 0).getTime();
    if (nextTs >= prevTs) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export class LocalDocumentRepository implements DocumentRepository {
  async getPareceres(): Promise<ParecerData[]> {
    const local = readCollection<ParecerData>(STORAGE_KEYS.PARECERES, STORAGE_KEYS.LEGACY_PARECERES);
    const remote = await fetchRemoteCollection<ParecerData>('pareceres');
    return mergeDocs(local, remote);
  }

  async saveParecer(data: ParecerData): Promise<ParecerData> {
    const now = new Date().toISOString();
    const cleanData = sanitizeObject(stripSensitiveFields(data));
    const id = cleanData.id
      ? assertSafeId(cleanData.id, 'ID do parecer')
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `parecer_${Date.now()}`;

    const current = readCollection<ParecerData>(STORAGE_KEYS.PARECERES, STORAGE_KEYS.LEGACY_PARECERES);
    const existing = current.find((item) => item.id === id);

    const savedDoc: ParecerData = {
      ...cleanData,
      id,
      sourceSystem: CURRENT_SYSTEM_ID,
      created_at: existing?.created_at || cleanData.created_at || now,
      updated_at: now,
    };

    const updated = [savedDoc, ...current.filter((item) => item.id !== id)];
    writeCollection(STORAGE_KEYS.PARECERES, updated);
    void syncRemoteDocument('pareceres', savedDoc);
    return savedDoc;
  }

  async deleteParecer(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID do parecer');
    const current = readCollection<ParecerData>(STORAGE_KEYS.PARECERES, STORAGE_KEYS.LEGACY_PARECERES);
    const updated = current.filter((item) => item.id !== safeId);
    writeCollection(STORAGE_KEYS.PARECERES, updated);
  }

  async getOficios(): Promise<OficioData[]> {
    const local = readCollection<OficioData>(STORAGE_KEYS.OFICIOS, STORAGE_KEYS.LEGACY_OFICIOS);
    const remote = await fetchRemoteCollection<OficioData>('oficios');
    return mergeDocs(local, remote);
  }

  async saveOficio(data: OficioData): Promise<OficioData> {
    const now = new Date().toISOString();
    const cleanData = sanitizeObject(stripSensitiveFields(data));
    const id = cleanData.id
      ? assertSafeId(cleanData.id, 'ID do ofício')
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `oficio_${Date.now()}`;

    const current = readCollection<OficioData>(STORAGE_KEYS.OFICIOS, STORAGE_KEYS.LEGACY_OFICIOS);
    const existing = current.find((item) => item.id === id);

    const savedDoc: OficioData = {
      ...cleanData,
      id,
      sourceSystem: CURRENT_SYSTEM_ID,
      created_at: existing?.created_at || cleanData.created_at || now,
      updated_at: now,
    };

    const updated = [savedDoc, ...current.filter((item) => item.id !== id)];
    writeCollection(STORAGE_KEYS.OFICIOS, updated);
    void syncRemoteDocument('oficios', savedDoc);
    return savedDoc;
  }

  async deleteOficio(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID do ofício');
    const current = readCollection<OficioData>(STORAGE_KEYS.OFICIOS, STORAGE_KEYS.LEGACY_OFICIOS);
    const updated = current.filter((item) => item.id !== safeId);
    writeCollection(STORAGE_KEYS.OFICIOS, updated);
  }

  async getNotificacoes(): Promise<NotificacaoData[]> {
    const local = readCollection<NotificacaoData>(STORAGE_KEYS.NOTIFICACOES, STORAGE_KEYS.LEGACY_NOTIFICACOES);
    const remote = await fetchRemoteCollection<NotificacaoData>('notificacoes');
    return mergeDocs(local, remote);
  }

  async saveNotificacao(data: NotificacaoData): Promise<NotificacaoData> {
    const now = new Date().toISOString();
    const cleanData = sanitizeObject(stripSensitiveFields(data));
    const id = cleanData.id
      ? assertSafeId(cleanData.id, 'ID da notificação')
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `notif_${Date.now()}`;

    const current = readCollection<NotificacaoData>(STORAGE_KEYS.NOTIFICACOES, STORAGE_KEYS.LEGACY_NOTIFICACOES);
    const existing = current.find((item) => item.id === id);

    const savedDoc: NotificacaoData = {
      ...cleanData,
      id,
      sourceSystem: CURRENT_SYSTEM_ID,
      created_at: existing?.created_at || cleanData.created_at || now,
      updated_at: now,
    };

    const updated = [savedDoc, ...current.filter((item) => item.id !== id)];
    writeCollection(STORAGE_KEYS.NOTIFICACOES, updated);
    void syncRemoteDocument('notificacoes', savedDoc);
    return savedDoc;
  }

  async deleteNotificacao(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID da notificação');
    const current = readCollection<NotificacaoData>(STORAGE_KEYS.NOTIFICACOES, STORAGE_KEYS.LEGACY_NOTIFICACOES);
    const updated = current.filter((item) => item.id !== safeId);
    writeCollection(STORAGE_KEYS.NOTIFICACOES, updated);
  }

  async getFiscalizacoes(): Promise<FiscalizacaoData[]> {
    return readCollection<FiscalizacaoData>(STORAGE_KEYS.FISCALIZACOES, STORAGE_KEYS.LEGACY_FISCALIZACOES);
  }

  async deleteFiscalizacao(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID da fiscalização');
    const current = readCollection<FiscalizacaoData>(STORAGE_KEYS.FISCALIZACOES, STORAGE_KEYS.LEGACY_FISCALIZACOES);
    const updated = current.filter((item) => item.id !== safeId);
    writeCollection(STORAGE_KEYS.FISCALIZACOES, updated);
  }
}
