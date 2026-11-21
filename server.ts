import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";

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
  perfilId?: string;
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
    artsVinculadas: Array.isArray(item.artsVinculadas)
      ? item.artsVinculadas.map((artItem) => maskDocumentRow(artItem))
      : item.artsVinculadas,
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
  "cpf_normalizado",
  "cpfNormalizado",
  "cnpj_normalizado",
  "cnpjNormalizado",
]);

const NON_DOC_TEXT_FIELDS = new Set([
  "id",
  "user_id",
  "userId",
  "empreendedor_id",
  "empreendedorId",
  "barragem_id",
  "barragemId",
  "barragem_ids",
  "barragemIds",
  "responsavel_tecnico_ids",
  "responsavelTecnicoIds",
  "oficio_id",
  "oficioId",
  "rt_id",
  "rtId",
  "telefone",
  "telefone_rt",
  "celular",
  "whatsapp",
  "fone",
  "cep",
  "cep_correspondencia",
  "cepCorrespondencia",
  "art",
  "art_rrt",
  "art_numero",
  "artCreaMt",
  "numArt",
  "car_mt",
  "carMt",
  "numCarMt",
  "codigo_car",
  "codigoCar",
  "codigo_snisb",
  "codigoSnisb",
  "snisb",
  "processo",
  "num_processo",
  "numProcesso",
  "processo_referencia",
  "processoReferencia",
  "protocolo",
  "num_protocolo_analisado",
  "numProtocoloAnalisado",
  "num_parecer_tecnico",
  "numParecerTecnico",
  "notificacao_gerada",
  "notificacaoGerada",
  "oficio_gerado",
  "oficioGerado",
  "created_at",
  "updated_at",
  "createdAt",
  "updatedAt",
]);

function maskEmbeddedCpfCnpjInText(text: string): string {
  return text
    .replace(
      /(?<![A-Za-z0-9])(?:\d[\t \u00A0./-]*){12}(\d)[\t \u00A0./-]*(\d)(?![A-Za-z0-9])/g,
      "**.***.***/****-$1$2"
    )
    .replace(
      /(?<![A-Za-z0-9])(?:\d[\t \u00A0./-]*){9}(\d)[\t \u00A0./-]*(\d)(?![A-Za-z0-9])/g,
      "***.***.***-$1$2"
    );
}

function isNormalizedDocFieldKey(key: string): boolean {
  return (
    DOCUMENT_NORMALIZED_CPF_CNPJ_FIELDS.has(key) ||
    (/normaliz/i.test(key) && /cpf|cnpj|doc/i.test(key))
  );
}

function isDocFieldKey(key: string): boolean {
  return (
    DOCUMENT_CPF_CNPJ_FIELDS.has(key) ||
    (/cpf|cnpj/i.test(key) && !/tipo/i.test(key))
  );
}

function maskDocumentValue(value: unknown, keyHint = ""): any {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => maskDocumentValue(item, keyHint));
  }

  if (typeof value === "object") {
    const maskedObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      maskedObj[k] = maskDocumentValue(v, k);
    }
    return maskedObj;
  }

  if (keyHint && isNormalizedDocFieldKey(keyHint)) {
    return "";
  }

  if (keyHint && isDocFieldKey(keyHint)) {
    if (typeof value === "string") {
      return value.trim() ? maskCpfCnpjValue(value) || "***" : value;
    }
    if (typeof value === "number") {
      return maskCpfCnpjValue(String(value)) || "***";
    }
    return value;
  }

  if (
    typeof value === "string" &&
    !NON_DOC_TEXT_FIELDS.has(keyHint) &&
    !/^tipo_/i.test(keyHint) &&
    value.length >= 11
  ) {
    return maskEmbeddedCpfCnpjInText(value);
  }

  return value;
}

function maskDocumentRow<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  return maskDocumentValue(row) as T;
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
  "usuario_id",
  "usuarioId",
  "analista",
  "analista_id",
  "analistaId",
  "analyst",
  "created_by_analyst",
  "createdByAnalyst",
  "created_by",
  "createdBy",
  "updated_by",
  "updatedBy",
  "author",
  "author_id",
  "authorId",
  "autor",
  "autor_id",
  "autorId",
  "owner_id",
  "ownerId",
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
  let mustChangePassword = false;
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
    const authUser = (await authRes.json()) as {
      id?: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    };
    email = String(authUser?.email || "").trim().toLowerCase();
    authUserId = String(authUser?.id || "");
    mustChangePassword = Boolean(authUser?.user_metadata?.must_change_password);
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
    perfilId: matched.id ? String(matched.id) : undefined,
    email,
    nome: String(matched.nome || email).trim(),
    perfil,
  };

  if (mustChangePassword && cleanPath !== "/api/auth/change-password") {
    return res.status(403).json({
      error: "Troca de senha obrigatória no primeiro acesso antes de continuar.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  }

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
    created_by_analyst: authorName,
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

type FlatRowValue = string | number | boolean | null | Record<string, unknown> | unknown[];

function isValidJsonValue(val: unknown): boolean {
  if (val === null || typeof val !== "object") return false;
  try {
    JSON.stringify(val);
    return true;
  } catch {
    return false;
  }
}

function sanitizeFlatRow(raw: Record<string, any>): Record<string, FlatRowValue> {
  const flat: Record<string, FlatRowValue> = {};
  for (const [key, val] of Object.entries(raw || {})) {
    if (val === undefined) continue;
    if (key === "dados_legados" && isValidJsonValue(val)) {
      flat[key] = val as Record<string, unknown> | unknown[];
      continue;
    }
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
  row: Record<string, FlatRowValue>
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

// =========================================================================
// MÓDULO DE PENDÊNCIAS (public.pendencias & public.pendencias_historico)
// =========================================================================

export const PENDENCIA_ORIGEM = "notifica" as const;

export const PENDENCIA_SITUACOES = new Set([
  "aberta",
  "direcionada",
  "em_analise",
  "resolvida",
  "cancelada",
]);

const PENDENCIA_READ_ROLES = new Set<UserRole>([
  "Administrador",
  "Analista",
  "Visualizador",
]);

export const PENDENCIA_MUTATION_BLOCKED_MESSAGE =
  "Operação bloqueada temporariamente (HTTP 409): o módulo de pendências opera em modo somente leitura porque não há mecanismo transacional atômico disponível entre public.pendencias e public.pendencias_historico.";

const PENDENCIA_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PENDENCIA_ID_FIELDS = new Set([
  "id",
  "pendencia_id",
  "responsavel_id",
  "direcionado_por",
  "criado_por",
  "resolvido_por",
  "usuario_id",
  "empreendedor_id",
  "barragem_id",
  "referencia_id",
  "origem_ref_id",
]);

const PENDENCIA_EDITABLE_FIELDS = [
  "tipo",
  "titulo",
  "descricao",
  "tipo_referencia",
  "referencia_id",
  "empreendedor_id",
  "barragem_id",
  "origem_ref_id",
] as const;

const PENDENCIA_FORBIDDEN_PAYLOAD_KEYS = new Set([
  "dados_legados",
  "dadosLegados",
  "payload",
  "raw",
  "raw_payload",
  "rawPayload",
  "snapshot",
  "documento",
  "document",
  "parecer",
  "oficio",
  "notificacao",
  "registro",
  "historico",
  "metadata",
  "meta",
  "cpf",
  "cnpj",
  "cpf_cnpj",
  "cpfCnpj",
  "cpf_cnpj_normalizado",
  "cpfCnpjNormalizado",
]);

const EMAIL_IN_TEXT_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function isValidPendenciaUuid(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return PENDENCIA_UUID_REGEX.test(value.trim());
}

function sanitizePendenciaText(val: unknown): string {
  if (typeof val !== "string") return "";
  return val
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>?/gm, "")
    .trim();
}

function optionalCleanPendenciaText(val: unknown): string | null {
  const clean = sanitizePendenciaText(val);
  return clean ? clean : null;
}

function maskEmailsInText(text: string): string {
  return text.replace(EMAIL_IN_TEXT_REGEX, "***@***");
}

function maskPendenciaTextValue(
  text: string,
  options: { maskEmails: boolean }
): string {
  const uuidPlaceholders: string[] = [];
  let protectedText = text.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (match) => {
      const token = `[[UUID_${uuidPlaceholders.length}]]`;
      uuidPlaceholders.push(match);
      return token;
    }
  );
  protectedText = maskEmbeddedCpfCnpjInText(protectedText);
  if (options.maskEmails) {
    protectedText = maskEmailsInText(protectedText);
  }
  return protectedText.replace(
    /\[\[UUID_(\d+)\]\]/g,
    (_m, idx) => uuidPlaceholders[Number(idx)] ?? ""
  );
}

function containsCpfCnpjInText(text: string): boolean {
  if (!text) return false;
  const withoutUuids = text.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    " "
  );
  return maskEmbeddedCpfCnpjInText(withoutUuids) !== withoutUuids;
}

function looksLikeSerializedObjectPayload(text: string): boolean {
  const trimmed = text.trim();
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed && typeof parsed === "object");
  } catch {
    return false;
  }
}

