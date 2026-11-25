import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { LocalAdministraRepository } from "../src/data/localAdministraRepository.ts";

process.env.NODE_ENV = "test";
process.env.NOTIFICA_SUPABASE_URL = "https://notifica-test.supabase.co";
process.env.NOTIFICA_SUPABASE_ANON_KEY = "test-anon-key-notifica-123456";
process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-notifica-123456";
process.env.ADMINISTRA_API_URL = "https://administra-api.internal.test";
process.env.ADMINISTRA_API_TOKEN = "test-s2s-token-administra-123456";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ANALYST_ID = "22222222-2222-4222-8222-222222222222";
const VIEWER_ID = "33333333-3333-4333-8333-333333333333";

const PERFIS = [
  { id: ADMIN_ID, email: "admin@sema.mt.gov.br", nome: "Admin Principal", perfil: "Administrador", status: "ativo" },
  { id: ANALYST_ID, email: "analista@sema.mt.gov.br", nome: "Analista Silva", perfil: "Analista", status: "ativo" },
  { id: VIEWER_ID, email: "visualizador@sema.mt.gov.br", nome: "Visualizador Costa", perfil: "Visualizador", status: "ativo" },
];

const originalFetch = globalThis.fetch;
let registraWriteExternalCalls = 0;
let registraReadExternalCalls = 0;
let notificaDocWriteCalls = 0;

function resetCounters() {
  registraWriteExternalCalls = 0;
  registraReadExternalCalls = 0;
  notificaDocWriteCalls = 0;
}

function installMockFetch(baseServerUrl: string) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (rawUrl.startsWith(baseServerUrl)) {
      return originalFetch(input, init);
    }

    const url = new URL(rawUrl);
    const method = String(init?.method || "GET").toUpperCase();
    const headers = new Headers(init?.headers);

    if (url.origin === "https://notifica-test.supabase.co") {
      if (url.pathname === "/auth/v1/user") {
        const token = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        const tokenMap: Record<string, { id: string; email: string }> = {
          "token-admin": { id: ADMIN_ID, email: "admin@sema.mt.gov.br" },
          "token-analyst": { id: ANALYST_ID, email: "analista@sema.mt.gov.br" },
          "token-viewer": { id: VIEWER_ID, email: "visualizador@sema.mt.gov.br" },
        };
        const user = tokenMap[token];
        if (!user) {
          return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
        }
        return new Response(
          JSON.stringify({ id: user.id, email: user.email, app_metadata: {}, user_metadata: {} }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.pathname === "/rest/v1/perfis_usuarios" && method === "GET") {
        const idFilter = url.searchParams.get("id");
        if (idFilter?.startsWith("eq.")) {
          const targetId = idFilter.slice(3);
          return new Response(JSON.stringify(PERFIS.filter((p) => p.id === targetId)), { status: 200 });
        }
        return new Response(JSON.stringify(PERFIS), { status: 200 });
      }

      if (url.pathname === "/rest/v1/pareceres" && method === "POST") {
        notificaDocWriteCalls += 1;
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        return new Response(JSON.stringify([{ id: body.id || "parecer-1", ...body }]), { status: 201 });
      }
    }

    if (url.hostname.includes("supabase.co") && url.origin !== "https://notifica-test.supabase.co") {
      registraReadExternalCalls += 1;
      return new Response(JSON.stringify({ error: "Legacy Supabase must never be called" }), { status: 500 });
    }

    if (url.origin === "https://administra-api.internal.test") {
      if (method !== "GET") {
        registraWriteExternalCalls += 1;
        return new Response(JSON.stringify({ error: "External write should not be called" }), { status: 500 });
      }

      if (headers.get("Authorization") !== "Bearer test-s2s-token-administra-123456" || headers.has("apikey")) {
        return new Response(JSON.stringify({ error: "Unauthorized S2S request" }), { status: 401 });
      }

      registraReadExternalCalls += 1;
      if (url.pathname === "/api/v2/health") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.pathname === "/api/v2/barragens") {
        return new Response(
          JSON.stringify({
            barragens: [
              {
                id: "bar-adm-1",
                empreendedor_id: "emp-adm-1",
                empreendedor_nome: "Empreendedor Oficial Administra",
                nome_barragem: "Barragem Oficial",
                municipio: "Cuiabá",
                uf: "MT",
                source_system: "ADMINISTRA",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Unconfirmed route called" }), { status: 404 });
    }

    return new Response(JSON.stringify({ error: "Not mocked" }), { status: 404 });
  }) as typeof fetch;
}

const serverModule = await import("../server.ts");
const app = serverModule.default;

let server: http.Server;
let baseUrl = "";

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      installMockFetch(baseUrl);
      resolve();
    });
  });
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  resetCounters();
});

