import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  BarragemCanonica,
  ChangeRequest,
  ChangeRequestTargetType,
  CURRENT_SYSTEM_ID,
  EcosystemProductSummary,
  EcosystemRemoteSystemDiagnostic,
  EcosystemSystemConnectionStatus,
  EcosystemSystemId,
  EmpreendedorCanonico,
  IntegratedSystemsDataPayload,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import {
  administraRepository,
  ecosystemRepository,
  fetchEcosystemConnections,
  FormEntitySyncInput,
  FormEntitySyncResult,
  getEcosystemConnections,
  LinkArtRTInput,
} from '../data';
import { createEmptyDiagnostics } from '../data/localEcosystemRepository';
import { DataContext } from './DataContext';
import { useAuth } from './AuthContext';
import { logActivity } from '../lib/audit';

interface EcosystemContextType {
  empreendedores: EmpreendedorCanonico[];
  barragens: BarragemCanonica[];
  responsaveisTecnicos: ResponsavelTecnicoCanonico[];
  externalEmpreendedores: EmpreendedorCanonico[];
  externalBarragens: BarragemCanonica[];
  externalResponsaveisTecnicos: ResponsavelTecnicoCanonico[];
  changeRequests: ChangeRequest[];
  externalProducts: EcosystemProductSummary[];
  allEcosystemProducts: EcosystemProductSummary[];
  connections: EcosystemSystemConnectionStatus[];
  remoteDiagnostics: Record<EcosystemSystemId, EcosystemRemoteSystemDiagnostic>;
  pendingIncomingCount: number;
  loading: boolean;
  isPullingExternal: boolean;
  lastExternalSyncAt: string | null;
  refreshEcosystem: () => Promise<void>;
  pullFromIntegratedSystems: (system?: EcosystemSystemId) => Promise<IntegratedSystemsDataPayload>;
  importEmpreendedorToAdministra: (
    emp: EmpreendedorCanonico
  ) => Promise<{ success: boolean; data?: EmpreendedorCanonico; message?: string }>;
  importBarragemToAdministra: (
    bar: BarragemCanonica
  ) => Promise<{ success: boolean; data?: BarragemCanonica; message?: string }>;
  importRTToAdministra: (
    rt: ResponsavelTecnicoCanonico
  ) => Promise<{ success: boolean; data?: ResponsavelTecnicoCanonico; message?: string }>;
  canEditDirectly: (sourceSystem?: EcosystemSystemId) => boolean;
  saveEmpreendedor: (
    data: Omit<
      EmpreendedorCanonico,
      'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem' | 'cpfCnpjNormalizado'
    > & { id?: string },
    options?: { allowEditFromForm?: boolean }
  ) => Promise<{ success: boolean; data?: EmpreendedorCanonico; message?: string }>;
  deleteEmpreendedor: (id: string) => Promise<{ success: boolean; message?: string }>;
  saveBarragem: (
    data: Omit<BarragemCanonica, 'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem'> & { id?: string },
    options?: { allowEditFromForm?: boolean }
  ) => Promise<{ success: boolean; data?: BarragemCanonica; message?: string }>;
  deleteBarragem: (id: string) => Promise<{ success: boolean; message?: string }>;
  saveResponsavelTecnico: (
    data: Omit<
      ResponsavelTecnicoCanonico,
      'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem'
    > & { id?: string },
    options?: { allowEditFromForm?: boolean }
  ) => Promise<{ success: boolean; data?: ResponsavelTecnicoCanonico; message?: string }>;
  linkArtToRT: (
    input: LinkArtRTInput
  ) => Promise<{ success: boolean; data?: ResponsavelTecnicoCanonico; message?: string }>;
  deleteResponsavelTecnico: (id: string) => Promise<{ success: boolean; message?: string }>;
  syncEntitiesFromForm: (input: FormEntitySyncInput) => Promise<FormEntitySyncResult>;
  submitChangeRequest: (input: {
    targetType: ChangeRequestTargetType;
    targetId: string;
    targetLabel: string;
    targetOwnerSystem: EcosystemSystemId;
    requestedByName: string;
    justification: string;
    currentSnapshot: Record<string, unknown>;
    proposedChanges: Record<string, unknown>;
  }) => Promise<{ success: boolean; data?: ChangeRequest; message?: string }>;
  reviewChangeRequest: (
    id: string,
    decision: 'APROVADA' | 'REPROVADA',
    reviewerName: string,
    reviewNotes?: string
  ) => Promise<{ success: boolean; data?: ChangeRequest; message?: string }>;
  getProductsForEntity: (criteria: {
    empreendedorId?: string;
    cpfCnpj?: string;
    barragemId?: string;
    codigoSnisb?: string;
    nomeBarragem?: string;
  }) => EcosystemProductSummary[];
}

