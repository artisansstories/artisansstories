import { cookies } from 'next/headers';
import { verifySessionToken } from './customer-auth';

export async function getAccountSession(): Promise<{ customerId: string; email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('customer_session')?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  return session;
}

export async function requireAccountSession(): Promise<{ customerId: string; email: string } | null> {
  const session = await getAccountSession();
  if (!session) return null;
  return session;
}
