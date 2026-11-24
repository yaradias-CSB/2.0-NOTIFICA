import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.NOTIFICA_SUPABASE_URL = "https://notifica-test.supabase.co";
process.env.NOTIFICA_SUPABASE_ANON_KEY = "test-anon-key-notifica-123456";
process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-notifica-123456";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ANALYST_A_ID = "22222222-2222-4222-8222-222222222222";
const ANALYST_B_ID = "33333333-3333-4333-8333-333333333333";
const VIEWER_ID = "44444444-4444-4444-8444-444444444444";

const MOCK_USERS = [
  {
    id: ADMIN_ID,
    email: "admin@sema.mt.gov.br",
    nome: "Admin Principal",
    perfil: "Administrador",
    status: "ativo",
  },
  {
    id: ANALYST_A_ID,
    email: "analista.a@sema.mt.gov.br",
    nome: "Analista A",
    perfil: "Analista",
    status: "ativo",
  },
  {
    id: ANALYST_B_ID,
    email: "analista.b@sema.mt.gov.br",
    nome: "Analista B",
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

interface UpstreamCall {
  method: string;
  url: string;
  authHeader: string | null;
  body: Record<string, unknown> | null;
}

const upstreamCalls: UpstreamCall[] = [];
let upstreamStore: Array<Record<string, any>> = [];
let forceUpstreamConflict = false;

function resetMockState() {
  upstreamCalls.length = 0;
  forceUpstreamConflict = false;
  upstreamStore = [
    {
      id: "sol-notifica-1",
      sistema_origem: "notifica",
      status: "pendente",
      tipo_referencia: "parecer",
      referencia_id: "par-101",
      processo: "123456/2026",
      barragem_id: "bar-01",
      nome_barragem: "Barragem Rio Claro",
      municipio: "Cuiabá",
      curso_agua: "Córrego Claro",
      coordenadas: "15°35'00\" S / 56°05'00\" W",
      empreendedor_id: "emp-01",
      empreendedor_nome: "Fazenda Modelo Ltda",
      empreendedor_cpf_cnpj: "12.345.678/0001-90",
      relato: "Verificar estabilidade do talude de jusante.",
      solicitante_id: ANALYST_A_ID,
      solicitante_nome: "Analista A",
      solicitante_email: "analista.a@sema.mt.gov.br",
      solicitante_perfil: "Analista",
      equipe: [
        {
          id: ANALYST_B_ID,
          nome: "Analista B",
          email: "analista.b@sema.mt.gov.br",
          cpf: "111.222.333-44",
        },
      ],
      data_vistoria: "2026-06-15",
      observacao_campo: "Inspeção agendada.",
      secret_internal_flag: "should_not_leak",
      created_at: "2026-06-01T10:00:00.000Z",
      updated_at: "2026-06-01T10:00:00.000Z",
    },
    {
      id: "sol-outro-sistema-2",
      sistema_origem: "classifica",
      status: "pendente",
      nome_barragem: "Barragem Outro Sistema",
      relato: "Origem externa que não deve aparecer no Notifica.",
      solicitante_id: ADMIN_ID,
      solicitante_nome: "Admin Principal",
      created_at: "2026-06-02T10:00:00.000Z",
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
    const headers = new Headers(init?.headers);
    const method = (init?.method || "GET").toUpperCase();
    const parsedBody =
      typeof init?.body === "string" && init.body
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : null;

    if (url.pathname === "/auth/v1/user") {
      const token = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const tokenMap: Record<string, { id: string; email: string }> = {
        "token-admin": { id: ADMIN_ID, email: "admin@sema.mt.gov.br" },
        "token-analyst-a": { id: ANALYST_A_ID, email: "analista.a@sema.mt.gov.br" },
        "token-analyst-b": { id: ANALYST_B_ID, email: "analista.b@sema.mt.gov.br" },
        "token-viewer": { id: VIEWER_ID, email: "visualizador@sema.mt.gov.br" },
      };
      const matched = tokenMap[token];
      if (!matched) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
      }
      return new Response(
        JSON.stringify({
          id: matched.id,
          email: matched.email,
          app_metadata: {},
          user_metadata: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/rest/v1/perfis_usuarios") {
      const emailFilter = url.searchParams.get("email");
      if (emailFilter?.startsWith("ilike.")) {
        const targetEmail = decodeURIComponent(emailFilter.slice(6)).toLowerCase();
        return new Response(
          JSON.stringify(MOCK_USERS.filter((u) => u.email === targetEmail)),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify(MOCK_USERS), { status: 200 });
    }

    if (url.hostname === "administra-central.test") {
      upstreamCalls.push({
        method,
        url: url.toString(),
        authHeader: headers.get("Authorization"),
        body: parsedBody,
      });

      if (headers.get("Authorization") !== "Bearer test-solicitacoes-service-token") {
        return new Response(JSON.stringify({ error: "Unauthorized service token" }), { status: 401 });
      }

      if (forceUpstreamConflict && method !== "GET") {
        return new Response(
          JSON.stringify({ error: "Solicitação duplicada para este processo no serviço central." }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }

      const basePath = "/api/solicitacoes-vistoria";
      if (url.pathname === basePath && method === "GET") {
        return new Response(JSON.stringify({ solicitacoes: upstreamStore }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === basePath && method === "POST") {
        const created = {
          id: `sol-created-${upstreamStore.length + 1}`,
          status: "pendente",
          equipe: [],
          data_vistoria: null,
          observacao_campo: null,
          created_at: "2026-06-10T12:00:00.000Z",
          updated_at: "2026-06-10T12:00:00.000Z",
          ...(parsedBody || {}),
        };
        upstreamStore.push(created);
        return new Response(JSON.stringify({ solicitacao: created }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      const obsMatch = url.pathname.match(/^\/api\/solicitacoes-vistoria\/([^/]+)\/observacao$/);
      if (obsMatch && method === "PATCH") {
        const targetId = decodeURIComponent(obsMatch[1]);
        const idx = upstreamStore.findIndex((item) => item.id === targetId);
        if (idx === -1) {
          return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
        }
        upstreamStore[idx] = {
          ...upstreamStore[idx],
          observacao_campo: parsedBody?.observacao_campo ?? null,
          updated_at: "2026-06-15T15:00:00.000Z",
        };
        return new Response(JSON.stringify({ solicitacao: upstreamStore[idx] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const itemMatch = url.pathname.match(/^\/api\/solicitacoes-vistoria\/([^/]+)$/);
      if (itemMatch) {
        const targetId = decodeURIComponent(itemMatch[1]);
        const idx = upstreamStore.findIndex((item) => item.id === targetId);
        if (idx === -1) {
          return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
        }
        if (method === "GET") {
          return new Response(JSON.stringify({ solicitacao: upstreamStore[idx] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (method === "PATCH") {
          upstreamStore[idx] = {
            ...upstreamStore[idx],
            ...(parsedBody || {}),
            updated_at: "2026-06-11T12:00:00.000Z",
          };
          return new Response(JSON.stringify({ solicitacao: upstreamStore[idx] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

    return new Response(JSON.stringify({ error: "Not mocked" }), { status: 404 });
  }) as typeof fetch;
}

const serverModule = await import("../server.ts");
const app = serverModule.default;

async function withTestServer(run: (baseUrl: string) => Promise<void>) {
  process.env.ADMINISTRA_SOLICITACOES_URL = "https://administra-central.test/api/solicitacoes-vistoria";
  process.env.SOLICITACOES_SERVICE_TOKEN = "test-solicitacoes-service-token";
  resetMockState();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  installMockFetch(baseUrl);

  try {
    await run(baseUrl);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("Solicitações de Vistoria: exige sessão válida (401 sem token)", async () => {
  await withTestServer(async (baseUrl) => {
    const endpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: "GET", path: "/api/solicitacoes-vistoria" },
      { method: "POST", path: "/api/solicitacoes-vistoria", body: { relato: "Teste" } },
      { method: "PATCH", path: "/api/solicitacoes-vistoria/sol-notifica-1", body: { relato: "Editado" } },
      { method: "POST", path: "/api/solicitacoes-vistoria/sol-notifica-1/cancelar", body: {} },
      { method: "PATCH", path: "/api/solicitacoes-vistoria/sol-notifica-1/observacao", body: { observacao_campo: "Obs" } },
    ];

    for (const ep of endpoints) {
      const res = await originalFetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { "Content-Type": "application/json" } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 401, `${ep.method} ${ep.path} deveria exigir sessão`);
    }
    assert.equal(upstreamCalls.length, 0);
  });
});

test("Solicitações de Vistoria: Visualizador consulta apenas origem Notifica com allowlist (sem CPF/CNPJ), mas não cria nem altera", async () => {
  await withTestServer(async (baseUrl) => {
    const getRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      headers: { Authorization: "Bearer token-viewer" },
    });
    assert.equal(getRes.status, 200);
    const getData = (await getRes.json()) as { solicitacoes: Array<Record<string, any>> };
    assert.equal(getData.solicitacoes.length, 1);
    assert.equal(getData.solicitacoes[0].id, "sol-notifica-1");
    assert.equal(getData.solicitacoes[0].sistema_origem, "notifica");
    assert.equal("empreendedor_cpf_cnpj" in getData.solicitacoes[0], false);
    assert.equal("secret_internal_flag" in getData.solicitacoes[0], false);
    assert.equal("solicitante_email" in getData.solicitacoes[0], false);

    const postRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-viewer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ relato: "Tentativa visualizador" }),
    });
    assert.equal(postRes.status, 403);

    const patchRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-viewer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ relato: "Alteração visualizador" }),
    });
    assert.equal(patchRes.status, 403);

    const cancelRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1/cancelar`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-viewer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(cancelRes.status, 403);

    const obsRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1/observacao`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-viewer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ observacao_campo: "Obs visualizador" }),
    });
    assert.equal(obsRes.status, 403);
  });
});

test("Solicitações de Vistoria: POST ignora identidade falsificada no corpo e força sistema_origem = notifica", async () => {
  await withTestServer(async (baseUrl) => {
    const res = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sistema_origem: "fiscaliza",
        solicitante_id: ADMIN_ID,
        solicitante_nome: "Admin Falsificado",
        user_id: ADMIN_ID,
        author_id: VIEWER_ID,
        nome_barragem: "Barragem Santa Fé",
        municipio: "Sinop",
        curso_agua: "Rio Teles Pires",
        coordenadas: "11°51'51\" S / 55°30'09\" W",
        empreendedor_id: "emp-999",
        empreendedor_nome: "Agropecuária Norte",
        processo: "987654/2026",
        relato: "Verificar erosão no vertedouro após chuvas intensas.",
      }),
    });

    assert.equal(res.status, 201);
    const data = (await res.json()) as { solicitacao: Record<string, any> };
    assert.equal(data.solicitacao.sistema_origem, "notifica");
    assert.equal(data.solicitacao.solicitante_id, ANALYST_A_ID);
    assert.equal(data.solicitacao.solicitante_nome, "Analista A");

    const postCall = upstreamCalls.find((c) => c.method === "POST");
    assert.ok(postCall);
    assert.equal(postCall.body?.sistema_origem, "notifica");
    assert.equal(postCall.body?.solicitante_id, ANALYST_A_ID);
    assert.equal(postCall.body?.solicitante_nome, "Analista A");
  });
});

test("Solicitações de Vistoria: rejeita CPF/CNPJ, JSON copiado e relato acima de 1.000 caracteres", async () => {
  await withTestServer(async (baseUrl) => {
    const cpfInRelato = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome_barragem: "Barragem Teste",
        relato: "Responsável com CPF 123.456.789-01 não atendeu.",
      }),
    });
    assert.equal(cpfInRelato.status, 400);

    const cnpjInKey = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cpfCnpj: "12.345.678/0001-90",
        relato: "Relato válido sem documento no texto.",
      }),
    });
    assert.equal(cnpjInKey.status, 400);

    const overLimit = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        relato: "A".repeat(1001),
      }),
    });
    assert.equal(overLimit.status, 400);

    const jsonRelato = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        relato: '{"barragem":"copiada"}',
      }),
    });
    assert.equal(jsonRelato.status, 400);

    assert.equal(upstreamCalls.length, 0);
  });
});

