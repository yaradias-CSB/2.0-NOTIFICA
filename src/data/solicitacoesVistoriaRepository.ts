import { authFetch } from '../lib/supabase';
import type {
  CreateSolicitacaoVistoriaInput,
  SolicitacaoVistoriaRecord,
  UpdateSolicitacaoVistoriaInput,
} from '../types/solicitacoesVistoria';

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data === 'object' && typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }
  } catch {
    // ignore json parse failure
  }
  return fallback;
}

export async function listSolicitacoesVistoria(): Promise<SolicitacaoVistoriaRecord[]> {
  const res = await authFetch('/api/solicitacoes-vistoria');
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Não foi possível carregar as solicitações de vistoria.'));
  }
  const data = (await res.json()) as { solicitacoes?: SolicitacaoVistoriaRecord[] };
  return Array.isArray(data?.solicitacoes) ? data.solicitacoes : [];
}

export async function createSolicitacaoVistoria(
  input: CreateSolicitacaoVistoriaInput
): Promise<SolicitacaoVistoriaRecord> {
  const res = await authFetch('/api/solicitacoes-vistoria', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Não foi possível enviar a solicitação de vistoria.'));
  }
  const data = (await res.json()) as { solicitacao?: SolicitacaoVistoriaRecord };
  if (!data?.solicitacao) {
    throw new Error('Resposta inválida ao registrar solicitação de vistoria.');
  }
  return data.solicitacao;
}

export async function updateSolicitacaoVistoria(
  id: string,
  input: UpdateSolicitacaoVistoriaInput
): Promise<SolicitacaoVistoriaRecord> {
  const res = await authFetch(`/api/solicitacoes-vistoria/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Não foi possível atualizar a solicitação de vistoria.'));
  }
  const data = (await res.json()) as { solicitacao?: SolicitacaoVistoriaRecord };
  if (!data?.solicitacao) {
    throw new Error('Resposta inválida ao atualizar solicitação de vistoria.');
  }
  return data.solicitacao;
}

export async function cancelSolicitacaoVistoria(
  id: string,
  motivo_cancelamento?: string
): Promise<SolicitacaoVistoriaRecord> {
  const res = await authFetch(`/api/solicitacoes-vistoria/${encodeURIComponent(id)}/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(motivo_cancelamento ? { motivo_cancelamento } : {}),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Não foi possível cancelar a solicitação de vistoria.'));
  }
  const data = (await res.json()) as { solicitacao?: SolicitacaoVistoriaRecord };
  if (!data?.solicitacao) {
    throw new Error('Resposta inválida ao cancelar solicitação de vistoria.');
  }
  return data.solicitacao;
}

export async function updateSolicitacaoObservacaoCampo(
  id: string,
  observacao_campo: string
): Promise<SolicitacaoVistoriaRecord> {
  const res = await authFetch(`/api/solicitacoes-vistoria/${encodeURIComponent(id)}/observacao`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observacao_campo }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Não foi possível salvar a observação de campo.'));
  }
  const data = (await res.json()) as { solicitacao?: SolicitacaoVistoriaRecord };
  if (!data?.solicitacao) {
    throw new Error('Resposta inválida ao atualizar observação de campo.');
  }
  return data.solicitacao;
}
