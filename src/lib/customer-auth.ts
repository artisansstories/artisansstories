import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? 'fallback-secret-change-me');

export async function createMagicToken(email: string): Promise<string> {
  return new SignJWT({ email, type: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(secret);
}

export async function verifyMagicToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== 'magic') return null;
    return { email: payload.email as string };
  } catch {
    return null;
  }
}

export async function createSessionToken(customerId: string, email: string): Promise<string> {
  return new SignJWT({ customerId, email, type: 'customer_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<{ customerId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== 'customer_session') return null;
    return { customerId: payload.customerId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export function getSessionFromCookies(cookieValue: string | undefined): Promise<{ customerId: string; email: string } | null> {
  if (!cookieValue) return Promise.resolve(null);
  return verifySessionToken(cookieValue);
}
