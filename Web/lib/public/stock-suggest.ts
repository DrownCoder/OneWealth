export type RawStockItem = {
  code: string;
  name: string;
  category: string;
};

type StockBodyRow = [string?, string?, string?, string?, string?, string?, string?, string?];

type StockApiPayload = {
  status_code?: number;
  status_msg?: string;
  data?: {
    body?: StockBodyRow[];
  };
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function fetch10jqkaStockSuggest(query: string): Promise<RawStockItem[]> {
  const safeQuery = query.trim();
  if (!safeQuery) return [];

  const url = `https://news.10jqka.com.cn/app/headline/mobi-stockdict/v1/search/?isrealcode=1&associate=1&json=1&markettype=2&query=${encodeURIComponent(
    safeQuery
  )}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: "https://news.10jqka.com.cn/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) return [];

  const payload = (await res.json().catch(() => null)) as StockApiPayload | null;
  const body = payload?.data?.body;
  if (!Array.isArray(body)) return [];

  const list: RawStockItem[] = [];
  for (const row of body) {
    if (!Array.isArray(row)) continue;

    const code = safeStr(row[0]);
    const name = safeStr(row[1]);
    const category = safeStr(row[5]);

    if (!code || !name) continue;
    list.push({ code, name, category });
  }

  return list;
}
