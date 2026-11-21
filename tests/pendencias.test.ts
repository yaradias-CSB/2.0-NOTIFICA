import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.NOTIFICA_SUPABASE_URL = "https://notifica-test.supabase.co";
process.env.NOTIFICA_SUPABASE_ANON_KEY = "test-anon-key-notifica-123456";
process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-notifica-123456";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ANALYST_ID = "22222222-2222-4222-8222-222222222222";
const COLLEAGUE_ID = "33333333-3333-4333-8333-333333333333";
const VIEWER_ID = "44444444-4444-4444-8444-444444444444";
const PEND_OWN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PEND_COLLEAGUE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PEND_UNASSIGNED_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PEND_MISSING_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

interface RecordedSupabaseCall {
  method: string;
  path: string;
  query: string;
  body: unknown;
}

const supabaseCalls: RecordedSupabaseCall[] = [];

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
    id: COLLEAGUE_ID,
    email: "colega@sema.mt.gov.br",
    nome: "", // propositalmente vazio para testar não vazamento de e-mail
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
  {
    id: "55555555-5555-4555-8555-555555555555",
    email: "inativo@sema.mt.gov.br",
    nome: "Usuario Inativo",
    perfil: "Analista",
    status: "inativo",
  },
];

const MOCK_PENDENCIAS = [
  {
    id: PEND_OWN_ID,
    origem: "notifica",
    origem_ref_id: "PAR-2026/001",
    tipo: "Documental",
    titulo: "Validar documento do titular CPF 123.456.789-01",
    descricao: "Contato colega@sema.mt.gov.br sobre CNPJ 12.345.678/0001-90",
    situacao: "direcionada",
    responsavel_id: ANALYST_ID,
    direcionado_por: ADMIN_ID,
    direcionado_em: "2026-05-01T10:00:00.000Z",
    criado_por: ADMIN_ID,
    tipo_referencia: "parecer",
    referencia_id: "PAR-TEXT-12345678901",
    empreendedor_id: "12345678901",
    barragem_id: "bar-mt-009",
    resolvido_por: null,
    resolvido_em: null,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
  },
  {
    id: PEND_COLLEAGUE_ID,
    origem: "notifica",
    origem_ref_id: "OF-2026/014",
    tipo: "Fiscalização",
    titulo: "Pendência atribuída ao colega",
    descricao: "Verificar barragem",
    situacao: "em_analise",
    responsavel_id: COLLEAGUE_ID,
    direcionado_por: ADMIN_ID,
    direcionado_em: "2026-05-02T10:00:00.000Z",
    criado_por: ADMIN_ID,
    tipo_referencia: "oficio",
    referencia_id: "oficio-nao-uuid-42",
    empreendedor_id: "emp-abc-02",
    barragem_id: "bar-abc-02",
    resolvido_por: null,
    resolvido_em: null,
    created_at: "2026-05-02T10:00:00.000Z",
    updated_at: "2026-05-02T10:00:00.000Z",
  },
  {
    id: PEND_UNASSIGNED_ID,
    origem: "notifica",
    origem_ref_id: "NOTIF-2026/77",
    tipo: "Geral",
    titulo: "Pendência aberta sem responsável",
    descricao: "Aguardando análise",
    situacao: "aberta",
    responsavel_id: null,
    direcionado_por: null,
    direcionado_em: null,
    criado_por: ANALYST_ID,
    tipo_referencia: "notificacao",
    referencia_id: "notif-77",
    empreendedor_id: "emp-77",
    barragem_id: "bar-77",
    resolvido_por: null,
    resolvido_em: null,
    created_at: "2026-05-03T10:00:00.000Z",
    updated_at: "2026-05-03T10:00:00.000Z",
  },
];

