import express from "express";
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

type UserRole = "Administrador" | "Analista" | "Visualizador";

interface AuthenticatedUser {
  id: string;
  email: string;
  nome: string;
  perfil: UserRole;
}

type AuthenticatedRequest = express.Request & {
  authUser?: AuthenticatedUser;
};

function normalizeUserRole(raw: unknown): UserRole | null {
  const val = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (val === "administrador" || val === "admin") return "Administrador";
  if (val === "analista") return "Analista";
  if (val === "visualizador" || val === "viewer") return "Visualizador";
  return null;
}

function getNotificaAuthBaseUrl(notificaCfg: RemoteServiceConfig | null): string {
  const raw =
    process.env.NOTIFICA_SUPABASE_URL?.trim() ||
    notificaCfg?.endpoint ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    "";
  return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

function getNotificaAuthApiKey(notificaCfg: RemoteServiceConfig | null): string {
  return (
    process.env.NOTIFICA_SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    notificaCfg?.token ||
    ""
  );
}

function canViewFullDocument(req: express.Request): boolean {
  const role = (req as AuthenticatedRequest).authUser?.perfil;
  return role === "Administrador" || role === "Analista";
}

function maskCpfCnpjValue(rawValue?: string, digitsHint?: string): string | undefined {
  const digits = normalizeDigits(digitsHint || rawValue);
  if (!digits) {
    return rawValue ? "***" : undefined;
  }
  if (digits.length === 11) {
    return `***.***.***-${digits.slice(-2)}`;
  }
  if (digits.length === 14) {
    return `**.***.***/****-${digits.slice(-2)}`;
  }
  return "***";
}

function maskEmpreendedorItem<T extends ReturnType<typeof mapRemoteEmpreendedor>>(item: T): T {
  const masked = maskCpfCnpjValue(item.cpfCnpj, item.cpfCnpjNormalizado) || "***";
  return {
    ...item,
    cpfCnpj: masked,
    cpfCnpjNormalizado: "",
  };
}

function maskBarragemItem<T extends ReturnType<typeof mapRemoteBarragem>>(item: T): T {
  return {
    ...item,
    empreendedorCpfCnpj: item.empreendedorCpfCnpj ? maskCpfCnpjValue(item.empreendedorCpfCnpj) : undefined,
  };
}

function maskRtItem<T extends ReturnType<typeof mapRemoteRT>>(item: T): T {
  return {
    ...item,
    cpf: item.cpf ? maskCpfCnpjValue(item.cpf) : undefined,
  };
}

const DOCUMENT_CPF_CNPJ_FIELDS = new Set([
  "cpf_cnpj",
  "cpfCnpj",
  "documento_identificacao",
  "documentoIdentificacao",
  "empreendedor_cpf_cnpj",
  "empreendedorCpfCnpj",
  "cpf",
  "cnpj",
  "cpf_rt",
  "cpfRt",
  "cpfRT",
  "documento",
  "documento_novo",
]);

const DOCUMENT_NORMALIZED_CPF_CNPJ_FIELDS = new Set([
  "cpf_cnpj_normalizado",
  "cpfCnpjNormalizado",
]);

function maskEmbeddedCpfCnpjInText(text: string): string {
  return text
    .replace(/\b\d{3}\.\d{3}\.\d{3}-(\d{2})\b/g, "***.***.***-$1")
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-(\d{2})\b/g, "**.***.***/****-$1");
}

function maskDocumentRow<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const masked: Record<string, any> = { ...row };
  for (const [key, val] of Object.entries(masked)) {
    if (val === null || val === undefined) continue;
    if (DOCUMENT_NORMALIZED_CPF_CNPJ_FIELDS.has(key)) {
      masked[key] = "";
      continue;
    }
    const isDocField =
      DOCUMENT_CPF_CNPJ_FIELDS.has(key) ||
      (/cpf|cnpj/i.test(key) && !/tipo/i.test(key));
    if (isDocField) {
      if (typeof val === "string") {
        masked[key] = val.trim() ? maskCpfCnpjValue(val) || "***" : val;
      } else if (typeof val === "number") {
        masked[key] = maskCpfCnpjValue(String(val)) || "***";
      }
      continue;
    }
    if (typeof val === "string" && val.length >= 14) {
      masked[key] = maskEmbeddedCpfCnpjInText(val);
    }
  }
  return masked as T;
}

function getSessionIdentity(req: express.Request): AuthenticatedUser | null {
  return (req as AuthenticatedRequest).authUser || null;
}

function getAuthorDisplayName(authUser: AuthenticatedUser): string {
  return (authUser.nome || authUser.email || "").trim();
}

const CLIENT_IDENTITY_KEYS = new Set([
  "user_id",
  "userId",
  "analista",
  "created_by_analyst",
  "createdByAnalyst",
  "created_by",
  "createdBy",
  "updated_by",
  "updatedBy",
  "author",
  "autor",
]);

function stripClientIdentityFields(raw: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(raw || {})) {
    if (CLIENT_IDENTITY_KEYS.has(key)) continue;
    cleaned[key] = val;
  }
  return cleaned;
}

