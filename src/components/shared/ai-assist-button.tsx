"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Sparkles, Check, X, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

export type AiCapabilityClient =
  | "OUTLINE"
  | "OBJECTIVES"
  | "VOICE_OVER"
  | "QUIZ"
  | "METADATA"
  | "SUMMARISE"

interface Props {
  capability: AiCapabilityClient
  academyId: string
  /** Title shown in the dialog — usually something like "Draft course description". */
  label: string
  /** Short explainer shown under the title. */
  description?: string
  /** Placeholder for the user-prompt textarea. */
  placeholder?: string
  /** Extra audit context (e.g. { courseId }) stored on the AiInteraction row. */
  context?: Record<string, unknown>
  /**
   * Called when the author clicks "Use this draft". Receives the raw model
   * text AND the parsed JSON (if parseable). The caller decides how to
   * insert the draft into its own state.
   */
  onAccept: (draft: { rawText: string; parsed: unknown | null; interactionId: string }) => void
  /** Optional: pre-fill the user-prompt textarea (e.g. with the current draft). */
  initialPrompt?: string
  /** Variant of the trigger button — default matches inline CTAs. */
  buttonVariant?: "default" | "outline" | "ghost" | "secondary"
  buttonSize?: "default" | "sm" | "lg" | "icon"
  buttonClassName?: string
  /** Custom trigger label — default is "AI Assist". */
  buttonLabel?: string
}

type GenerateResponse = {
  interactionId: string
  rawText: string
  parsed: unknown | null
  usage: {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    model: string
  }
}

/**
 * Reusable Gen-AI Assist CTA (spec §8.1). Wraps the /api/ai/assist +
 * /api/ai/approve endpoints. Every draft lands in an approval state —
 * the caller's onAccept handler runs only when the author explicitly
 * clicks "Use this draft".
 */
export function AiAssistButton({
  capability,
  academyId,
  label,
  description,
  placeholder,
  context,
  onAccept,
  initialPrompt = "",
  buttonVariant = "outline",
  buttonSize = "sm",
  buttonClassName,
  buttonLabel = "AI Assist",
}: Props) {
  const [open, setOpen] = useState(false)
  const [userPrompt, setUserPrompt] = useState(initialPrompt)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)

  async function handleGenerate() {
    if (!userPrompt.trim()) {
      toast.error("Tell the AI what to draft.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability,
          academyId,
          userPrompt: userPrompt.trim(),
          context,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Generate failed")
      setResult(data as GenerateResponse)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generate failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleAccept() {
    if (!result) return
    try {
      // Fire-and-forget approval — draft is still usable even if approval
      // fails; the audit row just stays unapproved.
      void fetch("/api/ai/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId: result.interactionId }),
      })
    } catch {
      // swallow
    }
    onAccept({
      rawText: result.rawText,
      parsed: result.parsed,
      interactionId: result.interactionId,
    })
    toast.success("Draft inserted")
    setOpen(false)
    setResult(null)
    setUserPrompt("")
  }

  function handleDiscard() {
    setResult(null)
  }

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.rawText)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Copy failed")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setResult(null)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          className={cn(buttonClassName)}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {label}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">What do you want the AI to draft?</Label>
            <Textarea
              rows={4}
              placeholder={placeholder}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              disabled={loading || !!result}
            />
          </div>

          {!result ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                AI output is a draft — review and edit before saving.
              </p>
              <Button onClick={handleGenerate} disabled={loading || !userPrompt.trim()}>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Generate
              </Button>
            </div>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">Draft</Badge>
                  <div className="text-xs text-muted-foreground font-mono">
                    {result.usage.model} · in {result.usage.inputTokens} ·
                    out {result.usage.outputTokens}
                    {result.usage.cachedTokens > 0 && (
                      <> · cached {result.usage.cachedTokens}</>
                    )}
                  </div>
                </div>
                <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-[40vh] overflow-y-auto">
                  {result.rawText}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          {result ? (
            <>
              <Button variant="ghost" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </Button>
              <Button variant="outline" onClick={handleDiscard}>
                <X className="h-3.5 w-3.5 mr-1" /> Try again
              </Button>
              <Button onClick={handleAccept}>
                <Check className="h-3.5 w-3.5 mr-1" /> Use this draft
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