const MOCK_HISTORICO = [
  {
    id: "h1111111-1111-4111-8111-111111111111",
    pendencia_id: PEND_OWN_ID,
    acao: "edicao",
    campo: "empreendedor_id",
    valor_anterior: "12345678900",
    valor_novo: "12345678901",
    usuario_id: ADMIN_ID,
    motivo: "Correção solicitada por admin@sema.mt.gov.br referente CPF 123.456.789-01",
    created_at: "2026-05-01T11:00:00.000Z",
  },
  {
    id: "h2222222-2222-4222-8222-222222222222",
    pendencia_id: PEND_OWN_ID,
    acao: "edicao",
    campo: "descricao",
    valor_anterior: "Texto antigo com CPF 98765432100",
    valor_novo: "Contato colega@sema.mt.gov.br sobre CNPJ 12.345.678/0001-90",
    usuario_id: ADMIN_ID,
    motivo: null,
    created_at: "2026-05-01T10:30:00.000Z",
  },
];

const originalFetch = globalThis.fetch;

function installMockFetch(baseServerUrl: string) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Chamadas ao servidor Express local em teste seguem pelo fetch real
    if (rawUrl.startsWith(baseServerUrl)) {
      return originalFetch(input, init);
    }

    const url = new URL(rawUrl);
    const method = String(init?.method || "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ?? null;

    if (url.pathname === "/auth/v1/user") {
      const auth = new Headers(init?.headers).get("Authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      const tokenToUser: Record<string, { id: string; email: string }> = {
        "token-admin": { id: ADMIN_ID, email: "admin@sema.mt.gov.br" },
        "token-analyst": { id: ANALYST_ID, email: "analista@sema.mt.gov.br" },
        "token-viewer": { id: VIEWER_ID, email: "visualizador@sema.mt.gov.br" },
        "token-inactive": { id: "55555555-5555-4555-8555-555555555555", email: "inativo@sema.mt.gov.br" },
        "token-no-profile": { id: "66666666-6666-4666-8666-666666666666", email: "semperfil@sema.mt.gov.br" },
      };
      const user = tokenToUser[token];
      if (!user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
      }
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.replace("/rest/v1/", "");
      supabaseCalls.push({
        method,
        path: table,
        query: url.search,
        body,
      });

      if (method !== "GET") {
        throw new Error(`Unexpected Supabase write (${method} ${table})!`);
      }

      if (table === "perfis_usuarios") {
        const emailFilter = url.searchParams.get("email");
        if (emailFilter && emailFilter.startsWith("ilike.")) {
          const emailTarget = decodeURIComponent(emailFilter.slice(6)).toLowerCase();
          const matched = MOCK_USERS.filter((u) => u.email === emailTarget);
          return new Response(JSON.stringify(matched), { status: 200 });
        }
        return new Response(JSON.stringify(MOCK_USERS), { status: 200 });
      }

      if (table === "pendencias") {
        const idFilter = url.searchParams.get("id");
        if (idFilter && idFilter.startsWith("eq.")) {
          const idTarget = idFilter.slice(3);
          const matched = MOCK_PENDENCIAS.filter((p) => p.id === idTarget);
          return new Response(JSON.stringify(matched), { status: 200 });
        }
        return new Response(JSON.stringify(MOCK_PENDENCIAS), { status: 200 });
      }

      if (table === "pendencias_historico") {
        const pendIdFilter = url.searchParams.get("pendencia_id");
        if (pendIdFilter && pendIdFilter.startsWith("eq.")) {
          const idTarget = pendIdFilter.slice(3);
          const matched = MOCK_HISTORICO.filter((h) => h.pendencia_id === idTarget);
          return new Response(JSON.stringify(matched), { status: 200 });
        }
        return new Response(JSON.stringify(MOCK_HISTORICO), { status: 200 });
      }
    }

    return new Response(JSON.stringify({ error: "Not mocked" }), { status: 404 });
  }) as typeof fetch;
}

