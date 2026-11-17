import {
  BarragemCanonica,
  CURRENT_SYSTEM_ID,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import {
  AdministraRegistryRepository,
  FormEntitySyncInput,
  FormEntitySyncResult,
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
  const secondaryToId = new Map<string, string>();

  const insert = (item: T) => {
    const secKey = secondaryKeyFn ? secondaryKeyFn(item) : '';
    const existingId = byId.has(item.id)
      ? item.id
      : secKey && secondaryToId.has(secKey)
        ? secondaryToId.get(secKey)!
        : item.id;

    const current = byId.get(existingId);
    if (!current) {
      byId.set(existingId, item);
      if (secKey) secondaryToId.set(secKey, existingId);
      return;
    }

    const currentTs = new Date(current.updatedAt || 0).getTime();
    const nextTs = new Date(item.updatedAt || 0).getTime();
    if (nextTs >= currentTs) {
      byId.set(existingId, { ...current, ...item, id: existingId });
      if (secKey) secondaryToId.set(secKey, existingId);
    }
  };

  localItems.forEach(insert);
  remoteItems.forEach(insert);
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

export class LocalAdministraRepository implements AdministraRegistryRepository {
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
    return synced;
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
  }

  async syncFromFormSubmission(input: FormEntitySyncInput): Promise<FormEntitySyncResult> {
    const clean = sanitizeObject(stripSensitiveFields(input));
    let empreendedorId = clean.existingEmpreendedorId;
    let barragemId = clean.existingBarragemId;
    const responsavelTecnicoIds: string[] = [];

    let createdEmpreendedor = false;
    let createdBarragem = false;
    let createdRTCount = 0;

    // 1. Empreendedor
    const empreendedores = readList<EmpreendedorCanonico>(ADMINISTRA_STORAGE_KEYS.EMPREENDEDORES);
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
      // Persist edited fields from form when user edited pre-filled or matched entrepreneur
      const editedEmp = await this.saveEmpreendedor(
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
      matchedEmp = editedEmp;
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

    // 2. Barragem
    const barragens = readList<BarragemCanonica>(ADMINISTRA_STORAGE_KEYS.BARRAGENS);
    const snisbNorm = normalizeSearchText(clean.codigoSnisb);
    const barNomeNorm = normalizeSearchText(clean.nomeBarragem);

    let matchedBarragem = barragemId ? barragens.find((b) => b.id === barragemId) : undefined;
    if (!matchedBarragem && snisbNorm) {
      matchedBarragem = barragens.find((b) => normalizeSearchText(b.codigoSnisb) === snisbNorm);
    }
    if (!matchedBarragem && barNomeNorm) {
      matchedBarragem = barragens.find(
        (b) =>
          normalizeSearchText(b.nomeBarragem) === barNomeNorm &&
          (!empreendedorId || !b.empreendedorId || b.empreendedorId === empreendedorId)
      );
    }

    if (matchedBarragem) {
      barragemId = matchedBarragem.id;
      await this.saveBarragem(
        {
          ...matchedBarragem,
          id: matchedBarragem.id,
          empreendedorId: empreendedorId || matchedBarragem.empreendedorId || '',
          empreendedorNome: matchedEmp?.nome || clean.empreendedorNome || matchedBarragem.empreendedorNome,
          empreendedorCpfCnpj:
            matchedEmp?.cpfCnpj || clean.cpfCnpj || matchedBarragem.empreendedorCpfCnpj,
          nomeBarragem: clean.nomeBarragem?.trim() || matchedBarragem.nomeBarragem,
          codigoSnisb: clean.codigoSnisb?.trim() || matchedBarragem.codigoSnisb,
          processoReferencia: clean.processo?.trim() || matchedBarragem.processoReferencia,
          municipio: clean.municipio?.trim() || matchedBarragem.municipio || '',
          uf: clean.uf?.trim() || matchedBarragem.uf || 'MT',
          cursoAguaBarrado: clean.cursoAguaBarrado?.trim() || matchedBarragem.cursoAguaBarrado,
          usoPreponderante: clean.usoPreponderante?.trim() || matchedBarragem.usoPreponderante,
          situacaoEmpreendimento:
            clean.situacaoEmpreendimento?.trim() || matchedBarragem.situacaoEmpreendimento,
          tipoBarragem: clean.tipoBarragem?.trim() || matchedBarragem.tipoBarragem,
          coordenadasGMS: clean.coordenadasGMS || matchedBarragem.coordenadasGMS,
          altura: clean.altura?.trim() || matchedBarragem.altura,
          volume: clean.volume?.trim() || matchedBarragem.volume,
          larguraCoroamento: clean.larguraCoroamento?.trim() || matchedBarragem.larguraCoroamento,
          comprimentoCoroamento:
            clean.comprimentoCoroamento?.trim() || matchedBarragem.comprimentoCoroamento,
          classificacaoBarragem:
            clean.classificacaoBarragem?.trim() || matchedBarragem.classificacaoBarragem,
          classificacaoDPA: clean.classificacaoDPA?.trim() || matchedBarragem.classificacaoDPA,
          classificacaoCRI: clean.classificacaoCRI?.trim() || matchedBarragem.classificacaoCRI,
          portariaClassificacao:
            clean.portariaClassificacao?.trim() || matchedBarragem.portariaClassificacao,
          parecerClassificacao:
            clean.parecerClassificacao?.trim() || matchedBarragem.parecerClassificacao,
          sourceSystem: matchedBarragem.sourceSystem || CURRENT_SYSTEM_ID,
        },
        { allowEditFromForm: true }
      );
    } else if (
      (clean.nomeBarragem && clean.nomeBarragem.trim().length > 1) ||
      (snisbNorm && snisbNorm.length > 0)
    ) {
      const createdBar = await this.saveBarragem(
        {
          empreendedorId: empreendedorId || '',
          empreendedorNome: matchedEmp?.nome || clean.empreendedorNome,
          empreendedorCpfCnpj: matchedEmp?.cpfCnpj || clean.cpfCnpj,
          nomeBarragem: clean.nomeBarragem || `Barragem (${clean.codigoSnisb})`,
          codigoSnisb: clean.codigoSnisb,
          processoReferencia: clean.processo,
          municipio: clean.municipio || '',
          uf: clean.uf || 'MT',
          cursoAguaBarrado: clean.cursoAguaBarrado,
          usoPreponderante: clean.usoPreponderante,
          situacaoEmpreendimento: clean.situacaoEmpreendimento,
          tipoBarragem: clean.tipoBarragem,
          coordenadasGMS: clean.coordenadasGMS,
          altura: clean.altura,
          volume: clean.volume,
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
      barragemId = createdBar.id;
      createdBarragem = true;
    }

    // 3. Responsáveis Técnicos
    if (Array.isArray(clean.responsaveisTecnicos) && clean.responsaveisTecnicos.length > 0) {
      let existingRTs = readList<ResponsavelTecnicoCanonico>(ADMINISTRA_STORAGE_KEYS.RTS);
      for (const rtInput of clean.responsaveisTecnicos) {
        const rtName = (rtInput.nome || '').trim();
        if (!rtName) continue;
        const matchedRT = existingRTs.find(
          (r) => normalizeSearchText(r.nome) === normalizeSearchText(rtName)
        );
        if (matchedRT) {
          responsavelTecnicoIds.push(matchedRT.id);
        } else {
          const createdRT = await this.saveResponsavelTecnico(
            {
              nome: rtName,
              registroProfissional: rtInput.registroProfissional,
              formacaoProfissional: rtInput.formacaoProfissional,
              cpf: rtInput.cpf,
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
      barragemId,
      responsavelTecnicoIds,
      createdEmpreendedor,
      createdBarragem,
      createdRTCount,
    };
  }
}
