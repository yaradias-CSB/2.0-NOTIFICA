import crypto from "node:crypto";

export type AdministraClientMode = "unconfigured" | "api-v2";

export interface AdministraClientConfig {
  endpoint: string;
  keyId: string;
  privateKey: crypto.KeyObject;
  mode: "api-v2";
}

export interface AdministraBarragemV2Dto {
  id: string;
  nome?: string | null;
  car?: string | null;
  uf?: string | null;
  municipio?: string | null;
  municipioIbge?: string | number | null;
  empreendedorId?: string | null;
  empreendimento?: string | null;
  processo?: string | null;
  snisb?: string | null;
  cursoAgua?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  altura?: number | string | null;
  volume?: number | string | null;
  danoPotencial?: string | null;
  categoriaRisco?: string | null;
  classificadaEm?: string | null;
  situacao?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdministraPaginationMeta {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface AdministraBarragensV2Response {
  success: true;
  apiVersion: string;
  items: AdministraBarragemV2Dto[];
  pagination: AdministraPaginationMeta;
  maskingPolicy: string | Record<string, unknown>;
}

export interface AdministraHttpRequestResult<T = unknown> {
  ok: boolean;
  configured: boolean;
  status: number;
  timedOut: boolean;
  authDenied: boolean;
  errorCode?:
    | "ADMINISTRA_UNCONFIGURED"
    | "ADMINISTRA_TIMEOUT"
    | "ADMINISTRA_AUTH_DENIED"
    | "ADMINISTRA_HTTP_ERROR"
    | "ADMINISTRA_INVALID_JSON"
    | "ADMINISTRA_INVALID_CONTRACT"
    | "ADMINISTRA_PAGINATION_LIMIT"
    | "ADMINISTRA_NETWORK_ERROR";
  data: T | null;
}

export interface AdministraBarragensBundle {
  configured: boolean;
  mode: AdministraClientMode;
  ok: boolean;
  status: number;
  timedOut: boolean;
  authDenied: boolean;
  pagesFetched: number;
  truncatedByPageLimit: boolean;
  maskingPolicy?: string | Record<string, unknown>;
  pagination?: AdministraPaginationMeta;
  errorCode?: AdministraHttpRequestResult["errorCode"];
  barragensRows: AdministraBarragemV2Dto[];
}

export interface AdministraHttpClientOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxPages?: number;
  nowMs?: () => number;
  generateJti?: () => string;
}

export interface S2sCanonicalMessageInput {
  method: string;
  path: string;
  canonicalQuery: string;
  contentType?: string;
  bodySha256: string;
  keyId: string;
  timestamp: string;
  jti: string;
  consumerUserId?: string;
  consumerRole?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 10;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_LIMIT = 500;
const DEFAULT_MAX_PAGES = 100;
const MAX_ALLOWED_PAGES = 200;

export const EMPTY_BODY_SHA256 = crypto
  .createHash("sha256")
  .update("")
  .digest("hex")
  .toLowerCase();

const BARRAGEM_V2_TEXT_FIELDS = new Set([
  "nome",
  "car",
  "uf",
  "municipio",
  "empreendedorId",
  "empreendimento",
  "processo",
  "snisb",
  "cursoAgua",
  "danoPotencial",
  "categoriaRisco",
  "classificadaEm",
  "situacao",
  "createdAt",
  "updatedAt",
]);

const BARRAGEM_V2_NUM_OR_TEXT_FIELDS = new Set([
  "municipioIbge",
  "latitude",
  "longitude",
  "altura",
  "volume",
]);

const BARRAGEM_V2_ALLOWED_KEYS = new Set([
  "id",
  ...BARRAGEM_V2_TEXT_FIELDS,
  ...BARRAGEM_V2_NUM_OR_TEXT_FIELDS,
]);

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === "object" && !Array.isArray(val);
}

const S2S_KEY_ID_REGEX = /^[A-Za-z0-9._:-]{1,128}$/;

function isDevOrTestEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  hostname: string
): boolean {
  const nodeEnv = String(env.NODE_ENV ?? process.env.NODE_ENV ?? "").trim().toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV ?? process.env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "production" || vercelEnv === "production") {
    return false;
  }
  if (nodeEnv === "development" || nodeEnv === "test") {
    return true;
  }
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isValidHttpEndpoint(
  rawEndpoint: string | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): string | null {
  const trimmed = String(rawEndpoint || "").trim();
  if (
    !trimmed ||
    /placeholder/i.test(trimmed) ||
    /[\r\n]/.test(trimmed) ||
    trimmed.includes("?") ||
    trimmed.includes("#")
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  // Rejeita credenciais embutidas na URL (user:pass@host)
  if (parsed.username || parsed.password) {
    return null;
  }

  // Rejeita query ou fragmento
  if (parsed.search || parsed.hash) {
    return null;
  }

  // Exige HTTPS em produção (http permitido apenas em dev/test)
  if (parsed.protocol === "http:" && !isDevOrTestEnv(env, parsed.hostname)) {
    return null;
  }

  // Remove apenas um sufixo final /api/v2, preservando eventual prefixo de gateway
  const cleanPathname = parsed.pathname
    .replace(/\/+$/, "")
    .replace(/\/api\/v2$/i, "")
    .replace(/\/+$/, "");

  return `${parsed.origin}${cleanPathname}`;
}

function isValidKeyId(rawKeyId: string | undefined): string | null {
  const trimmed = String(rawKeyId || "").trim();
  if (!trimmed || /placeholder/i.test(trimmed) || /[\r\n]/.test(trimmed)) {
    return null;
  }
  if (!S2S_KEY_ID_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseEd25519PrivateKey(rawPem: string | undefined): crypto.KeyObject | null {
  const normalized = String(rawPem || "")
    .trim()
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n");

  if (!normalized || /placeholder/i.test(normalized)) {
    return null;
  }

  try {
    const keyObject = crypto.createPrivateKey({
      key: normalized,
      format: "pem",
    });
    if (keyObject.asymmetricKeyType !== "ed25519") {
      return null;
    }
    return keyObject;
  } catch {
    return null;
  }
}

function resolveTimeoutMs(
  explicitTimeoutMs: number | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): number {
  const candidate =
    explicitTimeoutMs !== undefined
      ? explicitTimeoutMs
      : Number(env.ADMINISTRA_API_TIMEOUT_MS);

  if (Number.isFinite(candidate) && candidate > 0) {
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(candidate)));
  }
  return DEFAULT_TIMEOUT_MS;
}

function resolveMaxPages(explicitMaxPages: number | undefined): number {
  if (
    explicitMaxPages !== undefined &&
    Number.isFinite(explicitMaxPages) &&
    explicitMaxPages >= 1
  ) {
    return Math.min(MAX_ALLOWED_PAGES, Math.trunc(explicitMaxPages));
  }
  return DEFAULT_MAX_PAGES;
}

/**
 * Resolve as credenciais S2S-V2 exclusivamente a partir de `ADMINISTRA_API_URL`,
 * `ADMINISTRA_S2S_KEY_ID` e `ADMINISTRA_S2S_PRIVATE_KEY_PEM` no servidor.
 * Sem as três variáveis válidas, o cliente permanece desconfigurado.
 */
export function resolveAdministraClientConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AdministraClientConfig | null {
  const endpoint = isValidHttpEndpoint(env.ADMINISTRA_API_URL, env);
  const keyId = isValidKeyId(env.ADMINISTRA_S2S_KEY_ID);
  const privateKey = parseEd25519PrivateKey(env.ADMINISTRA_S2S_PRIVATE_KEY_PEM);
  if (!endpoint || !keyId || !privateKey) {
    return null;
  }

  return {
    endpoint,
    keyId,
    privateKey,
    mode: "api-v2",
  };
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function canonicalizeQueryRfc3986(entries: Array<[string, string]>): string {
  if (!entries.length) return "";
  const encoded = entries.map(([k, v]): [string, string] => [
    encodeRfc3986(k),
    encodeRfc3986(v),
  ]);
  encoded.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });
  return encoded.map(([k, v]) => `${k}=${v}`).join("&");
}

