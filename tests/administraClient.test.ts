import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  createAdministraHttpClient,
  resolveAdministraClientConfig,
} from "../server/administraClient.ts";
import { mergeByKey } from "../src/data/localAdministraRepository.ts";
import { LocalEcosystemRepository } from "../src/data/localEcosystemRepository.ts";
import type { BarragemCanonica } from "../src/types/ecosystem.ts";

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
const TEST_KEY_ID = "notifica-s2s-key-2026";
const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = crypto.generateKeyPairSync("ed25519");
const TEST_PRIVATE_KEY_PEM = TEST_PRIVATE_KEY.export({ type: "pkcs8", format: "pem" }).toString();

const FAKE_LEGACY_URL = "https://administra-legacy.supabase.co";
const FAKE_LEGACY_TOKEN = "mock-legacy-service-role-token-123456";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_EMPTY_BODY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

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

function makeBarragemDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "bar-v2-1",
    nome: "Barragem V2",
    car: "MT-5103403-ABC123",
    uf: "MT",
    municipio: "Cuiabá",
    municipioIbge: "5103403",
    empreendedorId: "emp-v2-1",
    empreendimento: "Fazenda V2",
    processo: "2026/000123",
    snisb: "SNISB-100",
    cursoAgua: "Rio Cuiabá",
    latitude: -15.6,
    longitude: -56.1,
    altura: 12.5,
    volume: 150000,
    danoPotencial: "Médio",
    categoriaRisco: "Baixo",
    classificadaEm: "2026-01-15T00:00:00.000Z",
    situacao: "Em operação",
    createdAt: "2026-01-10T10:00:00.000Z",
    updatedAt: "2026-02-15T12:30:00.000Z",
    ...overrides,
  };
}

