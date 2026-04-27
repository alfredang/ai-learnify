import { NextResponse } from "next/server"
import { findUnbalancedTransactions } from "@/lib/ledger"
import { audit } from "@/lib/audit"

/**
 * Spec §16: immutable ledger integrity check. Runs nightly and asserts that
 * every parentTxnId has legs summing to zero. Any imbalance is surfaced as
 * an audit event — investigate immediately.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const unbalanced = await findUnbalancedTransactions()

  if (unbalanced.length > 0) {
    await audit({
      action: "ledger.invariant_violation",
      resourceType: "ledger",
      metadata: { count: unbalanced.length, sample: unbalanced.slice(0, 5) },
    })
  }

  return NextResponse.json({
    ok: unbalanced.length === 0,
    unbalancedCount: unbalanced.length,
    sample: unbalanced.slice(0, 10),
  })
}
