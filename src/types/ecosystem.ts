export type EcosystemSystemId = 'ADMINISTRA' | 'CLASSIFICA' | 'NOTIFICA' | 'FISCALIZA';

export const CURRENT_SYSTEM_ID: EcosystemSystemId = 'NOTIFICA';

export const ECOSYSTEM_SYSTEM_LABELS: Record<EcosystemSystemId, { name: string; shortName: string; role: string }> = {
  ADMINISTRA: {
    name: 'Administra Barragens',
    shortName: 'Administra',
    role: 'Base Central (Empreendedores, Barragens e RTs)',
  },
  CLASSIFICA: {
    name: 'Classifica Barragens',
    shortName: 'Classifica',
    role: 'Classificação DPA / CRI e Portarias',
  },
  NOTIFICA: {
    name: 'Notifica CSB',
    shortName: 'Notifica',
    role: 'Pareceres, Ofícios e Notificações',
  },
  FISCALIZA: {
    name: 'Fiscaliza Barragens',
    shortName: 'Fiscaliza',
    role: 'Vistorias, Autos e Fiscalização',
  },
};

export interface EmpreendedorCanonico {
  id: string;
  nome: string;
  tipoPessoa: 'CPF' | 'CNPJ';
  cpfCnpj: string;
  cpfCnpjNormalizado: string;
  telefone?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  carMt?: string;
  sourceSystem: EcosystemSystemId;
  registryOwnerSystem: 'ADMINISTRA';
  createdByAnalyst?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BarragemCanonica {
  id: string;
  empreendedorId: string;
  empreendedorNome?: string;
  empreendedorCpfCnpj?: string;
  nomeBarragem: string;
  codigoSnisb?: string;
  processoReferencia?: string;
  municipio: string;
  uf: string;
  cursoAguaBarrado?: string;
  usoPreponderante?: string;
  situacaoEmpreendimento?: string;
  tipoBarragem?: string;
  coordenadasGMS?: {
    lat: { g: string; m: string; s: string };
    long: { g: string; m: string; s: string };
  };
  altura?: string;
  volume?: string;
  larguraCoroamento?: string;
  comprimentoCoroamento?: string;
  classificacaoBarragem?: string;
  classificacaoDPA?: string;
  classificacaoCRI?: string;
  portariaClassificacao?: string;
  parecerClassificacao?: string;
  sourceSystem: EcosystemSystemId;
  registryOwnerSystem: 'ADMINISTRA';
  createdByAnalyst?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtVinculoCanonico {
  id?: string;
  art: string;
  barragemId?: string;
  barragemNome?: string;
  empreendedorId?: string;
  empreendedorNome?: string;
  processo?: string;
  situacao?: string;
  createdAt?: string;
}

export interface ResponsavelTecnicoCanonico {
  id: string;
  nome: string;
  registroProfissional?: string;
  art?: string;
  artsVinculadas?: ArtVinculoCanonico[];
  formacaoProfissional?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  sourceSystem: EcosystemSystemId;
  registryOwnerSystem: 'ADMINISTRA';
  createdByAnalyst?: string;
  createdAt: string;
  updatedAt: string;
}

export type ChangeRequestStatus = 'PENDENTE' | 'APROVADA' | 'REPROVADA';
export type ChangeRequestTargetType = 'EMPREENDEDOR' | 'BARRAGEM' | 'RESPONSAVEL_TECNICO';

export interface ChangeRequest {
  id: string;
  targetType: ChangeRequestTargetType;
  targetId: string;
  targetLabel: string;
  requestingSystem: EcosystemSystemId;
  targetOwnerSystem: EcosystemSystemId;
  requestedByName: string;
  justification: string;
  currentSnapshot: Record<string, unknown>;
  proposedChanges: Record<string, unknown>;
  status: ChangeRequestStatus;
  reviewedByName?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EcosystemProductSummary {
  id: string;
  systemId: EcosystemSystemId;
  tipoDocumento: string;
  numeroDocumento?: string;
  processo?: string;
  status?: string;
  dataEmissao?: string;
  empreendedorId?: string;
  empreendedorNome?: string;
  empreendedorCpfCnpj?: string;
  barragemId?: string;
  barragemNome?: string;
  codigoSnisb?: string;
  municipio?: string;
  analista?: string;
  readonly: boolean;
}

export interface EcosystemSystemConnectionStatus {
  systemId: EcosystemSystemId;
  name: string;
  role: string;
  mode: 'local-sandbox' | 'remote-configured';
  isCurrentSystem: boolean;
  canWriteDirectly: boolean;
}

export interface EcosystemRemoteSystemDiagnostic {
  systemId: EcosystemSystemId;
  remoteConfigured: boolean;
  reachable: boolean;
  authDenied: boolean;
  empreendedoresCount: number;
  barragensCount: number;
  rtsCount: number;
  productsCount: number;
}

export interface IntegratedSystemsDataPayload {
  empreendedores: EmpreendedorCanonico[];
  barragens: BarragemCanonica[];
  responsaveisTecnicos: ResponsavelTecnicoCanonico[];
  products: EcosystemProductSummary[];
  diagnostics: Record<EcosystemSystemId, EcosystemRemoteSystemDiagnostic>;
  fetchedAt: string;
}

