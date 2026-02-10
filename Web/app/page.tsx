"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getHoldings, type Holding } from "@/lib/services/holdings";
import { getLookthroughSummary, refreshLookthrough, type LookthroughSummary } from "@/lib/services/lookthrough";

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function DashboardPage() {
  const [rows, setRows] = useState<Holding[]>([]);
  const [lookthrough, setLookthrough] = useState<LookthroughSummary | null>(null);
  const [loadingLookthrough, setLoadingLookthrough] = useState(false);
  const [refreshHint, setRefreshHint] = useState("");
  const autoRefreshed = useRef(false);

  async function loadBase() {
    const list = await getHoldings();
    setRows(list);
  }

  async function loadLookthrough() {
    try {
      const summary = await getLookthroughSummary();
      setLookthrough(summary);
    } catch {
      setLookthrough(null);
    }
  }

  useEffect(() => {
    loadBase().catch(() => setRows([]));
    loadLookthrough().catch(() => setLookthrough(null));
  }, []);

  useEffect(() => {
    if (autoRefreshed.current) return;
    autoRefreshed.current = true;
    doRefreshLookthrough().catch(() => {});
  }, []);

  const metrics = useMemo(() => {
    const fundCount = rows.filter((r) => r.type === "fund").length;
    const stockCount = rows.filter((r) => r.type === "stock").length;
    const fundAmount = rows.filter((r) => r.type === "fund").reduce((s, r) => s + Number(r.amount || 0), 0);
    const stockShares = rows.filter((r) => r.type === "stock").reduce((s, r) => s + Number(r.shares || 0), 0);
    return { fundCount, stockCount, fundAmount, stockShares };
  }, [rows]);

  async function doRefreshLookthrough() {
    setLoadingLookthrough(true);
    setRefreshHint("");
    try {
      const result = await refreshLookthrough();
      await loadLookthrough();
      if ((result.failed?.length ?? 0) > 0) {
        const first = result.failed?.[0];
        setRefreshHint(
          `刷新完成：${result.refreshedFunds}/${result.funds} 成功，失败 ${result.failed?.length}。` +
            (first ? ` 示例：${first.fundCode} - ${first.message}` : "")
        );
      } else {
        setRefreshHint(`刷新完成：${result.refreshedFunds}/${result.funds} 成功，写入 ${result.positions} 条持仓。`);
      }
    } finally {
      setLoadingLookthrough(false);
    }
  }

  const topPenetrated = lookthrough?.positions?.slice(0, 15) ?? [];

  return (
    <main className="container">
      <section className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>理财大盘</h1>
          <p className="hint" style={{ marginTop: 6 }}>展示已录入基金和股票，并汇总基金穿透持仓</p>
        </div>
        <Link href="/entry" className="quick-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          去录入页
        </Link>
      </section>

      <section className="grid">
        <article className="card">
          <h3>基金数量</h3>
          <p style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>{metrics.fundCount}</p>
        </article>
        <article className="card">
          <h3>股票数量</h3>
          <p style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>{metrics.stockCount}</p>
        </article>
        <article className="card">
          <h3>基金总金额</h3>
          <p style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>¥{metrics.fundAmount.toFixed(2)}</p>
        </article>
        <article className="card">
          <h3>股票总份额</h3>
          <p style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>{metrics.stockShares}</p>
        </article>
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2>基金穿透持仓汇总</h2>
          <button type="button" className="quick-btn" disabled={loadingLookthrough} onClick={doRefreshLookthrough}>
            {loadingLookthrough ? "刷新中..." : "刷新穿透数据"}
          </button>
        </div>

        <div className="grid" style={{ marginBottom: 12 }}>
          <article className="card">
            <h3>覆盖基金</h3>
            <p style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{lookthrough?.totals?.fundCount ?? 0}</p>
          </article>
          <article className="card">
            <h3>穿透资产数</h3>
            <p style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{lookthrough?.totals?.penetratedAssetCount ?? 0}</p>
          </article>
          <article className="card">
            <h3>基金总金额</h3>
            <p style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>
              ¥{Number(lookthrough?.totals?.totalFundAmount ?? 0).toFixed(2)}
            </p>
          </article>
          <article className="card">
            <h3>穿透股票总金额</h3>
            <p style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>
              ¥{Number(lookthrough?.totals?.totalPenetratedStockAmount ?? 0).toFixed(2)}
            </p>
          </article>
          <article className="card">
            <h3>穿透更新日</h3>
            <p style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>{lookthrough?.totals?.latestAsOfDate || "-"}</p>
          </article>
        </div>

        <div className="table-wrap">
          {refreshHint ? <p className="hint" style={{ marginBottom: 10 }}>{refreshHint}</p> : null}
          <table>
            <thead>
              <tr>
                <th>股票代码</th>
                <th>股票名称</th>
                <th>资产类型</th>
                <th>估算穿透金额</th>
                <th>占基金股票总金额比(%)</th>
                <th>涉及基金数</th>
              </tr>
            </thead>
            <tbody>
              {topPenetrated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="hint">暂无穿透数据，点击“刷新穿透数据”后再查看。</td>
                </tr>
              ) : (
                topPenetrated.map((x) => (
                  <tr key={`${x.zcCode}-${x.zcType}`}>
                    <td>{x.zcCode}</td>
                    <td>{x.zcName}</td>
                    <td>{x.zcType}</td>
                    <td>¥{x.weightedAmount.toFixed(2)}</td>
                    <td>{x.inStockAmountPct.toFixed(4)}</td>
                    <td>{x.fundCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 10 }}>持仓明细</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>类型</th>
                <th>代码</th>
                <th>名称</th>
                <th>金额</th>
                <th>份额</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="hint">暂无记录，请先去录入页添加。</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td><span className="tag">{row.type === "fund" ? "基金" : "股票"}</span></td>
                    <td>{row.code ?? "-"}</td>
                    <td>{row.name ?? "-"}</td>
                    <td>{row.amount ?? "-"}</td>
                    <td>{row.shares ?? "-"}</td>
                    <td>{fmtDate(row.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
