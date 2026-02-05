import { Request } from 'express';

export function getClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const ip = forwarded.split(',')[0]?.trim();
    if (ip) return ip;
  }
  
  const realIp = request.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') return realIp;

  const remote = (request as any).ip ?? undefined;
  if (remote) return remote;

  const connection = (request as any).connection;
  if (connection?.remoteAddress) return connection.remoteAddress;

  return 'unknown';
}

export function json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  const status = init?.status ?? 200;
  const headers = init?.headers ?? {};
  
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers
    },
    body: JSON.stringify(data)
  };
}

export function methodNotAllowed(allowed: string[]) {
  return {
    status: 405,
    headers: { Allow: allowed.join(', ') },
    body: JSON.stringify({
      error: 'Method not allowed',
      allowed
    })
  };
}