export const EcosystemContext = createContext<EcosystemContextType>({
  empreendedores: [],
  barragens: [],
  responsaveisTecnicos: [],
  externalEmpreendedores: [],
  externalBarragens: [],
  externalResponsaveisTecnicos: [],
  changeRequests: [],
  externalProducts: [],
  allEcosystemProducts: [],
  connections: [],
  remoteDiagnostics: createEmptyDiagnostics(),
  pendingIncomingCount: 0,
  loading: true,
  isPullingExternal: false,
  lastExternalSyncAt: null,
  refreshEcosystem: async () => {},
  pullFromIntegratedSystems: async () => ({
    empreendedores: [],
    barragens: [],
    responsaveisTecnicos: [],
    products: [],
    diagnostics: createEmptyDiagnostics(),
    fetchedAt: '',
  }),
  importEmpreendedorToAdministra: async () => ({ success: false }),
  importBarragemToAdministra: async () => ({ success: false }),
  importRTToAdministra: async () => ({ success: false }),
  canEditDirectly: () => true,
  saveEmpreendedor: async () => ({ success: false }),
  deleteEmpreendedor: async () => ({ success: false }),
  saveBarragem: async () => ({ success: false }),
  deleteBarragem: async () => ({ success: false }),
  saveResponsavelTecnico: async () => ({ success: false }),
  linkArtToRT: async () => ({ success: false }),
  deleteResponsavelTecnico: async () => ({ success: false }),
  syncEntitiesFromForm: async () => ({
    barragemIds: [],
    responsavelTecnicoIds: [],
    createdEmpreendedor: false,
    createdBarragem: false,
    createdBarragemCount: 0,
    createdRTCount: 0,
  }),
  submitChangeRequest: async () => ({ success: false }),
  reviewChangeRequest: async () => ({ success: false }),
  getProductsForEntity: () => [],
});

