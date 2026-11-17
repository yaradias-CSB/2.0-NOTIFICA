-- =====================================================================
-- SCHEMA CENTRAL DO ECOSSISTEMA ADMINISTRA BARRAGENS (SEMA/MT - SURH)
-- Tabelas e colunas suportadas pelos formulários do Notifica CSB
-- =====================================================================

-- 1. EMPREENDEDORES
CREATE TABLE IF NOT EXISTS public.empreendedores (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  razao_social TEXT,
  tipo_pessoa TEXT DEFAULT 'CPF',
  cpf_cnpj TEXT,
  cpf_cnpj_normalizado TEXT,
  telefone TEXT,
  email TEXT,
  logradouro TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  municipio TEXT,
  uf TEXT DEFAULT 'MT',
  cep TEXT,
  car_mt TEXT,
  situacao TEXT DEFAULT 'ativo',
  source_system TEXT DEFAULT 'ADMINISTRA',
  created_by_analyst TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.empreendedores
  ADD COLUMN IF NOT EXISTS razao_social TEXT,
  ADD COLUMN IF NOT EXISTS tipo_pessoa TEXT DEFAULT 'CPF',
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS cpf_cnpj_normalizado TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS logradouro TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT,
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT DEFAULT 'MT',
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS car_mt TEXT,
  ADD COLUMN IF NOT EXISTS situacao TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'ADMINISTRA',
  ADD COLUMN IF NOT EXISTS created_by_analyst TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_administra_emp_cpf_norm ON public.empreendedores(cpf_cnpj_normalizado);
CREATE INDEX IF NOT EXISTS idx_administra_emp_car_mt ON public.empreendedores(car_mt);
CREATE INDEX IF NOT EXISTS idx_administra_emp_nome ON public.empreendedores(nome);

-- 2. BARRAGENS
CREATE TABLE IF NOT EXISTS public.barragens (
  id TEXT PRIMARY KEY,
  empreendedor_id TEXT REFERENCES public.empreendedores(id) ON DELETE SET NULL,
  empreendedor TEXT,
  empreendedor_nome TEXT,
  empreendedor_cpf_cnpj TEXT,
  nome TEXT,
  nome_barragem TEXT,
  empreendimento TEXT,
  snisb TEXT,
  codigo_snisb TEXT,
  processo TEXT,
  processo_referencia TEXT,
  municipio TEXT,
  uf TEXT DEFAULT 'MT',
  curso_agua TEXT,
  curso_agua_barrado TEXT,
  uso_preponderante TEXT,
  situacao TEXT,
  situacao_empreendimento TEXT,
  tipo_barragem TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  coordenadas_gms JSONB,
  lat_gms TEXT,
  long_gms TEXT,
  altura TEXT,
  volume TEXT,
  largura_coroamento TEXT,
  comprimento_coroamento TEXT,
  classificacao_barragem TEXT,
  dano_potencial TEXT,
  classificacao_dpa TEXT,
  categoria_risco TEXT,
  classificacao_cri TEXT,
  portaria_classificacao TEXT,
  parecer_classificacao TEXT,
  source_system TEXT DEFAULT 'ADMINISTRA',
  created_by_analyst TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.barragens
  ADD COLUMN IF NOT EXISTS empreendedor_id TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_nome TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS nome TEXT,
  ADD COLUMN IF NOT EXISTS nome_barragem TEXT,
  ADD COLUMN IF NOT EXISTS empreendimento TEXT,
  ADD COLUMN IF NOT EXISTS snisb TEXT,
  ADD COLUMN IF NOT EXISTS codigo_snisb TEXT,
  ADD COLUMN IF NOT EXISTS processo TEXT,
  ADD COLUMN IF NOT EXISTS processo_referencia TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT DEFAULT 'MT',
  ADD COLUMN IF NOT EXISTS curso_agua TEXT,
  ADD COLUMN IF NOT EXISTS curso_agua_barrado TEXT,
  ADD COLUMN IF NOT EXISTS uso_preponderante TEXT,
  ADD COLUMN IF NOT EXISTS situacao TEXT,
  ADD COLUMN IF NOT EXISTS situacao_empreendimento TEXT,
  ADD COLUMN IF NOT EXISTS tipo_barragem TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS coordenadas_gms JSONB,
  ADD COLUMN IF NOT EXISTS lat_gms TEXT,
  ADD COLUMN IF NOT EXISTS long_gms TEXT,
  ADD COLUMN IF NOT EXISTS altura TEXT,
  ADD COLUMN IF NOT EXISTS volume TEXT,
  ADD COLUMN IF NOT EXISTS largura_coroamento TEXT,
  ADD COLUMN IF NOT EXISTS comprimento_coroamento TEXT,
  ADD COLUMN IF NOT EXISTS classificacao_barragem TEXT,
  ADD COLUMN IF NOT EXISTS dano_potencial TEXT,
  ADD COLUMN IF NOT EXISTS classificacao_dpa TEXT,
  ADD COLUMN IF NOT EXISTS categoria_risco TEXT,
  ADD COLUMN IF NOT EXISTS classificacao_cri TEXT,
  ADD COLUMN IF NOT EXISTS portaria_classificacao TEXT,
  ADD COLUMN IF NOT EXISTS parecer_classificacao TEXT,
  ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'ADMINISTRA',
  ADD COLUMN IF NOT EXISTS created_by_analyst TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_administra_bar_emp_id ON public.barragens(empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_administra_bar_snisb ON public.barragens(codigo_snisb);
CREATE INDEX IF NOT EXISTS idx_administra_bar_nome ON public.barragens(nome_barragem);
CREATE INDEX IF NOT EXISTS idx_administra_bar_municipio ON public.barragens(municipio);

-- 3. RESPONSÁVEIS TÉCNICOS (rts)
CREATE TABLE IF NOT EXISTS public.rts (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT,
  conselho TEXT,
  uf_conselho TEXT DEFAULT 'MT',
  registro TEXT,
  registro_profissional TEXT,
  especialidades TEXT,
  formacao_profissional TEXT,
  art TEXT,
  art_rrt TEXT,
  barragem_vinculada TEXT,
  telefone TEXT,
  email TEXT,
  situacao TEXT DEFAULT 'ativo',
  observacoes TEXT,
  source_system TEXT DEFAULT 'ADMINISTRA',
  created_by_analyst TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.rts
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS conselho TEXT,
  ADD COLUMN IF NOT EXISTS uf_conselho TEXT DEFAULT 'MT',
  ADD COLUMN IF NOT EXISTS registro TEXT,
  ADD COLUMN IF NOT EXISTS registro_profissional TEXT,
  ADD COLUMN IF NOT EXISTS especialidades TEXT,
  ADD COLUMN IF NOT EXISTS formacao_profissional TEXT,
  ADD COLUMN IF NOT EXISTS art TEXT,
  ADD COLUMN IF NOT EXISTS art_rrt TEXT,
  ADD COLUMN IF NOT EXISTS barragem_vinculada TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS situacao TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'ADMINISTRA',
  ADD COLUMN IF NOT EXISTS created_by_analyst TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_administra_rts_nome ON public.rts(nome);
CREATE INDEX IF NOT EXISTS idx_administra_rts_cpf ON public.rts(cpf);
CREATE INDEX IF NOT EXISTS idx_administra_rts_art ON public.rts(art);

-- 4. VÍNCULOS DE ART POR BARRAGEM E RT (responsaveis_tecnicos_barragens)
CREATE TABLE IF NOT EXISTS public.responsaveis_tecnicos_barragens (
  id TEXT PRIMARY KEY,
  rt_id TEXT REFERENCES public.rts(id) ON DELETE SET NULL,
  barragem_id TEXT REFERENCES public.barragens(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  art TEXT,
  art_rrt TEXT,
  conselho TEXT,
  processo TEXT,
  situacao TEXT DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.responsaveis_tecnicos_barragens
  ADD COLUMN IF NOT EXISTS rt_id TEXT,
  ADD COLUMN IF NOT EXISTS barragem_id TEXT,
  ADD COLUMN IF NOT EXISTS nome TEXT,
  ADD COLUMN IF NOT EXISTS art TEXT,
  ADD COLUMN IF NOT EXISTS art_rrt TEXT,
  ADD COLUMN IF NOT EXISTS conselho TEXT,
  ADD COLUMN IF NOT EXISTS processo TEXT,
  ADD COLUMN IF NOT EXISTS situacao TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_administra_rt_bar_rt_id ON public.responsaveis_tecnicos_barragens(rt_id);
CREATE INDEX IF NOT EXISTS idx_administra_rt_bar_bar_id ON public.responsaveis_tecnicos_barragens(barragem_id);
CREATE INDEX IF NOT EXISTS idx_administra_rt_bar_art ON public.responsaveis_tecnicos_barragens(art);
