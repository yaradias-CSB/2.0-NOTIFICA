import { EcosystemSystemId } from './types/ecosystem';

export enum RiscoEnum {
  BAIXO = 'Baixa',
  MEDIO = 'Média',
  ALTO = 'Alta'
}

export enum DanoEnum {
  BAIXO = 'Baixo',
  MEDIO = 'Médio',
  ALTO = 'Alto'
}

export interface ClassificacaoData {
  // Volume (4.1)
  dpa1Select: string; // The selected string from OPS_DPA1_VOLUME
  
  // DPA (4.2)
  dpa2Select: string; // Selection for Construções a jusante
  
  dpa3Select: string;
  dpa4Select: string;
  
  // Scores DPA
  scoreDpa1: number;
  scoreDpa2: number;
  scoreDpa3: number;
  scoreDpa4: number;
  totalDpa: number;
  dpaClass: DanoEnum; // Baixo, Medio, Alto calculated
  
  rupturaTexto: string;
  legendaDPA: string;

  // CRI (4.3)
  criPreClassificacao: boolean;

  // Caracteristicas Tecnicas (CT)
  scoreCt1: number; // Altura (calc from sec 3)
  scoreCt2: number; // Comprimento (calc from sec 3)
  scoreCt3: number; // Tipo (from sec 3)
  scoreCt4: number; // Fundacao (from sec 3)
  scoreCt5: number; // Idade (from sec 3)
  ct6Select: string; // Vazao
  scoreCt6: number;

  // Estado de Conservacao (EC)
  ec1Select: string; scoreEc1: number;
  ec2Select: string; scoreEc2: number;
  ec3Select: string; scoreEc3: number;
  ec4Select: string; scoreEc4: number;
  ec5Select: string; scoreEc5: number;

  // Plano de Seguranca (PS)
  ps1Select: string; scorePs1: number;
  ps2Select: string; scorePs2: number;
  ps3Select: string; scorePs3: number;
  ps4Select: string; scorePs4: number;
  ps5Select: string; scorePs5: number;
  ps6Select: string; scorePs6: number;

  // CRI Computed Indicators
  totalCT: number;
  totalEC: number;
  totalPS: number;
  
  riskGeral: RiscoEnum;
  valGeral: number;

  riskPercolacao: RiscoEnum;
  valPercolacao: number;

  riskGalgamento: RiscoEnum;
  valGalgamento: number;

  riskGerencial: RiscoEnum;
  valGerencial: number;

  // Legacy/Final
  risco: RiscoEnum; // Final calculated CRI
  resumo: string; // Resumo da classificação (ex: Categoria B)
}

export interface DocItem {
  id: string;
  label: string;
  checked: boolean;
  pageNumber: string; // "Fls. 123"
  extraInput?: string; // For Names, ART numbers, etc.
  extraSelect?: string; // For ART activity type if needed
}

export interface EstruturaHidraulica {
  id: string;
  descricao: string; // "Estrutura Hidráulica 01"
  vazao: string;
  cotaSoleira: string;
  localizacao: string;
  seguranca: string;
}

export interface BarramentoData {
  id: string;
  nome: string;
  snisb: string;
  lat: string;
  long: string;
  alturaMaxima: string;
  alturaMaximaFls: string;
  bordaLivre: string;
  bordaLivreFls: string;
  cotaCoroamento: string;
  cotaCoroamentoFls: string;
  comprimentoCoroamento: string;
  comprimentoCoroamentoFls: string;
  larguraCoroamento: string;
  larguraCoroamentoFls: string;
  tipoEstrutural: string;
  tipoFundacao: string;
  
  idade: string;
  scoreIdade: number;

  // Reservatório
  cotaNNO: string;
  cotaNMM: string;
  areaNNO: string;
  areaNMM: string;
  volumeNMO: string;
  volumeNMM: string;
  
  vazaoMaxima: string; // m3/s /TR
  
  estruturas: EstruturaHidraulica[];

  // Adequações (Moved from EstruturaHidraulica)
  possuiAdequacao: boolean;
  adequacaoVazao?: string;
  adequacaoCota?: string;
  adequacaoLocalizacao?: string;
  adequacaoVazaoRemanescente?: string;
  adequacaoSeguranca?: string;
}

export interface ResponsavelTecnico {
  id: string;
  nome: string;
  art: string;
}

export interface ParecerData {
  id?: string;
  userId?: string;
  
