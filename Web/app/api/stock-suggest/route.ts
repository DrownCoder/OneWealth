import { NextResponse } from "next/server";
import { fetch10jqkaStockSuggest } from "@/lib/public/stock-suggest";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = String(searchParams.get("query") ?? searchParams.get("key") ?? "").trim();
  if (!query) {
    return NextResponse.json({ data: [] });
  }

  try {
    const list = await fetch10jqkaStockSuggest(query);
    return NextResponse.json({ data: list });
  } catch (error) {
    const message = error instanceof Error ? error.message : "stock suggest failed";
    return NextResponse.json({ data: [], error: message }, { status: 200 });
  }
}
