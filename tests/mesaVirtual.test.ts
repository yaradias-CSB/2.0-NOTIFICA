import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import {
  describeBarragemRelationship,
  hasBarragemCoordinates,
  normalizeLookupText,
  paginateItems,
  searchBarragens,
  sortBarragensOfficialFirst,
} from "../src/lib/barragemSearch.ts";
import {
  canUserDeleteDraft,
  canUserEditDraft,
  canUserRectifyDocument,
  createRetificationDraft,
  escapeHtml,
  getNormalizedMesaState,
  isDocumentAuthor,
  type PermissionCheckDocument,
} from "../src/lib/documentPermissions.ts";
import type { SolicitacaoVistoriaRecord } from "../src/types/solicitacoesVistoria.ts";
import {
  applyFieldProposals,
  detectNonEmptyFieldConflicts,
} from "../src/lib/formSelectionMerge.ts";
import type { BarragemCanonica } from "../src/types/ecosystem.ts";

const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = crypto.generateKeyPairSync("ed25519");
const TEST_KEY_ID = "mesa-virtual-test-key";
const EXPECTED_EMPTY_BODY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

process.env.NODE_ENV = "test";
process.env.NOTIFICA_SUPABASE_URL = "https://notifica-mesa-test.supabase.co";
process.env.NOTIFICA_SUPABASE_ANON_KEY = "test-anon-key-mesa-123456";
process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-mesa-123456";
process.env.CLASSIFICA_SUPABASE_URL = "https://classifica-mesa-test.supabase.co";
process.env.CLASSIFICA_SUPABASE_SERVICE_ROLE_KEY = "test-classifica-service-key-123";
process.env.ADMINISTRA_API_URL = "https://administra-mesa.internal.test";
process.env.ADMINISTRA_S2S_KEY_ID = TEST_KEY_ID;
process.env.ADMINISTRA_S2S_PRIVATE_KEY_PEM = TEST_PRIVATE_KEY.export({
  type: "pkcs8",
  format: "pem",
}).toString();

const ANALYST_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANALYST_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PERFIS = [
  { id: ANALYST_A_ID, email: "analista.a@sema.mt.gov.br", nome: "Analista A", perfil: "Analista", status: "ativo" },
  { id: ANALYST_B_ID, email: "analista.b@sema.mt.gov.br", nome: "Analista B", perfil: "Analista", status: "ativo" },
];

const remoteBarragens227 = [
  ...Array.from({ length: 226 }, (_, idx) => ({
    id: `bar-adm-${idx + 1}`,
    empreendedorId: idx % 2 === 0 ? `emp-adm-${idx + 1}` : null,
    nome: idx === 10 ? "Fazenda São José Barragem" : `Barragem Teste ${String(idx + 1).padStart(3, "0")}`,
    empreendimento: idx === 10 ? "Fazenda São José" : `Empreendimento ${idx + 1}`,
    car: idx % 3 === 0 ? `MT-5103403-${idx + 1}` : null,
    snisb: idx % 4 === 0 ? `SNISB-${idx + 1}` : null,
    processo: `2026/${String(idx + 1).padStart(5, "0")}`,
    municipio: "Cuiabá",
    uf: "MT",
    latitude: -15.6,
    longitude: -56.1,
  })),
  {
    id: "bar-s2s-227",
    empreendedorId: null,
    nome: "TESTE BARRAGEM S2S",
    empreendimento: null,
    car: null,
    snisb: null,
    processo: null,
    municipio: "Cuiabá",
    uf: "MT",
    latitude: null,
    longitude: null,
  },
];

