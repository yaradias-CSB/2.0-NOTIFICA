import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-XSS-Protection", "0");
  next();
});

app.use(express.json({ limit: "4mb" }));

interface RemoteServiceConfig {
  endpoint: string;
  token: string;
}

function getServiceConfig(prefix: "CENTRAL" | "NOTIFICA" | "CLASSIFICA" | "FISCALIZA"): RemoteServiceConfig | null {
  const candidates: Array<[string | undefined, string | undefined]> =
    prefix === "CENTRAL"
      ? [
          [process.env.CENTRAL_REGISTRY_ENDPOINT, process.env.CENTRAL_REGISTRY_TOKEN],
          [process.env.ADMINISTRA_SUPABASE_URL, process.env.ADMINISTRA_SUPABASE_ANON_KEY],
          [process.env.ADMINISTRA_SERVICE_ENDPOINT, process.env.ADMINISTRA_SERVICE_TOKEN],
          [process.env.ADMINISTRA_DB_URL, process.env.ADMINISTRA_DB_KEY],
        ]
      : prefix === "NOTIFICA"
        ? [
            [process.env.NOTIFICA_SERVICE_ENDPOINT, process.env.NOTIFICA_SERVICE_TOKEN],
            [process.env.NOTIFICA_SUPABASE_URL, process.env.NOTIFICA_SUPABASE_ANON_KEY],
            [process.env.NOTIFICA_DB_URL, process.env.NOTIFICA_DB_KEY],
          ]
        : prefix === "CLASSIFICA"
          ? [
              [process.env.CLASSIFICA_SERVICE_ENDPOINT, process.env.CLASSIFICA_SERVICE_TOKEN],
              [process.env.CLASSIFICA_SUPABASE_URL, process.env.CLASSIFICA_SUPABASE_ANON_KEY],
              [process.env.CLASSIFICA_DB_URL, process.env.CLASSIFICA_DB_KEY],
            ]
          : [
              [process.env.FISCALIZA_SERVICE_ENDPOINT, process.env.FISCALIZA_SERVICE_TOKEN],
              [process.env.FISCALIZA_SUPABASE_URL, process.env.FISCALIZA_SUPABASE_ANON_KEY],
              [process.env.FISCALIZA_DB_URL, process.env.FISCALIZA_DB_KEY],
            ];

  for (const [rawEndpoint, rawToken] of candidates) {
    const endpoint = rawEndpoint?.trim();
    const token = rawToken?.trim();
    if (
      endpoint &&
      token &&
      /^https?:\/\//i.test(endpoint) &&
      !endpoint.includes("placeholder") &&
      token.length > 10
    ) {
      return {
        endpoint: endpoint.replace(/\/+$/, ""),
        token,
      };
    }
  }
  return null;
}

function buildRestBaseUrl(endpoint: string): string {
  if (endpoint.includes("/rest/v1")) return endpoint;
  return `${endpoint}/rest/v1`;
}

async function remoteRestRequest<T = any>(
  config: RemoteServiceConfig,
  tableOrPath: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: string;
    body?: unknown;
    prefer?: string;
  } = {}
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const baseUrl = buildRestBaseUrl(config.endpoint);
  const query = options.query ? `?${options.query}` : "";
  const url = `${baseUrl}/${tableOrPath}${query}`;

  const headers: Record<string, string> = {
    apikey: config.token,
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };
  if (options.prefer) {
    headers["Prefer"] = options.prefer;
  }

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, data: null };
    }
    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as T) : null;
    return { ok: true, status: response.status, data: parsed };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

function normalizeDigits(val: unknown): string {
  return String(val || "").replace(/\D/g, "");
}

function formatCpfCnpj(digits: string): string {
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return digits;
}

