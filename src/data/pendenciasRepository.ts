import { authFetch } from '../lib/supabase';
import { assertSafeId } from '../lib/security';
import {
  PendenciaHistoricoRecord,
  PendenciaListResponse,
} from '../types/pendencias';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!UUID_REGEX.test(safeId)) {
      throw new Error('ID da pendência inválido. Informe um UUID válido.');
    }
    const response = await authFetch(`/api/pendencias/${encodeURIComponent(safeId)}/historico`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(
        await parseErrorMessage(response, 'Falha ao carregar histórico da pendência.')
      );
    }
    const payload = (await response.json()) as { items?: PendenciaHistoricoRecord[] };
    return Array.isArray(payload.items) ? payload.items : [];
  },
};
