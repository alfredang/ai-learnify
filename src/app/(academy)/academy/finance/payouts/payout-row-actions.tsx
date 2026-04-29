"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, FileText } from "lucide-react"

interface Props {
  batchId: string
  status: "DRAFT" | "APPROVED" | "PAID" | "CANCELLED"
}

export function PayoutRowActions({ batchId, status }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [processorRef, setProcessorRef] = useState("")

  const paymentRequestUrl = `/api/academy/payouts/${batchId}/payment-request`

  async function transition(
    body: { status: "APPROVED" | "PAID" | "CANCELLED"; processorRef?: string; reason?: string }
  ) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/academy/payouts/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Update failed")
      toast.success(`Batch ${body.status.toLowerCase()}`)
      setPayOpen(false)
      setProcessorRef("")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    } finally {
      setSubmitting(false)
    }
  }

  // Payment Request document (spec §4 walkthrough step 7) is available at
  // every status — it's a snapshot of the underlying ledger legs and is
  // useful even after the batch is paid as a record of what was paid.
  const paymentRequestButton = (
    <Button
      size="sm"
      variant="ghost"
      asChild
      title="Generate Payment Request document (spec §4 walkthrough step 7)"
    >
      <a href={paymentRequestUrl} target="_blank" rel="noopener noreferrer">
        <FileText className="h-3.5 w-3.5 mr-1" />
        Request
      </a>
    </Button>
  )

  if (status === "PAID" || status === "CANCELLED") {
    return <div className="flex gap-1 justify-end">{paymentRequestButton}</div>
  }

  return (
    <div className="flex gap-1 justify-end">
      {paymentRequestButton}
      {status === "DRAFT" && (
        <Button
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={() => transition({ status: "APPROVED" })}
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
        </Button>
      )}
      {status === "APPROVED" && (
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="default" disabled={submitting}>
              Mark paid
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark batch paid</DialogTitle>
              <DialogDescription>
                Record the external processor reference (Stripe transfer id,
                ACH reference, etc.) so the ledger entries and this payout stay
                reconciled.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs">Processor reference</Label>
              <Input
                value={processorRef}
                onChange={(e) => setProcessorRef(e.target.value)}
                placeholder="po_... / tr_... / ACH-1234"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  transition({
                    status: "PAID",
                    processorRef: processorRef.trim() || undefined,
                  })
                }
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Confirm paid
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={submitting}
        onClick={() => {
          if (
            confirm(
              "Cancel this batch? Attached ledger legs will be released back to the pool for future batching."
            )
          ) {
            transition({ status: "CANCELLED" })
          }
        }}
      >
        Cancel
      </Button>
    </div>
  )
}