export function canReadPendencias(authUser: AuthenticatedUser | null | undefined): boolean {
  if (!authUser) return false;
  return PENDENCIA_READ_ROLES.has(authUser.perfil);
}

export function canReadPendencia(
  pendencia: Record<string, any> | null | undefined,
  authUser: AuthenticatedUser | null | undefined
): boolean {
  if (!pendencia || !canReadPendencias(authUser)) return false;
  return true;
}

export function isSameSessionCanonicalUser(
  candidateId: unknown,
  authUser: AuthenticatedUser | null | undefined
): boolean {
  if (!authUser) return false;
  const candidate = String(candidateId || "").trim();
  const canonicalId = String(authUser.id || "").trim();
  return Boolean(candidate && canonicalId && candidate === canonicalId);
}

export function maskPendenciaRow<T extends Record<string, any>>(
  row: T,
  options: { isAdmin?: boolean } = {}
): T {
  const maskEmails = !options.isAdmin;
  const masked: Record<string, any> = {
    ...row,
    titulo:
      typeof row.titulo === "string"
        ? maskPendenciaTextValue(row.titulo, { maskEmails })
        : row.titulo,
    descricao:
      typeof row.descricao === "string"
        ? maskPendenciaTextValue(row.descricao, { maskEmails })
        : row.descricao,
    tipo:
      typeof row.tipo === "string"
        ? maskPendenciaTextValue(row.tipo, { maskEmails })
        : row.tipo,
    tipo_referencia:
      typeof row.tipo_referencia === "string"
        ? maskPendenciaTextValue(row.tipo_referencia, { maskEmails })
        : row.tipo_referencia,
  };
  if (maskEmails) {
    delete masked.email;
    delete masked.criado_por_email;
    delete masked.responsavel_email;
  }
  return masked as T;
}

export function maskPendenciaHistoricoRow<T extends Record<string, any>>(
  row: T,
  options: { isAdmin?: boolean } = {}
): T {
  const maskEmails = !options.isAdmin;
  const isIdField =
    typeof row.campo === "string" && PENDENCIA_ID_FIELDS.has(row.campo);
  const masked: Record<string, any> = {
    ...row,
    valor_anterior:
      !isIdField && typeof row.valor_anterior === "string"
        ? maskPendenciaTextValue(row.valor_anterior, { maskEmails })
        : row.valor_anterior,
    valor_novo:
      !isIdField && typeof row.valor_novo === "string"
        ? maskPendenciaTextValue(row.valor_novo, { maskEmails })
        : row.valor_novo,
    motivo:
      typeof row.motivo === "string"
        ? maskPendenciaTextValue(row.motivo, { maskEmails })
        : row.motivo,
  };
  if (maskEmails) {
    delete masked.email;
    delete masked.usuario_email;
  }
  return masked as T;
}

export function validatePendenciaMutationInput(
  rawBody: unknown
): { ok: boolean; body?: Record<string, any>; error?: string } {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return { ok: false, error: "Corpo da requisição inválido para pendência." };
  }
  const body = rawBody as Record<string, any>;

  for (const [key, value] of Object.entries(body)) {
    if (
      PENDENCIA_FORBIDDEN_PAYLOAD_KEYS.has(key) &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return {
        ok: false,
        error:
          "CPF/CNPJ e payloads copiados não são permitidos em pendências ou histórico; utilize apenas referências por ID.",
      };
    }

    if (value !== null && value !== undefined && typeof value === "object") {
      return {
        ok: false,
        error:
          "Payloads aninhados ou copiados não são permitidos; envie apenas campos simples e IDs de referência.",
      };
    }

    if (typeof value === "string" && !PENDENCIA_ID_FIELDS.has(key)) {
      if (looksLikeSerializedObjectPayload(value)) {
        return {
          ok: false,
          error:
            "Payloads JSON copiados não são permitidos em campos de pendência ou histórico.",
        };
      }
      if (containsCpfCnpjInText(value)) {
        return {
          ok: false,
          error:
            "CPF/CNPJ não pode ser gravado em pendências ou histórico; utilize apenas referências por ID.",
        };
      }
    }
  }

  return { ok: true, body };
}

