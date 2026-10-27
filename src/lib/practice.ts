"use client";

/**
 * Practice mode (see src/server/practice.ts): this browser works on a separate copy of the data. The server
 * sets the `pr_practice` cookie; screens read it to show the banner and to skip backups to the PC folder.
 */
const COOKIE = "pr_practice";

export const isPractice = () => typeof document !== "undefined" && document.cookie.split("; ").includes(`${COOKIE}=1`);

/** open · leave · reset — then load every screen again from the database now in use. Returns an error message. */
export async function practice(action: "open" | "leave" | "reset"): Promise<string | null> {
  try {
    const res = await fetch("/api/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }), cache: "no-store" });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return "Can't reach the server — check the connection and try again";
  }
  // a full page load on purpose: nothing loaded from the other database may stay on screen
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (action !== "reset" || isPractice()) window.location.assign("/dashboard");
  return null;
}
