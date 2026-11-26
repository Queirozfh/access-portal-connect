import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

function applySecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const path = new URL(request.url).pathname;
  const scripts = path.startsWith('/meu-patrimonio/')
    ? "script-src 'self' 'sha256-wiHcl0QZqiMWljxEM4RZGm3Ncs3pwmpvf3SG2j3d5VM=' https://accounts.google.com"
    : path === '/contas-do-mes.html'
      ? "script-src 'self' 'sha256-cYtZkDiHeMZrCDHWcd/Q5GMYlx7TF54aO92x9JUVkqc=' 'sha256-G5p1MZ2aCShTBvB8NYVR6nqvRSDU8zlrEDbXzbal/VI=' https://accounts.google.com"
      : "script-src 'self' 'unsafe-inline' https://accounts.google.com";
  headers.set('Content-Security-Policy', [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com", scripts,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob:",
    "connect-src 'self' https://c--445ea0b9-2520-4ebf-8832-751b19b49956-prod.lovable.cloud https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com",
    "frame-src 'self' https://accounts.google.com", "worker-src 'self' blob:",
  ].join('; '));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (path.startsWith('/api/')) { headers.set('Cache-Control', 'no-store, max-age=0'); headers.set('Pragma', 'no-cache'); }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(request, new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
    }
  },
};
