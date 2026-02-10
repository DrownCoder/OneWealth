export type Holding = {
  id: number;
  type: "fund" | "stock";
  code: string | null;
  name: string | null;
  amount: number | null;
  shares: number | null;
  created_at: string;
};

type HoldingsResponse = {
  data?: Holding[];
  error?: string;
};

export async function getHoldings(): Promise<Holding[]> {
  const res = await fetch("/api/holdings", { cache: "no-store" });
  const json = (await res.json()) as HoldingsResponse;
  return Array.isArray(json.data) ? json.data : [];
}

export async function createFundHolding(input: { code: string; name: string; amount: number }): Promise<void> {
  const res = await fetch("/api/holdings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "fund",
      code: input.code,
      name: input.name,
      amount: input.amount,
    }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "添加基金失败");
  }
}

export async function createStockHolding(input: { code: string; name: string; shares: number }): Promise<void> {
  const res = await fetch("/api/holdings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "stock",
      code: input.code,
      name: input.name,
      shares: input.shares,
    }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "添加股票失败");
  }
}

export async function deleteHolding(id: number): Promise<void> {
  const res = await fetch(`/api/holdings?id=${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "删除记录失败");
  }
}

export async function deleteHoldings(ids: number[]): Promise<void> {
  const valid = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (valid.length === 0) return;

  const res = await fetch(`/api/holdings?ids=${valid.join(",")}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "批量删除失败");
  }
}

export async function updateHolding(input: { id: number; amount?: number; shares?: number }): Promise<void> {
  const res = await fetch("/api/holdings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "更新记录失败");
  }
}
