import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole } from '../types';

export interface ActiveAuthUserSnapshot {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
}

let supabaseInstance: SupabaseClient | null = null;
let activeAuthUserSnapshot: ActiveAuthUserSnapshot | null = null;

function readSupabaseEnv(): { url: string; anonKey: string } {
  const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = readSupabaseEnv();
  return Boolean(url && anonKey);
}

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const { url, anonKey } = readSupabaseEnv();
  if (!url || !anonKey) {
    throw new Error(
      'Configuração do Supabase Auth ausente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
    );
  }

  supabaseInstance = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseInstance;
}

export function setActiveAuthUser(snapshot: ActiveAuthUserSnapshot | null): void {
  activeAuthUserSnapshot = snapshot;
}

export function getActiveAuthUser(): ActiveAuthUserSnapshot | null {
  return activeAuthUserSnapshot;
}

export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const session = data.session;
    if (!session) return null;

    const expiresAtMs =
      typeof session.expires_at === 'number' ? session.expires_at * 1000 : null;
    if (expiresAtMs !== null && expiresAtMs <= Date.now() + 30_000) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session?.access_token) {
        return refreshed.session.access_token;
      }
    }

    return session.access_token ?? null;
  } catch {
    return null;
  }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const hasExplicitAuth = headers.has('Authorization');
  const token = hasExplicitAuth ? null : await getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    !hasExplicitAuth &&
    isSupabaseConfigured() &&
    !(typeof ReadableStream !== 'undefined' && init.body instanceof ReadableStream)
  ) {
    try {
      const { data: refreshed, error } = await getSupabaseClient().auth.refreshSession();
      const refreshedToken = !error ? refreshed.session?.access_token : null;
      if (refreshedToken && refreshedToken !== token) {
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
        return fetch(input, {
          ...init,
          headers: retryHeaders,
        });
      }
    } catch {
      // Mantém a resposta 401 original se a renovação de sessão falhar
    }
  }

  return response;
}
