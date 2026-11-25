import express from "express";

export type SolicitacaoUserRole = "Administrador" | "Analista" | "Visualizador";

export interface SolicitacaoAuthUser {
  id: string;
  perfilId?: string;
  email: string;
  nome: string;
  perfil: SolicitacaoUserRole;
}

export interface SolicitacoesVistoriaRouterDeps {
  requireRole: (allowedRoles: SolicitacaoUserRole[]) => express.RequestHandler;
  getSessionIdentity: (req: express.Request) => SolicitacaoAuthUser | null;
  getAuthorDisplayName: (authUser: SolicitacaoAuthUser) => string;
}

export interface SolicitacaoEquipeMember {
  id?: string;
  nome: string;
}

export interface SolicitacaoVistoriaDTO {
  id: string;
  sistema_origem: "notifica";
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
  equipe: SolicitacaoEquipeMember[];
  data_vistoria: string | null;
  observacao_campo: string | null;
  motivo_cancelamento: string | null;
  cancelado_em: string | null;
  cancelado_por_nome: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const MAX_RELATO_LENGTH = 1000;
const MAX_OBSERVACAO_LENGTH = 1000;
const MAX_MOTIVO_CANCELAMENTO_LENGTH = 500;
const MAX_TEXT_FIELD_LENGTH = 300;
const SISTEMA_ORIGEM_NOTIFICA = "notifica" as const;

const FORBIDDEN_DOC_KEYS = new Set([
  "cpf",
  "cnpj",
  "cpf_cnpj",
  "cpfcnpj",
  "cpf_cnpj_normalizado",
  "cpfcnpjnormalizado",
  "documento",
  "documento_identificacao",
  "documentoidentificacao",
  "empreendedor_cpf_cnpj",
  "empreendedorcpfcnpj",
  "cpf_rt",
  "cpfrt",
  "tipo_documento_identificacao",
  "tipodocumentoidentificacao",
]);

const CLIENT_IDENTITY_AND_SERVER_FIELDS = new Set([
  "id",
  "sistema_origem",
  "sistemaOrigem",
  "user_id",
  "userId",
  "usuario_id",
  "usuarioId",
  "analista",
  "analista_id",
  "analistaId",
  "analyst",
  "created_by_analyst",
  "createdByAnalyst",
  "created_by",
  "createdBy",
  "updated_by",
  "updatedBy",
  "author",
  "author_id",
  "authorId",
  "autor",
  "autor_id",
  "autorId",
  "owner_id",
  "ownerId",
  "solicitante",
  "solicitante_id",
  "solicitanteId",
  "solicitante_nome",
  "solicitanteNome",
  "solicitante_email",
  "solicitanteEmail",
  "solicitante_perfil",
  "solicitantePerfil",
  "equipe",
  "equipe_ids",
  "equipeIds",
  "equipe_emails",
  "equipeEmails",
  "data_vistoria",
  "dataVistoria",
  "observacao_campo",
  "observacaoCampo",
  "cancelado_em",
  "canceladoEm",
  "cancelado_por",
  "canceladoPor",
  "cancelado_por_id",
  "canceladoPorId",
  "cancelado_por_nome",
  "canceladoPorNome",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
]);

const VALID_ID_PARAM_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

function sanitizeText(val: unknown): string {
  if (typeof val !== "string") return "";
  return val
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>?/gm, "")
    .trim();
}

function optionalText(val: unknown): string | null {
  const clean = sanitizeText(val);
  return clean ? clean : null;
}

function maskCpfCnpjInText(text: string): string {
  return text
    .replace(
      /(?<![A-Za-z0-9])(?:\d[\t \u00A0./-]*){12}(\d)[\t \u00A0./-]*(\d)(?![A-Za-z0-9])/g,
      "**.***.***/****-$1$2"
    )
    .replace(
      /(?<![A-Za-z0-9])(?:\d[\t \u00A0./-]*){9}(\d)[\t \u00A0./-]*(\d)(?![A-Za-z0-9])/g,
      "***.***.***-$1$2"
    );
}

function containsCpfCnpj(text: string): boolean {
  if (!text) return false;
  const withoutUuids = text.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    " "
  );
  return maskCpfCnpjInText(withoutUuids) !== withoutUuids;
}

function containsCpfCnpjInProcesso(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  // Allow standard SEMA/SIGADOC protocols like 1234567/2026 or 123456/2026
  if (/^(?:[A-Z]{2,10}-?)?\d{4,7}\/(?:19|20)\d{2}$/i.test(trimmed)) {
    return false;
  }
  return containsCpfCnpj(trimmed);
}

function looksLikeSerializedJson(text: string): boolean {
  const trimmed = text.trim();
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed && typeof parsed === "object");
  } catch {
    return false;
  }
}