function getServiceConfig(prefix: "CENTRAL" | "NOTIFICA" | "CLASSIFICA" | "FISCALIZA"): RemoteServiceConfig | null {
  const candidates: Array<[string | undefined, string | undefined]> =
    prefix === "CENTRAL"
      ? [
          [process.env.CENTRAL_REGISTRY_ENDPOINT, process.env.CENTRAL_REGISTRY_TOKEN],
          [process.env.ADMINISTRA_SUPABASE_URL, process.env.ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY],
          [process.env.ADMINISTRA_SUPABASE_URL, process.env.ADMINISTRA_SUPABASE_ANON_KEY],
          [process.env.ADMINISTRA_SERVICE_ENDPOINT, process.env.ADMINISTRA_SERVICE_TOKEN],
          [process.env.ADMINISTRA_DB_URL, process.env.ADMINISTRA_DB_KEY],
        ]
      : prefix === "NOTIFICA"
        ? [
            [process.env.NOTIFICA_SERVICE_ENDPOINT, process.env.NOTIFICA_SERVICE_TOKEN],
            [process.env.NOTIFICA_SUPABASE_URL, process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY],
            [process.env.NOTIFICA_SUPABASE_URL, process.env.NOTIFICA_SUPABASE_ANON_KEY],
            [process.env.NOTIFICA_DB_URL, process.env.NOTIFICA_DB_KEY],
          ]
        : prefix === "CLASSIFICA"
          ? [
              [process.env.CLASSIFICA_SERVICE_ENDPOINT, process.env.CLASSIFICA_SERVICE_TOKEN],
              [process.env.CLASSIFICA_SUPABASE_URL, process.env.CLASSIFICA_SUPABASE_SERVICE_ROLE_KEY],
              [process.env.CLASSIFICA_SUPABASE_URL, process.env.CLASSIFICA_SUPABASE_ANON_KEY],
              [process.env.CLASSIFICA_DB_URL, process.env.CLASSIFICA_DB_KEY],
            ]
          : [
              [process.env.FISCALIZA_SERVICE_ENDPOINT, process.env.FISCALIZA_SERVICE_TOKEN],
              [process.env.FISCALIZA_SUPABASE_URL, process.env.FISCALIZA_SUPABASE_SERVICE_ROLE_KEY],
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

function normalizePlainText(val: unknown): string {
  return String(val || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function decimalToGmsParts(val: number) {
  const abs = Math.abs(val);
  const g = Math.floor(abs);
  const minFloat = (abs - g) * 60;
  const m = Math.floor(minFloat);
  const s = ((minFloat - m) * 60).toFixed(2);
  return { g: String(g), m: String(m).padStart(2, "0"), s };
}

function decimalPairToGms(latRaw: unknown, lngRaw: unknown) {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return undefined;
  }
  return {
    lat: decimalToGmsParts(lat),
    long: decimalToGmsParts(lng),
  };
}

function normalizeSystemId(val: unknown, fallback: "ADMINISTRA" | "CLASSIFICA" | "NOTIFICA" | "FISCALIZA"): "ADMINISTRA" | "CLASSIFICA" | "NOTIFICA" | "FISCALIZA" {
  const upper = String(val || "").toUpperCase().trim();
  if (upper.includes("CLASSIFICA")) return "CLASSIFICA";
  if (upper.includes("FISCALIZA")) return "FISCALIZA";
  if (upper.includes("NOTIFICA")) return "NOTIFICA";
  if (upper.includes("ADMINISTRA")) return "ADMINISTRA";
  return fallback;
}

function optionalText(val: unknown): string | undefined {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    return String(val);
  }
  return undefined;
}

function mapRemoteEmpreendedor(row: Record<string, any>, fallbackSystem: "ADMINISTRA" | "CLASSIFICA" | "NOTIFICA" | "FISCALIZA" = "ADMINISTRA") {
  const rawDoc = String(row.cpf_cnpj ?? row.cpfCnpj ?? row.documento ?? row.documento_identificacao ?? row.cpf ?? row.cnpj ?? "");
  const norm = normalizeDigits(row.cpf_cnpj_normalizado ?? row.cpfCnpjNormalizado ?? rawDoc);
  const nome = String(
    row.nome ??
      row.empreendedor_nome ??
      row.razao_social ??
      row.empreendedor ??
      row.identificacao_empreendedor ??
      row.interessado ??
      ""
  ).trim();
  const sourceSystem = normalizeSystemId(row.source_system ?? row.sourceSystem, fallbackSystem);
  const carsMt = Array.isArray(row.cars_mt)
    ? row.cars_mt.filter(Boolean).join(", ")
    : optionalText(row.cars_mt);
  const rawTipo = String(row.tipo_pessoa ?? row.tipoPessoa ?? "").toUpperCase();
  const tipoPessoa: "CPF" | "CNPJ" =
    rawTipo.includes("CNPJ") || rawTipo.includes("JURID") || rawTipo.includes("JURÍD")
      ? "CNPJ"
      : rawTipo.includes("CPF") || rawTipo.includes("FISIC") || rawTipo.includes("FÍSIC")
        ? "CPF"
        : norm.length === 14
          ? "CNPJ"
          : "CPF";
  return {
    id: String(row.id ?? row.empreendedor_id ?? `${sourceSystem.toLowerCase()}_emp_${norm || normalizePlainText(nome).replace(/\s+/g, "_") || Math.random().toString(36).slice(2, 8)}`),
    nome,
    tipoPessoa,
    cpfCnpj: norm ? formatCpfCnpj(norm) : rawDoc,
    cpfCnpjNormalizado: norm,
    telefone: optionalText(row.telefone),
    email: optionalText(row.email),
    logradouro: optionalText(row.logradouro ?? row.endereco),
    numero: optionalText(row.numero),
    complemento: optionalText(row.complemento),
    bairro: optionalText(row.bairro),
    municipio: optionalText(row.municipio ?? row.empreendedor_municipio ?? row.municipio_empreendimento ?? row.cidade),
    uf: optionalText(row.uf ?? row.empreendedor_uf ?? row.uf_correspondencia) ?? "MT",
    cep: optionalText(row.cep ?? row.cep_correspondencia),
    carMt: optionalText(row.car_mt ?? row.carMt ?? row.num_car_mt ?? row.codigo_car ?? row.car ?? row.codigoCar) ?? carsMt,
    sourceSystem,
    registryOwnerSystem: "ADMINISTRA" as const,
    createdByAnalyst: optionalText(row.created_by_analyst ?? row.createdByAnalyst ?? row.analista),
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

function mapRemoteBarragem(row: Record<string, any>, fallbackSystem: "ADMINISTRA" | "CLASSIFICA" | "NOTIFICA" | "FISCALIZA" = "ADMINISTRA") {
  const nomeBarragem = String(
    row.nome_barragem ??
      row.nomeBarragem ??
      row.nome ??
      row.barragem ??
      row.empreendimento ??
      row.nome_fantasia ??
      row.localizacao_empreendimento ??
      ""
  ).trim();
  const snisb = optionalText(row.codigo_snisb ?? row.codigoSnisb ?? row.snisb);
  const sourceSystem = normalizeSystemId(row.source_system ?? row.sourceSystem, fallbackSystem);
  const municipio = String(row.municipio ?? row.municipio_empreendimento ?? "");
  return {
    id: String(row.id ?? `${sourceSystem.toLowerCase()}_bar_${normalizePlainText(snisb || nomeBarragem).replace(/\s+/g, "_") || Math.random().toString(36).slice(2, 8)}`),
    empreendedorId: String(row.empreendedor_id ?? row.empreendedorId ?? ""),
    empreendedorNome: optionalText(row.empreendedor_nome ?? row.empreendedorNome ?? row.empreendedor ?? row.identificacao_empreendedor ?? row.interessado),
    empreendedorCpfCnpj: optionalText(row.empreendedor_cpf_cnpj ?? row.empreendedorCpfCnpj ?? row.cpf_cnpj ?? row.documento_identificacao),
    nomeBarragem,
    codigoSnisb: snisb,
    processoReferencia: optionalText(row.processo_referencia ?? row.processoReferencia ?? row.processo ?? row.num_processo),
    municipio,
    uf: optionalText(row.uf) ?? "MT",
    cursoAguaBarrado: optionalText(row.curso_agua_barrado ?? row.cursoAguaBarrado ?? row.curso_agua ?? row.nome_curso_agua_barrado),
    usoPreponderante: optionalText(row.uso_preponderante ?? row.usoPreponderante),
    situacaoEmpreendimento: optionalText(row.situacao_empreendimento ?? row.situacaoEmpreendimento ?? row.situacao),
    tipoBarragem: optionalText(row.tipo_barragem ?? row.tipoBarragem),
    coordenadasGMS: row.coordenadas_gms ?? row.coordenadasGMS ?? decimalPairToGms(row.latitude, row.longitude),
    altura: optionalText(row.altura ?? row.altura_barragem),
    volume: optionalText(row.volume ?? row.volume_barragem),
    larguraCoroamento: optionalText(row.largura_coroamento ?? row.larguraCoroamento),
    comprimentoCoroamento: optionalText(row.comprimento_coroamento ?? row.comprimentoCoroamento),
    classificacaoBarragem: optionalText(row.classificacao_barragem ?? row.classificacaoBarragem ?? row.classificacao),
    classificacaoDPA: optionalText(row.classificacao_dpa ?? row.classificacaoDPA ?? row.dano_potencial ?? row.dpa),
    classificacaoCRI: optionalText(row.classificacao_cri ?? row.classificacaoCRI ?? row.categoria_risco ?? row.cri),
    portariaClassificacao: optionalText(row.portaria_classificacao ?? row.portariaClassificacao),
    parecerClassificacao: optionalText(row.parecer_classificacao ?? row.parecerClassificacao),
    sourceSystem,
    registryOwnerSystem: "ADMINISTRA" as const,
    createdByAnalyst: optionalText(row.created_by_analyst ?? row.createdByAnalyst ?? row.analista),
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

function mapRemoteRT(row: Record<string, any>, fallbackSystem: "ADMINISTRA" | "CLASSIFICA" | "NOTIFICA" | "FISCALIZA" = "ADMINISTRA") {
  const nome = String(row.nome ?? row.responsavel_tecnico ?? row.rt_nome ?? row.nome_rt ?? "").trim();
  const sourceSystem = normalizeSystemId(row.source_system ?? row.sourceSystem, fallbackSystem);
  const conselhoReg = [row.conselho, row.registro, row.uf_conselho].filter(Boolean).join(" ").trim();
  const artInfo = optionalText(row.art_rrt ?? row.art);
  const reg =
    optionalText(row.registro_profissional ?? row.registroProfissional ?? row.registro_profissional_rt) ??
    (conselhoReg || undefined) ??
    optionalText(row.crea ?? row.art_crea_mt) ??
    undefined;
  const especialidades = Array.isArray(row.especialidades)
    ? row.especialidades.filter(Boolean).join(", ")
    : optionalText(row.especialidades);
  return {
    id: String(row.id ?? row.rt_id ?? `${sourceSystem.toLowerCase()}_rt_${normalizePlainText(nome || reg || artInfo).replace(/\s+/g, "_") || Math.random().toString(36).slice(2, 8)}`),
    nome,
    registroProfissional: reg,
    art: artInfo,
    artsVinculadas: [] as Array<{
      id?: string;
      art: string;
      barragemId?: string;
      barragemNome?: string;
      empreendedorId?: string;
      empreendedorNome?: string;
      processo?: string;
      situacao?: string;
      createdAt?: string;
    }>,
    formacaoProfissional: optionalText(row.formacao_profissional ?? row.formacaoProfissional ?? row.formacao_profissional_rt) ?? especialidades,
    cpf: optionalText(row.cpf ?? row.cpf_rt),
    telefone: optionalText(row.telefone ?? row.telefone_rt),
    email: optionalText(row.email ?? row.email_rt),
    sourceSystem,
    registryOwnerSystem: "ADMINISTRA" as const,
    createdByAnalyst: optionalText(row.created_by_analyst ?? row.createdByAnalyst ?? row.analista),
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

function attachArtsToRts(
  rts: ReturnType<typeof mapRemoteRT>[],
  artRows: Record<string, any>[],
  barragens: ReturnType<typeof mapRemoteBarragem>[]
) {
  if (!Array.isArray(artRows) || artRows.length === 0) return rts;
  const barById = new Map(barragens.map((b) => [b.id, b]));
  const rtById = new Map(rts.map((r) => [r.id, r]));
  const rtByName = new Map(rts.map((r) => [normalizePlainText(r.nome), r]));

  for (const row of artRows) {
    const artVal = optionalText(row.art_rrt ?? row.art);
    if (!artVal) continue;
    const rtId = optionalText(row.rt_id);
    const rtNameNorm = normalizePlainText(row.nome);
    const targetRt = (rtId ? rtById.get(rtId) : undefined) || (rtNameNorm ? rtByName.get(rtNameNorm) : undefined);
    if (!targetRt) continue;

    const barId = optionalText(row.barragem_id);
    const linkedBar = barId ? barById.get(barId) : undefined;
    const existingList = targetRt.artsVinculadas || [];
    const alreadyHas = existingList.some(
      (a) => a.art === artVal && (a.barragemId || "") === (barId || "")
    );
    if (!alreadyHas) {
      existingList.push({
        id: optionalText(row.id),
        art: artVal,
        barragemId: barId,
        barragemNome: linkedBar?.nomeBarragem || optionalText(row.observacoes),
        empreendedorId: linkedBar?.empreendedorId || undefined,
        empreendedorNome: linkedBar?.empreendedorNome || undefined,
        processo: optionalText(row.processo),
        situacao: optionalText(row.situacao),
        createdAt: optionalText(row.created_at),
      });
      targetRt.artsVinculadas = existingList;
    }
    if (!targetRt.art) {
      targetRt.art = artVal;
    }
  }
  return rts;
}

type EcosystemSystemName = "ADMINISTRA" | "CLASSIFICA" | "NOTIFICA" | "FISCALIZA";

const SYSTEM_TABLE_CANDIDATES: Record<
  EcosystemSystemName,
  {
    empreendedores: string[];
    barragens: string[];
    rts: string[];
    products: Array<{ table: string; defaultDocType: string }>;
  }
> = {
  ADMINISTRA: {
    empreendedores: ["empreendedores"],
    barragens: ["vw_barragens_integradas", "barragens"],
    rts: ["rts", "responsaveis_tecnicos", "responsaveis_tecnicos_barragens"],
    products: [
      { table: "documentos_catalogo", defaultDocType: "Documento no Catálogo CSB" },
      { table: "fiscaliza_notificacoes_importadas", defaultDocType: "Notificação (Fiscaliza)" },
      { table: "historico_transferencias_titularidade", defaultDocType: "Transferência de Titularidade" },
    ],
  },
  CLASSIFICA: {
    empreendedores: ["empreendedores"],
    barragens: ["vw_barragens_integradas", "barragens", "barragens_classificacao"],
    rts: ["rts", "responsaveis_tecnicos"],
    products: [
      { table: "classificacoes", defaultDocType: "Classificação de Barragem" },
      { table: "pareceres_classificacao", defaultDocType: "Parecer de Classificação" },
      { table: "pareceres", defaultDocType: "Parecer (Classifica)" },
      { table: "portarias", defaultDocType: "Portaria de Classificação" },
    ],
  },
  FISCALIZA: {
    empreendedores: ["empreendedores"],
    barragens: ["barragens"],
    rts: ["rts", "responsaveis_tecnicos"],
    products: [
      { table: "fiscalizacoes", defaultDocType: "Relatório de Fiscalização" },
      { table: "vistorias", defaultDocType: "Vistoria Técnica" },
      { table: "relatorios_fiscalizacao", defaultDocType: "Relatório de Fiscalização" },
      { table: "autos_infracao", defaultDocType: "Auto de Infração" },
      { table: "notificacoes", defaultDocType: "Notificação (Fiscaliza)" },
      { table: "pareceres", defaultDocType: "Parecer (Fiscaliza)" },
    ],
  },
  NOTIFICA: {
    empreendedores: [],
    barragens: [],
    rts: [],
    products: [
      { table: "pareceres", defaultDocType: "Parecer Técnico" },
      { table: "oficios", defaultDocType: "Ofício de Pendências" },
      { table: "notificacoes", defaultDocType: "Notificação" },
    ],
  },
};

function extractDerivedEntitiesFromProductRow(
  row: Record<string, any>,
  systemId: EcosystemSystemName,
  defaultDocType: string
) {
  const effectiveSystemId = normalizeSystemId(row.origem_sistema ?? row.source_system, systemId);
  const empName = String(
    row.empreendedor_nome ??
      row.empreendedor ??
      row.identificacao_empreendedor ??
      row.interessado ??
      row.razao_social ??
      row.nome_empreendedor ??
      row.titular_novo ??
      ""
  ).trim();
  const rawCpfCnpj = String(
    row.cpf_cnpj ??
      row.empreendedor_cpf_cnpj ??
      row.documento_identificacao ??
      row.documento_novo ??
      row.documento ??
      row.cpf ??
      row.cnpj ??
      ""
  ).trim();
  const normDoc = normalizeDigits(rawCpfCnpj);

  const empreendedor =
    empName || normDoc
      ? mapRemoteEmpreendedor(
          {
            ...row,
            id: row.empreendedor_id || `${effectiveSystemId.toLowerCase()}_emp_${normDoc || normalizePlainText(empName).replace(/\s+/g, "_")}`,
            nome: empName || `Empreendedor (${formatCpfCnpj(normDoc)})`,
            cpf_cnpj: rawCpfCnpj,
            source_system: effectiveSystemId,
          },
          effectiveSystemId
        )
      : null;

  const barName = String(
    row.nome_barragem ??
      row.barragem_nome ??
      row.barragem ??
      row.empreendimento ??
      row.nome_fantasia ??
      row.localizacao_empreendimento ??
      ""
  ).trim();
  const snisb = String(row.codigo_snisb ?? row.snisb ?? "").trim();

  const barragem =
    barName || snisb
      ? mapRemoteBarragem(
          {
            ...row,
            id: row.barragem_id || `${effectiveSystemId.toLowerCase()}_bar_${normalizePlainText(snisb || barName).replace(/\s+/g, "_")}`,
            nome_barragem: barName || `Barragem SNISB ${snisb}`,
            empreendedor_nome: empName || undefined,
            empreendedor_cpf_cnpj: rawCpfCnpj || undefined,
            source_system: effectiveSystemId,
          },
          effectiveSystemId
        )
      : null;

  const rawRts: Array<{ nome: string; reg?: string; form?: string; cpf?: string }> = [];
  const rtCandidates =
    row.responsavel_tecnico_nome ??
    row.responsaveis_tecnicos ??
    row.rt_nome ??
    row.responsavel_tecnico ??
    row.nome_rt ??
    "";
  if (typeof rtCandidates === "string" && rtCandidates.trim()) {
    rtCandidates
      .split(/[|;,]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .forEach((nome) =>
        rawRts.push({
          nome,
          reg: row.registro_profissional_rt ?? row.registro_profissional ?? row.art_numero ?? row.crea ?? row.art_crea_mt ?? row.art,
          form: row.formacao_profissional_rt ?? row.formacao_profissional,
          cpf: row.cpf_rt,
        })
      );
  }

  const rts = rawRts.map((r) =>
    mapRemoteRT(
      {
        id: row.responsavel_tecnico_id || `${effectiveSystemId.toLowerCase()}_rt_${normalizePlainText(r.nome).replace(/\s+/g, "_")}`,
        nome: r.nome,
        registro_profissional: r.reg,
        formacao_profissional: r.form,
        cpf: r.cpf,
        source_system: effectiveSystemId,
      },
      effectiveSystemId
    )
  );

  const analistasRaw = Array.isArray(row.analistas_elaboradores)
    ? row.analistas_elaboradores.filter(Boolean).join(", ")
    : row.analistas_elaboradores;

  const product = {
    id: String(row.id ?? `${effectiveSystemId}_${row.processo || row.num_processo || Math.random().toString(36).slice(2, 8)}`),
    systemId: effectiveSystemId,
    tipoDocumento: String(row.tipo_nome ?? row.tipo_documento ?? row.titulo ?? row.tipo ?? defaultDocType),
    numeroDocumento:
      row.numero ??
      row.numero_documento ??
      row.oficio_gerado ??
      row.notificacao_gerada ??
      row.num_parecer_tecnico ??
      row.protocolo ??
      row.portaria_nova ??
      row.portaria_classificacao ??
      undefined,
    processo: row.processo ?? row.num_processo ?? row.protocolo ?? undefined,
    status: row.status ?? row.situacao ?? row.status_origem ?? row.situacao_cumprimento ?? undefined,
    dataEmissao: row.data_emissao ?? row.data_parecer ?? row.data_notificacao ?? row.data ?? row.data_protocolo ?? row.created_at ?? row.criado_em ?? undefined,
    empreendedorId: row.empreendedor_id ?? empreendedor?.id,
    empreendedorNome: empName || undefined,
    empreendedorCpfCnpj: rawCpfCnpj || undefined,
    barragemId: row.barragem_id ?? barragem?.id,
    barragemNome: barName || undefined,
    codigoSnisb: snisb || undefined,
    municipio: row.municipio ?? row.municipio_empreendimento ?? undefined,
    analista: row.analista ?? analistasRaw ?? row.analistas ?? undefined,
    readonly: effectiveSystemId !== "NOTIFICA",
  };

  return { empreendedor, barragem, rts, product };
}

function isSyntheticGeneratedId(id: string): boolean {
  return /^(administra|classifica|fiscaliza|notifica)_(emp|bar|rt)_/i.test(id);
}

function dedupeEmpreendedores(items: ReturnType<typeof mapRemoteEmpreendedor>[]) {
  const map = new Map<string, ReturnType<typeof mapRemoteEmpreendedor>>();
  for (const item of items) {
    if (!item.nome && !item.cpfCnpjNormalizado) continue;
    const key =
      item.id && !isSyntheticGeneratedId(item.id)
        ? `${item.sourceSystem}::id::${item.id}`
        : `${item.sourceSystem}::${item.cpfCnpjNormalizado || normalizePlainText(item.nome)}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function dedupeBarragens(items: ReturnType<typeof mapRemoteBarragem>[]) {
  const map = new Map<string, ReturnType<typeof mapRemoteBarragem>>();
  for (const item of items) {
    if (!item.nomeBarragem && !item.codigoSnisb) continue;
    const key =
      item.id && !isSyntheticGeneratedId(item.id)
        ? `${item.sourceSystem}::id::${item.id}`
        : `${item.sourceSystem}::${normalizePlainText(item.codigoSnisb || `${item.nomeBarragem}_${item.municipio}`)}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function dedupeRTs(items: ReturnType<typeof mapRemoteRT>[]) {
  const map = new Map<string, ReturnType<typeof mapRemoteRT>>();
  for (const item of items) {
    if (!item.nome) continue;
    const key =
      item.id && !isSyntheticGeneratedId(item.id)
        ? `${item.sourceSystem}::id::${item.id}`
        : `${item.sourceSystem}::${normalizeDigits(item.cpf) || normalizePlainText(item.registroProfissional || item.nome)}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
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

// Health check (público)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const cleanPath = (req.originalUrl || req.url || "").split("?")[0].replace(/\/+$/, "");
  if (cleanPath === "/api/health" || req.path === "/health") {
    return next();
  }

  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autenticação ausente." });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: "Token de autenticação inválido." });
  }

  const notificaCfg = getServiceConfig("NOTIFICA");
  const authBaseUrl = getNotificaAuthBaseUrl(notificaCfg);
  const authApiKey = getNotificaAuthApiKey(notificaCfg);

  if (!authBaseUrl || !authApiKey || !notificaCfg) {
    return res.status(403).json({ error: "Serviço de autenticação do Notifica não configurado." });
  }

  let email = "";
  let authUserId = "";
  try {
    const authRes = await fetch(`${authBaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: authApiKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!authRes.ok) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }
    const authUser = (await authRes.json()) as { id?: string; email?: string };
    email = String(authUser?.email || "").trim().toLowerCase();
    authUserId = String(authUser?.id || "");
    if (!email) {
      return res.status(401).json({ error: "Usuário autenticado sem e-mail válido." });
    }
  } catch {
    return res.status(401).json({ error: "Falha ao validar sessão de autenticação." });
  }

  const cleanEmailPattern = email.replace(/[%*]/g, "");
  const perfilRes = await remoteRestRequest<Array<{
    id?: string;
    email?: string;
    nome?: string;
    perfil?: string;
    status?: string;
  }>>(notificaCfg, "perfis_usuarios", {
    query: `select=id,email,nome,perfil,status&email=ilike.${encodeURIComponent(cleanEmailPattern)}&limit=10`,
  });

  if (!perfilRes.ok || !Array.isArray(perfilRes.data)) {
    return res.status(403).json({ error: "Não foi possível verificar o perfil de acesso do usuário." });
  }

  const matched = perfilRes.data.find(
    (row) => String(row?.email || "").trim().toLowerCase() === email
  );
  if (!matched) {
    return res.status(403).json({ error: "Usuário não autorizado neste sistema." });
  }

  const normalizedStatus = String(matched.status || "").trim().toLowerCase();
  if (normalizedStatus !== "ativo") {
    return res.status(403).json({ error: "Perfil de usuário inativo ou bloqueado." });
  }

  const perfil = normalizeUserRole(matched.perfil);
  if (!perfil) {
    return res.status(403).json({ error: "Perfil de acesso inválido." });
  }

  (req as AuthenticatedRequest).authUser = {
    id: authUserId || String(matched.id || ""),
    email,
    nome: String(matched.nome || email).trim(),
    perfil,
  };

  return next();
}

function requireRole(allowedRoles: UserRole[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authUser = (req as AuthenticatedRequest).authUser;
    if (!authUser || !allowedRoles.includes(authUser.perfil)) {
      return res.status(403).json({ error: "Permissão insuficiente para executar esta ação." });
    }
    return next();
  };
}

app.use("/api", requireAuth);

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

// Live federated reader across integrated systems (Classifica, Fiscaliza, Administra, Notifica)
app.get("/api/ecosystem/integrated-data", async (req, res) => {
  const requestedSystem = String(req.query.system || "").toUpperCase() as EcosystemSystemName | "";
  const targetSystems: EcosystemSystemName[] =
    requestedSystem && ["ADMINISTRA", "CLASSIFICA", "FISCALIZA", "NOTIFICA"].includes(requestedSystem)
      ? [requestedSystem as EcosystemSystemName]
      : ["CLASSIFICA", "FISCALIZA", "ADMINISTRA", "NOTIFICA"];

  const allEmps: ReturnType<typeof mapRemoteEmpreendedor>[] = [];
  const allBars: ReturnType<typeof mapRemoteBarragem>[] = [];
  const allRts: ReturnType<typeof mapRemoteRT>[] = [];
  const allProducts: ReturnType<typeof extractDerivedEntitiesFromProductRow>["product"][] = [];

  const diagnostics: Record<
    EcosystemSystemName,
    {
      systemId: EcosystemSystemName;
      remoteConfigured: boolean;
      reachable: boolean;
      authDenied: boolean;
      empreendedoresCount: number;
      barragensCount: number;
      rtsCount: number;
      productsCount: number;
    }
  > = {
    ADMINISTRA: {
      systemId: "ADMINISTRA",
      remoteConfigured: Boolean(getServiceConfig("CENTRAL")),
      reachable: false,
      authDenied: false,
      empreendedoresCount: 0,
      barragensCount: 0,
      rtsCount: 0,
      productsCount: 0,
    },
    CLASSIFICA: {
      systemId: "CLASSIFICA",
      remoteConfigured: Boolean(getServiceConfig("CLASSIFICA")),
      reachable: false,
      authDenied: false,
      empreendedoresCount: 0,
      barragensCount: 0,
      rtsCount: 0,
      productsCount: 0,
    },
    FISCALIZA: {
      systemId: "FISCALIZA",
      remoteConfigured: Boolean(getServiceConfig("FISCALIZA")),
      reachable: false,
      authDenied: false,
      empreendedoresCount: 0,
      barragensCount: 0,
      rtsCount: 0,
      productsCount: 0,
    },
    NOTIFICA: {
      systemId: "NOTIFICA",
      remoteConfigured: Boolean(getServiceConfig("NOTIFICA")),
      reachable: false,
      authDenied: false,
      empreendedoresCount: 0,
      barragensCount: 0,
      rtsCount: 0,
      productsCount: 0,
    },
  };

  await Promise.all(
    targetSystems.map(async (sysId) => {
      const cfg = getServiceConfig(sysId === "ADMINISTRA" ? "CENTRAL" : sysId);
      if (!cfg) return;

      const tables = SYSTEM_TABLE_CANDIDATES[sysId];
      const sysEmps: ReturnType<typeof mapRemoteEmpreendedor>[] = [];
      const sysBars: ReturnType<typeof mapRemoteBarragem>[] = [];
      const sysRts: ReturnType<typeof mapRemoteRT>[] = [];
      const sysProducts: ReturnType<typeof extractDerivedEntitiesFromProductRow>["product"][] = [];
      let anyOk = false;
      let anyAuthDenied = false;

      const empRequests = (async () => {
        const carsByEmpId = new Map<string, string>();
        if (sysId === "ADMINISTRA") {
          const viewRes = await remoteRestRequest<Record<string, any>[]>(cfg, "vw_empreendedores_barragens_rts", {
            query: "select=empreendedor_id,cars_mt&limit=2000",
          });
          if (viewRes.ok && Array.isArray(viewRes.data)) {
            viewRes.data.forEach((v) => {
              const id = String(v.empreendedor_id || "");
              const cars = Array.isArray(v.cars_mt) ? v.cars_mt.filter(Boolean).join(", ") : String(v.cars_mt || "");
              if (id && cars) carsByEmpId.set(id, cars);
            });
          }
        }
        await Promise.all(
          tables.empreendedores.map(async (table) => {
            const r = await remoteRestRequest<Record<string, any>[]>(cfg, table, { query: "select=*&limit=2000" });
            if (r.status === 401 || r.status === 403) anyAuthDenied = true;
            if (r.ok && Array.isArray(r.data)) {
              anyOk = true;
              r.data.forEach((row) => {
                const mapped = mapRemoteEmpreendedor(row, sysId);
                if (!mapped.carMt && carsByEmpId.has(mapped.id)) {
                  mapped.carMt = carsByEmpId.get(mapped.id);
                }
                sysEmps.push(mapped);
              });
            }
          })
        );
      })();

      const barRequests = (async () => {
        for (const table of tables.barragens) {
          const r = await remoteRestRequest<Record<string, any>[]>(cfg, table, { query: "select=*&limit=2000" });
          if (r.status === 401 || r.status === 403) anyAuthDenied = true;
          if (r.ok && Array.isArray(r.data)) {
            anyOk = true;
            r.data.forEach((row) => sysBars.push(mapRemoteBarragem(row, sysId)));
            if (r.data.length > 0 && sysId === "ADMINISTRA") break;
          }
        }
      })();

      const rtRequests = (async () => {
        for (const table of tables.rts) {
          const r = await remoteRestRequest<Record<string, any>[]>(cfg, table, { query: "select=*&limit=1000" });
          if (r.status === 401 || r.status === 403) anyAuthDenied = true;
          if (r.ok && Array.isArray(r.data)) {
            anyOk = true;
            r.data.forEach((row) => sysRts.push(mapRemoteRT(row, sysId)));
            if (r.data.length > 0 && sysId === "ADMINISTRA") break;
          }
        }
      })();

      const prodRequests = tables.products.map(async ({ table, defaultDocType }) => {
        const r = await remoteRestRequest<Record<string, any>[]>(cfg, table, { query: "select=*&limit=2000" });
        if (r.status === 401 || r.status === 403) anyAuthDenied = true;
        if (r.ok && Array.isArray(r.data)) {
          anyOk = true;
          r.data.forEach((row) => {
            const derived = extractDerivedEntitiesFromProductRow(row, sysId, defaultDocType);
            sysProducts.push(derived.product);
            if (sysId !== "ADMINISTRA") {
              if (derived.empreendedor) sysEmps.push(derived.empreendedor);
              if (derived.barragem) sysBars.push(derived.barragem);
              if (derived.rts.length > 0) sysRts.push(...derived.rts);
            }
          });
        }
      });

      await Promise.all([empRequests, barRequests, rtRequests, ...prodRequests]);

      const uniqueEmps = dedupeEmpreendedores(sysEmps);
      const uniqueBars = dedupeBarragens(sysBars);
      const uniqueRts = dedupeRTs(sysRts);

      diagnostics[sysId] = {
        systemId: sysId,
        remoteConfigured: true,
        reachable: anyOk,
        authDenied: !anyOk && anyAuthDenied,
        empreendedoresCount: uniqueEmps.length,
        barragensCount: uniqueBars.length,
        rtsCount: uniqueRts.length,
        productsCount: sysProducts.length,
      };

      allEmps.push(...uniqueEmps);
      allBars.push(...uniqueBars);
      allRts.push(...uniqueRts);
      allProducts.push(...sysProducts);
    })
  );

  const includeFullDoc = canViewFullDocument(req);

  return res.json({
    empreendedores: includeFullDoc ? allEmps : allEmps.map(maskEmpreendedorItem),
    barragens: includeFullDoc ? allBars : allBars.map(maskBarragemItem),
    responsaveisTecnicos: includeFullDoc ? allRts : allRts.map(maskRtItem),
    products: includeFullDoc
      ? allProducts
      : allProducts.map((p) => ({
          ...p,
          empreendedorCpfCnpj: p.empreendedorCpfCnpj ? maskCpfCnpjValue(p.empreendedorCpfCnpj) : undefined,
        })),
    diagnostics,
    fetchedAt: new Date().toISOString(),
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
app.get("/api/registry/bootstrap", async (req, res) => {
  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.json({
      remoteEnabled: false,
      empreendedores: [],
      barragens: [],
      responsaveisTecnicos: [],
    });
  }

  const [empsRes, empsViewRes, barsViewRes, barsRes, rtsPrimaryRes, rtsFallbackRes, rtArtsRes] = await Promise.all([
    remoteRestRequest<Record<string, any>[]>(cfg, "empreendedores", { query: "select=*&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "vw_empreendedores_barragens_rts", { query: "select=empreendedor_id,cars_mt&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "vw_barragens_integradas", { query: "select=*&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "barragens", { query: "select=*&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "rts", { query: "select=*&limit=1000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "responsaveis_tecnicos", { query: "select=*&limit=1000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "responsaveis_tecnicos_barragens", { query: "select=id,rt_id,barragem_id,nome,art,art_rrt,conselho,processo,situacao,observacoes,created_at&limit=2000" }),
  ]);

  const carsByEmpId = new Map<string, string>();
  if (Array.isArray(empsViewRes.data)) {
    empsViewRes.data.forEach((v) => {
      const id = String(v.empreendedor_id || "");
      const cars = Array.isArray(v.cars_mt) ? v.cars_mt.filter(Boolean).join(", ") : String(v.cars_mt || "");
      if (id && cars) carsByEmpId.set(id, cars);
    });
  }

  const empreendedores = Array.isArray(empsRes.data)
    ? empsRes.data.map((row) => {
        const mapped = mapRemoteEmpreendedor(row, "ADMINISTRA");
        if (!mapped.carMt && carsByEmpId.has(mapped.id)) {
          mapped.carMt = carsByEmpId.get(mapped.id);
        }
        return mapped;
      })
    : [];

  const barSource =
    barsViewRes.ok && Array.isArray(barsViewRes.data) && barsViewRes.data.length > 0
      ? barsViewRes.data
      : Array.isArray(barsRes.data)
        ? barsRes.data
        : [];
  const barragens = barSource.map((row) => mapRemoteBarragem(row, "ADMINISTRA"));

  const rtSource =
    rtsPrimaryRes.ok && Array.isArray(rtsPrimaryRes.data) && rtsPrimaryRes.data.length > 0
      ? rtsPrimaryRes.data
      : Array.isArray(rtsFallbackRes.data)
        ? rtsFallbackRes.data
        : [];
  const responsaveisTecnicos = attachArtsToRts(
    rtSource.map((row) => mapRemoteRT(row, "ADMINISTRA")),
    Array.isArray(rtArtsRes.data) ? rtArtsRes.data : [],
    barragens
  );

  const includeFullDoc = canViewFullDocument(req);

  return res.json({
    remoteEnabled: Boolean(empsRes.ok || barsViewRes.ok || barsRes.ok || rtsPrimaryRes.ok || rtsFallbackRes.ok),
    empreendedores: includeFullDoc ? empreendedores : empreendedores.map(maskEmpreendedorItem),
    barragens: includeFullDoc ? barragens : barragens.map(maskBarragemItem),
    responsaveisTecnicos: includeFullDoc ? responsaveisTecnicos : responsaveisTecnicos.map(maskRtItem),
  });
});

app.get("/api/registry/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const empreendedorId = String(req.query.empreendedorId || "").trim();
  const cfg = getServiceConfig("CENTRAL");
  if (!cfg || (!q && !empreendedorId)) {
    return res.json({
      remoteEnabled: Boolean(cfg),
      empreendedores: [],
      barragens: [],
      responsaveisTecnicos: [],
    });
  }

  const clean = q.replace(/[%(),]/g, "");
  const digits = normalizeDigits(clean);
  const normText = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normCar = clean.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const [empsRes, empsViewRes, barsViewRes, rtsRes, rtArtsRes] = await Promise.all([
    remoteRestRequest<Record<string, any>[]>(cfg, "empreendedores", { query: "select=*&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "vw_empreendedores_barragens_rts", { query: "select=empreendedor_id,cars_mt&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "vw_barragens_integradas", { query: "select=*&limit=2000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "rts", { query: "select=*&limit=1000" }),
    remoteRestRequest<Record<string, any>[]>(cfg, "responsaveis_tecnicos_barragens", { query: "select=id,rt_id,barragem_id,nome,art,art_rrt,conselho,processo,situacao,observacoes,created_at&limit=2000" }),
  ]);

  const carsByEmpId = new Map<string, string>();
  if (Array.isArray(empsViewRes.data)) {
    empsViewRes.data.forEach((v) => {
      const id = String(v.empreendedor_id || "");
      const cars = Array.isArray(v.cars_mt) ? v.cars_mt.filter(Boolean).join(", ") : String(v.cars_mt || "");
      if (id && cars) carsByEmpId.set(id, cars);
    });
  }

  const empreendedores = Array.isArray(empsRes.data)
    ? empsRes.data
        .map((row) => {
          const mapped = mapRemoteEmpreendedor(row, "ADMINISTRA");
          if (!mapped.carMt && carsByEmpId.has(mapped.id)) mapped.carMt = carsByEmpId.get(mapped.id);
          return mapped;
        })
        .filter((e) => {
          if (!clean) return false;
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
        .slice(0, 50)
    : [];

  let barRows = Array.isArray(barsViewRes.data) ? barsViewRes.data : [];
  if (barRows.length === 0) {
    const fallbackBars = await remoteRestRequest<Record<string, any>[]>(cfg, "barragens", { query: "select=*&limit=2000" });
    barRows = Array.isArray(fallbackBars.data) ? fallbackBars.data : [];
  }

  const barragens = barRows
    .map((row) => mapRemoteBarragem(row, "ADMINISTRA"))
    .filter((b) => {
      if (empreendedorId && b.empreendedorId !== empreendedorId) return false;
      if (!clean) return true;
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
    .slice(0, 100);

  let rtRows = Array.isArray(rtsRes.data) ? rtsRes.data : [];
  if (rtRows.length === 0) {
    const fallbackRts = await remoteRestRequest<Record<string, any>[]>(cfg, "responsaveis_tecnicos", { query: "select=*&limit=1000" });
    rtRows = Array.isArray(fallbackRts.data) ? fallbackRts.data : [];
  }

  const responsaveisTecnicos = clean
    ? attachArtsToRts(
        rtRows.map((row) => mapRemoteRT(row, "ADMINISTRA")),
        Array.isArray(rtArtsRes.data) ? rtArtsRes.data : [],
        barragens
      )
        .filter((rt) => {
          const rtName = rt.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const reg = (rt.registroProfissional || "").toLowerCase();
          const art = (rt.art || "").toLowerCase();
          return (
            rtName.includes(normText) ||
            reg.includes(normText) ||
            art.includes(normText) ||
            (digits.length >= 3 && normalizeDigits(rt.cpf).includes(digits))
          );
        })
        .slice(0, 50)
    : [];

  const includeFullDoc = canViewFullDocument(req);

  return res.json({
    remoteEnabled: true,
    empreendedores: includeFullDoc ? empreendedores : empreendedores.map(maskEmpreendedorItem),
    barragens: includeFullDoc ? barragens : barragens.map(maskBarragemItem),
    responsaveisTecnicos: includeFullDoc ? responsaveisTecnicos : responsaveisTecnicos.map(maskRtItem),
  });
});

function gmsPartToDecimal(
  part: { g?: string; m?: string; s?: string } | undefined,
  isSouthOrWest: boolean = true
): number | undefined {
  if (!part) return undefined;
  const g = parseFloat(String(part.g || "").replace(",", "."));
  const m = parseFloat(String(part.m || "0").replace(",", "."));
  const s = parseFloat(String(part.s || "0").replace(",", "."));
  if (!Number.isFinite(g) && !Number.isFinite(m)) return undefined;
  const deg = (Number.isFinite(g) ? Math.abs(g) : 0) + (Number.isFinite(m) ? Math.abs(m) : 0) / 60 + (Number.isFinite(s) ? Math.abs(s) : 0) / 3600;
  if (deg === 0) return undefined;
  return Number((isSouthOrWest ? -deg : deg).toFixed(6));
}

function formatGmsString(part: { g?: string; m?: string; s?: string } | undefined): string | undefined {
  if (!part) return undefined;
  const g = String(part.g || "").trim();
  const m = String(part.m || "").trim();
  const s = String(part.s || "").trim();
  if (!g && !m && !s) return undefined;
  return `${g || "0"}°${(m || "00").padStart(2, "0")}'${s || "00"}"`;
}

app.post("/api/registry/empreendedores", requireRole(["Administrador", "Analista"]), async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({
      remoteEnabled: false,
      synced: false,
      error: "Usuário não autenticado.",
    });
  }

  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.status(503).json({
      remoteEnabled: false,
      synced: false,
      error: "Integração com o Administra não configurada no servidor.",
    });
  }

  const body = req.body || {};
  const now = new Date().toISOString();
  const cpfDigits = normalizeDigits(body.cpfCnpjNormalizado || body.cpfCnpj);
  const authorName = getAuthorDisplayName(authUser);
  const payload = sanitizeFlatRow({
    id: body.id,
    nome: body.nome,
    razao_social: body.tipoPessoa === "CNPJ" ? body.nome : undefined,
    tipo_pessoa: body.tipoPessoa || (cpfDigits.length === 14 ? "CNPJ" : "CPF"),
    cpf_cnpj: cpfDigits ? formatCpfCnpj(cpfDigits) : body.cpfCnpj,
    cpf_cnpj_normalizado: cpfDigits || undefined,
    telefone: body.telefone,
    email: body.email,
    logradouro: body.logradouro,
    endereco: body.logradouro,
    numero: body.numero,
    complemento: body.complemento,
    bairro: body.bairro,
    municipio: body.municipio,
    uf: body.uf || "MT",
    cep: body.cep,
    car_mt: body.carMt,
    situacao: "ativo",
    source_system: body.sourceSystem || "NOTIFICA",
    created_by_analyst: authorName,
    created_at: body.createdAt || now,
    updated_at: now,
  });

  const result = await upsertDocumentWithColumnFallback(cfg, "empreendedores", payload);
  if (!result.ok) {
    return res.status(502).json({
      remoteEnabled: true,
      synced: false,
      error: "Falha ao gravar empreendedor na base remota do Administra.",
    });
  }

  return res.json({
    remoteEnabled: true,
    synced: true,
    item: mapRemoteEmpreendedor(result.item, "ADMINISTRA"),
  });
});

app.post("/api/registry/barragens", requireRole(["Administrador", "Analista"]), async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({
      remoteEnabled: false,
      synced: false,
      error: "Usuário não autenticado.",
    });
  }

  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.status(503).json({
      remoteEnabled: false,
      synced: false,
      error: "Integração com o Administra não configurada no servidor.",
    });
  }

  const body = req.body || {};
  const now = new Date().toISOString();
  const authorName = getAuthorDisplayName(authUser);
  const latDec = gmsPartToDecimal(body.coordenadasGMS?.lat, true);
  const lngDec = gmsPartToDecimal(body.coordenadasGMS?.long, true);
  const latGms = formatGmsString(body.coordenadasGMS?.lat);
  const longGms = formatGmsString(body.coordenadasGMS?.long);

  const payload = sanitizeFlatRow({
    id: body.id,
    empreendedor_id: body.empreendedorId || null,
    empreendedor: body.empreendedorNome,
    empreendedor_nome: body.empreendedorNome,
    empreendedor_cpf_cnpj: body.empreendedorCpfCnpj,
    nome: body.nomeBarragem,
    nome_barragem: body.nomeBarragem,
    empreendimento: body.nomeBarragem,
    snisb: body.codigoSnisb,
    codigo_snisb: body.codigoSnisb,
    processo: body.processoReferencia,
    processo_referencia: body.processoReferencia,
    municipio: body.municipio,
    uf: body.uf || "MT",
    curso_agua: body.cursoAguaBarrado,
    curso_agua_barrado: body.cursoAguaBarrado,
    uso_preponderante: body.usoPreponderante,
    situacao: body.situacaoEmpreendimento,
    situacao_empreendimento: body.situacaoEmpreendimento,
    tipo_barragem: body.tipoBarragem,
    latitude: latDec,
    longitude: lngDec,
    lat_gms: latGms,
    long_gms: longGms,
    altura: body.altura,
    volume: body.volume,
    largura_coroamento: body.larguraCoroamento,
    comprimento_coroamento: body.comprimentoCoroamento,
    classificacao_barragem: body.classificacaoBarragem,
    dano_potencial: body.classificacaoDPA,
    classificacao_dpa: body.classificacaoDPA,
    categoria_risco: body.classificacaoCRI,
    classificacao_cri: body.classificacaoCRI,
    portaria_classificacao: body.portariaClassificacao,
    parecer_classificacao: body.parecerClassificacao,
    source_system: body.sourceSystem || "NOTIFICA",
    created_by_analyst: authorName,
    created_at: body.createdAt || now,
    updated_at: now,
  });

  const result = await upsertDocumentWithColumnFallback(cfg, "barragens", payload);
  if (!result.ok) {
    return res.status(502).json({
      remoteEnabled: true,
      synced: false,
      error: "Falha ao gravar barragem na base remota do Administra.",
    });
  }

  return res.json({
    remoteEnabled: true,
    synced: true,
    item: mapRemoteBarragem(result.item, "ADMINISTRA"),
  });
});

app.post("/api/registry/rts", requireRole(["Administrador", "Analista"]), async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({
      remoteEnabled: false,
      synced: false,
      error: "Usuário não autenticado.",
    });
  }

  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.status(503).json({
      remoteEnabled: false,
      synced: false,
      error: "Integração com o Administra não configurada no servidor.",
    });
  }

  const body = req.body || {};
  const now = new Date().toISOString();
  const authorName = getAuthorDisplayName(authUser);
  const payload = sanitizeFlatRow({
    id: body.id,
    nome: body.nome,
    registro: body.registroProfissional,
    registro_profissional: body.registroProfissional,
    especialidades: body.formacaoProfissional,
    formacao_profissional: body.formacaoProfissional,
    art: body.art || undefined,
    art_rrt: body.art || undefined,
    cpf: body.cpf,
    telefone: body.telefone,
    email: body.email,
    situacao: "ativo",
    source_system: body.sourceSystem || "NOTIFICA",
    created_by_analyst: authorName,
    created_at: body.createdAt || now,
    updated_at: now,
  });

  let result = await upsertDocumentWithColumnFallback(cfg, "rts", payload);
  if (!result.ok) {
    const legacyPayload = sanitizeFlatRow({
      id: body.id,
      nome: body.nome,
      registro_profissional: body.registroProfissional,
      formacao_profissional: body.formacaoProfissional,
      cpf: body.cpf,
      telefone: body.telefone,
      email: body.email,
      source_system: body.sourceSystem || "NOTIFICA",
      created_by_analyst: authorName,
      created_at: body.createdAt || now,
      updated_at: now,
    });
    result = await upsertDocumentWithColumnFallback(cfg, "responsaveis_tecnicos", legacyPayload);
  }

  if (!result.ok) {
    return res.status(502).json({
      remoteEnabled: true,
      synced: false,
      error: "Falha ao gravar responsável técnico na base remota do Administra.",
    });
  }

  return res.json({
    remoteEnabled: true,
    synced: true,
    item: mapRemoteRT(result.item, "ADMINISTRA"),
  });
});

app.post("/api/registry/rts/link-art", requireRole(["Administrador", "Analista"]), async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({ remoteEnabled: false, synced: false, error: "Usuário não autenticado." });
  }

  const cfg = getServiceConfig("CENTRAL");
  const body = req.body || {};
  const art = String(body.art || "").trim();
  const rtNome = String(body.rtNome || "").trim();
  if (!art || !rtNome) {
    return res.status(400).json({ remoteEnabled: Boolean(cfg), synced: false, error: "Informe o nome do RT e o número da ART." });
  }

  if (!cfg) {
    return res.status(503).json({
      remoteEnabled: false,
      synced: false,
      error: "Integração com o Administra não configurada no servidor.",
    });
  }

  const now = new Date().toISOString();
  const authorName = getAuthorDisplayName(authUser);
  const rtId = String(body.rtId || `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  const rtPayload = sanitizeFlatRow({
    id: rtId,
    nome: rtNome,
    registro: body.registroProfissional,
    especialidades: body.formacaoProfissional,
    cpf: body.cpf,
    art,
    art_rrt: art,
    barragem_vinculada: body.barragemNome || body.empreendedorNome || undefined,
    created_by_analyst: authorName,
    updated_at: now,
  });

  const rtResult = await upsertDocumentWithColumnFallback(cfg, "rts", rtPayload);

  const linkId = `rt_art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const obsParts = [
    body.empreendedorNome ? `Empreendedor: ${body.empreendedorNome}` : "",
    body.barragemNome ? `Empreendimento/Barragem: ${body.barragemNome}` : "",
  ].filter(Boolean);

  const linkPayload = sanitizeFlatRow({
    id: linkId,
    rt_id: rtResult.ok && rtResult.item?.id ? String(rtResult.item.id) : rtId,
    barragem_id: body.barragemId || null,
    nome: rtNome,
    art,
    art_rrt: art,
    conselho: body.registroProfissional || undefined,
    processo: body.processo || undefined,
    situacao: "ativo",
    observacoes: obsParts.join(" | ") || undefined,
    created_at: now,
  });

  let linkResult = await upsertDocumentWithColumnFallback(cfg, "responsaveis_tecnicos_barragens", linkPayload);
  if (!linkResult.ok && linkPayload.barragem_id) {
    linkPayload.barragem_id = null;
    linkResult = await upsertDocumentWithColumnFallback(cfg, "responsaveis_tecnicos_barragens", linkPayload);
  }

  const mappedRt = rtResult.ok
    ? mapRemoteRT(rtResult.item, "ADMINISTRA")
    : mapRemoteRT(
        {
          id: rtId,
          nome: rtNome,
          registro: body.registroProfissional,
          especialidades: body.formacaoProfissional,
          cpf: body.cpf,
          art,
          art_rrt: art,
          created_by_analyst: authorName,
        },
        "ADMINISTRA"
      );

  mappedRt.art = art;
  mappedRt.artsVinculadas = [
    {
      id: String(linkResult.item?.id || linkId),
      art,
      barragemId: body.barragemId || undefined,
      barragemNome: body.barragemNome || undefined,
      empreendedorId: body.empreendedorId || undefined,
      empreendedorNome: body.empreendedorNome || undefined,
      processo: body.processo || undefined,
      situacao: "ativo",
      createdAt: now,
    },
  ];

  if (!rtResult.ok && !linkResult.ok) {
    return res.status(502).json({
      remoteEnabled: true,
      synced: false,
      error: "Falha ao gravar vínculo de ART na base remota do Administra.",
    });
  }

  return res.json({
    remoteEnabled: true,
    synced: true,
    item: mappedRt,
  });
});

const ALLOWED_REGISTRY_TABLES = new Set(["empreendedores", "barragens", "rts", "responsaveis_tecnicos"]);

app.delete("/api/registry/:kind/:id", requireRole(["Administrador"]), async (req, res) => {
  const { kind, id } = req.params;
  if (!ALLOWED_REGISTRY_TABLES.has(kind) || !id) {
    return res.status(400).json({ remoteEnabled: false, deleted: false, error: "Parâmetros inválidos." });
  }
  const cfg = getServiceConfig("CENTRAL");
  if (!cfg) {
    return res.status(503).json({
      remoteEnabled: false,
      deleted: false,
      error: "Integração com o Administra não configurada no servidor.",
    });
  }
  const targetTable = kind === "responsaveis_tecnicos" ? "rts" : kind;
  let result = await remoteRestRequest(cfg, targetTable, {
    method: "DELETE",
    query: `id=eq.${encodeURIComponent(id)}`,
  });
  if (!result.ok && kind === "responsaveis_tecnicos") {
    result = await remoteRestRequest(cfg, "responsaveis_tecnicos", {
      method: "DELETE",
      query: `id=eq.${encodeURIComponent(id)}`,
    });
  }
  if (!result.ok) {
    return res.status(502).json({
      remoteEnabled: true,
      deleted: false,
      error: "Falha ao excluir registro na base remota do Administra.",
    });
  }
  return res.json({ remoteEnabled: true, deleted: true });
});

// Notifica CSB Document Persistence Proxy (lean flat columns only)
const ALLOWED_DOC_KINDS = new Set(["pareceres", "oficios", "notificacoes"]);

function sanitizeFlatRow(raw: Record<string, any>): Record<string, string | number | boolean | null> {
  const flat: Record<string, string | number | boolean | null> = {};
  for (const [key, val] of Object.entries(raw || {})) {
    if (val === undefined) continue;
    if (val === null || typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      flat[key] = val;
    } else if (Array.isArray(val)) {
      flat[key] = val.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" | ");
    } else if (typeof val === "object") {
      // Avoid storing nested JSON objects inside flat columns
      continue;
    }
  }
  return flat;
}

async function upsertDocumentWithColumnFallback(
  cfg: RemoteServiceConfig,
  table: string,
  row: Record<string, string | number | boolean | null>
) {
  const working = { ...row };
  const baseUrl = buildRestBaseUrl(cfg.endpoint);
  const url = `${baseUrl}/${table}?on_conflict=id`;

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: cfg.token,
          Authorization: `Bearer ${cfg.token}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(working),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const text = await response.text();
        const parsed = text ? JSON.parse(text) : null;
        return {
          ok: true,
          item: Array.isArray(parsed) && parsed[0] ? parsed[0] : working,
        };
      }

      const errText = await response.text();
      const missingColMatch = errText.match(/Could not find the '([^']+)' column/i);
      if (response.status === 400 && missingColMatch && missingColMatch[1]) {
        const colToDrop = missingColMatch[1];
        if (colToDrop in working) {
          delete working[colToDrop];
          continue;
        }
      }
      return { ok: false, item: working };
    } catch {
      return { ok: false, item: working };
    }
  }
  return { ok: false, item: working };
}

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
  const rawItems = Array.isArray(result.data) ? result.data : [];
  const includeFullDoc = canViewFullDocument(req);
  const items = includeFullDoc ? rawItems : rawItems.map((row) => maskDocumentRow(row));
  return res.json({
    remoteEnabled: result.ok,
    items,
  });
});

app.post("/api/documents/:kind", requireRole(["Administrador", "Analista"]), async (req, res) => {
  const kind = req.params.kind;
  if (!ALLOWED_DOC_KINDS.has(kind)) {
    return res.status(400).json({ remoteEnabled: false, synced: false, error: "Tipo de documento inválido." });
  }
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({
      remoteEnabled: false,
      synced: false,
      error: "Usuário não autenticado.",
    });
  }
  const cfg = getServiceConfig("NOTIFICA");
  if (!cfg) {
    return res.status(503).json({
      remoteEnabled: false,
      synced: false,
      error: "Persistência remota do Notifica não configurada no servidor.",
    });
  }
  const flatBody = sanitizeFlatRow(stripClientIdentityFields(req.body || {}));
  flatBody.user_id = authUser.id ? authUser.id : null;
  flatBody.analista = getAuthorDisplayName(authUser);

  const result = await upsertDocumentWithColumnFallback(cfg, kind, flatBody);
  if (!result.ok) {
    return res.status(502).json({
      remoteEnabled: true,
      synced: false,
      error: "Falha ao gravar documento na base remota do Notifica.",
    });
  }
  return res.json({
    remoteEnabled: true,
    synced: true,
    item: result.item,
  });
});

app.delete("/api/documents/:kind/:id", requireRole(["Administrador"]), async (req, res) => {
  const { kind, id } = req.params;
  if (!ALLOWED_DOC_KINDS.has(kind) || !id) {
    return res.status(400).json({ remoteEnabled: false, deleted: false, error: "Parâmetros inválidos." });
  }
  const cfg = getServiceConfig("NOTIFICA");
  if (!cfg) {
    return res.status(503).json({
      remoteEnabled: false,
      deleted: false,
      error: "Persistência remota do Notifica não configurada no servidor.",
    });
  }
  const result = await remoteRestRequest(cfg, kind, {
    method: "DELETE",
    query: `id=eq.${encodeURIComponent(id)}`,
  });
  if (!result.ok) {
    return res.status(502).json({
      remoteEnabled: true,
      deleted: false,
      error: "Falha ao excluir documento na base remota do Notifica.",
    });
  }
  return res.json({
    remoteEnabled: true,
    deleted: true,
  });
});

const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

async function startDevServer() {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!isProduction) {
  void startDevServer();
}

export default app;
