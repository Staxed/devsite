import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPublicClient, http } from 'viem';
import { polygon, base } from 'viem/chains';
import { parseSiweMessage, verifySiweMessage } from 'viem/siwe';
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

    const fields = parseSiweMessage(message);
    const { address, nonce, chainId } = fields;

    if (!address || !nonce || !chainId) {
      return NextResponse.json({ error: 'Invalid SIWE message format' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const storedNonce = cookieStore.get('pearls-nonce')?.value;

    if (!storedNonce || storedNonce !== nonce) {
      return NextResponse.json({ error: 'Invalid nonce' }, { status: 401 });
    }

    cookieStore.delete('pearls-nonce');

    const chainConfig = chainId === 137 ? polygon : chainId === 8453 ? base : null;
    if (!chainConfig) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    const publicClient = createPublicClient({
      chain: chainConfig,
      transport: http(),
    });

    const valid = await verifySiweMessage(publicClient, {
      message,
      signature: signature as `0x${string}`,
      domain: request.headers.get('host') ?? undefined,
    });

    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const token = await createSession(address, chainId);
    cookieStore.set('pearls-session', token, getSessionCookieOptions());

    return NextResponse.json({ address, chainId });
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
