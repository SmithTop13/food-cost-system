import { NextResponse, type NextRequest } from "next/server";

/**
 * Same-origin proxy from the browser to the API. The session token lives only in an httpOnly
 * cookie set here, so page scripts can never read it; this route adds it as a Bearer token.
 *
 * CSRF: the cookie is SameSite=Lax, and every state-changing request must carry the
 * `x-fcs-csrf` header, which other sites cannot add to a cross-site request.
 */
export const dynamic = "force-dynamic";

const COOKIE = "fcs_session";
/** Responses on these paths carry a new session token, which we move into the cookie. */
const SESSION_PATHS = new Set(["v1/auth/login", "v1/signup"]);
const LOGOUT_PATH = "v1/auth/logout";

function apiUrl(): string {
  return process.env["API_URL"] ?? "http://localhost:3000";
}

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    // Browsers accept Secure cookies on http://localhost, so this stays on except when asked.
    secure: process.env["COOKIE_SECURE"] !== "false",
    sameSite: "lax" as const,
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!path.startsWith("v1/")) return NextResponse.json({ error: "not found" }, { status: 404 });

  const safe = request.method === "GET" || request.method === "HEAD";
  if (!safe && request.headers.get("x-fcs-csrf") !== "1") {
    return NextResponse.json({ error: "missing CSRF header" }, { status: 403 });
  }

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) headers.set("if-none-match", ifNoneMatch);
  // The API rate-limits by client address. Pass X-Forwarded-For on only when a load balancer
  // in front of the dashboard sets it; otherwise a browser could invent it to dodge limits.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor && process.env["TRUST_FORWARDED_FOR"] === "true") headers.set("x-forwarded-for", forwardedFor);
  const token = request.cookies.get(COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);

  const upstream = await fetch(`${apiUrl()}/${path}${request.nextUrl.search}`, {
    method: request.method,
    headers,
    ...(safe ? {} : { body: await request.arrayBuffer() }),
    cache: "no-store",
    redirect: "manual",
  });

  const passHeaders = new Headers();
  for (const name of ["content-type", "etag", "retry-after"]) {
    const value = upstream.headers.get(name);
    if (value) passHeaders.set(name, value);
  }

  // New session: keep the token in the cookie, never in the page.
  if (SESSION_PATHS.has(path) && upstream.ok) {
    const { token: newToken, expiresAt, ...rest } = (await upstream.json()) as Record<string, unknown>;
    const response = NextResponse.json(rest, { status: upstream.status });
    response.cookies.set(COOKIE, String(newToken), cookieOptions(new Date(String(expiresAt))));
    return response;
  }

  const body = upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer();
  const response = new NextResponse(body, { status: upstream.status, headers: passHeaders });
  // Signed out, or the session expired or was revoked: drop the cookie.
  if (path === LOGOUT_PATH || (upstream.status === 401 && token)) response.cookies.set(COOKIE, "", cookieOptions(new Date(0)));
  return response;
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
