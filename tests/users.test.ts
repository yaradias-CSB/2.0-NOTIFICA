import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.NOTIFICA_SUPABASE_URL = "https://notifica-test.supabase.co";
process.env.NOTIFICA_SUPABASE_ANON_KEY = "test-anon-key-notifica-123456";
process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-notifica-123456";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ANALYST_ID = "22222222-2222-4222-8222-222222222222";
const VIEWER_ID = "33333333-3333-4333-8333-333333333333";
const ORPHAN_AUTH_ID = "44444444-4444-4444-8444-444444444444";

interface MockAuthUser {
  id: string;
  email: string;
  password: string;
  app_metadata: Record<string, any>;
  user_metadata: Record<string, any>;
  banned_until?: string | null;
}

interface MockPerfilRow {
  id: string;
  email: string;
  nome: string;
  perfil: string;
  status: string;
}

import fs from "node:fs";
import path from "node:path";

let mockAuthUsers: MockAuthUser[] = [];
let mockPerfis: MockPerfilRow[] = [];
let createdAuthCalls = 0;
let adminAuthWriteCalls = 0;
let perfisWriteCalls = 0;
let userOrTokenApiKeys: string[] = [];

function resetMockDb() {
  createdAuthCalls = 0;
  adminAuthWriteCalls = 0;
  perfisWriteCalls = 0;
  userOrTokenApiKeys = [];
  mockAuthUsers = [
    {
      id: ADMIN_ID,
      email: "admin@sema.mt.gov.br",
      password: "admin-old-password",
      app_metadata: {},
      user_metadata: { nome: "Admin Principal" },
      banned_until: null,
    },
    {
      id: ANALYST_ID,
      email: "analista@sema.mt.gov.br",
      password: "analyst-old-password",
      app_metadata: {},
      user_metadata: { nome: "Analista Silva" },
      banned_until: null,
    },
    {
      id: VIEWER_ID,
      email: "visualizador@sema.mt.gov.br",
      password: "viewer-old-password",
      app_metadata: {},
      user_metadata: { nome: "Visualizador Costa" },
      banned_until: null,
    },
    {
      id: ORPHAN_AUTH_ID,
      email: "jaexisteauth@sema.mt.gov.br",
      password: "old-auth-password",
      app_metadata: {},
      user_metadata: { nome: "Existente Auth" },
      banned_until: null,
    },
  ];
  mockPerfis = [
    {
      id: ADMIN_ID,
      email: "admin@sema.mt.gov.br",
      nome: "Admin Principal",
      perfil: "Administrador",
      status: "ativo",
    },
    {
      id: ANALYST_ID,
      email: "analista@sema.mt.gov.br",
      nome: "Analista Silva",
      perfil: "Analista",
      status: "ativo",
    },
    {
      id: VIEWER_ID,
      email: "visualizador@sema.mt.gov.br",
      nome: "Visualizador Costa",
      perfil: "Visualizador",
      status: "ativo",
    },
  ];
}

