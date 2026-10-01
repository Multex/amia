import { Request } from "express";

export function getClientIp(request: Request): string {
  // req.ip is handled by Express based on the 'trust proxy' setting:
  // - TRUST_PROXY=true  → Express reads X-Forwarded-For, strips client-forged
  //                       hops, and returns the real client IP from the proxy.
  // - TRUST_PROXY=false → Express ignores all proxy headers and returns the
  //                       raw TCP socket address, which cannot be spoofed.
  return request.ip ?? request.socket?.remoteAddress ?? "unknown";
}