export function normalizeContentType(rawContentType?: string | null): string {
  if (!rawContentType) return "";
  const trimmed = rawContentType.trim();
  if (!trimmed) return "";
  return trimmed.split(";")[0].trim().toLowerCase();
}

export function buildS2sCanonicalMessage(input: S2sCanonicalMessageInput): string {
  const consumerSegment = `${input.consumerUserId || ""}|${input.consumerRole || ""}`;
  return [
    "S2S-V2",
    input.method.toUpperCase(),
    input.path,
    input.canonicalQuery,
    normalizeContentType(input.contentType),
    input.bodySha256.toLowerCase(),
    input.keyId,
    input.timestamp,
    input.jti,
    consumerSegment,
  ].join("\n");
}

function hasNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

function isOptionalStringOrNull(val: unknown): boolean {
  return val === undefined || val === null || typeof val === "string";
}

function isOptionalNumOrStringOrNull(val: unknown): boolean {
  if (val === undefined || val === null || typeof val === "string") return true;
  return typeof val === "number" && Number.isFinite(val);
}

function isValidBarragemV2Dto(item: unknown): item is AdministraBarragemV2Dto {
  if (!isPlainObject(item)) {
    return false;
  }

  for (const key of Object.keys(item)) {
    if (!BARRAGEM_V2_ALLOWED_KEYS.has(key)) {
      return false;
    }
  }

  if (!hasNonEmptyString(item.id)) {
    return false;
  }

  for (const key of BARRAGEM_V2_TEXT_FIELDS) {
    if (!isOptionalStringOrNull(item[key])) {
      return false;
    }
  }

  for (const key of BARRAGEM_V2_NUM_OR_TEXT_FIELDS) {
    if (!isOptionalNumOrStringOrNull(item[key])) {
      return false;
    }
  }

  return (
    hasNonEmptyString(item.nome) ||
    hasNonEmptyString(item.empreendimento) ||
    hasNonEmptyString(item.snisb)
  );
}