const originalFetch = globalThis.fetch;

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
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ?? null);

    // Token user verification
    if (url.pathname === "/auth/v1/user") {
      const apiKey = headers.get("apikey") || "";
      userOrTokenApiKeys.push(apiKey);
      if (apiKey !== "test-anon-key-notifica-123456") {
        return new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 });
      }
      const token = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const tokenMap: Record<string, string> = {
        "token-admin": ADMIN_ID,
        "token-analyst": ANALYST_ID,
        "token-viewer": VIEWER_ID,
      };
      let mappedId =
        tokenMap[token] || (token.startsWith("token-id:") ? token.slice("token-id:".length) : "");
      if (!mappedId && token.split(".").length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
            sub?: string;
            iss?: string;
          };
          if (payload?.sub && (!payload.iss || payload.iss.startsWith(url.origin))) {
            mappedId = payload.sub;
          }
        } catch {
          mappedId = "";
        }
      }
      const authRec = mockAuthUsers.find((u) => u.id === mappedId);
      if (!authRec) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
      }
      return new Response(
        JSON.stringify({
          id: authRec.id,
          email: authRec.email,
          app_metadata: authRec.app_metadata,
          user_metadata: authRec.user_metadata,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Password verification (/auth/v1/token?grant_type=password)
    if (url.pathname === "/auth/v1/token" && method === "POST") {
      const apiKey = headers.get("apikey") || "";
      userOrTokenApiKeys.push(apiKey);
      if (apiKey !== "test-anon-key-notifica-123456") {
        return new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 });
      }
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const found = mockAuthUsers.find((u) => u.email === email && u.password === password);
      if (!found) {
        return new Response(JSON.stringify({ error_description: "Invalid login credentials" }), {
          status: 400,
        });
      }
      return new Response(JSON.stringify({ access_token: "ok", user: { id: found.id, email: found.email } }), {
        status: 200,
      });
    }

    // Admin Auth API (/auth/v1/admin/users...)
    if (url.pathname.startsWith("/auth/v1/admin/users")) {
      const authHeader = headers.get("Authorization") || "";
      if (authHeader !== `Bearer ${process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY}`) {
        return new Response(JSON.stringify({ msg: "Service role required" }), { status: 403 });
      }

      if (url.pathname === "/auth/v1/admin/users" && method === "GET") {
        return new Response(JSON.stringify({ users: mockAuthUsers }), { status: 200 });
      }

      if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
        adminAuthWriteCalls += 1;
        const email = String(body?.email || "").trim().toLowerCase();
        if (mockAuthUsers.some((u) => u.email === email)) {
          return new Response(JSON.stringify({ msg: "User already registered" }), { status: 422 });
        }
        createdAuthCalls += 1;
        const newUser: MockAuthUser = {
          id: `77777777-7777-4777-8777-00000000000${createdAuthCalls}`,
          email,
          password: String(body?.password || ""),
          app_metadata: body?.app_metadata || {},
          user_metadata: body?.user_metadata || {},
          banned_until: body?.ban_duration ? "2099-01-01T00:00:00Z" : null,
        };
        mockAuthUsers.push(newUser);
        return new Response(JSON.stringify(newUser), { status: 200 });
      }

      const idMatch = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
      if (idMatch) {
        const targetId = decodeURIComponent(idMatch[1]);
        const idx = mockAuthUsers.findIndex((u) => u.id === targetId);
        if (idx === -1) {
          return new Response(JSON.stringify({ msg: "User not found" }), { status: 404 });
        }

        if (method === "GET") {
          return new Response(JSON.stringify(mockAuthUsers[idx]), { status: 200 });
        }
        if (method === "PUT") {
          adminAuthWriteCalls += 1;
          if (typeof body?.password === "string") {
            mockAuthUsers[idx].password = body.password;
          }
          if (typeof body?.email === "string") {
            mockAuthUsers[idx].email = body.email.toLowerCase();
          }
          if (body?.app_metadata) {
            mockAuthUsers[idx].app_metadata = {
              ...mockAuthUsers[idx].app_metadata,
              ...body.app_metadata,
            };
          }
          if (body?.user_metadata) {
            mockAuthUsers[idx].user_metadata = {
              ...mockAuthUsers[idx].user_metadata,
              ...body.user_metadata,
            };
          }
          if (body?.ban_duration === "none") {
            mockAuthUsers[idx].banned_until = null;
          } else if (body?.ban_duration) {
            mockAuthUsers[idx].banned_until = "2099-01-01T00:00:00Z";
          }
          return new Response(JSON.stringify(mockAuthUsers[idx]), { status: 200 });
        }
        if (method === "DELETE") {
          adminAuthWriteCalls += 1;
          mockAuthUsers.splice(idx, 1);
          return new Response(JSON.stringify({}), { status: 200 });
        }
      }
    }

    // REST API (/rest/v1/perfis_usuarios)
    if (url.pathname === "/rest/v1/perfis_usuarios") {
      if (method === "GET") {
        const idFilter = url.searchParams.get("id");
        if (idFilter?.startsWith("eq.")) {
          const targetId = idFilter.slice(3);
          return new Response(
            JSON.stringify(mockPerfis.filter((p) => p.id === targetId)),
            { status: 200 }
          );
        }
        const emailFilter = url.searchParams.get("email");
        if (emailFilter?.startsWith("ilike.")) {
          const targetEmail = decodeURIComponent(emailFilter.slice(6)).toLowerCase();
          return new Response(
            JSON.stringify(mockPerfis.filter((p) => p.email.toLowerCase() === targetEmail)),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(mockPerfis), { status: 200 });
      }

      if (method === "POST") {
        perfisWriteCalls += 1;
        const row: MockPerfilRow = {
          id: String(body?.id || ""),
          email: String(body?.email || "").toLowerCase(),
          nome: String(body?.nome || ""),
          perfil: String(body?.perfil || "Visualizador"),
          status: String(body?.status || "ativo"),
        };
        mockPerfis.push(row);
        return new Response(JSON.stringify([row]), { status: 201 });
      }

      if (method === "PATCH") {
        const idFilter = url.searchParams.get("id");
        const targetId = idFilter?.startsWith("eq.") ? idFilter.slice(3) : "";
        const idx = mockPerfis.findIndex((p) => p.id === targetId);
        if (idx === -1) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        mockPerfis[idx] = { ...mockPerfis[idx], ...body };
        return new Response(JSON.stringify([mockPerfis[idx]]), { status: 200 });
      }

      if (method === "DELETE") {
        const idFilter = url.searchParams.get("id");
        const targetId = idFilter?.startsWith("eq.") ? idFilter.slice(3) : "";
        mockPerfis = mockPerfis.filter((p) => p.id !== targetId);
        return new Response(JSON.stringify([]), { status: 200 });
      }
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
  resetMockDb();
});

