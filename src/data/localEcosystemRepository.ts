import {
  ChangeRequest,
  ChangeRequestTargetType,
  CURRENT_SYSTEM_ID,
  EcosystemProductSummary,
  EcosystemSystemId,
} from '../types/ecosystem';
import { AdministraRegistryRepository, EcosystemFederationRepository } from './types';
import {
  assertSafeId,
  normalizeDocumentNumber,
  safeJsonParse,
  sanitizeObject,
  stripSensitiveFields,
} from '../lib/security';

const ECOSYSTEM_STORAGE_KEYS = {
  CHANGE_REQUESTS: 'notifica_csb_change_requests',
  EXTERNAL_CLASSIFICA_PRODUCTS: 'ecosystem_classifica_products',
  EXTERNAL_FISCALIZA_PRODUCTS: 'ecosystem_fiscaliza_products',
  EXTERNAL_ADMINISTRA_PRODUCTS: 'ecosystem_administra_products',
} as const;

function normalizeText(value?: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = safeJsonParse<unknown[]>(raw, []);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    console.warn(`Erro ao ler ${key}:`, err);
    return [];
  }
}

function writeList<T>(key: string, items: T[]): void {
  try {
    const cleaned = items.map((item) => stripSensitiveFields(item));
    localStorage.setItem(key, JSON.stringify(cleaned));
  } catch (err) {
    console.warn(`Erro ao salvar ${key}:`, err);
  }
}

export class LocalEcosystemRepository implements EcosystemFederationRepository {
  constructor(private readonly administraRepo: AdministraRegistryRepository) {}

