import { NextResponse } from "next/server";
import { listFundHoldings, listLatestLookthroughRows } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const funds = listFundHoldings();
    const latestRows = listLatestLookthroughRows();

    const fundAmountMap = new Map<string, number>();
    for (const f of funds) {
      fundAmountMap.set(f.code, Number(f.amount || 0));
    }

    const totalFundAmount = funds.reduce((s, f) => s + Number(f.amount || 0), 0);

    const agg = new Map<
      string,
      {
        zcCode: string;
        zcName: string;
        zcType: string;
        weightedAmount: number;
        weightedRatePct: number;
        fundSet: Set<string>;
      }
    >();

    let latestAsOfDate = "";

    for (const row of latestRows) {
      const fundAmount = fundAmountMap.get(row.fundCode) ?? 0;
      const weightedAmount = fundAmount * (Number(row.ccRate || 0) / 100);
      const key = row.zcCode;
      if (!agg.has(key)) {
        agg.set(key, {
          zcCode: row.zcCode,
          zcName: row.zcName,
          zcType: row.zcType,
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

    const positions = [...agg.values()]
      .map((x) => ({
        zcCode: x.zcCode,
        zcName: x.zcName,
        zcType: x.zcType,
        weightedAmount: Number(x.weightedAmount.toFixed(2)),
        weightedRatePct:
          totalFundAmount > 0 ? Number(((x.weightedAmount / totalFundAmount) * 100).toFixed(4)) : 0,
        fundCount: x.fundSet.size,
      }))
      .sort((a, b) => b.weightedAmount - a.weightedAmount);

    const totalPenetratedStockAmount = positions.reduce((s, p) => s + Number(p.weightedAmount || 0), 0);
    const positionsWithStockPct = positions.map((p) => ({
      ...p,
      inStockAmountPct:
        totalPenetratedStockAmount > 0
          ? Number(((Number(p.weightedAmount || 0) / totalPenetratedStockAmount) * 100).toFixed(4))
          : 0,
    }));

    return NextResponse.json({
      totals: {
        fundCount: funds.length,
        totalFundAmount: Number(totalFundAmount.toFixed(2)),
        totalPenetratedStockAmount: Number(totalPenetratedStockAmount.toFixed(2)),
        penetratedAssetCount: positionsWithStockPct.length,
        latestAsOfDate,
      },
      positions: positionsWithStockPct,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "summary failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
