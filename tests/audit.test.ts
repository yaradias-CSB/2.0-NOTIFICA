import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.NODE_ENV = "test";
process.env.NOTIFICA_SUPABASE_URL = "https://notifica-test.supabase.co";
process.env.NOTIFICA_SUPABASE_ANON_KEY = "test-anon-key-notifica-123456";
process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-notifica-123456";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ANALYST_ID = "22222222-2222-4222-8222-222222222222";
const VIEWER_ID = "33333333-3333-4333-8333-333333333333";

const MOCK_USERS = [
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
    const headers = new Headers(init?.headers);

    if (url.pathname === "/auth/v1/user") {
      const token = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const tokenMap: Record<string, { id: string; email: string }> = {
        "token-admin": { id: ADMIN_ID, email: "admin@sema.mt.gov.br" },
        "token-analyst": { id: ANALYST_ID, email: "analista@sema.mt.gov.br" },
        "token-viewer": { id: VIEWER_ID, email: "visualizador@sema.mt.gov.br" },
      };
      const matchedUser = tokenMap[token];
      if (!matchedUser) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
      }
      return new Response(
        JSON.stringify({
          id: matchedUser.id,
          email: matchedUser.email,
          app_metadata: {},
          user_metadata: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/rest/v1/perfis_usuarios") {
      const emailFilter = url.searchParams.get("email");
      if (emailFilter?.startsWith("ilike.")) {
        const emailTarget = decodeURIComponent(emailFilter.slice(6)).toLowerCase();
        return new Response(
          JSON.stringify(MOCK_USERS.filter((u) => u.email === emailTarget)),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify(MOCK_USERS), { status: 200 });
    }

    return new Response(JSON.stringify({ error: "Not mocked" }), { status: 404 });
  }) as typeof fetch;
}

const { AuthContext } = await import("../src/contexts/AuthContext.tsx");
type AuthContextValue = import("../src/contexts/AuthContext.tsx").AuthContextValue;

const {
  AuditLogs,
  canAccessAuditLogs,
  isAuditMenuVisible,
  loadAuditLogsForUser,
  resolveAuthorizedAppView,
} = await import("../src/components/AuditLogs.tsx");

const serverModule = await import("../server.ts");
const app = serverModule.default;

function buildAuthContextValue(role: "Administrador" | "Analista" | "Visualizador" | null): AuthContextValue {
  const isAuthenticated = role !== null;
  const isAdmin = role === "Administrador";
  const isAnalista = role === "Analista";
  const isVisualizador = role === "Visualizador";

  const user = isAuthenticated
    ? ({
        id:
          role === "Administrador"
            ? ADMIN_ID
            : role === "Analista"
              ? ANALYST_ID
              : VIEWER_ID,
        email:
          role === "Administrador"
            ? "admin@sema.mt.gov.br"
            : role === "Analista"
              ? "analista@sema.mt.gov.br"
              : "visualizador@sema.mt.gov.br",
        app_metadata: {},
        user_metadata: {},
      } as any)
    : null;

  return {
    session: isAuthenticated ? ({ access_token: "test-token", user } as any) : null,
    user,
    profile: isAuthenticated
      ? {
          id: user.id,
          email: user.email,
          nome: role,
          perfil: role,
          status: "ativo",
        }
      : null,
    role,
    loading: false,
    error: null,
    isConfigured: true,
    isAdmin,
    isAnalista,
    isVisualizador,
    canEdit: isAdmin || isAnalista,
    canDelete: isAdmin,
    mustChangePassword: false,
    clearError: () => {},
    clearMustChangePassword: async () => {},
    signIn: async () => ({ success: false }),
    signOut: async () => {},
  };
}

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

test("Auditoria: menu e rota são visíveis/acessíveis apenas para Administrador", () => {
  // Administrador
  assert.equal(isAuditMenuVisible({ hasSession: true, isAdmin: true }), true);
  assert.equal(canAccessAuditLogs({ hasSession: true, isAdmin: true, loading: false }), true);
  assert.equal(resolveAuthorizedAppView("audit", { hasSession: true, isAdmin: true }), "audit");

  // Analista
  assert.equal(isAuditMenuVisible({ hasSession: true, isAdmin: false }), false);
  assert.equal(canAccessAuditLogs({ hasSession: true, isAdmin: false, loading: false }), false);
  assert.equal(resolveAuthorizedAppView("audit", { hasSession: true, isAdmin: false }), "dashboard");

  // Visualizador
  assert.equal(isAuditMenuVisible({ hasSession: true, isAdmin: false }), false);
  assert.equal(canAccessAuditLogs({ hasSession: true, isAdmin: false, loading: false }), false);
  assert.equal(resolveAuthorizedAppView("audit", { hasSession: true, isAdmin: false }), "dashboard");

  // Usuário sem sessão
  assert.equal(isAuditMenuVisible({ hasSession: false, isAdmin: false }), false);
  assert.equal(isAuditMenuVisible({ hasSession: false, isAdmin: true }), false);
  assert.equal(canAccessAuditLogs({ hasSession: false, isAdmin: false, loading: false }), false);
  assert.equal(resolveAuthorizedAppView("audit", { hasSession: false, isAdmin: false }), "dashboard");

  // Verificação estrutural em src/App.tsx garantindo bloqueio nos menus expandido, recolhido e renderização
  const appSource = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.equal(appSource.includes("{showAuditMenu && ("), true);
  assert.equal(appSource.includes("effectiveView === 'audit' && showAuditMenu"), true);
  assert.equal(appSource.includes("view === 'audit'"), true);
});

test("Auditoria: tela AuditLogs bloqueia Analista, Visualizador e usuário sem sessão e libera Administrador", () => {
  const adminHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: buildAuthContextValue("Administrador") },
      React.createElement(AuditLogs)
    )
  );
  assert.equal(adminHtml.includes("Log de Auditoria &amp; Atividades"), true);
  assert.equal(adminHtml.includes("Acesso não autorizado"), false);

  for (const role of ["Analista", "Visualizador", null] as const) {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: buildAuthContextValue(role) },
        React.createElement(AuditLogs)
      )
    );
    assert.equal(html.includes("Acesso não autorizado"), true);
    assert.equal(html.includes("Log de Auditoria &amp; Atividades"), false);
  }
});

