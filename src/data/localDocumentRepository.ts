import { ParecerData, OficioData, NotificacaoData, FiscalizacaoData } from '../types';
import {
  BarragemCanonica,
  CURRENT_SYSTEM_ID,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import { OPS_ANALISTA, OPS_MUNICIPIOS, OPS_RESPONSAVEL_TECNICO } from '../constants';
import { DocumentRepository } from './types';
import { assertSafeId, safeJsonParse, sanitizeObject, stripSensitiveFields } from '../lib/security';
import { authFetch, getActiveAuthUser } from '../lib/supabase';
import {
  buildNotificacaoSigaDocText,
  buildNotificacaoText,
  buildParecerRevisaoText,
  coordenadasGmsToStrings,
  formatBarragensSummary,
  parseBarragensSummary,
  stringsToCoordenadasGms,
} from '../services/documentTemplates';

function getSessionAnalystFallback(): string {
  const active = getActiveAuthUser();
  return active?.name || active?.email || 'Analista';
}

const STORAGE_KEYS = {
  PARECERES: 'notifica_csb_pareceres',
  OFICIOS: 'notifica_csb_oficios',
  NOTIFICACOES: 'notifica_csb_notificacoes',
  FISCALIZACOES: 'notifica_csb_fiscalizacoes',
  LEGACY_PARECERES: 'sema_mt_pareceres',
  LEGACY_OFICIOS: 'sema_mt_oficios',
  LEGACY_NOTIFICACOES: 'sema_mt_notificacoes',
  LEGACY_FISCALIZACOES: 'sema_mt_fiscalizacoes',
} as const;

const ADMINISTRA_CACHE_KEYS = {
  EMPREENDEDORES: 'administra_barragens_empreendedores',
  BARRAGENS: 'administra_barragens_barragens',
  RTS: 'administra_barragens_rts',
} as const;

function readAdministraCache() {
  const emps = safeJsonParse<EmpreendedorCanonico[]>(
    localStorage.getItem(ADMINISTRA_CACHE_KEYS.EMPREENDEDORES),
    []
  );
  const bars = safeJsonParse<BarragemCanonica[]>(
    localStorage.getItem(ADMINISTRA_CACHE_KEYS.BARRAGENS),
    []
  );
  const rts = safeJsonParse<ResponsavelTecnicoCanonico[]>(
    localStorage.getItem(ADMINISTRA_CACHE_KEYS.RTS),
    []
  );
  return {
    empsById: new Map((Array.isArray(emps) ? emps : []).map((e) => [e.id, e])),
    barsById: new Map((Array.isArray(bars) ? bars : []).map((b) => [b.id, b])),
    rtsById: new Map((Array.isArray(rts) ? rts : []).map((r) => [r.id, r])),
  };
}

function splitDelimited(val: unknown, sep = '|'): string[] {
  if (Array.isArray(val)) return val.map((v) => String(v || '').trim()).filter(Boolean);
  if (typeof val !== 'string') return [];
  return val
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitAnalistas(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((v) => String(v || '').trim()).filter(Boolean);
  if (typeof val !== 'string') return [];
  return val
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeTopicosExtras(topicos?: { id: string; titulo: string; conteudo: string }[]): string {
  if (!Array.isArray(topicos) || topicos.length === 0) return '';
  return topicos
    .filter((t) => t.titulo?.trim() || t.conteudo?.trim())
    .map((t) => `[${(t.titulo || 'TÓPICO').trim()}] ${t.conteudo || ''}`.trim())
    .join('\n---\n');
}

function parseTopicosExtras(raw: unknown): { id: string; titulo: string; conteudo: string }[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split('\n---\n')
    .map((block, idx) => {
      const m = block.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
      return {
        id: `extra_${idx + 1}`,
        titulo: m ? m[1].trim() : 'CONDICIONANTES',
        conteudo: m ? m[2].trim() : block.trim(),
      };
    })
    .filter((t) => t.titulo || t.conteudo);
}

function serializePendencias(pendencias?: { id: string; descricao: string }[]): string {
  if (!Array.isArray(pendencias) || pendencias.length === 0) return '';
  return pendencias
    .map((p) => (typeof p === 'string' ? p : p.descricao || '').trim())
    .filter(Boolean)
    .join('\n• ');
}

function parsePendencias(raw: unknown): { id: string; descricao: string }[] {
  if (Array.isArray(raw)) {
    return raw.map((item: any, idx: number) => ({
      id: item?.id || `pend_${idx + 1}`,
      descricao: typeof item === 'string' ? item : String(item?.descricao || ''),
    }));
  }
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/\n•\s*|\r?\n/)
    .map((s) => s.replace(/^•\s*/, '').trim())
    .filter(Boolean)
    .map((descricao, idx) => ({
      id: `pend_${idx + 1}`,
      descricao,
    }));
}

// =========================================================================
// LEAN FLAT COLUMN SERIALIZERS (NO JSON BLOBS, NO STATIC BOILERPLATE)
// =========================================================================

export function serializeParecerFlat(data: ParecerData, id: string, now: string, createdAt: string) {
  const clean = sanitizeObject(stripSensitiveFields(data));
  const { lat, long } = coordenadasGmsToStrings(clean.coordenadasGMS);
  const rtAll = [
    ...(clean.responsaveisTecnicos || []),
    ...(clean.rtOutros || []).filter((n) => n && n.trim()),
  ];
  const analistasAll = clean.analistas || [];
  const analistasOutros = (clean.analistasOutros || []).filter((n) => n && n.trim());

  return {
    id,
    user_id: clean.userId || null,
    tipo_documento: clean.tipo_documento || 'Parecer Técnico',
    num_parecer_tecnico: clean.numParecerTecnico || '',
    processo: clean.processo || '',
    num_protocolo_analisado: clean.numProtocoloAnalisado || '',
    data_parecer: clean.dataParecer || clean.data || now.split('T')[0],
    data_recebimento_processo: clean.dataRecebimentoProcesso || '',
    data_protocolo: clean.dataProtocolo || '',
    data_inspecao: clean.dataInspecao || '',
    status: clean.status || 'Rascunho',
    analista: clean.analista || analistasAll[0] || analistasOutros[0] || getSessionAnalystFallback(),
    analistas_nomes: analistasAll.join(' | '),
    analistas_outros: analistasOutros.join(' | '),
    empreendedor_id: clean.empreendedorId || '',
    empreendedor_nome: clean.identificacaoEmpreendedor || '',
    cpf_cnpj: clean.cpfCnpj || '',
    car_mt: clean.numCarMt || '',
    barragem_id: clean.barragemId || '',
    barragem_nome: clean.nomeBarragem || clean.localizacaoEmpreendimento || '',
    codigo_snisb: clean.snisb || '',
    municipio: clean.municipio || '',
    lat_gms: lat,
    long_gms: long,
    responsavel_tecnico_ids: (clean.responsavelTecnicoIds || []).join(','),
    responsavel_tecnico_nomes: rtAll.join(' | '),
    art_numero: clean.artCreaMt || clean.numArt || '',
    art_atividade: clean.artAtividade || '',
    pecas_tecnicas: (clean.pecasTecnicas || []).join(' | '),
    pecas_tecnicas_outro: clean.pecasTecnicasOutro || '',
    classificacao_barragem: clean.classificacaoBarragem || '',
    classificacao_dpa: clean.classificacaoDPA || '',
    classificacao_cri: clean.classificacaoCRI || '',
    portaria_classificacao: clean.portariaClassificacao || '',
    parecer_classificacao: clean.parecerClassificacao || '',
    tem_oficio_pendencia: Boolean(clean.temOficioPendencia),
    oficio_id: clean.oficioId || '',
    analise_tecnica: clean.analiseTecnica || '',
    conclusao: clean.conclusao || '',
    introducao_particularidade: clean.introducaoParticularidade || '',
    apresentacao_relatorio_conclusao: clean.apresentacaoRelatorioConclusao || '',
    dpa_nao_pnsb_texto: clean.dpaNaoPnsbTexto || '',
    topicos_extras_texto: serializeTopicosExtras(clean.topicosExtras),
    revisao_parecer_custom: clean.revisaoParecer || '',
    source_system: clean.sourceSystem || CURRENT_SYSTEM_ID,
    created_at: createdAt,
    updated_at: now,
  };
}

export function hydrateParecerRow(row: Record<string, any>): ParecerData {
  // Already camelCase legacy local object? Normalize missing defaults seamlessly
  const isSnake = 'num_parecer_tecnico' in row || 'empreendedor_nome' in row || 'analistas_nomes' in row;
  const cache = readAdministraCache();

  const empId = row.empreendedor_id ?? row.empreendedorId ?? '';
  const barId = row.barragem_id ?? row.barragemId ?? '';
  const emp = empId ? cache.empsById.get(empId) : undefined;
  const bar = barId ? cache.barsById.get(barId) : undefined;

  const rtNamesRaw = isSnake
    ? splitDelimited(row.responsavel_tecnico_nomes, '|')
    : [
        ...(Array.isArray(row.responsaveisTecnicos) ? row.responsaveisTecnicos : []),
        ...(Array.isArray(row.rtOutros) ? row.rtOutros : []),
      ];
  const responsaveisTecnicos = rtNamesRaw.filter((n) => OPS_RESPONSAVEL_TECNICO.includes(n));
  const rtOutros = rtNamesRaw.filter((n) => n && !OPS_RESPONSAVEL_TECNICO.includes(n));

  const analistas = isSnake
    ? splitAnalistas(row.analistas_nomes)
    : Array.isArray(row.analistas)
      ? row.analistas
      : row.analista
        ? [row.analista]
        : [];
  const analistasOutros = isSnake
    ? splitAnalistas(row.analistas_outros)
    : Array.isArray(row.analistasOutros)
      ? row.analistasOutros
      : [];

  const coords =
    row.coordenadasGMS && typeof row.coordenadasGMS === 'object'
      ? row.coordenadasGMS
      : row.lat_gms || row.long_gms
        ? stringsToCoordenadasGms(row.lat_gms, row.long_gms)
        : bar?.coordenadasGMS || { lat: { g: '', m: '', s: '' }, long: { g: '', m: '', s: '' } };

  const rtIds = isSnake
    ? splitDelimited(row.responsavel_tecnico_ids, ',')
    : Array.isArray(row.responsavelTecnicoIds)
      ? row.responsavelTecnicoIds
      : [];

  const firstRt = rtIds[0] ? cache.rtsById.get(rtIds[0]) : undefined;

  const base: ParecerData = {
    id: row.id,
    userId: row.user_id ?? row.userId ?? undefined,
    tipo_documento: (row.tipo_documento || 'Parecer Técnico') as any,
    numParecerTecnico: row.num_parecer_tecnico ?? row.numParecerTecnico ?? '',
    processo: row.processo ?? '',
    numProtocoloAnalisado: row.num_protocolo_analisado ?? row.numProtocoloAnalisado ?? '',
    dataParecer: row.data_parecer ?? row.dataParecer ?? row.data ?? '',
    data: row.data_parecer ?? row.data ?? row.dataParecer ?? '',
    dataRecebimentoProcesso: row.data_recebimento_processo ?? row.dataRecebimentoProcesso ?? '',
    dataProtocolo: row.data_protocolo ?? row.dataProtocolo ?? '',
    dataInspecao: row.data_inspecao ?? row.dataInspecao ?? '',
    status: (row.status || 'Rascunho') as any,
    analista: row.analista ?? analistas[0] ?? '',
    analistas,
    analistasOutros,
    temAnalistaOutro: analistasOutros.length > 0 || Boolean(row.temAnalistaOutro),
    empreendedorId: empId || undefined,
    identificacaoEmpreendedor:
      row.empreendedor_nome ?? row.identificacaoEmpreendedor ?? emp?.nome ?? '',
    cpfCnpj: row.cpf_cnpj ?? row.cpfCnpj ?? emp?.cpfCnpj ?? '',
    logradouro: row.logradouro ?? emp?.logradouro ?? '',
    numero: row.numero ?? emp?.numero ?? '',
    complemento: row.complemento ?? emp?.complemento ?? '',
    bairro: row.bairro ?? emp?.bairro ?? '',
    cidadeUf: row.cidadeUf ?? (emp?.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : ''),
    cep: row.cep ?? emp?.cep ?? '',
    numCarMt: row.car_mt ?? row.numCarMt ?? emp?.carMt ?? '',
    barragemId: barId || undefined,
    nomeBarragem: row.barragem_nome ?? row.nomeBarragem ?? bar?.nomeBarragem ?? '',
    localizacaoEmpreendimento:
      row.localizacaoEmpreendimento ?? row.barragem_nome ?? bar?.nomeBarragem ?? '',
    snisb: row.codigo_snisb ?? row.snisb ?? bar?.codigoSnisb ?? '',
    municipio: row.municipio ?? bar?.municipio ?? OPS_MUNICIPIOS[0],
    coordenadasGMS: coords,
    usoPreponderante: row.usoPreponderante ?? bar?.usoPreponderante ?? '',
    situacaoEmpreendimento: row.situacaoEmpreendimento ?? bar?.situacaoEmpreendimento ?? '',
    tipoBarragem: row.tipoBarragem ?? bar?.tipoBarragem ?? '',
    nomeCursoAguaBarrado: row.nomeCursoAguaBarrado ?? bar?.cursoAguaBarrado ?? '',
    alturaBarragem: row.alturaBarragem ?? bar?.altura ?? '',
    volumeBarragem: row.volumeBarragem ?? bar?.volume ?? '',
    larguraCoroamento: row.larguraCoroamento ?? bar?.larguraCoroamento ?? '',
    comprimentoCoroamento: row.comprimentoCoroamento ?? bar?.comprimentoCoroamento ?? '',
    responsavelTecnicoIds: rtIds.length > 0 ? rtIds : undefined,
    responsavelTecnico: row.responsavelTecnico ?? rtNamesRaw.join(', ') ?? '',
    responsaveisTecnicos,
    rtOutros,
    temRTOutro: rtOutros.length > 0 || Boolean(row.temRTOutro),
    cpfRT: row.cpfRT ?? firstRt?.cpf ?? '',
    formacaoProfissionalRT: row.formacaoProfissionalRT ?? firstRt?.formacaoProfissional ?? '',
    registroProfissionalRT: row.registroProfissionalRT ?? firstRt?.registroProfissional ?? '',
    artCreaMt: row.art_numero ?? row.artCreaMt ?? '',
    numArt: row.art_numero ?? row.numArt ?? '',
    artAtividade: row.art_atividade ?? row.artAtividade ?? 'Inspeção de Segurança de Barragem',
    pecasTecnicas: isSnake
      ? splitDelimited(row.pecas_tecnicas, '|')
      : Array.isArray(row.pecasTecnicas)
        ? row.pecasTecnicas
        : [],
    pecasTecnicasOutro: row.pecas_tecnicas_outro ?? row.pecasTecnicasOutro ?? '',
    classificacaoBarragem:
      row.classificacao_barragem ?? row.classificacaoBarragem ?? bar?.classificacaoBarragem ?? '',
    classificacaoDPA:
      row.classificacao_dpa ?? row.classificacaoDPA ?? bar?.classificacaoDPA ?? '',
    classificacaoCRI:
      row.classificacao_cri ?? row.classificacaoCRI ?? bar?.classificacaoCRI ?? '',
    portariaClassificacao:
      row.portaria_classificacao ?? row.portariaClassificacao ?? bar?.portariaClassificacao ?? '',
    parecerClassificacao:
      row.parecer_classificacao ?? row.parecerClassificacao ?? bar?.parecerClassificacao ?? '',
    temOficioPendencia: Boolean(row.tem_oficio_pendencia ?? row.temOficioPendencia),
    oficioId: row.oficio_id ?? row.oficioId ?? undefined,
    analiseTecnica: row.analise_tecnica ?? row.analiseTecnica ?? '',
    conclusao: row.conclusao ?? '',
    introducaoParticularidade:
      row.introducao_particularidade ?? row.introducaoParticularidade ?? '',
    apresentacaoRelatorioConclusao:
      row.apresentacao_relatorio_conclusao ?? row.apresentacaoRelatorioConclusao ?? '',
    dpaNaoPnsbTexto: row.dpa_nao_pnsb_texto ?? row.dpaNaoPnsbTexto ?? '',
    topicosExtras: parseTopicosExtras(row.topicos_extras_texto ?? row.topicosExtras),
    revisaoParecer: row.revisao_parecer_custom ?? row.revisaoParecer ?? '',
    sourceSystem: (row.source_system ?? row.sourceSystem ?? CURRENT_SYSTEM_ID) as any,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  };

  if (!base.revisaoParecer) {
    base.revisaoParecer = buildParecerRevisaoText(base);
  }

  return base;
}

export function serializeOficioFlat(data: OficioData, id: string, now: string, createdAt: string) {
  const clean = sanitizeObject(stripSensitiveFields(data));
  const { lat, long } = coordenadasGmsToStrings(clean.coordenadasGMS);
  const rtAll = [
    ...(clean.responsaveisTecnicos || []),
    ...(clean.rtOutros || []).filter((n) => n && n.trim()),
  ];
  const analistas = clean.analistas || [];
  const analistasOutros = (clean.analistasOutros || []).filter((n) => n && n.trim());

  return {
    id,
    user_id: clean.userId || null,
    tipo_documento: clean.tipo_documento || '1° Oficio de Pendencias',
    protocolo: clean.protocolo || '',
    processo: clean.processo || clean.protocolo || '',
    assunto: clean.assunto || 'Ofício de Pendências - Segurança de Barragens',
    data_emissao: clean.dataEmissao || now.split('T')[0],
    status: clean.status || 'Rascunho',
    situacao_cumprimento: clean.situacaoCumprimento || 'Pendente / Em aberto',
    prazo_cumprimento: Number(clean.prazoCumprimento) || 90,
    prorrogacao_prazo: Number(clean.prorrogacaoPrazo) || 0,
    analista: analistas[0] || analistasOutros[0] || getSessionAnalystFallback(),
    analistas_nomes: analistas.join(' | '),
    analistas_outros: analistasOutros.join(' | '),
    empreendedor_id: clean.empreendedorId || '',
    empreendedor_nome: clean.interessado || '',
    cpf_cnpj: clean.cpfCnpj || '',
    barragem_id: clean.barragemId || '',
    barragem_nome: clean.empreendimento || '',
    municipio: clean.municipio || '',
    lat_gms: lat,
    long_gms: long,
    responsavel_tecnico_ids: (clean.responsavelTecnicoIds || []).join(','),
    responsavel_tecnico_nomes: rtAll.join(' | '),
    art_numero: clean.art || '',
    pendencias_texto: serializePendencias(clean.pendencias),
    anotacoes_internas: clean.anotacoesInternas || '',
    source_system: clean.sourceSystem || CURRENT_SYSTEM_ID,
    created_at: createdAt,
    updated_at: now,
  };
}

export function hydrateOficioRow(row: Record<string, any>): OficioData {
  const isSnake = 'data_emissao' in row || 'empreendedor_nome' in row || 'pendencias_texto' in row;
  const cache = readAdministraCache();

  const empId = row.empreendedor_id ?? row.empreendedorId ?? '';
  const barId = row.barragem_id ?? row.barragemId ?? '';
  const emp = empId ? cache.empsById.get(empId) : undefined;
  const bar = barId ? cache.barsById.get(barId) : undefined;

  const rtNamesRaw = isSnake
    ? splitDelimited(row.responsavel_tecnico_nomes, '|')
    : [
        ...(Array.isArray(row.responsaveisTecnicos) ? row.responsaveisTecnicos : []),
        ...(Array.isArray(row.rtOutros) ? row.rtOutros : []),
      ];
  const responsaveisTecnicos = rtNamesRaw.filter((n) => OPS_RESPONSAVEL_TECNICO.includes(n));
  const rtOutros = rtNamesRaw.filter((n) => n && !OPS_RESPONSAVEL_TECNICO.includes(n));

  const analistas = isSnake
    ? splitAnalistas(row.analistas_nomes)
    : Array.isArray(row.analistas)
      ? row.analistas
      : row.analista
        ? [row.analista]
        : [];
  const analistasOutros = isSnake
    ? splitAnalistas(row.analistas_outros)
    : Array.isArray(row.analistasOutros)
      ? row.analistasOutros
      : [];

  const coords =
    row.coordenadasGMS && typeof row.coordenadasGMS === 'object'
      ? row.coordenadasGMS
      : row.lat_gms || row.long_gms
        ? stringsToCoordenadasGms(row.lat_gms, row.long_gms)
        : bar?.coordenadasGMS || { lat: { g: '', m: '', s: '' }, long: { g: '', m: '', s: '' } };

  return {
    id: row.id,
    userId: row.user_id ?? row.userId ?? undefined,
    tipo_documento: (row.tipo_documento || '1° Oficio de Pendencias') as any,
    protocolo: row.protocolo ?? '',
    processo: row.processo ?? row.protocolo ?? '',
    assunto: row.assunto ?? 'Ofício de Pendências - Segurança de Barragens',
    dataEmissao: row.data_emissao ?? row.dataEmissao ?? '',
    status: (row.status || 'Rascunho') as any,
    situacaoCumprimento: (row.situacao_cumprimento ?? row.situacaoCumprimento ?? 'Pendente / Em aberto') as any,
    prazoCumprimento: Number(row.prazo_cumprimento ?? row.prazoCumprimento ?? 90),
    prorrogacaoPrazo: Number(row.prorrogacao_prazo ?? row.prorrogacaoPrazo ?? 0),
    analistas,
    analistasOutros,
    temAnalistaOutro: analistasOutros.length > 0 || Boolean(row.temAnalistaOutro),
    empreendedorId: empId || undefined,
    interessado: row.empreendedor_nome ?? row.interessado ?? emp?.nome ?? '',
    cpfCnpj: row.cpf_cnpj ?? row.cpfCnpj ?? emp?.cpfCnpj ?? '',
    logradouro: row.logradouro ?? emp?.logradouro ?? '',
    numero: row.numero ?? emp?.numero ?? '',
    complemento: row.complemento ?? emp?.complemento ?? '',
    bairro: row.bairro ?? emp?.bairro ?? '',
    cidadeUf: row.cidadeUf ?? (emp?.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : ''),
    cep: row.cep ?? emp?.cep ?? '',
    barragemId: barId || undefined,
    empreendimento: row.barragem_nome ?? row.empreendimento ?? bar?.nomeBarragem ?? '',
    municipio: row.municipio ?? bar?.municipio ?? OPS_MUNICIPIOS[0],
    coordenadasGMS: coords,
    responsavelTecnicoIds: isSnake
      ? splitDelimited(row.responsavel_tecnico_ids, ',')
      : row.responsavelTecnicoIds,
    responsaveisTecnicos,
    rtOutros,
    temRTOutro: rtOutros.length > 0 || Boolean(row.temRTOutro),
    art: row.art_numero ?? row.art ?? '',
    pendencias: parsePendencias(row.pendencias_texto ?? row.pendencias),
    anotacoesInternas: row.anotacoes_internas ?? row.anotacoesInternas ?? '',
    sourceSystem: (row.source_system ?? row.sourceSystem ?? CURRENT_SYSTEM_ID) as any,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  };
}

export function serializeNotificacaoFlat(
  data: NotificacaoData,
  id: string,
  now: string,
  createdAt: string
) {
  const clean = sanitizeObject(stripSensitiveFields(data));
  const analistas = clean.analistas || [];
  const barragens = Array.isArray(clean.barragens) ? clean.barragens : [];
  const barragemIdsList = Array.from(
    new Set(
      [
        ...(clean.barragemIds || []),
        ...barragens.map((b) => b.barragemId).filter((v): v is string => Boolean(v)),
        ...(clean.barragemId ? [clean.barragemId] : []),
      ].filter(Boolean)
    )
  );
  const barragensNomes = barragens
    .map((b) => (b.nome || '').trim())
    .filter(Boolean)
    .join(' | ');

  return {
    id,
    user_id: clean.userId || null,
    tipo_documento: 'Notificação',
    notificacao_gerada: clean.notificacaoGerada || '',
    oficio_gerado: clean.oficioGerado || '',
    num_processo: clean.numProcesso || '',
    data_notificacao: clean.dataNotificacao || now.split('T')[0],
    prazo_vencimento: String(clean.prazoVencimento || '90'),
    situacao: clean.situacao || 'Em aberto',
    status: clean.status || 'Rascunho',
    analista: clean.analista || analistas[0] || getSessionAnalystFallback(),
    analistas_nomes: analistas.join(' | '),
    empreendedor_id: clean.empreendedorId || '',
    empreendedor_nome: clean.empreendedorNome || '',
    tipo_documento_identificacao: clean.tipoDocumentoIdentificacao || 'CPF',
    cpf_cnpj: clean.documentoIdentificacao || '',
    car_mt: clean.carMt || '',
    barragem_id: barragemIdsList[0] || clean.barragemId || '',
    barragem_ids: barragemIdsList.join(','),
    barragem_nome: clean.nomeFantasia || barragens[0]?.nome || '',
    barragens_nomes: barragensNomes || clean.nomeFantasia || '',
    coordenadas_resumo: formatBarragensSummary(barragens),
    municipio: clean.municipioEmpreendimento || '',
    lat_gms: barragens[0]?.lat || clean.lat || '',
    long_gms: barragens[0]?.long || clean.long || '',
    objetivo:
      clean.objetivo ||
      'Notificação para o cadastro e a classificação do Dano Potencial Associado e Categoria de Risco, para barragens.',
    anotacoes_internas: clean.anotacoesInternas || '',
    // Keep DB light: store notification text ONLY if user manually customized it
    texto_notificacao_custom: clean.textoNotificacaoCustomizado ? clean.textoNotificacao || '' : '',
    source_system: clean.sourceSystem || CURRENT_SYSTEM_ID,
    created_at: createdAt,
    updated_at: now,
  };
}

export function hydrateNotificacaoRow(row: Record<string, any>): NotificacaoData {
  const isSnake =
    'notificacao_gerada' in row || 'num_processo' in row || 'coordenadas_resumo' in row;
  const cache = readAdministraCache();

  const empId = row.empreendedor_id ?? row.empreendedorId ?? '';
  const barId = row.barragem_id ?? row.barragemId ?? '';
  const emp = empId ? cache.empsById.get(empId) : undefined;
  const bar = barId ? cache.barsById.get(barId) : undefined;

  const analistas = isSnake
    ? splitAnalistas(row.analistas_nomes)
    : Array.isArray(row.analistas)
      ? row.analistas
      : row.analista
        ? [row.analista]
        : [];

  const barragemIdsList = isSnake
    ? splitDelimited(row.barragem_ids, ',')
    : Array.isArray(row.barragemIds)
      ? row.barragemIds
      : barId
        ? [barId]
        : [];

  const barragens =
    Array.isArray(row.barragens) && row.barragens.length > 0
      ? row.barragens
      : parseBarragensSummary(
          row.coordenadas_resumo,
          row.lat_gms ?? row.lat,
          row.long_gms ?? row.long,
          row.barragem_ids ?? barId,
          row.barragem_nome ?? row.nomeFantasia ?? bar?.nomeBarragem
        );

  const customText = row.texto_notificacao_custom ?? '';
  const legacyText = row.textoNotificacao ?? '';
  const isCustom = Boolean(customText) || Boolean(row.textoNotificacaoCustomizado);

  const base: NotificacaoData = {
    id: row.id,
    userId: row.user_id ?? row.userId ?? undefined,
    tipo_documento: 'Notificação',
    notificacaoGerada: row.notificacao_gerada ?? row.notificacaoGerada ?? '',
    oficioGerado: row.oficio_gerado ?? row.oficioGerado ?? '',
    numProcesso: row.num_processo ?? row.numProcesso ?? '',
    dataNotificacao: row.data_notificacao ?? row.dataNotificacao ?? '',
    prazoVencimento: String(row.prazo_vencimento ?? row.prazoVencimento ?? '90'),
    situacao: (row.situacao ?? 'Em aberto') as any,
    status: (row.status ?? 'Rascunho') as any,
    analista: row.analista ?? analistas[0] ?? '',
    analistas,
    empreendedorId: empId || undefined,
    empreendedorNome: row.empreendedor_nome ?? row.empreendedorNome ?? emp?.nome ?? '',
    tipoDocumentoIdentificacao:
      (row.tipo_documento_identificacao ??
        row.tipoDocumentoIdentificacao ??
        emp?.tipoPessoa ??
        'CPF') as 'CPF' | 'CNPJ',
    documentoIdentificacao: row.cpf_cnpj ?? row.documentoIdentificacao ?? emp?.cpfCnpj ?? '',
    logradouro: row.logradouro ?? emp?.logradouro ?? '',
    numero: row.numero ?? emp?.numero ?? '',
    complemento: row.complemento ?? emp?.complemento ?? '',
    bairro: row.bairro ?? emp?.bairro ?? '',
    municipioCorrespondencia:
      row.municipioCorrespondencia ?? (emp?.municipio ? `${emp.municipio}/${emp.uf || 'MT'}` : ''),
    ufCorrespondencia: row.ufCorrespondencia ?? emp?.uf ?? 'MT',
    cepCorrespondencia: row.cepCorrespondencia ?? emp?.cep ?? '',
    telefone: row.telefone ?? emp?.telefone ?? '',
    carMt: row.car_mt ?? row.carMt ?? emp?.carMt ?? '',
    barragemId: barId || barragemIdsList[0] || undefined,
    barragemIds: barragemIdsList,
    nomeFantasia: row.barragem_nome ?? row.nomeFantasia ?? bar?.nomeBarragem ?? '',
    atividade: row.atividade ?? 'Barragem',
    enderecoEmpreendimento: row.enderecoEmpreendimento ?? '',
    municipioEmpreendimento:
      row.municipio ?? row.municipioEmpreendimento ?? bar?.municipio ?? OPS_MUNICIPIOS[0],
    cepEmpreendimento: row.cepEmpreendimento ?? '',
    lat: barragens[0]?.lat ?? row.lat_gms ?? row.lat ?? '',
    long: barragens[0]?.long ?? row.long_gms ?? row.long ?? '',
    barragens,
    objetivo:
      row.objetivo ??
      'Notificação para o cadastro e a classificação do Dano Potencial Associado e Categoria de Risco, para barragens.',
    anotacoesInternas: row.anotacoes_internas ?? row.anotacoesInternas ?? '',
    textoNotificacao: isCustom ? customText || legacyText : '',
    textoNotificacaoCustomizado: isCustom,
    textoSigaDoc: '',
    sourceSystem: (row.source_system ?? row.sourceSystem ?? CURRENT_SYSTEM_ID) as any,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  };

  if (!base.textoNotificacao) {
    base.textoNotificacao = buildNotificacaoText(base);
  }
  base.textoSigaDoc = buildNotificacaoSigaDocText(base);

  return base;
}

// =========================================================================
// REPOSITORY STORAGE & REMOTE SYNC
// =========================================================================

function readCollection<T>(primaryKey: string, legacyKey?: string): T[] {
  try {
    const raw = localStorage.getItem(primaryKey);
    const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : null;
    const primary = raw ? safeJsonParse<unknown[]>(raw, []) : [];
    const legacy = legacyRaw ? safeJsonParse<unknown[]>(legacyRaw, []) : [];
    const listPrimary = Array.isArray(primary) ? (primary as T[]) : [];
    const listLegacy = Array.isArray(legacy) ? (legacy as T[]) : [];
    if (listLegacy.length === 0) return listPrimary;
    if (listPrimary.length === 0) return listLegacy;

    const seen = new Set(listPrimary.map((item: any) => item?.id).filter(Boolean));
    return [...listPrimary, ...listLegacy.filter((item: any) => !item?.id || !seen.has(item.id))];
  } catch (err) {
    console.warn(`Erro ao ler ${primaryKey} do armazenamento local:`, err);
  }
  return [];
}

function writeCollection<T>(primaryKey: string, items: T[]): void {
  try {
    const cleaned = items.map((item) => stripSensitiveFields(item));
    localStorage.setItem(primaryKey, JSON.stringify(cleaned));
  } catch (err) {
    console.warn(`Erro ao salvar ${primaryKey} no armazenamento local:`, err);
  }
}

async function parseDocErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const payload = await res.json();
    if (payload?.error) return String(payload.error);
    if (payload?.message) return String(payload.message);
  } catch {
    // Ignore non-JSON error body
  }
  return fallback;
}

