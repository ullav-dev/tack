import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

function route(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  // Proxy /api/dam/* → ullav-dam-server (must come before the general /api/* rule)
  if (pathname.startsWith("/api/dam/")) {
    const damUrl = process.env.DAM_URL ?? "http://localhost:8080";
    return NextResponse.rewrite(
      new URL(pathname.slice("/api/dam".length) + search, damUrl)
    );
  }

  // Proxy /api/* → tack-server (strips /api prefix)
  if (pathname.startsWith("/api/")) {
    const apiUrl = process.env.API_URL ?? "http://localhost:8087";
    return NextResponse.rewrite(
      new URL(pathname.slice("/api".length) + search, apiUrl)
    );
  }

  // Proxy /auth-api/* → ullav-user-management (strips /auth-api prefix)
  if (pathname.startsWith("/auth-api/")) {
    const authUrl = process.env.AUTH_URL ?? "http://localhost:8081";
    return NextResponse.rewrite(
      new URL(pathname.slice("/auth-api".length) + search, authUrl)
    );
  }

  return intlMiddleware(request) as NextResponse;
}

export function proxy(request: NextRequest) {
  const response = route(request);
  const portalUrl =
    process.env.PORTAL_URL ?? "https://setanta-portal.ullav.com http://localhost:3003";
  response.headers.set("Content-Security-Policy", `frame-ancestors 'self' ${portalUrl}`);
  return response;
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
