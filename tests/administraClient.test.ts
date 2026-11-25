import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createAdministraHttpClient, resolveAdministraClientConfig } from "../server/administraClient.ts";

process.env.NODE_ENV = "test";
process.env.NOTIFICA_SUPABASE_URL = "https://notifica-test.supabase.co";
process.env.NOTIFICA_SUPABASE_ANON_KEY = "test-anon-key-notifica-123456";
process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-notifica-123456";

const ANALYST_ID = "22222222-2222-4222-8222-222222222222";
const VIEWER_ID = "33333333-3333-4333-8333-333333333333";

const PERFIS = [
  { id: ANALYST_ID, email: "analista@sema.mt.gov.br", nome: "Analista Silva", perfil: "Analista", status: "ativo" },
  { id: VIEWER_ID, email: "visualizador@sema.mt.gov.br", nome: "Visualizador Costa", perfil: "Visualizador", status: "ativo" },
];

const FAKE_API_V2_URL = "https://administra-api-v2.internal.test";
const FAKE_API_V2_TOKEN = "mock-administra-api-v2-token-123456";
const FAKE_LEGACY_URL = "https://administra-legacy.supabase.co";
const FAKE_LEGACY_TOKEN = "mock-legacy-service-role-token-123456";

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx|html)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test("administraClient: permanece desconfigurado e não faz chamadas quando ADMINISTRA_API_TOKEN estiver ausente (mesmo com variáveis legadas)", async () => {
  let called = 0;
  const mockFetch = (async () => {
    called += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const envWithoutTokenWithLegacy: Record<string, string | undefined> = {
    ADMINISTRA_API_URL: FAKE_API_V2_URL,
    ADMINISTRA_API_TOKEN: "",
    ADMINISTRA_SUPABASE_URL: FAKE_LEGACY_URL,
    ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_TOKEN,
    ADMINISTRA_SUPABASE_ANON_KEY: FAKE_LEGACY_TOKEN,
    ADMINISTRA_DB_URL: FAKE_LEGACY_URL,
    ADMINISTRA_DB_KEY: FAKE_LEGACY_TOKEN,
    CENTRAL_REGISTRY_ENDPOINT: FAKE_LEGACY_URL,
    CENTRAL_REGISTRY_TOKEN: FAKE_LEGACY_TOKEN,
  };
  assert.equal(resolveAdministraClientConfig(envWithoutTokenWithLegacy), null);

  const envPlaceholderToken: Record<string, string | undefined> = {
    ADMINISTRA_API_URL: FAKE_API_V2_URL,
    ADMINISTRA_API_TOKEN: "placeholder-token-123456",
  };
  assert.equal(resolveAdministraClientConfig(envPlaceholderToken), null);

  const envUrlWithCredentials: Record<string, string | undefined> = {
    ADMINISTRA_API_URL: "https://user:pass@administra-api-v2.internal.test",
    ADMINISTRA_API_TOKEN: FAKE_API_V2_TOKEN,
  };
  assert.equal(resolveAdministraClientConfig(envUrlWithCredentials), null);

  const client = createAdministraHttpClient({
    env: envWithoutTokenWithLegacy,
    fetchImpl: mockFetch,
  });
  assert.equal(client.isConfigured(), false);
  assert.equal(client.getMode(), "unconfigured");

  const health = await client.checkHealth();
  assert.equal(health.configured, false);
  assert.equal(health.ok, false);
  assert.equal(health.errorCode, "ADMINISTRA_UNCONFIGURED");

  const barragens = await client.fetchBarragens();
  assert.equal(barragens.configured, false);
  assert.equal(barragens.ok, false);
  assert.equal(barragens.errorCode, "ADMINISTRA_UNCONFIGURED");
  assert.equal(called, 0);
});

test("administraClient (simulado): usa somente /api/v2/health e /api/v2/barragens com Bearer S2S e trata sucesso, 401/403, 500, JSON inválido e timeout", async () => {
  const baseEnv = {
    ADMINISTRA_API_URL: `${FAKE_API_V2_URL}/api/v2/`,
    ADMINISTRA_API_TOKEN: FAKE_API_V2_TOKEN,
  };

  // 1) Sucesso em GET /api/v2/health e GET /api/v2/barragens
  const observedRequests: Array<{ url: string; auth: string | null; apikey: string | null }> = [];
  const successClient = createAdministraHttpClient({
    env: baseEnv,
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const url = typeof input === "string" ? input : input.toString();
      observedRequests.push({
        url,
        auth: headers.get("Authorization"),
        apikey: headers.get("apikey"),
      });

      if (url === `${FAKE_API_V2_URL}/api/v2/health`) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === `${FAKE_API_V2_URL}/api/v2/barragens`) {
        return new Response(
          JSON.stringify({
            barragens: [
              {
                id: "bar-v2-1",
                empreendedor_id: "emp-v2-1",
                nome_barragem: "Barragem V2",
                municipio: "Cuiabá",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch,
  });

  const healthOk = await successClient.checkHealth();
  assert.equal(healthOk.configured, true);
  assert.equal(healthOk.ok, true);

  const barragensOk = await successClient.fetchBarragens();
  assert.equal(barragensOk.configured, true);
  assert.equal(barragensOk.mode, "api-v2");
  assert.equal(barragensOk.ok, true);
  assert.equal(barragensOk.barragensRows.length, 1);

  assert.deepEqual(
    observedRequests.map((r) => r.url),
    [`${FAKE_API_V2_URL}/api/v2/health`, `${FAKE_API_V2_URL}/api/v2/barragens`]
  );
  assert.ok(
    observedRequests.every(
      (r) => r.auth === `Bearer ${FAKE_API_V2_TOKEN}` && r.apikey === null
    )
  );

  // 2) Erro HTTP 500 sem expor token
  const serverErrorClient = createAdministraHttpClient({
    env: baseEnv,
    fetchImpl: (async () =>
      new Response(JSON.stringify({ error: `Falha interna Bearer ${FAKE_API_V2_TOKEN}` }), {
        status: 500,
      })) as typeof fetch,
  });
  const err500 = await serverErrorClient.fetchBarragens();
  assert.equal(err500.configured, true);
  assert.equal(err500.ok, false);
  assert.equal(err500.authDenied, false);
  assert.equal(err500.timedOut, false);
  assert.equal(err500.errorCode, "ADMINISTRA_HTTP_ERROR");
  assert.equal(JSON.stringify(err500).includes(FAKE_API_V2_TOKEN), false);

  // 3) Erro HTTP 403 (escopo S2S negado)
  const scopeDeniedClient = createAdministraHttpClient({
    env: baseEnv,
    fetchImpl: (async () =>
      new Response(JSON.stringify({ error: "Insufficient S2S scope" }), { status: 403 })) as typeof fetch,
  });
  const err403 = await scopeDeniedClient.fetchBarragens();
  assert.equal(err403.configured, true);
  assert.equal(err403.ok, false);
  assert.equal(err403.authDenied, true);
  assert.equal(err403.errorCode, "ADMINISTRA_AUTH_DENIED");

  // 4) JSON inválido
  const invalidJsonClient = createAdministraHttpClient({
    env: baseEnv,
    fetchImpl: (async () => new Response("{invalid-json", { status: 200 })) as typeof fetch,
  });
  const badJson = await invalidJsonClient.fetchBarragens();
  assert.equal(badJson.configured, true);
  assert.equal(badJson.ok, false);
  assert.equal(badJson.errorCode, "ADMINISTRA_INVALID_JSON");

  // 5) Timeout
  const timeoutClient = createAdministraHttpClient({
    env: baseEnv,
    timeoutMs: 25,
    fetchImpl: ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
          return;
        }
        signal?.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as typeof fetch,
  });
  const timeoutRes = await timeoutClient.fetchBarragens();
  assert.equal(timeoutRes.configured, true);
  assert.equal(timeoutRes.ok, false);
  assert.equal(timeoutRes.timedOut, true);
  assert.equal(timeoutRes.errorCode, "ADMINISTRA_TIMEOUT");
});

test("Rotas do servidor usam apenas GET /api/v2/health e GET /api/v2/barragens, sem Supabase legado nem rotas não confirmadas", async () => {
  const originalFetch = globalThis.fetch;
  let adminCalls: Array<{ path: string; auth: string | null; apikey: string | null }> = [];
  let legacyCalls = 0;
  let scenario: "ok" | "scope-denied" | "error" | "timeout" = "ok";

  const serverModule = await import("../server.ts");
  const app = serverModule.default;

  let server!: http.Server;
  let baseUrl = "";

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (rawUrl.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }

    const url = new URL(rawUrl);
    const headers = new Headers(init?.headers);

    if (url.origin === "https://notifica-test.supabase.co") {
      if (url.pathname === "/auth/v1/user") {
        const token = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        const map: Record<string, { id: string; email: string }> = {
          "token-analyst": { id: ANALYST_ID, email: "analista@sema.mt.gov.br" },
          "token-viewer": { id: VIEWER_ID, email: "visualizador@sema.mt.gov.br" },
        };
        const user = map[token];
        if (!user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
        return new Response(
          JSON.stringify({ id: user.id, email: user.email, app_metadata: {}, user_metadata: {} }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.pathname === "/rest/v1/perfis_usuarios") {
        const idFilter = url.searchParams.get("id");
        if (idFilter?.startsWith("eq.")) {
          return new Response(JSON.stringify(PERFIS.filter((p) => p.id === idFilter.slice(3))), { status: 200 });
        }
        return new Response(JSON.stringify(PERFIS), { status: 200 });
      }
    }

    if (url.origin === FAKE_LEGACY_URL) {
      legacyCalls += 1;
      return new Response(JSON.stringify({ error: "Legacy endpoint forbidden" }), { status: 500 });
    }

    if (url.origin === FAKE_API_V2_URL) {
      adminCalls.push({
        path: `${url.pathname}${url.search}`,
        auth: headers.get("Authorization"),
        apikey: headers.get("apikey"),
      });

      if (scenario === "error") {
        return new Response(JSON.stringify({ error: "Upstream unavailable" }), { status: 502 });
      }

      if (scenario === "timeout") {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const abortHandler = () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          };
          if (signal?.aborted) {
            abortHandler();
            return;
          }
          signal?.addEventListener("abort", abortHandler);
        });
      }

      if (url.pathname === "/api/v2/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/api/v2/barragens") {
        if (scenario === "scope-denied") {
          return new Response(JSON.stringify({ error: "Missing barragens:read scope" }), { status: 403 });
        }
        return new Response(
          JSON.stringify({
            barragens: [
              {
                id: "bar-api2-1",
                empreendedor_id: "emp-api2-1",
                empreendedor_nome: "Empreendedor API 2",
                empreendedor_cpf_cnpj: "12345678901",
                nome_barragem: "Barragem API 2",
                municipio: "Cuiabá",
                uf: "MT",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ error: "Unconfirmed Administra endpoint" }), { status: 404 });
    }

    return new Response(JSON.stringify({ error: "Not mocked" }), { status: 404 });
  }) as typeof fetch;

  const savedEnv = {
    ADMINISTRA_API_URL: process.env.ADMINISTRA_API_URL,
    ADMINISTRA_API_TOKEN: process.env.ADMINISTRA_API_TOKEN,
    ADMINISTRA_API_TIMEOUT_MS: process.env.ADMINISTRA_API_TIMEOUT_MS,
    ADMINISTRA_SUPABASE_URL: process.env.ADMINISTRA_SUPABASE_URL,
    ADMINISTRA_SUPABASE_ANON_KEY: process.env.ADMINISTRA_SUPABASE_ANON_KEY,
    ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY: process.env.ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY,
    ADMINISTRA_DB_URL: process.env.ADMINISTRA_DB_URL,
    ADMINISTRA_DB_KEY: process.env.ADMINISTRA_DB_KEY,
    CENTRAL_REGISTRY_ENDPOINT: process.env.CENTRAL_REGISTRY_ENDPOINT,
    CENTRAL_REGISTRY_TOKEN: process.env.CENTRAL_REGISTRY_TOKEN,
  };

  try {
    // Caso A: Sem token da API 2.0 (mesmo com variáveis legadas preenchidas) -> sem fallback, zero chamadas externas
    process.env.ADMINISTRA_SUPABASE_URL = FAKE_LEGACY_URL;
    process.env.ADMINISTRA_SUPABASE_ANON_KEY = FAKE_LEGACY_TOKEN;
    process.env.ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY = FAKE_LEGACY_TOKEN;
    process.env.ADMINISTRA_DB_URL = FAKE_LEGACY_URL;
    process.env.ADMINISTRA_DB_KEY = FAKE_LEGACY_TOKEN;
    process.env.CENTRAL_REGISTRY_ENDPOINT = FAKE_LEGACY_URL;
    process.env.CENTRAL_REGISTRY_TOKEN = FAKE_LEGACY_TOKEN;
    process.env.ADMINISTRA_API_URL = FAKE_API_V2_URL;
    process.env.ADMINISTRA_API_TOKEN = "";

    const statusUnconf = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
      headers: { Authorization: "Bearer token-viewer" },
    });
    assert.equal(statusUnconf.status, 200);
    const statusUnconfJson = (await statusUnconf.json()) as { systems: Record<string, boolean> };
    assert.equal(statusUnconfJson.systems.ADMINISTRA, false);

    const bootUnconf = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
      headers: { Authorization: "Bearer token-viewer" },
    });
    assert.equal(bootUnconf.status, 200);
    const bootUnconfJson = (await bootUnconf.json()) as { remoteEnabled: boolean; barragens: unknown[] };
    assert.equal(bootUnconfJson.remoteEnabled, false);
    assert.equal(bootUnconfJson.barragens.length, 0);

    const ecoUnconf = await originalFetch(`${baseUrl}/api/ecosystem/integrated-data?system=ADMINISTRA`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(ecoUnconf.status, 200);
    const ecoUnconfJson = (await ecoUnconf.json()) as {
      diagnostics: { ADMINISTRA: { remoteConfigured: boolean } };
    };
    assert.equal(ecoUnconfJson.diagnostics.ADMINISTRA.remoteConfigured, false);
    assert.equal(adminCalls.length, 0);
    assert.equal(legacyCalls, 0);

    // Caso B: API 2.0 configurada -> consome somente /api/v2/health e /api/v2/barragens (sem empreendedores/RTs/documentos)
    process.env.ADMINISTRA_API_TOKEN = FAKE_API_V2_TOKEN;
    scenario = "ok";
    adminCalls = [];

    const statusOk = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
      headers: { Authorization: "Bearer token-viewer" },
    });
    const statusOkJson = (await statusOk.json()) as { systems: Record<string, boolean> };
    assert.equal(statusOkJson.systems.ADMINISTRA, true);

    const bootViewerRes = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
      headers: { Authorization: "Bearer token-viewer" },
    });
    assert.equal(bootViewerRes.status, 200);
    const bootViewerText = await bootViewerRes.text();
    assert.equal(bootViewerText.includes(FAKE_API_V2_TOKEN), false);
    assert.equal(bootViewerText.includes(FAKE_API_V2_URL), false);
    const bootViewerJson = JSON.parse(bootViewerText) as {
      remoteEnabled: boolean;
      empreendedores: unknown[];
      barragens: Array<{ id: string; empreendedorCpfCnpj?: string }>;
      responsaveisTecnicos: unknown[];
    };
    assert.equal(bootViewerJson.remoteEnabled, true);
    assert.equal(bootViewerJson.empreendedores.length, 0);
    assert.equal(bootViewerJson.responsaveisTecnicos.length, 0);
    assert.equal(bootViewerJson.barragens[0]?.id, "bar-api2-1");
    assert.notEqual(bootViewerJson.barragens[0]?.empreendedorCpfCnpj, "12345678901");

    const searchAnalystRes = await originalFetch(`${baseUrl}/api/registry/search?q=API%202`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(searchAnalystRes.status, 200);
    const searchAnalystJson = (await searchAnalystRes.json()) as {
      remoteEnabled: boolean;
      empreendedores: unknown[];
      barragens: Array<{ id: string }>;
      responsaveisTecnicos: unknown[];
    };
    assert.equal(searchAnalystJson.remoteEnabled, true);
    assert.equal(searchAnalystJson.empreendedores.length, 0);
    assert.equal(searchAnalystJson.responsaveisTecnicos.length, 0);
    assert.equal(searchAnalystJson.barragens[0]?.id, "bar-api2-1");

    const ecoRes = await originalFetch(`${baseUrl}/api/ecosystem/integrated-data?system=ADMINISTRA`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(ecoRes.status, 200);
    const ecoText = await ecoRes.text();
    assert.equal(ecoText.includes(FAKE_API_V2_TOKEN), false);
    const ecoJson = JSON.parse(ecoText) as {
      diagnostics: {
        ADMINISTRA: {
          remoteConfigured: boolean;
          reachable: boolean;
          empreendedoresCount: number;
          barragensCount: number;
          rtsCount: number;
          productsCount: number;
        };
      };
      barragens: Array<{ id: string }>;
    };
    assert.equal(ecoJson.diagnostics.ADMINISTRA.remoteConfigured, true);
    assert.equal(ecoJson.diagnostics.ADMINISTRA.reachable, true);
    assert.equal(ecoJson.diagnostics.ADMINISTRA.empreendedoresCount, 0);
    assert.equal(ecoJson.diagnostics.ADMINISTRA.barragensCount, 1);
    assert.equal(ecoJson.diagnostics.ADMINISTRA.rtsCount, 0);
    assert.equal(ecoJson.diagnostics.ADMINISTRA.productsCount, 0);
    assert.equal(ecoJson.barragens[0]?.id, "bar-api2-1");

    assert.equal(legacyCalls, 0);
    assert.ok(adminCalls.length >= 4);
    assert.ok(
      adminCalls.every(
        (c) =>
          (c.path === "/api/v2/health" || c.path === "/api/v2/barragens") &&
          c.auth === `Bearer ${FAKE_API_V2_TOKEN}` &&
          c.apikey === null
      )
    );

    // Caso C: Escopo S2S ausente em /api/v2/barragens (403)
    scenario = "scope-denied";
    const ecoDeniedRes = await originalFetch(`${baseUrl}/api/ecosystem/integrated-data?system=ADMINISTRA`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(ecoDeniedRes.status, 200);
    const ecoDeniedJson = (await ecoDeniedRes.json()) as {
      diagnostics: { ADMINISTRA: { authDenied: boolean; barragensCount: number } };
    };
    assert.equal(ecoDeniedJson.diagnostics.ADMINISTRA.authDenied, true);
    assert.equal(ecoDeniedJson.diagnostics.ADMINISTRA.barragensCount, 0);

    // Caso D: Erro HTTP upstream -> remoteEnabled: false
    scenario = "error";
    const searchErrRes = await originalFetch(`${baseUrl}/api/registry/search?q=API%202`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(searchErrRes.status, 200);
    const searchErrJson = (await searchErrRes.json()) as { remoteEnabled: boolean; barragens: unknown[] };
    assert.equal(searchErrJson.remoteEnabled, false);
    assert.equal(searchErrJson.barragens.length, 0);

    // Caso E: Timeout upstream -> fecha com segurança e sem vazar segredos
    scenario = "timeout";
    process.env.ADMINISTRA_API_TIMEOUT_MS = "25";
    const bootTimeoutRes = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(bootTimeoutRes.status, 200);
    const bootTimeoutJson = (await bootTimeoutRes.json()) as { remoteEnabled: boolean };
    assert.equal(bootTimeoutJson.remoteEnabled, false);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("Fronteira de segredos: frontend (src/) e .env.example não expõem credenciais do servidor nem legado do Administra", () => {
  const rootDir = process.cwd();
  const frontendFiles = collectSourceFiles(path.join(rootDir, "src"));
  const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf-8");

  const forbiddenFrontendPatterns = [
    /\bADMINISTRA_API_[A-Z0-9_]*/,
    /\bADMINISTRA_SUPABASE_[A-Z0-9_]*/,
    /\bADMINISTRA_DB_[A-Z0-9_]*/,
    /\bADMINISTRA_SERVICE_[A-Z0-9_]*/,
    /\bCENTRAL_REGISTRY_[A-Z0-9_]*/,
    /\bADMINISTRA_SOLICITACOES_URL\b/,
    /\bSOLICITACOES_SERVICE_TOKEN\b/,
    /\bNOTIFICA_SUPABASE_SERVICE_ROLE_KEY\b/,
    /\bVITE_ADMINISTRA_[A-Z0-9_]*/,
  ];

  for (const filePath of frontendFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const pattern of forbiddenFrontendPatterns) {
      assert.equal(
        pattern.test(content),
        false,
        `Frontend não deve referenciar credencial de servidor (${pattern}) em ${path.relative(rootDir, filePath)}`
      );
    }
  }

  for (const pattern of forbiddenFrontendPatterns) {
    assert.equal(pattern.test(indexHtml), false, `index.html não deve referenciar ${pattern}`);
  }

  const envExample = fs.readFileSync(path.join(rootDir, ".env.example"), "utf-8");
  assert.match(envExample, /^ADMINISTRA_API_URL=$/m);
  assert.match(envExample, /^ADMINISTRA_API_TOKEN=$/m);
  assert.equal(/ADMINISTRA_SUPABASE_/.test(envExample), false);
});
