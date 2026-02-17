import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/pearls/auth';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role config');
  return createSupabaseClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    // Verify session
    const cookieStore = await cookies();
    const token = cookieStore.get('pearls-session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json();
    const { transfer_id, is_compounded } = body;

    if (!transfer_id || typeof is_compounded !== 'boolean') {
      return NextResponse.json({ error: 'Missing transfer_id or is_compounded' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Verify the transfer belongs to the authenticated wallet
    const { data: transfer } = await supabase
      .from('nft_transfers')
      .select('id, to_address, is_purchase')
      .eq('id', transfer_id)
      .single();

    if (!transfer) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
    }

    if (transfer.to_address !== session.address.toLowerCase()) {
      return NextResponse.json({ error: 'Not your transfer' }, { status: 403 });
    }

    if (!transfer.is_purchase) {
      return NextResponse.json({ error: 'Only purchases can be marked as compounded' }, { status: 400 });
    }

    // Update
    const { error } = await supabase
      .from('nft_transfers')
      .update({ is_compounded })
      .eq('id', transfer_id);

    if (error) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, transfer_id, is_compounded });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