function sanitizePublicText(val: unknown): string | null {
  const clean = sanitizeText(val);
  if (!clean) return null;
  const uuidPlaceholders: string[] = [];
  let protectedText = clean.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (match) => {
      const token = `[[UUID_${uuidPlaceholders.length}]]`;
      uuidPlaceholders.push(match);
      return token;
    }
  );
  protectedText = maskCpfCnpjInText(protectedText);
  return protectedText.replace(
    /\[\[UUID_(\d+)\]\]/g,
    (_m, idx) => uuidPlaceholders[Number(idx)] ?? ""
  );
}

function normalizeComparableText(val: unknown): string {
  return String(val || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findForbiddenDocKey(obj: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (
      (FORBIDDEN_DOC_KEYS.has(normalizedKey) ||
        (/cpf|cnpj/i.test(key) && !/tipo/i.test(key))) &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return true;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (findForbiddenDocKey(value as Record<string, unknown>)) {
        return true;
      }
    }
  }
  return false;
}

function normalizeCoordenadasInput(raw: unknown): { ok: boolean; value: string | null; error?: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw === "string") {
    const clean = sanitizeText(raw);
    if (!clean) return { ok: true, value: null };
    if (looksLikeSerializedJson(clean)) {
      return { ok: false, value: null, error: "Payload JSON copiado não é permitido em coordenadas." };
    }
    if (containsCpfCnpj(clean)) {
      return { ok: false, value: null, error: "CPF/CNPJ não pode ser enviado em coordenadas." };
    }
    if (clean.length > MAX_TEXT_FIELD_LENGTH) {
      return { ok: false, value: null, error: "O campo coordenadas excede o limite permitido." };
    }
    return { ok: true, value: clean };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const lat = sanitizeText(obj.lat ?? obj.latitude ?? "");
    const long = sanitizeText(obj.long ?? obj.lng ?? obj.longitude ?? "");
    const combined = [lat, long].filter(Boolean).join(" / ");
    if (!combined) return { ok: true, value: null };
    if (containsCpfCnpj(combined)) {
      return { ok: false, value: null, error: "CPF/CNPJ não pode ser enviado em coordenadas." };
    }
    if (combined.length > MAX_TEXT_FIELD_LENGTH) {
      return { ok: false, value: null, error: "O campo coordenadas excede o limite permitido." };
    }
    return { ok: true, value: combined };
  }
  return { ok: false, value: null, error: "Formato inválido para coordenadas." };
}

function getAdministraSolicitacoesConfig(): { baseUrl: string; token: string } | null {
  const rawUrl = String(process.env.ADMINISTRA_SOLICITACOES_URL || "").trim();
  const rawToken = String(process.env.SOLICITACOES_SERVICE_TOKEN || "").trim();

  if (
    !rawUrl ||
    !rawToken ||
    /placeholder/i.test(rawUrl) ||
    /placeholder/i.test(rawToken) ||
    /[\r\n]/.test(rawUrl) ||
    /[\r\n]/.test(rawToken)
  ) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    return null;
  }

  return {
    baseUrl: rawUrl.replace(/\/+$/, ""),
    token: rawToken,
  };
}

function sanitizeEquipeList(rawEquipe: unknown): SolicitacaoEquipeMember[] {
  if (!rawEquipe) return [];
  const items = Array.isArray(rawEquipe)
    ? rawEquipe
    : typeof rawEquipe === "string"
      ? rawEquipe.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
      : [];

  const result: SolicitacaoEquipeMember[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const cleanName = sanitizePublicText(item);
      if (cleanName && !cleanName.includes("@")) {
        result.push({ nome: cleanName });
      }
      continue;
    }
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const id = optionalText(rec.id ?? rec.user_id ?? rec.usuario_id ?? rec.membro_id);
      const nome = sanitizePublicText(rec.nome ?? rec.name ?? rec.display_name);
      if (nome || id) {
        result.push({
          ...(id && !containsCpfCnpj(id) ? { id } : {}),
          nome: nome || "Integrante da equipe",
        });
      }
    }
  }
  return result;
}

