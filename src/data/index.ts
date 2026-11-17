import { LocalDocumentRepository } from './localDocumentRepository';
import { LocalAuditRepository } from './localAuditRepository';
import { LocalUserRepository } from './localUserRepository';
import { LocalAdministraRepository } from './localAdministraRepository';
import { LocalEcosystemRepository } from './localEcosystemRepository';

export type {
  DocumentRepository,
  AuditRepository,
  UserRepository,
  AuditLogRecord,
  AdministraRegistryRepository,
  EcosystemFederationRepository,
  FormEntitySyncInput,
  FormEntitySyncResult,
  LinkArtRTInput,
} from './types';
export { getEcosystemConnections, fetchEcosystemConnections } from './ecosystemConfig';

export const documentRepository = new LocalDocumentRepository();
export const auditRepository = new LocalAuditRepository();
export const userRepository = new LocalUserRepository();
export const administraRepository = new LocalAdministraRepository();
export const ecosystemRepository = new LocalEcosystemRepository(administraRepository);
