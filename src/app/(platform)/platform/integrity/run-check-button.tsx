"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { runIntegrityCheckAction } from "./actions"

export function RunCheckButton() {
  const [isPending, startTransition] = useTransition()
  const [lastResult, setLastResult] = useState<string | null>(null)

  function run() {
    startTransition(async () => {
      const r = await runIntegrityCheckAction()
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      if (r.unbalancedCount === 0) {
        toast.success("All transactions balance ✓")
      } else {
        toast.error(`${r.unbalancedCount} unbalanced transaction(s) detected`)
      }
      setLastResult(
        r.unbalancedCount === 0
          ? "Ledger balances. ✓"
          : `${r.unbalancedCount} parentTxnId(s) do not sum to zero.`
      )
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={run} disabled={isPending} size="sm">
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        Run check now
      </Button>
      {lastResult && (
        <p className="text-xs text-muted-foreground">{lastResult}</p>
      )}
    </div>
  )
}
