import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import {
  BarragemCanonica,
  ChangeRequest,
  ChangeRequestTargetType,
  CURRENT_SYSTEM_ID,
  EcosystemProductSummary,
  EcosystemSystemConnectionStatus,
  EcosystemSystemId,
  EmpreendedorCanonico,
  ResponsavelTecnicoCanonico,
} from '../types/ecosystem';
import {
  administraRepository,
  ecosystemRepository,
  fetchEcosystemConnections,
  FormEntitySyncInput,
  FormEntitySyncResult,
  getEcosystemConnections,
} from '../data';
import { DataContext } from './DataContext';
import { logActivity } from '../lib/audit';

interface EcosystemContextType {
  empreendedores: EmpreendedorCanonico[];
  barragens: BarragemCanonica[];
  responsaveisTecnicos: ResponsavelTecnicoCanonico[];
  changeRequests: ChangeRequest[];
  externalProducts: EcosystemProductSummary[];
  allEcosystemProducts: EcosystemProductSummary[];
  connections: EcosystemSystemConnectionStatus[];
  pendingIncomingCount: number;
  loading: boolean;
  refreshEcosystem: () => Promise<void>;
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
  changeRequests: [],
  externalProducts: [],
  allEcosystemProducts: [],
  connections: [],
  pendingIncomingCount: 0,
  loading: true,
  refreshEcosystem: async () => {},
  canEditDirectly: () => true,
  saveEmpreendedor: async () => ({ success: false }),
  deleteEmpreendedor: async () => ({ success: false }),
  saveBarragem: async () => ({ success: false }),
  deleteBarragem: async () => ({ success: false }),
  saveResponsavelTecnico: async () => ({ success: false }),
  deleteResponsavelTecnico: async () => ({ success: false }),
  syncEntitiesFromForm: async () => ({
    responsavelTecnicoIds: [],
    createdEmpreendedor: false,
    createdBarragem: false,
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

  const [empreendedores, setEmpreendedores] = useState<EmpreendedorCanonico[]>([]);
  const [barragens, setBarragens] = useState<BarragemCanonica[]>([]);
  const [responsaveisTecnicos, setResponsaveisTecnicos] = useState<ResponsavelTecnicoCanonico[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [externalProducts, setExternalProducts] = useState<EcosystemProductSummary[]>([]);
  const [connections, setConnections] = useState<EcosystemSystemConnectionStatus[]>(() =>
    getEcosystemConnections()
  );
  const [loading, setLoading] = useState(true);
  const bootstrappedRef = useRef(false);

  const refreshEcosystem = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, bars, rts, reqs, ext, serverConnections] = await Promise.all([
        administraRepository.getEmpreendedores(),
        administraRepository.getBarragens(),
        administraRepository.getResponsaveisTecnicos(),
        ecosystemRepository.getChangeRequests(),
        ecosystemRepository.getExternalProducts(),
        fetchEcosystemConnections(),
      ]);
      setEmpreendedores(emps);
      setBarragens(bars);
      setResponsaveisTecnicos(rts);
      setChangeRequests(reqs);
      setExternalProducts(ext);
      setConnections(serverConnections);
    } catch (err) {
      console.warn('Erro ao carregar dados do ecossistema:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshEcosystem();
  }, [refreshEcosystem]);

  // Automatically index existing local Notifica CSB documents into Administra registry once on initial load
  useEffect(() => {
    if (docsLoading || bootstrappedRef.current) return;
    const totalDocs = pareceres.length + oficios.length + notificacoes.length;
    if (totalDocs === 0) return;

    bootstrappedRef.current = true;

    const indexExistingDocs = async () => {
      try {
        const currentEmps = await administraRepository.getEmpreendedores();
        const existingCpfs = new Set(currentEmps.map((e) => e.cpfCnpjNormalizado).filter(Boolean));
        const existingNames = new Set(currentEmps.map((e) => normalizeText(e.nome)).filter(Boolean));

        let syncedAny = false;

        for (const p of pareceres) {
          const cpfNorm = normalizeDigits(p.cpfCnpj);
          const empName = normalizeText(p.identificacaoEmpreendedor);
          if ((cpfNorm && !existingCpfs.has(cpfNorm)) || (empName && !existingNames.has(empName))) {
            await administraRepository.syncFromFormSubmission({
              existingEmpreendedorId: p.empreendedorId,
              existingBarragemId: p.barragemId,
              empreendedorNome: p.identificacaoEmpreendedor,
              cpfCnpj: p.cpfCnpj,
              logradouro: p.logradouro,
              numero: p.numero,
              complemento: p.complemento,
              bairro: p.bairro,
              municipio: p.municipio,
              cep: p.cep,
              carMt: p.numCarMt,
              nomeBarragem: p.nomeBarragem || p.localizacaoEmpreendimento,
              codigoSnisb: p.snisb,
              processo: p.processo,
              cursoAguaBarrado: p.nomeCursoAguaBarrado,
              usoPreponderante: p.usoPreponderante,
              situacaoEmpreendimento: p.situacaoEmpreendimento,
              tipoBarragem: p.tipoBarragem,
              coordenadasGMS: p.coordenadasGMS,
              altura: p.alturaBarragem,
              volume: p.volumeBarragem,
              larguraCoroamento: p.larguraCoroamento,
              comprimentoCoroamento: p.comprimentoCoroamento,
              classificacaoBarragem: p.classificacaoBarragem,
              classificacaoDPA: p.classificacaoDPA,
              classificacaoCRI: p.classificacaoCRI,
              portariaClassificacao: p.portariaClassificacao,
              parecerClassificacao: p.parecerClassificacao,
              responsaveisTecnicos: [
                ...(p.responsaveisTecnicos || []),
                ...(p.rtOutros || []).filter((n) => n.trim()),
              ].map((nome) => ({
                nome,
                registroProfissional: p.registroProfissionalRT || p.artCreaMt,
                formacaoProfissional: p.formacaoProfissionalRT,
                cpf: p.cpfRT,
              })),
              analista: p.analista,
            });
            if (cpfNorm) existingCpfs.add(cpfNorm);
            if (empName) existingNames.add(empName);
            syncedAny = true;
          }
        }

        for (const o of oficios) {
          const cpfNorm = normalizeDigits(o.cpfCnpj);
          const empName = normalizeText(o.interessado);
          if ((cpfNorm && !existingCpfs.has(cpfNorm)) || (empName && !existingNames.has(empName))) {
            await administraRepository.syncFromFormSubmission({
              existingEmpreendedorId: o.empreendedorId,
              existingBarragemId: o.barragemId,
              empreendedorNome: o.interessado,
              cpfCnpj: o.cpfCnpj,
              logradouro: o.logradouro,
              numero: o.numero,
              complemento: o.complemento,
              bairro: o.bairro,
              municipio: o.municipio || o.cidadeUf,
              cep: o.cep,
              nomeBarragem: o.empreendimento,
              processo: o.processo || o.protocolo,
              coordenadasGMS: o.coordenadasGMS,
              responsaveisTecnicos: [
                ...(o.responsaveisTecnicos || []),
                ...(o.rtOutros || []).filter((n) => n.trim()),
              ].map((nome) => ({ nome, registroProfissional: o.art })),
              analista: o.analistas?.[0],
            });
            if (cpfNorm) existingCpfs.add(cpfNorm);
            if (empName) existingNames.add(empName);
            syncedAny = true;
          }
        }

        for (const n of notificacoes) {
          const cpfNorm = normalizeDigits(n.documentoIdentificacao);
          const empName = normalizeText(n.empreendedorNome);
          if ((cpfNorm && !existingCpfs.has(cpfNorm)) || (empName && !existingNames.has(empName))) {
            await administraRepository.syncFromFormSubmission({
              existingEmpreendedorId: n.empreendedorId,
              existingBarragemId: n.barragemId,
              empreendedorNome: n.empreendedorNome,
              tipoPessoa: n.tipoDocumentoIdentificacao,
              cpfCnpj: n.documentoIdentificacao,
              telefone: n.telefone,
              logradouro: n.logradouro,
              numero: n.numero,
              complemento: n.complemento,
              bairro: n.bairro,
              municipio: n.municipioEmpreendimento,
              uf: n.ufCorrespondencia,
              cep: n.cepCorrespondencia,
              carMt: n.carMt,
              nomeBarragem: n.nomeFantasia || n.barragens?.[0]?.nome,
              processo: n.numProcesso,
              analista: n.analista || n.analistas?.[0],
            });
            if (cpfNorm) existingCpfs.add(cpfNorm);
            if (empName) existingNames.add(empName);
            syncedAny = true;
          }
        }

        if (syncedAny) {
          await refreshEcosystem();
        }
      } catch (err) {
        console.warn('Aviso ao indexar registros existentes:', err);
      }
    };

    void indexExistingDocs();
  }, [docsLoading, pareceres, oficios, notificacoes, refreshEcosystem]);

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
      details: `Sincronização automática com Administra: empreendedor=${result.createdEmpreendedor ? 'novo' : 'atualizado/existente'}, barragem=${result.createdBarragem ? 'nova' : 'atualizada/existente'}, novos RTs=${result.createdRTCount}.`,
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
      const reviewed = await ecosystemRepository.reviewChangeRequest(
        id,
        decision,
        reviewerName,
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

  return (
    <EcosystemContext.Provider
      value={{
        empreendedores,
        barragens,
        responsaveisTecnicos,
        changeRequests,
        externalProducts,
        allEcosystemProducts,
        connections,
        pendingIncomingCount,
        loading,
        refreshEcosystem,
        canEditDirectly,
        saveEmpreendedor,
        deleteEmpreendedor,
        saveBarragem,
        deleteBarragem,
        saveResponsavelTecnico,
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
