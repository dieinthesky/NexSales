/**
 * Pull all rows from a Supabase table (default REST limit is 1000 — must paginate).
 */
export async function fetchAllRows<T extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await build(from, to)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
