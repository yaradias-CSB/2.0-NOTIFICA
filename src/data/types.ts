import { ParecerData, OficioData, NotificacaoData, FiscalizacaoData, User } from '../types';
import {
  EmpreendedorCanonico,
  BarragemCanonica,
  ResponsavelTecnicoCanonico,
  ChangeRequest,
  ChangeRequestTargetType,
  EcosystemProductSummary,
  EcosystemSystemId,
  IntegratedSystemsDataPayload,
} from '../types/ecosystem';

export interface AuditLogRecord {
  id: string;
  created_at: string;
  user_id: string | null;
  username: string;
  name: string | null;
  role: string | null;
  action: string;
  details: string;
  ip_address: string;
}

export interface DocumentRepository {
  getPareceres(): Promise<ParecerData[]>;
  saveParecer(data: ParecerData): Promise<ParecerData>;
  deleteParecer(id: string): Promise<void>;

  getOficios(): Promise<OficioData[]>;
  saveOficio(data: OficioData): Promise<OficioData>;
  deleteOficio(id: string): Promise<void>;

  getNotificacoes(): Promise<NotificacaoData[]>;
  saveNotificacao(data: NotificacaoData): Promise<NotificacaoData>;
  deleteNotificacao(id: string): Promise<void>;

  getFiscalizacoes(): Promise<FiscalizacaoData[]>;
  deleteFiscalizacao(id: string): Promise<void>;
}

export interface AuditRepository {
  getLogs(): Promise<AuditLogRecord[]>;
  addLog(entry: Omit<AuditLogRecord, 'id' | 'created_at'>): Promise<AuditLogRecord>;
  clearLogs(): Promise<void>;
}

export interface UserRepository {
  getUsers(): Promise<User[]>;
  createUser(user: Omit<User, 'id'>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | null>;
  deleteUser(id: string): Promise<void>;
}

export interface FormBarragemSyncItem {
  existingBarragemId?: string;
  nomeBarragem: string;
  codigoSnisb?: string;
  municipio?: string;
  usoPreponderante?: string;
  tipoBarragem?: string;
  coordenadasGMS?: {
    lat: { g: string; m: string; s: string };
    long: { g: string; m: string; s: string };
  };
  altura?: string;
  volume?: string;
}

export interface FormEntitySyncInput {
  empreendedorNome?: string;
  cpfCnpj?: string;
  tipoPessoa?: 'CPF' | 'CNPJ';
  telefone?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  carMt?: string;
  nomeBarragem?: string;
  codigoSnisb?: string;
  processo?: string;
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
  barragens?: FormBarragemSyncItem[];
  art?: string;
  responsaveisTecnicos?: Array<{
    nome: string;
    registroProfissional?: string;
    formacaoProfissional?: string;
    cpf?: string;
    art?: string;
  }>;
  existingEmpreendedorId?: string;
  existingBarragemId?: string;
  analista?: string;
}

export interface LinkArtRTInput {
  rtId?: string;
  rtNome: string;
  registroProfissional?: string;
  formacaoProfissional?: string;
  cpf?: string;
  art: string;
  barragemId?: string;
  barragemNome?: string;
  empreendedorId?: string;
  empreendedorNome?: string;
  processo?: string;
}

export interface FormEntitySyncResult {
  empreendedorId?: string;
  barragemId?: string;
  barragemIds: string[];
  responsavelTecnicoIds: string[];
  createdEmpreendedor: boolean;
  createdBarragem: boolean;
  createdBarragemCount: number;
  createdRTCount: number;
}

export interface AdministraRegistryRepository {
  invalidateCache?(): void;
  getEmpreendedores(): Promise<EmpreendedorCanonico[]>;
  saveEmpreendedor(
    data: Omit<EmpreendedorCanonico, 'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem' | 'cpfCnpjNormalizado'> & { id?: string },
    options?: { bypassOwnershipForApprovedRequest?: boolean; allowEditFromForm?: boolean }
  ): Promise<EmpreendedorCanonico>;
  deleteEmpreendedor(id: string): Promise<void>;

  getBarragens(): Promise<BarragemCanonica[]>;
  saveBarragem(
    data: Omit<BarragemCanonica, 'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem'> & { id?: string },
    options?: { bypassOwnershipForApprovedRequest?: boolean; allowEditFromForm?: boolean }
  ): Promise<BarragemCanonica>;
  deleteBarragem(id: string): Promise<void>;

  getResponsaveisTecnicos(): Promise<ResponsavelTecnicoCanonico[]>;
  saveResponsavelTecnico(
    data: Omit<ResponsavelTecnicoCanonico, 'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem'> & { id?: string },
    options?: { bypassOwnershipForApprovedRequest?: boolean; allowEditFromForm?: boolean }
  ): Promise<ResponsavelTecnicoCanonico>;
  linkArtToRT(input: LinkArtRTInput): Promise<ResponsavelTecnicoCanonico>;
  deleteResponsavelTecnico(id: string): Promise<void>;

  syncFromFormSubmission(input: FormEntitySyncInput): Promise<FormEntitySyncResult>;
}

export interface EcosystemFederationRepository {
  getChangeRequests(): Promise<ChangeRequest[]>;
  createChangeRequest(input: {
    targetType: ChangeRequestTargetType;
    targetId: string;
    targetLabel: string;
    targetOwnerSystem: EcosystemSystemId;
    requestedByName: string;
    justification: string;
    currentSnapshot: Record<string, unknown>;
    proposedChanges: Record<string, unknown>;
  }): Promise<ChangeRequest>;
  reviewChangeRequest(
    id: string,
    decision: 'APROVADA' | 'REPROVADA',
    reviewerName: string,
    reviewNotes?: string
  ): Promise<ChangeRequest>;

  getExternalProducts(): Promise<EcosystemProductSummary[]>;
  getIntegratedSystemsData(system?: EcosystemSystemId): Promise<IntegratedSystemsDataPayload>;
  findProductsByEntity(
    localProducts: EcosystemProductSummary[],
    criteria: {
      empreendedorId?: string;
      cpfCnpj?: string;
      barragemId?: string;
      codigoSnisb?: string;
      nomeBarragem?: string;
    }
  ): Promise<EcosystemProductSummary[]>;
}

