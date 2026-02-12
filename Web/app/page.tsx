"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getHoldings, type Holding } from "@/lib/services/holdings";
import { getLookthroughSummary, refreshLookthrough, type LookthroughSummary } from "@/lib/services/lookthrough";
import {
  getFundProfileSummary,
  refreshFundProfiles,
  type FundProfileSummary,
} from "@/lib/services/fund-profiles";

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function fmtSigned(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

export default function DashboardPage() {
  const [rows, setRows] = useState<Holding[]>([]);
  const [lookthrough, setLookthrough] = useState<LookthroughSummary | null>(null);
  const [fundProfile, setFundProfile] = useState<FundProfileSummary | null>(null);
  const [loadingLookthrough, setLoadingLookthrough] = useState(false);
  const [loadingFundProfile, setLoadingFundProfile] = useState(false);
  const [refreshHint, setRefreshHint] = useState("");
  const [profileHint, setProfileHint] = useState("");
  const autoRefreshed = useRef(false);
  const filterInit = useRef(false);
  const [selectedFundCodes, setSelectedFundCodes] = useState<string[]>([]);
  const [selectedFundTypes, setSelectedFundTypes] = useState<string[]>([]);
  const [didUserTouchFilter, setDidUserTouchFilter] = useState(false);
  const [selectedHoldingFundTypes, setSelectedHoldingFundTypes] = useState<string[]>([]);
  const [fundTypeCache, setFundTypeCache] = useState<Record<string, string>>({});

  function sameStringArray(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async function loadBase() {
    const list = await getHoldings();
    setRows(list);
  }

  async function loadLookthrough(codes?: string[]) {
    try {
      const summary = await getLookthroughSummary(codes);
      setLookthrough(summary);
    } catch {
      setLookthrough(null);
    }
  }

  async function loadFundProfile(codes?: string[]) {
    try {
      const summary = await getFundProfileSummary(codes);
      setFundProfile(summary);
      setFundTypeCache((prev) => {
        const next = { ...prev };
        for (const f of summary.funds ?? []) {
          const code = String(f.code ?? "").trim();
          if (!code) continue;
          const fundType = String(f.fundType ?? "").trim();
          if (fundType) next[code] = fundType;
        }
        return next;
      });
    } catch {
      setFundProfile(null);
    }
  }

  useEffect(() => {
    loadBase().catch(() => setRows([]));
  }, []);

  const fundTypeByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const [code, fundType] of Object.entries(fundTypeCache)) {
      const c = String(code || "").trim();
      if (!c) continue;
      map.set(c, String(fundType || "未分类"));
    }
    for (const r of rows) {
      if (r.type !== "fund" || !r.code) continue;
      const code = String(r.code);
      if (!map.has(code)) map.set(code, "未分类");
    }
    return map;
  }, [fundTypeCache, rows]);

  const fundOptions = useMemo(
    () =>
      rows
        .filter((r) => r.type === "fund" && r.code)
        .map((r) => {
          const code = String(r.code);
          return {
            code,
            name: String(r.name || code),
            fundType: fundTypeByCode.get(code) || "未分类",
          };
        })
        .filter((x, idx, arr) => arr.findIndex((y) => y.code === x.code) === idx),
    [rows, fundTypeByCode]
  );

  const fundTypeOptions = useMemo(
    () =>
      [...new Set(fundOptions.map((f) => f.fundType))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "zh-CN")),
    [fundOptions]
  );

  const visibleFundOptions = useMemo(() => {
    if (selectedFundTypes.length === 0) return fundOptions;
    const set = new Set(selectedFundTypes);
    return fundOptions.filter((f) => set.has(f.fundType));
  }, [fundOptions, selectedFundTypes]);

  useEffect(() => {
    if (filterInit.current) return;
    if (fundOptions.length === 0) return;
    filterInit.current = true;
    setSelectedFundCodes(fundOptions.map((f) => f.code));
  }, [fundOptions]);

  function getEffectiveFilterCodes(): string[] | undefined {
    if (!didUserTouchFilter && selectedFundCodes.length === 0) return undefined;
    return selectedFundCodes;
  }

  useEffect(() => {
    // If fund list exists but selection is not initialized yet, skip this round.
    if (!filterInit.current && fundOptions.length > 0) return;

    const codes = getEffectiveFilterCodes();
    Promise.all([loadLookthrough(codes), loadFundProfile(codes)]).catch(() => {
      setLookthrough(null);
      setFundProfile(null);
    });
  }, [selectedFundCodes, fundOptions.length, didUserTouchFilter]);

  useEffect(() => {
    if (autoRefreshed.current) return;
    autoRefreshed.current = true;
    Promise.all([doRefreshFundProfile(), doRefreshLookthrough()]).catch(() => {});
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
      const codes = getEffectiveFilterCodes();
      await loadLookthrough(codes);
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

  async function doRefreshFundProfile() {
    setLoadingFundProfile(true);
    setProfileHint("");
    try {
      const result = await refreshFundProfiles();
      const codes = getEffectiveFilterCodes();
      await loadFundProfile(codes);
      if ((result.failed?.length ?? 0) > 0) {
        const first = result.failed?.[0];
        setProfileHint(
          `刷新完成：${result.refreshedFunds}/${result.funds} 成功，失败 ${result.failed?.length}。` +
            (first ? ` 示例：${first.fundCode} - ${first.message}` : "")
        );
      } else {
        setProfileHint(`刷新完成：${result.refreshedFunds}/${result.funds} 成功。`);
      }
    } finally {
      setLoadingFundProfile(false);
    }
  }

  const topPenetrated = lookthrough?.positions?.slice(0, 15) ?? [];
  const selectedFundCount = selectedFundCodes.length;
  const selectedFundTypeCount = selectedFundTypes.length;

  const holdingFundTypeOptions = useMemo(
    () =>
      [...new Set(rows.filter((r) => r.type === "fund" && r.code).map((r) => fundTypeByCode.get(String(r.code)) || "未分类"))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "zh-CN")),
    [rows, fundTypeByCode]
  );

  const visibleHoldingRows = useMemo(() => {
    if (selectedHoldingFundTypes.length === 0) return rows;
    const set = new Set(selectedHoldingFundTypes);
    return rows.filter((r) => {
      if (r.type !== "fund") return true;
      const fundType = r.code ? fundTypeByCode.get(String(r.code)) || "未分类" : "未分类";
      return set.has(fundType);
    });
  }, [rows, selectedHoldingFundTypes, fundTypeByCode]);

  function toggleFundCode(code: string, checked: boolean) {
    setDidUserTouchFilter(true);
    setSelectedFundCodes((prev) => {
      if (checked) return prev.includes(code) ? prev : [...prev, code];
      return prev.filter((x) => x !== code);
    });
  }

  function toggleFundType(type: string, checked: boolean) {
    setDidUserTouchFilter(true);
    setSelectedFundTypes((prev) => {
      const nextTypes = checked
        ? (prev.includes(type) ? prev : [...prev, type])
        : prev.filter((x) => x !== type);

      const typeSet = new Set(nextTypes);
      const nextCodes =
        nextTypes.length === 0
          ? fundOptions.map((f) => f.code)
          : fundOptions.filter((f) => typeSet.has(f.fundType)).map((f) => f.code);

      setSelectedFundCodes((oldCodes) => (sameStringArray(oldCodes, nextCodes) ? oldCodes : nextCodes));
      return nextTypes;
    });
  }

  function toggleHoldingFundType(type: string, checked: boolean) {
    setSelectedHoldingFundTypes((prev) => {
      if (checked) return prev.includes(type) ? prev : [...prev, type];
      return prev.filter((x) => x !== type);
    });
  }

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
          <h2>基金基础信息大盘</h2>
          <button type="button" className="quick-btn" disabled={loadingFundProfile} onClick={doRefreshFundProfile}>
            {loadingFundProfile ? "刷新中..." : "刷新基金基础信息"}
          </button>
        </div>

        <div className="grid" style={{ marginBottom: 12 }}>
          <article className="card">
            <h3>覆盖基金</h3>
            <p style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{fundProfile?.totals?.profileCoveredCount ?? 0}</p>
          </article>
          <article className="card">
            <h3>基金总金额</h3>
            <p style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>
              ¥{Number(fundProfile?.totals?.totalFundAmount ?? 0).toFixed(2)}
            </p>
          </article>
          <article className="card">
            <h3>今日估算盈亏</h3>
            <p
              style={{
                marginTop: 8,
                fontSize: 24,
                fontWeight: 700,
                color: Number(fundProfile?.totals?.totalTodayPnl ?? 0) >= 0 ? "#0f8f61" : "#c0392b",
              }}
            >
              ¥{fmtSigned(Number(fundProfile?.totals?.totalTodayPnl ?? 0))}
            </p>
          </article>
          <article className="card">
            <h3>加权当日涨幅(%)</h3>
            <p
              style={{
                marginTop: 8,
                fontSize: 24,
                fontWeight: 700,
                color: Number(fundProfile?.totals?.weightedRatePct ?? 0) >= 0 ? "#0f8f61" : "#c0392b",
              }}
            >
              {Number(fundProfile?.totals?.weightedRatePct ?? 0).toFixed(4)}
            </p>
          </article>
        </div>

        {profileHint ? <p className="hint" style={{ marginBottom: 10 }}>{profileHint}</p> : null}

        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table>
            <thead>
              <tr>
                <th>基金类型</th>
                <th>基金数</th>
                <th>总金额</th>
                <th>今日估算盈亏</th>
                <th>加权涨幅(%)</th>
              </tr>
            </thead>
            <tbody>
              {(fundProfile?.groups?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="hint">暂无类型汇总，点击“刷新基金基础信息”后再查看。</td>
                </tr>
              ) : (
                (fundProfile?.groups ?? []).map((g) => (
                  <tr key={g.fundType}>
                    <td>{g.fundType}</td>
                    <td>{g.fundCount}</td>
                    <td>¥{g.totalAmount.toFixed(2)}</td>
                    <td style={{ color: g.totalTodayPnl >= 0 ? "#0f8f61" : "#c0392b" }}>¥{fmtSigned(g.totalTodayPnl)}</td>
                    <td style={{ color: g.weightedRatePct >= 0 ? "#0f8f61" : "#c0392b" }}>{g.weightedRatePct.toFixed(4)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2>基金穿透持仓汇总</h2>
          <button type="button" className="quick-btn" disabled={loadingLookthrough} onClick={doRefreshLookthrough}>
            {loadingLookthrough ? "刷新中..." : "刷新穿透数据"}
          </button>
        </div>

        <div className="card filter-panel" style={{ marginBottom: 12 }}>
          <div className="filter-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3>筛选基金</h3>
              <span className="filter-count">已选 {selectedFundCount}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="quick-btn"
                onClick={() => {
                  setDidUserTouchFilter(true);
                  setSelectedFundCodes(visibleFundOptions.map((f) => f.code));
                }}
              >
                全选
              </button>
              <button
                type="button"
                className="quick-btn"
                onClick={() => {
                  setDidUserTouchFilter(true);
                  setSelectedFundCodes([]);
                }}
              >
                清空
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="hint">基金类型</span>
              <span className="filter-count">已选 {selectedFundTypeCount}</span>
            </div>
            <div className="fund-chip-wrap">
              {fundTypeOptions.length === 0 ? (
                <span className="hint">暂无基金类型</span>
              ) : (
                fundTypeOptions.map((t) => {
                  const checked = selectedFundTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`fund-chip ${checked ? "is-selected" : ""}`}
                      onClick={() => toggleFundType(t, !checked)}
                    >
                      <span className="fund-chip-name">{t}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="fund-chip-wrap">
            {fundOptions.length === 0 ? (
              <span className="hint">暂无基金可筛选</span>
            ) : visibleFundOptions.length === 0 ? (
              <span className="hint">当前基金类型下暂无基金</span>
            ) : (
              visibleFundOptions.map((f) => {
                const checked = selectedFundCodes.includes(f.code);
                return (
                  <button
                    key={f.code}
                    type="button"
                    className={`fund-chip ${checked ? "is-selected" : ""}`}
                    onClick={() => toggleFundCode(f.code, !checked)}
                  >
                    <span className="fund-chip-code">{f.code}</span>
                    <span className="fund-chip-name">{f.name}</span>
                    <span className="suggest-category">{f.fundType}</span>
                  </button>
                );
              })
            )}
          </div>
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
        <div className="card filter-panel" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <h3>按基金类型筛选明细</h3>
            <span className="filter-count">已选 {selectedHoldingFundTypes.length}</span>
          </div>
          <div className="fund-chip-wrap">
            {holdingFundTypeOptions.length === 0 ? (
              <span className="hint">暂无基金类型</span>
            ) : (
              holdingFundTypeOptions.map((t) => {
                const checked = selectedHoldingFundTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className={`fund-chip ${checked ? "is-selected" : ""}`}
                    onClick={() => toggleHoldingFundType(t, !checked)}
                  >
                    <span className="fund-chip-name">{t}</span>
                  </button>
                );
              })
            )}
            <button
              type="button"
              className="quick-btn"
              onClick={() => setSelectedHoldingFundTypes([])}
            >
              清空明细筛选
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>类型</th>
                <th>代码</th>
                <th>名称</th>
                <th>基金类型</th>
                <th>金额</th>
                <th>份额</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {visibleHoldingRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="hint">暂无记录，请先去录入页添加。</td>
                </tr>
              ) : (
                visibleHoldingRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td><span className="tag">{row.type === "fund" ? "基金" : "股票"}</span></td>
                    <td>{row.code ?? "-"}</td>
                    <td>{row.name ?? "-"}</td>
                    <td>{row.type === "fund" ? (row.code ? fundTypeByCode.get(String(row.code)) || "未分类" : "未分类") : "-"}</td>
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
