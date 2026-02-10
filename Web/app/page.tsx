"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createFundHolding,
  createStockHolding,
  deleteHolding,
  deleteHoldings,
  getHoldings,
  updateHolding,
  type Holding,
} from "@/lib/services/holdings";
import { getFundSuggestions, type FundSuggestItem } from "@/lib/services/fund-suggest";
import { getStockSuggestions, type StockSuggestItem } from "@/lib/services/stock-suggest";

export default function Page() {
  const [rows, setRows] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [fundCode, setFundCode] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [selectedFund, setSelectedFund] = useState<FundSuggestItem | null>(null);
  const [fundPickError, setFundPickError] = useState("");

  const [stockName, setStockName] = useState("");
  const [stockShares, setStockShares] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockSuggestItem | null>(null);
  const [stockPickError, setStockPickError] = useState("");

  const [suggestions, setSuggestions] = useState<FundSuggestItem[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestTimer = useRef<number | null>(null);
  const suppressFundSuggestOnce = useRef(false);
  const [stockSuggestions, setStockSuggestions] = useState<StockSuggestItem[]>([]);
  const [showStockSuggest, setShowStockSuggest] = useState(false);
  const stockSuggestTimer = useRef<number | null>(null);
  const suppressStockSuggestOnce = useRef(false);

  async function fetchRows() {
    const list = await getHoldings();
    setRows(list);
    setSelectedIds((prev) => prev.filter((id) => list.some((row) => row.id === id)));
  }

  useEffect(() => {
    fetchRows();
  }, []);

  useEffect(() => {
    if (suggestTimer.current) {
      window.clearTimeout(suggestTimer.current);
    }
    if (suppressFundSuggestOnce.current) {
      suppressFundSuggestOnce.current = false;
      return;
    }

    const key = fundCode.trim();
    if (!key) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }

    suggestTimer.current = window.setTimeout(async () => {
      try {
        const list = await getFundSuggestions(key);
        setSuggestions(list);
        setShowSuggest(true);
      } catch {
        setSuggestions([]);
        setShowSuggest(false);
      }
    }, 250);

    return () => {
      if (suggestTimer.current) {
        window.clearTimeout(suggestTimer.current);
      }
    };
  }, [fundCode]);

  useEffect(() => {
    if (stockSuggestTimer.current) {
      window.clearTimeout(stockSuggestTimer.current);
    }
    if (suppressStockSuggestOnce.current) {
      suppressStockSuggestOnce.current = false;
      return;
    }

    const key = stockName.trim();
    if (!key) {
      setStockSuggestions([]);
      setShowStockSuggest(false);
      return;
    }

    stockSuggestTimer.current = window.setTimeout(async () => {
      try {
        const list = await getStockSuggestions(key);
        setStockSuggestions(list);
        setShowStockSuggest(true);
      } catch {
        setStockSuggestions([]);
        setShowStockSuggest(false);
      }
    }, 250);

    return () => {
      if (stockSuggestTimer.current) {
        window.clearTimeout(stockSuggestTimer.current);
      }
    };
  }, [stockName]);

  const suggestVisible = useMemo(
    () => showSuggest && suggestions.length > 0,
    [showSuggest, suggestions]
  );
  const stockSuggestVisible = useMemo(
    () => showStockSuggest && stockSuggestions.length > 0,
    [showStockSuggest, stockSuggestions]
  );
  const stockSuggestEmptyVisible = useMemo(
    () => showStockSuggest && stockName.trim().length > 0 && stockSuggestions.length === 0,
    [showStockSuggest, stockName, stockSuggestions]
  );
  const fundCanSubmit = useMemo(() => {
    const amount = Number(fundAmount);
    return !!selectedFund && fundCode.trim() === (selectedFund.code || selectedFund.name) && amount > 0;
  }, [selectedFund, fundCode, fundAmount]);
  const stockCanSubmit = useMemo(() => {
    const shares = Number(stockShares);
    return !!selectedStock && stockName.trim() === (selectedStock.name || selectedStock.code) && shares > 0;
  }, [selectedStock, stockName, stockShares]);

  async function submitFund(e: FormEvent) {
    e.preventDefault();
    const code = fundCode.trim();
    const name = (selectedFund?.name || "").trim();
    const amount = Number(fundAmount);
    if (!code || !Number.isFinite(amount) || amount <= 0) return;
    if (!selectedFund || code !== (selectedFund.code || selectedFund.name)) {
      setFundPickError("请从联想列表中选择基金");
      return;
    }

    setLoading(true);
    try {
      await createFundHolding({ code, name, amount });
      setFundCode("");
      setFundAmount("");
      setSelectedFund(null);
      setFundPickError("");
      setSuggestions([]);
      setShowSuggest(false);
      await fetchRows();
    } finally {
      setLoading(false);
    }
  }

  async function submitStock(e: FormEvent) {
    e.preventDefault();
    const name = stockName.trim();
    const code = (selectedStock?.code || "").trim();
    const shares = Number(stockShares);
    if (!name || !Number.isFinite(shares) || shares <= 0) return;
    if (!selectedStock || !code || name !== (selectedStock.name || selectedStock.code)) {
      setStockPickError("请从联想列表中选择股票");
      return;
    }

    setLoading(true);
    try {
      await createStockHolding({ code, name, shares });
      setStockName("");
      setStockShares("");
      setSelectedStock(null);
      setStockPickError("");
      setStockSuggestions([]);
      setShowStockSuggest(false);
      await fetchRows();
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(id: number) {
    if (!confirm("确认删除这条记录吗？")) return;
    setDeletingId(id);
    try {
      await deleteHolding(id);
      await fetchRows();
    } finally {
      setDeletingId(null);
    }
  }

  async function removeSelectedRows() {
    if (selectedIds.length === 0) return;
    if (!confirm(`确认删除选中的 ${selectedIds.length} 条记录吗？`)) return;
    setDeletingBatch(true);
    try {
      await deleteHoldings(selectedIds);
      await fetchRows();
    } finally {
      setDeletingBatch(false);
    }
  }

  function toggleRowSelected(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(rows.map((row) => row.id));
      return;
    }
    setSelectedIds([]);
  }

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  async function editRow(row: Holding) {
    if (row.type === "fund") {
      const current = row.amount ?? 0;
      const next = prompt("请输入新的金额", String(current));
      if (next === null) return;
      const amount = Number(next);
      if (!Number.isFinite(amount) || amount <= 0) {
        alert("金额无效");
        return;
      }
      await updateHolding({ id: row.id, amount });
      await fetchRows();
      return;
    }

    const current = row.shares ?? 0;
    const next = prompt("请输入新的份额", String(current));
    if (next === null) return;
    const shares = Number(next);
    if (!Number.isFinite(shares) || shares <= 0) {
      alert("份额无效");
      return;
    }
    await updateHolding({ id: row.id, shares });
    await fetchRows();
  }

  return (
    <main className="container">
      <section>
        <h1>理财录入（Next.js + 本地 DB）</h1>
        <p className="hint">仅录入基金代码+金额、股票名称+份额。提交后写入本地 SQLite。</p>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>录入理财</h2>
        <div className="grid">
          <form className="card" onSubmit={submitFund}>
            <h3 style={{ marginBottom: 10 }}>录入基金</h3>
            <div className="field" style={{ position: "relative" }}>
              <label htmlFor="fund-code">基金代码</label>
              <input
                id="fund-code"
                value={fundCode}
                onChange={(e) => {
                  setFundCode(e.target.value);
                  setSelectedFund(null);
                  setFundPickError("");
                }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                placeholder="例如：110022"
                autoComplete="off"
                required
              />
              {suggestVisible && (
                <div className="suggest">
                  {suggestions.map((item) => (
                    <button
                      key={`${item.code}-${item.name}`}
                      type="button"
                      className="suggest-item"
                      onMouseDown={() => {
                        suppressFundSuggestOnce.current = true;
                        setFundCode(item.code || item.name);
                        setSelectedFund(item);
                        setFundPickError("");
                        setShowSuggest(false);
                      }}
                    >
                      <span className="suggest-code">{item.code || "-"}</span>
                      <span className="suggest-name">{item.name || "-"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {fundPickError && <div className="suggest-empty">{fundPickError}</div>}
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="fund-amount">金额 (¥)</label>
              <input
                id="fund-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                required
              />
              <div className="quick-amounts">
                <button type="button" className="quick-btn" onClick={() => setFundAmount("10000")}>
                  1w
                </button>
                <button type="button" className="quick-btn" onClick={() => setFundAmount("50000")}>
                  5w
                </button>
                <button type="button" className="quick-btn" onClick={() => setFundAmount("100000")}>
                  10w
                </button>
              </div>
            </div>
            <button style={{ marginTop: 12, width: "100%" }} disabled={loading || !fundCanSubmit}>
              添加基金
            </button>
          </form>

          <form className="card" onSubmit={submitStock}>
            <h3 style={{ marginBottom: 10 }}>录入股票</h3>
            <div className="field" style={{ position: "relative" }}>
              <label htmlFor="stock-name">股票名称</label>
              <input
                id="stock-name"
                value={stockName}
                onChange={(e) => {
                  setStockName(e.target.value);
                  setSelectedStock(null);
                  setStockPickError("");
                }}
                onFocus={() => setShowStockSuggest(true)}
                onBlur={() => setTimeout(() => setShowStockSuggest(false), 120)}
                placeholder="例如：贵州茅台"
                autoComplete="off"
                required
              />
              {stockSuggestVisible && (
                <div className="suggest">
                  {stockSuggestions.map((item) => (
                    <button
                      key={`${item.code}-${item.name}`}
                      type="button"
                      className="suggest-item"
                      onMouseDown={() => {
                        suppressStockSuggestOnce.current = true;
                        setStockName(item.name || item.code);
                        setSelectedStock(item);
                        setStockPickError("");
                        setShowStockSuggest(false);
                      }}
                    >
                      <span className="suggest-code">{item.code || "-"}</span>
                      <span className="suggest-name-wrap">
                        <span className="suggest-name">{item.name || "-"}</span>
                        {item.category ? <span className="suggest-category">{item.category}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {stockPickError && <div className="suggest-empty">{stockPickError}</div>}
              {stockSuggestEmptyVisible && <div className="suggest-empty">未找到联想结果</div>}
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="stock-shares">份额</label>
              <input
                id="stock-shares"
                type="number"
                min="1"
                step="1"
                value={stockShares}
                onChange={(e) => setStockShares(e.target.value)}
                required
              />
              <div className="quick-amounts">
                <button type="button" className="quick-btn" onClick={() => setStockShares("5")}>
                  5份
                </button>
                <button type="button" className="quick-btn" onClick={() => setStockShares("20")}>
                  20份
                </button>
                <button type="button" className="quick-btn" onClick={() => setStockShares("50")}>
                  50份
                </button>
                <button type="button" className="quick-btn" onClick={() => setStockShares("100")}>
                  100份
                </button>
              </div>
            </div>
            <button style={{ marginTop: 12, width: "100%" }} disabled={loading || !stockCanSubmit}>
              添加股票
            </button>
          </form>
        </div>
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2>已录入数据（读取自本地 DB）</h2>
          <button
            type="button"
            className="quick-btn"
            disabled={selectedIds.length === 0 || deletingBatch}
            onClick={removeSelectedRows}
          >
            {deletingBatch ? "批量删除中..." : `批量删除(${selectedIds.length})`}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    aria-label="全选"
                  />
                </th>
                <th>ID</th>
                <th>类型</th>
                <th>代码</th>
                <th>名称</th>
                <th>金额</th>
                <th>份额</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="hint">
                    暂无记录
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) => toggleRowSelected(row.id, e.target.checked)}
                        aria-label={`选择记录-${row.id}`}
                      />
                    </td>
                    <td>{row.id}</td>
                    <td>
                      <span className="tag">{row.type === "fund" ? "基金" : "股票"}</span>
                    </td>
                    <td>{row.code ?? "-"}</td>
                    <td>{row.name ?? "-"}</td>
                    <td>{row.amount ?? "-"}</td>
                    <td>{row.shares ?? "-"}</td>
                    <td>{row.created_at}</td>
                    <td>
                      <button
                        type="button"
                        className="quick-btn"
                        style={{ marginRight: 8 }}
                        onClick={() => editRow(row)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="quick-btn"
                        disabled={deletingId === row.id}
                        onClick={() => removeRow(row.id)}
                      >
                        {deletingId === row.id ? "删除中..." : "删除"}
                      </button>
                    </td>
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