function normalizeText(value?: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeDigits(value?: string): string {
  return (value || '').replace(/\D/g, '');
}

export const EcosystemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { pareceres, oficios, notificacoes, loading: docsLoading } = useContext(DataContext);
  const { canEdit, profile, user } = useAuth();

  const [empreendedores, setEmpreendedores] = useState<EmpreendedorCanonico[]>([]);
  const [barragens, setBarragens] = useState<BarragemCanonica[]>([]);
  const [responsaveisTecnicos, setResponsaveisTecnicos] = useState<ResponsavelTecnicoCanonico[]>([]);
  const [externalEmpreendedores, setExternalEmpreendedores] = useState<EmpreendedorCanonico[]>([]);
  const [externalBarragens, setExternalBarragens] = useState<BarragemCanonica[]>([]);
  const [externalResponsaveisTecnicos, setExternalResponsaveisTecnicos] = useState<ResponsavelTecnicoCanonico[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [externalProducts, setExternalProducts] = useState<EcosystemProductSummary[]>([]);
  const [remoteDiagnostics, setRemoteDiagnostics] = useState<Record<EcosystemSystemId, EcosystemRemoteSystemDiagnostic>>(
    () => createEmptyDiagnostics()
  );
  const [connections, setConnections] = useState<EcosystemSystemConnectionStatus[]>(() =>
    getEcosystemConnections()
  );
  const [loading, setLoading] = useState(true);
  const [isPullingExternal, setIsPullingExternal] = useState(false);
  const [lastExternalSyncAt, setLastExternalSyncAt] = useState<string | null>(null);

  const applyIntegratedPayload = useCallback((payload: IntegratedSystemsDataPayload) => {
    setExternalEmpreendedores(
      (payload.empreendedores || []).filter((e) => e.sourceSystem !== 'ADMINISTRA')
    );
    setExternalBarragens(
      (payload.barragens || []).filter((b) => b.sourceSystem !== 'ADMINISTRA')
    );
    setExternalResponsaveisTecnicos(
      (payload.responsaveisTecnicos || []).filter((rt) => rt.sourceSystem !== 'ADMINISTRA')
    );
    setExternalProducts(
      (payload.products || []).filter((p) => p.systemId !== 'NOTIFICA')
    );
    if (payload.diagnostics) {
      setRemoteDiagnostics(payload.diagnostics);
    }
    if (payload.fetchedAt) {
      setLastExternalSyncAt(payload.fetchedAt);
    }
  }, []);

  const refreshEcosystem = useCallback(async () => {
    setLoading(true);
    try {
      administraRepository.invalidateCache?.();
      const [emps, bars, rts, reqs, integrated, serverConnections] = await Promise.all([
        administraRepository.getEmpreendedores(),
        administraRepository.getBarragens(),
        administraRepository.getResponsaveisTecnicos(),
        ecosystemRepository.getChangeRequests(),
        ecosystemRepository.getIntegratedSystemsData(),
        fetchEcosystemConnections(),
      ]);
      setEmpreendedores(emps);
      setBarragens(bars);
      setResponsaveisTecnicos(rts);
      setChangeRequests(reqs);
      applyIntegratedPayload(integrated);
      setConnections(serverConnections);
    } catch (err) {
      console.warn('Erro ao carregar dados do ecossistema:', err);
    } finally {
      setLoading(false);
    }
  }, [applyIntegratedPayload]);

  const pullFromIntegratedSystems = useCallback(
    async (system?: EcosystemSystemId): Promise<IntegratedSystemsDataPayload> => {
      setIsPullingExternal(true);
      try {
        const [integrated, serverConnections] = await Promise.all([
          ecosystemRepository.getIntegratedSystemsData(system),
          fetchEcosystemConnections(),
        ]);
        applyIntegratedPayload(integrated);
        setConnections(serverConnections);
        return integrated;
      } finally {
        setIsPullingExternal(false);
      }
    },
    [applyIntegratedPayload]
  );

  useEffect(() => {
    refreshEcosystem();
  }, [refreshEcosystem]);

  const localProducts = useMemo<EcosystemProductSummary[]>(() => {
    const items: EcosystemProductSummary[] = [];

    pareceres.forEach((p) => {
      items.push({
        id: p.id || `parecer_${p.processo}`,
        systemId: 'NOTIFICA',
        tipoDocumento: p.tipo_documento || 'Parecer Técnico',
        numeroDocumento: p.numParecerTecnico || p.processo,
        processo: p.processo,
        status: p.status,
        dataEmissao: p.dataParecer || p.data || p.created_at,
        empreendedorId: p.empreendedorId,
        empreendedorNome: p.identificacaoEmpreendedor,
        empreendedorCpfCnpj: p.cpfCnpj,
        barragemId: p.barragemId,
        barragemNome: p.nomeBarragem || p.localizacaoEmpreendimento,
        codigoSnisb: p.snisb,
        municipio: p.municipio,
        analista: p.analista || (Array.isArray(p.analistas) ? p.analistas[0] : undefined),
        readonly: false,
      });
    });

    oficios.forEach((o) => {
      items.push({
        id: o.id || `oficio_${o.protocolo}`,
        systemId: 'NOTIFICA',
        tipoDocumento: o.tipo_documento || 'Ofício de Pendências',
        numeroDocumento: o.protocolo,
        processo: o.processo || o.protocolo,
        status: o.situacaoCumprimento || o.status,
        dataEmissao: o.dataEmissao || o.created_at,
        empreendedorId: o.empreendedorId,
        empreendedorNome: o.interessado,
        empreendedorCpfCnpj: o.cpfCnpj,
        barragemId: o.barragemId,
        barragemNome: o.empreendimento,
        municipio: o.municipio || o.cidadeUf,
        analista: Array.isArray(o.analistas) ? o.analistas[0] : undefined,
        readonly: false,
      });
    });

    notificacoes.forEach((n) => {
      items.push({
        id: n.id || `notif_${n.numProcesso}`,
        systemId: 'NOTIFICA',
        tipoDocumento: 'Notificação',
        numeroDocumento: n.notificacaoGerada || n.numProcesso,
        processo: n.numProcesso,
        status: n.situacao || n.status,
        dataEmissao: n.dataNotificacao || n.created_at,
        empreendedorId: n.empreendedorId,
        empreendedorNome: n.empreendedorNome,
        empreendedorCpfCnpj: n.documentoIdentificacao,
        barragemId: n.barragemId,
        barragemNome: n.nomeFantasia || n.barragens?.[0]?.nome,
        municipio: n.municipioEmpreendimento,
        analista: n.analista || (Array.isArray(n.analistas) ? n.analistas[0] : undefined),
        readonly: false,
      });
    });

    return items;
  }, [pareceres, oficios, notificacoes]);

  const allEcosystemProducts = useMemo(
    () => [...localProducts, ...externalProducts],
    [localProducts, externalProducts]
  );

  const pendingIncomingCount = useMemo(
    () =>
      changeRequests.filter(
        (req) => req.status === 'PENDENTE' && req.targetOwnerSystem === CURRENT_SYSTEM_ID
      ).length,
    [changeRequests]
  );

  const canEditDirectly = useCallback(
    (sourceSystem?: EcosystemSystemId) => !sourceSystem || sourceSystem === CURRENT_SYSTEM_ID,
    []
  );

  const saveEmpreendedor = async (
    data: Omit<
      EmpreendedorCanonico,
      'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem' | 'cpfCnpjNormalizado'
    > & { id?: string },
    options?: { allowEditFromForm?: boolean }
  ) => {
    try {
      const saved = await administraRepository.saveEmpreendedor(data, options);
      setEmpreendedores((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)]);
      logActivity({
        action: data.id ? 'UPDATE_EMPREENDEDOR_ADMINISTRA' : 'CREATE_EMPREENDEDOR_ADMINISTRA',
        details: `Empreendedor "${saved.nome}" (${saved.cpfCnpj || 'S/Doc'}) sincronizado na base do Administra (origem: ${saved.sourceSystem}).`,
      });
      return { success: true, data: saved };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao salvar empreendedor.' };
    }
  };

  const deleteEmpreendedor = async (id: string) => {
    try {
      await administraRepository.deleteEmpreendedor(id);
      setEmpreendedores((prev) => prev.filter((e) => e.id !== id));
      logActivity({
        action: 'DELETE_EMPREENDEDOR_ADMINISTRA',
        details: `Empreendedor ID ${id} excluído da base do Administra.`,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao excluir empreendedor.' };
    }
  };

  const saveBarragem = async (
    data: Omit<BarragemCanonica, 'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem'> & { id?: string },
    options?: { allowEditFromForm?: boolean }
  ) => {
    try {
      const saved = await administraRepository.saveBarragem(data, options);
      setBarragens((prev) => [saved, ...prev.filter((b) => b.id !== saved.id)]);
      logActivity({
        action: data.id ? 'UPDATE_BARRAGEM_ADMINISTRA' : 'CREATE_BARRAGEM_ADMINISTRA',
        details: `Barragem "${saved.nomeBarragem}" (${saved.municipio || 'S/Município'}) sincronizada na base do Administra (origem: ${saved.sourceSystem}).`,
      });
      return { success: true, data: saved };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao salvar barragem.' };
    }
  };

  const deleteBarragem = async (id: string) => {
    try {
      await administraRepository.deleteBarragem(id);
      setBarragens((prev) => prev.filter((b) => b.id !== id));
      logActivity({
        action: 'DELETE_BARRAGEM_ADMINISTRA',
        details: `Barragem ID ${id} excluída da base do Administra.`,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao excluir barragem.' };
    }
  };

  const saveResponsavelTecnico = async (
    data: Omit<
      ResponsavelTecnicoCanonico,
      'id' | 'createdAt' | 'updatedAt' | 'registryOwnerSystem'
    > & { id?: string },
    options?: { allowEditFromForm?: boolean }
  ) => {
    try {
      const saved = await administraRepository.saveResponsavelTecnico(data, options);
      setResponsaveisTecnicos((prev) => [saved, ...prev.filter((rt) => rt.id !== saved.id)]);
      logActivity({
        action: data.id ? 'UPDATE_RT_ADMINISTRA' : 'CREATE_RT_ADMINISTRA',
        details: `Responsável Técnico "${saved.nome}" sincronizado na base do Administra (origem: ${saved.sourceSystem}).`,
      });
      return { success: true, data: saved };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao salvar responsável técnico.' };
    }
  };

  const linkArtToRT = async (input: LinkArtRTInput) => {
    try {
      const saved = await administraRepository.linkArtToRT(input);
      setResponsaveisTecnicos((prev) => [saved, ...prev.filter((rt) => rt.id !== saved.id)]);
      logActivity({
        action: 'LINK_ART_RT_ADMINISTRA',
        details: `Nova ART "${input.art}" vinculada ao RT "${saved.nome}"${input.barragemNome || input.empreendedorNome ? ` (${input.barragemNome || input.empreendedorNome})` : ''} no Administra.`,
      });
      return { success: true, data: saved };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao vincular ART ao responsável técnico.' };
    }
  };

  const deleteResponsavelTecnico = async (id: string) => {
    try {
      await administraRepository.deleteResponsavelTecnico(id);
      setResponsaveisTecnicos((prev) => prev.filter((rt) => rt.id !== id));
      logActivity({
        action: 'DELETE_RT_ADMINISTRA',
        details: `Responsável Técnico ID ${id} excluído da base do Administra.`,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao excluir responsável técnico.' };
    }
  };

  const syncEntitiesFromForm = async (input: FormEntitySyncInput): Promise<FormEntitySyncResult> => {
    const result = await administraRepository.syncFromFormSubmission(input);
    await refreshEcosystem();
    logActivity({
      action: 'SYNC_ADMINISTRA_FROM_FORM',
      details: `Sincronização automática com Administra: empreendedor=${result.createdEmpreendedor ? 'novo' : 'atualizado/existente'}, barragens=${result.barragemIds.length} (novas=${result.createdBarragemCount}), novos RTs=${result.createdRTCount}.`,
    });
    return result;
  };

  const submitChangeRequest = async (input: {
    targetType: ChangeRequestTargetType;
    targetId: string;
    targetLabel: string;
    targetOwnerSystem: EcosystemSystemId;
    requestedByName: string;
    justification: string;
    currentSnapshot: Record<string, unknown>;
    proposedChanges: Record<string, unknown>;
  }) => {
    try {
      const created = await ecosystemRepository.createChangeRequest(input);
      setChangeRequests((prev) => [created, ...prev]);
      logActivity({
        action: 'CREATE_CHANGE_REQUEST',
        details: `Solicitação de alteração enviada para ${created.targetOwnerSystem} sobre ${created.targetType} "${created.targetLabel}".`,
      });
      return { success: true, data: created };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao enviar solicitação de alteração.' };
    }
  };

  const reviewChangeRequest = async (
    id: string,
    decision: 'APROVADA' | 'REPROVADA',
    reviewerName: string,
    reviewNotes?: string
  ) => {
    try {
      const effectiveReviewer = profile?.nome || user?.email || reviewerName;
      const reviewed = await ecosystemRepository.reviewChangeRequest(
        id,
        decision,
        effectiveReviewer,
        reviewNotes
      );
      await refreshEcosystem();
      logActivity({
        action: decision === 'APROVADA' ? 'APPROVE_CHANGE_REQUEST' : 'REJECT_CHANGE_REQUEST',
        details: `Solicitação ${reviewed.id} (${reviewed.targetLabel}) ${decision.toLowerCase()} por ${reviewed.reviewedByName}.`,
      });
      return { success: true, data: reviewed };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao analisar solicitação.' };
    }
  };

  const getProductsForEntity = useCallback(
    (criteria: {
      empreendedorId?: string;
      cpfCnpj?: string;
      barragemId?: string;
      codigoSnisb?: string;
      nomeBarragem?: string;
    }): EcosystemProductSummary[] => {
      const cpfNorm = normalizeDigits(criteria.cpfCnpj);
      const snisbNorm = normalizeText(criteria.codigoSnisb);
      const barNorm = normalizeText(criteria.nomeBarragem);

      if (
        !criteria.empreendedorId &&
        !cpfNorm &&
        !criteria.barragemId &&
        !snisbNorm &&
        !barNorm
      ) {
        return [];
      }

      return allEcosystemProducts.filter((item) => {
        if (criteria.empreendedorId && item.empreendedorId === criteria.empreendedorId) return true;
        if (criteria.barragemId && item.barragemId === criteria.barragemId) return true;
        if (cpfNorm && normalizeDigits(item.empreendedorCpfCnpj) === cpfNorm) return true;
        if (snisbNorm && normalizeText(item.codigoSnisb) === snisbNorm) return true;
        if (barNorm && normalizeText(item.barragemNome) === barNorm) return true;
        return false;
      });
    },
    [allEcosystemProducts]
  );

  const importEmpreendedorToAdministra = async (emp: EmpreendedorCanonico) => {
    const cpfNorm = normalizeDigits(emp.cpfCnpjNormalizado || emp.cpfCnpj);
    const existing = empreendedores.find(
      (item) =>
        (cpfNorm && item.cpfCnpjNormalizado === cpfNorm) ||
        (normalizeText(item.nome) && normalizeText(item.nome) === normalizeText(emp.nome))
    );
    return saveEmpreendedor(
      {
        id: existing?.id,
        nome: emp.nome,
        tipoPessoa: emp.tipoPessoa,
        cpfCnpj: emp.cpfCnpj,
        telefone: emp.telefone || existing?.telefone,
        email: emp.email || existing?.email,
        logradouro: emp.logradouro || existing?.logradouro,
        numero: emp.numero || existing?.numero,
        complemento: emp.complemento || existing?.complemento,
        bairro: emp.bairro || existing?.bairro,
        municipio: emp.municipio || existing?.municipio,
        uf: emp.uf || existing?.uf || 'MT',
        cep: emp.cep || existing?.cep,
        carMt: emp.carMt || existing?.carMt,
        sourceSystem: existing?.sourceSystem || emp.sourceSystem || CURRENT_SYSTEM_ID,
        createdByAnalyst: emp.createdByAnalyst || existing?.createdByAnalyst,
      },
      { allowEditFromForm: true }
    );
  };

  const importBarragemToAdministra = async (bar: BarragemCanonica) => {
    const snisbNorm = normalizeText(bar.codigoSnisb);
    const barNorm = normalizeText(bar.nomeBarragem);
    const existing = barragens.find(
      (item) =>
        (snisbNorm && normalizeText(item.codigoSnisb) === snisbNorm) ||
        (barNorm && normalizeText(item.nomeBarragem) === barNorm)
    );
    const empCpfNorm = normalizeDigits(bar.empreendedorCpfCnpj);
    const matchedEmp = empreendedores.find(
      (e) =>
        (empCpfNorm && e.cpfCnpjNormalizado === empCpfNorm) ||
        (bar.empreendedorNome && normalizeText(e.nome) === normalizeText(bar.empreendedorNome))
    );
    return saveBarragem(
      {
        id: existing?.id,
        empreendedorId: matchedEmp?.id || bar.empreendedorId || existing?.empreendedorId || '',
        empreendedorNome: matchedEmp?.nome || bar.empreendedorNome || existing?.empreendedorNome,
        empreendedorCpfCnpj: matchedEmp?.cpfCnpj || bar.empreendedorCpfCnpj || existing?.empreendedorCpfCnpj,
        nomeBarragem: bar.nomeBarragem,
        codigoSnisb: bar.codigoSnisb || existing?.codigoSnisb,
        processoReferencia: bar.processoReferencia || existing?.processoReferencia,
        municipio: bar.municipio || existing?.municipio || '',
        uf: bar.uf || existing?.uf || 'MT',
        cursoAguaBarrado: bar.cursoAguaBarrado || existing?.cursoAguaBarrado,
        usoPreponderante: bar.usoPreponderante || existing?.usoPreponderante,
        situacaoEmpreendimento: bar.situacaoEmpreendimento || existing?.situacaoEmpreendimento,
        tipoBarragem: bar.tipoBarragem || existing?.tipoBarragem,
        coordenadasGMS: bar.coordenadasGMS || existing?.coordenadasGMS,
        altura: bar.altura || existing?.altura,
        volume: bar.volume || existing?.volume,
        larguraCoroamento: bar.larguraCoroamento || existing?.larguraCoroamento,
        comprimentoCoroamento: bar.comprimentoCoroamento || existing?.comprimentoCoroamento,
        classificacaoBarragem: bar.classificacaoBarragem || existing?.classificacaoBarragem,
        classificacaoDPA: bar.classificacaoDPA || existing?.classificacaoDPA,
        classificacaoCRI: bar.classificacaoCRI || existing?.classificacaoCRI,
        portariaClassificacao: bar.portariaClassificacao || existing?.portariaClassificacao,
        parecerClassificacao: bar.parecerClassificacao || existing?.parecerClassificacao,
        sourceSystem: existing?.sourceSystem || bar.sourceSystem || CURRENT_SYSTEM_ID,
        createdByAnalyst: bar.createdByAnalyst || existing?.createdByAnalyst,
      },
      { allowEditFromForm: true }
    );
  };

  const importRTToAdministra = async (rt: ResponsavelTecnicoCanonico) => {
    const cpfNorm = normalizeDigits(rt.cpf);
    const regNorm = normalizeText(rt.registroProfissional);
    const nameNorm = normalizeText(rt.nome);
    const existing = responsaveisTecnicos.find(
      (item) =>
        (cpfNorm && normalizeDigits(item.cpf) === cpfNorm) ||
        (regNorm && normalizeText(item.registroProfissional) === regNorm) ||
        (nameNorm && normalizeText(item.nome) === nameNorm)
    );
    return saveResponsavelTecnico(
      {
        id: existing?.id,
        nome: rt.nome,
        registroProfissional: rt.registroProfissional || existing?.registroProfissional,
        formacaoProfissional: rt.formacaoProfissional || existing?.formacaoProfissional,
        cpf: rt.cpf || existing?.cpf,
        telefone: rt.telefone || existing?.telefone,
        email: rt.email || existing?.email,
        sourceSystem: existing?.sourceSystem || rt.sourceSystem || CURRENT_SYSTEM_ID,
        createdByAnalyst: rt.createdByAnalyst || existing?.createdByAnalyst,
      },
      { allowEditFromForm: true }
    );
  };

  return (
    <EcosystemContext.Provider
      value={{
        empreendedores,
        barragens,
        responsaveisTecnicos,
        externalEmpreendedores,
        externalBarragens,
        externalResponsaveisTecnicos,
        changeRequests,
        externalProducts,
        allEcosystemProducts,
        connections,
        remoteDiagnostics,
        pendingIncomingCount,
        loading,
        isPullingExternal,
        lastExternalSyncAt,
        refreshEcosystem,
        pullFromIntegratedSystems,
        importEmpreendedorToAdministra,
        importBarragemToAdministra,
        importRTToAdministra,
        canEditDirectly,
        saveEmpreendedor,
        deleteEmpreendedor,
        saveBarragem,
        deleteBarragem,
        saveResponsavelTecnico,
        linkArtToRT,
        deleteResponsavelTecnico,
        syncEntitiesFromForm,
        submitChangeRequest,
        reviewChangeRequest,
        getProductsForEntity,
      }}
    >
      {children}
    </EcosystemContext.Provider>
  );
};

