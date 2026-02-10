export type StockSuggestItem = {
  code: string;
  name: string;
  category: string;
  raw: Record<string, unknown>;
};

type Candidate = Record<string, unknown> | string;

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function looksLikeStockItem(item: unknown): item is Record<string, unknown> {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const rec = item as Record<string, unknown>;
  const keys = [
    "name",
    "stockname",
    "stock_name",
    "security_name",
    "showname",
    "show_name",
    "shortname",
    "code",
    "stockcode",
    "stock_code",
    "security_code",
    "showcode",
    "show_code",
    "symbol",
    "secu_code",
    "secucode",
  ];
  return keys.some((key) => typeof rec[key] === "string" && rec[key]);
}

function looksLikeStockString(item: unknown): item is string {
  if (typeof item !== "string") return false;
  const s = item.trim();
  if (!s) return false;
  return /[A-Za-z\u4e00-\u9fa5]/.test(s) && /[,|/]/.test(s);
}

function collectCandidates(node: unknown, bag: Candidate[]) {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) collectCandidates(item, bag);
    return;
  }

  if (looksLikeStockString(node)) {
    bag.push(node);
    return;
  }

  if (looksLikeStockItem(node)) {
    bag.push(node);
  }

  if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectCandidates(value, bag);
    }
  }
}

function normalizeFromString(text: string): StockSuggestItem | null {
  const parts = text
    .split(/[\t,|/ ]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  let code = "";
  let name = "";

  for (const part of parts) {
    if (!name && /[\u4e00-\u9fa5A-Za-z]/.test(part) && !/^\d+$/.test(part)) {
      name = part;
    }
    if (!code && (/^\d{5,6}$/.test(part) || /^[A-Z]{1,8}$/.test(part))) {
      code = part;
    }
  }

  if (!name) name = parts[0] ?? "";
  if (!code && parts.length > 1) code = parts[1] ?? "";
  if (!name && !code) return null;

  return { code, name, category: "", raw: { source: text } };
}

function normalize(item: Candidate): StockSuggestItem | null {
  if (typeof item === "string") {
    return normalizeFromString(item);
  }

  const code = pickString(item, [
    "code",
    "stock_code",
    "stockcode",
    "security_code",
    "showcode",
    "show_code",
    "symbol",
    "secucode",
    "secu_code",
    "ts_code",
  ]);
  const name = pickString(item, [
    "name",
    "stock_name",
    "stockname",
    "security_name",
    "showname",
    "show_name",
    "shortname",
    "short_name",
    "abbr",
  ]);

  if (!code && !name) return null;
  const category = pickString(item, ["category", "stock_category", "type", "market"]);
  return { code, name, category, raw: item };
}

export async function getStockSuggestions(query: string): Promise<StockSuggestItem[]> {
  const safeQuery = query.trim();
  if (!safeQuery) return [];
  const res = await fetch(`/api/stock-suggest?query=${encodeURIComponent(safeQuery)}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { data?: unknown[] };
  const base = Array.isArray(json.data) ? json.data : [];

  const all: Candidate[] = [];
  for (const node of base) {
    collectCandidates(node, all);
  }

  const normalized = all.map(normalize).filter((item): item is StockSuggestItem => item !== null);
  return normalized;
}
