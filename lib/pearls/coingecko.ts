import { createClient } from '@/lib/supabase/server';
import type { CurrencyRates } from './types';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

function getHeaders(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  if (key) {
    return { 'x-cg-demo-api-key': key, Accept: 'application/json' };
  }
  return { Accept: 'application/json' };
}

const TOKEN_IDS: Record<string, string> = {
  POL: 'matic-network',
  ETH: 'ethereum',
};

export async function getTokenPrice(token: string, date: Date): Promise<number> {
  const dateStr = date.toISOString().split('T')[0];
  const supabase = await createClient();

  // Check cache first
  const { data: cached } = await supabase
    .from('price_cache')
    .select('usd_price')
    .eq('token', token)
    .eq('date', dateStr)
    .single();

  if (cached) return Number(cached.usd_price);

  // Fetch from CoinGecko
  const coinId = TOKEN_IDS[token];
  if (!coinId) throw new Error(`Unknown token: ${token}`);

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const cgDate = `${dd}-${mm}-${yyyy}`;

  const res = await fetch(
    `${COINGECKO_BASE}/coins/${coinId}/history?date=${cgDate}&localization=false`,
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

  // Cache in DB
  await supabase.from('price_cache').upsert(
    { token, date: dateStr, usd_price: usdPrice },
    { onConflict: 'token,date' }
  );

  return usdPrice;
}

export async function getTodayPrice(token: string): Promise<number> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const supabase = await createClient();

  // Check cache
  const { data: cached } = await supabase
    .from('price_cache')
    .select('usd_price')
    .eq('token', token)
    .eq('date', dateStr)
    .single();

  if (cached) return Number(cached.usd_price);

  // Fetch current price
  const coinId = TOKEN_IDS[token];
  if (!coinId) throw new Error(`Unknown token: ${token}`);

  const res = await fetch(
    `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd`,
    { headers: getHeaders() }
  );

  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);

  const data = await res.json();
  const usdPrice = data?.[coinId]?.usd;

  if (usdPrice == null) throw new Error(`No price for ${token}`);

  await supabase.from('price_cache').upsert(
    { token, date: dateStr, usd_price: usdPrice },
    { onConflict: 'token,date' }
  );

  return usdPrice;
}

export async function getFiatRates(): Promise<CurrencyRates> {
  const today = new Date().toISOString().split('T')[0];
  const supabase = await createClient();
  const currencies = ['EUR', 'GBP', 'CAD'];

  // Check cache for all three
  const { data: cached } = await supabase
    .from('price_cache')
    .select('token, usd_price')
    .in('token', currencies)
    .eq('date', today);

  if (cached && cached.length === 3) {
    const rates: Record<string, number> = {};
    for (const row of cached) {
      rates[row.token] = Number(row.usd_price);
    }
    return rates as unknown as CurrencyRates;
  }

  // Fetch from CoinGecko (exchange rates endpoint uses BTC base)
  // Use simple/price with vs_currencies instead
  const res = await fetch(
    `${COINGECKO_BASE}/simple/price?ids=usd-coin&vs_currencies=eur,gbp,cad`,
    { headers: getHeaders() }
  );

  if (!res.ok) throw new Error(`CoinGecko fiat rates error: ${res.status}`);

  const data = await res.json();
  const usdc = data?.['usd-coin'];

  // USDC rates give us USD -> fiat conversion rates
  const rates: CurrencyRates = {
    EUR: usdc?.eur ?? 0.92,
    GBP: usdc?.gbp ?? 0.79,
    CAD: usdc?.cad ?? 1.36,
  };

  // Cache all three
  for (const [currency, rate] of Object.entries(rates)) {
    await supabase.from('price_cache').upsert(
      { token: currency, date: today, usd_price: rate },
      { onConflict: 'token,date' }
    );
  }

  return rates;
}
