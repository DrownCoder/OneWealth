import { NextResponse } from "next/server";
import { listFundHoldings, listFundProfiles } from "@/lib/db";

export const runtime = "nodejs";

type FundSummaryRow = {
  code: string;
  name: string;
  fundType: string;
  amount: number;
  rate: number;
  todayPnl: number;
  asOfDate: string;
};

type FundTypeGroupRow = {
  fundType: string;
  fundCount: number;
  totalAmount: number;
  totalTodayPnl: number;
  weightedRatePct: number;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const hasFundCodesParam = searchParams.has("fundCodes");
    const fundCodesParam = String(searchParams.get("fundCodes") ?? "").trim();
    const filterCodes = new Set(
      fundCodesParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const allFunds = listFundHoldings();
    const fundRows = hasFundCodesParam
      ? allFunds.filter((f) => filterCodes.has(f.code))
      : allFunds;
    const profiles = listFundProfiles();
    const profileMap = new Map(profiles.map((p) => [p.fundCode, p] as const));

    // Allow multiple holding rows of same fund code by summing amount first.
    const merged = new Map<string, { code: string; name: string; amount: number }>();
    for (const f of fundRows) {
      if (!merged.has(f.code)) {
        merged.set(f.code, { code: f.code, name: f.name, amount: 0 });
      }
      const target = merged.get(f.code)!;
      target.amount += Number(f.amount || 0);
    }

    const funds: FundSummaryRow[] = [];
    let latestAsOfDate = "";
    let profileCoveredCount = 0;

    for (const row of merged.values()) {
      const p = profileMap.get(row.code);
      const rate = Number(p?.rate ?? 0);
      const amount = Number(row.amount || 0);
      const todayPnl = amount * (rate / 100);
      const asOfDate = String(p?.asOfDate ?? "");

      if (p) profileCoveredCount += 1;
      if (asOfDate > latestAsOfDate) latestAsOfDate = asOfDate;

      funds.push({
        code: row.code,
        name: String(p?.name || row.name || row.code),
        fundType: String(p?.fundType || "未分类"),
        amount: Number(amount.toFixed(2)),
        rate: Number(rate.toFixed(4)),
        todayPnl: Number(todayPnl.toFixed(2)),
        asOfDate,
      });
    }

    const groupMap = new Map<string, { fundType: string; fundCount: number; totalAmount: number; totalTodayPnl: number }>();
    for (const f of funds) {
      if (!groupMap.has(f.fundType)) {
        groupMap.set(f.fundType, {
          fundType: f.fundType,
          fundCount: 0,
          totalAmount: 0,
          totalTodayPnl: 0,
        });
      }
      const target = groupMap.get(f.fundType)!;
      target.fundCount += 1;
      target.totalAmount += Number(f.amount || 0);
      target.totalTodayPnl += Number(f.todayPnl || 0);
    }

    const groups: FundTypeGroupRow[] = [...groupMap.values()]
      .map((g) => ({
        fundType: g.fundType,
        fundCount: g.fundCount,
        totalAmount: Number(g.totalAmount.toFixed(2)),
        totalTodayPnl: Number(g.totalTodayPnl.toFixed(2)),
        weightedRatePct: g.totalAmount > 0 ? Number(((g.totalTodayPnl / g.totalAmount) * 100).toFixed(4)) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const totalFundAmount = funds.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalTodayPnl = funds.reduce((s, x) => s + Number(x.todayPnl || 0), 0);

    funds.sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      totals: {
        fundCount: funds.length,
        profileCoveredCount,
        totalFundAmount: Number(totalFundAmount.toFixed(2)),
        totalTodayPnl: Number(totalTodayPnl.toFixed(2)),
        weightedRatePct: totalFundAmount > 0 ? Number(((totalTodayPnl / totalFundAmount) * 100).toFixed(4)) : 0,
        latestAsOfDate,
      },
      groups,
      funds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "summary failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

