import { auth } from "./firebase";

async function getToken(): Promise<string | null> {
  const u = auth.currentUser;
  if (!u) return null;
  try {
    return await u.getIdToken();
  } catch {
    return null;
  }
}

function headersWithAuth(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const token = await getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...headersWithAuth(token),
      ...(init?.headers || {}),
    },
  });
  return res;
}

export async function apiJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** Unauthenticated JSON (public landing pages). */
export async function publicJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function publicPostJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** Binary download with Firebase auth (e.g. QR PNG). */
export async function apiBlob(path: string): Promise<Blob> {
  const token = await getToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.blob();
}
