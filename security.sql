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
-- 5. SUPORTE A MÚLTIPLAS COORDENADAS DE BARRAGENS (NOTIFICAÇÕES)
-- ===============================================================
ALTER TABLE public.notificacoes 
ADD COLUMN IF NOT EXISTS barragens JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notificacoes_barragens ON public.notificacoes USING gin (barragens);

UPDATE public.notificacoes 
SET barragens = COALESCE(payload->'barragens', '[]'::jsonb)
WHERE barragens IS NULL OR barragens = '[]'::jsonb;

COMMENT ON COLUMN public.notificacoes.barragens IS 'Lista ordenada de coordenadas e barragens identificadas na propriedade';
