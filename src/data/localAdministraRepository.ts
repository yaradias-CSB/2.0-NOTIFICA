import {
  ArtVinculoCanonico,
  BarragemCanonica,
  CURRENT_SYSTEM_ID,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import {
  AdministraRegistryRepository,
  FormEntitySyncInput,
  FormEntitySyncResult,
  LinkArtRTInput,
} from './types';
import {
  assertSafeId,
  formatCpfCnpj,
  normalizeDocumentNumber,
  safeJsonParse,
  sanitizeObject,
  stripSensitiveFields,
} from '../lib/security';

const ADMINISTRA_STORAGE_KEYS = {
  EMPREENDEDORES: 'administra_barragens_empreendedores',
  BARRAGENS: 'administra_barragens_barragens',
  RTS: 'administra_barragens_rts',
} as const;

export function normalizeSearchText(value?: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeCarCode(value?: string): string {
  if (!value) return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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

function mergeByKey<T extends { id: string; updatedAt?: string }>(
  localItems: T[],
  remoteItems: T[],
  secondaryKeyFn?: (item: T) => string
): T[] {
  const byId = new Map<string, T>();
  const secondaryToLocalId = new Map<string, string>();

  for (const item of localItems) {
    byId.set(item.id, item);
    const secKey = secondaryKeyFn ? secondaryKeyFn(item) : '';
    if (secKey && !secondaryToLocalId.has(secKey)) {
      secondaryToLocalId.set(secKey, item.id);
    }
  }

  for (const item of remoteItems) {
    const secKey = secondaryKeyFn ? secondaryKeyFn(item) : '';
    const existingById = byId.get(item.id);
    if (existingById) {
      const currentTs = new Date(existingById.updatedAt || 0).getTime();
      const nextTs = new Date(item.updatedAt || 0).getTime();
      if (nextTs >= currentTs) {
        byId.set(item.id, { ...existingById, ...item, id: item.id });
      }
      continue;
    }

    const isLocalTempId = (id: string) => /^(emp|bar|rt)_\d+_/i.test(id);
    const matchedLocalId = secKey ? secondaryToLocalId.get(secKey) : undefined;
    if (matchedLocalId && isLocalTempId(matchedLocalId)) {
      const current = byId.get(matchedLocalId)!;
      byId.delete(matchedLocalId);
      byId.set(item.id, { ...current, ...item, id: item.id });
      if (secKey) secondaryToLocalId.delete(secKey);
      continue;
    }

    byId.set(item.id, item);
  }

  return Array.from(byId.values());
}

type BootstrapPayload = {
  remoteEnabled: boolean;
  empreendedores: EmpreendedorCanonico[];
  barragens: BarragemCanonica[];
  responsaveisTecnicos: ResponsavelTecnicoCanonico[];
};

let inflightBootstrap: Promise<BootstrapPayload> | null = null;
let lastBootstrapResult: { ts: number; data: BootstrapPayload } | null = null;

async function fetchRemoteBootstrap(): Promise<BootstrapPayload> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { remoteEnabled: false, empreendedores: [], barragens: [], responsaveisTecnicos: [] };
  }
  if (lastBootstrapResult && Date.now() - lastBootstrapResult.ts < 2000) {
    return lastBootstrapResult.data;
  }
  if (inflightBootstrap) {
    return inflightBootstrap;
  }

  inflightBootstrap = (async () => {
    try {
      const res = await fetch('/api/registry/bootstrap');
      if (!res.ok) {
        return { remoteEnabled: false, empreendedores: [], barragens: [], responsaveisTecnicos: [] };
      }
      const data = await res.json();
      const payload: BootstrapPayload = {
        remoteEnabled: Boolean(data.remoteEnabled),
        empreendedores: Array.isArray(data.empreendedores) ? data.empreendedores : [],
        barragens: Array.isArray(data.barragens) ? data.barragens : [],
        responsaveisTecnicos: Array.isArray(data.responsaveisTecnicos) ? data.responsaveisTecnicos : [],
      };
      lastBootstrapResult = { ts: Date.now(), data: payload };
      return payload;
    } catch {
      return { remoteEnabled: false, empreendedores: [], barragens: [], responsaveisTecnicos: [] };
    } finally {
      inflightBootstrap = null;
    }
  })();

  return inflightBootstrap;
}

async function syncRemoteItem<T>(path: string, item: T): Promise<T> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return item;
  }
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stripSensitiveFields(item)),
    });
    if (!res.ok) return item;
    const data = await res.json();
    if (data?.synced && data?.item) {
      return data.item as T;
    }
  } catch {
    // Fallback to local cache seamlessly
  }
  return item;
}