function parseBarragensV2Contract(
  payload: unknown
): { valid: true; data: AdministraBarragensV2Response } | { valid: false } {
  if (!isPlainObject(payload)) {
    return { valid: false };
  }

  if (payload.success !== true) {
    return { valid: false };
  }

  if (
    typeof payload.apiVersion !== "string" ||
    !/^v?2(?:\.|$)/i.test(payload.apiVersion.trim())
  ) {
    return { valid: false };
  }

  if (!Array.isArray(payload.items)) {
    return { valid: false };
  }

  if (!isPlainObject(payload.pagination)) {
    return { valid: false };
  }

  const { limit, hasMore, nextCursor } = payload.pagination;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return { valid: false };
  }
  if (typeof hasMore !== "boolean") {
    return { valid: false };
  }
  if (!("nextCursor" in payload.pagination)) {
    return { valid: false };
  }
  if (hasMore) {
    if (!hasNonEmptyString(nextCursor)) {
      return { valid: false };
    }
  } else if (nextCursor !== null && typeof nextCursor !== "string") {
    return { valid: false };
  }

  const maskingPolicy = payload.maskingPolicy;
  const hasValidMaskingPolicy =
    hasNonEmptyString(maskingPolicy) || isPlainObject(maskingPolicy);
  if (!hasValidMaskingPolicy) {
    return { valid: false };
  }

  const validItems: AdministraBarragemV2Dto[] = [];
  for (const item of payload.items) {
    if (!isValidBarragemV2Dto(item)) {
      return { valid: false };
    }
    validItems.push(item);
  }

  return {
    valid: true,
    data: {
      success: true,
      apiVersion: payload.apiVersion,
      items: validItems,
      pagination: {
        limit,
        hasMore,
        nextCursor: nextCursor === null ? null : String(nextCursor),
      },
      maskingPolicy: maskingPolicy as string | Record<string, unknown>,
    },
  };
}

function isAbortOrTimeoutError(err: unknown, abortedByController: boolean): boolean {
  if (abortedByController) return true;
  if (!err || typeof err !== "object") return false;
  const name = String((err as { name?: unknown }).name || "");
  return name === "AbortError" || name === "TimeoutError";
}

