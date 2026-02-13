export type IndustryTotals = {
  fundCount: number;
  totalFundAmount: number;
  totalPenetratedIndustryAmount: number;
  industryCount: number;
  latestAsOfDate: string;
};

export type IndustryRow = {
  industryCode: string;
  industryName: string;
  weightedAmount: number;
  weightedRatePct: number;
  inIndustryAmountPct: number;
  fundCount: number;
};

export type IndustrySummary = {
  totals: IndustryTotals;
  industries: IndustryRow[];
};

export async function getIndustrySummary(fundCodes?: string[]): Promise<IndustrySummary> {
  const qs =
    fundCodes === undefined
      ? ""
      : `?fundCodes=${encodeURIComponent(fundCodes.join(","))}`;
  const res = await fetch(`/api/industry/summary${qs}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("获取行业汇总失败");
  }
  return (await res.json()) as IndustrySummary;
}

export async function refreshIndustry(): Promise<{
  ok: boolean;
  funds: number;
  refreshedFunds: number;
  positions: number;
  failed?: Array<{ fundCode: string; message: string }>;
}> {
  const res = await fetch("/api/industry/refresh", { method: "POST" });
  if (!res.ok) {
    throw new Error("刷新行业数据失败");
  }
  return (await res.json()) as {
    ok: boolean;
    funds: number;
    refreshedFunds: number;
    positions: number;
    failed?: Array<{ fundCode: string; message: string }>;
  };
}

