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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, ShieldOff, ShieldCheck } from "lucide-react"

interface Props {
  userId: string
  email: string
  isActive: boolean
}

/** Academy-admin deactivate / reactivate button — spec §17. */
export function LearnerRowActions({ userId, email, isActive }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function handleSubmit(reactivate: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/academy/learners/${userId}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactivate, reason: reason.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Update failed")
      toast.success(reactivate ? "Learner reactivated" : "Learner deactivated")
      setOpen(false)
      setReason("")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    } finally {
      setBusy(false)
    }
  }

  if (!isActive) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => handleSubmit(true)}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
        )}
        Reactivate
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
          <ShieldOff className="h-3.5 w-3.5 mr-1" /> Deactivate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate this learner?</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{email}</span> will be blocked
            from signing in. All records (certificates, invoices, progress)
            are preserved per spec §17.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label className="text-xs">Reason (optional)</Label>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Logged in the audit trail — only visible to admins."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleSubmit(false)}
            disabled={busy}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
