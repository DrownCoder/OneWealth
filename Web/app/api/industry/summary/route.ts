import { NextResponse } from "next/server";
import { listFundHoldings, listLatestIndustryRows } from "@/lib/db";

export const runtime = "nodejs";

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
    const funds = hasFundCodesParam
      ? allFunds.filter((f) => filterCodes.has(f.code))
      : allFunds;
    const latestRows = listLatestIndustryRows();

    const fundAmountMap = new Map<string, number>();
    for (const f of funds) {
      fundAmountMap.set(f.code, Number(f.amount || 0));
    }

    const totalFundAmount = funds.reduce((s, f) => s + Number(f.amount || 0), 0);

    const agg = new Map<
      string,
      {
        industryCode: string;
        industryName: string;
        weightedAmount: number;
        weightedRatePct: number;
        fundSet: Set<string>;
      }
    >();

    let latestAsOfDate = "";

    for (const row of latestRows) {
      if (hasFundCodesParam && !filterCodes.has(row.fundCode)) continue;
      const fundAmount = fundAmountMap.get(row.fundCode) ?? 0;
      const weightedAmount = fundAmount * (Number(row.weightPct || 0) / 100);
      const key = `${row.industryCode}__${row.industryName}`;
      if (!agg.has(key)) {
        agg.set(key, {
          industryCode: row.industryCode,
          industryName: row.industryName,
          weightedAmount: 0,
          weightedRatePct: 0,
          fundSet: new Set<string>(),
        });
      }
      const target = agg.get(key)!;
      target.weightedAmount += weightedAmount;
      target.fundSet.add(row.fundCode);
      if (row.asOfDate > latestAsOfDate) latestAsOfDate = row.asOfDate;
    }

    const industries = [...agg.values()]
      .map((x) => ({
        industryCode: x.industryCode,
        industryName: x.industryName,
        weightedAmount: Number(x.weightedAmount.toFixed(2)),
        weightedRatePct:
          totalFundAmount > 0 ? Number(((x.weightedAmount / totalFundAmount) * 100).toFixed(4)) : 0,
        fundCount: x.fundSet.size,
      }))
      .sort((a, b) => b.weightedAmount - a.weightedAmount);

    const totalPenetratedIndustryAmount = industries.reduce((s, p) => s + Number(p.weightedAmount || 0), 0);
    const industriesWithPct = industries.map((p) => ({
      ...p,
      inIndustryAmountPct:
        totalPenetratedIndustryAmount > 0
          ? Number(((Number(p.weightedAmount || 0) / totalPenetratedIndustryAmount) * 100).toFixed(4))
          : 0,
    }));

    return NextResponse.json({
      totals: {
        fundCount: funds.length,
        totalFundAmount: Number(totalFundAmount.toFixed(2)),
        totalPenetratedIndustryAmount: Number(totalPenetratedIndustryAmount.toFixed(2)),
        industryCount: industriesWithPct.length,
        latestAsOfDate,
      },
      industries: industriesWithPct,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "summary failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

