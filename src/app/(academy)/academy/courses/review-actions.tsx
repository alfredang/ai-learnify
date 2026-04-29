"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ReviewActionsProps {
  courseId: string
  courseTitle: string
  mode?: "review" | "rejected"
}

export function ReviewActions({
  courseId,
  courseTitle,
  mode = "review",
}: ReviewActionsProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [reason, setReason] = useState("")

  async function handleApprove() {
    setBusy("approve")
    try {
      const res = await fetch(`/api/academy/courses/${courseId}/approve`, {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to approve course")
      }
      toast.success(
        mode === "rejected" ? `Re-approved: ${courseTitle}` : `Approved: ${courseTitle}`
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed")
    } finally {
      setBusy(null)
    }
  }

  async function handleReject() {
    if (reason.trim().length < 5) {
      toast.error("Rejection reason must be at least 5 characters")
      return
    }
    setBusy("reject")
    try {
      const res = await fetch(`/api/academy/courses/${courseId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to reject course")
      }
      toast.success(`Rejected: ${courseTitle}`)
      setShowRejectDialog(false)
      setReason("")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rejection failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {mode === "review" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRejectDialog(true)}
            disabled={busy !== null}
          >
            {busy === "reject" && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Reject
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={busy !== null}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {busy === "approve" && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {mode === "rejected" ? "Re-approve" : "Approve"}
        </Button>
      </div>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject &quot;{courseTitle}&quot;?</DialogTitle>
            <DialogDescription>
              The author will see your feedback and can revise the course before
              resubmitting.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What needs to change before this course can be published?"
            rows={5}
            disabled={busy === "reject"}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              disabled={busy === "reject"}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={busy === "reject" || reason.trim().length < 5}
            >
              {busy === "reject" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
