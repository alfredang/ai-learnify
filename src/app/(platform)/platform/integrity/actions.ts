"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { findUnbalancedTransactions } from "@/lib/ledger"
import { audit } from "@/lib/audit"

export async function runIntegrityCheckAction() {
  const session = await auth()
  if (!session?.user || session.user.platformRole !== "PLATFORM_OWNER") {
    return { ok: false, error: "Forbidden" as const }
  }

  const unbalanced = await findUnbalancedTransactions()

  await audit({
    action: "ledger.invariant_check",
    resourceType: "ledger",
    userId: session.user.id,
    metadata: {
      unbalancedCount: unbalanced.length,
      sample: unbalanced.slice(0, 5),
      triggered: "manual",
    },
  })

  revalidatePath("/platform/integrity")

  return {
    ok: true as const,
    unbalancedCount: unbalanced.length,
    sample: unbalanced.slice(0, 10),
  }
}
