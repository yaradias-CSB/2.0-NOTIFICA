import { UserRole } from '../types';

export type PendenciaSituacao =
  | 'aberta'
  | 'direcionada'
  | 'em_analise'
  | 'resolvida'
  | 'cancelada';

export type PendenciasTab = 'minhas' | 'geral' | 'direcionado';

export interface PendenciaRecord {
  id: string;
  origem: string;
  origem_ref_id?: string | null;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  situacao: PendenciaSituacao;
  responsavel_id?: string | null;
  direcionado_por?: string | null;
  direcionado_em?: string | null;
  criado_por: string;
  tipo_referencia?: string | null;
  referencia_id?: string | null;
  empreendedor_id?: string | null;
  barragem_id?: string | null;
  resolvido_por?: string | null;
  resolvido_em?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendenciaHistoricoRecord {
  id: string;
  pendencia_id: string;
  acao: string;
  campo?: string | null;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  usuario_id: string;
  motivo?: string | null;
  created_at: string;
}

export interface PendenciaUsuarioOption {
  id: string;
  nome: string;
  perfil: UserRole;
  email?: string;
}

export interface PendenciaCurrentUser {
  id: string;
  nome: string;
  perfil: UserRole;
}

export interface PendenciaListResponse {
  items: PendenciaRecord[];
  usuarios: PendenciaUsuarioOption[];
  currentUser: PendenciaCurrentUser;
  readOnly: boolean;
  readOnlyReason?: string;
}