  // 1. Informações Gerais
  processo: string;
  dataRecebimentoProcesso?: string;
  identificacaoEmpreendedor: string;
  cpfCnpj: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidadeUf: string;
  cep: string;
  localizacaoEmpreendimento: string;
  coordenadasGMS: CoordenadasGMS;
  municipio: string;
  responsavelTecnico: string;
  responsaveisTecnicos?: string[];
  rtOutros?: string[];
  temRTOutro?: boolean;
  artCreaMt: string;
  numCarMt: string;
  numArt: string;
  usoPreponderante: string;
  usoPreponderanteOutro?: string;
  classificacaoBarragem: string;
  nomeBarragem: string;
  situacaoEmpreendimento: string;
  situacaoEmpreendimentoOutro?: string;
  tipoBarragem: string;
  tipoBarragemOutro?: string;
  nomeCursoAguaBarrado: string;
  portariaClassificacao: string;
  parecerClassificacao: string;
  numProtocoloAnalisado: string;
  dataProtocolo: string;
  artAtividade: string;
  classificacaoDPA: string;
  classificacaoCRI: string;
  dataInspecao: string;
  snisb: string;
  alturaBarragem: string;
  volumeBarragem: string;
  larguraCoroamento: string;
  comprimentoCoroamento: string;
  analistas: string[]; // Multi-select
  analista?: string; // Author/analyst name
  analistasOutros?: string[]; // Múltiplos outros analistas
  temAnalistaOutro?: boolean;

  // Responsabilidade Técnica (Novos campos)
  cpfRT?: string;
  formacaoProfissionalRT?: string;
  registroProfissionalRT?: string;

  // Trâmites Administrativos (Novos campos)
  numParecerTecnico?: string;
  dataParecer?: string;

  // 2. Peças Técnicas para Analise
  pecasTecnicas: string[]; 
  pecasTecnicasOutro?: string;
  
  // Análises Detalhadas (Checklists)
  isrAnalysis?: ISRAnalysis;
  iseAnalysis?: ISEAnalysis;
  psbAnalysis?: PSBAnalysis;
  paeAnalysis?: PAEAnalysis;
  rpsbAnalysis?: RPSBAnalysis;
  adequacoesAnalysis?: ISRAnalysis;
  outrosAnalysis?: { [key: string]: ISRAnalysis };

  // 3. Oficio de Pendencias
  temOficioPendencia: boolean;
  oficioId?: string; // Link to generated Oficio

  // 4. Análise Técnica
  analiseTecnica: string;

  // 5. Conclusão
  conclusao: string;

  // 6. Revisão do Parecer
  introducaoParticularidade: string;
  apresentacaoRelatorioConclusao: string;
  dpaNaoPnsbTexto: string;
  topicosExtras: { id: string; titulo: string; conteudo: string }[];
  revisaoParecer: string;

  // Status e Metadados
  status: 'Rascunho' | 'Concluído' | 'Ofício de Pendências';
  data?: string;
  tipo_documento?: 'Parecer Técnico' | 'Parecer Técnico de ISR' | 'Parecer Técnico de ISE' | 'Parecer Técnico de PSB' | 'Parecer Técnico de PAE' | 'Parecer Técnico de RPSB' | 'Parecer Técnico de Obras' | 'Ofício de Pendências' | '1° Oficio de Pendencias' | '2° Oficio de Pendencias' | 'Oficio Geral';
  sourceSystem?: EcosystemSystemId;
  empreendedorId?: string;
  barragemId?: string;
  responsavelTecnicoIds?: string[];
  retificadoDeId?: string;
  retificacaoJustificativa?: string;
  retificadoEm?: string;
  retificadoPorId?: string;
  retificadoPorNome?: string;
  versaoRetificacao?: number;
  created_at?: string;
  updated_at?: string;
}

