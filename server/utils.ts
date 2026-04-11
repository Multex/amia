import { Request } from "express";

export function getClientIp(request: Request): string {
  // req.ip is handled by Express based on the 'trust proxy' setting:
  // - TRUST_PROXY=true  → Express reads X-Forwarded-For, strips client-forged
  //                       hops, and returns the real client IP from the proxy.
  // - TRUST_PROXY=false → Express ignores all proxy headers and returns the
  //                       raw TCP socket address, which cannot be spoofed.
  return request.ip ?? request.socket?.remoteAddress ?? "unknown";
}

export function json(
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
) {
  const status = init?.status ?? 200;
  const headers = init?.headers ?? {};

  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
    body: JSON.stringify(data),
  };
}

export function methodNotAllowed(allowed: string[]) {
  return {
    status: 405,
    headers: { Allow: allowed.join(", ") },
    body: JSON.stringify({
      error: "Method not allowed",
      allowed,
    }),
  };
}