export function buildPendenciaCreatePayload(
  rawBody: Record<string, any>,
  authUser: AuthenticatedUser,
  now = new Date().toISOString()
) {
  const titulo = sanitizePendenciaText(rawBody.titulo);
  const requestedRespId = optionalCleanPendenciaText(rawBody.responsavel_id);
  const rawSituacao = optionalCleanPendenciaText(rawBody.situacao);
  const situacao = rawSituacao || (requestedRespId ? "direcionada" : "aberta");
  const pendenciaId = crypto.randomUUID();
  const motivo = optionalCleanPendenciaText(rawBody.motivo);

  const row = {
    id: pendenciaId,
    origem: PENDENCIA_ORIGEM,
    origem_ref_id: optionalCleanPendenciaText(rawBody.origem_ref_id),
    tipo: sanitizePendenciaText(rawBody.tipo) || "Geral",
    titulo,
    descricao: optionalCleanPendenciaText(rawBody.descricao),
    situacao,
    responsavel_id: requestedRespId,
    direcionado_por: requestedRespId ? authUser.id : null,
    direcionado_em: requestedRespId ? now : null,
    criado_por: authUser.id,
    tipo_referencia: optionalCleanPendenciaText(rawBody.tipo_referencia),
    referencia_id: optionalCleanPendenciaText(rawBody.referencia_id),
    empreendedor_id: optionalCleanPendenciaText(rawBody.empreendedor_id),
    barragem_id: optionalCleanPendenciaText(rawBody.barragem_id),
    resolvido_por: situacao === "resolvida" ? authUser.id : null,
    resolvido_em: situacao === "resolvida" ? now : null,
    created_at: now,
    updated_at: now,
  };

  const historyRows: Record<string, any>[] = [
    {
      id: crypto.randomUUID(),
      pendencia_id: pendenciaId,
      acao: "criacao",
      campo: "situacao",
      valor_anterior: null,
      valor_novo: situacao,
      usuario_id: authUser.id,
      motivo,
      created_at: now,
    },
  ];

  if (requestedRespId) {
    historyRows.push({
      id: crypto.randomUUID(),
      pendencia_id: pendenciaId,
      acao: "direcionamento",
      campo: "responsavel_id",
      valor_anterior: null,
      valor_novo: requestedRespId,
      usuario_id: authUser.id,
      motivo: motivo || "Direcionamento inicial",
      created_at: now,
    });
  }

  if (situacao === "resolvida") {
    historyRows.push({
      id: crypto.randomUUID(),
      pendencia_id: pendenciaId,
      acao: "resolucao",
      campo: "situacao",
      valor_anterior: null,
      valor_novo: "resolvida",
      usuario_id: authUser.id,
      motivo,
      created_at: now,
    });
  }

  return { row, historyRows };
}

export function buildPendenciaPatchPlan(
  existing: Record<string, any>,
  rawBody: Record<string, any>,
  authUser: AuthenticatedUser,
  now = new Date().toISOString()
) {
  const id = String(existing.id || "").trim();
  const hasRespField = Object.prototype.hasOwnProperty.call(rawBody, "responsavel_id");
  const existingRespId = optionalCleanPendenciaText(existing.responsavel_id);
  const nextRespId = hasRespField
    ? optionalCleanPendenciaText(rawBody.responsavel_id)
    : existingRespId;
  const respChanged = hasRespField && nextRespId !== existingRespId;

  const hasSituacaoField = Object.prototype.hasOwnProperty.call(rawBody, "situacao");
  const requestedSituacao = hasSituacaoField
    ? optionalCleanPendenciaText(rawBody.situacao)
    : null;

  const motivo = optionalCleanPendenciaText(rawBody.motivo);
  const patchPayload: Record<string, any> = {};
  const historyRows: Record<string, any>[] = [];

  for (const field of PENDENCIA_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(rawBody, field)) continue;
    const prevVal = optionalCleanPendenciaText(existing[field]);
    const nextVal =
      field === "titulo" || field === "tipo"
        ? sanitizePendenciaText(rawBody[field])
        : optionalCleanPendenciaText(rawBody[field]);

    if ((prevVal ?? null) !== (nextVal ?? null)) {
      patchPayload[field] = nextVal || null;
      historyRows.push({
        id: crypto.randomUUID(),
        pendencia_id: id,
        acao: "edicao",
        campo: field,
        valor_anterior: prevVal,
        valor_novo: nextVal || null,
        usuario_id: authUser.id,
        motivo,
        created_at: now,
      });
    }
  }

  if (respChanged) {
    patchPayload.responsavel_id = nextRespId;
    patchPayload.direcionado_por = nextRespId ? authUser.id : null;
    patchPayload.direcionado_em = nextRespId ? now : null;
    historyRows.push({
      id: crypto.randomUUID(),
      pendencia_id: id,
      acao: "direcionamento",
      campo: "responsavel_id",
      valor_anterior: existingRespId,
      valor_novo: nextRespId,
      usuario_id: authUser.id,
      motivo,
      created_at: now,
    });
  }

  let nextSituacao = requestedSituacao || String(existing.situacao || "aberta");
  if (!hasSituacaoField && respChanged) {
    if (nextRespId && existing.situacao === "aberta") {
      nextSituacao = "direcionada";
    } else if (!nextRespId && existing.situacao === "direcionada") {
      nextSituacao = "aberta";
    }
  }

  if (nextSituacao !== existing.situacao) {
    patchPayload.situacao = nextSituacao;
    if (nextSituacao === "resolvida") {
      patchPayload.resolvido_por = authUser.id;
      patchPayload.resolvido_em = now;
      historyRows.push({
        id: crypto.randomUUID(),
        pendencia_id: id,
        acao: "resolucao",
        campo: "situacao",
        valor_anterior: existing.situacao || null,
        valor_novo: "resolvida",
        usuario_id: authUser.id,
        motivo,
        created_at: now,
      });
    } else {
      if (existing.situacao === "resolvida") {
        patchPayload.resolvido_por = null;
        patchPayload.resolvido_em = null;
      }
      historyRows.push({
        id: crypto.randomUUID(),
        pendencia_id: id,
        acao: "mudanca_situacao",
        campo: "situacao",
        valor_anterior: existing.situacao || null,
        valor_novo: nextSituacao,
        usuario_id: authUser.id,
        motivo,
        created_at: now,
      });
    }
  }

  if (Object.keys(patchPayload).length > 0) {
    patchPayload.updated_at = now;
  }

  return { patchPayload, historyRows };
}

async function fetchActiveNotificaUsers(cfg: RemoteServiceConfig) {
  const res = await remoteRestRequest<Array<{
    id?: string;
    email?: string;
    nome?: string;
    perfil?: string;
    status?: string;
  }>>(cfg, "perfis_usuarios", {
    query: "select=id,email,nome,perfil,status&order=nome.asc&limit=500",
  });
  if (!res.ok || !Array.isArray(res.data)) {
    return {
      ok: false,
      users: [] as Array<{ id: string; email: string; nome: string; perfil: UserRole }>,
    };
  }
  const users = res.data
    .filter((u) => String(u.status || "").trim().toLowerCase() === "ativo")
    .map((u) => {
      const perfil = normalizeUserRole(u.perfil);
      const id = String(u.id || "").trim();
      if (!perfil || !id) return null;
      return {
        id,
        email: String(u.email || "").trim().toLowerCase(),
        nome: String(u.nome || "").trim(),
        perfil,
      };
    })
    .filter((u): u is { id: string; email: string; nome: string; perfil: UserRole } =>
      Boolean(u)
    );

  return { ok: true, users };
}

