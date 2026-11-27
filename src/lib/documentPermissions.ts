import { normalizeLookupText } from './barragemSearch';
import type { SolicitacaoVistoriaRecord } from '../types/solicitacoesVistoria';

export interface DocumentPermissionActor {
  userId?: string | null;
  perfilId?: string | null;
  name?: string | null;
  email?: string | null;
  canEdit: boolean;
}

export interface PermissionCheckDocument {
  id?: string;
  userId?: string;
  user_id?: string;
  analista?: string;
  analistas?: string[];
  analistasOutros?: string[];
  status?: string;
  tipo_documento?: string;
  retificadoDeId?: string;
  retificacaoJustificativa?: string;
  retificadoEm?: string;
  retificadoPorId?: string;
  retificadoPorNome?: string;
  versaoRetificacao?: number;
  [key: string]: any;
}

export type NormalizedMesaState =
  | 'Rascunho'
  | 'Concluído'
  | 'Solicitação pendente'
  | 'Resposta recebida';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getActorIdSet(actor?: DocumentPermissionActor | null): Set<string> {
  const ids = [actor?.userId, actor?.perfilId]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return new Set(ids);
}

function getActorNameTokens(actor?: DocumentPermissionActor | null): Set<string> {
  const names = [actor?.name, actor?.email]
    .map((v) => normalizeLookupText(v))
    .filter(Boolean);
  return new Set(names);
}

function getDocumentAuthorNames(doc?: PermissionCheckDocument | null): string[] {
  if (!doc) return [];
  const rawList = [
    doc.analista,
    ...(Array.isArray(doc.analistas) ? doc.analistas : []),
    ...(Array.isArray(doc.analistasOutros) ? doc.analistasOutros : []),
  ];
  return Array.from(new Set(rawList.map((v) => normalizeLookupText(v)).filter(Boolean)));
}

export function isDocumentAuthor(
  doc?: PermissionCheckDocument | null,
  actor?: DocumentPermissionActor | null
): boolean {
  if (!doc || !actor) return false;
  const actorIds = getActorIdSet(actor);
  const docUserId = String(doc.userId ?? doc.user_id ?? '').trim();

  if (docUserId) {
    return actorIds.has(docUserId);
  }

  const authorNames = getDocumentAuthorNames(doc);
  if (authorNames.length === 0) {
    // Legacy draft without explicit author metadata can be edited by active editors
    return actor.canEdit;
  }

  const actorNames = getActorNameTokens(actor);
  return authorNames.some((name) => actorNames.has(name));
}

export function isConcludedStatus(status?: string | null): boolean {
  return normalizeLookupText(status) === 'concluido';
}

export function canUserEditDraft(
  doc?: PermissionCheckDocument | null,
  actor?: DocumentPermissionActor | null
): boolean {
  if (!actor?.canEdit) return false;
  if (!doc || !doc.id) return true;
  if (isConcludedStatus(doc.status)) return false;
  return isDocumentAuthor(doc, actor);
}

export function canUserDeleteDraft(
  doc?: PermissionCheckDocument | null,
  actor?: DocumentPermissionActor | null
): boolean {
  if (!actor?.canEdit || !doc?.id) return false;
  if (isConcludedStatus(doc.status)) return false;
  return isDocumentAuthor(doc, actor);
}

export function canUserRectifyDocument(
  doc?: PermissionCheckDocument | null,
  canEdit?: boolean
): boolean {
  if (!canEdit || !doc?.id) return false;
  return isConcludedStatus(doc.status);
}