export interface OficioData {
  id?: string;
  userId?: string;
  protocolo: string; // Protocolo / Processo
  processo?: string; // Processo vinculador
  dataEmissao: string; // Data de emissão do Oficio
  interessado: string; // Interessado / Empreendedor
  empreendimento: string; // Empreendimento (nome da fazenda / nome da barragem)
  municipio?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidadeUf?: string;
  cep?: string;
  assunto: string; // Assunto (pre formatado para <<Ofício de Pendências - Segurança de Barragens>>)
  coordenadasGMS: CoordenadasGMS; // Coordenadas (no mesmo formato do tópico 1)
  responsaveisTecnicos?: string[];
  rtOutros?: string[];
  temRTOutro?: boolean;
  art: string;
  pendencias: { id: string; descricao: string }[]; // Listagem de Pendencias (adicionar, editar, excluir)
  anotacoesInternas?: string; // Anotações Internas (apenas para conhecimento interno)
  prazoCumprimento: number; // Prazo para cumprimento (dias)
  prorrogacaoPrazo: number; // Prorrogação de prazo (dias)
  situacaoCumprimento: 'Pendente / Em aberto' | 'Cumprido' | 'Não cumprido no prazo' | 'Arquivado';
  analistas?: string[];
  analistasOutros?: string[];
  temAnalistaOutro?: boolean;
  cpfCnpj?: string;
  status?: 'Rascunho' | 'Concluído';
  tipo_documento?: 'Parecer Técnico' | 'Parecer Técnico de ISR' | 'Parecer Técnico de ISE' | 'Parecer Técnico de PSB' | 'Parecer Técnico de PAE' | 'Parecer Técnico de RPSB' | 'Parecer Técnico de Obras' | 'Ofício de Pendências' | '1° Oficio de Pendencias' | '2° Oficio de Pendencias' | 'Oficio Geral';
  sourceSystem?: EcosystemSystemId;
  empreendedorId?: string;
  barragemId?: string;
  responsavelTecnicoIds?: string[];
  retificadoDeId?: string;
  retificacaoJustificativa?: string;
  retificadoEm?: string;
  retificadoPorId?: string;
  retificadoPorNome?: string;
  versaoRetificacao?: number;
  created_at?: string;
  updated_at?: string;
}

export type UserRole = 'Administrador' | 'Analista' | 'Visualizador';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  matricula?: string;
}

export interface DashboardStats {
  totalPareceres: number;
  pareceresMes: number;
  pendentes: number;
}

export interface ISRItemAnalysis {
  label: string;
  parecerTecnico: boolean;
  oficioPendencias: boolean;
  analise: string;
}

export interface ISRAnalysis {
  items: ISRItemAnalysis[];
  conclusaoGeral: string;
}

export interface ISEItemAnalysis {
  label: string;
  parecerTecnico: boolean;
  oficioPendencias: boolean;
  analise: string;
}

export interface ISEAnalysis {
  items: ISEItemAnalysis[];
  conclusaoGeral: string;
}

export interface PSBItemAnalysis {
  label: string;
  parecerTecnico: boolean;
  oficioPendencias: boolean;
  analise: string;
}

export interface PSBAnalysis {
  items: PSBItemAnalysis[];
  conclusaoGeral: string;
}

export interface PAEItemAnalysis {
  label: string;
  parecerTecnico: boolean;
  oficioPendencias: boolean;
  analise: string;
}

export interface PAEAnalysis {
  items: PAEItemAnalysis[];
  conclusaoGeral: string;
}

export interface RPSBItemAnalysis {
  label: string;
  parecerTecnico: boolean;
  oficioPendencias: boolean;
  analise: string;
}

export interface RPSBAnalysis {
  items: RPSBItemAnalysis[];
  conclusaoGeral: string;
}

export interface CoordenadaGMS {
  g: string;
  m: string;
  s: string;
}

export interface CoordenadasGMS {
  lat: CoordenadaGMS;
  long: CoordenadaGMS;
}

export interface PendenciaProcessual {
  id: string;
  descricao: string;
}

export interface OficioPendenciasFiscalizacao {
  habilitado: boolean;
  pendencias: PendenciaProcessual[];
  prazoCumprimento: number; // em dias
  prorrogacaoPrazo: number; // em dias
  situacaoCumprimento: 'Pendente / Em aberto' | 'Cumprido' | 'Não cumprido no prazo' | 'Arquivado';
  dataGeracao?: string;
}

export interface FiscalizacaoData {
  id?: string;
  userId?: string;
  
  // 1. Informações Gerais
  processo: string;
  dataRecebimentoProcesso?: string;
  identificacaoEmpreendedor: string;
  cpfCnpj: string;
  localizacaoEmpreendimento: string;
  coordenadasGMS: CoordenadasGMS;
  municipio: string;
  responsavelTecnico: string;
  analista: string;
  analistaOutro?: string;
  artCreaMt: string;
  numCarMt: string;
  usoPreponderante: string;
  classificacaoBarragem: 'Classe A' | 'Classe B' | 'Classe C' | 'Classe D' | 'Não se enquadra na PNSB' | '';
  snisb: string;
  alturaBarragem: string;
  volumeBarragem: string;
  larguraCoroamento: string;
  comprimentoCoroamento: string;

