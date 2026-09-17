import { NextRequest } from "next/server";
import { exportLedgerReport } from "@/lib/store/ledger";

export const runtime = "nodejs";

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const report = await exportLedgerReport(ORG_ID, sessionId);
  return new Response(new Uint8Array(report), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="verya-ledger-export-${new Date().toISOString().slice(0, 10)}.txt"`,
    },
  });
}