test("Apenas Administrador acessa TODAS as rotas /api/users* (401 sem token, 403 para Analista e Visualizador)", async () => {
  const unauthChecks = await Promise.all([
    originalFetch(`${baseUrl}/api/users`),
    originalFetch(`${baseUrl}/api/users`, { method: "POST" }),
    originalFetch(`${baseUrl}/api/users/${VIEWER_ID}`, { method: "PATCH" }),
    originalFetch(`${baseUrl}/api/users/${VIEWER_ID}/reset-password`, { method: "POST" }),
    originalFetch(`${baseUrl}/api/users/${VIEWER_ID}`, { method: "DELETE" }),
  ]);
  for (const res of unauthChecks) {
    assert.equal(res.status, 401);
  }

  for (const token of ["token-analyst", "token-viewer"]) {
    const listRes = await originalFetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listRes.status, 403);

    const createRes = await originalFetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: "Teste",
        email: "teste@sema.mt.gov.br",
        perfil: "Visualizador",
      }),
    });
    assert.equal(createRes.status, 403);

    const patchRes = await originalFetch(`${baseUrl}/api/users/${VIEWER_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nome: "Alterado" }),
    });
    assert.equal(patchRes.status, 403);

    const resetRes = await originalFetch(`${baseUrl}/api/users/${VIEWER_ID}/reset-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ newPassword: "NovaSenhaForte#2026" }),
    });
    assert.equal(resetRes.status, 403);

    const deleteRes = await originalFetch(`${baseUrl}/api/users/${VIEWER_ID}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(deleteRes.status, 403);
  }
});

test("POST /api/users bloqueia criação direta (409) sem senha padrão fixa e sem chamadas externas", async () => {
  const perfisBefore = mockPerfis.length;
  const authBefore = mockAuthUsers.length;

  const createRes = await originalFetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nome: "Novo Técnico",
      email: "novotecnico@sema.mt.gov.br",
      perfil: "Analista",
    }),
  });
  assert.equal(createRes.status, 409);
  const body = (await createRes.json()) as { blocked?: boolean; code?: string; error?: string };
  assert.equal(body.blocked, true);
  assert.equal(body.code, "SECURE_USER_ONBOARDING_REQUIRED");
  assert.ok(body.error && body.error.length > 10);

  // Nenhuma conta ou perfil foi criado, nem houve chamada ao Admin Auth ou perfis_usuarios
  assert.equal(createdAuthCalls, 0);
  assert.equal(adminAuthWriteCalls, 0);
  assert.equal(perfisWriteCalls, 0);
  assert.equal(mockPerfis.length, perfisBefore);
  assert.equal(mockAuthUsers.length, authBefore);

  // Garante ausência de senha padrão fixa embutida no código de produção
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), "server.ts"), "utf8");
  const userMgmtSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/UserManagement.tsx"),
    "utf8"
  );
  assert.equal(serverSource.includes("DEFAULT_SUGGESTED_USER_PASSWORD"), false);
  assert.equal(serverSource.includes("@12345"), false);
  assert.equal(userMgmtSource.includes("DEFAULT_SUGGESTED_PASSWORD"), false);
  assert.equal(userMgmtSource.includes("@12345"), false);
});

test("Administrador edita, inativa/ativa, reseta senha de todos usuários e exclui (protegendo a própria conta)", async () => {
  // Editar e inativar Analista
  const patchRes = await originalFetch(`${baseUrl}/api/users/${ANALYST_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nome: "Analista Atualizado",
      perfil: "Visualizador",
      status: "inativo",
    }),
  });
  assert.equal(patchRes.status, 200);
  const patched = (await patchRes.json()) as { user: MockPerfilRow };
  assert.equal(patched.user.nome, "Analista Atualizado");
  assert.equal(patched.user.perfil, "Visualizador");
  assert.equal(patched.user.status, "inativo");
  assert.ok(mockAuthUsers.find((u) => u.id === ANALYST_ID)?.banned_until);

  // Usuário inativo não consegue entrar/acessar o sistema (403)
  const inactiveAccessRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
    headers: { Authorization: "Bearer token-analyst" },
  });
  assert.equal(inactiveAccessRes.status, 403);

  // Reativar
  const reactivateRes = await originalFetch(`${baseUrl}/api/users/${ANALYST_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "ativo" }),
  });
  assert.equal(reactivateRes.status, 200);
  assert.equal(mockAuthUsers.find((u) => u.id === ANALYST_ID)?.banned_until, null);

  // Proteção: admin não pode inativar ou rebaixar a própria conta
  const selfInactivate = await originalFetch(`${baseUrl}/api/users/${ADMIN_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "inativo" }),
  });
  assert.equal(selfInactivate.status, 400);

  const selfDemote = await originalFetch(`${baseUrl}/api/users/${ADMIN_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ perfil: "Analista" }),
  });
  assert.equal(selfDemote.status, 400);

  // Reset sem nova senha explícita é recusado (não usa senha padrão fixa)
  const resetViewerEmpty = await originalFetch(`${baseUrl}/api/users/${VIEWER_ID}/reset-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(resetViewerEmpty.status, 400);
  assert.equal(mockAuthUsers.find((u) => u.id === VIEWER_ID)?.password, "viewer-old-password");

  // Não permite autoexclusão
  const selfDelete = await originalFetch(`${baseUrl}/api/users/${ADMIN_ID}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer token-admin" },
  });
  assert.equal(selfDelete.status, 400);

  // Excluir outro usuário remove de perfis_usuarios e Supabase Auth
  const deleteRes = await originalFetch(`${baseUrl}/api/users/${VIEWER_ID}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer token-admin" },
  });
  assert.equal(deleteRes.status, 200);
  assert.equal(mockPerfis.some((p) => p.id === VIEWER_ID), false);
  assert.equal(mockAuthUsers.some((u) => u.id === VIEWER_ID), false);

  const resetAdmin = await originalFetch(`${baseUrl}/api/users/${ADMIN_ID}/reset-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ newPassword: "novaSenhaAdmin99" }),
  });
  assert.equal(resetAdmin.status, 200);
  assert.equal(mockAuthUsers.find((u) => u.id === ADMIN_ID)?.password, "novaSenhaAdmin99");
  assert.equal(mockAuthUsers.find((u) => u.id === ADMIN_ID)?.app_metadata?.must_change_password, true);
  assert.equal(mockAuthUsers.find((u) => u.id === ADMIN_ID)?.user_metadata?.must_change_password, undefined);
});

test("Todo usuário autenticado (Visualizador, Analista, Administrador) pode trocar a própria senha", async () => {
  // Senha atual incorreta retorna 400
  const wrongCurrent = await originalFetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-viewer",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currentPassword: "senha-errada",
      newPassword: "novaSenhaViewer1",
    }),
  });
  assert.equal(wrongCurrent.status, 400);

  // Troca válida para Visualizador, Analista e Administrador
  const cases = [
    { token: "token-viewer", id: VIEWER_ID, currentPassword: "viewer-old-password", newPassword: "viewer-new-password" },
    { token: "token-analyst", id: ANALYST_ID, currentPassword: "analyst-old-password", newPassword: "analyst-new-password" },
    { token: "token-admin", id: ADMIN_ID, currentPassword: "admin-old-password", newPassword: "admin-new-password" },
  ];

  for (const c of cases) {
    const res = await originalFetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: c.currentPassword,
        newPassword: c.newPassword,
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(mockAuthUsers.find((u) => u.id === c.id)?.password, c.newPassword);
  }
});

test("Usuário com senha resetada é obrigado a trocar a senha antes de acessar outras rotas", async () => {
  // 1. Admin reseta senha do Analista com senha temporária explícita
  const resetAnalystRes = await originalFetch(`${baseUrl}/api/users/${ANALYST_ID}/reset-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ newPassword: "TempAnalista#2026" }),
  });
  assert.equal(resetAnalystRes.status, 200);
  assert.equal(mockAuthUsers.find((u) => u.id === ANALYST_ID)?.app_metadata?.must_change_password, true);
  assert.equal(mockAuthUsers.find((u) => u.id === ANALYST_ID)?.user_metadata?.must_change_password, undefined);

  // Edição do nome pelo admin preserva a obrigatoriedade de troca de senha em app_metadata
  const editBeforeLogin = await originalFetch(`${baseUrl}/api/users/${ANALYST_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nome: "Analista Primeiro Acesso Editado" }),
  });
  assert.equal(editBeforeLogin.status, 200);
  assert.equal(mockAuthUsers.find((u) => u.id === ANALYST_ID)?.app_metadata?.must_change_password, true);

  // Mesmo se o usuário alterasse user_metadata no cliente, app_metadata continua bloqueando o acesso
  const analystAuthUser = mockAuthUsers.find((u) => u.id === ANALYST_ID);
  assert.ok(analystAuthUser);
  analystAuthUser.user_metadata.must_change_password = false;

  // Antes de trocar a senha, qualquer outra rota retorna 403 PASSWORD_CHANGE_REQUIRED
  const blockedRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
    headers: { Authorization: "Bearer token-analyst" },
  });
  assert.equal(blockedRes.status, 403);
  const blockedBody = (await blockedRes.json()) as { code?: string };
  assert.equal(blockedBody.code, "PASSWORD_CHANGE_REQUIRED");

  // Usuário troca a própria senha no primeiro acesso
  const changeFirstRes = await originalFetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-analyst",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currentPassword: "TempAnalista#2026",
      newPassword: "MinhaSenhaPessoal#1",
    }),
  });
  assert.equal(changeFirstRes.status, 200);
  assert.equal(mockAuthUsers.find((u) => u.id === ANALYST_ID)?.app_metadata?.must_change_password, false);

  // Após trocar a senha, acesso às rotas normais é liberado
  const allowedAfterChange = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
    headers: { Authorization: "Bearer token-analyst" },
  });
  assert.equal(allowedAfterChange.status, 200);

  // 2. Admin reseta a senha do Visualizador com senha explícita -> volta a exigir troca de senha em app_metadata
  const resetViewerRes = await originalFetch(`${baseUrl}/api/users/${VIEWER_ID}/reset-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ newPassword: "TempViewer#2026" }),
  });
  assert.equal(resetViewerRes.status, 200);
  assert.equal(mockAuthUsers.find((u) => u.id === VIEWER_ID)?.app_metadata?.must_change_password, true);
  assert.equal(mockAuthUsers.find((u) => u.id === VIEWER_ID)?.user_metadata?.must_change_password, undefined);

  const blockedViewerRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
    headers: { Authorization: "Bearer token-viewer" },
  });
  assert.equal(blockedViewerRes.status, 403);
  const blockedViewerBody = (await blockedViewerRes.json()) as { code?: string };
  assert.equal(blockedViewerBody.code, "PASSWORD_CHANGE_REQUIRED");

  const viewerChangeRes = await originalFetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-viewer",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currentPassword: "TempViewer#2026",
      newPassword: "ViewerSenhaNova#2",
    }),
  });
  assert.equal(viewerChangeRes.status, 200);
  assert.equal(mockAuthUsers.find((u) => u.id === VIEWER_ID)?.app_metadata?.must_change_password, false);

  const viewerAllowedRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
    headers: { Authorization: "Bearer token-viewer" },
  });
  assert.equal(viewerAllowedRes.status, 200);
});

