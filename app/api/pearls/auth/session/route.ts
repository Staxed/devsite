import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/pearls/auth';

export const runtime = 'edge';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('pearls-session')?.value;

  if (!token) {
    return NextResponse.json({ address: null });
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ address: null });
  }

  return NextResponse.json({ address: session.address, chainId: session.chainId });
}