export function sanitizeSolicitacaoRecord(raw: unknown): SolicitacaoVistoriaDTO | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = optionalText(row.id);
  if (!id) return null;

  const coordNormalized = normalizeCoordenadasInput(row.coordenadas);

  return {
    id,
    sistema_origem: SISTEMA_ORIGEM_NOTIFICA,
    status: sanitizeText(row.status) || "pendente",
    tipo_referencia: sanitizePublicText(row.tipo_referencia ?? row.tipoReferencia),
    referencia_id: optionalText(row.referencia_id ?? row.referenciaId),
    processo: sanitizePublicText(row.processo),
    barragem_id: optionalText(row.barragem_id ?? row.barragemId),
    nome_barragem: sanitizePublicText(row.nome_barragem ?? row.nomeBarragem),
    municipio: sanitizePublicText(row.municipio),
    curso_agua: sanitizePublicText(row.curso_agua ?? row.cursoAgua),
    coordenadas: coordNormalized.ok ? sanitizePublicText(coordNormalized.value) : null,
    empreendedor_id: optionalText(row.empreendedor_id ?? row.empreendedorId),
    empreendedor_nome: sanitizePublicText(row.empreendedor_nome ?? row.empreendedorNome),
    relato: sanitizePublicText(row.relato) || "",
    solicitante_id: optionalText(row.solicitante_id ?? row.solicitanteId ?? row.criado_por),
    solicitante_nome: sanitizePublicText(row.solicitante_nome ?? row.solicitanteNome),
    solicitante_perfil: sanitizePublicText(row.solicitante_perfil ?? row.solicitantePerfil),
    equipe: sanitizeEquipeList(row.equipe),
    data_vistoria: optionalText(row.data_vistoria ?? row.dataVistoria),
    observacao_campo: sanitizePublicText(row.observacao_campo ?? row.observacaoCampo),
    motivo_cancelamento: sanitizePublicText(row.motivo_cancelamento ?? row.motivoCancelamento),
    cancelado_em: optionalText(row.cancelado_em ?? row.canceladoEm),
    cancelado_por_nome: sanitizePublicText(row.cancelado_por_nome ?? row.canceladoPorNome),
    created_at: optionalText(row.created_at ?? row.createdAt),
    updated_at: optionalText(row.updated_at ?? row.updatedAt),
  };
}

function isNotificaOrigem(row: Record<string, unknown>): boolean {
  const origem = normalizeComparableText(row.sistema_origem ?? row.sistemaOrigem);
  return origem === SISTEMA_ORIGEM_NOTIFICA;
}

function isSolicitacaoOwner(
  existing: Record<string, unknown>,
  authUser: SolicitacaoAuthUser
): boolean {
  const ownerId = String(
    existing.solicitante_id ??
      existing.solicitanteId ??
      existing.criado_por ??
      existing.usuario_id ??
      ""
  ).trim();

  if (ownerId) {
    if (ownerId === authUser.id) return true;
    if (authUser.perfilId && ownerId === authUser.perfilId) return true;
    return false;
  }

  const ownerEmail = normalizeComparableText(
    existing.solicitante_email ?? existing.solicitanteEmail
  );
  if (ownerEmail && authUser.email) {
    return ownerEmail === normalizeComparableText(authUser.email);
  }

  return false;
}

export function isUserInSolicitacaoEquipe(
  existing: Record<string, unknown>,
  authUser: SolicitacaoAuthUser
): boolean {
  if (authUser.perfil === "Administrador") return true;

  const userIds = new Set(
    [authUser.id, authUser.perfilId]
      .map((val) => String(val || "").trim())
      .filter(Boolean)
  );
  const userEmail = normalizeComparableText(authUser.email);
  const userName = normalizeComparableText(authUser.nome);

  const equipeIds = Array.isArray(existing.equipe_ids)
    ? existing.equipe_ids
    : Array.isArray(existing.equipeIds)
      ? existing.equipeIds
      : [];
  for (const idItem of equipeIds) {
    const cleanId = String(idItem || "").trim();
    if (cleanId && userIds.has(cleanId)) return true;
  }

  const rawEquipe = existing.equipe;
  const items = Array.isArray(rawEquipe)
    ? rawEquipe
    : typeof rawEquipe === "string"
      ? rawEquipe.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
      : [];

  for (const member of items) {
    if (typeof member === "string") {
      const raw = member.trim();
      if (userIds.has(raw)) return true;
      const norm = normalizeComparableText(raw);
      if (userEmail && norm === userEmail) return true;
      if (userName && norm === userName) return true;
      continue;
    }

    if (member && typeof member === "object") {
      const rec = member as Record<string, unknown>;
      const memberId = String(
        rec.id ?? rec.user_id ?? rec.usuario_id ?? rec.membro_id ?? ""
      ).trim();
      if (memberId && userIds.has(memberId)) return true;

      const memberEmail = normalizeComparableText(rec.email);
      if (memberEmail && userEmail && memberEmail === userEmail) return true;

      const memberName = normalizeComparableText(rec.nome ?? rec.name ?? rec.display_name);
      if (memberName && userName && memberName === userName) return true;
    }
  }

  return false;
}

