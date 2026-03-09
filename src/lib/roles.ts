export type Role = "staff" | "viewer";

export function getRole(): Role | null {
  if (typeof window === "undefined") return null;
  const role = localStorage.getItem("role");
  if (role === "staff" || role === "viewer") return role;
  return null;
}

export function setRole(role: Role) {
  if (typeof window === "undefined") return;
  localStorage.setItem("role", role);
}

export function getViewerName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("viewer_name") || "";
}

export function setViewerName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("viewer_name", name);
}

export function clearRole() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("role");
  localStorage.removeItem("viewer_name");
}