const serverModule = await import("../server.ts");
const {
  default: app,
  buildPendenciaCreatePayload,
  buildPendenciaPatchPlan,
  canReadPendencia,
  isSameSessionCanonicalUser,
  isValidPendenciaUuid,
  maskPendenciaHistoricoRow,
  maskPendenciaRow,
  validatePendenciaMutationInput,
  PENDENCIA_ORIGEM,
} = serverModule;

const {
  filterPendenciasByTab,
  getAvailablePendenciaTabs,
  isAssignedToCanonicalSessionUser,
} = await import("../src/views/PendenciasView.tsx");

let server: http.Server;
let baseUrl = "";

test.before(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
  installMockFetch(baseUrl);
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  supabaseCalls.length = 0;
});

async function apiRequest(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

test("autenticação e perfil ativo: bloqueia sem token (401), token inválido (401), sem perfil ou inativo (403)", async () => {
  const noToken = await apiRequest("/api/pendencias");
  assert.equal(noToken.status, 401);

  const badToken = await apiRequest("/api/pendencias", { token: "token-invalido" });
  assert.equal(badToken.status, 401);

  const inactive = await apiRequest("/api/pendencias", { token: "token-inactive" });
  assert.equal(inactive.status, 403);

  const noProfile = await apiRequest("/api/pendencias", { token: "token-no-profile" });
  assert.equal(noProfile.status, 403);
});

test("privacidade e mascaramento em GET /api/pendencias: oculta e-mails para não-admin, mascara CPF/CNPJ em texto e preserva IDs textuais", async () => {
  // Analista (não administrador)
  const analystRes = await apiRequest("/api/pendencias", { token: "token-analyst" });
  assert.equal(analystRes.status, 200);
  assert.equal(analystRes.json.readOnly, true);
  assert.equal(analystRes.json.currentUser.id, ANALYST_ID);
  assert.equal("email" in analystRes.json.currentUser, false);
  assert.equal("perfilId" in analystRes.json.currentUser, false);

  // Não expõe e-mails em usuarios para não-administradores, mesmo quando nome estava vazio
  for (const u of analystRes.json.usuarios) {
    assert.equal("email" in u, false);
    assert.equal(u.nome.includes("@"), false);
  }

  // Mascare CPF/CNPJ e e-mail em conteúdo textual, sem alterar IDs (nem mesmo IDs numéricos ou não-UUID)
  const own = analystRes.json.items.find((i: any) => i.id === PEND_OWN_ID);
  assert.ok(own);
  assert.equal(own.titulo.includes("123.456.789-01"), false);
  assert.equal(own.titulo.includes("***.***.***-01"), true);
  assert.equal(own.descricao.includes("12.345.678/0001-90"), false);
  assert.equal(own.descricao.includes("**.***.***/****-90"), true);
  assert.equal(own.descricao.includes("colega@sema.mt.gov.br"), false);

  // IDs não devem ser mascarados nem alterados
  assert.equal(own.id, PEND_OWN_ID);
  assert.equal(own.origem, "notifica");
  assert.equal(own.origem_ref_id, "PAR-2026/001");
  assert.equal(own.referencia_id, "PAR-TEXT-12345678901");
  assert.equal(own.empreendedor_id, "12345678901");
  assert.equal(own.barragem_id, "bar-mt-009");
  assert.equal(own.responsavel_id, ANALYST_ID);

  // Administrador vê e-mails na lista de usuários e nos textos, mas CPF/CNPJ continua mascarado
  const adminRes = await apiRequest("/api/pendencias", { token: "token-admin" });
  assert.equal(adminRes.status, 200);
  assert.equal(adminRes.json.usuarios[0].email.includes("@"), true);
  const adminOwn = adminRes.json.items.find((i: any) => i.id === PEND_OWN_ID);
  assert.equal(adminOwn.titulo.includes("123.456.789-01"), false);
  assert.equal(adminOwn.titulo.includes("***.***.***-01"), true);
  assert.equal(adminOwn.empreendedor_id, "12345678901");
});

test("detalhe/histórico GET /api/pendencias/:id/historico: valida UUID (400), existência (404), ordem antes do histórico e mascaramento", async () => {
  // ID não UUID -> 400 sem consultar pendencias nem pendencias_historico
  const badUuid = await apiRequest("/api/pendencias/nao-e-uuid/historico", { token: "token-analyst" });
  assert.equal(badUuid.status, 400);
  assert.equal(
    supabaseCalls.some((c) => c.path === "pendencias_historico" || c.path === "pendencias"),
    false
  );

  // UUID inexistente -> 404 sem consultar pendencias_historico
  const notFound = await apiRequest(`/api/pendencias/${PEND_MISSING_ID}/historico`, {
    token: "token-analyst",
  });
  assert.equal(notFound.status, 404);
  assert.equal(
    supabaseCalls.some((c) => c.path === "pendencias_historico"),
    false
  );

  // Visualizador autorizado pode ler histórico com CPF/CNPJ e e-mails mascarados, sem alterar valor_anterior/novo de campos de ID
  const viewerHist = await apiRequest(`/api/pendencias/${PEND_OWN_ID}/historico`, {
    token: "token-viewer",
  });
  assert.equal(viewerHist.status, 200);
  assert.equal(viewerHist.json.items.length, 2);

  const idChangeRow = viewerHist.json.items.find((h: any) => h.campo === "empreendedor_id");
  assert.equal(idChangeRow.valor_anterior, "12345678900");
  assert.equal(idChangeRow.valor_novo, "12345678901");
  assert.equal(idChangeRow.motivo.includes("admin@sema.mt.gov.br"), false);
  assert.equal(idChangeRow.motivo.includes("123.456.789-01"), false);
  assert.equal(idChangeRow.motivo.includes("***.***.***-01"), true);

  const textChangeRow = viewerHist.json.items.find((h: any) => h.campo === "descricao");
  assert.equal(textChangeRow.valor_anterior.includes("98765432100"), false);
  assert.equal(textChangeRow.valor_anterior.includes("***.***.***-00"), true);
  assert.equal(textChangeRow.valor_novo.includes("colega@sema.mt.gov.br"), false);
  assert.equal(textChangeRow.valor_novo.includes("**.***.***/****-90"), true);
});

test("mutações (POST e PATCH): retornam 409 antes de qualquer gravação, respeitando 403/400 prévios e zero writes no banco", async () => {
  // Visualizador nunca pode mutar -> 403
  const viewerPost = await apiRequest("/api/pendencias", {
    method: "POST",
    token: "token-viewer",
    body: { titulo: "Tentativa visualizador" },
  });
  assert.equal(viewerPost.status, 403);

  const viewerPatch = await apiRequest(`/api/pendencias/${PEND_OWN_ID}`, {
    method: "PATCH",
    token: "token-viewer",
    body: { situacao: "resolvida" },
  });
  assert.equal(viewerPatch.status, 403);

  // Analista não pode escolher responsável -> 403
  const analystAssign = await apiRequest("/api/pendencias", {
    method: "POST",
    token: "token-analyst",
    body: { titulo: "Nova", responsavel_id: COLLEAGUE_ID },
  });
  assert.equal(analystAssign.status, 403);

  // Analista não pode alterar pendência atribuída a colega -> 403
  const analystColleaguePatch = await apiRequest(`/api/pendencias/${PEND_COLLEAGUE_ID}`, {
    method: "PATCH",
    token: "token-analyst",
    body: { situacao: "resolvida" },
  });
  assert.equal(analystColleaguePatch.status, 403);

  // Bloqueio de CPF/CNPJ e payloads copiados -> 400
  const cpfInput = await apiRequest("/api/pendencias", {
    method: "POST",
    token: "token-admin",
    body: { titulo: "Pendência CPF 123.456.789-01" },
  });
  assert.equal(cpfInput.status, 400);

  const payloadCopyInput = await apiRequest("/api/pendencias", {
    method: "POST",
    token: "token-admin",
    body: { titulo: "Copia", dados_legados: { raw: 1 } },
  });
  assert.equal(payloadCopyInput.status, 400);

  const jsonStringPayload = await apiRequest("/api/pendencias", {
    method: "POST",
    token: "token-admin",
    body: { titulo: "Copia", descricao: '{"cpf":"12345678901"}' },
  });
  assert.equal(jsonStringPayload.status, 400);

  // Situação inválida -> 400
  const badStatus = await apiRequest("/api/pendencias", {
    method: "POST",
    token: "token-admin",
    body: { titulo: "Teste", situacao: "arquivada" },
  });
  assert.equal(badStatus.status, 400);

  // ID de pendência inválido no PATCH -> 400
  const badPatchId = await apiRequest("/api/pendencias/nao-uuid", {
    method: "PATCH",
    token: "token-admin",
    body: { titulo: "Atualizada" },
  });
  assert.equal(badPatchId.status, 400);

  // POST válido (Analista e Admin) com IDs textuais não-UUID -> HTTP 409 e ZERO gravações
  const validPost = await apiRequest("/api/pendencias", {
    method: "POST",
    token: "token-analyst",
    body: {
      titulo: "Pendência com IDs textuais",
      origem: "SPOOFED_ORIGEM",
      criado_por: VIEWER_ID,
      origem_ref_id: "PAR-2026-999",
      referencia_id: "OF-TEXT-888",
      empreendedor_id: "emp-texto-01",
      barragem_id: "bar-texto-02",
      motivo: "Abertura técnica",
    },
  });
  assert.equal(validPost.status, 409);
  assert.equal(validPost.json.readOnly, true);

  // PATCH válido (Admin direcionando e Analista resolvendo a própria pendência) -> HTTP 409 e ZERO gravações
  const validAdminPatch = await apiRequest(`/api/pendencias/${PEND_UNASSIGNED_ID}`, {
    method: "PATCH",
    token: "token-admin",
    body: {
      responsavel_id: ANALYST_ID,
      situacao: "direcionada",
      motivo: "Atribuição ao analista",
    },
  });
  assert.equal(validAdminPatch.status, 409);
  assert.equal(validAdminPatch.json.readOnly, true);

  const validAnalystPatch = await apiRequest(`/api/pendencias/${PEND_OWN_ID}`, {
    method: "PATCH",
    token: "token-analyst",
    body: {
      situacao: "resolvida",
      motivo: "Concluída",
    },
  });
  assert.equal(validAnalystPatch.status, 409);
  assert.equal(validAnalystPatch.json.readOnly, true);

  // Garante 0 chamadas de escrita (POST/PATCH/PUT/DELETE) no Supabase
  const writeCalls = supabaseCalls.filter((c) => c.method !== "GET");
  assert.equal(writeCalls.length, 0);
});

test("regras de payload no servidor: origem exata 'notifica', ignora spoofing, preserva IDs textuais e não grava motivo em pendencias", () => {
  const analystAuth = {
    id: ANALYST_ID,
    email: "analista@sema.mt.gov.br",
    nome: "Analista Silva",
    perfil: "Analista" as const,
  };

  const created = buildPendenciaCreatePayload(
    {
      titulo: "Validar documentos",
      origem: "ADMINISTRA",
      criado_por: VIEWER_ID,
      direcionado_por: VIEWER_ID,
      resolvido_por: VIEWER_ID,
      usuario_id: VIEWER_ID,
      perfil: "Administrador",
      origem_ref_id: "PAR-2026-001",
      referencia_id: "ref_nao_uuid",
      empreendedor_id: "emp_001",
      barragem_id: "bar_001",
      motivo: "Justificativa vai só para o histórico",
    },
    analystAuth,
    "2026-05-10T12:00:00.000Z"
  );

  assert.equal(PENDENCIA_ORIGEM, "notifica");
  assert.equal(created.row.origem, "notifica");
  assert.equal(created.row.criado_por, ANALYST_ID);
  assert.equal("motivo" in created.row, false);
  assert.equal(created.row.origem_ref_id, "PAR-2026-001");
  assert.equal(created.row.referencia_id, "ref_nao_uuid");
  assert.equal(created.row.empreendedor_id, "emp_001");
  assert.equal(created.row.barragem_id, "bar_001");
  assert.equal(created.historyRows[0].usuario_id, ANALYST_ID);
  assert.equal(created.historyRows[0].motivo, "Justificativa vai só para o histórico");

  const patchPlan = buildPendenciaPatchPlan(
    MOCK_PENDENCIAS[0],
    { situacao: "resolvida", motivo: "Resolvido após conferência", resolvido_por: VIEWER_ID },
    analystAuth,
    "2026-05-10T13:00:00.000Z"
  );
  assert.equal("motivo" in patchPlan.patchPayload, false);
  assert.equal(patchPlan.patchPayload.resolvido_por, ANALYST_ID);
  assert.equal(patchPlan.historyRows[0].acao, "resolucao");
  assert.equal(patchPlan.historyRows[0].usuario_id, ANALYST_ID);
  assert.equal(patchPlan.historyRows[0].motivo, "Resolvido após conferência");

  assert.equal(isValidPendenciaUuid(PEND_OWN_ID), true);
  assert.equal(isValidPendenciaUuid("PAR-2026-001"), false);
  assert.equal(canReadPendencia(MOCK_PENDENCIAS[0], null), false);
  assert.equal(isSameSessionCanonicalUser(ANALYST_ID, analystAuth), true);
  assert.equal(isSameSessionCanonicalUser(COLLEAGUE_ID, analystAuth), false);
  assert.equal(validatePendenciaMutationInput({ titulo: "ok", motivo: "CPF 12345678901" }).ok, false);
  assert.equal(maskPendenciaRow({ titulo: `UUID ${PEND_OWN_ID}` }, { isAdmin: false }).titulo, `UUID ${PEND_OWN_ID}`);
  assert.equal(
    maskPendenciaHistoricoRow({ campo: "responsavel_id", valor_novo: ANALYST_ID }, { isAdmin: false }).valor_novo,
    ANALYST_ID
  );
});

test("regras de abas na interface: Minhas pendências usa ID canônico, Lista geral mostra colegas e Direcionado é exclusivo de Administrador", () => {
  assert.deepEqual(getAvailablePendenciaTabs(false), ["minhas", "geral"]);
  assert.deepEqual(getAvailablePendenciaTabs(true), ["minhas", "geral", "direcionado"]);

  const minhas = filterPendenciasByTab(MOCK_PENDENCIAS as any, "minhas", ANALYST_ID, false);
  assert.equal(minhas.length, 1);
  assert.equal(minhas[0].id, PEND_OWN_ID);
  assert.equal(isAssignedToCanonicalSessionUser(MOCK_PENDENCIAS[0] as any, ANALYST_ID), true);
  assert.equal(isAssignedToCanonicalSessionUser(MOCK_PENDENCIAS[1] as any, ANALYST_ID), false);

  const geral = filterPendenciasByTab(MOCK_PENDENCIAS as any, "geral", ANALYST_ID, false);
  assert.equal(geral.length, 3);

  const direcionadoNonAdmin = filterPendenciasByTab(
    MOCK_PENDENCIAS as any,
    "direcionado",
    ANALYST_ID,
    false
  );
  assert.equal(direcionadoNonAdmin.length, 0);

  const direcionadoAdmin = filterPendenciasByTab(
    MOCK_PENDENCIAS as any,
    "direcionado",
    ADMIN_ID,
    true
  );
  assert.equal(direcionadoAdmin.length, 2);
});
