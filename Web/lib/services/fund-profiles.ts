export type FundProfileTotals = {
  fundCount: number;
  profileCoveredCount: number;
  totalFundAmount: number;
  totalTodayPnl: number;
  weightedRatePct: number;
  latestAsOfDate: string;
};

export type FundTypeGroup = {
  fundType: string;
  fundCount: number;
  totalAmount: number;
  totalTodayPnl: number;
  weightedRatePct: number;
};

export type FundProfileFundRow = {
  code: string;
  name: string;
  fundType: string;
  amount: number;
  rate: number;
  todayPnl: number;
  asOfDate: string;
};

export type FundProfileSummary = {
  totals: FundProfileTotals;
  groups: FundTypeGroup[];
  funds: FundProfileFundRow[];
};

export async function getFundProfileSummary(fundCodes?: string[]): Promise<FundProfileSummary> {
  const qs =
    fundCodes === undefined
      ? ""
      : `?fundCodes=${encodeURIComponent(fundCodes.join(","))}`;
  const res = await fetch(`/api/fund-profiles/summary${qs}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("获取基金基础信息汇总失败");
  }
  return (await res.json()) as FundProfileSummary;
}

export async function refreshFundProfiles(): Promise<{
  ok: boolean;
  funds: number;
  refreshedFunds: number;
  failed?: Array<{ fundCode: string; message: string }>;
}> {
  const res = await fetch("/api/fund-profiles/refresh", {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("刷新基金基础信息失败");
  }
  return (await res.json()) as {
    ok: boolean;
    funds: number;
    refreshedFunds: number;
    failed?: Array<{ fundCode: string; message: string }>;
  };
}

