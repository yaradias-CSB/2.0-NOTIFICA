export type AdministraClientMode = "unconfigured" | "api-v2";

export interface AdministraClientConfig {
  endpoint: string;
  token: string;
  mode: "api-v2";
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
  errorCode?: AdministraHttpRequestResult["errorCode"];
  barragensRows: Record<string, any>[];
}

export interface AdministraHttpClientOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 10;
const MAX_TIMEOUT_MS = 30_000;

function isValidHttpEndpoint(rawEndpoint: string | undefined): string | null {
  const trimmed = String(rawEndpoint || "").trim();
  if (!trimmed || /placeholder/i.test(trimmed) || /[\r\n]/.test(trimmed)) {
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

  return trimmed.replace(/\/+$/, "").replace(/\/api\/v2$/i, "");
}

function isValidToken(rawToken: string | undefined): string | null {
  const trimmed = String(rawToken || "").trim();
  if (
    !trimmed ||
    trimmed.length <= 10 ||
    /placeholder/i.test(trimmed) ||
    /[\r\n]/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
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

/**
 * Resolve as credenciais S2S exclusivamente a partir de `ADMINISTRA_API_URL` e `ADMINISTRA_API_TOKEN`
 * no servidor. Não possui fallback para Supabase, PostgREST ou credenciais legadas.
 */
export function resolveAdministraClientConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AdministraClientConfig | null {
  const endpoint = isValidHttpEndpoint(env.ADMINISTRA_API_URL);
  const token = isValidToken(env.ADMINISTRA_API_TOKEN);
  if (!endpoint || !token) {
    return null;
  }

  return {
    endpoint,
    token,
    mode: "api-v2",
  };
}

function asObjectArray(val: unknown): Record<string, any>[] {
  if (!Array.isArray(val)) return [];
  return val.filter((item): item is Record<string, any> => Boolean(item && typeof item === "object"));
}

function extractBarragensArray(payload: unknown): Record<string, any>[] {
  if (Array.isArray(payload)) {
    return asObjectArray(payload);
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["barragens", "items", "data"]) {
    if (Array.isArray(record[key])) {
      return asObjectArray(record[key]);
    }
  }

  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    const nested = record.data as Record<string, unknown>;
    for (const key of ["barragens", "items"]) {
      if (Array.isArray(nested[key])) {
        return asObjectArray(nested[key]);
      }
    }
  }

  return [];
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
    targetPath: "/api/v2/health" | "/api/v2/barragens"
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
          Authorization: `Bearer ${config.token}`,
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
          ok: true,
          configured: true,
          status: response.status,
          timedOut: false,
          authDenied: false,
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
    return requestConfirmedV2<Record<string, unknown>>("/api/v2/health");
  }

  async function fetchBarragens(): Promise<AdministraBarragensBundle> {
    const res = await requestConfirmedV2<unknown>("/api/v2/barragens");
    if (!res.configured) {
      return {
        configured: false,
        mode: "unconfigured",
        ok: false,
        status: res.status,
        timedOut: false,
        authDenied: false,
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
        errorCode: res.errorCode,
        barragensRows: [],
      };
    }
    return {
      configured: true,
      mode: "api-v2",
      ok: true,
      status: res.status,
      timedOut: false,
      authDenied: false,
      barragensRows: extractBarragensArray(res.data),
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
