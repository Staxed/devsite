import { SignJWT, jwtVerify } from 'jose';
import type { SessionPayload } from './types';

function getSecret() {
  const secret = process.env.PEARLS_JWT_SECRET;
  if (!secret) throw new Error('PEARLS_JWT_SECRET not configured');
  return new TextEncoder().encode(secret);
}

export async function createSession(address: string, chainId: number): Promise<string> {
  return new SignJWT({ address, chainId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('staxed.dev')
    .setAudience('pearls')
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'staxed.dev', audience: 'pearls' });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}
