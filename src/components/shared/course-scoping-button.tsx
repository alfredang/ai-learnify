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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Compass, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

type ScopeBrief = {
  title?: string
  audience?: string
  level?: string
  targetHours?: number
  moduleCount?: number
  modules?: Array<{
    name: string
    summary: string
    estimatedHours: number
    outcomes: string[]
  }>
  prerequisites?: string[]
  recommendedPath?: string
  successCriteria?: string[]
}

type ScopeResponse = {
  interactionId: string
  rawText: string
  parsed: ScopeBrief | null
  usage: {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    model: string
  }
}

interface Props {
  academyId: string
  initialTitle?: string
  context?: Record<string, unknown>
  onAccept: (brief: ScopeBrief, raw: ScopeResponse) => void
  buttonClassName?: string
}

/**
 * Phase 7 — Course Scoping CTA. Wraps the new COURSE_SCOPING capability
 * via /api/ai/scope. Author fills title + audience + optional
 * constraints; the agent returns a structured scope brief which the
 * caller decides how to merge into form state. Drafts never auto-apply.
 */
export function CourseScopingButton({
  academyId,
  initialTitle = "",
  context,
  onAccept,
  buttonClassName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(initialTitle)
  const [audience, setAudience] = useState("")
  const [constraints, setConstraints] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScopeResponse | null>(null)

  async function handleGenerate() {
    if (!title.trim() || !audience.trim()) {
      toast.error("Course title and audience are required.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/ai/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          title: title.trim(),
          audience: audience.trim(),
          constraints: constraints.trim() || undefined,
          context,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Course scoping failed")
      setResult(data as ScopeResponse)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generate failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleAccept() {
    if (!result?.parsed) return
    void fetch("/api/ai/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interactionId: result.interactionId }),
    })
    onAccept(result.parsed, result)
    toast.success("Scope brief applied")
    setOpen(false)
    setResult(null)
  }

  const brief = result?.parsed

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
          variant="outline"
          size="sm"
          className={cn(buttonClassName)}
        >
          <Compass className="h-3.5 w-3.5 mr-1" />
          Generate course scope
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            Course scoping
          </DialogTitle>
          <DialogDescription>
            Drafts a structured scope brief — target hours, modules,
            prerequisites and a learning path. Always editable; never
            auto-saved.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Course title</Label>
              <Input
                placeholder="e.g. Practical Cybersecurity for SMB Owners"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target audience</Label>
              <Input
                placeholder="Who is this for? Background, role, prior knowledge..."
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Constraints (optional)
              </Label>
              <Textarea
                rows={3}
                placeholder="Time-budget, regulatory framework, certifications, depth (intro / deep dive)..."
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">Draft</Badge>
                <div className="text-xs text-muted-foreground font-mono">
                  {result.usage.model} · in {result.usage.inputTokens} ·
                  out {result.usage.outputTokens}
                </div>
              </div>

              {brief ? (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="rounded border p-2">
                      <div className="text-muted-foreground">Level</div>
                      <div className="font-medium">{brief.level ?? "—"}</div>
                    </div>
                    <div className="rounded border p-2">
                      <div className="text-muted-foreground">Target hours</div>
                      <div className="font-medium">
                        {brief.targetHours ?? "—"}
                      </div>
                    </div>
                    <div className="rounded border p-2">
                      <div className="text-muted-foreground">Modules</div>
                      <div className="font-medium">
                        {brief.moduleCount ?? brief.modules?.length ?? "—"}
                      </div>
                    </div>
                  </div>

                  {brief.prerequisites && brief.prerequisites.length > 0 && (
                    <div className="text-xs">
                      <div className="font-medium mb-1">Prerequisites</div>
                      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                        {brief.prerequisites.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {brief.modules && brief.modules.length > 0 && (
                    <div className="text-xs space-y-2">
                      <div className="font-medium">Modules</div>
                      {brief.modules.map((m, i) => (
                        <div
                          key={i}
                          className="rounded border p-2 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {i + 1}. {m.name}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              ~{m.estimatedHours}h
                            </span>
                          </div>
                          <p className="text-muted-foreground">{m.summary}</p>
                          {m.outcomes && m.outcomes.length > 0 && (
                            <ul className="list-disc list-inside text-muted-foreground text-[11px] pl-2 space-y-0.5">
                              {m.outcomes.map((o, j) => (
                                <li key={j}>{o}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {brief.recommendedPath && (
                    <div className="text-xs">
                      <div className="font-medium mb-1">Recommended path</div>
                      <p className="text-muted-foreground">
                        {brief.recommendedPath}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-[40vh] overflow-y-auto">
                  {result.rawText}
                </pre>
              )}
            </CardContent>
          </Card>
        )}

        <DialogFooter className="gap-2">
          {!result ? (
            <>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || !title.trim() || !audience.trim()}
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Generate scope
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setResult(null)}>
                <X className="h-3.5 w-3.5 mr-1" /> Try again
              </Button>
              <Button onClick={handleAccept} disabled={!brief}>
                <Check className="h-3.5 w-3.5 mr-1" /> Use this scope
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
