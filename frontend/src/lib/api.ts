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
