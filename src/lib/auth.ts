// src/lib/auth.ts
// ============================================================
// CONTEXTO DE AUTENTICACIÓN — TuxtlasGO
// ============================================================
// Maneja el estado de sesión del usuario usando localStorage
// para persistir entre recargas. Las llamadas al servidor
// usan los endpoints de /api/auth/*.
// ============================================================

export interface UsuarioSesion {
  id: number;
  nombre: string;
  correo: string;
  tipo: 'turista' | 'prestador' | 'admin';
  foto_url?: string;
}

const TOKEN_KEY = 'tuxtlasgo-token';
const USUARIO_KEY = 'tuxtlasgo-usuario';

// ─── Token ────────────────────────────────────────────────
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function removeToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
  } catch {}
}

// ─── Usuario en caché ─────────────────────────────────────
export function getUsuarioLocal(): UsuarioSesion | null {
  try {
    const json = localStorage.getItem(USUARIO_KEY);
    return json ? JSON.parse(json) : null;
  } catch { return null; }
}

export function setUsuarioLocal(u: UsuarioSesion): void {
  try { localStorage.setItem(USUARIO_KEY, JSON.stringify(u)); } catch {}
}

// ─── Llamadas a la API ────────────────────────────────────
export async function apiRegistro(datos: {
  nombre: string;
  correo: string;
  password: string;
  tipo: 'turista' | 'prestador';
}): Promise<{ ok: boolean; error?: string; codigoRecuperacion?: string; usuario?: UsuarioSesion; token?: string }> {
  try {
    const res = await fetch('/api/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const data = await res.json();
    if (data.ok) {
      // Auto-login después del registro
      const loginRes = await apiLogin({ correo: datos.correo, password: datos.password });
      return { ...data, ...loginRes };
    }
    return data;
  } catch {
    return { ok: false, error: 'Error de conexión. Verifica tu internet.' };
  }
}

export async function apiLogin(datos: {
  correo: string;
  password: string;
}): Promise<{ ok: boolean; error?: string; usuario?: UsuarioSesion; token?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const data = await res.json();
    if (data.ok && data.token) {
      setToken(data.token);
      setUsuarioLocal(data.usuario);
    }
    return data;
  } catch {
    return { ok: false, error: 'Error de conexión. Verifica tu internet.' };
  }
}

export async function apiLogout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await fetch('/api/auth/perfil', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
  removeToken();
}

export async function apiPerfil(): Promise<{
  ok: boolean;
  usuario?: UsuarioSesion;
  servicio?: object;
} | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/perfil', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { removeToken(); return null; }
    return res.json();
  } catch { return null; }
}

export async function apiRecuperar(datos: {
  correo: string;
  codigoRecuperacion: string;
  nuevaPassword: string;
}): Promise<{ ok: boolean; error?: string; mensaje?: string }> {
  try {
    const res = await fetch('/api/auth/recuperar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    return res.json();
  } catch {
    return { ok: false, error: 'Error de conexión.' };
  }
}