function validateSimpleTextField(
  label: string,
  val: unknown,
  options: { maxLength?: number; isProcesso?: boolean } = {}
): { ok: boolean; value: string | null; error?: string } {
  if (val === undefined || val === null || val === "") {
    return { ok: true, value: null };
  }
  if (typeof val !== "string") {
    return { ok: false, value: null, error: `Campo "${label}" deve ser texto.` };
  }
  const clean = sanitizeText(val);
  if (!clean) return { ok: true, value: null };
  if (looksLikeSerializedJson(clean)) {
    return { ok: false, value: null, error: `Payloads JSON copiados não são permitidos em "${label}".` };
  }
  const hasDoc = options.isProcesso ? containsCpfCnpjInProcesso(clean) : containsCpfCnpj(clean);
  if (hasDoc) {
    return { ok: false, value: null, error: `CPF/CNPJ não é permitido em "${label}". Utilize apenas IDs ou nomes.` };
  }
  const maxLen = options.maxLength ?? MAX_TEXT_FIELD_LENGTH;
  if (clean.length > maxLen) {
    return { ok: false, value: null, error: `O campo "${label}" deve ter no máximo ${maxLen} caracteres.` };
  }
  return { ok: true, value: clean };
}

function validateIdReferenceField(label: string, val: unknown): { ok: boolean; value: string | null; error?: string } {
  if (val === undefined || val === null || val === "") {
    return { ok: true, value: null };
  }
  if (typeof val !== "string") {
    return { ok: false, value: null, error: `Identificador "${label}" inválido.` };
  }
  const clean = sanitizeText(val);
  if (!clean) return { ok: true, value: null };
  if (containsCpfCnpj(clean)) {
    return { ok: false, value: null, error: `CPF/CNPJ não pode ser usado como referência em "${label}".` };
  }
  if (clean.length > 128) {
    return { ok: false, value: null, error: `Identificador "${label}" excede o tamanho permitido.` };
  }
  return { ok: true, value: clean };
}

function extractBodyField(body: Record<string, unknown>, snakeKey: string, camelKey: string): unknown {
  if (Object.prototype.hasOwnProperty.call(body, snakeKey)) return body[snakeKey];
  if (Object.prototype.hasOwnProperty.call(body, camelKey)) return body[camelKey];
  return undefined;
}

function hasBodyField(body: Record<string, unknown>, snakeKey: string, camelKey: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, snakeKey) ||
    Object.prototype.hasOwnProperty.call(body, camelKey)
  );
}