test("Solicitações de Vistoria: Analista altera/cancela só a própria; Administrador altera/cancela qualquer", async () => {
  await withTestServer(async (baseUrl) => {
    // Analista B não é autor de sol-notifica-1
    const otherEdit = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-analyst-b",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ relato: "Tentativa de outro analista" }),
    });
    assert.equal(otherEdit.status, 403);

    const otherCancel = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1/cancelar`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-analyst-b",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(otherCancel.status, 403);

    // Analista A (autor) consegue editar
    const ownEdit = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ relato: "Relato atualizado pelo próprio autor." }),
    });
    assert.equal(ownEdit.status, 200);
    const ownEditData = (await ownEdit.json()) as { solicitacao: Record<string, any> };
    assert.equal(ownEditData.solicitacao.relato, "Relato atualizado pelo próprio autor.");

    // Administrador consegue editar e cancelar solicitação de qualquer autor
    const adminEdit = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ municipio: "Várzea Grande" }),
    });
    assert.equal(adminEdit.status, 200);
    const adminEditData = (await adminEdit.json()) as { solicitacao: Record<string, any> };
    assert.equal(adminEditData.solicitacao.municipio, "Várzea Grande");

    const adminCancel = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1/cancelar`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ motivo_cancelamento: "Solicitação substituída por novo parecer." }),
    });
    assert.equal(adminCancel.status, 200);
    const adminCancelData = (await adminCancel.json()) as { solicitacao: Record<string, any> };
    assert.equal(adminCancelData.solicitacao.status, "cancelada");
  });
});