test("Compatibilidade legada: conta já marcada em user_metadata continua obrigada a trocar a senha até a próxima troca", async () => {
  const analystAuth = mockAuthUsers.find((u) => u.id === ANALYST_ID);
  assert.ok(analystAuth);
  analystAuth.app_metadata = {};
  analystAuth.user_metadata = { nome: "Analista Silva", must_change_password: true };

  const blockedLegacyRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
    headers: { Authorization: "Bearer token-analyst" },
  });
  assert.equal(blockedLegacyRes.status, 403);
  const blockedLegacyBody = (await blockedLegacyRes.json()) as { code?: string };
  assert.equal(blockedLegacyBody.code, "PASSWORD_CHANGE_REQUIRED");

  const changeLegacyRes = await originalFetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-analyst",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currentPassword: "analyst-old-password",
      newPassword: "AnalistaNova#1",
    }),
  });
  assert.equal(changeLegacyRes.status, 200);
  assert.equal(analystAuth.app_metadata.must_change_password, false);
  assert.equal(analystAuth.user_metadata.must_change_password, false);

  const allowedLegacyRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
    headers: { Authorization: "Bearer token-analyst" },
  });
  assert.equal(allowedLegacyRes.status, 200);
});

test("Troca obrigatória diferencia token ausente/inválido, senha incorreta e falha de chave, e libera após troca", async () => {
  // 1. Sem token ou com token inválido/expirado em /api/auth/change-password continua bloqueado (401)
  const noTokenRes = await originalFetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "TempPassword#1", newPassword: "NovaSenhaValida#1" }),
  });
  assert.equal(noTokenRes.status, 401);

  const emptyBearerRes = await originalFetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer   ",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentPassword: "TempPassword#1", newPassword: "NovaSenhaValida#1" }),
  });
  assert.equal(emptyBearerRes.status, 401);

  const invalidTokenRes = await originalFetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-invalido-ou-expirado",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentPassword: "TempPassword#1", newPassword: "NovaSenhaValida#1" }),
  });
  assert.equal(invalidTokenRes.status, 401);
  const invalidTokenBody = (await invalidTokenRes.json()) as { error?: string };
  assert.equal(invalidTokenBody.error, "Sessão inválida ou expirada.");

  // 2. Conta com troca obrigatória + token JWT válido:
  //    - sem nenhuma chave anon válida, NÃO faz fallback para service_role (retorna 503)
  //    - com VITE_SUPABASE_ANON_KEY válida como fallback anon, conclui a troca normalmente
  const resetRes = await originalFetch(`${baseUrl}/api/users/${ANALYST_ID}/reset-password`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ newPassword: "TempModalPassword#9" }),
  });
  assert.equal(resetRes.status, 200);

  const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadB64 = Buffer.from(
    JSON.stringify({
      sub: ANALYST_ID,
      iss: `${process.env.NOTIFICA_SUPABASE_URL}/auth/v1`,
    })
  ).toString("base64url");
  const sessionJwt = `${headerB64}.${payloadB64}.sig`;

  const prevAnon = process.env.NOTIFICA_SUPABASE_ANON_KEY;
  const prevViteAnon = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.NOTIFICA_SUPABASE_ANON_KEY = "wrong-anon-key-notifica-123456";
  delete process.env.VITE_SUPABASE_ANON_KEY;
  try {
    // Sem chave anon válida, não usa service_role em /auth/v1/user
    const invalidServerKeyRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
      headers: { Authorization: `Bearer ${sessionJwt}` },
    });
    assert.equal(invalidServerKeyRes.status, 503);

    // Com VITE_SUPABASE_ANON_KEY válida, usa apenas as chaves anon
    process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key-notifica-123456";

    // Outras rotas bloqueadas com 403 PASSWORD_CHANGE_REQUIRED (não 401)
    const blockedNormalRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
      headers: { Authorization: `Bearer ${sessionJwt}` },
    });
    assert.equal(blockedNormalRes.status, 403);

    // Senha atual incorreta retorna 400 próprio, NÃO erro de sessão (401)
    const wrongCurrentRes = await originalFetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "senha-atual-errada",
        newPassword: "NovaSenhaPessoal#9",
      }),
    });
    assert.equal(wrongCurrentRes.status, 400);
    const wrongCurrentBody = (await wrongCurrentRes.json()) as { error?: string };
    assert.equal(wrongCurrentBody.error, "Senha atual incorreta.");

    // Senha atual correta conclui a troca obrigatória e libera o acesso
    const changeOkRes = await originalFetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "TempModalPassword#9",
        newPassword: "NovaSenhaPessoal#9",
      }),
    });
    assert.equal(changeOkRes.status, 200);
    assert.equal(mockAuthUsers.find((u) => u.id === ANALYST_ID)?.app_metadata?.must_change_password, false);

    const unlockedRes = await originalFetch(`${baseUrl}/api/ecosystem/status`, {
      headers: { Authorization: `Bearer ${sessionJwt}` },
    });
    assert.equal(unlockedRes.status, 200);

    // Garante que a chave service_role nunca foi enviada a /auth/v1/user ou /auth/v1/token
    assert.equal(
      userOrTokenApiKeys.includes(String(process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY)),
      false
    );
  } finally {
    process.env.NOTIFICA_SUPABASE_ANON_KEY = prevAnon;
    if (prevViteAnon === undefined) {
      delete process.env.VITE_SUPABASE_ANON_KEY;
    } else {
      process.env.VITE_SUPABASE_ANON_KEY = prevViteAnon;
    }
  }
});
