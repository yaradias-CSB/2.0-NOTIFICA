import { authFetch } from '../lib/supabase';
import { assertSafeId } from '../lib/security';
import {
  PendenciaCreateInput,
  PendenciaHistoricoRecord,
  PendenciaListResponse,
  PendenciaRecord,
  PendenciaUpdateInput,
} from '../types/pendencias';

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return fallback;
}

export const pendenciasRepository = {
  async list(): Promise<PendenciaListResponse> {
    const response = await authFetch('/api/pendencias', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(await parseErrorMessage(response, 'Falha ao carregar pendências.'));
    }
    return (await response.json()) as PendenciaListResponse;
  },

  async getHistorico(id: string): Promise<PendenciaHistoricoRecord[]> {
    const safeId = assertSafeId(id, 'ID da pendência');
    const response = await authFetch(`/api/pendencias/${encodeURIComponent(safeId)}/historico`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(await parseErrorMessage(response, 'Falha ao carregar histórico da pendência.'));
    }
    const payload = (await response.json()) as { items?: PendenciaHistoricoRecord[] };
    return Array.isArray(payload.items) ? payload.items : [];
  },

  async create(input: PendenciaCreateInput): Promise<PendenciaRecord> {
    const response = await authFetch('/api/pendencias', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(await parseErrorMessage(response, 'Falha ao cadastrar pendência.'));
    }
    const payload = (await response.json()) as { item: PendenciaRecord };
    return payload.item;
  },

  async update(id: string, input: PendenciaUpdateInput): Promise<PendenciaRecord> {
    const safeId = assertSafeId(id, 'ID da pendência');
    const response = await authFetch(`/api/pendencias/${encodeURIComponent(safeId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(await parseErrorMessage(response, 'Falha ao atualizar pendência.'));
    }
    const payload = (await response.json()) as { item: PendenciaRecord };
    return payload.item;
  },
};