  // 2. Peças Técnicas para Analise
  pecasTecnicas: string[]; 
  pecasTecnicasOutro?: string;
  
  // Análises Detalhadas (Checklists)
  isrAnalysis?: ISRAnalysis;
  iseAnalysis?: ISEAnalysis;
  psbAnalysis?: PSBAnalysis;
  paeAnalysis?: PAEAnalysis;
  rpsbAnalysis?: RPSBAnalysis;
  outrosAnalysis?: { [key: string]: ISRAnalysis }; // Generic analysis for "Outros"

  // 3. Oficio de Pendencias
  oficioPendencias: OficioPendenciasFiscalizacao;

  // 4. Análise Técnica
  analiseTecnica: string;

  // 5. Conclusão
  conclusao: string;

  // 6. Revisão do Parecer (Texto gerado)
  revisaoParecer: string;

  // Status e Metadados
  status: 'Rascunho' | 'Pendente' | 'Concluído' | 'Arquivado' | 'Ofício de Pendências';
  resultadoParecer?: 'Deferido' | 'Indeferido';
  anotacoesInternas?: string;
  data?: string;
  
  created_at?: string;
  updated_at?: string;
}

export interface AppDocument {
  id?: string;
  userId?: string;
  protocolo?: string;
  analista?: string;
  analistaOutro?: string;
  status: 'Rascunho' | 'Concluído';
  tipo_documento: 'Parecer Técnico' | 'Ofício de Pendências' | 'Notificação';
  sourceSystem?: EcosystemSystemId;
  empreendedorId?: string;
  barragemId?: string;
  responsavelTecnicoIds?: string[];
  retificadoDeId?: string;
  retificacaoJustificativa?: string;
  retificadoEm?: string;
  retificadoPorId?: string;
  retificadoPorNome?: string;
  versaoRetificacao?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface NotificacaoAntigaData {
  id: string;
  numNotificacao: string;
  cpfCnpj: string;
  empreendedor: string;
  propriedade: string;
  carMt: string;
  dataEmissao: string;
  prazo: string;
  lat: string;
  long: string;
  municipio: string;
  respostaFinal: string;
  atendida?: string;
  diasAtraso: number;
  origem: 'Antiga';
}

export interface BarragemCoordenada {
  id: string;
  barragemId?: string;
  nome?: string;
  codigoSnisb?: string;
  municipio?: string;
  usoPreponderante?: string;
  tipoBarragem?: string;
  altura?: string;
  volume?: string;
  lat: string;
  long: string;
}

export interface NotificacaoData extends AppDocument {
  // Topic 1
  empreendedorNome: string;
  tipoDocumentoIdentificacao: 'CPF' | 'CNPJ';
  documentoIdentificacao: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipioCorrespondencia: string;
  ufCorrespondencia: string;
  cepCorrespondencia: string;
  telefone: string;

  // Topic 2
  nomeFantasia: string;
  atividade: string;
  carMt?: string;
  lat: string;
  long: string;
  barragens?: BarragemCoordenada[];
  barragemIds?: string[];
  enderecoEmpreendimento: string;
  municipioEmpreendimento: string;
  cepEmpreendimento: string;

  // Topic 3
  numProcesso: string;
  prazoVencimento: string;
  objetivo: string;
  notificacaoGerada: string;
  oficioGerado: string;
  dataNotificacao: string;
  analistas?: string[];
  analistasOutros?: string[];
  temAnalistaOutro?: boolean;

  // Topic 4
  textoNotificacao: string;
  textoNotificacaoCustomizado?: boolean;

  // Topic 5
  textoSigaDoc?: string;
  anotacoesInternas?: string;

  // Situação
  situacao?: 'Em aberto' | 'Cumprida' | 'Não cumprida no prazo' | 'Arquivada';
}

export interface BarragemSNISB {
  id: string;
  snisb: string;
  nome: string;
  empreendedor: string;
  municipio: string;
  uso: string;
  codBarragem: string;
  lat: string;
  long: string;
  dpa: string;
  type: 'snisb' | 'aneel';
}
