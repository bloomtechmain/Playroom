import { NextResponse, type NextRequest } from "next/server";

/**
 * Cross-site request forgery guard for the API: a write must come from a page on this site. Browsers
 * send Origin (and Sec-Fetch-Site) with every POST/PATCH/DELETE, so a form or script on another site
 * can't make a signed-in browser change anything. The session cookie's SameSite=Lax covers most of this;
 * this also covers browsers and hosts where "same site" is wider than this one origin.
 */
export function proxy(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return NextResponse.next();
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  const host = req.headers.get("host"); // Caddy passes the browser's Host through
  let sameOrigin = !origin; // no Origin: not a browser page (e.g. curl), which carries no one's session by accident
  if (origin) {
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin || (site && site !== "same-origin" && site !== "none")) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
