import { NextResponse } from "next/server";
import { listFundHoldings, upsertFundProfile } from "@/lib/db";

export const runtime = "nodejs";

type UpstreamFundInfoRow = {
  code?: string;
  name?: string;
  fundtype?: string;
  rate?: string;
  net?: string;
  totalnet?: string;
  enddate?: string;
  updatetime?: string;
  manager?: string;
  orgname?: string;
};

type UpstreamPayload = {
  data?: UpstreamFundInfoRow[];
  error?: { id?: number; msg?: string };
};

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractJsonPayload(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("{") || t.startsWith("[")) return t;
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return t.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function parseUpstreamPayload(text: string): UpstreamPayload | null {
  const jsonText = extractJsonPayload(text);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as UpstreamPayload;
  } catch {
    return null;
  }
}

export async function POST() {
  const funds = listFundHoldings();
  const uniqueCodes = [...new Set(funds.map((f) => String(f.code).trim()).filter(Boolean))];
  let refreshedFunds = 0;
  const failed: Array<{ fundCode: string; message: string }> = [];

  for (const fundCode of uniqueCodes) {
    try {
      const url = `https://fund.10jqka.com.cn/data/client/myfund/${encodeURIComponent(fundCode)}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json,text/plain,*/*",
          Referer: "https://fund.10jqka.com.cn/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) {
        failed.push({ fundCode, message: `HTTP ${res.status}` });
        continue;
      }

      const text = await res.text();
      const payload = parseUpstreamPayload(text);
      const row = Array.isArray(payload?.data) ? payload?.data?.[0] : undefined;
      if (!row) {
        failed.push({ fundCode, message: "响应无有效 data[0]" });
        continue;
      }

      upsertFundProfile({
        fundCode: String(row.code ?? fundCode).trim() || fundCode,
        name: row.name ? String(row.name) : null,
        fundType: row.fundtype ? String(row.fundtype) : null,
        rate: parseNumber(row.rate),
        net: parseNumber(row.net),
        totalNet: parseNumber(row.totalnet),
        asOfDate: row.enddate ? String(row.enddate) : null,
        upstreamUpdateTime: row.updatetime ? String(row.updatetime) : null,
        manager: row.manager ? String(row.manager) : null,
        orgName: row.orgname ? String(row.orgname) : null,
      });

      refreshedFunds += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      failed.push({ fundCode, message });
    }
  }

  return NextResponse.json({
    ok: true,
    funds: uniqueCodes.length,
    refreshedFunds,
    failed,
  });
}

