-- ===============================================================
-- SCRIPT DE SEGURANÇA E ROBUSTECIMENTO (RLS)
-- Projeto: Notifica CSB - SEMA/MT
-- ===============================================================

-- 1. ATIVAR ROW LEVEL SECURITY (RLS)
-- Isso garante que ninguém acesse os dados sem uma política explícita.
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pareceres ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.oficios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pareceres_classificacao ENABLE ROW LEVEL SECURITY;

-- 2. FUNÇÃO AUXILIAR PARA VERIFICAR ADMIN
-- Verifica se o usuário logado tem a role 'Administrador' na tabela users.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'Administrador'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===============================================================
-- POLÍTICAS PARA A TABELA: users
-- ===============================================================

-- Admins podem ver todos os usuários
CREATE POLICY "Admins podem ver todos os usuários" 
ON public.users FOR SELECT 
TO authenticated 
USING (public.is_admin());

-- Usuários podem ver seu próprio perfil
CREATE POLICY "Usuários podem ver seu próprio perfil" 
ON public.users FOR SELECT 
TO authenticated 
USING (id = auth.uid());

-- Apenas Admins podem criar ou deletar usuários
CREATE POLICY "Apenas Admins gerenciam usuários" 
ON public.users FOR ALL 
TO authenticated 
USING (public.is_admin());


-- ===============================================================
-- POLÍTICAS PARA DOCUMENTOS (pareceres, oficios, notificacoes, etc)
-- ===============================================================

-- Regra Geral: Todos os autenticados podem ver os documentos (Colaboração)
CREATE POLICY "Leitura permitida para todos autenticados" 
ON public.pareceres FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leitura permitida para todos autenticados" 
ON public.oficios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leitura permitida para todos autenticados" 
ON public.notificacoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leitura permitida para todos autenticados" 
ON public.pareceres_classificacao FOR SELECT TO authenticated USING (true);

-- Regra de Escrita: Apenas o autor (user_id) ou Admin pode modificar
CREATE POLICY "Apenas autor ou admin pode inserir pareceres" 
ON public.pareceres FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Apenas autor ou admin pode atualizar pareceres" 
ON public.pareceres FOR UPDATE TO authenticated 
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Apenas autor ou admin pode deletar pareceres" 
ON public.pareceres FOR DELETE TO authenticated 
USING (auth.uid() = user_id OR public.is_admin());

-- (Repetir para oficios)
CREATE POLICY "Apenas autor ou admin pode gerenciar oficios" 
ON public.oficios FOR ALL TO authenticated 
USING (auth.uid() = user_id OR public.is_admin());

-- (Repetir para notificacoes)
CREATE POLICY "Apenas autor ou admin pode gerenciar notificacoes" 
ON public.notificacoes FOR ALL TO authenticated 
USING (auth.uid() = user_id OR public.is_admin());

-- (Repetir para pareceres_classificacao)
CREATE POLICY "Apenas autor ou admin pode gerenciar fiscalizacoes" 
ON public.pareceres_classificacao FOR ALL TO authenticated 
USING (auth.uid() = user_id OR public.is_admin());


