import { NextResponse } from "next/server";
import { fetchEastmoneyFundSuggest } from "@/lib/public/fund-suggest";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = String(searchParams.get("key") ?? "").trim();
  if (!key) {
    return NextResponse.json({ data: [] });
  }

  try {
    const list = await fetchEastmoneyFundSuggest(key);
    return NextResponse.json({ data: list });
  } catch {
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