const storedPareceres = new Map<string, Record<string, any>>([
  [
    "parecer-b-draft",
    {
      id: "parecer-b-draft",
      user_id: ANALYST_B_ID,
      analista: "Analista B",
      status: "Rascunho",
      processo: "2026/90001",
      barragem_id: "bar-adm-1",
    },
  ],
  [
    "parecer-a-concluded",
    {
      id: "parecer-a-concluded",
      user_id: ANALYST_A_ID,
      analista: "Analista A",
      status: "Concluído",
      processo: "2026/90002",
      barragem_id: "bar-adm-1",
    },
  ],
  [
    "parecer-a-draft",
    {
      id: "parecer-a-draft",
      user_id: ANALYST_A_ID,
      analista: "Analista A",
      status: "Rascunho",
      processo: "2026/90003",
      barragem_id: "bar-adm-1",
    },
  ],
]);

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

    if (url.origin === "https://notifica-mesa-test.supabase.co") {
      if (url.pathname === "/auth/v1/user") {
        const token = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        const map: Record<string, { id: string; email: string }> = {
          "token-a": { id: ANALYST_A_ID, email: "analista.a@sema.mt.gov.br" },
          "token-b": { id: ANALYST_B_ID, email: "analista.b@sema.mt.gov.br" },
        };
        const u = map[token];
        if (!u) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        return new Response(JSON.stringify({ id: u.id, email: u.email, app_metadata: {}, user_metadata: {} }), {
          status: 200,
        });
      }

      if (url.pathname === "/rest/v1/perfis_usuarios" && method === "GET") {
        const idFilter = url.searchParams.get("id");
        if (idFilter?.startsWith("eq.")) {
          const targetId = idFilter.slice(3);
          return new Response(JSON.stringify(PERFIS.filter((p) => p.id === targetId)), { status: 200 });
        }
        return new Response(JSON.stringify(PERFIS), { status: 200 });
      }

      if (url.pathname === "/rest/v1/pareceres") {
        if (method === "GET") {
          const idFilter = url.searchParams.get("id");
          if (idFilter?.startsWith("eq.")) {
            const targetId = idFilter.slice(3);
            const row = storedPareceres.get(targetId);
            return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
          }
          return new Response(JSON.stringify(Array.from(storedPareceres.values())), { status: 200 });
        }
        if (method === "POST") {
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
          const saved = { id: body.id || crypto.randomUUID(), ...body };
          storedPareceres.set(saved.id, saved);
          return new Response(JSON.stringify([saved]), { status: 201 });
        }
        if (method === "DELETE") {
          const idFilter = url.searchParams.get("id");
          const targetId = idFilter?.startsWith("eq.") ? idFilter.slice(3) : "";
          const deleted = storedPareceres.get(targetId);
          storedPareceres.delete(targetId);
          return new Response(JSON.stringify(deleted ? [deleted] : []), { status: 200 });
        }
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }

    if (url.origin === "https://classifica-mesa-test.supabase.co") {
      return new Response(
        JSON.stringify([
          {
            id: "classif-1",
            tipo_documento: "Classificação de Barragem",
            numero_documento: "CLASS-2026-01",
            processo: "2026/00011",
            barragem_id: "bar-adm-1",
            barragem_nome: "Barragem Teste 001",
            status: "Concluído",
            created_at: "2026-03-10T10:00:00.000Z",
          },
          {
            id: "classif-2",
            tipo_documento: "Classificação de Barragem",
            numero_documento: "CLASS-2026-02",
            processo: "2026/00011",
            barragem_id: "bar-adm-1",
            barragem_nome: "Barragem Teste 001",
            status: "Rascunho",
            created_at: "2026-03-01T10:00:00.000Z",
          },
        ]),
        { status: 200 }
      );
    }

    if (url.origin === "https://administra-mesa.internal.test") {
      const contentTypeNormalized = (headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const timestamp = headers.get("x-s2s-timestamp") || "";
      const jti = headers.get("x-s2s-jti") || "";
      const expectedCanonicalQuery = url.pathname === "/api/v2/barragens" ? "limit=500" : "";
      const canonicalMsg =
        `S2S-V2\n${method}\n${url.pathname}\n${expectedCanonicalQuery}\n${contentTypeNormalized}\n` +
        `${EXPECTED_EMPTY_BODY_SHA256}\n${TEST_KEY_ID}\n${timestamp}\n${jti}\n|`;
      const sig = headers.get("x-s2s-signature") || "";
      const ok = crypto.verify(null, Buffer.from(canonicalMsg, "utf8"), TEST_PUBLIC_KEY, Buffer.from(sig, "base64url"));
      if (!ok) return new Response(JSON.stringify({ error: "Invalid S2S signature" }), { status: 401 });

      if (url.pathname === "/api/v2/barragens") {
        return new Response(
          JSON.stringify({
            success: true,
            apiVersion: "2.0",
            items: remoteBarragens227,
            pagination: { limit: 500, hasMore: false, nextCursor: null },
            maskingPolicy: "S2S_MASKED",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify([]), { status: 200 });
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

test("Busca de barragens preserva todos os 227 registros incluindo 'TESTE BARRAGEM S2S' sem vínculo/coordenadas e normaliza acentos/espaços", () => {
  const mapped: BarragemCanonica[] = remoteBarragens227.map((r) => ({
    id: r.id,
    empreendedorId: r.empreendedorId || undefined,
    nomeBarragem: r.nome,
    empreendimento: r.empreendimento || undefined,
    car: r.car || undefined,
    codigoSnisb: r.snisb || undefined,
    processo: r.processo || undefined,
    municipio: r.municipio,
    uf: r.uf,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    sourceSystem: "ADMINISTRA",
    registryOwnerSystem: "ADMINISTRA",
  }));

  const all = searchBarragens(mapped, { query: "" });
  assert.equal(all.length, 227);
  assert.ok(all.some((b) => b.nomeBarragem === "TESTE BARRAGEM S2S"));

  const byAccentAndSpace = searchBarragens(mapped, { query: "  fazenda   sao   jose  " });
  assert.equal(byAccentAndSpace.length, 1);
  assert.equal(byAccentAndSpace[0]?.id, "bar-adm-11");

  const byId = searchBarragens(mapped, { query: "bar-s2s-227" });
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.nomeBarragem, "TESTE BARRAGEM S2S");

  const relS2s = describeBarragemRelationship(byId[0]!);
  assert.equal(relS2s.state, "PENDING_REVIEW");
  assert.equal(relS2s.label, "vínculo pendente de revisão");
  assert.equal(relS2s.hasCoordinates, false);
  assert.equal(relS2s.coordinatesLabel, "coordenadas indisponíveis");
  assert.equal(hasBarragemCoordinates(byId[0]!), false);

  const relUnlinked = describeBarragemRelationship({ id: "bar_123_local", nomeBarragem: "Local" });
  assert.equal(relUnlinked.state, "UNLINKED");
  assert.equal(relUnlinked.label, "sem vínculo");

  const sorted = sortBarragensOfficialFirst(mapped);
  assert.ok(sorted[0]?.empreendedorId);
  assert.ok(sorted.some((b) => b.id === "bar-s2s-227"));

  const p1 = paginateItems(sorted, 1, 100);
  const p3 = paginateItems(sorted, 3, 100);
  assert.equal(p1.items.length, 100);
  assert.equal(p1.totalPages, 3);
  assert.equal(p3.items.length, 27);
  assert.equal(normalizeLookupText("  Ação   Múltipla  "), "acao multipla");
});

test("Permissões de autoria, proteção de documentos concluídos, retificação auditável, estados Mesa Virtual e escapeHtml", () => {
  const actorA = { userId: ANALYST_A_ID, name: "Analista A", canEdit: true };
  const actorB = { userId: ANALYST_B_ID, name: "Analista B", canEdit: true };

  const draftA: PermissionCheckDocument = { id: "d1", userId: ANALYST_A_ID, analista: "Analista A", status: "Rascunho" };
  const concludedA: PermissionCheckDocument = { id: "c1", userId: ANALYST_A_ID, analista: "Analista A", status: "Concluído" };

  assert.equal(isDocumentAuthor(draftA, actorA), true);
  assert.equal(isDocumentAuthor(draftA, actorB), false);

  assert.equal(canUserEditDraft(draftA, actorA), true);
  assert.equal(canUserEditDraft(draftA, actorB), false);
  assert.equal(canUserDeleteDraft(draftA, actorA), true);
  assert.equal(canUserDeleteDraft(draftA, actorB), false);

  assert.equal(canUserEditDraft(concludedA, actorA), false);
  assert.equal(canUserDeleteDraft(concludedA, actorA), false);
  assert.equal(canUserRectifyDocument(concludedA, true), true);

  assert.throws(() => createRetificationDraft(concludedA, "ok", actorB), /mínimo/i);
  const retified = createRetificationDraft(concludedA, "Correção de coordenadas após conferência", actorB, "ret-1");
  assert.equal(retified.id, "ret-1");
  assert.equal(retified.status, "Rascunho");
  assert.equal(retified.retificadoDeId, "c1");
  assert.equal(retified.versaoRetificacao, 2);
  assert.equal(retified.userId, ANALYST_B_ID);
  assert.equal(canUserEditDraft(retified, actorB), true);
  assert.equal(concludedA.status, "Concluído");

  assert.equal(getNormalizedMesaState(draftA, []), "Rascunho");
  assert.equal(getNormalizedMesaState(concludedA, []), "Concluído");
  assert.equal(
    getNormalizedMesaState(concludedA, [{ id: "s1", referencia_id: "c1", status: "solicitada" } as unknown as SolicitacaoVistoriaRecord]),
    "Solicitação pendente"
  );
  assert.equal(
    getNormalizedMesaState(concludedA, [
      { id: "s2", referencia_id: "c1", status: "realizada", observacao_campo: "Vistoria realizada" } as unknown as SolicitacaoVistoriaRecord,
    ]),
    "Resposta recebida"
  );

  const escaped = escapeHtml(`<img src=x onerror="alert('xss')"> & ok`);
  assert.ok(!escaped.includes("<"));
  assert.ok(!escaped.includes(">"));
  assert.ok(escaped.includes("&lt;img") && escaped.includes("&amp;"));
});

test("Confirmação de sobrescrita preserva campos preenchidos no modo empty_only e substitui no overwrite_all", () => {
  const current = {
    nomeBarragem: "Nome Manual",
    municipio: "",
    carMt: "MT-MANUAL",
  };
  const proposals = [
    { key: "nomeBarragem" as const, label: "Nome da Barragem", incomingValue: "Nome Administra" },
    { key: "municipio" as const, label: "Município", incomingValue: "Cuiabá" },
    { key: "carMt" as const, label: "CAR", incomingValue: "MT-MANUAL" },
  ];

  const conflicts = detectNonEmptyFieldConflicts(current, proposals);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.key, "nomeBarragem");

  const kept = applyFieldProposals(current, proposals, "empty_only");
  assert.equal(kept.nomeBarragem, "Nome Manual");
  assert.equal(kept.municipio, "Cuiabá");

  const replaced = applyFieldProposals(current, proposals, "overwrite_all");
  assert.equal(replaced.nomeBarragem, "Nome Administra");
  assert.equal(replaced.municipio, "Cuiabá");
});

test("API /api/registry/search pagina todas as 227 barragens incluindo TESTE BARRAGEM S2S e /api/documents/related sinaliza Classifica concluído", async () => {
  const searchAllRes = await originalFetch(`${baseUrl}/api/registry/search?page=3&pageSize=100`, {
    headers: { Authorization: "Bearer token-a" },
  });
  assert.equal(searchAllRes.status, 200);
  const searchAllBody = (await searchAllRes.json()) as {
    barragens: Array<{ id: string; nomeBarragem: string }>;
    pagination: { total: number; totalPages: number; page: number };
  };
  assert.equal(searchAllBody.pagination.total, 227);
  assert.equal(searchAllBody.pagination.totalPages, 3);
  assert.equal(searchAllBody.pagination.page, 3);
  assert.equal(searchAllBody.barragens.length, 27);

  const searchS2sRes = await originalFetch(`${baseUrl}/api/registry/search?q=teste%20barragem%20s2s`, {
    headers: { Authorization: "Bearer token-a" },
  });
  assert.equal(searchS2sRes.status, 200);
  const searchS2sBody = (await searchS2sRes.json()) as {
    barragens: Array<{ id: string; nomeBarragem: string }>;
  };
  assert.equal(searchS2sBody.barragens.length, 1);
  assert.equal(searchS2sBody.barragens[0]?.id, "bar-s2s-227");

  const relatedRes = await originalFetch(
    `${baseUrl}/api/documents/related?barragemId=bar-adm-1&page=1&pageSize=1`,
    { headers: { Authorization: "Bearer token-a" } }
  );
  assert.equal(relatedRes.status, 200);
  const relatedBody = (await relatedRes.json()) as {
    items: Array<{ id: string }>;
    total: number;
    hasMore: boolean;
    hasConcludedClassificacao: boolean;
  };
  assert.equal(relatedBody.items.length, 1);
  assert.ok(relatedBody.total >= 2);
  assert.equal(relatedBody.hasMore, true);
  assert.equal(relatedBody.hasConcludedClassificacao, true);
});

test("Backend /api/documents/:kind bloqueia edição de outro autor (403), edição direta de concluído (409) e valida retificação", async () => {
  // Outra autoria -> 403
  const foreignEdit = await originalFetch(`${baseUrl}/api/documents/pareceres`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-a",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: "parecer-b-draft", status: "Rascunho" }),
  });
  assert.equal(foreignEdit.status, 403);

  // Documento concluído -> 409
  const concludedEdit = await originalFetch(`${baseUrl}/api/documents/pareceres`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-a",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: "parecer-a-concluded", status: "Rascunho" }),
  });
  assert.equal(concludedEdit.status, 409);

  // Retificação sem justificativa válida -> 400
  const invalidRectify = await originalFetch(`${baseUrl}/api/documents/pareceres`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-a",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "parecer-a-ret-1",
      status: "Rascunho",
      retificado_de_id: "parecer-a-concluded",
      retificacao_justificativa: "ok",
    }),
  });
  assert.equal(invalidRectify.status, 400);

  // Retificação válida -> 200 com carimbo do autor autenticado
  const validRectify = await originalFetch(`${baseUrl}/api/documents/pareceres`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-b",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "parecer-a-ret-1",
      status: "Rascunho",
      retificado_de_id: "parecer-a-concluded",
      retificacao_justificativa: "Ajuste técnico no parecer concluído.",
    }),
  });
  assert.equal(validRectify.status, 200);
  const validBody = (await validRectify.json()) as { item: Record<string, any> };
  assert.equal(validBody.item.user_id, ANALYST_B_ID);
  assert.equal(validBody.item.retificado_por_id, ANALYST_B_ID);
  assert.equal(validBody.item.retificado_de_id, "parecer-a-concluded");

  // Exclusão de outro autor -> 403; exclusão de concluído -> 409; exclusão do próprio rascunho -> 200
  const delForeign = await originalFetch(`${baseUrl}/api/documents/pareceres/parecer-b-draft`, {
    method: "DELETE",
    headers: { Authorization: "Bearer token-a" },
  });
  assert.equal(delForeign.status, 403);

  const delConcluded = await originalFetch(`${baseUrl}/api/documents/pareceres/parecer-a-concluded`, {
    method: "DELETE",
    headers: { Authorization: "Bearer token-a" },
  });
  assert.equal(delConcluded.status, 409);

  const delOwnDraft = await originalFetch(`${baseUrl}/api/documents/pareceres/parecer-a-draft`, {
    method: "DELETE",
    headers: { Authorization: "Bearer token-a" },
  });
  assert.equal(delOwnDraft.status, 200);
});