async function deleteRemoteItem(path: string): Promise<void> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }
  try {
    await fetch(path, { method: 'DELETE' });
  } catch {
    // Ignore network error during remote delete fallback
  }
}

export class LocalAdministraRepository implements AdministraRegistryRepository {
  invalidateCache(): void {
    lastBootstrapResult = null;
  }

  async getEmpreendedores(): Promise<EmpreendedorCanonico[]> {
    const local = readList<EmpreendedorCanonico>(ADMINISTRA_STORAGE_KEYS.EMPREENDEDORES);
    const remote = await fetchRemoteBootstrap();
    const merged =
      remote.remoteEnabled && remote.empreendedores.length > 0
        ? mergeByKey(
            local,
            remote.empreendedores,
            (e) => e.cpfCnpjNormalizado || normalizeSearchText(e.nome)
          )
        : local;

    if (merged !== local && merged.length > 0) {
      writeList(ADMINISTRA_STORAGE_KEYS.EMPREENDEDORES, merged);
    }

    return merged.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }

  async saveEmpreendedor(
    data: Omit<
      EmpreendedorCanonico,
      'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem' | 'cpfCnpjNormalizado'
    > & { id?: string },
    options?: { bypassOwnershipForApprovedRequest?: boolean; allowEditFromForm?: boolean }
  ): Promise<EmpreendedorCanonico> {
    const now = new Date().toISOString();
    const clean = sanitizeObject(stripSensitiveFields(data));
    const current = readList<EmpreendedorCanonico>(ADMINISTRA_STORAGE_KEYS.EMPREENDEDORES);

    const id = clean.id ? assertSafeId(clean.id, 'ID do empreendedor') : generateId('emp');
    const existing = current.find((e) => e.id === id);

    if (
      existing &&
      existing.sourceSystem !== CURRENT_SYSTEM_ID &&
      !options?.bypassOwnershipForApprovedRequest &&
      !options?.allowEditFromForm
    ) {
      throw new Error(
        `Alteração direta bloqueada: empreendedor inserido pelo sistema ${existing.sourceSystem}.`
      );
    }

    const cpfCnpjNorm = normalizeDocumentNumber(clean.cpfCnpj);
    if (cpfCnpjNorm) {
      const duplicate = current.find((e) => e.id !== id && e.cpfCnpjNormalizado === cpfCnpjNorm);
      if (duplicate && !options?.allowEditFromForm) {
        throw new Error(
          `Já existe um empreendedor cadastrado na base do Administra com este CPF/CNPJ (${duplicate.nome}).`
        );
      }
    }

    const savedLocal: EmpreendedorCanonico = {
      ...existing,
      ...clean,
      id,
      cpfCnpj: cpfCnpjNorm ? formatCpfCnpj(cpfCnpjNorm) : clean.cpfCnpj || existing?.cpfCnpj || '',
      cpfCnpjNormalizado: cpfCnpjNorm || existing?.cpfCnpjNormalizado || '',
      tipoPessoa: clean.tipoPessoa || (cpfCnpjNorm.length === 14 ? 'CNPJ' : 'CPF'),
      sourceSystem: existing?.sourceSystem || clean.sourceSystem || CURRENT_SYSTEM_ID,
      registryOwnerSystem: 'ADMINISTRA',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const synced = await syncRemoteItem('/api/registry/empreendedores', savedLocal);
    const updatedList = [synced, ...current.filter((item) => item.id !== id)];
    writeList(ADMINISTRA_STORAGE_KEYS.EMPREENDEDORES, updatedList);
    lastBootstrapResult = null;
    return synced;
  }

  async deleteEmpreendedor(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID do empreendedor');
    const current = await this.getEmpreendedores();
    const existing = current.find((e) => e.id === safeId);
    if (!existing) return;

    if (existing.sourceSystem !== CURRENT_SYSTEM_ID) {
      throw new Error(
        `Exclusão bloqueada: este empreendedor pertence ao sistema ${existing.sourceSystem}.`
      );
    }

    writeList(
      ADMINISTRA_STORAGE_KEYS.EMPREENDEDORES,
      current.filter((e) => e.id !== safeId)
    );
    await deleteRemoteItem(`/api/registry/empreendedores/${encodeURIComponent(safeId)}`);
  }

  async getBarragens(): Promise<BarragemCanonica[]> {
    const local = readList<BarragemCanonica>(ADMINISTRA_STORAGE_KEYS.BARRAGENS);
    const remote = await fetchRemoteBootstrap();
    const merged =
      remote.remoteEnabled && remote.barragens.length > 0
        ? mergeByKey(
            local,
            remote.barragens,
            (b) => normalizeSearchText(b.codigoSnisb) || `${normalizeSearchText(b.nomeBarragem)}_${b.empreendedorId}`
          )
        : local;

    if (merged !== local && merged.length > 0) {
      writeList(ADMINISTRA_STORAGE_KEYS.BARRAGENS, merged);
    }

    return merged.sort((a, b) => (a.nomeBarragem || '').localeCompare(b.nomeBarragem || ''));
  }

  async saveBarragem(
    data: Omit<BarragemCanonica, 'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem'> & {
      id?: string;
    },
    options?: { bypassOwnershipForApprovedRequest?: boolean; allowEditFromForm?: boolean }
  ): Promise<BarragemCanonica> {
    const now = new Date().toISOString();
    const clean = sanitizeObject(stripSensitiveFields(data));
    const current = readList<BarragemCanonica>(ADMINISTRA_STORAGE_KEYS.BARRAGENS);

    const id = clean.id ? assertSafeId(clean.id, 'ID da barragem') : generateId('bar');
    const existing = current.find((b) => b.id === id);

    if (
      existing &&
      existing.sourceSystem !== CURRENT_SYSTEM_ID &&
      !options?.bypassOwnershipForApprovedRequest &&
      !options?.allowEditFromForm
    ) {
      throw new Error(
        `Alteração direta bloqueada: barragem inserida pelo sistema ${existing.sourceSystem}.`
      );
    }

    const snisbNorm = normalizeSearchText(clean.codigoSnisb);
    if (snisbNorm) {
      const duplicateSnisb = current.find(
        (b) => b.id !== id && normalizeSearchText(b.codigoSnisb) === snisbNorm
      );
      if (duplicateSnisb && !options?.allowEditFromForm) {
        throw new Error(
          `Já existe uma barragem cadastrada com este código SNISB (${duplicateSnisb.nomeBarragem}).`
        );
      }
    }

    const savedLocal: BarragemCanonica = {
      ...existing,
      ...clean,
      id,
      uf: clean.uf || existing?.uf || 'MT',
      sourceSystem: existing?.sourceSystem || clean.sourceSystem || CURRENT_SYSTEM_ID,
      registryOwnerSystem: 'ADMINISTRA',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const synced = await syncRemoteItem('/api/registry/barragens', savedLocal);
    writeList(ADMINISTRA_STORAGE_KEYS.BARRAGENS, [
      synced,
      ...current.filter((item) => item.id !== id),
    ]);
    lastBootstrapResult = null;
    return synced;
  }

  async deleteBarragem(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID da barragem');
    const current = await this.getBarragens();
    const existing = current.find((b) => b.id === safeId);
    if (!existing) return;

    if (existing.sourceSystem !== CURRENT_SYSTEM_ID) {
      throw new Error(
        `Exclusão bloqueada: esta barragem pertence ao sistema ${existing.sourceSystem}.`
      );
    }

    writeList(
      ADMINISTRA_STORAGE_KEYS.BARRAGENS,
      current.filter((b) => b.id !== safeId)
    );
    await deleteRemoteItem(`/api/registry/barragens/${encodeURIComponent(safeId)}`);
  }

  async getResponsaveisTecnicos(): Promise<ResponsavelTecnicoCanonico[]> {
    const local = readList<ResponsavelTecnicoCanonico>(ADMINISTRA_STORAGE_KEYS.RTS);
    const remote = await fetchRemoteBootstrap();
    const merged =
      remote.remoteEnabled && remote.responsaveisTecnicos.length > 0
        ? mergeByKey(local, remote.responsaveisTecnicos, (rt) => normalizeSearchText(rt.nome))
        : local;

    if (merged !== local && merged.length > 0) {
      writeList(ADMINISTRA_STORAGE_KEYS.RTS, merged);
    }

    return merged.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }

  async saveResponsavelTecnico(
    data: Omit<
      ResponsavelTecnicoCanonico,
      'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem'
    > & { id?: string },
    options?: { bypassOwnershipForApprovedRequest?: boolean; allowEditFromForm?: boolean }
  ): Promise<ResponsavelTecnicoCanonico> {
    const now = new Date().toISOString();
    const clean = sanitizeObject(stripSensitiveFields(data));
    const current = readList<ResponsavelTecnicoCanonico>(ADMINISTRA_STORAGE_KEYS.RTS);

    const id = clean.id ? assertSafeId(clean.id, 'ID do responsável técnico') : generateId('rt');
    const existing = current.find((rt) => rt.id === id);

    if (
      existing &&
      existing.sourceSystem !== CURRENT_SYSTEM_ID &&
      !options?.bypassOwnershipForApprovedRequest &&
      !options?.allowEditFromForm
    ) {
      throw new Error(
        `Alteração direta bloqueada: responsável técnico inserido pelo sistema ${existing.sourceSystem}.`
      );
    }

    const nameNorm = normalizeSearchText(clean.nome);
    if (nameNorm) {
      const duplicate = current.find((rt) => rt.id !== id && normalizeSearchText(rt.nome) === nameNorm);
      if (duplicate && !options?.allowEditFromForm) {
        throw new Error(`Responsável técnico "${duplicate.nome}" já está cadastrado na base.`);
      }
    }

    const savedLocal: ResponsavelTecnicoCanonico = {
      ...existing,
      ...clean,
      id,
      sourceSystem: existing?.sourceSystem || clean.sourceSystem || CURRENT_SYSTEM_ID,
      registryOwnerSystem: 'ADMINISTRA',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const synced = await syncRemoteItem('/api/registry/rts', savedLocal);
    writeList(ADMINISTRA_STORAGE_KEYS.RTS, [synced, ...current.filter((item) => item.id !== id)]);
    lastBootstrapResult = null;
    return synced;
  }

  async linkArtToRT(input: LinkArtRTInput): Promise<ResponsavelTecnicoCanonico> {
    const now = new Date().toISOString();
    const clean = sanitizeObject(stripSensitiveFields(input));
    const art = String(clean.art || '').trim();
    const rtNome = String(clean.rtNome || '').trim();
    if (!art || !rtNome) {
      throw new Error('Informe o Responsável Técnico e o número da ART.');
    }

    const current = await this.getResponsaveisTecnicos();
    const existing =
      (clean.rtId ? current.find((r) => r.id === clean.rtId) : undefined) ||
      current.find((r) => normalizeSearchText(r.nome) === normalizeSearchText(rtNome));

    const rtId = existing?.id || clean.rtId || generateId('rt');
    const newArtEntry: ArtVinculoCanonico = {
      id: `rt_art_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      art,
      barragemId: clean.barragemId,
      barragemNome: clean.barragemNome,
      empreendedorId: clean.empreendedorId,
      empreendedorNome: clean.empreendedorNome,
      processo: clean.processo,
      situacao: 'ativo',
      createdAt: now,
    };

    const existingArts = Array.isArray(existing?.artsVinculadas) ? existing.artsVinculadas : [];
    const mergedArts = [
      newArtEntry,
      ...existingArts.filter(
        (a) => !(a.art === art && (a.barragemId || '') === (clean.barragemId || ''))
      ),
    ];

    const localRt: ResponsavelTecnicoCanonico = {
      ...(existing || {
        id: rtId,
        nome: rtNome,
        sourceSystem: CURRENT_SYSTEM_ID,
        registryOwnerSystem: 'ADMINISTRA',
        createdAt: now,
        updatedAt: now,
      }),
      id: rtId,
      nome: rtNome,
      registroProfissional: clean.registroProfissional || existing?.registroProfissional,
      formacaoProfissional: clean.formacaoProfissional || existing?.formacaoProfissional,
      cpf: clean.cpf || existing?.cpf,
      art,
      artsVinculadas: mergedArts,
      updatedAt: now,
    };

    const syncedRemote = await syncRemoteItem<ResponsavelTecnicoCanonico>('/api/registry/rts/link-art', {
      rtId,
      rtNome,
      registroProfissional: localRt.registroProfissional,
      formacaoProfissional: localRt.formacaoProfissional,
      cpf: localRt.cpf,
      art,
      barragemId: clean.barragemId,
      barragemNome: clean.barragemNome,
      empreendedorId: clean.empreendedorId,
      empreendedorNome: clean.empreendedorNome,
      processo: clean.processo,
    } as unknown as ResponsavelTecnicoCanonico);

    const finalRt: ResponsavelTecnicoCanonico =
      syncedRemote && (syncedRemote as any).id
        ? {
            ...localRt,
            ...syncedRemote,
            art,
            artsVinculadas: [
              ...(Array.isArray(syncedRemote.artsVinculadas) ? syncedRemote.artsVinculadas : []),
              ...mergedArts.filter(
                (m) =>
                  !(syncedRemote.artsVinculadas || []).some(
                    (s) => s.art === m.art && (s.barragemId || '') === (m.barragemId || '')
                  )
              ),
            ],
          }
        : localRt;

    const latestList = readList<ResponsavelTecnicoCanonico>(ADMINISTRA_STORAGE_KEYS.RTS);
    writeList(ADMINISTRA_STORAGE_KEYS.RTS, [
      finalRt,
      ...latestList.filter((item) => item.id !== finalRt.id && item.id !== rtId),
    ]);
    lastBootstrapResult = null;
    return finalRt;
  }

  async deleteResponsavelTecnico(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID do responsável técnico');
    const current = await this.getResponsaveisTecnicos();
    const existing = current.find((rt) => rt.id === safeId);
    if (!existing) return;

    if (existing.sourceSystem !== CURRENT_SYSTEM_ID) {
      throw new Error(
        `Exclusão bloqueada: este responsável técnico pertence ao sistema ${existing.sourceSystem}.`
      );
    }

    writeList(
      ADMINISTRA_STORAGE_KEYS.RTS,
      current.filter((rt) => rt.id !== safeId)
    );
    await deleteRemoteItem(`/api/registry/responsaveis_tecnicos/${encodeURIComponent(safeId)}`);
  }

  async syncFromFormSubmission(input: FormEntitySyncInput): Promise<FormEntitySyncResult> {
    const clean = sanitizeObject(stripSensitiveFields(input));
    let empreendedorId = clean.existingEmpreendedorId;
    const barragemIds: string[] = [];
    const responsavelTecnicoIds: string[] = [];

    let createdEmpreendedor = false;
    let createdBarragemCount = 0;
    let createdRTCount = 0;

    // Ensure local cache is hydrated with remote records before deduplicating
    const [empreendedores, barragens, rtsList] = await Promise.all([
      this.getEmpreendedores(),
      this.getBarragens(),
      this.getResponsaveisTecnicos(),
    ]);

    // 1. Empreendedor (create or update)
    const cpfCnpjNorm = normalizeDocumentNumber(clean.cpfCnpj || '');
    const empNomeNorm = normalizeSearchText(clean.empreendedorNome);
    const carNorm = normalizeCarCode(clean.carMt);

    let matchedEmp = empreendedorId
      ? empreendedores.find((e) => e.id === empreendedorId)
      : undefined;

    if (!matchedEmp && cpfCnpjNorm) {
      matchedEmp = empreendedores.find((e) => e.cpfCnpjNormalizado === cpfCnpjNorm);
    }
    if (!matchedEmp && carNorm) {
      matchedEmp = empreendedores.find((e) => normalizeCarCode(e.carMt) === carNorm);
    }
    if (!matchedEmp && empNomeNorm && !cpfCnpjNorm) {
      matchedEmp = empreendedores.find((e) => normalizeSearchText(e.nome) === empNomeNorm);
    }

    if (matchedEmp) {
      empreendedorId = matchedEmp.id;
      matchedEmp = await this.saveEmpreendedor(
        {
          ...matchedEmp,
          id: matchedEmp.id,
          nome: clean.empreendedorNome?.trim() || matchedEmp.nome,
          tipoPessoa: clean.tipoPessoa || matchedEmp.tipoPessoa || (cpfCnpjNorm.length === 14 ? 'CNPJ' : 'CPF'),
          cpfCnpj: clean.cpfCnpj?.trim() || matchedEmp.cpfCnpj,
          telefone: clean.telefone?.trim() || matchedEmp.telefone,
          logradouro: clean.logradouro?.trim() || matchedEmp.logradouro,
          numero: clean.numero?.trim() || matchedEmp.numero,
          complemento: clean.complemento?.trim() || matchedEmp.complemento,
          bairro: clean.bairro?.trim() || matchedEmp.bairro,
          municipio: clean.municipio?.trim() || matchedEmp.municipio,
          uf: clean.uf?.trim() || matchedEmp.uf || 'MT',
          cep: clean.cep?.trim() || matchedEmp.cep,
          carMt: clean.carMt?.trim() || matchedEmp.carMt,
          sourceSystem: matchedEmp.sourceSystem || CURRENT_SYSTEM_ID,
          createdByAnalyst: matchedEmp.createdByAnalyst || clean.analista,
        },
        { allowEditFromForm: true }
      );
    } else if (clean.empreendedorNome && clean.empreendedorNome.trim().length > 1) {
      const created = await this.saveEmpreendedor(
        {
          nome: clean.empreendedorNome.trim(),
          tipoPessoa: clean.tipoPessoa || (cpfCnpjNorm.length === 14 ? 'CNPJ' : 'CPF'),
          cpfCnpj: clean.cpfCnpj || '',
          telefone: clean.telefone,
          logradouro: clean.logradouro,
          numero: clean.numero,
          complemento: clean.complemento,
          bairro: clean.bairro,
          municipio: clean.municipio,
          uf: clean.uf || 'MT',
          cep: clean.cep,
          carMt: clean.carMt,
          sourceSystem: CURRENT_SYSTEM_ID,
          createdByAnalyst: clean.analista,
        },
        { allowEditFromForm: true }
      );
      empreendedorId = created.id;
      matchedEmp = created;
      createdEmpreendedor = true;
    }

    // 2. Barragem(ns) — supports single barragem OR multiple barragens (Notificação)
    const barragensQueue =
      Array.isArray(clean.barragens) && clean.barragens.length > 0
        ? clean.barragens
        : [
            {
              existingBarragemId: clean.existingBarragemId,
              nomeBarragem: clean.nomeBarragem || '',
              codigoSnisb: clean.codigoSnisb,
              municipio: clean.municipio,
              usoPreponderante: clean.usoPreponderante,
              tipoBarragem: clean.tipoBarragem,
              coordenadasGMS: clean.coordenadasGMS,
              altura: clean.altura,
              volume: clean.volume,
            },
          ];

    const workingBarragens = [...barragens];

    for (let idx = 0; idx < barragensQueue.length; idx++) {
      const barInput = barragensQueue[idx];
      const snisbNorm = normalizeSearchText(barInput.codigoSnisb);
      const barNomeTrim = (barInput.nomeBarragem || '').trim();
      const barNomeNorm = normalizeSearchText(barNomeTrim);
      const hasCoords = Boolean(
        barInput.coordenadasGMS?.lat?.g ||
          barInput.coordenadasGMS?.long?.g ||
          barInput.coordenadasGMS?.lat?.m ||
          barInput.coordenadasGMS?.long?.m
      );

      if (!barNomeTrim && !snisbNorm && !hasCoords && !barInput.existingBarragemId) {
        continue;
      }

      let matchedBar = barInput.existingBarragemId
        ? workingBarragens.find((b) => b.id === barInput.existingBarragemId)
        : undefined;

      if (!matchedBar && snisbNorm) {
        matchedBar = workingBarragens.find((b) => normalizeSearchText(b.codigoSnisb) === snisbNorm);
      }

      if (!matchedBar && barNomeNorm) {
        matchedBar = workingBarragens.find(
          (b) =>
            normalizeSearchText(b.nomeBarragem) === barNomeNorm &&
            (!empreendedorId || !b.empreendedorId || b.empreendedorId === empreendedorId)
        );
      }

      if (!matchedBar && hasCoords && empreendedorId) {
        matchedBar = workingBarragens.find(
          (b) =>
            b.empreendedorId === empreendedorId &&
            b.coordenadasGMS?.lat?.g === barInput.coordenadasGMS?.lat?.g &&
            b.coordenadasGMS?.lat?.m === barInput.coordenadasGMS?.lat?.m &&
            b.coordenadasGMS?.long?.g === barInput.coordenadasGMS?.long?.g &&
            b.coordenadasGMS?.long?.m === barInput.coordenadasGMS?.long?.m
        );
      }

      const resolvedName =
        barNomeTrim ||
        (clean.nomeBarragem && barragensQueue.length === 1 ? clean.nomeBarragem.trim() : '') ||
        (clean.nomeBarragem ? `${clean.nomeBarragem.trim()} - Barragem ${idx + 1}` : '') ||
        (barInput.codigoSnisb ? `Barragem (${barInput.codigoSnisb})` : '') ||
        `Barragem ${idx + 1}${matchedEmp?.nome ? ` - ${matchedEmp.nome}` : ''}`;

      if (matchedBar) {
        const savedBar = await this.saveBarragem(
          {
            ...matchedBar,
            id: matchedBar.id,
            empreendedorId: empreendedorId || matchedBar.empreendedorId || '',
            empreendedorNome: matchedEmp?.nome || clean.empreendedorNome || matchedBar.empreendedorNome,
            empreendedorCpfCnpj:
              matchedEmp?.cpfCnpj || clean.cpfCnpj || matchedBar.empreendedorCpfCnpj,
            nomeBarragem: barNomeTrim || matchedBar.nomeBarragem,
            codigoSnisb: barInput.codigoSnisb?.trim() || matchedBar.codigoSnisb,
            processoReferencia: clean.processo?.trim() || matchedBar.processoReferencia,
            municipio: barInput.municipio?.trim() || clean.municipio?.trim() || matchedBar.municipio || '',
            uf: clean.uf?.trim() || matchedBar.uf || 'MT',
            cursoAguaBarrado: clean.cursoAguaBarrado?.trim() || matchedBar.cursoAguaBarrado,
            usoPreponderante:
              barInput.usoPreponderante?.trim() ||
              clean.usoPreponderante?.trim() ||
              matchedBar.usoPreponderante,
            situacaoEmpreendimento:
              clean.situacaoEmpreendimento?.trim() || matchedBar.situacaoEmpreendimento,
            tipoBarragem:
              barInput.tipoBarragem?.trim() || clean.tipoBarragem?.trim() || matchedBar.tipoBarragem,
            coordenadasGMS:
              (hasCoords ? barInput.coordenadasGMS : undefined) ||
              clean.coordenadasGMS ||
              matchedBar.coordenadasGMS,
            altura: barInput.altura?.trim() || clean.altura?.trim() || matchedBar.altura,
            volume: barInput.volume?.trim() || clean.volume?.trim() || matchedBar.volume,
            larguraCoroamento: clean.larguraCoroamento?.trim() || matchedBar.larguraCoroamento,
            comprimentoCoroamento:
              clean.comprimentoCoroamento?.trim() || matchedBar.comprimentoCoroamento,
            classificacaoBarragem:
              clean.classificacaoBarragem?.trim() || matchedBar.classificacaoBarragem,
            classificacaoDPA: clean.classificacaoDPA?.trim() || matchedBar.classificacaoDPA,
            classificacaoCRI: clean.classificacaoCRI?.trim() || matchedBar.classificacaoCRI,
            portariaClassificacao:
              clean.portariaClassificacao?.trim() || matchedBar.portariaClassificacao,
            parecerClassificacao:
              clean.parecerClassificacao?.trim() || matchedBar.parecerClassificacao,
            sourceSystem: matchedBar.sourceSystem || CURRENT_SYSTEM_ID,
          },
          { allowEditFromForm: true }
        );
        if (!barragemIds.includes(savedBar.id)) barragemIds.push(savedBar.id);
      } else {
        const createdBar = await this.saveBarragem(
          {
            empreendedorId: empreendedorId || '',
            empreendedorNome: matchedEmp?.nome || clean.empreendedorNome,
            empreendedorCpfCnpj: matchedEmp?.cpfCnpj || clean.cpfCnpj,
            nomeBarragem: resolvedName,
            codigoSnisb: barInput.codigoSnisb,
            processoReferencia: clean.processo,
            municipio: barInput.municipio || clean.municipio || '',
            uf: clean.uf || 'MT',
            cursoAguaBarrado: clean.cursoAguaBarrado,
            usoPreponderante: barInput.usoPreponderante || clean.usoPreponderante,
            situacaoEmpreendimento: clean.situacaoEmpreendimento,
            tipoBarragem: barInput.tipoBarragem || clean.tipoBarragem,
            coordenadasGMS: hasCoords ? barInput.coordenadasGMS : clean.coordenadasGMS,
            altura: barInput.altura || clean.altura,
            volume: barInput.volume || clean.volume,
            larguraCoroamento: clean.larguraCoroamento,
            comprimentoCoroamento: clean.comprimentoCoroamento,
            classificacaoBarragem: clean.classificacaoBarragem,
            classificacaoDPA: clean.classificacaoDPA,
            classificacaoCRI: clean.classificacaoCRI,
            portariaClassificacao: clean.portariaClassificacao,
            parecerClassificacao: clean.parecerClassificacao,
            sourceSystem: CURRENT_SYSTEM_ID,
            createdByAnalyst: clean.analista,
          },
          { allowEditFromForm: true }
        );
        workingBarragens.unshift(createdBar);
        if (!barragemIds.includes(createdBar.id)) barragemIds.push(createdBar.id);
        createdBarragemCount += 1;
      }
    }

    // 3. Responsáveis Técnicos (create or update)
    if (Array.isArray(clean.responsaveisTecnicos) && clean.responsaveisTecnicos.length > 0) {
      let existingRTs = [...rtsList];
      for (const rtInput of clean.responsaveisTecnicos) {
        const rtName = (rtInput.nome || '').trim();
        if (!rtName) continue;
        const rtArt = (rtInput.art || clean.art || '').trim() || undefined;
        const matchedRT = existingRTs.find(
          (r) => normalizeSearchText(r.nome) === normalizeSearchText(rtName)
        );
        if (matchedRT) {
          const updatedRT = await this.saveResponsavelTecnico(
            {
              ...matchedRT,
              id: matchedRT.id,
              nome: rtName,
              registroProfissional:
                rtInput.registroProfissional?.trim() || matchedRT.registroProfissional,
              formacaoProfissional:
                rtInput.formacaoProfissional?.trim() || matchedRT.formacaoProfissional,
              cpf: rtInput.cpf?.trim() || matchedRT.cpf,
              art: rtArt || matchedRT.art,
              sourceSystem: matchedRT.sourceSystem || CURRENT_SYSTEM_ID,
            },
            { allowEditFromForm: true }
          );
          if (!responsavelTecnicoIds.includes(updatedRT.id)) {
            responsavelTecnicoIds.push(updatedRT.id);
          }
        } else {
          const createdRT = await this.saveResponsavelTecnico(
            {
              nome: rtName,
              registroProfissional: rtInput.registroProfissional,
              formacaoProfissional: rtInput.formacaoProfissional,
              cpf: rtInput.cpf,
              art: rtArt,
              sourceSystem: CURRENT_SYSTEM_ID,
              createdByAnalyst: clean.analista,
            },
            { allowEditFromForm: true }
          );
          existingRTs = [createdRT, ...existingRTs];
          responsavelTecnicoIds.push(createdRT.id);
          createdRTCount += 1;
        }
      }
    }

    return {
      empreendedorId,
      barragemId: barragemIds[0] || clean.existingBarragemId,
      barragemIds,
      responsavelTecnicoIds,
      createdEmpreendedor,
      createdBarragem: createdBarragemCount > 0,
      createdBarragemCount,
      createdRTCount,
    };
  }
}