function formatSafeUsuarioNome(
  user: { id: string; nome: string; email: string },
  isAdmin: boolean
): string {
  if (isAdmin) {
    return user.nome || user.email || user.id;
  }
  const cleanNome = maskEmailsInText(user.nome || "").trim();
  if (!cleanNome || cleanNome === "***@***") {
    return `Usuário ${user.id.slice(0, 8)}`;
  }
  return cleanNome;
}

app.get("/api/pendencias", async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }
  if (!canReadPendencias(authUser)) {
    return res.status(403).json({ error: "Perfil sem permissão para consultar pendências." });
  }
  const cfg = getServiceConfig("NOTIFICA");
  if (!cfg) {
    return res
      .status(503)
      .json({ error: "Persistência remota do Notifica não configurada no servidor." });
  }

  const [pendRes, usersRes] = await Promise.all([
    remoteRestRequest<Record<string, any>[]>(cfg, "pendencias", {
      query: "select=*&order=updated_at.desc,created_at.desc&limit=1000",
    }),
    fetchActiveNotificaUsers(cfg),
  ]);

  if (!pendRes.ok || !Array.isArray(pendRes.data)) {
    return res.status(502).json({ error: "Falha ao carregar pendências no servidor." });
  }

  const isAdmin = authUser.perfil === "Administrador";
  const items = pendRes.data
    .filter((row) => canReadPendencia(row, authUser))
    .map((row) => maskPendenciaRow(row, { isAdmin }));

  const usuarios = usersRes.ok
    ? usersRes.users.map((u) => ({
        id: u.id,
        nome: formatSafeUsuarioNome(u, isAdmin),
        perfil: u.perfil,
        ...(isAdmin ? { email: u.email } : {}),
      }))
    : [];

  return res.json({
    items,
    usuarios,
    currentUser: {
      id: authUser.id,
      nome: isAdmin
        ? authUser.nome
        : maskEmailsInText(authUser.nome || "").trim() || `Usuário ${authUser.id.slice(0, 8)}`,
      perfil: authUser.perfil,
    },
    readOnly: true,
    readOnlyReason: PENDENCIA_MUTATION_BLOCKED_MESSAGE,
  });
});

app.get("/api/pendencias/:id/historico", async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }
  if (!canReadPendencias(authUser)) {
    return res.status(403).json({ error: "Perfil sem permissão para consultar histórico de pendências." });
  }
  const id = String(req.params.id || "").trim();
  if (!isValidPendenciaUuid(id)) {
    return res.status(400).json({ error: "ID da pendência inválido. Informe um UUID válido." });
  }
  const cfg = getServiceConfig("NOTIFICA");
  if (!cfg) {
    return res
      .status(503)
      .json({ error: "Persistência remota do Notifica não configurada no servidor." });
  }

  // Valida existência e permissão de leitura da pendência ANTES de consultar o histórico
  const pendCheck = await remoteRestRequest<Record<string, any>[]>(cfg, "pendencias", {
    query: `select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  });

  if (!pendCheck.ok || !Array.isArray(pendCheck.data)) {
    return res.status(502).json({ error: "Falha ao consultar pendência." });
  }
  if (pendCheck.data.length === 0) {
    return res.status(404).json({ error: "Pendência não encontrada." });
  }
  const pendencia = pendCheck.data[0];
  if (!canReadPendencia(pendencia, authUser)) {
    return res.status(403).json({ error: "Você não tem permissão para acessar o histórico desta pendência." });
  }

  const histRes = await remoteRestRequest<Record<string, any>[]>(cfg, "pendencias_historico", {
    query: `select=*&pendencia_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=500`,
  });
  if (!histRes.ok || !Array.isArray(histRes.data)) {
    return res.status(502).json({ error: "Falha ao carregar histórico da pendência." });
  }

  const isAdmin = authUser.perfil === "Administrador";
  const items = histRes.data.map((row) => maskPendenciaHistoricoRow(row, { isAdmin }));
  return res.json({ items });
});

app.post("/api/pendencias", requireRole(["Administrador", "Analista"]), async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  const validation = validatePendenciaMutationInput(req.body);
  if (!validation.ok || !validation.body) {
    return res.status(400).json({ error: validation.error || "Corpo da requisição inválido." });
  }
  const body = validation.body;

  const titulo = sanitizePendenciaText(body.titulo);
  if (!titulo) {
    return res.status(400).json({ error: "Informe o título da pendência." });
  }

  const isAdmin = authUser.perfil === "Administrador";
  const requestedRespId = optionalCleanPendenciaText(body.responsavel_id);
  if (requestedRespId && !isAdmin) {
    return res.status(403).json({ error: "Apenas Administrador pode definir ou alterar o responsável." });
  }
  if (requestedRespId && !isValidPendenciaUuid(requestedRespId)) {
    return res.status(400).json({ error: "ID do responsável inválido. Informe um UUID válido." });
  }

  const rawSituacao = optionalCleanPendenciaText(body.situacao);
  if (rawSituacao && !PENDENCIA_SITUACOES.has(rawSituacao)) {
    return res.status(400).json({ error: "Situação inválida para a pendência." });
  }
  if (!isAdmin && rawSituacao === "direcionada") {
    return res.status(403).json({ error: "Apenas Administrador pode direcionar pendências." });
  }

  const cfg = getServiceConfig("NOTIFICA");
  if (requestedRespId && cfg) {
    const usersRes = await fetchActiveNotificaUsers(cfg);
    if (!usersRes.ok) {
      return res.status(502).json({ error: "Não foi possível validar o usuário responsável." });
    }
    const targetExists = usersRes.users.some((u) => u.id === requestedRespId);
    if (!targetExists) {
      return res.status(400).json({ error: "Responsável selecionado não existe ou está inativo." });
    }
  }

  // Bloqueio explícito antes de qualquer gravação enquanto não houver transação atômica
  buildPendenciaCreatePayload(body, authUser);
  return res.status(409).json({
    error: PENDENCIA_MUTATION_BLOCKED_MESSAGE,
    readOnly: true,
    code: "ATOMIC_TRANSACTION_REQUIRED",
  });
});

app.patch("/api/pendencias/:id", requireRole(["Administrador", "Analista"]), async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }
  const id = String(req.params.id || "").trim();
  if (!isValidPendenciaUuid(id)) {
    return res.status(400).json({ error: "ID da pendência inválido. Informe um UUID válido." });
  }

  const validation = validatePendenciaMutationInput(req.body);
  if (!validation.ok || !validation.body) {
    return res.status(400).json({ error: validation.error || "Corpo da requisição inválido." });
  }
  const body = validation.body;

  const hasSituacaoField = Object.prototype.hasOwnProperty.call(body, "situacao");
  const requestedSituacao = hasSituacaoField ? optionalCleanPendenciaText(body.situacao) : null;
  if (hasSituacaoField && (!requestedSituacao || !PENDENCIA_SITUACOES.has(requestedSituacao))) {
    return res.status(400).json({ error: "Situação inválida para a pendência." });
  }

  const hasRespField = Object.prototype.hasOwnProperty.call(body, "responsavel_id");
  const requestedRespId = hasRespField ? optionalCleanPendenciaText(body.responsavel_id) : null;
  if (requestedRespId && !isValidPendenciaUuid(requestedRespId)) {
    return res.status(400).json({ error: "ID do responsável inválido. Informe um UUID válido." });
  }

  if (Object.prototype.hasOwnProperty.call(body, "titulo") && !sanitizePendenciaText(body.titulo)) {
    return res.status(400).json({ error: "O título da pendência não pode ficar vazio." });
  }
  if (Object.prototype.hasOwnProperty.call(body, "tipo") && !sanitizePendenciaText(body.tipo)) {
    return res.status(400).json({ error: "O tipo da pendência não pode ficar vazio." });
  }

  const cfg = getServiceConfig("NOTIFICA");
  if (!cfg) {
    return res
      .status(503)
      .json({ error: "Persistência remota do Notifica não configurada no servidor." });
  }

  const existingRes = await remoteRestRequest<Record<string, any>[]>(cfg, "pendencias", {
    query: `select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  });
  if (!existingRes.ok || !Array.isArray(existingRes.data)) {
    return res.status(502).json({ error: "Falha ao consultar pendência para atualização." });
  }
  const existing = existingRes.data[0];
  if (!existing) {
    return res.status(404).json({ error: "Pendência não encontrada." });
  }

  const isAdmin = authUser.perfil === "Administrador";
  const existingRespId = optionalCleanPendenciaText(existing.responsavel_id);
  const nextRespId = hasRespField ? requestedRespId : existingRespId;
  const respChanged = hasRespField && nextRespId !== existingRespId;

  if (respChanged && !isAdmin) {
    return res.status(403).json({
      error: "Usuários não administradores não podem escolher ou alterar o responsável.",
    });
  }

  if (!isAdmin) {
    if (existingRespId && !isSameSessionCanonicalUser(existingRespId, authUser)) {
      return res.status(403).json({
        error: "Você não tem permissão para alterar ou resolver pendência atribuída a outro usuário.",
      });
    }
    if (requestedSituacao === "direcionada" && existing.situacao !== "direcionada") {
      return res.status(403).json({
        error: "Apenas Administrador pode definir a situação como direcionada.",
      });
    }
  }

  if (respChanged && nextRespId) {
    const usersRes = await fetchActiveNotificaUsers(cfg);
    if (!usersRes.ok) {
      return res.status(502).json({ error: "Não foi possível validar o responsável selecionado." });
    }
    const targetExists = usersRes.users.some((u) => u.id === nextRespId);
    if (!targetExists) {
      return res.status(400).json({ error: "Responsável selecionado não existe ou está inativo." });
    }
  }

  // Bloqueio explícito antes de qualquer gravação enquanto não houver transação atômica
  buildPendenciaPatchPlan(existing, body, authUser);
  return res.status(409).json({
    error: PENDENCIA_MUTATION_BLOCKED_MESSAGE,
    readOnly: true,
    code: "ATOMIC_TRANSACTION_REQUIRED",
  });
});

