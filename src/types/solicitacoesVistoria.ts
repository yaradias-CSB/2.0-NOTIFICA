import type { CoordenadasGMS } from '../types';

export type SolicitacaoVistoriaTipoReferencia = 'parecer' | 'oficio' | 'notificacao' | 'avulsa';

export interface SolicitacaoVistoriaEquipeMember {
  id?: string;
  nome: string;
}

export interface SolicitacaoVistoriaRecord {
  id: string;
  sistema_origem: 'notifica';
  status: string;
  tipo_referencia: string | null;
  referencia_id: string | null;
  processo: string | null;
  barragem_id: string | null;
  nome_barragem: string | null;
  municipio: string | null;
  curso_agua: string | null;
  coordenadas: string | null;
  empreendedor_id: string | null;
  empreendedor_nome: string | null;
  relato: string;
  solicitante_id: string | null;
  solicitante_nome: string | null;
  solicitante_perfil: string | null;
  equipe: SolicitacaoVistoriaEquipeMember[];
  data_vistoria: string | null;
  observacao_campo: string | null;
  motivo_cancelamento: string | null;
  cancelado_em: string | null;
  cancelado_por_nome: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SolicitacaoVistoriaPrefill {
  tipoReferencia?: SolicitacaoVistoriaTipoReferencia;
  referenciaId?: string;
  processo?: string;
  barragemId?: string;
  nomeBarragem?: string;
  municipio?: string;
  cursoAgua?: string;
  coordenadas?: string;
  empreendedorId?: string;
  empreendedorNome?: string;
}

export interface CreateSolicitacaoVistoriaInput {
  tipo_referencia?: string | null;
  referencia_id?: string | null;
  processo?: string | null;
  barragem_id?: string | null;
  nome_barragem?: string | null;
  municipio?: string | null;
  curso_agua?: string | null;
  coordenadas?: string | null;
  empreendedor_id?: string | null;
  empreendedor_nome?: string | null;
  relato: string;
}

export interface UpdateSolicitacaoVistoriaInput {
  processo?: string | null;
  barragem_id?: string | null;
  nome_barragem?: string | null;
  municipio?: string | null;
  curso_agua?: string | null;
  coordenadas?: string | null;
  empreendedor_id?: string | null;
  empreendedor_nome?: string | null;
  relato?: string;
}

export const SOLICITACAO_RELATO_MAX = 1000;
export const SOLICITACAO_OBSERVACAO_MAX = 1000;

export function formatCoordenadasGmsString(coordenadasGMS?: CoordenadasGMS | null): string {
  if (!coordenadasGMS) return '';
  const { lat, long } = coordenadasGMS;
  const formatPart = (
    part: { g?: string; m?: string; s?: string } | undefined,
    hemi: 'S' | 'W'
  ) => {
    if (!part) return '';
    const g = String(part.g || '').trim();
    const m = String(part.m || '').trim();
    const s = String(part.s || '').trim();
    if (!g && !m && !s) return '';
    return `${g || '00'}°${m || '00'}'${s || '00'}" ${hemi}`;
  };
  const latStr = formatPart(lat, 'S');
  const longStr = formatPart(long, 'W');
  return [latStr, longStr].filter(Boolean).join(' / ');
}

export function formatCoordenadasSimplesString(lat?: string, long?: string): string {
  const cleanLat = String(lat || '').trim();
  const cleanLong = String(long || '').trim();
  if (!cleanLat && !cleanLong) return '';
  if (cleanLat && cleanLong) return `${cleanLat} / ${cleanLong}`;
  return cleanLat || cleanLong;
}

export function containsCpfCnpjClient(text: string): boolean {
  if (!text) return false;
  const withoutUuids = text.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ' '
  );
  const cnpjPattern = /(?<![A-Za-z0-9])(?:\d[\t \u00A0./-]*){12}\d[\t \u00A0./-]*\d(?![A-Za-z0-9])/;
  const cpfPattern = /(?<![A-Za-z0-9])(?:\d[\t \u00A0./-]*){9}\d[\t \u00A0./-]*\d(?![A-Za-z0-9])/;
  return cnpjPattern.test(withoutUuids) || cpfPattern.test(withoutUuids);
}

export function looksLikeSerializedJsonClient(text: string): boolean {
  const trimmed = text.trim();
  if (
    !(
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed && typeof parsed === 'object');
  } catch {
    return false;
  }
}

export function normalizeComparableName(val?: string | null): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isSolicitacaoRealizada(status?: string | null): boolean {
  const norm = normalizeComparableName(status);
  return norm === 'realizada' || norm === 'concluida';
}

export function isSolicitacaoCancelada(status?: string | null): boolean {
  return normalizeComparableName(status) === 'cancelada';
}

export function isUserInSolicitacaoEquipeClient(
  record: SolicitacaoVistoriaRecord,
  userId?: string | null,
  profileId?: string | null,
  profileName?: string | null
): boolean {
  const ids = new Set(
    [userId, profileId].map((v) => String(v || '').trim()).filter(Boolean)
  );
  const normName = normalizeComparableName(profileName);

  for (const member of record.equipe || []) {
    if (member.id && ids.has(String(member.id).trim())) {
      return true;
    }
    if (normName && normalizeComparableName(member.nome) === normName) {
      return true;
    }
  }
  return false;
}
