import { NextResponse } from "next/server";
import { listFundHoldings, replaceFundLookthroughSnapshot, type LookthroughPositionInput } from "@/lib/db";

export const runtime = "nodejs";

type UpstreamStockRow = {
  enddate?: string;
  zcType?: string;
  zcCode?: string;
  zcName?: string;
  hold?: string;
  totalPrice?: string;
  ccRate?: string;
  price?: string;
  rate?: string;
  changeRage?: string;
};

type UpstreamPayload = {
  data?: { stock?: UpstreamStockRow[] };
  error?: { id?: number; msg?: string };
};

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

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST() {
  const funds = listFundHoldings();
  let fundCount = 0;
  let posCount = 0;
  const failed: Array<{ fundCode: string; message: string }> = [];

  for (const fund of funds) {
    try {
      const url = `https://fund.10jqka.com.cn/web/fund/stockAndBond/${encodeURIComponent(fund.code)}`;
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
        failed.push({ fundCode: fund.code, message: `HTTP ${res.status}` });
        continue;
      }

      const text = await res.text();
      const payload = parseUpstreamPayload(text);
      if (!payload) {
        failed.push({ fundCode: fund.code, message: "响应解析失败" });
        continue;
      }

      const stocks = Array.isArray(payload.data?.stock) ? payload.data?.stock ?? [] : [];
      const asOfDate = (stocks[0]?.enddate || "").trim() || new Date().toISOString().slice(0, 10);

      const positions: LookthroughPositionInput[] = stocks
        .map((s) => ({
          zcType: String(s.zcType ?? "stock"),
          zcCode: String(s.zcCode ?? "").trim(),
          zcName: String(s.zcName ?? "").trim(),
          ccRate: Number(s.ccRate ?? 0),
          hold: toNum(s.hold),
          totalPrice: toNum(s.totalPrice),
          price: toNum(s.price),
          rate: toNum(s.rate),
          changeRate: toNum(s.changeRage),
        }))
        .filter((p) => !!p.zcCode && !!p.zcName);

      replaceFundLookthroughSnapshot({
        fundCode: fund.code,
        asOfDate,
        errorId: payload.error?.id === undefined ? null : Number(payload.error.id),
        errorMsg: payload.error?.msg ? String(payload.error.msg) : null,
        positions,
      });

      fundCount += 1;
      posCount += positions.length;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown";
      failed.push({ fundCode: fund.code, message: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    funds: funds.length,
    refreshedFunds: fundCount,
    positions: posCount,
    failed,
  });
}