// ============================================================================
// Gestão de Usuários (Somente Administrador) e Troca de Senha (Todo Usuário)
// ============================================================================

const DEFAULT_SUGGESTED_USER_PASSWORD = "@12345";
const USER_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface SupabaseAdminAuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
  banned_until?: string | null;
}

function getNotificaServiceRoleConfig(): {
  restConfig: RemoteServiceConfig;
  authBaseUrl: string;
  serviceRoleKey: string;
} | null {
  const endpoint = (
    process.env.NOTIFICA_SUPABASE_URL?.trim() ||
    process.env.NOTIFICA_SERVICE_ENDPOINT?.trim() ||
    process.env.NOTIFICA_DB_URL?.trim() ||
    ""
  )
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  const serviceRoleKey =
    process.env.NOTIFICA_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NOTIFICA_SERVICE_TOKEN?.trim() ||
    "";

  if (
    !endpoint ||
    !/^https?:\/\//i.test(endpoint) ||
    endpoint.includes("placeholder") ||
    serviceRoleKey.length <= 10
  ) {
    return null;
  }

  return {
    restConfig: { endpoint, token: serviceRoleKey },
    authBaseUrl: endpoint,
    serviceRoleKey,
  };
}

function normalizeUserStatus(raw: unknown): "ativo" | "inativo" | null {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase();
  if (normalized === "ativo") return "ativo";
  if (normalized === "inativo") return "inativo";
  return null;
}

function sanitizeUserName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/<[^>]*>?/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

async function supabaseAuthAdminRequest<T = any>(
  authBaseUrl: string,
  serviceRoleKey: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<{ ok: boolean; status: number; data: T | null; errorMessage?: string }> {
  const url = `${authBaseUrl}/auth/v1/admin${path}`;
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(10000),
    });

    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const msg =
        (parsed && (parsed.msg || parsed.message || parsed.error_description || parsed.error)) ||
        `Erro HTTP ${response.status}`;
      return {
        ok: false,
        status: response.status,
        data: null,
        errorMessage: String(msg),
      };
    }

    return { ok: true, status: response.status, data: parsed as T };
  } catch {
    return {
      ok: false,
      status: 502,
      data: null,
      errorMessage: "Falha de comunicação com o serviço de autenticação.",
    };
  }
}

function extractAdminAuthUser(payload: any): SupabaseAdminAuthUser | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload.id ? payload : payload.user;
  if (candidate && typeof candidate === "object" && typeof candidate.id === "string") {
    return candidate as SupabaseAdminAuthUser;
  }
  return null;
}

async function findSupabaseAuthUser(
  authBaseUrl: string,
  serviceRoleKey: string,
  lookup: { id?: string; email?: string }
): Promise<{ ok: boolean; user: SupabaseAdminAuthUser | null; errorMessage?: string }> {
  const normalizedId = String(lookup.id || "").trim();
  const normalizedEmail = String(lookup.email || "").trim().toLowerCase();

  if (normalizedId && isValidPendenciaUuid(normalizedId)) {
    const byIdRes = await supabaseAuthAdminRequest<any>(
      authBaseUrl,
      serviceRoleKey,
      `/users/${encodeURIComponent(normalizedId)}`
    );
    if (byIdRes.ok) {
      const extracted = extractAdminAuthUser(byIdRes.data);
      if (extracted) {
        return { ok: true, user: extracted };
      }
    } else if (byIdRes.status !== 404) {
      return { ok: false, user: null, errorMessage: byIdRes.errorMessage };
    }
  }

  if (!normalizedEmail) {
    return { ok: true, user: null };
  }

  for (let page = 1; page <= 5; page += 1) {
    const listRes = await supabaseAuthAdminRequest<{ users?: SupabaseAdminAuthUser[] } | SupabaseAdminAuthUser[]>(
      authBaseUrl,
      serviceRoleKey,
      `/users?page=${page}&per_page=1000`
    );
    if (!listRes.ok) {
      return { ok: false, user: null, errorMessage: listRes.errorMessage };
    }
    const users = Array.isArray(listRes.data)
      ? listRes.data
      : Array.isArray(listRes.data?.users)
        ? listRes.data.users
        : [];
    const matched = users.find(
      (u) => String(u?.email || "").trim().toLowerCase() === normalizedEmail
    );
    if (matched) {
      return { ok: true, user: matched };
    }
    if (users.length < 1000) {
      break;
    }
  }

  return { ok: true, user: null };
}

