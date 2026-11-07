/**
 * Supabase devuelve como mucho 1.000 filas por consulta (aunque se pida .limit(10000)).
 * Esto pide la consulta por páginas de 1.000 hasta tenerlo todo (o llegar a `max`).
 *
 *   const { data, error } = await fetchAll((from, to) =>
 *     db.from("listings").select("external_id").eq("platform", "vinted").range(from, to));
 */
const PAGE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 50_000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, Math.min(from + PAGE, max) - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}
