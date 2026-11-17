import { User } from '../types';
import { UserRepository } from './types';
import { safeJsonParse, sanitizeObject, stripSensitiveFields } from '../lib/security';

const USERS_STORAGE_KEY = 'notifica_csb_users';
const LEGACY_USERS_KEY = 'sema_mt_users';

function stripUserRecord(user: any): User {
  const clean = sanitizeObject(stripSensitiveFields(user)) as User;
  return {
    id: clean.id,
    name: clean.name || '',
    username: clean.username || '',
    role: clean.role || 'Analista',
    active: clean.active !== undefined ? Boolean(clean.active) : true,
    matricula: clean.matricula,
  };
}

function readUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY) || localStorage.getItem(LEGACY_USERS_KEY);
    const parsed = safeJsonParse<unknown[]>(raw, []);
    return Array.isArray(parsed) ? parsed.map(stripUserRecord) : [];
  } catch (err) {
    console.warn('Erro ao ler usuários locais:', err);
    return [];
  }
}

function writeUsers(users: User[]): void {
  try {
    const sanitized = users.map(stripUserRecord);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('Erro ao salvar usuários locais:', err);
  }
}

export class LocalUserRepository implements UserRepository {
  async getUsers(): Promise<User[]> {
    return readUsers().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  async createUser(user: Omit<User, 'id'>): Promise<User> {
    const users = readUsers();
    const cleanInput = stripUserRecord(user);
    const exists = users.some(
      (u) => u.username.trim().toLowerCase() === cleanInput.username.trim().toLowerCase()
    );
    if (exists) {
      throw new Error('Este e-mail/usuário já está cadastrado.');
    }

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newUser: User = {
      ...cleanInput,
      id,
    };

    writeUsers([...users, newUser]);
    return newUser;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    const users = readUsers();
    const cleanPatch = sanitizeObject(stripSensitiveFields(data));
    if (cleanPatch.username) {
      const duplicate = users.some(
        (u) => u.id !== id && u.username.trim().toLowerCase() === cleanPatch.username!.trim().toLowerCase()
      );
      if (duplicate) {
        throw new Error('Este e-mail/usuário já está sendo usado por outro usuário.');
      }
    }

    let updatedUser: User | null = null;
    const updatedList = users.map((u) => {
      if (u.id === id) {
        updatedUser = stripUserRecord({ ...u, ...cleanPatch, id: u.id });
        return updatedUser;
      }
      return u;
    });

    writeUsers(updatedList);
    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    const users = readUsers();
    writeUsers(users.filter((u) => u.id !== id));
  }
}