-- ===============================================================
-- 3. AUTOMAÇÃO DE TIMESTAMPS (updated_at)
-- ===============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar o trigger em todas as tabelas
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pareceres FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.oficios FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notificacoes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pareceres_classificacao FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ===============================================================
-- 4. ÍNDICES DE PERFORMANCE
-- ===============================================================
CREATE INDEX IF NOT EXISTS idx_pareceres_user_id ON public.pareceres(user_id);
CREATE INDEX IF NOT EXISTS idx_oficios_user_id ON public.oficios(user_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_id ON public.notificacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_pareceres_status ON public.pareceres(status);

-- ===============================================================
-- 5. COLUNAS PLANAS DE PESQUISA E INTEGRAÇÃO (SEM JSON)
-- ===============================================================
ALTER TABLE IF EXISTS public.pareceres
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'Parecer Técnico',
  ADD COLUMN IF NOT EXISTS num_parecer_tecnico TEXT,
  ADD COLUMN IF NOT EXISTS processo TEXT,
  ADD COLUMN IF NOT EXISTS num_protocolo_analisado TEXT,
  ADD COLUMN IF NOT EXISTS data_parecer TEXT,
  ADD COLUMN IF NOT EXISTS data_recebimento_processo TEXT,
  ADD COLUMN IF NOT EXISTS data_protocolo TEXT,
  ADD COLUMN IF NOT EXISTS data_inspecao TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Rascunho',
  ADD COLUMN IF NOT EXISTS analista TEXT,
  ADD COLUMN IF NOT EXISTS analistas_nomes TEXT,
  ADD COLUMN IF NOT EXISTS analistas_outros TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_id TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_nome TEXT,
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS car_mt TEXT,
  ADD COLUMN IF NOT EXISTS barragem_id TEXT,
  ADD COLUMN IF NOT EXISTS barragem_nome TEXT,
  ADD COLUMN IF NOT EXISTS codigo_snisb TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS lat_gms TEXT,
  ADD COLUMN IF NOT EXISTS long_gms TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_ids TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_nomes TEXT,
  ADD COLUMN IF NOT EXISTS art_numero TEXT,
  ADD COLUMN IF NOT EXISTS art_atividade TEXT,
  ADD COLUMN IF NOT EXISTS pecas_tecnicas TEXT,
  ADD COLUMN IF NOT EXISTS pecas_tecnicas_outro TEXT,
  ADD COLUMN IF NOT EXISTS classificacao_barragem TEXT,
  ADD COLUMN IF NOT EXISTS classificacao_dpa TEXT,
  ADD COLUMN IF NOT EXISTS classificacao_cri TEXT,
  ADD COLUMN IF NOT EXISTS portaria_classificacao TEXT,
  ADD COLUMN IF NOT EXISTS parecer_classificacao TEXT,
  ADD COLUMN IF NOT EXISTS tem_oficio_pendencia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS oficio_id TEXT,
  ADD COLUMN IF NOT EXISTS analise_tecnica TEXT,
  ADD COLUMN IF NOT EXISTS conclusao TEXT,
  ADD COLUMN IF NOT EXISTS introducao_particularidade TEXT,
  ADD COLUMN IF NOT EXISTS apresentacao_relatorio_conclusao TEXT,
  ADD COLUMN IF NOT EXISTS dpa_nao_pnsb_texto TEXT,
  ADD COLUMN IF NOT EXISTS topicos_extras_texto TEXT,
  ADD COLUMN IF NOT EXISTS revisao_parecer_custom TEXT,
  ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'NOTIFICA';

ALTER TABLE IF EXISTS public.oficios
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT '1° Oficio de Pendencias',
  ADD COLUMN IF NOT EXISTS protocolo TEXT,
  ADD COLUMN IF NOT EXISTS processo TEXT,
  ADD COLUMN IF NOT EXISTS assunto TEXT,
  ADD COLUMN IF NOT EXISTS data_emissao TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Rascunho',
  ADD COLUMN IF NOT EXISTS situacao_cumprimento TEXT DEFAULT 'Pendente / Em aberto',
  ADD COLUMN IF NOT EXISTS prazo_cumprimento INTEGER DEFAULT 90,
  ADD COLUMN IF NOT EXISTS prorrogacao_prazo INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analista TEXT,
  ADD COLUMN IF NOT EXISTS analistas_nomes TEXT,
  ADD COLUMN IF NOT EXISTS analistas_outros TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_id TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_nome TEXT,
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS barragem_id TEXT,
  ADD COLUMN IF NOT EXISTS barragem_nome TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS lat_gms TEXT,
  ADD COLUMN IF NOT EXISTS long_gms TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_ids TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_nomes TEXT,
  ADD COLUMN IF NOT EXISTS art_numero TEXT,
  ADD COLUMN IF NOT EXISTS pendencias_texto TEXT,
  ADD COLUMN IF NOT EXISTS anotacoes_internas TEXT,
  ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'NOTIFICA';

ALTER TABLE IF EXISTS public.notificacoes
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'Notificação',
  ADD COLUMN IF NOT EXISTS notificacao_gerada TEXT,
  ADD COLUMN IF NOT EXISTS oficio_gerado TEXT,
  ADD COLUMN IF NOT EXISTS num_processo TEXT,
  ADD COLUMN IF NOT EXISTS data_notificacao TEXT,
  ADD COLUMN IF NOT EXISTS prazo_vencimento TEXT,
  ADD COLUMN IF NOT EXISTS situacao TEXT DEFAULT 'Em aberto',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Rascunho',
  ADD COLUMN IF NOT EXISTS analista TEXT,
  ADD COLUMN IF NOT EXISTS analistas_nomes TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_id TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_nome TEXT,
  ADD COLUMN IF NOT EXISTS tipo_documento_identificacao TEXT DEFAULT 'CPF',
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS car_mt TEXT,
  ADD COLUMN IF NOT EXISTS barragem_id TEXT,
  ADD COLUMN IF NOT EXISTS barragem_ids TEXT,
  ADD COLUMN IF NOT EXISTS barragem_nome TEXT,
  ADD COLUMN IF NOT EXISTS barragens_nomes TEXT,
  ADD COLUMN IF NOT EXISTS coordenadas_resumo TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS lat_gms TEXT,
  ADD COLUMN IF NOT EXISTS long_gms TEXT,
  ADD COLUMN IF NOT EXISTS objetivo TEXT,
  ADD COLUMN IF NOT EXISTS anotacoes_internas TEXT,
  ADD COLUMN IF NOT EXISTS texto_notificacao_custom TEXT,
  ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'NOTIFICA';

CREATE INDEX IF NOT EXISTS idx_pareceres_numero ON public.pareceres(num_parecer_tecnico);
CREATE INDEX IF NOT EXISTS idx_pareceres_data ON public.pareceres(data_parecer);
CREATE INDEX IF NOT EXISTS idx_pareceres_analista ON public.pareceres(analista);
CREATE INDEX IF NOT EXISTS idx_pareceres_tipo ON public.pareceres(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_pareceres_emp_id ON public.pareceres(empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_pareceres_bar_id ON public.pareceres(barragem_id);

CREATE INDEX IF NOT EXISTS idx_oficios_protocolo ON public.oficios(protocolo);
CREATE INDEX IF NOT EXISTS idx_oficios_data ON public.oficios(data_emissao);
CREATE INDEX IF NOT EXISTS idx_oficios_analista ON public.oficios(analista);
CREATE INDEX IF NOT EXISTS idx_oficios_tipo ON public.oficios(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_oficios_emp_id ON public.oficios(empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_oficios_bar_id ON public.oficios(barragem_id);

CREATE INDEX IF NOT EXISTS idx_notificacoes_numero ON public.notificacoes(notificacao_gerada);
CREATE INDEX IF NOT EXISTS idx_notificacoes_data ON public.notificacoes(data_notificacao);
CREATE INDEX IF NOT EXISTS idx_notificacoes_analista ON public.notificacoes(analista);
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo ON public.notificacoes(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_notificacoes_emp_id ON public.notificacoes(empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_bar_id ON public.notificacoes(barragem_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_car ON public.notificacoes(car_mt);