  async getChangeRequests(): Promise<ChangeRequest[]> {
    return readList<ChangeRequest>(ECOSYSTEM_STORAGE_KEYS.CHANGE_REQUESTS).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createChangeRequest(input: {
    targetType: ChangeRequestTargetType;
    targetId: string;
    targetLabel: string;
    targetOwnerSystem: EcosystemSystemId;
    requestedByName: string;
    justification: string;
    currentSnapshot: Record<string, unknown>;
    proposedChanges: Record<string, unknown>;
  }): Promise<ChangeRequest> {
    const clean = sanitizeObject(stripSensitiveFields(input));
    const safeTargetId = assertSafeId(clean.targetId, 'ID do registro');
    const justification = (clean.justification || '').trim();
    if (!justification || justification.length < 5) {
      throw new Error('Informe uma justificativa técnica com ao menos 5 caracteres.');
    }

    const proposedKeys = Object.keys(clean.proposedChanges || {}).filter((k) => {
      const val = clean.proposedChanges[k];
      return val !== undefined && val !== clean.currentSnapshot?.[k];
    });
    if (proposedKeys.length === 0) {
      throw new Error('Nenhuma alteração efetiva foi proposta.');
    }

    const filteredProposed: Record<string, unknown> = {};
    proposedKeys.forEach((k) => {
      filteredProposed[k] = clean.proposedChanges[k];
    });

    const now = new Date().toISOString();
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const request: ChangeRequest = {
      id,
      targetType: clean.targetType,
      targetId: safeTargetId,
      targetLabel: clean.targetLabel || safeTargetId,
      requestingSystem: CURRENT_SYSTEM_ID,
      targetOwnerSystem: clean.targetOwnerSystem,
      requestedByName: clean.requestedByName || 'Analista Notifica CSB',
      justification,
      currentSnapshot: clean.currentSnapshot || {},
      proposedChanges: filteredProposed,
      status: 'PENDENTE',
      createdAt: now,
      updatedAt: now,
    };

    const current = await this.getChangeRequests();
    writeList(ECOSYSTEM_STORAGE_KEYS.CHANGE_REQUESTS, [request, ...current]);
    return request;
  }

  async reviewChangeRequest(
    id: string,
    decision: 'APROVADA' | 'REPROVADA',
    reviewerName: string,
    reviewNotes?: string
  ): Promise<ChangeRequest> {
    const safeId = assertSafeId(id, 'ID da solicitação');
    const requests = await this.getChangeRequests();
    const targetReq = requests.find((r) => r.id === safeId);
    if (!targetReq) {
      throw new Error('Solicitação de alteração não encontrada.');
    }
    if (targetReq.status !== 'PENDENTE') {
      throw new Error('Esta solicitação já foi analisada.');
    }
    if (targetReq.targetOwnerSystem !== CURRENT_SYSTEM_ID) {
      throw new Error(
        `Apenas um analista ou administrador do sistema de origem (${targetReq.targetOwnerSystem}) pode aprovar ou reprovar esta solicitação.`
      );
    }

    if (decision === 'APROVADA') {
      await this.applyApprovedChanges(targetReq);
    }

    const now = new Date().toISOString();
    const updatedReq: ChangeRequest = {
      ...targetReq,
      status: decision,
      reviewedByName: sanitizeObject(reviewerName) || 'Analista Notifica CSB',
      reviewNotes: reviewNotes ? sanitizeObject(reviewNotes) : undefined,
      reviewedAt: now,
      updatedAt: now,
    };

    writeList(
      ECOSYSTEM_STORAGE_KEYS.CHANGE_REQUESTS,
      requests.map((r) => (r.id === safeId ? updatedReq : r))
    );
    return updatedReq;
  }

  private async applyApprovedChanges(request: ChangeRequest): Promise<void> {
    const patch = sanitizeObject(stripSensitiveFields(request.proposedChanges));
    if (request.targetType === 'EMPREENDEDOR') {
      const list = await this.administraRepo.getEmpreendedores();
      const existing = list.find((e) => e.id === request.targetId);
      if (!existing) throw new Error('Empreendedor de destino não encontrado.');
      await this.administraRepo.saveEmpreendedor(
        {
          ...existing,
          ...patch,
          id: existing.id,
        },
        { bypassOwnershipForApprovedRequest: true }
      );
    } else if (request.targetType === 'BARRAGEM') {
      const list = await this.administraRepo.getBarragens();
      const existing = list.find((b) => b.id === request.targetId);
      if (!existing) throw new Error('Barragem de destino não encontrada.');
      await this.administraRepo.saveBarragem(
        {
          ...existing,
          ...patch,
          id: existing.id,
        },
        { bypassOwnershipForApprovedRequest: true }
      );
    } else if (request.targetType === 'RESPONSAVEL_TECNICO') {
      const list = await this.administraRepo.getResponsaveisTecnicos();
      const existing = list.find((rt) => rt.id === request.targetId);
      if (!existing) throw new Error('Responsável Técnico de destino não encontrado.');
      await this.administraRepo.saveResponsavelTecnico(
        {
          ...existing,
          ...patch,
          id: existing.id,
        },
        { bypassOwnershipForApprovedRequest: true }
      );
    }
  }

  async getExternalProducts(): Promise<EcosystemProductSummary[]> {
    const classifica = readList<EcosystemProductSummary>(
      ECOSYSTEM_STORAGE_KEYS.EXTERNAL_CLASSIFICA_PRODUCTS
    ).map((p) => ({ ...p, systemId: 'CLASSIFICA' as const, readonly: true }));

    const fiscaliza = readList<EcosystemProductSummary>(
      ECOSYSTEM_STORAGE_KEYS.EXTERNAL_FISCALIZA_PRODUCTS
    ).map((p) => ({ ...p, systemId: 'FISCALIZA' as const, readonly: true }));

    const administra = readList<EcosystemProductSummary>(
      ECOSYSTEM_STORAGE_KEYS.EXTERNAL_ADMINISTRA_PRODUCTS
    ).map((p) => ({ ...p, systemId: 'ADMINISTRA' as const, readonly: true }));

    return [...classifica, ...fiscaliza, ...administra];
  }

  async findProductsByEntity(
    localProducts: EcosystemProductSummary[],
    criteria: {
      empreendedorId?: string;
      cpfCnpj?: string;
      barragemId?: string;
      codigoSnisb?: string;
      nomeBarragem?: string;
    }
  ): Promise<EcosystemProductSummary[]> {
    const external = await this.getExternalProducts();
    const all = [...localProducts, ...external];

    const cpfNorm = normalizeDocumentNumber(criteria.cpfCnpj || '');
    const snisbNorm = normalizeText(criteria.codigoSnisb);
    const barNorm = normalizeText(criteria.nomeBarragem);

    if (
      !criteria.empreendedorId &&
      !cpfNorm &&
      !criteria.barragemId &&
      !snisbNorm &&
      !barNorm
    ) {
      return [];
    }

    return all.filter((item) => {
      if (criteria.empreendedorId && item.empreendedorId === criteria.empreendedorId) return true;
      if (criteria.barragemId && item.barragemId === criteria.barragemId) return true;
      if (cpfNorm && normalizeDocumentNumber(item.empreendedorCpfCnpj || '') === cpfNorm) return true;
      if (snisbNorm && normalizeText(item.codigoSnisb) === snisbNorm) return true;
      if (barNorm && normalizeText(item.barragemNome) === barNorm) return true;
      return false;
    });
  }
}