test("Solicitações de Vistoria: observacao_campo restrita a integrante da equipe ou Administrador e aceita apenas observacao_campo", async () => {
  await withTestServer(async (baseUrl) => {
    // Analista A é o autor, mas NÃO integra a equipe -> 403
    const nonTeamRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1/observacao`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ observacao_campo: "Tentativa fora da equipe" }),
    });
    assert.equal(nonTeamRes.status, 403);

    // Enviar campo extra na rota /observacao -> 400
    const extraFieldRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1/observacao`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-analyst-b",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        observacao_campo: "Texto válido",
        status: "realizada",
      }),
    });
    assert.equal(extraFieldRes.status, 400);

    // Analista B integra a equipe -> 200
    const teamRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1/observacao`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-analyst-b",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        observacao_campo: "Verificada drenagem superficial em operação normal.",
      }),
    });
    assert.equal(teamRes.status, 200);
    const teamData = (await teamRes.json()) as { solicitacao: Record<string, any> };
    assert.equal(
      teamData.solicitacao.observacao_campo,
      "Verificada drenagem superficial em operação normal."
    );

    // Administrador também pode atualizar observacao_campo -> 200
    const adminObsRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria/sol-notifica-1/observacao`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token-admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        observacao_campo: "Observação revisada pela coordenação.",
      }),
    });
    assert.equal(adminObsRes.status, 200);
    const adminObsData = (await adminObsRes.json()) as { solicitacao: Record<string, any> };
    assert.equal(
      adminObsData.solicitacao.observacao_campo,
      "Observação revisada pela coordenação."
    );
  });
});