export function createAdministraHttpClient(options: AdministraHttpClientOptions = {}) {
  const getEnv = () => options.env ?? process.env;
  const callFetch: typeof fetch =
    options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const nowMs = options.nowMs ?? (() => Date.now());
  const generateJti = options.generateJti ?? (() => crypto.randomUUID());

  function getConfig(): AdministraClientConfig | null {
    return resolveAdministraClientConfig(getEnv());
  }

  function isConfigured(): boolean {
    return Boolean(getConfig());
  }

  function getMode(): AdministraClientMode {
    return getConfig() ? "api-v2" : "unconfigured";
  }

  async function requestConfirmedV2<T = unknown>(
    targetPath: "/api/v2/health" | "/api/v2/barragens",
    queryEntries: Array<[string, string]> = []
  ): Promise<AdministraHttpRequestResult<T>> {
    const config = getConfig();
    if (!config) {
      return {
        ok: false,
        configured: false,
        status: 503,
        timedOut: false,
        authDenied: false,
        errorCode: "ADMINISTRA_UNCONFIGURED",
        data: null,
      };
    }

    let baseUrl: URL;
    let targetUrl: URL;
    const canonicalQuery = canonicalizeQueryRfc3986(queryEntries);
    try {
      baseUrl = new URL(config.endpoint);
      targetUrl = new URL(`${config.endpoint}${targetPath}`);
      if (targetUrl.origin !== baseUrl.origin) {
        return {
          ok: false,
          configured: true,
          status: 502,
          timedOut: false,
          authDenied: false,
          errorCode: "ADMINISTRA_NETWORK_ERROR",
          data: null,
        };
      }
      if (canonicalQuery) {
        targetUrl.search = `?${canonicalQuery}`;
      }
    } catch {
      return {
        ok: false,
        configured: true,
        status: 502,
        timedOut: false,
        authDenied: false,
        errorCode: "ADMINISTRA_NETWORK_ERROR",
        data: null,
      };
    }

    const timestamp = String(Math.floor(nowMs() / 1000));
    const jti = generateJti();
    const canonicalMessage = buildS2sCanonicalMessage({
      method: "GET",
      path: targetUrl.pathname,
      canonicalQuery,
      contentType: "",
      bodySha256: EMPTY_BODY_SHA256,
      keyId: config.keyId,
      timestamp,
      jti,
    });
    const signature = crypto
      .sign(null, Buffer.from(canonicalMessage, "utf8"), config.privateKey)
      .toString("base64url");

    const timeoutMs = resolveTimeoutMs(options.timeoutMs, getEnv());
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await callFetch(targetUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-s2s-key-id": config.keyId,
          "x-s2s-timestamp": timestamp,
          "x-s2s-jti": jti,
          "x-s2s-body-sha256": EMPTY_BODY_SHA256,
          "x-s2s-signature": signature,
        },
        signal: controller.signal,
      });

      const authDenied = response.status === 401 || response.status === 403;
      if (!response.ok) {
        return {
          ok: false,
          configured: true,
          status: response.status,
          timedOut: false,
          authDenied,
          errorCode: authDenied ? "ADMINISTRA_AUTH_DENIED" : "ADMINISTRA_HTTP_ERROR",
          data: null,
        };
      }

      const rawText = await response.text();
      if (!rawText.trim()) {
        return {
          ok: false,
          configured: true,
          status: 502,
          timedOut: false,
          authDenied: false,
          errorCode: "ADMINISTRA_INVALID_CONTRACT",
          data: null,
        };
      }

      try {
        const parsed = JSON.parse(rawText) as T;
        return {
          ok: true,
          configured: true,
          status: response.status,
          timedOut: false,
          authDenied: false,
          data: parsed,
        };
      } catch {
        return {
          ok: false,
          configured: true,
          status: 502,
          timedOut: false,
          authDenied: false,
          errorCode: "ADMINISTRA_INVALID_JSON",
          data: null,
        };
      }
    } catch (err) {
      if (isAbortOrTimeoutError(err, timedOut)) {
        return {
          ok: false,
          configured: true,
          status: 504,
          timedOut: true,
          authDenied: false,
          errorCode: "ADMINISTRA_TIMEOUT",
          data: null,
        };
      }
      return {
        ok: false,
        configured: true,
        status: 502,
        timedOut: false,
        authDenied: false,
        errorCode: "ADMINISTRA_NETWORK_ERROR",
        data: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkHealth(): Promise<AdministraHttpRequestResult<Record<string, unknown>>> {
    const res = await requestConfirmedV2<unknown>("/api/v2/health");
    if (!res.ok) {
      return {
        ...res,
        data: null,
      };
    }
    if (!isPlainObject(res.data)) {
      return {
        ok: false,
        configured: true,
        status: 502,
        timedOut: false,
        authDenied: false,
        errorCode: "ADMINISTRA_INVALID_CONTRACT",
        data: null,
      };
    }
    return {
      ...res,
      data: res.data,
    };
  }

  /**
   * Consulta paginada a GET /api/v2/barragens com `limit=500` e `cursor=nextCursor`
   * até `hasMore=false`, respeitando teto de páginas e validando estritamente o contrato DTO v2.
   */
  async function fetchBarragens(): Promise<AdministraBarragensBundle> {
    const maxPages = resolveMaxPages(options.maxPages);
    const allRows: AdministraBarragemV2Dto[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let pagesFetched = 0;
    let lastStatus = 200;
    let lastMaskingPolicy: string | Record<string, unknown> | undefined;
    let lastPagination: AdministraPaginationMeta | undefined;

    for (let page = 1; page <= maxPages; page += 1) {
      const queryEntries: Array<[string, string]> = cursor
        ? [
            ["cursor", cursor],
            ["limit", String(DEFAULT_PAGE_LIMIT)],
          ]
        : [["limit", String(DEFAULT_PAGE_LIMIT)]];

      const res = await requestConfirmedV2<unknown>("/api/v2/barragens", queryEntries);
      if (!res.configured) {
        return {
          configured: false,
          mode: "unconfigured",
          ok: false,
          status: res.status,
          timedOut: false,
          authDenied: false,
          pagesFetched: 0,
          truncatedByPageLimit: false,
          errorCode: "ADMINISTRA_UNCONFIGURED",
          barragensRows: [],
        };
      }
      if (!res.ok) {
        return {
          configured: true,
          mode: "api-v2",
          ok: false,
          status: res.status,
          timedOut: res.timedOut,
          authDenied: res.authDenied,
          pagesFetched,
          truncatedByPageLimit: false,
          errorCode: res.errorCode,
          barragensRows: [],
        };
      }

      const parsed = parseBarragensV2Contract(res.data);
      if (!parsed.valid) {
        return {
          configured: true,
          mode: "api-v2",
          ok: false,
          status: 502,
          timedOut: false,
          authDenied: false,
          pagesFetched,
          truncatedByPageLimit: false,
          errorCode: "ADMINISTRA_INVALID_CONTRACT",
          barragensRows: [],
        };
      }

      pagesFetched = page;
      lastStatus = res.status;
      lastMaskingPolicy = parsed.data.maskingPolicy;
      lastPagination = parsed.data.pagination;
      allRows.push(...parsed.data.items);

      if (!parsed.data.pagination.hasMore) {
        return {
          configured: true,
          mode: "api-v2",
          ok: true,
          status: lastStatus,
          timedOut: false,
          authDenied: false,
          pagesFetched,
          truncatedByPageLimit: false,
          maskingPolicy: lastMaskingPolicy,
          pagination: lastPagination,
          barragensRows: allRows,
        };
      }

      const nextCursor = parsed.data.pagination.nextCursor;
      if (!nextCursor || seenCursors.has(nextCursor)) {
        return {
          configured: true,
          mode: "api-v2",
          ok: false,
          status: 502,
          timedOut: false,
          authDenied: false,
          pagesFetched,
          truncatedByPageLimit: false,
          errorCode: "ADMINISTRA_INVALID_CONTRACT",
          barragensRows: [],
        };
      }

      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    return {
      configured: true,
      mode: "api-v2",
      ok: false,
      status: 502,
      timedOut: false,
      authDenied: false,
      pagesFetched,
      truncatedByPageLimit: true,
      errorCode: "ADMINISTRA_PAGINATION_LIMIT",
      barragensRows: [],
    };
  }

  return {
    getConfig,
    isConfigured,
    getMode,
    checkHealth,
    fetchBarragens,
  };
}

export const defaultAdministraClient = createAdministraHttpClient();

export function isAdministraConfigured(): boolean {
  return defaultAdministraClient.isConfigured();
}

export function getAdministraClientMode(): AdministraClientMode {
  return defaultAdministraClient.getMode();
}

export function checkAdministraHealth(): Promise<AdministraHttpRequestResult<Record<string, unknown>>> {
  return defaultAdministraClient.checkHealth();
}

export function fetchAdministraBarragens(): Promise<AdministraBarragensBundle> {
  return defaultAdministraClient.fetchBarragens();
}