test("Rotas de escrita e exclusão no Administra retornam 409 sem fazer requisição externa (e respeitam 401/403)", async () => {
  const postRoutes = [
    { path: "/api/registry/empreendedores", body: { nome: "Empresa X", cpfCnpj: "12345678000199" } },
    { path: "/api/registry/barragens", body: { nomeBarragem: "Barragem Y", municipio: "Cuiabá" } },
    { path: "/api/registry/rts", body: { nome: "RT Z", registroProfissional: "CREA 999" } },
    { path: "/api/registry/rts/link-art", body: { rtNome: "RT Z", art: "ART-2026-001" } },
  ];

  for (const route of postRoutes) {
    const unauth = await originalFetch(`${baseUrl}${route.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(route.body),
    });
    assert.equal(unauth.status, 401);

    const viewerRes = await originalFetch(`${baseUrl}${route.path}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-viewer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(route.body),
    });
    assert.equal(viewerRes.status, 403);

    for (const token of ["token-analyst", "token-admin"]) {
      const blockedRes = await originalFetch(`${baseUrl}${route.path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(route.body),
      });
      assert.equal(blockedRes.status, 409);
      const payload = (await blockedRes.json()) as {
        synced?: boolean;
        blocked?: boolean;
        code?: string;
        error?: string;
      };
      assert.equal(payload.synced, false);
      assert.equal(payload.blocked, true);
      assert.equal(payload.code, "ADMINISTRA_WRITE_BLOCKED");
      assert.ok(payload.error && payload.error.length > 10);
    }
  }

  for (const kind of ["empreendedores", "barragens", "rts", "responsaveis_tecnicos"]) {
    const unauthDel = await originalFetch(`${baseUrl}/api/registry/${kind}/id-1`, { method: "DELETE" });
    assert.equal(unauthDel.status, 401);

    const analystDel = await originalFetch(`${baseUrl}/api/registry/${kind}/id-1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(analystDel.status, 403);

    const adminDel = await originalFetch(`${baseUrl}/api/registry/${kind}/id-1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer token-admin" },
    });
    assert.equal(adminDel.status, 409);
    const payload = (await adminDel.json()) as {
      deleted?: boolean;
      blocked?: boolean;
      code?: string;
    };
    assert.equal(payload.deleted, false);
    assert.equal(payload.blocked, true);
    assert.equal(payload.code, "ADMINISTRA_WRITE_BLOCKED");
  }

  assert.equal(registraWriteExternalCalls, 0);
  assert.equal(registraReadExternalCalls, 0);
});

test("Rotas de leitura do Administra continuam protegidas (401) e usam somente /api/v2/barragens", async () => {
  const unauthBootstrap = await originalFetch(`${baseUrl}/api/registry/bootstrap`);
  assert.equal(unauthBootstrap.status, 401);

  const unauthSearch = await originalFetch(`${baseUrl}/api/registry/search?q=Oficial`);
  assert.equal(unauthSearch.status, 401);

  const authBootstrap = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
    headers: { Authorization: "Bearer token-viewer" },
  });
  assert.equal(authBootstrap.status, 200);
  const bootBody = (await authBootstrap.json()) as {
    remoteEnabled?: boolean;
    empreendedores: Array<{ id: string }>;
    barragens: Array<{ id: string; nomeBarragem: string }>;
    responsaveisTecnicos: Array<{ id: string }>;
  };
  assert.equal(bootBody.remoteEnabled, true);
  assert.equal(bootBody.empreendedores.length, 0);
  assert.equal(bootBody.barragens.length, 1);
  assert.equal(bootBody.barragens[0]?.id, "bar-adm-1");
  assert.equal(bootBody.responsaveisTecnicos.length, 0);

  const authSearch = await originalFetch(`${baseUrl}/api/registry/search?q=Oficial`, {
    headers: { Authorization: "Bearer token-analyst" },
  });
  assert.equal(authSearch.status, 200);
  const searchBody = (await authSearch.json()) as {
    remoteEnabled?: boolean;
    empreendedores: Array<{ id: string }>;
    barragens: Array<{ id: string; nomeBarragem: string }>;
    responsaveisTecnicos: Array<{ id: string }>;
  };
  assert.equal(searchBody.remoteEnabled, true);
  assert.equal(searchBody.empreendedores.length, 0);
  assert.equal(searchBody.barragens[0]?.id, "bar-adm-1");
  assert.equal(searchBody.responsaveisTecnicos.length, 0);
  assert.ok(registraReadExternalCalls > 0);
  assert.equal(registraWriteExternalCalls, 0);
});

test("Gravação de documentos próprios do Notifica permanece funcionando sem bloqueio", async () => {
  const saveDocRes = await originalFetch(`${baseUrl}/api/documents/pareceres`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-analyst",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "parecer-notifica-1",
      processo: "123/2026",
      identificacaoEmpreendedor: "Empreendedor Local",
      municipio: "Cuiabá",
      status: "Concluído",
    }),
  });
  assert.equal(saveDocRes.status, 200);
  const docBody = (await saveDocRes.json()) as { synced?: boolean; item?: { id?: string } };
  assert.equal(docBody.synced, true);
  assert.equal(docBody.item?.id, "parecer-notifica-1");
  assert.equal(notificaDocWriteCalls, 1);
});

test("LocalAdministraRepository falha explicitamente no 409 e não simula persistência em localStorage", async () => {
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => storageMap.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storageMap.set(k, String(v));
    },
    removeItem: (k: string) => {
      storageMap.delete(k);
    },
    clear: () => {
      storageMap.clear();
    },
  };

  const prevWindow = (globalThis as any).window;
  const prevLocalStorage = (globalThis as any).localStorage;

  (globalThis as any).localStorage = mockLocalStorage;
  (globalThis as any).window = {};

  storageMap.set(
    "administra_barragens_empreendedores",
    JSON.stringify([
      {
        id: "emp-notifica-1",
        nome: "Existente",
        cpfCnpj: "123.456.789-01",
        cpfCnpjNormalizado: "12345678901",
        tipoPessoa: "CPF",
        sourceSystem: "NOTIFICA",
        registryOwnerSystem: "ADMINISTRA",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ])
  );
  storageMap.set("administra_barragens_barragens", JSON.stringify([]));
  storageMap.set("administra_barragens_rts", JSON.stringify([]));

  const clientFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input.toString();
    const target = path.startsWith("http") ? path : `${baseUrl}${path}`;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", "Bearer token-admin");
    return originalFetch(target, { ...init, headers });
  }) as typeof fetch;

  const repo = new LocalAdministraRepository(clientFetch);

  try {
    await assert.rejects(
      () =>
        repo.saveEmpreendedor({
          nome: "Novo Empreendedor",
          tipoPessoa: "CPF",
          cpfCnpj: "98765432100",
          sourceSystem: "NOTIFICA",
        }),
      /temporariamente indisponíveis|não foi realizado/i
    );
    const savedEmps = JSON.parse(storageMap.get("administra_barragens_empreendedores") || "[]");
    assert.equal(savedEmps.length, 1);
    assert.equal(savedEmps[0].id, "emp-notifica-1");

    await assert.rejects(
      () =>
        repo.saveBarragem({
          empreendedorId: "emp-notifica-1",
          nomeBarragem: "Barragem Não Salva",
          municipio: "Cuiabá",
          uf: "MT",
          sourceSystem: "NOTIFICA",
        }),
      /temporariamente indisponíveis|não foi realizado/i
    );
    assert.equal(JSON.parse(storageMap.get("administra_barragens_barragens") || "[]").length, 0);

    await assert.rejects(
      () =>
        repo.saveResponsavelTecnico({
          nome: "RT Não Salvo",
          sourceSystem: "NOTIFICA",
        }),
      /temporariamente indisponíveis|não foi realizado/i
    );
    assert.equal(JSON.parse(storageMap.get("administra_barragens_rts") || "[]").length, 0);

    await assert.rejects(
      () =>
        repo.linkArtToRT({
          rtNome: "RT Não Salvo",
          art: "ART-999",
        }),
      /temporariamente indisponíveis|não foi realizado/i
    );
    assert.equal(JSON.parse(storageMap.get("administra_barragens_rts") || "[]").length, 0);

    await assert.rejects(
      () => repo.deleteEmpreendedor("emp-notifica-1"),
      /temporariamente indisponíveis|não foi realizado/i
    );
    assert.equal(
      JSON.parse(storageMap.get("administra_barragens_empreendedores") || "[]").length,
      1
    );
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = prevWindow;
    }
    if (prevLocalStorage === undefined) {
      delete (globalThis as any).localStorage;
    } else {
      (globalThis as any).localStorage = prevLocalStorage;
    }
  }
});
