import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CurrencyRates } from './types';

function getCoinGeckoBase(): string {
  return process.env.COINGECKO_API_KEY
    ? 'https://pro-api.coingecko.com/api/v3'
    : 'https://api.coingecko.com/api/v3';
}

function getHeaders(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  if (key) {
    return { 'x-cg-pro-api-key': key, Accept: 'application/json' };
  }
  return { Accept: 'application/json' };
}

const TOKEN_IDS: Record<string, string> = {
  POL: 'polygon-ecosystem-token',
  ETH: 'ethereum',
};

// MATIC migrated to POL on CoinGecko around Oct 2025.
// Historical prices before that date use the old coin ID.
const POL_MIGRATION_DATE = new Date('2025-10-17');
const LEGACY_POL_ID = 'matic-network';

/**
 * Get token price for a given date. Checks DB cache first, then CoinGecko.
 * Pass a service-role Supabase client when calling from API routes (backfill/webhook)
 * so cache writes succeed despite RLS.
 */
export async function getTokenPrice(
  token: string,
  date: Date,
  supabaseClient?: SupabaseClient
): Promise<number> {
  const dateStr = date.toISOString().split('T')[0];
  const supabase = supabaseClient ?? (await createClient());

  const { data: cached } = await supabase
    .from('price_cache')
    .select('usd_price')
    .eq('token', token)
    .eq('date', dateStr)
    .single();

  if (cached) return Number(cached.usd_price);

  let coinId = TOKEN_IDS[token];
  if (!coinId) throw new Error(`Unknown token: ${token}`);

  // Use legacy MATIC coin ID for dates before the POL migration
  if (token === 'POL' && date < POL_MIGRATION_DATE) {
    coinId = LEGACY_POL_ID;
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const cgDate = `${dd}-${mm}-${yyyy}`;

  const res = await fetch(
    `${getCoinGeckoBase()}/coins/${coinId}/history?date=${cgDate}&localization=false`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }

  const data = await res.json();
  const usdPrice = data?.market_data?.current_price?.usd;

  if (usdPrice == null) {
    throw new Error(`No price data for ${token} on ${dateStr}`);
  }

  const { error: cacheErr } = await supabase.from('price_cache').upsert(
    { token, date: dateStr, usd_price: usdPrice },
    { onConflict: 'token,date' }
  );
  if (cacheErr) console.error('Price cache upsert failed:', cacheErr.message);

  return usdPrice;
}

const PRICE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function getCurrentPrice(token: string, supabaseClient?: SupabaseClient): Promise<number> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const supabase = supabaseClient ?? (await createClient());

  const { data: cached } = await supabase
    .from('price_cache')
    .select('usd_price, created_at')
    .eq('token', token)
    .eq('date', dateStr)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.created_at).getTime();
    if (age < PRICE_TTL_MS) {
      return Number(cached.usd_price);
    }
  }

  const coinId = TOKEN_IDS[token];
  if (!coinId) throw new Error(`Unknown token: ${token}`);

  const delays = [0, 1000, 2000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    try {
      const res = await fetch(
        `${getCoinGeckoBase()}/simple/price?ids=${coinId}&vs_currencies=usd`,
        { headers: getHeaders() }
      );
      if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);

      const data = await res.json();
      const usdPrice = data?.[coinId]?.usd;
      if (usdPrice == null) throw new Error(`No price for ${token}`);

      const { error: cacheErr } = await supabase.from('price_cache').upsert(
        { token, date: dateStr, usd_price: usdPrice, created_at: new Date().toISOString() },
        { onConflict: 'token,date' }
      );
      if (cacheErr) console.error('Price cache upsert failed:', cacheErr.message);

      return usdPrice;
    } catch {
      if (attempt === delays.length - 1) {
        if (cached) return Number(cached.usd_price);
        throw new Error(`CoinGecko unavailable for ${token} after ${delays.length} attempts`);
      }
    }
  }

  throw new Error(`Unreachable`);
}

export async function getLatestCachedPrice(token: string, supabaseClient?: SupabaseClient): Promise<number> {
  const supabase = supabaseClient ?? (await createClient());
  const { data } = await supabase
    .from('price_cache')
    .select('usd_price')
    .eq('token', token)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (!data) throw new Error(`No cached price for ${token}`);
  return Number(data.usd_price);
}

export async function getLatestCachedRates(supabaseClient?: SupabaseClient): Promise<CurrencyRates> {
  const supabase = supabaseClient ?? (await createClient());
  const currencies = ['EUR', 'GBP', 'CAD'] as const;

  const results = await Promise.all(
    currencies.map((currency) =>
      supabase
        .from('price_cache')
        .select('usd_price')
        .eq('token', currency)
        .order('date', { ascending: false })
        .limit(1)
        .single()
    )
  );

  const rates: Record<string, number> = {};
  for (let i = 0; i < currencies.length; i++) {
    const { data } = results[i];
    if (!data) throw new Error(`No cached rate for ${currencies[i]}`);
    rates[currencies[i]] = Number(data.usd_price);
  }

  return rates as unknown as CurrencyRates;
}

export async function getFiatRates(supabaseClient?: SupabaseClient): Promise<CurrencyRates> {
  const today = new Date().toISOString().split('T')[0];
  const supabase = supabaseClient ?? (await createClient());
  const currencies = ['EUR', 'GBP', 'CAD'];

  const { data: cached } = await supabase
    .from('price_cache')
    .select('token, usd_price')
    .in('token', currencies)
    .eq('date', today);

  if (cached && cached.length === currencies.length) {
    const rates: Record<string, number> = {};
    for (const row of cached) {
      rates[row.token] = Number(row.usd_price);
    }
    return rates as unknown as CurrencyRates;
  }

  const delays = [0, 1000, 2000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    try {
      const res = await fetch(
        `${getCoinGeckoBase()}/simple/price?ids=usd-coin&vs_currencies=eur,gbp,cad`,
        { headers: getHeaders() }
      );

      if (!res.ok) throw new Error(`CoinGecko fiat rates error: ${res.status}`);

      const data = await res.json();
      const usdc = data?.['usd-coin'];

      if (!usdc?.eur || !usdc?.gbp || !usdc?.cad) {
        return getLatestCachedRates(supabase);
      }

      const rates: CurrencyRates = {
        EUR: usdc.eur,
        GBP: usdc.gbp,
        CAD: usdc.cad,
      };

      for (const [currency, rate] of Object.entries(rates)) {
        const { error: cacheErr } = await supabase.from('price_cache').upsert(
          { token: currency, date: today, usd_price: rate },
          { onConflict: 'token,date' }
        );
        if (cacheErr) console.error(`Fiat rate cache upsert failed for ${currency}:`, cacheErr.message);
      }

      return rates;
    } catch {
      if (attempt === delays.length - 1) {
        return getLatestCachedRates(supabase);
      }
    }
  }

  return getLatestCachedRates(supabase);
}
