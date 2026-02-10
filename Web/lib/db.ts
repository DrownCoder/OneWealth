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

export type FundHoldingRow = {
  id: number;
  code: string;
  name: string;
  amount: number;
};

export type LookthroughPositionInput = {
  zcType: string;
  zcCode: string;
  zcName: string;
  ccRate: number;
  hold: number | null;
  totalPrice: number | null;
  price: number | null;
  rate: number | null;
  changeRate: number | null;
};

export type LookthroughLatestRow = {
  fundCode: string;
  asOfDate: string;
  fetchedAt: string;
  zcType: string;
  zcCode: string;
  zcName: string;
  ccRate: number;
  hold: number | null;
  totalPrice: number | null;
  price: number | null;
  rate: number | null;
  changeRate: number | null;
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

db.exec(`
  CREATE TABLE IF NOT EXISTS fund_lookthrough_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_code TEXT NOT NULL,
    as_of_date TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    error_id INTEGER,
    error_msg TEXT
  );
`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_snapshot_unique
  ON fund_lookthrough_snapshots (fund_code, as_of_date);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS fund_lookthrough_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    zc_type TEXT NOT NULL,
    zc_code TEXT NOT NULL,
    zc_name TEXT NOT NULL,
    cc_rate REAL NOT NULL,
    hold REAL,
    total_price REAL,
    price REAL,
    rate REAL,
    change_rate REAL,
    FOREIGN KEY (snapshot_id) REFERENCES fund_lookthrough_snapshots(id) ON DELETE CASCADE
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

const listFundHoldingsStmt = db.prepare(`
  SELECT id, code, name, amount
  FROM holdings
  WHERE type = 'fund' AND code IS NOT NULL AND amount IS NOT NULL AND amount > 0
  ORDER BY id DESC
`);

const findSnapshotStmt = db.prepare(`
  SELECT id
  FROM fund_lookthrough_snapshots
  WHERE fund_code = ? AND as_of_date = ?
`);

const insertSnapshotStmt = db.prepare(`
  INSERT INTO fund_lookthrough_snapshots (fund_code, as_of_date, fetched_at, error_id, error_msg)
  VALUES (?, ?, datetime('now'), ?, ?)
`);

const updateSnapshotStmt = db.prepare(`
  UPDATE fund_lookthrough_snapshots
  SET fetched_at = datetime('now'),
      error_id = ?,
      error_msg = ?
  WHERE id = ?
`);

const deletePositionsBySnapshotStmt = db.prepare(`
  DELETE FROM fund_lookthrough_positions
  WHERE snapshot_id = ?
`);

const insertLookthroughPositionStmt = db.prepare(`
  INSERT INTO fund_lookthrough_positions (
    snapshot_id,
    zc_type,
    zc_code,
    zc_name,
    cc_rate,
    hold,
    total_price,
    price,
    rate,
    change_rate
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listLatestLookthroughRowsStmt = db.prepare(`
  SELECT
    s.fund_code AS fund_code,
    s.as_of_date AS as_of_date,
    s.fetched_at AS fetched_at,
    p.zc_type AS zc_type,
    p.zc_code AS zc_code,
    p.zc_name AS zc_name,
    p.cc_rate AS cc_rate,
    p.hold AS hold,
    p.total_price AS total_price,
    p.price AS price,
    p.rate AS rate,
    p.change_rate AS change_rate
  FROM fund_lookthrough_positions p
  JOIN fund_lookthrough_snapshots s ON s.id = p.snapshot_id
  JOIN (
    SELECT fund_code, MAX(as_of_date) AS max_as_of_date
    FROM fund_lookthrough_snapshots
    GROUP BY fund_code
  ) latest ON latest.fund_code = s.fund_code
          AND latest.max_as_of_date = s.as_of_date
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

export function listFundHoldings(): FundHoldingRow[] {
  const rows = listFundHoldingsStmt.all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    amount: Number(row.amount ?? 0),
  }));
}

export function replaceFundLookthroughSnapshot(input: {
  fundCode: string;
  asOfDate: string;
  errorId: number | null;
  errorMsg: string | null;
  positions: LookthroughPositionInput[];
}): { snapshotId: number; positions: number } {
  db.exec("BEGIN");
  try {
    const existed = findSnapshotStmt.get(input.fundCode, input.asOfDate) as Record<string, unknown> | undefined;
    let snapshotId = 0;

    if (existed?.id) {
      snapshotId = Number(existed.id);
      updateSnapshotStmt.run(input.errorId, input.errorMsg, snapshotId);
    } else {
      const inserted = insertSnapshotStmt.run(
        input.fundCode,
        input.asOfDate,
        input.errorId,
        input.errorMsg
      ) as { lastInsertRowid?: number | bigint };
      snapshotId = Number(inserted.lastInsertRowid ?? 0);
    }

    deletePositionsBySnapshotStmt.run(snapshotId);
    for (const p of input.positions) {
      insertLookthroughPositionStmt.run(
        snapshotId,
        p.zcType,
        p.zcCode,
        p.zcName,
        p.ccRate,
        p.hold,
        p.totalPrice,
        p.price,
        p.rate,
        p.changeRate
      );
    }

    db.exec("COMMIT");
    return { snapshotId, positions: input.positions.length };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listLatestLookthroughRows(): LookthroughLatestRow[] {
  const rows = listLatestLookthroughRowsStmt.all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    fundCode: String(row.fund_code ?? ""),
    asOfDate: String(row.as_of_date ?? ""),
    fetchedAt: String(row.fetched_at ?? ""),
    zcType: String(row.zc_type ?? ""),
    zcCode: String(row.zc_code ?? ""),
    zcName: String(row.zc_name ?? ""),
    ccRate: Number(row.cc_rate ?? 0),
    hold: row.hold === null ? null : Number(row.hold),
    totalPrice: row.total_price === null ? null : Number(row.total_price),
    price: row.price === null ? null : Number(row.price),
    rate: row.rate === null ? null : Number(row.rate),
    changeRate: row.change_rate === null ? null : Number(row.change_rate),
  }));
}
