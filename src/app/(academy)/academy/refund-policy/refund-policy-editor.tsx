"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { toast } from "sonner"
import { Loader2, Save, ExternalLink } from "lucide-react"
import Link from "next/link"

interface RefundPolicyEditorProps {
  initialHtml: string
}

export function RefundPolicyEditor({ initialHtml }: RefundPolicyEditorProps) {
  const [html, setHtml] = useState(initialHtml)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch("/api/academy/refund-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundPolicyHtml: html }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || "Failed to save")
      }

      toast.success("Refund policy saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <RichTextEditor
            content={html}
            onChange={setHtml}
            placeholder="Write your refund policy here..."
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" asChild>
          <Link href="/refund-policy" target="_blank">
            <ExternalLink className="h-4 w-4 mr-2" />
            Preview public page
          </Link>
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Policy
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        If left empty, a default non-refundable policy will be displayed. All refunds are
        manual and exceptional only — processed as ledger reversals by the Academy Admin.
      </p>
    </div>
  )
}
