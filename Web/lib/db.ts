import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type HoldingType = "fund" | "stock";

export type HoldingRow = {
  id: number;
  type: HoldingType;
  code: string | null;
  name: string | null;
  amount: number | null;
  shares: number | null;
  created_at: string;
};

const dataDir = path.join(process.cwd(), "data");
const dbFile = path.join(dataDir, "finance.sqlite");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('fund','stock')),
    code TEXT,
    name TEXT,
    amount REAL,
    shares REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const listStmt = db.prepare(`
  SELECT id, type, code, name, amount, shares, created_at
  FROM holdings
  ORDER BY id DESC
`);

const insertFundStmt = db.prepare(`
  INSERT INTO holdings (type, code, name, amount, created_at)
  VALUES ('fund', ?, ?, ?, datetime('now'))
`);

const insertStockStmt = db.prepare(`
  INSERT INTO holdings (type, code, name, shares, created_at)
  VALUES ('stock', ?, ?, ?, datetime('now'))
`);

const deleteStmt = db.prepare(`
  DELETE FROM holdings
  WHERE id = ?
`);

const getByIdStmt = db.prepare(`
  SELECT id, type, amount, shares
  FROM holdings
  WHERE id = ?
`);

const updateFundAmountStmt = db.prepare(`
  UPDATE holdings
  SET amount = ?
  WHERE id = ? AND type = 'fund'
`);

const updateStockSharesStmt = db.prepare(`
  UPDATE holdings
  SET shares = ?
  WHERE id = ? AND type = 'stock'
`);

export function listHoldings(): HoldingRow[] {
  const rows = listStmt.all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: Number(row.id),
    type: String(row.type) as HoldingType,
    code: row.code === null ? null : String(row.code),
    name: row.name === null ? null : String(row.name),
    amount: row.amount === null ? null : Number(row.amount),
    shares: row.shares === null ? null : Number(row.shares),
    created_at: String(row.created_at ?? ""),
  }));
}

export function insertFund(input: { code: string; name: string; amount: number }): number {
  const result = insertFundStmt.run(input.code, input.name, input.amount) as {
    lastInsertRowid?: number | bigint;
  };
  return Number(result.lastInsertRowid ?? 0);
}

export function insertStock(input: { code: string; name: string; shares: number }): number {
  const result = insertStockStmt.run(input.code, input.name, input.shares) as {
    lastInsertRowid?: number | bigint;
  };
  return Number(result.lastInsertRowid ?? 0);
}

export function deleteHoldingById(id: number): boolean {
  const result = deleteStmt.run(id) as { changes?: number | bigint };
  return Number(result.changes ?? 0) > 0;
}

export function deleteHoldingsByIds(ids: number[]): number {
  const valid = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (valid.length === 0) return 0;

  const placeholders = valid.map(() => "?").join(",");
  const stmt = db.prepare(`DELETE FROM holdings WHERE id IN (${placeholders})`);
  const result = stmt.run(...valid) as { changes?: number | bigint };
  return Number(result.changes ?? 0);
}

export function getHoldingBasicById(id: number): { id: number; type: HoldingType; amount: number | null; shares: number | null } | null {
  const row = getByIdStmt.get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    type: String(row.type) as HoldingType,
    amount: row.amount === null ? null : Number(row.amount),
    shares: row.shares === null ? null : Number(row.shares),
  };
}

export function updateFundAmount(id: number, amount: number): boolean {
  const result = updateFundAmountStmt.run(amount, id) as { changes?: number | bigint };
  return Number(result.changes ?? 0) > 0;
}

export function updateStockShares(id: number, shares: number): boolean {
  const result = updateStockSharesStmt.run(shares, id) as { changes?: number | bigint };
  return Number(result.changes ?? 0) > 0;
}
