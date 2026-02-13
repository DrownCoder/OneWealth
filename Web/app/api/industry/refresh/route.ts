import { NextResponse } from "next/server";
import { listFundHoldings, replaceFundIndustrySnapshot, type IndustryPositionInput } from "@/lib/db";

export const runtime = "nodejs";

type UpstreamIndustryRow = {
  FSRQ?: string;
  HYDM?: string;
  HYMC?: string;
  SZ?: number | string | null;
  ZJZBL?: string | number | null;
};

type UpstreamQuarterInfo = {
  JZRQ?: string;
  HYPZInfo?: UpstreamIndustryRow[];
};

type UpstreamPayload = {
  Data?: {
    QuarterInfos?: UpstreamQuarterInfo[];
  };
  ErrCode?: number;
  ErrMsg?: string | null;
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

function parsePayload(text: string): UpstreamPayload | null {
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
  const uniqueCodes = [...new Set(funds.map((f) => String(f.code || "").trim()).filter(Boolean))];
  let refreshedFunds = 0;
  let positions = 0;
  const failed: Array<{ fundCode: string; message: string }> = [];

  for (const fundCode of uniqueCodes) {
    try {
      const now = Date.now();
      const callback = `IndustryCb_${now}_${Math.floor(Math.random() * 100000)}`;
      const url =
        `https://api.fund.eastmoney.com/f10/HYPZ/?fundCode=${encodeURIComponent(fundCode)}` +
        `&year=&callback=${encodeURIComponent(callback)}&_=${now}`;

      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json,text/plain,*/*",
          Referer: "https://fund.eastmoney.com/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) {
        failed.push({ fundCode, message: `HTTP ${res.status}` });
        continue;
      }

      const text = await res.text();
      const payload = parsePayload(text);
      if (!payload) {
        failed.push({ fundCode, message: "响应解析失败" });
        continue;
      }
      if (Number(payload.ErrCode ?? 0) !== 0) {
        failed.push({ fundCode, message: String(payload.ErrMsg || `ErrCode ${payload.ErrCode}`) });
        continue;
      }

      const quarterInfos = Array.isArray(payload.Data?.QuarterInfos) ? payload.Data?.QuarterInfos ?? [] : [];
      if (quarterInfos.length === 0) {
        replaceFundIndustrySnapshot({
          fundCode,
          asOfDate: new Date().toISOString().slice(0, 10),
          errorMsg: "QuarterInfos 为空",
          positions: [],
        });
        refreshedFunds += 1;
        continue;
      }

      const sorted = [...quarterInfos].sort((a, b) => String(b.JZRQ ?? "").localeCompare(String(a.JZRQ ?? "")));
      const latest = sorted[0];
      const rows = Array.isArray(latest?.HYPZInfo) ? latest?.HYPZInfo ?? [] : [];
      const asOfDate =
        String(latest?.JZRQ ?? "").trim() ||
        String(rows[0]?.FSRQ ?? "").trim() ||
        new Date().toISOString().slice(0, 10);

      const normalized: IndustryPositionInput[] = rows
        .map((x) => ({
          industryCode: String(x.HYDM ?? "").trim(),
          industryName: String(x.HYMC ?? "").trim(),
          marketValue: toNum(x.SZ),
          weightPct: Number(x.ZJZBL ?? 0),
        }))
        .filter((x) => !!x.industryCode && !!x.industryName && Number.isFinite(x.weightPct));

      replaceFundIndustrySnapshot({
        fundCode,
        asOfDate,
        errorMsg: null,
        positions: normalized,
      });
      refreshedFunds += 1;
      positions += normalized.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      failed.push({ fundCode, message });
    }
  }

  return NextResponse.json({
    ok: true,
    funds: uniqueCodes.length,
    refreshedFunds,
    positions,
    failed,
  });
}

