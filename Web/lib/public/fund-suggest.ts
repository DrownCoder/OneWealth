export type EastmoneyFundRaw = Record<string, unknown>;

function extractJsonp(text: string): string | null {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1 || end <= start) return null;
  const json = text.slice(start + 1, end).trim();
  return json || null;
}

export async function fetchEastmoneyFundSuggest(key: string): Promise<EastmoneyFundRaw[]> {
  const safeKey = key.trim();
  if (!safeKey) return [];

  const now = Date.now();
  const callback = `SuggestData_${now}`;
  const url =
    `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx` +
    `?m=1&key=${encodeURIComponent(safeKey)}&callback=${callback}&_=${now}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const text = await res.text();
  const jsonText = extractJsonp(text);
  if (!jsonText) return [];

  try {
    const payload = JSON.parse(jsonText) as { Datas?: unknown };
    if (!Array.isArray(payload.Datas)) return [];
    return payload.Datas.filter((item): item is EastmoneyFundRaw => !!item && typeof item === "object");
  } catch {
    return [];
  }
}