test("Auditoria: nenhum dado de auditoria é carregado para Analista, Visualizador ou sem sessão", async () => {
  let getLogsCalls = 0;
  const spyRepository = {
    async getLogs() {
      getLogsCalls += 1;
      return [
        {
          id: "log-1",
          created_at: "2026-05-01T10:00:00.000Z",
          user_id: ADMIN_ID,
          username: "admin@sema.mt.gov.br",
          name: "Admin Principal",
          role: "Administrador",
          action: "LOGIN_SUCCESS",
          details: "Entrada no sistema",
          ip_address: "Linux PC",
        },
        {
          id: "log-2",
          created_at: "2026-05-02T10:00:00.000Z",
          user_id: ANALYST_ID,
          username: "analista@sema.mt.gov.br",
          name: "Analista Silva",
          role: "Analista",
          action: "UPDATE_PARECER",
          details: "Atualização de parecer",
          ip_address: "Windows PC",
        },
      ];
    },
  };

  // Analista, Visualizador e sem sessão: zero leituras no repositório
  for (const auth of [
    { hasSession: true, isAdmin: false, loading: false },
    { hasSession: false, isAdmin: false, loading: false },
    { hasSession: false, isAdmin: true, loading: false },
  ]) {
    const blocked = await loadAuditLogsForUser(auth, spyRepository);
    assert.equal(blocked.authorized, false);
    assert.deepEqual(blocked.logs, []);
  }
  assert.equal(getLogsCalls, 0);

  // Administrador: carrega logs ordenados do mais recente para o mais antigo
  const allowed = await loadAuditLogsForUser(
    { hasSession: true, isAdmin: true, loading: false },
    spyRepository
  );
  assert.equal(allowed.authorized, true);
  assert.equal(getLogsCalls, 1);
  assert.equal(allowed.logs.length, 2);
  assert.equal(allowed.logs[0].id, "log-2");
});

test("Auditoria: backend não expõe endpoints de auditoria sem autenticação (401) e mantém rotas protegidas por perfil", async () => {
  // Não deve existir endpoint de auditoria exposto no servidor
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), "server.ts"), "utf8");
  assert.equal(/app\.(get|post|put|patch|delete)\(\s*["']\/api\/audit/i.test(serverSource), false);

  // Sem sessão -> 401 em qualquer rota /api/*
  const noSessionAudit = await originalFetch(`${baseUrl}/api/audit`);
  assert.equal(noSessionAudit.status, 401);

  const noSessionAuditLogs = await originalFetch(`${baseUrl}/api/audit-logs`);
  assert.equal(noSessionAuditLogs.status, 401);

  // Analista e Visualizador autenticados: sem endpoint de auditoria (404) e rotas administrativas continuam 403
  for (const token of ["token-analyst", "token-viewer"]) {
    const auditRes = await originalFetch(`${baseUrl}/api/audit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(auditRes.status, 404);

    const adminRouteRes = await originalFetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(adminRouteRes.status, 403);
  }

  // Administrador autenticado preserva acesso administrativo
  const adminUsersRes = await originalFetch(`${baseUrl}/api/users`, {
    headers: { Authorization: "Bearer token-admin" },
  });
  assert.equal(adminUsersRes.status, 200);
});
