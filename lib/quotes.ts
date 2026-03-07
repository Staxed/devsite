import { createAdminClient } from "@/lib/supabase/server";

/**
 * Fetch a random active quote from the database.
 * Returns formatted string: "text" — author
 * Returns null if no quotes are available.
 */
export async function getRandomQuote(): Promise<string | null> {
  const supabase = createAdminClient();

  // Supabase doesn't have a native random() order, so we count and offset
  const { count } = await supabase
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  if (!count || count === 0) return null;

  const offset = Math.floor(Math.random() * count);

  const { data } = await supabase
    .from("quotes")
    .select("text, author")
    .eq("is_active", true)
    .order("id")
    .range(offset, offset)
    .limit(1)
    .single();

  if (!data) return null;

  return data.author ? `"${data.text}" — ${data.author}` : `"${data.text}"`;
}
