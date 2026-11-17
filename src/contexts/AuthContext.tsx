import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setActiveAuthUser,
} from '../lib/supabase';
import { UserRole } from '../types';

export interface PerfilUsuario {
  id?: string;
  email: string;
  nome: string;
  perfil: UserRole;
  status: string;
}

interface AuthContextValue {
  session: Session | null;
  user: SupabaseUser | null;
  profile: PerfilUsuario | null;
  role: UserRole | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  isAdmin: boolean;
  isAnalista: boolean;
  isVisualizador: boolean;
  canEdit: boolean;
  canDelete: boolean;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizePerfilRole(raw: unknown): UserRole | null {
  const val = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (val === 'administrador' || val === 'admin') return 'Administrador';
  if (val === 'analista') return 'Analista';
  if (val === 'visualizador' || val === 'leitor') return 'Visualizador';
  return null;
}

function escapeIlikeLiteral(value: string): string {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

async function fetchActiveUserProfile(email: string): Promise<{
  profile: PerfilUsuario | null;
  error?: string;
}> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { profile: null, error: 'E-mail da sessão inválido.' };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('perfis_usuarios')
    .select('id, email, nome, perfil, status')
    .ilike('email', escapeIlikeLiteral(normalizedEmail))
    .limit(10);

  if (error) {
    return {
      profile: null,
      error: 'Não foi possível validar o perfil de usuário no sistema.',
    };
  }

  const rows = Array.isArray(data) ? data : [];
  const matched = rows.find(
    (row) => String(row.email || '').trim().toLowerCase() === normalizedEmail
  );

  if (!matched) {
    return {
      profile: null,
      error: 'Usuário autenticado não possui perfil cadastrado em perfis_usuarios.',
    };
  }

  const statusNormalized = String(matched.status || '').trim().toLowerCase();
  if (statusNormalized !== 'ativo') {
    return {
      profile: null,
      error: 'Seu perfil de acesso está inativo ou bloqueado. Contate um Administrador.',
    };
  }

  const role = normalizePerfilRole(matched.perfil);
  if (!role) {
    return {
      profile: null,
      error: 'Perfil de acesso inválido. Contate um Administrador.',
    };
  }

  return {
    profile: {
      id: matched.id ? String(matched.id) : undefined,
      email: String(matched.email || normalizedEmail).trim(),
      nome: String(matched.nome || normalizedEmail).trim(),
      perfil: role,
      status: String(matched.status || 'ativo').trim(),
    },
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<PerfilUsuario | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);
  const [error, setError] = useState<string | null>(
    configured
      ? null
      : 'Configuração do Supabase Auth ausente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
  );

  const applyUnauthenticated = useCallback((message?: string | null) => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setActiveAuthUser(null);
    if (message !== undefined) {
      setError(message);
    }
  }, []);

  const verifyAndApplySession = useCallback(
    async (nextSession: Session | null): Promise<{ ok: boolean; error?: string }> => {
      if (!nextSession?.user?.email) {
        applyUnauthenticated(null);
        return { ok: false };
      }

      const result = await fetchActiveUserProfile(nextSession.user.email);
      if (!result.profile) {
        try {
          await getSupabaseClient().auth.signOut();
        } catch {
          // Ignore signOut failure
        }
        const msg = result.error || 'Acesso bloqueado: perfil inexistente ou inativo.';
        applyUnauthenticated(msg);
        return { ok: false, error: msg };
      }

      setSession(nextSession);
      setUser(nextSession.user);
      setProfile(result.profile);
      setError(null);
      setActiveAuthUser({
        id: nextSession.user.id,
        email: result.profile.email || nextSession.user.email,
        name: result.profile.nome || nextSession.user.email,
        role: result.profile.perfil,
        status: result.profile.status,
      });
      return { ok: true };
    },
    [applyUnauthenticated]
  );

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const supabase = getSupabaseClient();

    const init = async () => {
      try {
        const { data, error: sessionErr } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (sessionErr) {
          applyUnauthenticated('Não foi possível restaurar a sessão de autenticação.');
          return;
        }
        await verifyAndApplySession(data.session);
      } catch {
        if (isMounted) {
          applyUnauthenticated('Erro ao inicializar a autenticação.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !nextSession) {
        applyUnauthenticated(undefined);
        setLoading(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        void verifyAndApplySession(nextSession);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [configured, applyUnauthenticated, verifyAndApplySession]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      if (!configured) {
        const msg =
          'Configuração do Supabase Auth ausente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).';
        setError(msg);
        return { success: false, error: msg };
      }

      setError(null);
      try {
        const supabase = getSupabaseClient();
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInErr || !data.session) {
          const msg =
            signInErr?.message === 'Invalid login credentials'
              ? 'E-mail ou senha inválidos.'
              : signInErr?.message || 'Não foi possível autenticar.';
          setError(msg);
          return { success: false, error: msg };
        }

        const verified = await verifyAndApplySession(data.session);
        if (!verified.ok) {
          return { success: false, error: verified.error };
        }
        return { success: true };
      } catch (err: any) {
        const msg = err?.message || 'Erro ao realizar login.';
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [configured, verifyAndApplySession]
  );

  const signOut = useCallback(async () => {
    if (configured) {
      try {
        await getSupabaseClient().auth.signOut();
      } catch {
        // Ignore remote signOut error
      }
    }
    applyUnauthenticated(null);
  }, [configured, applyUnauthenticated]);

  const clearError = useCallback(() => setError(null), []);

  const role = profile?.perfil ?? null;
  const isAdmin = role === 'Administrador';
  const isAnalista = role === 'Analista';
  const isVisualizador = role === 'Visualizador';
  const canEdit = isAdmin || isAnalista;
  const canDelete = isAdmin;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      role,
      loading,
      error,
      isConfigured: configured,
      isAdmin,
      isAnalista,
      isVisualizador,
      canEdit,
      canDelete,
      clearError,
      signIn,
      signOut,
    }),
    [
      session,
      user,
      profile,
      role,
      loading,
      error,
      configured,
      isAdmin,
      isAnalista,
      isVisualizador,
      canEdit,
      canDelete,
      clearError,
      signIn,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider.');
  }
  return ctx;
}
