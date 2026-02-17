import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession, getSessionCookieOptions } from '@/lib/pearls/auth';

interface VerifyBody {
  message: string;
  signature: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyBody = await request.json();
    const { message, signature } = body;

    if (!message || !signature) {
      return NextResponse.json({ error: 'Missing message or signature' }, { status: 400 });
    }

    // Parse SIWE message fields
    const addressMatch = message.match(/^(0x[a-fA-F0-9]{40})/m);
    const nonceMatch = message.match(/Nonce: (.+)/);
    const chainIdMatch = message.match(/Chain ID: (\d+)/);

    if (!addressMatch || !nonceMatch || !chainIdMatch) {
      return NextResponse.json({ error: 'Invalid SIWE message format' }, { status: 400 });
    }

    const address = addressMatch[1];
    const nonce = nonceMatch[1];
    const chainId = parseInt(chainIdMatch[1], 10);

    // Verify nonce matches cookie
    const cookieStore = await cookies();
    const storedNonce = cookieStore.get('pearls-nonce')?.value;

    if (!storedNonce || storedNonce !== nonce) {
      return NextResponse.json({ error: 'Invalid nonce' }, { status: 401 });
    }

    // Clear nonce cookie
    cookieStore.delete('pearls-nonce');

    // Verify signature using viem
    const { verifyMessage } = await import('viem');
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Create JWT session
    const token = await createSession(address, chainId);
    cookieStore.set('pearls-session', token, getSessionCookieOptions());

    return NextResponse.json({ address: address.toLowerCase(), chainId });
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
