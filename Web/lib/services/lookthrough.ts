export type LookthroughTotals = {
  fundCount: number;
  totalFundAmount: number;
  totalPenetratedStockAmount: number;
  penetratedAssetCount: number;
  latestAsOfDate: string;
};

export type LookthroughPosition = {
  zcCode: string;
  zcName: string;
  zcType: string;
  weightedAmount: number;
  weightedRatePct: number;
  inStockAmountPct: number;
  fundCount: number;
};

export type LookthroughSummary = {
  totals: LookthroughTotals;
  positions: LookthroughPosition[];
};

export async function getLookthroughSummary(fundCodes?: string[]): Promise<LookthroughSummary> {
  const qs =
    fundCodes === undefined
      ? ""
      : `?fundCodes=${encodeURIComponent(fundCodes.join(","))}`;
  const res = await fetch(`/api/lookthrough/summary${qs}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("获取穿透汇总失败");
  }
  return (await res.json()) as LookthroughSummary;
}

export async function refreshLookthrough(): Promise<{
  ok: boolean;
  funds: number;
  refreshedFunds: number;
  positions: number;
  failed?: Array<{ fundCode: string; message: string }>;
}> {
  const res = await fetch("/api/lookthrough/refresh", {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("刷新穿透持仓失败");
  }
  return (await res.json()) as {
    ok: boolean;
    funds: number;
    refreshedFunds: number;
    positions: number;
    failed?: Array<{ fundCode: string; message: string }>;
  };
}
