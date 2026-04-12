/** Emails allowed to open /admin (must match backend ADMIN_EMAILS). Comma-separated in VITE_ADMIN_EMAILS. */
const DEFAULT_ADMIN = "pranav.narkhede@somaiya.edu";

function adminEmailList(): string[] {
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;
  const s = raw && raw.trim() ? raw.trim() : DEFAULT_ADMIN;
  return s
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailList().includes(email.trim().toLowerCase());
}