function isSameAdminTarget(
  target: { id?: string; email?: string },
  authUser: AuthenticatedUser
): boolean {
  const targetId = String(target.id || "").trim();
  const targetEmail = String(target.email || "").trim().toLowerCase();
  if (authUser.perfilId && targetId && targetId === authUser.perfilId) return true;
  if (targetId && targetId === authUser.id) return true;
  if (targetEmail && targetEmail === authUser.email.toLowerCase()) return true;
  return false;
}

function sanitizePerfilUsuarioRow(row: Record<string, any>) {
  return {
    id: String(row.id || "").trim(),
    email: String(row.email || "").trim().toLowerCase(),
    nome: String(row.nome || "").trim(),
    perfil: normalizeUserRole(row.perfil) || ("Visualizador" as UserRole),
    status: normalizeUserStatus(row.status) || "inativo",
  };
}

// Endpoint disponível para TODO usuário autenticado (Administrador, Analista, Visualizador)
app.post("/api/auth/change-password", async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : null;
  if (!body) {
    return res.status(400).json({ error: "Corpo da requisição inválido." });
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return res.status(400).json({ error: "Informe sua senha atual." });
  }
  if (newPassword.length < 6 || newPassword.length > 128) {
    return res.status(400).json({ error: "A nova senha deve ter entre 6 e 128 caracteres." });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: "A nova senha deve ser diferente da senha atual." });
  }

  const serviceCfg = getNotificaServiceRoleConfig();
  if (!serviceCfg) {
    return res.status(503).json({ error: "Serviço administrativo de autenticação não configurado no servidor." });
  }

  const authApiKey = getNotificaAuthApiKey(getServiceConfig("NOTIFICA")) || serviceCfg.serviceRoleKey;

  try {
    const verifyRes = await fetch(`${serviceCfg.authBaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: authApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: authUser.email,
        password: currentPassword,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!verifyRes.ok) {
      return res.status(400).json({ error: "Senha atual incorreta." });
    }
  } catch {
    return res.status(502).json({ error: "Não foi possível validar a senha atual." });
  }

  const found = await findSupabaseAuthUser(serviceCfg.authBaseUrl, serviceCfg.serviceRoleKey, {
    id: authUser.id,
    email: authUser.email,
  });
  if (!found.ok) {
    return res.status(502).json({ error: found.errorMessage || "Falha ao localizar usuário autenticado." });
  }

  const targetAuthId = found.user?.id || (isValidPendenciaUuid(authUser.id) ? authUser.id : "");
  if (!targetAuthId) {
    return res.status(404).json({ error: "Conta de autenticação não localizada no Supabase Auth." });
  }

  const updateRes = await supabaseAuthAdminRequest(
    serviceCfg.authBaseUrl,
    serviceCfg.serviceRoleKey,
    `/users/${encodeURIComponent(targetAuthId)}`,
    {
      method: "PUT",
      body: {
        password: newPassword,
        user_metadata: {
          ...(found.user?.user_metadata || {}),
          must_change_password: false,
        },
      },
    }
  );

  if (!updateRes.ok) {
    return res.status(502).json({ error: updateRes.errorMessage || "Não foi possível atualizar a senha." });
  }

  return res.json({ ok: true, message: "Senha alterada com sucesso." });
});

app.get("/api/users", requireRole(["Administrador"]), async (_req, res) => {
  const serviceCfg = getNotificaServiceRoleConfig();
  const restCfg = serviceCfg?.restConfig || getServiceConfig("NOTIFICA");
  if (!restCfg) {
    return res.status(503).json({ error: "Persistência de usuários não configurada no servidor." });
  }

  const usersRes = await remoteRestRequest<Array<Record<string, any>>>(restCfg, "perfis_usuarios", {
    query: "select=id,email,nome,perfil,status&order=nome.asc&limit=1000",
  });

  if (!usersRes.ok || !Array.isArray(usersRes.data)) {
    return res.status(502).json({ error: "Falha ao consultar usuários no Supabase." });
  }

  const users = usersRes.data
    .filter((row) => row && typeof row === "object" && row.id)
    .map((row) => sanitizePerfilUsuarioRow(row));

  return res.json({ users });
});

app.post("/api/users", requireRole(["Administrador"]), async (req, res) => {
  const serviceCfg = getNotificaServiceRoleConfig();
  if (!serviceCfg) {
    return res.status(503).json({
      error: "Chave administrativa do Supabase (service_role) não configurada no servidor.",
    });
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : null;
  if (!body) {
    return res.status(400).json({ error: "Corpo da requisição inválido." });
  }

  const nome = sanitizeUserName(body.nome);
  const email = String(body.email || "").trim().toLowerCase();
  const perfil = normalizeUserRole(body.perfil);
  const requestedStatus = body.status !== undefined ? normalizeUserStatus(body.status) : "ativo";
  const rawPassword = typeof body.password === "string" ? body.password : "";
  const password = rawPassword ? rawPassword : DEFAULT_SUGGESTED_USER_PASSWORD;

  if (nome.length < 2) {
    return res.status(400).json({ error: "Informe o nome completo do usuário (mínimo 2 caracteres)." });
  }
  if (!USER_EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: "Informe um e-mail válido." });
  }
  if (!perfil) {
    return res.status(400).json({ error: "Perfil inválido. Selecione Administrador, Analista ou Visualizador." });
  }
  if (!requestedStatus) {
    return res.status(400).json({ error: "Status inválido. Utilize ativo ou inativo." });
  }
  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: "A senha deve ter entre 6 e 128 caracteres." });
  }

  const cleanEmailPattern = email.replace(/[%*]/g, "");
  const existingProfileRes = await remoteRestRequest<Array<Record<string, any>>>(
    serviceCfg.restConfig,
    "perfis_usuarios",
    {
      query: `select=id,email&email=ilike.${encodeURIComponent(cleanEmailPattern)}&limit=10`,
    }
  );
  if (!existingProfileRes.ok || !Array.isArray(existingProfileRes.data)) {
    return res.status(502).json({ error: "Não foi possível verificar usuários existentes." });
  }
  const emailAlreadyInProfile = existingProfileRes.data.some(
    (row) => String(row?.email || "").trim().toLowerCase() === email
  );
  if (emailAlreadyInProfile) {
    return res.status(409).json({ error: "Já existe um usuário cadastrado com este e-mail." });
  }

  const existingAuthRes = await findSupabaseAuthUser(
    serviceCfg.authBaseUrl,
    serviceCfg.serviceRoleKey,
    { email }
  );
  if (!existingAuthRes.ok) {
    return res.status(502).json({
      error: existingAuthRes.errorMessage || "Falha ao verificar conta no Supabase Auth.",
    });
  }

  let authUserId = existingAuthRes.user?.id || "";
  let createdNewAuthUser = false;

  if (!authUserId) {
    const createAuthRes = await supabaseAuthAdminRequest<any>(
      serviceCfg.authBaseUrl,
      serviceCfg.serviceRoleKey,
      "/users",
      {
        method: "POST",
        body: {
          email,
          password,
          email_confirm: true,
          user_metadata: { nome, must_change_password: true },
          ...(requestedStatus === "inativo" ? { ban_duration: "876000h" } : {}),
        },
      }
    );
    const createdAuth = extractAdminAuthUser(createAuthRes.data);
    if (!createAuthRes.ok || !createdAuth?.id) {
      return res.status(createAuthRes.status >= 400 && createAuthRes.status < 500 ? 400 : 502).json({
        error: createAuthRes.errorMessage || "Não foi possível criar a conta no Supabase Auth.",
      });
    }
    authUserId = createdAuth.id;
    createdNewAuthUser = true;
  } else {
    const syncExistingAuthRes = await supabaseAuthAdminRequest<any>(
      serviceCfg.authBaseUrl,
      serviceCfg.serviceRoleKey,
      `/users/${encodeURIComponent(authUserId)}`,
      {
        method: "PUT",
        body: {
          email_confirm: true,
          password,
          user_metadata: {
            ...(existingAuthRes.user?.user_metadata || {}),
            nome,
            must_change_password: true,
          },
          ban_duration: requestedStatus === "ativo" ? "none" : "876000h",
        },
      }
    );
    if (!syncExistingAuthRes.ok) {
      return res.status(502).json({
        error:
          syncExistingAuthRes.errorMessage ||
          "Não foi possível sincronizar a conta existente no Supabase Auth.",
      });
    }
  }

  const insertProfileRes = await remoteRestRequest<Array<Record<string, any>>>(
    serviceCfg.restConfig,
    "perfis_usuarios",
    {
      method: "POST",
      prefer: "return=representation",
      body: {
        id: authUserId,
        email,
        nome,
        perfil,
        status: requestedStatus,
      },
    }
  );

  if (!insertProfileRes.ok || !Array.isArray(insertProfileRes.data) || !insertProfileRes.data[0]) {
    if (createdNewAuthUser) {
      await supabaseAuthAdminRequest(
        serviceCfg.authBaseUrl,
        serviceCfg.serviceRoleKey,
        `/users/${encodeURIComponent(authUserId)}`,
        { method: "DELETE" }
      );
    }
    return res.status(502).json({ error: "Não foi possível salvar o perfil do usuário em perfis_usuarios." });
  }

  return res.status(201).json({
    user: sanitizePerfilUsuarioRow(insertProfileRes.data[0]),
    message:
      requestedStatus === "ativo"
        ? "Usuário salvo e ativado com sucesso."
        : "Usuário salvo com sucesso.",
  });
});

app.patch("/api/users/:id", requireRole(["Administrador"]), async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  const id = String(req.params.id || "").trim();
  if (!isValidPendenciaUuid(id)) {
    return res.status(400).json({ error: "ID de usuário inválido." });
  }

  const serviceCfg = getNotificaServiceRoleConfig();
  if (!serviceCfg) {
    return res.status(503).json({
      error: "Chave administrativa do Supabase (service_role) não configurada no servidor.",
    });
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : null;
  if (!body) {
    return res.status(400).json({ error: "Corpo da requisição inválido." });
  }

  const existingRes = await remoteRestRequest<Array<Record<string, any>>>(
    serviceCfg.restConfig,
    "perfis_usuarios",
    {
      query: `select=id,email,nome,perfil,status&id=eq.${encodeURIComponent(id)}&limit=1`,
    }
  );
  if (!existingRes.ok || !Array.isArray(existingRes.data)) {
    return res.status(502).json({ error: "Falha ao consultar usuário para atualização." });
  }
  const existing = existingRes.data[0];
  if (!existing) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  const existingClean = sanitizePerfilUsuarioRow(existing);
  const nextNome = body.nome !== undefined ? sanitizeUserName(body.nome) : existingClean.nome;
  const nextEmail =
    body.email !== undefined ? String(body.email || "").trim().toLowerCase() : existingClean.email;
  const nextPerfil =
    body.perfil !== undefined ? normalizeUserRole(body.perfil) : existingClean.perfil;
  const nextStatus =
    body.status !== undefined ? normalizeUserStatus(body.status) : existingClean.status;

  if (nextNome.length < 2) {
    return res.status(400).json({ error: "Informe o nome completo do usuário (mínimo 2 caracteres)." });
  }
  if (!USER_EMAIL_REGEX.test(nextEmail)) {
    return res.status(400).json({ error: "Informe um e-mail válido." });
  }
  if (!nextPerfil) {
    return res.status(400).json({ error: "Perfil inválido." });
  }
  if (!nextStatus) {
    return res.status(400).json({ error: "Status inválido. Utilize ativo ou inativo." });
  }

  const isSelf = isSameAdminTarget(existingClean, authUser);
  if (isSelf && nextStatus === "inativo") {
    return res.status(400).json({ error: "Você não pode inativar sua própria conta de Administrador." });
  }
  if (isSelf && nextPerfil !== "Administrador") {
    return res.status(400).json({ error: "Você não pode remover seu próprio perfil de Administrador." });
  }

  if (nextEmail !== existingClean.email) {
    const cleanEmailPattern = nextEmail.replace(/[%*]/g, "");
    const dupRes = await remoteRestRequest<Array<Record<string, any>>>(
      serviceCfg.restConfig,
      "perfis_usuarios",
      {
        query: `select=id,email&email=ilike.${encodeURIComponent(cleanEmailPattern)}&limit=10`,
      }
    );
    if (!dupRes.ok || !Array.isArray(dupRes.data)) {
      return res.status(502).json({ error: "Não foi possível validar o novo e-mail." });
    }
    const emailTaken = dupRes.data.some(
      (row) =>
        String(row?.id || "").trim() !== id &&
        String(row?.email || "").trim().toLowerCase() === nextEmail
    );
    if (emailTaken) {
      return res.status(409).json({ error: "Já existe outro usuário cadastrado com este e-mail." });
    }
  }

  const patchProfileRes = await remoteRestRequest<Array<Record<string, any>>>(
    serviceCfg.restConfig,
    "perfis_usuarios",
    {
      method: "PATCH",
      query: `id=eq.${encodeURIComponent(id)}`,
      prefer: "return=representation",
      body: {
        nome: nextNome,
        email: nextEmail,
        perfil: nextPerfil,
        status: nextStatus,
      },
    }
  );
  if (!patchProfileRes.ok || !Array.isArray(patchProfileRes.data) || !patchProfileRes.data[0]) {
    return res.status(502).json({ error: "Falha ao atualizar usuário em perfis_usuarios." });
  }

  const authLookup = await findSupabaseAuthUser(serviceCfg.authBaseUrl, serviceCfg.serviceRoleKey, {
    id,
    email: existingClean.email,
  });
  if (authLookup.ok && authLookup.user?.id) {
    const emailChanged = nextEmail !== existingClean.email;
    const statusChanged = nextStatus !== existingClean.status;
    const nomeChanged = nextNome !== existingClean.nome;

    if (emailChanged || statusChanged || nomeChanged) {
      const authPatch: Record<string, unknown> = {
        user_metadata: {
          ...(authLookup.user.user_metadata || {}),
          nome: nextNome,
        },
      };
      if (emailChanged) {
        authPatch.email = nextEmail;
        authPatch.email_confirm = true;
      }
      if (statusChanged) {
        authPatch.ban_duration = nextStatus === "inativo" ? "876000h" : "none";
      }

      const authUpdateRes = await supabaseAuthAdminRequest(
        serviceCfg.authBaseUrl,
        serviceCfg.serviceRoleKey,
        `/users/${encodeURIComponent(authLookup.user.id)}`,
        {
          method: "PUT",
          body: authPatch,
        }
      );
      if (!authUpdateRes.ok && emailChanged) {
        await remoteRestRequest(serviceCfg.restConfig, "perfis_usuarios", {
          method: "PATCH",
          query: `id=eq.${encodeURIComponent(id)}`,
          body: { email: existingClean.email },
        });
        return res.status(502).json({
          error: authUpdateRes.errorMessage || "Não foi possível atualizar o e-mail no Supabase Auth.",
        });
      }
    }
  }

  return res.json({
    user: sanitizePerfilUsuarioRow(patchProfileRes.data[0]),
  });
});

app.post("/api/users/:id/reset-password", requireRole(["Administrador"]), async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!isValidPendenciaUuid(id)) {
    return res.status(400).json({ error: "ID de usuário inválido." });
  }

  const serviceCfg = getNotificaServiceRoleConfig();
  if (!serviceCfg) {
    return res.status(503).json({
      error: "Chave administrativa do Supabase (service_role) não configurada no servidor.",
    });
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const rawPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const nextPassword = rawPassword ? rawPassword : DEFAULT_SUGGESTED_USER_PASSWORD;

  if (nextPassword.length < 6 || nextPassword.length > 128) {
    return res.status(400).json({ error: "A nova senha deve ter entre 6 e 128 caracteres." });
  }

  const existingRes = await remoteRestRequest<Array<Record<string, any>>>(
    serviceCfg.restConfig,
    "perfis_usuarios",
    {
      query: `select=id,email,nome,perfil,status&id=eq.${encodeURIComponent(id)}&limit=1`,
    }
  );
  if (!existingRes.ok || !Array.isArray(existingRes.data)) {
    return res.status(502).json({ error: "Falha ao consultar usuário." });
  }
  const existing = existingRes.data[0];
  if (!existing) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  const authLookup = await findSupabaseAuthUser(serviceCfg.authBaseUrl, serviceCfg.serviceRoleKey, {
    id,
    email: String(existing.email || "").trim().toLowerCase(),
  });
  if (!authLookup.ok) {
    return res.status(502).json({ error: authLookup.errorMessage || "Falha ao localizar usuário no Supabase Auth." });
  }
  if (!authLookup.user?.id) {
    return res.status(404).json({ error: "Conta de autenticação não encontrada no Supabase Auth para este usuário." });
  }

  const resetRes = await supabaseAuthAdminRequest(
    serviceCfg.authBaseUrl,
    serviceCfg.serviceRoleKey,
    `/users/${encodeURIComponent(authLookup.user.id)}`,
    {
      method: "PUT",
      body: {
        password: nextPassword,
        user_metadata: {
          ...(authLookup.user.user_metadata || {}),
          must_change_password: true,
        },
      },
    }
  );
  if (!resetRes.ok) {
    return res.status(502).json({ error: resetRes.errorMessage || "Não foi possível redefinir a senha." });
  }

  return res.json({ ok: true, message: "Senha redefinida com sucesso." });
});

app.delete("/api/users/:id", requireRole(["Administrador"]), async (req, res) => {
  const authUser = getSessionIdentity(req);
  if (!authUser) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  const id = String(req.params.id || "").trim();
  if (!isValidPendenciaUuid(id)) {
    return res.status(400).json({ error: "ID de usuário inválido." });
  }

  const serviceCfg = getNotificaServiceRoleConfig();
  if (!serviceCfg) {
    return res.status(503).json({
      error: "Chave administrativa do Supabase (service_role) não configurada no servidor.",
    });
  }

  const existingRes = await remoteRestRequest<Array<Record<string, any>>>(
    serviceCfg.restConfig,
    "perfis_usuarios",
    {
      query: `select=id,email,nome,perfil,status&id=eq.${encodeURIComponent(id)}&limit=1`,
    }
  );
  if (!existingRes.ok || !Array.isArray(existingRes.data)) {
    return res.status(502).json({ error: "Falha ao consultar usuário para exclusão." });
  }
  const existing = existingRes.data[0];
  if (!existing) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  const existingClean = sanitizePerfilUsuarioRow(existing);
  if (isSameAdminTarget(existingClean, authUser)) {
    return res.status(400).json({ error: "Você não pode excluir sua própria conta." });
  }

  const authLookup = await findSupabaseAuthUser(serviceCfg.authBaseUrl, serviceCfg.serviceRoleKey, {
    id,
    email: existingClean.email,
  });
  if (!authLookup.ok) {
    return res.status(502).json({
      error: authLookup.errorMessage || "Falha ao localizar usuário no Supabase Auth.",
    });
  }

  const delProfileRes = await remoteRestRequest(serviceCfg.restConfig, "perfis_usuarios", {
    method: "DELETE",
    query: `id=eq.${encodeURIComponent(id)}`,
  });
  if (!delProfileRes.ok) {
    return res.status(502).json({ error: "Não foi possível remover o perfil do usuário." });
  }

  if (authLookup.user?.id) {
    const delAuthRes = await supabaseAuthAdminRequest(
      serviceCfg.authBaseUrl,
      serviceCfg.serviceRoleKey,
      `/users/${encodeURIComponent(authLookup.user.id)}`,
      { method: "DELETE" }
    );
    if (!delAuthRes.ok && delAuthRes.status !== 404) {
      return res.status(502).json({
        error:
          delAuthRes.errorMessage ||
          "Perfil removido, mas não foi possível remover a conta do Supabase Auth.",
      });
    }
  }

  return res.json({ ok: true, message: "Usuário excluído com sucesso." });
});

const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const isTestEnv = process.env.NODE_ENV === "test";

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

if (!isProduction && !isTestEnv) {
  void startDevServer();
}

export default app;
