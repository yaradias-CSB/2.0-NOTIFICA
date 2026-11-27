export interface FieldProposal<T> {
  key: keyof T;
  label: string;
  incomingValue: unknown;
}

export interface ConflictItem {
  key: string;
  label: string;
  currentValue: string;
  incomingValue: string;
}

function normalizeComparableValue(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object') {
    const obj = val as Record<string, any>;
    if (obj.lat && obj.long) {
      const l1 = [obj.lat.g, obj.lat.m, obj.lat.s].filter(Boolean).join('.');
      const l2 = [obj.long.g, obj.long.m, obj.long.s].filter(Boolean).join('.');
      if (!l1 && !l2) return '';
      return `${l1}/${l2}`;
    }
    return JSON.stringify(val);
  }
  return String(val).trim();
}

export function detectNonEmptyFieldConflicts<T extends Record<string, any>>(
  current: T,
  proposals: FieldProposal<T>[]
): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  for (const prop of proposals) {
    const incomingStr = normalizeComparableValue(prop.incomingValue);
    if (!incomingStr) continue;
    const currentStr = normalizeComparableValue(current[prop.key]);
    if (!currentStr) continue;
    if (currentStr.toLowerCase() === incomingStr.toLowerCase()) continue;
    conflicts.push({
      key: String(prop.key),
      label: prop.label,
      currentValue: currentStr,
      incomingValue: incomingStr,
    });
  }
  return conflicts;
}

export function applyFieldProposals<T extends Record<string, any>>(
  current: T,
  proposals: FieldProposal<T>[],
  mode: 'empty_only' | 'overwrite_all'
): T {
  const next: Record<string, any> = { ...current };
  for (const prop of proposals) {
    const incomingStr = normalizeComparableValue(prop.incomingValue);
    if (!incomingStr) continue;
    const currentStr = normalizeComparableValue(current[prop.key]);
    if (mode === 'empty_only' && currentStr) {
      continue;
    }
    next[String(prop.key)] = prop.incomingValue;
  }
  return next as T;
}