async function fetchRemoteCollection<T extends { id?: string }>(
  kind: 'pareceres' | 'oficios' | 'notificacoes'
): Promise<T[]> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return [];
  }
  try {
    const res = await authFetch(`/api/documents/${kind}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? (data.items as T[]) : [];
  } catch {
    return [];
  }
}

async function syncRemoteDocument(
  kind: 'pareceres' | 'oficios' | 'notificacoes',
  flatDoc: Record<string, any>
): Promise<void> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }
  const res = await authFetch(`/api/documents/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stripSensitiveFields(flatDoc)),
  });
  if (!res.ok) {
    throw new Error(await parseDocErrorMessage(res, `Falha ao sincronizar documento remoto (HTTP ${res.status}).`));
  }
}

async function deleteRemoteDocument(
  kind: 'pareceres' | 'oficios' | 'notificacoes',
  id: string
): Promise<void> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }
  const res = await authFetch(`/api/documents/${kind}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(await parseDocErrorMessage(res, `Falha ao excluir documento remoto (HTTP ${res.status}).`));
  }
}

function mergeDocs<T extends { id?: string; updated_at?: string }>(local: T[], remote: T[]): T[] {
  if (remote.length === 0) return local;
  const map = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const prevTs = new Date(prev.updated_at || 0).getTime();
    const nextTs = new Date(item.updated_at || 0).getTime();
    if (nextTs >= prevTs) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export class LocalDocumentRepository implements DocumentRepository {
  async getPareceres(): Promise<ParecerData[]> {
    const localRaw = readCollection<Record<string, any>>(
      STORAGE_KEYS.PARECERES,
      STORAGE_KEYS.LEGACY_PARECERES
    );
    const remoteRaw = await fetchRemoteCollection<Record<string, any>>('pareceres');
    return mergeDocs(localRaw.map(hydrateParecerRow), remoteRaw.map(hydrateParecerRow));
  }

  async saveParecer(data: ParecerData): Promise<ParecerData> {
    const now = new Date().toISOString();
    const cleanData = sanitizeObject(stripSensitiveFields(data));
    const id = cleanData.id
      ? assertSafeId(cleanData.id, 'ID do parecer')
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `parecer_${Date.now()}`;

    const current = readCollection<Record<string, any>>(
      STORAGE_KEYS.PARECERES,
      STORAGE_KEYS.LEGACY_PARECERES
    );
    const existing = current.find((item) => item.id === id);
    const createdAt = existing?.created_at || cleanData.created_at || now;

    // Persist lean flat row remotely first, then locally
    const flatRow = serializeParecerFlat(cleanData, id, now, createdAt);
    await syncRemoteDocument('pareceres', flatRow);
    const updated = [flatRow, ...current.filter((item) => item.id !== id)];
    writeCollection(STORAGE_KEYS.PARECERES, updated);

    return hydrateParecerRow(flatRow);
  }

  async deleteParecer(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID do parecer');
    await deleteRemoteDocument('pareceres', safeId);
    const current = readCollection<Record<string, any>>(
      STORAGE_KEYS.PARECERES,
      STORAGE_KEYS.LEGACY_PARECERES
    );
    const updated = current.filter((item) => item.id !== safeId);
    writeCollection(STORAGE_KEYS.PARECERES, updated);
  }

  async getOficios(): Promise<OficioData[]> {
    const localRaw = readCollection<Record<string, any>>(
      STORAGE_KEYS.OFICIOS,
      STORAGE_KEYS.LEGACY_OFICIOS
    );
    const remoteRaw = await fetchRemoteCollection<Record<string, any>>('oficios');
    return mergeDocs(localRaw.map(hydrateOficioRow), remoteRaw.map(hydrateOficioRow));
  }

  async saveOficio(data: OficioData): Promise<OficioData> {
    const now = new Date().toISOString();
    const cleanData = sanitizeObject(stripSensitiveFields(data));
    const id = cleanData.id
      ? assertSafeId(cleanData.id, 'ID do ofício')
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `oficio_${Date.now()}`;

    const current = readCollection<Record<string, any>>(
      STORAGE_KEYS.OFICIOS,
      STORAGE_KEYS.LEGACY_OFICIOS
    );
    const existing = current.find((item) => item.id === id);
    const createdAt = existing?.created_at || cleanData.created_at || now;

    const flatRow = serializeOficioFlat(cleanData, id, now, createdAt);
    await syncRemoteDocument('oficios', flatRow);
    const updated = [flatRow, ...current.filter((item) => item.id !== id)];
    writeCollection(STORAGE_KEYS.OFICIOS, updated);

    return hydrateOficioRow(flatRow);
  }

  async deleteOficio(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID do ofício');
    await deleteRemoteDocument('oficios', safeId);
    const current = readCollection<Record<string, any>>(
      STORAGE_KEYS.OFICIOS,
      STORAGE_KEYS.LEGACY_OFICIOS
    );
    const updated = current.filter((item) => item.id !== safeId);
    writeCollection(STORAGE_KEYS.OFICIOS, updated);
  }

  async getNotificacoes(): Promise<NotificacaoData[]> {
    const localRaw = readCollection<Record<string, any>>(
      STORAGE_KEYS.NOTIFICACOES,
      STORAGE_KEYS.LEGACY_NOTIFICACOES
    );
    const remoteRaw = await fetchRemoteCollection<Record<string, any>>('notificacoes');
    return mergeDocs(localRaw.map(hydrateNotificacaoRow), remoteRaw.map(hydrateNotificacaoRow));
  }

  async saveNotificacao(data: NotificacaoData): Promise<NotificacaoData> {
    const now = new Date().toISOString();
    const cleanData = sanitizeObject(stripSensitiveFields(data));
    const id = cleanData.id
      ? assertSafeId(cleanData.id, 'ID da notificação')
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `notif_${Date.now()}`;

    const current = readCollection<Record<string, any>>(
      STORAGE_KEYS.NOTIFICACOES,
      STORAGE_KEYS.LEGACY_NOTIFICACOES
    );
    const existing = current.find((item) => item.id === id);
    const createdAt = existing?.created_at || cleanData.created_at || now;

    const flatRow = serializeNotificacaoFlat(cleanData, id, now, createdAt);
    await syncRemoteDocument('notificacoes', flatRow);
    const updated = [flatRow, ...current.filter((item) => item.id !== id)];
    writeCollection(STORAGE_KEYS.NOTIFICACOES, updated);

    return hydrateNotificacaoRow(flatRow);
  }

  async deleteNotificacao(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID da notificação');
    await deleteRemoteDocument('notificacoes', safeId);
    const current = readCollection<Record<string, any>>(
      STORAGE_KEYS.NOTIFICACOES,
      STORAGE_KEYS.LEGACY_NOTIFICACOES
    );
    const updated = current.filter((item) => item.id !== safeId);
    writeCollection(STORAGE_KEYS.NOTIFICACOES, updated);
  }

  async getFiscalizacoes(): Promise<FiscalizacaoData[]> {
    return readCollection<FiscalizacaoData>(
      STORAGE_KEYS.FISCALIZACOES,
      STORAGE_KEYS.LEGACY_FISCALIZACOES
    );
  }

  async deleteFiscalizacao(id: string): Promise<void> {
    const safeId = assertSafeId(id, 'ID da fiscalização');
    const current = readCollection<FiscalizacaoData>(
      STORAGE_KEYS.FISCALIZACOES,
      STORAGE_KEYS.LEGACY_FISCALIZACOES
    );
    const updated = current.filter((item) => item.id !== safeId);
    writeCollection(STORAGE_KEYS.FISCALIZACOES, updated);
  }
}