function mapRemoteEmpreendedor(row: Record<string, any>) {
  const rawDoc = String(row.cpf_cnpj ?? row.cpfCnpj ?? row.documento ?? row.cpf ?? row.cnpj ?? "");
  const norm = normalizeDigits(row.cpf_cnpj_normalizado ?? row.cpfCnpjNormalizado ?? rawDoc);
  return {
    id: String(row.id ?? ""),
    nome: String(row.nome ?? row.razao_social ?? row.empreendedor ?? ""),
    tipoPessoa: (row.tipo_pessoa ?? row.tipoPessoa ?? (norm.length === 14 ? "CNPJ" : "CPF")) as "CPF" | "CNPJ",
    cpfCnpj: norm ? formatCpfCnpj(norm) : rawDoc,
    cpfCnpjNormalizado: norm,
    telefone: row.telefone ?? undefined,
    email: row.email ?? undefined,
    logradouro: row.logradouro ?? undefined,
    numero: row.numero ?? undefined,
    complemento: row.complemento ?? undefined,
    bairro: row.bairro ?? undefined,
    municipio: row.municipio ?? undefined,
    uf: row.uf ?? "MT",
    cep: row.cep ?? undefined,
    carMt: row.car_mt ?? row.carMt ?? row.codigo_car ?? row.car ?? row.codigoCar ?? undefined,
    sourceSystem: (row.source_system ?? row.sourceSystem ?? "ADMINISTRA") as any,
    registryOwnerSystem: "ADMINISTRA" as const,
    createdByAnalyst: row.created_by_analyst ?? row.createdByAnalyst ?? undefined,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

function mapRemoteBarragem(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    empreendedorId: String(row.empreendedor_id ?? row.empreendedorId ?? ""),
    empreendedorNome: row.empreendedor_nome ?? row.empreendedorNome ?? undefined,
    empreendedorCpfCnpj: row.empreendedor_cpf_cnpj ?? row.empreendedorCpfCnpj ?? undefined,
    nomeBarragem: String(row.nome_barragem ?? row.nomeBarragem ?? row.nome ?? ""),
    codigoSnisb: row.codigo_snisb ?? row.codigoSnisb ?? row.snisb ?? undefined,
    processoReferencia: row.processo_referencia ?? row.processoReferencia ?? row.processo ?? undefined,
    municipio: String(row.municipio ?? ""),
    uf: String(row.uf ?? "MT"),
    cursoAguaBarrado: row.curso_agua_barrado ?? row.cursoAguaBarrado ?? undefined,
    usoPreponderante: row.uso_preponderante ?? row.usoPreponderante ?? undefined,
    situacaoEmpreendimento: row.situacao_empreendimento ?? row.situacaoEmpreendimento ?? undefined,
    tipoBarragem: row.tipo_barragem ?? row.tipoBarragem ?? undefined,
    coordenadasGMS: row.coordenadas_gms ?? row.coordenadasGMS ?? undefined,
    altura: row.altura !== undefined && row.altura !== null ? String(row.altura) : undefined,
    volume: row.volume !== undefined && row.volume !== null ? String(row.volume) : undefined,
    larguraCoroamento: row.largura_coroamento ?? row.larguraCoroamento ?? undefined,
    comprimentoCoroamento: row.comprimento_coroamento ?? row.comprimentoCoroamento ?? undefined,
    classificacaoBarragem: row.classificacao_barragem ?? row.classificacaoBarragem ?? undefined,
    classificacaoDPA: row.classificacao_dpa ?? row.classificacaoDPA ?? undefined,
    classificacaoCRI: row.classificacao_cri ?? row.classificacaoCRI ?? undefined,
    portariaClassificacao: row.portaria_classificacao ?? row.portariaClassificacao ?? undefined,
    parecerClassificacao: row.parecer_classificacao ?? row.parecerClassificacao ?? undefined,
    sourceSystem: (row.source_system ?? row.sourceSystem ?? "ADMINISTRA") as any,
    registryOwnerSystem: "ADMINISTRA" as const,
    createdByAnalyst: row.created_by_analyst ?? row.createdByAnalyst ?? undefined,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

function mapRemoteRT(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    nome: String(row.nome ?? ""),
    registroProfissional: row.registro_profissional ?? row.registroProfissional ?? row.crea ?? undefined,
    formacaoProfissional: row.formacao_profissional ?? row.formacaoProfissional ?? undefined,
    cpf: row.cpf ?? undefined,
    telefone: row.telefone ?? undefined,
    email: row.email ?? undefined,
    sourceSystem: (row.source_system ?? row.sourceSystem ?? "ADMINISTRA") as any,
    registryOwnerSystem: "ADMINISTRA" as const,
    createdByAnalyst: row.created_by_analyst ?? row.createdByAnalyst ?? undefined,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

function translateCarStatus(code: string): string {
  const map: Record<string, string> = {
    AT: "Ativo",
    PE: "Pendente",
    SU: "Suspenso",
    CA: "Cancelado",
  };
  return map[String(code || "").toUpperCase()] || code || "Desconhecido";
}

function translateCarTipo(code: string): string {
  const map: Record<string, string> = {
    IRU: "Imóvel Rural (IRU)",
    AST: "Assentamento da Reforma Agrária (AST)",
    PCT: "Território de Povos e Comunidades Tradicionais (PCT)",
  };
  return map[String(code || "").toUpperCase()] || code || "Imóvel Rural";
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Status booleans for ecosystem integrations (never exposes URLs, credentials, or vendor names)
app.get("/api/ecosystem/status", (_req, res) => {
  res.json({
    systems: {
      ADMINISTRA: Boolean(getServiceConfig("CENTRAL")),
      CLASSIFICA: Boolean(getServiceConfig("CLASSIFICA")),
      NOTIFICA: Boolean(getServiceConfig("NOTIFICA")),
      FISCALIZA: Boolean(getServiceConfig("FISCALIZA")),
    },
  });
});

// Public GIS CAR/MT lookup by decimal coordinates (SICAR / SEMA-MT WFS)
app.get("/api/gis/car-by-coords", async (req, res) => {
  try {
    let lat = Number(req.query.lat);
    let lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      return res.status(400).json({
        found: false,
        error: "Coordenadas inválidas. Informe latitude e longitude válidas em Mato Grosso.",
        features: [],
      });
    }

    // Mato Grosso is strictly South and West
    if (lat > 0) lat = -lat;
    if (lng > 0) lng = -lng;

    if (lat < -19 || lat > -6 || lng < -63 || lng > -49) {
      return res.status(400).json({
        found: false,
        error: "As coordenadas informadas estão fora dos limites territoriais de Mato Grosso.",
        features: [],
      });
    }

    const baseWfs = "https://geoserver.car.gov.br/geoserver/sicar/wfs";
    const props =
      "cod_imovel,status_imovel,dat_criacao,area,condicao,uf,municipio,cod_municipio_ibge,m_fiscal,tipo_imovel";

    const queryWfs = async (cqlFilter: string) => {
      const params = new URLSearchParams({
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        typeName: "sicar:sicar_imoveis_mt",
        outputFormat: "application/json",
        maxFeatures: "8",
        propertyName: props,
        CQL_FILTER: cqlFilter,
      });

      const response = await fetch(`${baseWfs}?${params.toString()}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as { features?: Array<{ id?: string; properties?: Record<string, any> }> };
    };

    let data = await queryWfs(`INTERSECTS(geo_area_imovel,POINT(${lng} ${lat}))`);

    // Small tolerance fallback (~50m) when coordinate is right on the property edge / dam crest
    if (!data?.features || data.features.length === 0) {
      const delta = 0.0005;
      data = await queryWfs(
        `BBOX(geo_area_imovel,${lng - delta},${lat - delta},${lng + delta},${lat + delta})`
      );
    }

    const features = (data?.features || [])
      .map((f) => f.properties || {})
      .filter((p) => Boolean(p.cod_imovel))
      .map((p) => ({
        codigoCar: String(p.cod_imovel),
        statusCodigo: String(p.status_imovel || ""),
        statusLabel: translateCarStatus(String(p.status_imovel || "")),
        condicao: String(p.condicao || ""),
        municipio: String(p.municipio || ""),
        uf: String(p.uf || "MT"),
        codMunicipioIbge: p.cod_municipio_ibge ? String(p.cod_municipio_ibge) : undefined,
        tipoImovelCodigo: String(p.tipo_imovel || ""),
        tipoImovelLabel: translateCarTipo(String(p.tipo_imovel || "")),
        areaHa: typeof p.area === "number" ? Number(p.area) : Number(p.area) || 0,
        modulosFiscais: typeof p.m_fiscal === "number" ? Number(p.m_fiscal) : Number(p.m_fiscal) || 0,
        dataCriacao: p.dat_criacao ? String(p.dat_criacao) : undefined,
      }));

    return res.json({
      found: features.length > 0,
      source: "Base Pública SICAR / SEMA-MT",
      coordinates: { lat, lng },
      features,
    });
  } catch (err) {
    console.warn("GIS lookup warning:", err instanceof Error ? err.message : "timeout");
    return res.status(502).json({
      found: false,
      error: "Não foi possível consultar a base pública georreferenciada no momento. Verifique sua conexão.",
      features: [],
    });
  }
});

// Central Registry Proxy (Administra Barragens)
app.get("/api/registry/bootstrap", async (_req, res) => {
  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.json({
      remoteEnabled: false,
      empreendedores: [],
      barragens: [],
      responsaveisTecnicos: [],
    });
  }

  const [empsRes, barsRes, rtsRes] = await Promise.all([
    remoteRestRequest<Record<string, any>[]>(cfg, "empreendedores", { query: "select=*&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "barragens", { query: "select=*&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "responsaveis_tecnicos", { query: "select=*&limit=1000" }),
  ]);

  return res.json({
    remoteEnabled: Boolean(empsRes.ok || barsRes.ok || rtsRes.ok),
    empreendedores: Array.isArray(empsRes.data) ? empsRes.data.map(mapRemoteEmpreendedor) : [],
    barragens: Array.isArray(barsRes.data) ? barsRes.data.map(mapRemoteBarragem) : [],
    responsaveisTecnicos: Array.isArray(rtsRes.data) ? rtsRes.data.map(mapRemoteRT) : [],
  });
});

app.get("/api/registry/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const cfg = getServiceConfig("CENTRAL");
  if (!cfg || !q) {
    return res.json({ remoteEnabled: Boolean(cfg), empreendedores: [], barragens: [] });
  }

  const clean = q.replace(/[%(),]/g, "");
  const digits = normalizeDigits(clean);
  const normText = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normCar = clean.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const empFilters = [`nome.ilike.*${clean}*`, `car_mt.ilike.*${clean}*`, `cpf_cnpj.ilike.*${clean}*`];
  if (digits.length >= 4) {
    empFilters.push(`cpf_cnpj_normalizado.ilike.*${digits}*`);
  }

  const barFilters = [
    `nome_barragem.ilike.*${clean}*`,
    `codigo_snisb.ilike.*${clean}*`,
    `municipio.ilike.*${clean}*`,
  ];

  const [empsRes, barsRes] = await Promise.all([
    remoteRestRequest<Record<string, any>[]>(cfg, "empreendedores", {
      query: `select=*&or=(${empFilters.join(",")})&limit=50`,
    }),
    remoteRestRequest<Record<string, any>[]>(cfg, "barragens", {
      query: `select=*&or=(${barFilters.join(",")})&limit=50`,
    }),
  ]);

  let empreendedores = Array.isArray(empsRes.data) ? empsRes.data.map(mapRemoteEmpreendedor) : [];
  let barragens = Array.isArray(barsRes.data) ? barsRes.data.map(mapRemoteBarragem) : [];

  if (!empsRes.ok) {
    const fallbackEmps = await remoteRestRequest<Record<string, any>[]>(cfg, "empreendedores", {
      query: "select=*&limit=2000",
    });
    if (Array.isArray(fallbackEmps.data)) {
      empreendedores = fallbackEmps.data
        .map(mapRemoteEmpreendedor)
        .filter((e) => {
          const nameNorm = e.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const munNorm = (e.municipio || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const carClean = (e.carMt || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          return (
            nameNorm.includes(normText) ||
            munNorm.includes(normText) ||
            e.cpfCnpj.toLowerCase().includes(clean.toLowerCase()) ||
            (digits.length >= 3 && e.cpfCnpjNormalizado.includes(digits)) ||
            (normCar.length >= 3 && carClean.includes(normCar))
          );
        })
        .slice(0, 50);
    }
  }

  if (!barsRes.ok) {
    const fallbackBars = await remoteRestRequest<Record<string, any>[]>(cfg, "barragens", {
      query: "select=*&limit=2000",
    });
    if (Array.isArray(fallbackBars.data)) {
      barragens = fallbackBars.data
        .map(mapRemoteBarragem)
        .filter((b) => {
          const bName = b.nomeBarragem.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const mun = b.municipio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const snisb = (b.codigoSnisb || "").toLowerCase();
          const empName = (b.empreendedorNome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          return (
            bName.includes(normText) ||
            mun.includes(normText) ||
            snisb.includes(normText) ||
            empName.includes(normText) ||
            (digits.length >= 3 && normalizeDigits(b.empreendedorCpfCnpj).includes(digits))
          );
        })
        .slice(0, 50);
    }
  }

  return res.json({
    remoteEnabled: true,
    empreendedores,
    barragens,
  });
});

app.post("/api/registry/empreendedores", async (req, res) => {
  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.json({ remoteEnabled: false, item: req.body });
  }

  const body = req.body || {};
  const payload = {
    id: body.id,
    nome: body.nome,
    tipo_pessoa: body.tipoPessoa,
    cpf_cnpj: body.cpfCnpj,
    cpf_cnpj_normalizado: normalizeDigits(body.cpfCnpjNormalizado || body.cpfCnpj),
    telefone: body.telefone,
    email: body.email,
    logradouro: body.logradouro,
    numero: body.numero,
    complemento: body.complemento,
    bairro: body.bairro,
    municipio: body.municipio,
    uf: body.uf || "MT",
    cep: body.cep,
    car_mt: body.carMt,
    source_system: body.sourceSystem || "NOTIFICA",
    registry_owner_system: "ADMINISTRA",
    created_by_analyst: body.createdByAnalyst,
    updated_at: new Date().toISOString(),
  };

  const result = await remoteRestRequest<Record<string, any>[]>(cfg, "empreendedores", {
    method: "POST",
    query: "on_conflict=id",
    body: payload,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return res.json({ remoteEnabled: true, synced: false, item: body });
  }

  return res.json({
    remoteEnabled: true,
    synced: true,
    item: mapRemoteEmpreendedor(result.data[0]),
  });
});

app.post("/api/registry/barragens", async (req, res) => {
  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.json({ remoteEnabled: false, item: req.body });
  }

  const body = req.body || {};
  const payload = {
    id: body.id,
    empreendedor_id: body.empreendedorId || null,
    empreendedor_nome: body.empreendedorNome,
    empreendedor_cpf_cnpj: body.empreendedorCpfCnpj,
    nome_barragem: body.nomeBarragem,
    codigo_snisb: body.codigoSnisb,
    processo_referencia: body.processoReferencia,
    municipio: body.municipio,
    uf: body.uf || "MT",
    curso_agua_barrado: body.cursoAguaBarrado,
    uso_preponderante: body.usoPreponderante,
    situacao_empreendimento: body.situacaoEmpreendimento,
    tipo_barragem: body.tipoBarragem,
    coordenadas_gms: body.coordenadasGMS,
    altura: body.altura,
    volume: body.volume,
    largura_coroamento: body.larguraCoroamento,
    comprimento_coroamento: body.comprimentoCoroamento,
    classificacao_barragem: body.classificacaoBarragem,
    classificacao_dpa: body.classificacaoDPA,
    classificacao_cri: body.classificacaoCRI,
    portaria_classificacao: body.portariaClassificacao,
    parecer_classificacao: body.parecerClassificacao,
    source_system: body.sourceSystem || "NOTIFICA",
    registry_owner_system: "ADMINISTRA",
    created_by_analyst: body.createdByAnalyst,
    updated_at: new Date().toISOString(),
  };

  const result = await remoteRestRequest<Record<string, any>[]>(cfg, "barragens", {
    method: "POST",
    query: "on_conflict=id",
    body: payload,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return res.json({ remoteEnabled: true, synced: false, item: body });
  }

  return res.json({
    remoteEnabled: true,
    synced: true,
    item: mapRemoteBarragem(result.data[0]),
  });
});

app.post("/api/registry/rts", async (req, res) => {
  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.json({ remoteEnabled: false, item: req.body });
  }

  const body = req.body || {};
  const payload = {
    id: body.id,
    nome: body.nome,
    registro_profissional: body.registroProfissional,
    formacao_profissional: body.formacaoProfissional,
    cpf: body.cpf,
    telefone: body.telefone,
    email: body.email,
    source_system: body.sourceSystem || "NOTIFICA",
    registry_owner_system: "ADMINISTRA",
    created_by_analyst: body.createdByAnalyst,
    updated_at: new Date().toISOString(),
  };

  const result = await remoteRestRequest<Record<string, any>[]>(cfg, "responsaveis_tecnicos", {
    method: "POST",
    query: "on_conflict=id",
    body: payload,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return res.json({ remoteEnabled: true, synced: false, item: body });
  }

  return res.json({
    remoteEnabled: true,
    synced: true,
    item: mapRemoteRT(result.data[0]),
  });
});

// Notifica CSB Document Persistence Proxy
const ALLOWED_DOC_KINDS = new Set(["pareceres", "oficios", "notificacoes"]);

app.get("/api/documents/:kind", async (req, res) => {
  const kind = req.params.kind;
  if (!ALLOWED_DOC_KINDS.has(kind)) {
    return res.status(400).json({ remoteEnabled: false, items: [] });
  }
  const cfg = getServiceConfig("NOTIFICA");
  if (!cfg) {
    return res.json({ remoteEnabled: false, items: [] });
  }
  const result = await remoteRestRequest<any[]>(cfg, kind, { query: "select=*&limit=2000" });
  return res.json({
    remoteEnabled: result.ok,
    items: Array.isArray(result.data) ? result.data : [],
  });
});

app.post("/api/documents/:kind", async (req, res) => {
  const kind = req.params.kind;
  if (!ALLOWED_DOC_KINDS.has(kind)) {
    return res.status(400).json({ remoteEnabled: false });
  }
  const cfg = getServiceConfig("NOTIFICA");
  if (!cfg) {
    return res.json({ remoteEnabled: false, synced: false });
  }
  const result = await remoteRestRequest<any[]>(cfg, kind, {
    method: "POST",
    query: "on_conflict=id",
    body: req.body,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return res.json({
    remoteEnabled: true,
    synced: result.ok,
    item: Array.isArray(result.data) && result.data[0] ? result.data[0] : req.body,
  });
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
