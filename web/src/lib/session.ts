// Gestión de MULTI-SESIÓN para el panel.
//
// Idea:
//  - localStorage guarda un POOL de sesiones (varias cuentas a la vez):
//      los2hermanos_sessions = { [username]: { access_token, user } }
//  - sessionStorage guarda la CUENTA ACTIVA de ESTA pestaña:
//      los2hermanos_active = username
//
// Así podés tener admin en una pestaña y un chofer en otra, y cambiar de
// cuenta con el selector sin perder ninguna sesión.

const SESSIONS_KEY = "los2hermanos_sessions";
const ACTIVE_KEY = "los2hermanos_active";

// Claves del sistema anterior (una sola sesión). Se migran automáticamente.
const LEGACY_TOKEN_KEY = "los2hermanos_access_token";
const LEGACY_USER_KEY = "los2hermanos_user";

export type StoredSession = {
  access_token: string;
  user: any;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Migra la sesión única del sistema anterior al pool multi-cuenta. */
function migrateLegacySession() {
  if (typeof window === "undefined") return;
  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!legacyToken) return;

  const legacyUser = safeParse<any>(localStorage.getItem(LEGACY_USER_KEY), null);
  const username = legacyUser?.nombre || legacyUser?.email || "usuario";

  const all = safeParse<Record<string, StoredSession>>(localStorage.getItem(SESSIONS_KEY), {});
  if (!all[username]) {
    all[username] = { access_token: legacyToken, user: legacyUser };
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  }
  if (!sessionStorage.getItem(ACTIVE_KEY)) {
    sessionStorage.setItem(ACTIVE_KEY, username);
  }
  // Limpiamos las claves viejas.
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

/** Todas las cuentas guardadas en este navegador. */
export function getAllSessions(): Record<string, StoredSession> {
  if (typeof window === "undefined") return {};
  migrateLegacySession();
  return safeParse(localStorage.getItem(SESSIONS_KEY), {});
}

/** Username de la cuenta activa en ESTA pestaña. */
export function getActiveUsername(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACTIVE_KEY);
}

/** Sesión completa de la cuenta activa en esta pestaña. */
export function getActiveSession(): StoredSession | null {
  const username = getActiveUsername();
  if (!username) return null;
  return getAllSessions()[username] || null;
}

/** Token de la cuenta activa (para Authorization Bearer). */
export function getToken(): string | null {
  return getActiveSession()?.access_token || null;
}

/** Perfil de la cuenta activa. */
export function getUser(): any {
  return getActiveSession()?.user || null;
}

/** Guarda (o actualiza) una cuenta y la deja como activa en esta pestaña. */
export function saveSession(username: string, session: StoredSession) {
  const all = getAllSessions();
  all[username] = session;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  sessionStorage.setItem(ACTIVE_KEY, username);
}

/** Cambia la cuenta activa de ESTA pestaña (sin borrar las demás). */
export function setActiveSession(username: string) {
  const all = getAllSessions();
  if (all[username]) {
    sessionStorage.setItem(ACTIVE_KEY, username);
  }
}

/** Elimina una cuenta del pool. Si era la activa, limpia la pestaña. */
export function removeSession(username: string) {
  const all = getAllSessions();
  delete all[username];
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  if (getActiveUsername() === username) {
    sessionStorage.removeItem(ACTIVE_KEY);
  }
}

/** Cierra la sesión de la cuenta activa en esta pestaña. */
export function logoutActive() {
  const username = getActiveUsername();
  if (username) {
    removeSession(username);
  } else {
    sessionStorage.removeItem(ACTIVE_KEY);
  }
}