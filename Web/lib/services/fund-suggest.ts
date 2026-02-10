export type FundSuggestItem = {
  code: string;
  name: string;
  raw: Record<string, unknown>;
};

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeSuggest(item: Record<string, unknown>): FundSuggestItem | null {
  const code = pickString(item, ["FCODE", "FCode", "Code", "CODE", "FundCode", "code"]);
  const name = pickString(item, ["SHORTNAME", "SNAME", "Name", "NAME", "FundName", "name"]);
  if (!code && !name) return null;
  return { code, name, raw: item };
}

export async function getFundSuggestions(key: string): Promise<FundSuggestItem[]> {
  const safeKey = key.trim();
  if (!safeKey) return [];

  const res = await fetch(`/api/fund-suggest?key=${encodeURIComponent(safeKey)}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  const list = Array.isArray(json.data) ? json.data : [];
  return list.map(normalizeSuggest).filter((item): item is FundSuggestItem => item !== null);
}
