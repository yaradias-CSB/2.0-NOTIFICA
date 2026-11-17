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
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    headers,
  });
}
