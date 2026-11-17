import {
  CURRENT_SYSTEM_ID,
  ECOSYSTEM_SYSTEM_LABELS,
  EcosystemSystemConnectionStatus,
  EcosystemSystemId,
} from '../types/ecosystem';
import { authFetch } from '../lib/supabase';

const DEFAULT_SYSTEM_STATUS: Record<EcosystemSystemId, boolean> = {
  ADMINISTRA: false,
  CLASSIFICA: false,
  NOTIFICA: false,
  FISCALIZA: false,
};

export function buildEcosystemConnections(
  remoteMap: Partial<Record<EcosystemSystemId, boolean>> = DEFAULT_SYSTEM_STATUS
): EcosystemSystemConnectionStatus[] {
  return (['ADMINISTRA', 'CLASSIFICA', 'NOTIFICA', 'FISCALIZA'] as EcosystemSystemId[]).map((systemId) => {
    const meta = ECOSYSTEM_SYSTEM_LABELS[systemId];
    return {
      systemId,
      name: meta.name,
      role: meta.role,
      mode: remoteMap[systemId] ? 'remote-configured' : 'local-sandbox',
      isCurrentSystem: systemId === CURRENT_SYSTEM_ID,
      canWriteDirectly: systemId === 'NOTIFICA' || systemId === 'ADMINISTRA',
    };
  });
}

export function getEcosystemConnections(): EcosystemSystemConnectionStatus[] {
  return buildEcosystemConnections(DEFAULT_SYSTEM_STATUS);
}

export async function fetchEcosystemConnections(): Promise<EcosystemSystemConnectionStatus[]> {
  try {
    const response = await authFetch('/api/ecosystem/status');
    if (!response.ok) return getEcosystemConnections();
    const data = (await response.json()) as {
      systems?: Partial<Record<EcosystemSystemId, boolean>>;
    };
    return buildEcosystemConnections(data.systems || DEFAULT_SYSTEM_STATUS);
  } catch {
    return getEcosystemConnections();
  }
}