function verifyS2sRequestHeaders(
  urlStr: string,
  method: string,
  headers: Headers,
  expectedKeyId: string,
  publicKey: crypto.KeyObject
): { valid: boolean; canonicalMessage: string; jti: string } {
  assert.equal(headers.has("Authorization"), false, "Authorization header must never be sent");
  assert.equal(headers.has("authorization"), false, "authorization header must never be sent");
  assert.equal(headers.has("apikey"), false, "apikey header must never be sent");
  for (const key of headers.keys()) {
    assert.equal(key.toLowerCase().startsWith("x-consumer-"), false, `Header ${key} must not be sent`);
  }

  const parsed = new URL(urlStr);
  const expectedCanonicalQuery = parsed.search.startsWith("?") ? parsed.search.slice(1) : "";
  const contentTypeNormalized = (headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const keyId = headers.get("x-s2s-key-id") || "";
  const timestamp = headers.get("x-s2s-timestamp") || "";
  const jti = headers.get("x-s2s-jti") || "";
  const bodySha = headers.get("x-s2s-body-sha256") || "";
  const signature = headers.get("x-s2s-signature") || "";

  assert.equal(keyId, expectedKeyId);
  assert.match(timestamp, /^\d+$/);
  assert.match(jti, UUID_V4_REGEX);
  assert.equal(bodySha, EXPECTED_EMPTY_BODY_SHA256);
  assert.ok(signature.length > 20);

  // Mensagem canônica literal de 10 linhas (sem depender de helpers do cliente)
  const canonicalMessage =
    `S2S-V2\n` +
    `${method.toUpperCase()}\n` +
    `${parsed.pathname}\n` +
    `${expectedCanonicalQuery}\n` +
    `${contentTypeNormalized}\n` +
    `${EXPECTED_EMPTY_BODY_SHA256}\n` +
    `${expectedKeyId}\n` +
    `${timestamp}\n` +
    `${jti}\n` +
    `|`;

  const lines = canonicalMessage.split("\n");
  assert.equal(lines.length, 10);

  const valid = crypto.verify(
    null,
    Buffer.from(canonicalMessage, "utf8"),
    publicKey,
    Buffer.from(signature, "base64url")
  );
  return { valid, canonicalMessage, jti };
}

test("administraClient: permanece desconfigurado e não faz chamadas sem as três variáveis S2S-V2 (mesmo com legado ou ADMINISTRA_API_TOKEN)", async () => {
  let called = 0;
  const mockFetch = (async () => {
    called += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const missingKeyId: Record<string, string | undefined> = {
    ADMINISTRA_API_URL: FAKE_API_V2_URL,
    ADMINISTRA_S2S_KEY_ID: "",
    ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
    ADMINISTRA_API_TOKEN: "legacy-bearer-token-should-be-ignored",
    ADMINISTRA_SUPABASE_URL: FAKE_LEGACY_URL,
    ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_TOKEN,
    ADMINISTRA_DB_URL: FAKE_LEGACY_URL,
    ADMINISTRA_DB_KEY: FAKE_LEGACY_TOKEN,
    CENTRAL_REGISTRY_ENDPOINT: FAKE_LEGACY_URL,
    CENTRAL_REGISTRY_TOKEN: FAKE_LEGACY_TOKEN,
  };
  assert.equal(resolveAdministraClientConfig(missingKeyId), null);

  assert.equal(
    resolveAdministraClientConfig({
      ADMINISTRA_API_URL: FAKE_API_V2_URL,
      ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
      ADMINISTRA_S2S_PRIVATE_KEY_PEM: "",
    }),
    null
  );

  assert.equal(
    resolveAdministraClientConfig({
      ADMINISTRA_API_URL: "",
      ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
      ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
    }),
    null
  );

  assert.equal(
    resolveAdministraClientConfig({
      ADMINISTRA_API_URL: FAKE_API_V2_URL,
      ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
      ADMINISTRA_S2S_PRIVATE_KEY_PEM: "invalid-pem-content",
    }),
    null
  );

  const { privateKey: rsaKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.equal(
    resolveAdministraClientConfig({
      ADMINISTRA_API_URL: FAKE_API_V2_URL,
      ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
      ADMINISTRA_S2S_PRIVATE_KEY_PEM: rsaKey.export({ type: "pkcs8", format: "pem" }).toString(),
    }),
    null
  );

  // Valida ADMINISTRA_S2S_KEY_ID com ^[A-Za-z0-9._:-]{1,128}$
  for (const invalidKeyId of ["key with space", "key/with/slash", "key@host", "a".repeat(129)]) {
    assert.equal(
      resolveAdministraClientConfig({
        ADMINISTRA_API_URL: FAKE_API_V2_URL,
        ADMINISTRA_S2S_KEY_ID: invalidKeyId,
        ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
      }),
      null
    );
  }
  assert.ok(
    resolveAdministraClientConfig({
      ADMINISTRA_API_URL: FAKE_API_V2_URL,
      ADMINISTRA_S2S_KEY_ID: "notifica.s2s-key_2026:v2",
      ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
    }) !== null
  );

  // Rejeita URL com credenciais, query ou fragmento e exige HTTPS em produção
  for (const invalidUrl of [
    "https://user:pass@administra-api-v2.internal.test",
    "https://administra-api-v2.internal.test?foo=bar",
    "https://administra-api-v2.internal.test?",
    "https://administra-api-v2.internal.test#frag",
    "https://administra-api-v2.internal.test#",
  ]) {
    assert.equal(
      resolveAdministraClientConfig({
        ADMINISTRA_API_URL: invalidUrl,
        ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
        ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
      }),
      null
    );
  }

  assert.equal(
    resolveAdministraClientConfig({
      NODE_ENV: "production",
      ADMINISTRA_API_URL: "http://administra-api-v2.internal.test",
      ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
      ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
    }),
    null
  );
  assert.ok(
    resolveAdministraClientConfig({
      NODE_ENV: "development",
      ADMINISTRA_API_URL: "http://administra-api-v2.internal.test",
      ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
      ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
    }) !== null
  );

  // Remove apenas um sufixo final /api/v2 preservando prefixo de gateway
  const gwConfig = resolveAdministraClientConfig({
    ADMINISTRA_API_URL: "https://gateway.internal.test/sema/administra/api/v2/",
    ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
    ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
  });
  assert.equal(gwConfig?.endpoint, "https://gateway.internal.test/sema/administra");

  const doubleSuffixConfig = resolveAdministraClientConfig({
    ADMINISTRA_API_URL: "https://gateway.internal.test/api/v2/api/v2/",
    ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
    ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
  });
  assert.equal(doubleSuffixConfig?.endpoint, "https://gateway.internal.test/api/v2");

  // Suporta PEM com \n escapado em variável de ambiente
  assert.ok(
    resolveAdministraClientConfig({
      ADMINISTRA_API_URL: FAKE_API_V2_URL,
      ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
      ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM.replace(/\n/g, "\\n"),
    }) !== null
  );

  const client = createAdministraHttpClient({
    env: missingKeyId,
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
  assert.equal(barragens.pagesFetched, 0);
  assert.equal(barragens.errorCode, "ADMINISTRA_UNCONFIGURED");
  assert.equal(called, 0);
});

test("administraClient (S2S-V2): valida assinatura Ed25519, mensagem canônica literal de 10 linhas, jti único, cursor repetido e teto de páginas", async () => {
  const baseEnv = {
    ADMINISTRA_API_URL: `${FAKE_API_V2_URL}/gateway/api/v2/`,
    ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
    ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
  };

  const seenJtis: string[] = [];
  const observedUrls: string[] = [];
  const observedMessages: string[] = [];

  const paginatedClient = createAdministraHttpClient({
    env: baseEnv,
    nowMs: () => 1_760_000_000_000,
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = String(init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      observedUrls.push(url);

      const check = verifyS2sRequestHeaders(url, method, headers, TEST_KEY_ID, TEST_PUBLIC_KEY);
      assert.equal(check.valid, true, `Assinatura Ed25519 inválida para ${url}`);
      seenJtis.push(check.jti);
      observedMessages.push(check.canonicalMessage);

      const parsedUrl = new URL(url);
      if (parsedUrl.pathname === "/gateway/api/v2/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (parsedUrl.pathname === "/gateway/api/v2/barragens") {
        assert.equal(parsedUrl.searchParams.has("q"), false);
        assert.equal(parsedUrl.searchParams.get("limit"), "500");

        const cursor = parsedUrl.searchParams.get("cursor");
        if (!cursor) {
          return new Response(
            JSON.stringify({
              success: true,
              apiVersion: "2.0",
              items: [makeBarragemDto({ id: "bar-p1", nome: "Barragem Página 1" })],
              pagination: { limit: 500, hasMore: true, nextCursor: "cur+1/2=3==" },
              maskingPolicy: "S2S_MASKED",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (cursor === "cur+1/2=3==") {
          return new Response(
            JSON.stringify({
              success: true,
              apiVersion: "2.0",
              items: [makeBarragemDto({ id: "bar-p2", nome: "Barragem Página 2" })],
              pagination: { limit: 500, hasMore: false, nextCursor: null },
              maskingPolicy: "S2S_MASKED",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch,
  });

  const healthRes = await paginatedClient.checkHealth();
  assert.equal(healthRes.ok, true);

  const barRes = await paginatedClient.fetchBarragens();
  assert.equal(barRes.ok, true);
  assert.equal(barRes.status, 200);
  assert.equal(barRes.pagesFetched, 2);
  assert.equal(barRes.truncatedByPageLimit, false);
  assert.equal(barRes.barragensRows.length, 2);
  assert.deepEqual(
    barRes.barragensRows.map((b) => b.id),
    ["bar-p1", "bar-p2"]
  );

  assert.deepEqual(observedUrls, [
    `${FAKE_API_V2_URL}/gateway/api/v2/health`,
    `${FAKE_API_V2_URL}/gateway/api/v2/barragens?limit=500`,
    `${FAKE_API_V2_URL}/gateway/api/v2/barragens?cursor=cur%2B1%2F2%3D3%3D%3D&limit=500`,
  ]);
  assert.equal(new Set(seenJtis).size, 3, "Cada chamada HTTP deve gerar um x-s2s-jti UUID v4 único");
  assert.equal(observedMessages[2].split("\n")[2], "/gateway/api/v2/barragens");
  assert.equal(observedMessages[2].split("\n")[3], "cursor=cur%2B1%2F2%3D3%3D%3D&limit=500");
  assert.equal(observedMessages[2].split("\n")[7], "1760000000");

  // Resposta vazia legítima no contrato v2
  const emptyClient = createAdministraHttpClient({
    env: baseEnv,
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          success: true,
          apiVersion: "2.0",
          items: [],
          pagination: { limit: 500, hasMore: false, nextCursor: null },
          maskingPolicy: { maskedFields: ["empreendedorNome", "cpfCnpj"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch,
  });
  const emptyRes = await emptyClient.fetchBarragens();
  assert.equal(emptyRes.ok, true);
  assert.equal(emptyRes.pagesFetched, 1);
  assert.deepEqual(emptyRes.barragensRows, []);

  // Rejeita cursor repetido sem retornar resultado parcial
  let repeatCalls = 0;
  const repeatCursorClient = createAdministraHttpClient({
    env: baseEnv,
    fetchImpl: (async () => {
      repeatCalls += 1;
      return new Response(
        JSON.stringify({
          success: true,
          apiVersion: "2.0",
          items: [makeBarragemDto({ id: `bar-rep-${repeatCalls}` })],
          pagination: { limit: 500, hasMore: true, nextCursor: "cursor-repetido" },
          maskingPolicy: "S2S_MASKED",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch,
  });
  const repeatRes = await repeatCursorClient.fetchBarragens();
  assert.equal(repeatCalls, 2);
  assert.equal(repeatRes.ok, false);
  assert.equal(repeatRes.errorCode, "ADMINISTRA_INVALID_CONTRACT");
  assert.deepEqual(repeatRes.barragensRows, []);

  // Respeita teto de páginas quando hasMore permanece true
  let capCalls = 0;
  const cappedClient = createAdministraHttpClient({
    env: baseEnv,
    maxPages: 2,
    fetchImpl: (async () => {
      capCalls += 1;
      return new Response(
        JSON.stringify({
          success: true,
          apiVersion: "2.0",
          items: [makeBarragemDto({ id: `bar-${capCalls}` })],
          pagination: { limit: 500, hasMore: true, nextCursor: `cursor-${capCalls}` },
          maskingPolicy: "S2S_MASKED",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch,
  });
  const cappedRes = await cappedClient.fetchBarragens();
  assert.equal(capCalls, 2);
  assert.equal(cappedRes.ok, false);
  assert.equal(cappedRes.truncatedByPageLimit, true);
  assert.equal(cappedRes.errorCode, "ADMINISTRA_PAGINATION_LIMIT");
  assert.deepEqual(cappedRes.barragensRows, []);
});

test("administraClient (erros e contratos inválidos): trata 401, 403, 409, timeout e rejeita legado ou envelopes inválidos", async () => {
  const baseEnv = {
    ADMINISTRA_API_URL: FAKE_API_V2_URL,
    ADMINISTRA_S2S_KEY_ID: TEST_KEY_ID,
    ADMINISTRA_S2S_PRIVATE_KEY_PEM: TEST_PRIVATE_KEY_PEM,
  };

  // 401 / 403 / 409
  for (const status of [401, 403, 409] as const) {
    const client = createAdministraHttpClient({
      env: baseEnv,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: `HTTP ${status}` }), { status })) as typeof fetch,
    });
    const res = await client.fetchBarragens();
    assert.equal(res.configured, true);
    assert.equal(res.ok, false);
    assert.equal(res.status, status);
    if (status === 401 || status === 403) {
      assert.equal(res.authDenied, true);
      assert.equal(res.errorCode, "ADMINISTRA_AUTH_DENIED");
    } else {
      assert.equal(res.authDenied, false);
      assert.equal(res.errorCode, "ADMINISTRA_HTTP_ERROR");
    }
    const serialized = JSON.stringify(res);
    assert.equal(serialized.includes("PRIVATE KEY"), false);
  }

  // Timeout
  const timeoutClient = createAdministraHttpClient({
    env: baseEnv,
    timeoutMs: 25,
    fetchImpl: ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const onAbort = () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort);
      })) as typeof fetch,
  });
  const timeoutRes = await timeoutClient.fetchBarragens();
  assert.equal(timeoutRes.ok, false);
  assert.equal(timeoutRes.status, 504);
  assert.equal(timeoutRes.timedOut, true);
  assert.equal(timeoutRes.errorCode, "ADMINISTRA_TIMEOUT");

  // Contratos inválidos (incluindo legado nome_barragem, empreendedor_id, containers barragens/data e erros de paginação)
  const invalidPayloads: unknown[] = [
    [],
    { barragens: [makeBarragemDto()] },
    { data: [makeBarragemDto()] },
    { items: [makeBarragemDto()] },
    {
      success: false,
      apiVersion: "2.0",
      items: [],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
      maskingPolicy: "S2S_MASKED",
    },
    {
      success: true,
      apiVersion: "1.0",
      items: [],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
      maskingPolicy: "S2S_MASKED",
    },
    {
      success: true,
      apiVersion: "2.0",
      items: [],
      pagination: { limit: 500, hasMore: true, nextCursor: null },
      maskingPolicy: "S2S_MASKED",
    },
    {
      success: true,
      apiVersion: "2.0",
      items: [],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
    },
    {
      success: true,
      apiVersion: "2.0",
      items: [{ id: "bar-leg", nome_barragem: "Legado", empreendedor_id: "emp-leg" }],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
      maskingPolicy: "S2S_MASKED",
    },
    {
      success: true,
      apiVersion: "2.0",
      items: [makeBarragemDto({ nome_barragem: "Campo legado extra" })],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
      maskingPolicy: "S2S_MASKED",
    },
    {
      success: true,
      apiVersion: "2.0",
      items: [makeBarragemDto({ empreendedor_id: "emp-legado" })],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
      maskingPolicy: "S2S_MASKED",
    },
    {
      success: true,
      apiVersion: "2.0",
      items: [makeBarragemDto({ nome: 123 })],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
      maskingPolicy: "S2S_MASKED",
    },
  ];

  for (const payload of invalidPayloads) {
    const badClient = createAdministraHttpClient({
      env: baseEnv,
      fetchImpl: (async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });
    const badRes = await badClient.fetchBarragens();
    assert.equal(badRes.ok, false, `Payload inválido não deveria passar: ${JSON.stringify(payload)}`);
    assert.equal(badRes.errorCode, "ADMINISTRA_INVALID_CONTRACT");
    assert.deepEqual(badRes.barragensRows, []);
  }
});

test("mapAdministraBarragemV2 converte DTO v2 camelCase mascarado sem depender de empreendedorNome nem CPF/CNPJ", async () => {
  const { mapAdministraBarragemV2 } = await import("../server.ts");

  const mapped = mapAdministraBarragemV2(
    makeBarragemDto({
      id: "bar-dto-1",
      nome: "Barragem Alto Teles Pires",
      car: "MT-5107925-998877",
      uf: "MT",
      municipio: "Sorriso",
      municipioIbge: "5107925",
      empreendedorId: "emp-dto-1",
      empreendimento: "Fazenda Alto Teles Pires",
      processo: "2026/004321",
      snisb: "SNISB-9876",
      cursoAgua: "Rio Teles Pires",
      latitude: -12.545,
      longitude: -55.712,
      altura: 14.5,
      volume: 250000,
      danoPotencial: "Médio",
      categoriaRisco: "Baixo",
      classificadaEm: "2026-01-20T09:00:00.000Z",
      situacao: "Em operação",
    })
  );

  assert.equal(mapped.id, "bar-dto-1");
  assert.equal(mapped.nomeBarragem, "Barragem Alto Teles Pires");
  assert.equal(mapped.empreendedorId, "emp-dto-1");
  assert.equal(mapped.empreendimento, "Fazenda Alto Teles Pires");
  assert.equal(mapped.car, "MT-5107925-998877");
  assert.equal(mapped.codigoSnisb, "SNISB-9876");
  assert.equal(mapped.processoReferencia, "2026/004321");
  assert.equal(mapped.municipio, "Sorriso");
  assert.equal(mapped.municipioIbge, "5107925");
  assert.equal(mapped.uf, "MT");
  assert.equal(mapped.cursoAguaBarrado, "Rio Teles Pires");
  assert.equal(mapped.situacaoEmpreendimento, "Em operação");
  assert.ok(mapped.coordenadasGMS?.lat.g === "12");
  assert.ok(mapped.coordenadasGMS?.long.g === "55");
  assert.equal(mapped.altura, "14.5");
  assert.equal(mapped.volume, "250000");
  assert.equal(mapped.classificacaoDPA, "Médio");
  assert.equal(mapped.classificacaoCRI, "Baixo");
  assert.equal(mapped.classificadaEm, "2026-01-20T09:00:00.000Z");
  assert.equal(mapped.registryOwnerSystem, "ADMINISTRA");
  assert.equal("empreendedorNome" in mapped, false);
  assert.equal("empreendedorCpfCnpj" in mapped, false);

  // Não gera createdAt/updatedAt nem emite undefined ou strings padrão vazias quando ausentes
  const sparse = mapAdministraBarragemV2({
    id: "bar-sparse-1",
    nome: "Barragem Sem Datas",
    car: null,
    uf: null,
    municipio: null,
    municipioIbge: null,
    empreendedorId: null,
    empreendimento: null,
    processo: null,
    snisb: null,
    cursoAgua: null,
    latitude: null,
    longitude: null,
    altura: null,
    volume: null,
    danoPotencial: null,
    categoriaRisco: null,
    classificadaEm: null,
    situacao: null,
    createdAt: null,
    updatedAt: null,
  });
  assert.equal("createdAt" in sparse, false);
  assert.equal("updatedAt" in sparse, false);
  assert.equal("empreendedorId" in sparse, false);
  assert.equal("municipio" in sparse, false);
  assert.equal("uf" in sparse, false);
  assert.equal("coordenadasGMS" in sparse, false);
  assert.equal("codigoSnisb" in sparse, false);
  assert.equal("altura" in sparse, false);
  assert.equal("volume" in sparse, false);
  for (const val of Object.values(sparse)) {
    assert.notEqual(val, undefined);
  }
});

test("Rotas do servidor usam S2S-V2 Ed25519, paginam /api/v2/barragens e fazem busca local em /api/registry/search sem vazar chave ou assinatura", async () => {
  const originalFetch = globalThis.fetch;
  let adminCalls: Array<{ path: string; jti: string | null }> = [];
  let legacyCalls = 0;
  let scenario: "ok" | "invalid-contract" | "scope-denied" | "conflict" | "timeout" = "ok";

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
    const method = String(init?.method || "GET").toUpperCase();
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
      const check = verifyS2sRequestHeaders(rawUrl, method, headers, TEST_KEY_ID, TEST_PUBLIC_KEY);
      assert.equal(check.valid, true, `Assinatura S2S-V2 inválida na rota ${url.pathname}`);
      adminCalls.push({ path: `${url.pathname}${url.search}`, jti: headers.get("x-s2s-jti") });

      if (scenario === "conflict") {
        return new Response(JSON.stringify({ error: "Conflict" }), { status: 409 });
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
        if (url.searchParams.has("q")) {
          return new Response(JSON.stringify({ error: "Unsupported query parameter q" }), { status: 400 });
        }
        if (scenario === "scope-denied") {
          return new Response(JSON.stringify({ error: "Missing S2S scope" }), { status: 403 });
        }
        if (scenario === "invalid-contract") {
          return new Response(JSON.stringify({ barragens: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const cursor = url.searchParams.get("cursor");
        if (!cursor) {
          return new Response(
            JSON.stringify({
              success: true,
              apiVersion: "2.0",
              items: [
                makeBarragemDto({
                  id: "bar-api2-1",
                  nome: "Barragem Rio Verde",
                  empreendedorId: "emp-api2-1",
                  empreendimento: "Fazenda Rio Verde",
                  car: "MT-5103403-111",
                  snisb: "SNISB-2026-1",
                  processo: "2026/000111",
                  municipio: "Lucas do Rio Verde",
                  uf: "MT",
                }),
              ],
              pagination: { limit: 500, hasMore: true, nextCursor: "page-2" },
              maskingPolicy: "S2S_MASKED",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            apiVersion: "2.0",
            items: [
              makeBarragemDto({
                id: "bar-api2-2",
                nome: "Barragem Tapajós",
                empreendedorId: "emp-api2-2",
                empreendimento: "Fazenda Tapajós",
                car: "MT-5107925-222",
                snisb: "SNISB-2026-2",
                processo: "2026/000222",
                municipio: "Sorriso",
                uf: "MT",
              }),
            ],
            pagination: { limit: 500, hasMore: false, nextCursor: null },
            maskingPolicy: "S2S_MASKED",
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
    ADMINISTRA_S2S_KEY_ID: process.env.ADMINISTRA_S2S_KEY_ID,
    ADMINISTRA_S2S_PRIVATE_KEY_PEM: process.env.ADMINISTRA_S2S_PRIVATE_KEY_PEM,
    ADMINISTRA_API_TIMEOUT_MS: process.env.ADMINISTRA_API_TIMEOUT_MS,
  };

  try {
    // 1) Desconfigurado -> zero chamadas externas
    process.env.ADMINISTRA_API_URL = FAKE_API_V2_URL;
    process.env.ADMINISTRA_S2S_KEY_ID = "";
    process.env.ADMINISTRA_S2S_PRIVATE_KEY_PEM = "";

    const bootUnconf = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
      headers: { Authorization: "Bearer token-viewer" },
    });
    assert.equal(bootUnconf.status, 200);
    const bootUnconfJson = (await bootUnconf.json()) as { remoteEnabled: boolean; barragens: unknown[] };
    assert.equal(bootUnconfJson.remoteEnabled, false);
    assert.equal(bootUnconfJson.barragens.length, 0);
    assert.equal(adminCalls.length, 0);

    // 2) Configurado com S2S-V2 -> paginação completa + busca local sem enviar q ao Administra
    process.env.ADMINISTRA_S2S_KEY_ID = TEST_KEY_ID;
    process.env.ADMINISTRA_S2S_PRIVATE_KEY_PEM = TEST_PRIVATE_KEY_PEM;
    scenario = "ok";
    adminCalls = [];

    const bootRes = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
      headers: { Authorization: "Bearer token-viewer" },
    });
    assert.equal(bootRes.status, 200);
    const bootText = await bootRes.text();
    assert.equal(bootText.includes(TEST_KEY_ID), false);
    assert.equal(bootText.includes("PRIVATE KEY"), false);
    assert.equal(bootText.includes(FAKE_API_V2_URL), false);
    const bootJson = JSON.parse(bootText) as {
      remoteEnabled: boolean;
      barragens: Array<{ id: string; car?: string; nomeBarragem: string }>;
    };
    assert.equal(bootJson.remoteEnabled, true);
    assert.deepEqual(
      bootJson.barragens.map((b) => b.id),
      ["bar-api2-1", "bar-api2-2"]
    );
    assert.equal(bootJson.barragens[1]?.car, "MT-5107925-222");

    // Busca local por campo CAR ou empreendimento da página 2 sem passar q ao Administra
    const searchRes = await originalFetch(`${baseUrl}/api/registry/search?q=MT-5107925-222`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(searchRes.status, 200);
    const searchJson = (await searchRes.json()) as {
      remoteEnabled: boolean;
      barragens: Array<{ id: string }>;
    };
    assert.equal(searchJson.remoteEnabled, true);
    assert.deepEqual(
      searchJson.barragens.map((b) => b.id),
      ["bar-api2-2"]
    );

    const ecoRes = await originalFetch(`${baseUrl}/api/ecosystem/integrated-data?system=ADMINISTRA`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(ecoRes.status, 200);
    const ecoText = await ecoRes.text();
    assert.equal(ecoText.includes(TEST_KEY_ID), false);
    assert.equal(ecoText.includes("PRIVATE KEY"), false);
    const ecoJson = JSON.parse(ecoText) as {
      diagnostics: { ADMINISTRA: { reachable: boolean; barragensCount: number } };
      barragens: Array<{ id: string }>;
    };
    assert.equal(ecoJson.diagnostics.ADMINISTRA.reachable, true);
    assert.equal(ecoJson.diagnostics.ADMINISTRA.barragensCount, 2);
    assert.equal(legacyCalls, 0);
    assert.ok(adminCalls.every((c) => !c.path.includes("q=")));

    // 3) Contrato inválido (container legado barragens) -> erro de integração (bootstrap e integrated-data)
    scenario = "invalid-contract";
    const bootBad = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    const bootBadJson = (await bootBad.json()) as { remoteEnabled: boolean; errorCode?: string };
    assert.equal(bootBadJson.remoteEnabled, false);
    assert.equal(bootBadJson.errorCode, "ADMINISTRA_INVALID_CONTRACT");

    const ecoBad = await originalFetch(`${baseUrl}/api/ecosystem/integrated-data?system=ADMINISTRA`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(ecoBad.status, 502);
    const ecoBadJson = (await ecoBad.json()) as {
      partial?: boolean;
      barragens: unknown[];
      diagnostics: { ADMINISTRA: { reachable: boolean; barragensCount: number; errorCode?: string } };
    };
    assert.equal(ecoBadJson.partial, false);
    assert.equal(ecoBadJson.barragens.length, 0);
    assert.equal(ecoBadJson.diagnostics.ADMINISTRA.reachable, false);
    assert.equal(ecoBadJson.diagnostics.ADMINISTRA.barragensCount, 0);
    assert.equal(ecoBadJson.diagnostics.ADMINISTRA.errorCode, "ADMINISTRA_INVALID_CONTRACT");

    // 4) 403 e 409 (não retorna 200 nem reachable:true)
    scenario = "scope-denied";
    const ecoDenied = await originalFetch(`${baseUrl}/api/ecosystem/integrated-data?system=ADMINISTRA`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(ecoDenied.status, 502);
    const ecoDeniedJson = (await ecoDenied.json()) as {
      diagnostics: { ADMINISTRA: { reachable: boolean; authDenied: boolean; errorCode?: string } };
    };
    assert.equal(ecoDeniedJson.diagnostics.ADMINISTRA.reachable, false);
    assert.equal(ecoDeniedJson.diagnostics.ADMINISTRA.authDenied, true);
    assert.equal(ecoDeniedJson.diagnostics.ADMINISTRA.errorCode, "ADMINISTRA_AUTH_DENIED");

    scenario = "conflict";
    const bootConflict = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    const bootConflictJson = (await bootConflict.json()) as { remoteEnabled: boolean; errorCode?: string };
    assert.equal(bootConflictJson.remoteEnabled, false);
    assert.equal(bootConflictJson.errorCode, "ADMINISTRA_HTTP_ERROR");

    // 5) Timeout (504 em integrated-data, sem reachable:true)
    scenario = "timeout";
    process.env.ADMINISTRA_API_TIMEOUT_MS = "25";
    const bootTimeout = await originalFetch(`${baseUrl}/api/registry/bootstrap`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    const bootTimeoutJson = (await bootTimeout.json()) as { remoteEnabled: boolean; errorCode?: string };
    assert.equal(bootTimeoutJson.remoteEnabled, false);
    assert.equal(bootTimeoutJson.errorCode, "ADMINISTRA_TIMEOUT");

    const ecoTimeout = await originalFetch(`${baseUrl}/api/ecosystem/integrated-data?system=ADMINISTRA`, {
      headers: { Authorization: "Bearer token-analyst" },
    });
    assert.equal(ecoTimeout.status, 504);
    const ecoTimeoutJson = (await ecoTimeout.json()) as {
      barragens: unknown[];
      diagnostics: { ADMINISTRA: { reachable: boolean; barragensCount: number; errorCode?: string } };
    };
    assert.equal(ecoTimeoutJson.barragens.length, 0);
    assert.equal(ecoTimeoutJson.diagnostics.ADMINISTRA.reachable, false);
    assert.equal(ecoTimeoutJson.diagnostics.ADMINISTRA.barragensCount, 0);
    assert.equal(ecoTimeoutJson.diagnostics.ADMINISTRA.errorCode, "ADMINISTRA_TIMEOUT");
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("mergeByKey preserva coordenadas, datas e campos locais existentes contra dados mascarados e preenche campos vazios", () => {
  const localCoords = {
    lat: { g: "15", m: "36", s: "12.40" },
    long: { g: "56", m: "05", s: "44.10" },
  };
  const remoteCoords = {
    lat: { g: "10", m: "00", s: "00.00" },
    long: { g: "50", m: "00", s: "00.00" },
  };

  // 1) Preservação de coordenadas locais (com remoto sem coordenadas e com remoto com coordenadas)
  const localWithCoords: BarragemCanonica = {
    id: "bar-merge-1",
    empreendedorId: "emp-local-1",
    nomeBarragem: "Barragem Local",
    municipio: "Cuiabá",
    uf: "MT",
    coordenadasGMS: localCoords,
    createdAt: "2026-01-05T10:00:00.000Z",
    updatedAt: "2026-02-10T10:00:00.000Z",
    sourceSystem: "ADMINISTRA",
    registryOwnerSystem: "ADMINISTRA",
  };
  const maskedRemoteWithoutCoords: BarragemCanonica = {
    id: "bar-merge-1",
    nomeBarragem: "Barragem Local",
    empreendedorId: "",
    municipio: undefined,
    uf: "",
    coordenadasGMS: undefined,
    sourceSystem: "ADMINISTRA",
    registryOwnerSystem: "ADMINISTRA",
  };
  const mergedWithoutCoords = mergeByKey([localWithCoords], [maskedRemoteWithoutCoords]);
  assert.deepEqual(mergedWithoutCoords[0]?.coordenadasGMS, localCoords);
  assert.equal(mergedWithoutCoords[0]?.empreendedorId, "emp-local-1");
  assert.equal(mergedWithoutCoords[0]?.municipio, "Cuiabá");
  assert.equal(mergedWithoutCoords[0]?.uf, "MT");

  const remoteWithNewerTsAndDifferentCoords: BarragemCanonica = {
    id: "bar-merge-1",
    nomeBarragem: "Barragem Local Atualizada",
    coordenadasGMS: remoteCoords,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z",
    sourceSystem: "ADMINISTRA",
    registryOwnerSystem: "ADMINISTRA",
  };
  const mergedPreservingEditedCoords = mergeByKey(
    [localWithCoords],
    [remoteWithNewerTsAndDifferentCoords]
  );
  assert.deepEqual(mergedPreservingEditedCoords[0]?.coordenadasGMS, localCoords);
  // 2) updatedAt avançado quando o remoto for válido e comprovadamente mais recente, mantendo createdAt local
  assert.equal(mergedPreservingEditedCoords[0]?.nomeBarragem, "Barragem Local Atualizada");
  assert.equal(mergedPreservingEditedCoords[0]?.updatedAt, "2026-04-01T10:00:00.000Z");
  assert.equal(mergedPreservingEditedCoords[0]?.createdAt, "2026-01-05T10:00:00.000Z");

  // 3) updatedAt e createdAt locais preservados quando o remoto não traz data, traz null/vazio ou timestamp inválido
  const remoteWithoutDates: BarragemCanonica = {
    id: "bar-merge-1",
    nomeBarragem: "Barragem Local",
    createdAt: null,
    updatedAt: "",
    sourceSystem: "ADMINISTRA",
    registryOwnerSystem: "ADMINISTRA",
  };
  const mergedDates = mergeByKey([localWithCoords], [remoteWithoutDates]);
  assert.equal(mergedDates[0]?.createdAt, "2026-01-05T10:00:00.000Z");
  assert.equal(mergedDates[0]?.updatedAt, "2026-02-10T10:00:00.000Z");

  const remoteWithInvalidUpdatedAt: BarragemCanonica = {
    id: "bar-merge-1",
    nomeBarragem: "Barragem Remota Sem Timestamp Valido",
    createdAt: "2026-03-15T10:00:00.000Z",
    updatedAt: "data-invalida",
    sourceSystem: "ADMINISTRA",
    registryOwnerSystem: "ADMINISTRA",
  };
  const mergedInvalidDate = mergeByKey([localWithCoords], [remoteWithInvalidUpdatedAt]);
  assert.equal(mergedInvalidDate[0]?.updatedAt, "2026-02-10T10:00:00.000Z");
  assert.equal(mergedInvalidDate[0]?.createdAt, "2026-01-05T10:00:00.000Z");
  assert.equal(mergedInvalidDate[0]?.nomeBarragem, "Barragem Local");

  // 3) Preenchimento de campo local vazio por valor remoto válido sem apagar datas/coordenadas locais
  const localWithEmptyFields: BarragemCanonica = {
    id: "bar-merge-2",
    nomeBarragem: "Barragem Incompleta",
    empreendedorId: "",
    municipio: "",
    codigoSnisb: undefined,
    coordenadasGMS: localCoords,
    createdAt: "2026-01-12T08:00:00.000Z",
    updatedAt: "2026-02-01T08:00:00.000Z",
    sourceSystem: "ADMINISTRA",
    registryOwnerSystem: "ADMINISTRA",
  };
  const remoteFillingFields: BarragemCanonica = {
    id: "bar-merge-2",
    nomeBarragem: "Barragem Incompleta",
    empreendedorId: "emp-remoto-2",
    municipio: "Sorriso",
    codigoSnisb: "SNISB-777",
    car: "MT-5107925-CAR1",
    sourceSystem: "ADMINISTRA",
    registryOwnerSystem: "ADMINISTRA",
  };
  const mergedFilled = mergeByKey([localWithEmptyFields], [remoteFillingFields]);
  assert.equal(mergedFilled[0]?.empreendedorId, "emp-remoto-2");
  assert.equal(mergedFilled[0]?.municipio, "Sorriso");
  assert.equal(mergedFilled[0]?.codigoSnisb, "SNISB-777");
  assert.equal(mergedFilled[0]?.car, "MT-5107925-CAR1");
  assert.deepEqual(mergedFilled[0]?.coordenadasGMS, localCoords);
  assert.equal(mergedFilled[0]?.createdAt, "2026-01-12T08:00:00.000Z");
  assert.equal(mergedFilled[0]?.updatedAt, "2026-02-01T08:00:00.000Z");
});

test("LocalEcosystemRepository.getIntegratedSystemsData preserva cache local quando leitura do Administra falha", async () => {
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
  const originalFetch = globalThis.fetch;

  (globalThis as any).localStorage = mockLocalStorage;
  (globalThis as any).window = {};

  const initialCache = {
    empreendedores: [],
    barragens: [
      {
        id: "bar-cached-adm-1",
        nomeBarragem: "Barragem Cacheada",
        municipio: "Cuiabá",
        uf: "MT",
        sourceSystem: "ADMINISTRA",
        registryOwnerSystem: "ADMINISTRA",
      },
    ],
    responsaveisTecnicos: [],
    products: [],
    diagnostics: {
      ADMINISTRA: {
        systemId: "ADMINISTRA",
        remoteConfigured: true,
        reachable: true,
        authDenied: false,
        empreendedoresCount: 0,
        barragensCount: 1,
        rtsCount: 0,
        productsCount: 0,
      },
    },
    fetchedAt: "2026-02-01T00:00:00.000Z",
  };
  storageMap.set("notifica_csb_integrated_systems_cache", JSON.stringify(initialCache));

  const mockedFetch = (async () =>
    new Response(
      JSON.stringify({
        error: "Resposta incompatível com o contrato da API do Administra.",
        errorCode: "ADMINISTRA_INVALID_CONTRACT",
        partial: false,
        empreendedores: [],
        barragens: [],
        responsaveisTecnicos: [],
        products: [],
        diagnostics: {
          ADMINISTRA: {
            systemId: "ADMINISTRA",
            remoteConfigured: true,
            reachable: false,
            authDenied: false,
            empreendedoresCount: 0,
            barragensCount: 0,
            rtsCount: 0,
            productsCount: 0,
            errorCode: "ADMINISTRA_INVALID_CONTRACT",
          },
        },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  globalThis.fetch = mockedFetch;

  try {
    const repo = new LocalEcosystemRepository({} as any, mockedFetch);
    const result = await repo.getIntegratedSystemsData("ADMINISTRA");
    assert.equal(result.barragens.length, 1);
    assert.equal(result.barragens[0]?.id, "bar-cached-adm-1");
    assert.equal(result.diagnostics.ADMINISTRA.reachable, false);
    assert.equal(result.diagnostics.ADMINISTRA.errorCode, "ADMINISTRA_INVALID_CONTRACT");

    const persisted = JSON.parse(storageMap.get("notifica_csb_integrated_systems_cache") || "{}");
    assert.equal(persisted.barragens.length, 1);
    assert.equal(persisted.barragens[0]?.id, "bar-cached-adm-1");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = prevWindow;
    if (prevLocalStorage === undefined) delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage = prevLocalStorage;
  }
});

test("Fronteira de segredos: frontend, .env.example e logs não expõem credenciais S2S-V2 nem legado", () => {
  const rootDir = process.cwd();
  const frontendFiles = collectSourceFiles(path.join(rootDir, "src"));
  const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf-8");

  const forbiddenFrontendPatterns = [
    /\bADMINISTRA_API_[A-Z0-9_]*/,
    /\bADMINISTRA_S2S_[A-Z0-9_]*/,
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

  const clientSource = fs.readFileSync(path.join(rootDir, "server", "administraClient.ts"), "utf-8");
  assert.equal(/console\.(log|info|warn|error|debug)/.test(clientSource), false);
  assert.equal(/\bADMINISTRA_API_TOKEN\b/.test(clientSource), false);

  const envExample = fs.readFileSync(path.join(rootDir, ".env.example"), "utf-8");
  assert.match(envExample, /^ADMINISTRA_API_URL=$/m);
  assert.match(envExample, /^ADMINISTRA_S2S_KEY_ID=$/m);
  assert.match(envExample, /^ADMINISTRA_S2S_PRIVATE_KEY_PEM=$/m);
  assert.equal(/\bADMINISTRA_API_TOKEN\b/.test(envExample), false);
  assert.equal(/ADMINISTRA_SUPABASE_/.test(envExample), false);
});