function stripIdentityFields(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (CLIENT_IDENTITY_AND_SERVER_FIELDS.has(key)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function redactSensitiveHeaderPatterns(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/apikey\s*[:=]\s*[^\s,;]+/gi, "apikey=[REDACTED]");
}

async function callAdministraApi(
  cfg: { baseUrl: string; token: string },
  pathSuffix: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: Record<string, unknown>; query?: Record<string, string> } = {}
): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  errorMessage?: string;
}> {
  const rawTimeout = Number(process.env.ADMINISTRA_API_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.min(30_000, Math.max(10, Math.trunc(rawTimeout)))
      : 10_000;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const baseUrl = new URL(cfg.baseUrl);
    const targetUrl = new URL(`${cfg.baseUrl}${pathSuffix}`);
    if (targetUrl.origin !== baseUrl.origin) {
      return {
        ok: false,
        status: 502,
        data: null,
        errorMessage: "Endereço inválido para o serviço central de solicitações de vistoria.",
      };
    }
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        targetUrl.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${cfg.token}`,
    };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(targetUrl.toString(), {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const rawErr =
        parsed && typeof parsed === "object"
          ? String((parsed as Record<string, unknown>).error || (parsed as Record<string, unknown>).message || "").trim()
          : "";
      return {
        ok: false,
        status: res.status,
        data: parsed,
        errorMessage: sanitizePublicText(redactSensitiveHeaderPatterns(rawErr)) || undefined,
      };
    }

    return { ok: true, status: res.status, data: parsed };
  } catch (err) {
    const errName = err && typeof err === "object" ? String((err as { name?: unknown }).name || "") : "";
    if (timedOut || errName === "TimeoutError" || errName === "AbortError") {
      return {
        ok: false,
        status: 504,
        data: null,
        errorMessage: "Tempo limite excedido ao consultar o serviço central de solicitações de vistoria.",
      };
    }
    return {
      ok: false,
      status: 503,
      data: null,
      errorMessage: "Serviço central de solicitações de vistoria indisponível no momento.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function unwrapUpstreamRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : null;
  }
  const obj = data as Record<string, unknown>;
  if (obj.solicitacao && typeof obj.solicitacao === "object" && !Array.isArray(obj.solicitacao)) {
    return obj.solicitacao as Record<string, unknown>;
  }
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown>;
  }
  return obj;
}

function unwrapUpstreamList(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const candidate = obj.solicitacoes ?? obj.items ?? obj.data;
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    }
  }
  return [];
}

function handleUpstreamFailure(
  res: express.Response,
  upstream: { status: number; errorMessage?: string },
  fallbackMsg: string
) {
  if (upstream.status === 409) {
    return res.status(409).json({
      error: upstream.errorMessage || "Conflito ao processar solicitação de vistoria.",
    });
  }
  if (upstream.status === 404) {
    return res.status(404).json({
      error: upstream.errorMessage || "Solicitação de vistoria não encontrada.",
    });
  }
  if (upstream.status >= 400 && upstream.status < 500) {
    return res.status(upstream.status).json({
      error: upstream.errorMessage || fallbackMsg,
    });
  }
  if (upstream.status === 504) {
    return res.status(504).json({
      error: upstream.errorMessage || "Tempo limite excedido ao consultar o serviço central de solicitações de vistoria.",
    });
  }
  return res.status(upstream.status === 503 ? 503 : 502).json({
    error: upstream.errorMessage || fallbackMsg,
  });
}

function validateAndBuildSolicitacaoPayload(
  rawBody: unknown,
  options: { requireRelato: boolean }
): { ok: boolean; payload?: Record<string, unknown>; error?: string } {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return { ok: false, error: "Corpo da requisição inválido." };
  }

  const rawRecord = rawBody as Record<string, unknown>;
  if (findForbiddenDocKey(rawRecord)) {
    return {
      ok: false,
      error: "CPF/CNPJ não é permitido em solicitações de vistoria; utilize apenas IDs ou nomes.",
    };
  }

  const cleaned = stripIdentityFields(rawRecord);
  const payload: Record<string, unknown> = {};

  if (options.requireRelato || hasBodyField(cleaned, "relato", "relato")) {
    const rawRelato = cleaned.relato;
    if (typeof rawRelato !== "string") {
      return { ok: false, error: "O campo relato é obrigatório." };
    }
    const cleanRelato = sanitizeText(rawRelato);
    if (!cleanRelato) {
      return { ok: false, error: "O campo relato é obrigatório." };
    }
    if (looksLikeSerializedJson(cleanRelato)) {
      return { ok: false, error: "Payloads JSON copiados não são permitidos no relato." };
    }
    if (containsCpfCnpj(cleanRelato)) {
      return { ok: false, error: "CPF/CNPJ não pode ser incluído no relato." };
    }
    if (cleanRelato.length > MAX_RELATO_LENGTH) {
      return {
        ok: false,
        error: `O relato deve ter no máximo ${MAX_RELATO_LENGTH} caracteres.`,
      };
    }
    payload.relato = cleanRelato;
  }

  const simpleFields: Array<{
    snake: string;
    camel: string;
    label: string;
    isProcesso?: boolean;
  }> = [
    { snake: "nome_barragem", camel: "nomeBarragem", label: "nome da barragem" },
    { snake: "municipio", camel: "municipio", label: "município" },
    { snake: "curso_agua", camel: "cursoAgua", label: "curso d'água" },
    { snake: "empreendedor_nome", camel: "empreendedorNome", label: "empreendedor" },
    { snake: "processo", camel: "processo", label: "processo", isProcesso: true },
    { snake: "tipo_referencia", camel: "tipoReferencia", label: "tipo de referência" },
  ];

  for (const field of simpleFields) {
    if (!hasBodyField(cleaned, field.snake, field.camel)) continue;
    const rawVal = extractBodyField(cleaned, field.snake, field.camel);
    const check = validateSimpleTextField(field.label, rawVal, {
      isProcesso: field.isProcesso,
    });
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    payload[field.snake] = check.value;
  }

  const idFields: Array<{ snake: string; camel: string; label: string }> = [
    { snake: "barragem_id", camel: "barragemId", label: "barragem_id" },
    { snake: "empreendedor_id", camel: "empreendedorId", label: "empreendedor_id" },
    { snake: "referencia_id", camel: "referenciaId", label: "referencia_id" },
  ];

  for (const field of idFields) {
    if (!hasBodyField(cleaned, field.snake, field.camel)) continue;
    const rawVal = extractBodyField(cleaned, field.snake, field.camel);
    const check = validateIdReferenceField(field.label, rawVal);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    payload[field.snake] = check.value;
  }

  if (hasBodyField(cleaned, "coordenadas", "coordenadas")) {
    const coordCheck = normalizeCoordenadasInput(cleaned.coordenadas);
    if (!coordCheck.ok) {
      return { ok: false, error: coordCheck.error };
    }
    payload.coordenadas = coordCheck.value;
  }

  return { ok: true, payload };
}

export function createSolicitacoesVistoriaRouter(deps: SolicitacoesVistoriaRouterDeps): express.Router {
  const router = express.Router();

  router.get(
    "/",
    deps.requireRole(["Administrador", "Analista", "Visualizador"]),
    async (_req, res) => {
      const cfg = getAdministraSolicitacoesConfig();
      if (!cfg) {
        return res.status(503).json({
          error: "Serviço central de solicitações de vistoria não configurado no servidor.",
        });
      }

      const upstream = await callAdministraApi(cfg, "", {
        method: "GET",
        query: { sistema_origem: SISTEMA_ORIGEM_NOTIFICA },
      });

      if (!upstream.ok) {
        return handleUpstreamFailure(
          res,
          upstream,
          "Não foi possível consultar as solicitações de vistoria."
        );
      }

      const rawItems = unwrapUpstreamList(upstream.data);
      const solicitacoes = rawItems
        .filter(isNotificaOrigem)
        .map((item) => sanitizeSolicitacaoRecord(item))
        .filter((item): item is SolicitacaoVistoriaDTO => item !== null);

      return res.json({ solicitacoes });
    }
  );

  router.post(
    "/",
    deps.requireRole(["Administrador", "Analista"]),
    async (req, res) => {
      const authUser = deps.getSessionIdentity(req);
      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const cfg = getAdministraSolicitacoesConfig();
      if (!cfg) {
        return res.status(503).json({
          error: "Serviço central de solicitações de vistoria não configurado no servidor.",
        });
      }

      const validation = validateAndBuildSolicitacaoPayload(req.body, {
        requireRelato: true,
      });
      if (!validation.ok || !validation.payload) {
        return res.status(400).json({ error: validation.error || "Dados inválidos." });
      }

      const upstreamPayload: Record<string, unknown> = {
        ...validation.payload,
        sistema_origem: SISTEMA_ORIGEM_NOTIFICA,
        solicitante_id: authUser.id,
        solicitante_nome: deps.getAuthorDisplayName(authUser),
        solicitante_perfil: authUser.perfil,
      };

      const upstream = await callAdministraApi(cfg, "", {
        method: "POST",
        body: upstreamPayload,
      });

      if (!upstream.ok) {
        return handleUpstreamFailure(
          res,
          upstream,
          "Não foi possível registrar a solicitação de vistoria."
        );
      }

      const createdRaw = unwrapUpstreamRecord(upstream.data);
      const created = sanitizeSolicitacaoRecord(createdRaw);
      if (!created) {
        return res.status(502).json({
          error: "Resposta inválida do serviço central de solicitações de vistoria.",
        });
      }

      return res.status(201).json({ solicitacao: created });
    }
  );

  router.patch(
    "/:id/observacao",
    deps.requireRole(["Administrador", "Analista"]),
    async (req, res) => {
      const authUser = deps.getSessionIdentity(req);
      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const id = String(req.params.id || "").trim();
      if (!VALID_ID_PARAM_REGEX.test(id)) {
        return res.status(400).json({ error: "ID de solicitação de vistoria inválido." });
      }

      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "Corpo da requisição inválido." });
      }

      const rawBody = req.body as Record<string, unknown>;
      if (findForbiddenDocKey(rawBody)) {
        return res.status(400).json({
          error: "CPF/CNPJ não é permitido em observações de campo.",
        });
      }

      const bodyKeys = Object.keys(rawBody);
      if (bodyKeys.length === 0 || bodyKeys.some((key) => key !== "observacao_campo")) {
        return res.status(400).json({
          error: "Apenas o campo observacao_campo pode ser alterado nesta rota.",
        });
      }

      const rawObs = rawBody.observacao_campo;
      if (typeof rawObs !== "string") {
        return res.status(400).json({ error: "O campo observacao_campo deve ser texto." });
      }
      const cleanObs = sanitizeText(rawObs);
      if (looksLikeSerializedJson(cleanObs)) {
        return res.status(400).json({
          error: "Payloads JSON copiados não são permitidos na observação de campo.",
        });
      }
      if (containsCpfCnpj(cleanObs)) {
        return res.status(400).json({
          error: "CPF/CNPJ não é permitido na observação de campo.",
        });
      }
      if (cleanObs.length > MAX_OBSERVACAO_LENGTH) {
        return res.status(400).json({
          error: `A observação de campo deve ter no máximo ${MAX_OBSERVACAO_LENGTH} caracteres.`,
        });
      }

      const cfg = getAdministraSolicitacoesConfig();
      if (!cfg) {
        return res.status(503).json({
          error: "Serviço central de solicitações de vistoria não configurado no servidor.",
        });
      }

      const existingRes = await callAdministraApi(cfg, `/${encodeURIComponent(id)}`, {
        method: "GET",
      });
      if (!existingRes.ok) {
        return handleUpstreamFailure(
          res,
          existingRes,
          "Não foi possível consultar a solicitação de vistoria."
        );
      }

      const existing = unwrapUpstreamRecord(existingRes.data);
      if (!existing) {
        return res.status(404).json({ error: "Solicitação de vistoria não encontrada." });
      }
      if (!isNotificaOrigem(existing)) {
        return res.status(403).json({
          error: "Solicitação não pertence ao sistema Notifica.",
        });
      }

      if (authUser.perfil !== "Administrador" && !isUserInSolicitacaoEquipe(existing, authUser)) {
        return res.status(403).json({
          error: "Apenas integrantes da equipe da vistoria ou Administrador podem alterar a observação de campo.",
        });
      }

      const upstream = await callAdministraApi(
        cfg,
        `/${encodeURIComponent(id)}/observacao`,
        {
          method: "PATCH",
          body: { observacao_campo: cleanObs },
        }
      );

      if (!upstream.ok) {
        return handleUpstreamFailure(
          res,
          upstream,
          "Não foi possível atualizar a observação de campo."
        );
      }

      const updated = sanitizeSolicitacaoRecord(unwrapUpstreamRecord(upstream.data));
      if (!updated) {
        return res.status(502).json({
          error: "Resposta inválida do serviço central de solicitações de vistoria.",
        });
      }

      return res.json({ solicitacao: updated });
    }
  );

  const handleCancelSolicitacao: express.RequestHandler = async (req, res) => {
    const authUser = deps.getSessionIdentity(req);
    if (!authUser) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    const id = String(req.params.id || "").trim();
    if (!VALID_ID_PARAM_REGEX.test(id)) {
      return res.status(400).json({ error: "ID de solicitação de vistoria inválido." });
    }

    const rawBody =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    if (findForbiddenDocKey(rawBody)) {
      return res.status(400).json({
        error: "CPF/CNPJ não é permitido em solicitações de vistoria.",
      });
    }

    let motivoCancelamento: string | null = null;
    if (hasBodyField(rawBody, "motivo_cancelamento", "motivoCancelamento")) {
      const checkMotivo = validateSimpleTextField(
        "motivo do cancelamento",
        extractBodyField(rawBody, "motivo_cancelamento", "motivoCancelamento"),
        { maxLength: MAX_MOTIVO_CANCELAMENTO_LENGTH }
      );
      if (!checkMotivo.ok) {
        return res.status(400).json({ error: checkMotivo.error });
      }
      motivoCancelamento = checkMotivo.value;
    }

    const cfg = getAdministraSolicitacoesConfig();
    if (!cfg) {
      return res.status(503).json({
        error: "Serviço central de solicitações de vistoria não configurado no servidor.",
      });
    }

    const existingRes = await callAdministraApi(cfg, `/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    if (!existingRes.ok) {
      return handleUpstreamFailure(
        res,
        existingRes,
        "Não foi possível consultar a solicitação de vistoria."
      );
    }

    const existing = unwrapUpstreamRecord(existingRes.data);
    if (!existing) {
      return res.status(404).json({ error: "Solicitação de vistoria não encontrada." });
    }
    if (!isNotificaOrigem(existing)) {
      return res.status(403).json({
        error: "Solicitação não pertence ao sistema Notifica.",
      });
    }

    if (authUser.perfil !== "Administrador" && !isSolicitacaoOwner(existing, authUser)) {
      return res.status(403).json({
        error: "Apenas o solicitante ou Administrador pode cancelar esta solicitação.",
      });
    }

    const currentStatus = normalizeComparableText(existing.status);
    if (currentStatus === "cancelada") {
      return res.status(409).json({ error: "Esta solicitação de vistoria já foi cancelada." });
    }
    if (currentStatus === "realizada" || currentStatus === "concluida") {
      return res.status(409).json({
        error: "Não é possível cancelar uma solicitação cuja vistoria já foi realizada.",
      });
    }

    const cancelPayload: Record<string, unknown> = {
      status: "cancelada",
      cancelado_em: new Date().toISOString(),
      cancelado_por_id: authUser.id,
      cancelado_por_nome: deps.getAuthorDisplayName(authUser),
      ...(motivoCancelamento ? { motivo_cancelamento: motivoCancelamento } : {}),
    };

    const upstream = await callAdministraApi(cfg, `/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: cancelPayload,
    });

    if (!upstream.ok) {
      return handleUpstreamFailure(
        res,
        upstream,
        "Não foi possível cancelar a solicitação de vistoria."
      );
    }

    const updated = sanitizeSolicitacaoRecord(unwrapUpstreamRecord(upstream.data));
    if (!updated) {
      return res.status(502).json({
        error: "Resposta inválida do serviço central de solicitações de vistoria.",
      });
    }

    return res.json({ solicitacao: updated });
  };

  router.post(
    "/:id/cancelar",
    deps.requireRole(["Administrador", "Analista"]),
    handleCancelSolicitacao
  );
  router.patch(
    "/:id/cancelar",
    deps.requireRole(["Administrador", "Analista"]),
    handleCancelSolicitacao
  );

  router.patch(
    "/:id",
    deps.requireRole(["Administrador", "Analista"]),
    async (req, res) => {
      const authUser = deps.getSessionIdentity(req);
      if (!authUser) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const id = String(req.params.id || "").trim();
      if (!VALID_ID_PARAM_REGEX.test(id)) {
        return res.status(400).json({ error: "ID de solicitação de vistoria inválido." });
      }

      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "Corpo da requisição inválido." });
      }

      const rawBody = req.body as Record<string, unknown>;
      if (
        hasBodyField(rawBody, "observacao_campo", "observacaoCampo") ||
        hasBodyField(rawBody, "equipe", "equipeIds") ||
        hasBodyField(rawBody, "data_vistoria", "dataVistoria")
      ) {
        return res.status(400).json({
          error: "Alterações de observação de campo ou equipe devem usar a rota específica.",
        });
      }

      const validation = validateAndBuildSolicitacaoPayload(rawBody, {
        requireRelato: false,
      });
      if (!validation.ok || !validation.payload) {
        return res.status(400).json({ error: validation.error || "Dados inválidos." });
      }

      const wantsCancel =
        normalizeComparableText(rawBody.status) === "cancelada";
      if (wantsCancel) {
        if (hasBodyField(rawBody, "motivo_cancelamento", "motivoCancelamento")) {
          const checkMotivo = validateSimpleTextField(
            "motivo do cancelamento",
            extractBodyField(rawBody, "motivo_cancelamento", "motivoCancelamento"),
            { maxLength: MAX_MOTIVO_CANCELAMENTO_LENGTH }
          );
          if (!checkMotivo.ok) {
            return res.status(400).json({ error: checkMotivo.error });
          }
          if (checkMotivo.value) {
            validation.payload.motivo_cancelamento = checkMotivo.value;
          }
        }
        validation.payload.status = "cancelada";
        validation.payload.cancelado_em = new Date().toISOString();
        validation.payload.cancelado_por_id = authUser.id;
        validation.payload.cancelado_por_nome = deps.getAuthorDisplayName(authUser);
      }

      if (Object.keys(validation.payload).length === 0) {
        return res.status(400).json({ error: "Nenhum campo válido informado para atualização." });
      }

      const cfg = getAdministraSolicitacoesConfig();
      if (!cfg) {
        return res.status(503).json({
          error: "Serviço central de solicitações de vistoria não configurado no servidor.",
        });
      }

      const existingRes = await callAdministraApi(cfg, `/${encodeURIComponent(id)}`, {
        method: "GET",
      });
      if (!existingRes.ok) {
        return handleUpstreamFailure(
          res,
          existingRes,
          "Não foi possível consultar a solicitação de vistoria."
        );
      }

      const existing = unwrapUpstreamRecord(existingRes.data);
      if (!existing) {
        return res.status(404).json({ error: "Solicitação de vistoria não encontrada." });
      }
      if (!isNotificaOrigem(existing)) {
        return res.status(403).json({
          error: "Solicitação não pertence ao sistema Notifica.",
        });
      }

      if (authUser.perfil !== "Administrador" && !isSolicitacaoOwner(existing, authUser)) {
        return res.status(403).json({
          error: "Apenas o solicitante ou Administrador pode editar esta solicitação.",
        });
      }

      const currentStatus = normalizeComparableText(existing.status);
      if (currentStatus === "cancelada") {
        return res.status(409).json({ error: "Solicitação cancelada não pode ser alterada." });
      }
      if (currentStatus === "realizada" || currentStatus === "concluida") {
        return res.status(409).json({
          error: "Não é possível alterar uma solicitação cuja vistoria já foi realizada.",
        });
      }

      const upstream = await callAdministraApi(cfg, `/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: validation.payload,
      });

      if (!upstream.ok) {
        return handleUpstreamFailure(
          res,
          upstream,
          "Não foi possível atualizar a solicitação de vistoria."
        );
      }

      const updated = sanitizeSolicitacaoRecord(unwrapUpstreamRecord(upstream.data));
      if (!updated) {
        return res.status(502).json({
          error: "Resposta inválida do serviço central de solicitações de vistoria.",
        });
      }

      return res.json({ solicitacao: updated });
    }
  );

  return router;
}
