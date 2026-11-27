export type BarragemRelationshipState =
  | 'OFFICIAL_ADMINISTRA'
  | 'PENDING_REVIEW'
  | 'UNLINKED';

export interface BarragemSearchable {
  id: string;
  empreendedorId?: string;
  empreendedorNome?: string;
  empreendedorCpfCnpj?: string;
  nomeBarragem?: string;
  nome?: string;
  empreendimento?: string;
  car?: string;
  carMt?: string;
  codigoSnisb?: string;
  snisb?: string;
  processoReferencia?: string;
  municipio?: string;
  cursoAguaBarrado?: string;
  coordenadasGMS?: {
    lat?: { g?: string; m?: string; s?: string };
    long?: { g?: string; m?: string; s?: string };
  };
  lat?: string;
  long?: string;
}

export interface BarragemRelationshipDescriptor {
  state: BarragemRelationshipState;
  label:
    | 'Administra — vínculo oficial'
    | 'vínculo pendente de revisão'
    | 'sem vínculo';
  hasCoordinates: boolean;
  coordinatesLabel: 'coordenadas disponíveis' | 'coordenadas indisponíveis';
}

export function normalizeLookupText(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCompactToken(value?: string | null): string {
  if (!value) return '';
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeDigitsOnly(value?: string | null): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

export function hasBarragemCoordinates(barragem?: Partial<BarragemSearchable> | null): boolean {
  if (!barragem) return false;
  const gms = barragem.coordenadasGMS;
  const hasGms = Boolean(
    gms &&
      (gms.lat?.g || gms.lat?.m || gms.lat?.s) &&
      (gms.long?.g || gms.long?.m || gms.long?.s)
  );
  const hasStrings = Boolean(String(barragem.lat || '').trim() && String(barragem.long || '').trim());
  return hasGms || hasStrings;
}

export function describeBarragemRelationship(
  barragem?: Partial<BarragemSearchable> | null,
  options?: {
    selectedEmpreendedorId?: string;
    isAdministraRecord?: boolean;
  }
): BarragemRelationshipDescriptor {
  const hasCoords = hasBarragemCoordinates(barragem);
  const coordinatesLabel = hasCoords ? 'coordenadas disponíveis' : 'coordenadas indisponíveis';

  const id = String(barragem?.id || '').trim();
  const isAdministra = options?.isAdministraRecord ?? Boolean(id && !/^(emp|bar|rt)_\d+_/i.test(id));
  const empId = String(barragem?.empreendedorId || '').trim();
  const selectedEmpId = String(options?.selectedEmpreendedorId || '').trim();

  if (!id || !isAdministra) {
    return {
      state: 'UNLINKED',
      label: 'sem vínculo',
      hasCoordinates: hasCoords,
      coordinatesLabel,
    };
  }

  if (selectedEmpId) {
    if (empId === selectedEmpId) {
      return {
        state: 'OFFICIAL_ADMINISTRA',
        label: 'Administra — vínculo oficial',
        hasCoordinates: hasCoords,
        coordinatesLabel,
      };
    }
    return {
      state: 'PENDING_REVIEW',
      label: 'vínculo pendente de revisão',
      hasCoordinates: hasCoords,
      coordinatesLabel,
    };
  }

  if (empId) {
    return {
      state: 'OFFICIAL_ADMINISTRA',
      label: 'Administra — vínculo oficial',
      hasCoordinates: hasCoords,
      coordinatesLabel,
    };
  }

  return {
    state: 'PENDING_REVIEW',
    label: 'vínculo pendente de revisão',
    hasCoordinates: hasCoords,
    coordinatesLabel,
  };
}

export function sortBarragensOfficialFirst<T extends BarragemSearchable>(
  barragens: T[],
  selectedEmpreendedorId?: string
): T[] {
  const cleanEmpId = String(selectedEmpreendedorId || '').trim();
  return [...barragens].sort((a, b) => {
    if (cleanEmpId) {
      const aOfficial = a.empreendedorId === cleanEmpId ? 0 : !a.empreendedorId ? 1 : 2;
      const bOfficial = b.empreendedorId === cleanEmpId ? 0 : !b.empreendedorId ? 1 : 2;
      if (aOfficial !== bOfficial) return aOfficial - bOfficial;
    } else {
      const aHasEmp = a.empreendedorId ? 0 : 1;
      const bHasEmp = b.empreendedorId ? 0 : 1;
      if (aHasEmp !== bHasEmp) return aHasEmp - bHasEmp;
    }
    const aName = normalizeLookupText(a.nomeBarragem || a.nome || a.empreendimento || a.id);
    const bName = normalizeLookupText(b.nomeBarragem || b.nome || b.empreendimento || b.id);
    return aName.localeCompare(bName, 'pt-BR');
  });
}

export function searchBarragens<T extends BarragemSearchable>(
  barragens: T[],
  options?: {
    query?: string;
    empreendedorId?: string;
    includeUnlinked?: boolean;
    empreendedores?: Array<{ id: string; nome?: string; carMt?: string }>;
  }
): T[] {
  const empId = String(options?.empreendedorId || '').trim();
  const includeUnlinked = options?.includeUnlinked !== false;
  const rawQuery = String(options?.query || '').trim();
  const textQ = normalizeLookupText(rawQuery);
  const compactQ = normalizeCompactToken(rawQuery);
  const digitsQ = normalizeDigitsOnly(rawQuery);

  const empMap = new Map(
    (options?.empreendedores || []).map((e) => [e.id, e])
  );

  const filtered = barragens.filter((b) => {
    if (empId) {
      const matchesEmp = b.empreendedorId === empId;
      const isUnlinked = !b.empreendedorId;
      if (!matchesEmp && !(includeUnlinked && isUnlinked)) {
        return false;
      }
    }

    if (!textQ) return true;

    const linkedEmp = b.empreendedorId ? empMap.get(b.empreendedorId) : undefined;
    const textFields = [
      b.id,
      b.nomeBarragem,
      b.nome,
      b.empreendimento,
      b.codigoSnisb,
      b.snisb,
      b.car,
      b.carMt,
      b.municipio,
      b.processoReferencia,
      b.cursoAguaBarrado,
      b.empreendedorId,
      b.empreendedorNome,
      linkedEmp?.nome,
      linkedEmp?.carMt,
    ];

    if (textFields.some((field) => normalizeLookupText(field).includes(textQ))) {
      return true;
    }

    if (compactQ.length >= 3) {
      const compactFields = [b.car, b.carMt, b.codigoSnisb, b.snisb, b.id, linkedEmp?.carMt];
      if (compactFields.some((field) => normalizeCompactToken(field).includes(compactQ))) {
        return true;
      }
    }

    if (digitsQ.length >= 2) {
      if (normalizeDigitsOnly(b.empreendedorCpfCnpj).includes(digitsQ)) {
        return true;
      }
    }

    return false;
  });

  return sortBarragensOfficialFirst(filtered, empId || undefined);
}

export interface PaginatedSlice<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export function paginateItems<T>(
  allItems: T[],
  requestedPage = 1,
  requestedPageSize = 25
): PaginatedSlice<T> {
  const total = allItems.length;
  const pageSize = Math.max(1, Math.min(500, Math.trunc(requestedPageSize) || 25));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(totalPages, Math.trunc(requestedPage) || 1));
  const start = (page - 1) * pageSize;
  const items = allItems.slice(start, start + pageSize);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}
