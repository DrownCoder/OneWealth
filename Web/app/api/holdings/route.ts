import { NextResponse } from "next/server";
import {
  deleteHoldingById,
  deleteHoldingsByIds,
  getHoldingBasicById,
  insertFund,
  insertStock,
  listHoldings,
  updateFundAmount,
  updateStockShares,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await listHoldings();
    return NextResponse.json({ data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body?.type === "fund") {
      const code = String(body.code ?? "").trim();
      const name = String(body.name ?? "").trim();
      const amount = Number(body.amount);
      if (!code || !name || !Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "基金参数无效" }, { status: 400 });
      }

      const id = await insertFund({ code, name, amount });
      return NextResponse.json({ id }, { status: 201 });
    }

    if (body?.type === "stock") {
      const code = String(body.code ?? "").trim();
      const name = String(body.name ?? "").trim();
      const shares = Number(body.shares);

      if (!code || !name || !Number.isFinite(shares) || shares <= 0) {
        return NextResponse.json({ error: "股票参数无效" }, { status: 400 });
      }

      const id = await insertStock({ code, name, shares });
      return NextResponse.json({ id }, { status: 201 });
    }

    return NextResponse.json({ error: "仅支持 fund 或 stock" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "写入失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = String(searchParams.get("ids") ?? "").trim();
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length === 0) {
        return NextResponse.json({ error: "ids 参数无效" }, { status: 400 });
      }
      const deleted = deleteHoldingsByIds(ids);
      return NextResponse.json({ ok: true, deleted });
    }

    const id = Number(searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "id 参数无效" }, { status: 400 });
    }

    const ok = deleteHoldingById(id);
    if (!ok) {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "id 参数无效" }, { status: 400 });
    }

    const row = getHoldingBasicById(id);
    if (!row) {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }

    if (row.type === "fund") {
      const amount = Number(body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "金额参数无效" }, { status: 400 });
      }
      const ok = updateFundAmount(id, amount);
      if (!ok) return NextResponse.json({ error: "更新失败" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (row.type === "stock") {
      const shares = Number(body?.shares);
      if (!Number.isFinite(shares) || shares <= 0) {
        return NextResponse.json({ error: "份额参数无效" }, { status: 400 });
      }
      const ok = updateStockShares(id, shares);
      if (!ok) return NextResponse.json({ error: "更新失败" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "不支持的类型" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