export function createRetificationDraft<T extends PermissionCheckDocument>(
  originalDoc: T,
  justification: string,
  actor: DocumentPermissionActor,
  newId?: string
): T {
  const cleanJust = String(justification || '').trim();
  if (cleanJust.length < 5) {
    throw new Error('Informe uma justificativa clara (mínimo de 5 caracteres) para retificar o documento concluído.');
  }
  if (!originalDoc?.id) {
    throw new Error('Documento de origem inválido para retificação.');
  }
  if (!isConcludedStatus(originalDoc.status)) {
    throw new Error('Apenas documentos concluídos exigem abertura de retificação auditável.');
  }

  const generatedId =
    newId ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `ret_${Date.now()}`);

  const actorName = String(actor.name || actor.email || 'Analista').trim();
  const nextVersion = Number(originalDoc.versaoRetificacao || 1) + 1;
  const nowIso = new Date().toISOString();

  const cloned: Record<string, any> = {
    ...originalDoc,
    id: generatedId,
    userId: actor.userId || undefined,
    user_id: actor.userId || undefined,
    analista: actorName,
    status: 'Rascunho',
    retificadoDeId: originalDoc.id,
    retificacaoJustificativa: cleanJust,
    retificadoEm: nowIso,
    retificadoPorId: actor.userId || undefined,
    retificadoPorNome: actorName,
    versaoRetificacao: nextVersion,
  };

  delete cloned.created_at;
  delete cloned.updated_at;

  return cloned as T;
}

export function getDocumentProcessValue(doc: PermissionCheckDocument): string {
  return String(doc.processo || doc.numProcesso || doc.protocolo || '').trim();
}

export function getDocumentNumberValue(doc: PermissionCheckDocument): string {
  return String(
    doc.numParecerTecnico ||
      doc.notificacaoGerada ||
      doc.protocolo ||
      doc.oficioGerado ||
      doc.id ||
      ''
  ).trim();
}

export function getDocumentBarragemValue(doc: PermissionCheckDocument): string {
  if (Array.isArray(doc.barragens) && doc.barragens.length > 0) {
    const names = doc.barragens
      .map((b: any) => String(b?.nome || '').trim())
      .filter(Boolean);
    if (names.length > 0) return names.join(' · ');
  }
  return String(
    doc.nomeBarragem ||
      doc.localizacaoEmpreendimento ||
      doc.empreendimento ||
      doc.nomeFantasia ||
      ''
  ).trim();
}

export function getDocumentEmpreendedorValue(doc: PermissionCheckDocument): string {
  return String(
    doc.identificacaoEmpreendedor ||
      doc.interessado ||
      doc.empreendedorNome ||
      ''
  ).trim();
}

export function getDocumentMunicipioValue(doc: PermissionCheckDocument): string {
  return String(doc.municipio || doc.municipioEmpreendimento || '').trim();
}

export function getDocumentDateValue(doc: PermissionCheckDocument): string {
  const raw = String(
    doc.dataParecer ||
      doc.dataEmissao ||
      doc.dataNotificacao ||
      doc.data ||
      doc.updated_at ||
      doc.created_at ||
      ''
  ).trim();
  return raw ? raw.split('T')[0] : '';
}

export function matchDocumentRequests(
  doc: PermissionCheckDocument,
  solicitacoes: SolicitacaoVistoriaRecord[]
): SolicitacaoVistoriaRecord[] {
  const docId = String(doc.id || '').trim();
  const docProc = normalizeLookupText(getDocumentProcessValue(doc));
  const docBarId = String(doc.barragemId || '').trim();

  return solicitacoes.filter((sol) => {
    if (docId && sol.referencia_id && sol.referencia_id === docId) return true;
    if (docBarId && sol.barragem_id && sol.barragem_id === docBarId) {
      if (!docProc || !sol.processo) return true;
      return normalizeLookupText(sol.processo) === docProc;
    }
    return false;
  });
}

export function getNormalizedMesaState(
  doc: PermissionCheckDocument,
  solicitacoes: SolicitacaoVistoriaRecord[] = []
): NormalizedMesaState {
  const linked = matchDocumentRequests(doc, solicitacoes).filter(
    (s) => normalizeLookupText(s.status) !== 'cancelada'
  );

  const hasResponse = linked.some((s) => {
    const norm = normalizeLookupText(s.status);
    return norm === 'realizada' || norm === 'concluida' || Boolean(s.observacao_campo?.trim());
  });
  if (hasResponse) return 'Resposta recebida';

  const hasPendingRequest = linked.some((s) => {
    const norm = normalizeLookupText(s.status);
    return norm === 'solicitada' || norm === 'em_andamento' || norm === 'em andamento' || norm === 'agendada';
  });
  if (hasPendingRequest) return 'Solicitação pendente';

  if (isConcludedStatus(doc.status)) return 'Concluído';
  return 'Rascunho';
}