test("Solicitações de Vistoria: falha controlada (503 sem configuração e 409 do Administra) sem gravar localmente", async () => {
  await withTestServer(async (baseUrl) => {
    delete process.env.ADMINISTRA_SOLICITACOES_URL;
    delete process.env.SOLICITACOES_SERVICE_TOKEN;

    const unconfiguredGet = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      headers: { Authorization: "Bearer token-admin" },
    });
    assert.equal(unconfiguredGet.status, 503);

    const unconfiguredPost = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ relato: "Sem configuração do serviço central." }),
    });
    assert.equal(unconfiguredPost.status, 503);
    assert.equal(upstreamCalls.length, 0);

    // Restaura configuração e simula conflito 409 do serviço central
    process.env.ADMINISTRA_SOLICITACOES_URL = "https://administra-central.test/api/solicitacoes-vistoria";
    process.env.SOLICITACOES_SERVICE_TOKEN = "test-solicitacoes-service-token";
    forceUpstreamConflict = true;

    const initialCount = upstreamStore.length;
    const conflictRes = await originalFetch(`${baseUrl}/api/solicitacoes-vistoria`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token-analyst-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome_barragem: "Barragem Conflito",
        relato: "Nova solicitação em conflito.",
      }),
    });
    assert.equal(conflictRes.status, 409);
    const conflictData = (await conflictRes.json()) as { error?: string };
    assert.match(conflictData.error || "", /duplicada|conflito/i);
    assert.equal(upstreamStore.length, initialCount);
  });
});
