"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Loader2,
  Sparkles,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
} from "lucide-react"

const REVEAL_TTL_MS = 10_000

type StatusResponse = {
  academyId: string
  configured: boolean
  last4: string | null
  setAt: string | null
  setBy: string | null
  aiEnabled: boolean
}

/**
 * Phase 7 — Academy Admin Claude Credential form.
 *
 * Pasted token never round-trips back from the server. After save the
 * UI shows a masked indicator (sk-ant-oat••••XXXX) plus when/who set it.
 * Replace = paste a new token (overwrites cipher columns). Clear =
 * DELETE on the credentials route.
 */
export function AiCredentialsForm() {
  const router = useRouter()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [token, setToken] = useState("")
  const [saving, setSaving] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [revealConfirmOpen, setRevealConfirmOpen] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [revealCountdown, setRevealCountdown] = useState(0)
  const revealTimers = useRef<{
    hide?: ReturnType<typeof setTimeout>
    tick?: ReturnType<typeof setInterval>
  }>({})

  function clearReveal(reason?: "expired" | "manual") {
    if (revealTimers.current.hide) clearTimeout(revealTimers.current.hide)
    if (revealTimers.current.tick) clearInterval(revealTimers.current.tick)
    revealTimers.current = {}
    setRevealedToken(null)
    setRevealCountdown(0)
    if (reason === "expired") {
      toast.message("Credential hidden", {
        description: "Auto-masked for security. Click the eye again to reveal.",
      })
    }
  }

  useEffect(() => {
    return () => {
      if (revealTimers.current.hide) clearTimeout(revealTimers.current.hide)
      if (revealTimers.current.tick) clearInterval(revealTimers.current.tick)
    }
  }, [])

  useEffect(() => {
    fetch("/api/academy/credentials/claude")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Status ${r.status}`)
        return (await r.json()) as StatusResponse
      })
      .then((s) => {
        setStatus(s)
        // If unset, show the input straight away — saves a click.
        if (!s.configured) setShowInput(true)
      })
      .catch(() => {
        // 403 (not an admin) or 500 — leave status null, the panel
        // renders a generic "couldn't load" state below.
      })
  }, [])

  async function handleSave() {
    const trimmed = token.trim()
    if (!trimmed) {
      toast.error("Paste a Claude token first.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/academy/credentials/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Save failed")
      toast.success("Claude credential saved")
      setToken("")
      setShowInput(false)
      // Refresh status from the server — also picks up the masked last4.
      const s = await fetch("/api/academy/credentials/claude").then((r) =>
        r.ok ? r.json() : null
      )
      if (s) setStatus(s as StatusResponse)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleReveal() {
    setRevealing(true)
    try {
      const res = await fetch("/api/academy/credentials/claude/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Reveal failed")
      const tk = typeof body.token === "string" ? body.token : null
      if (!tk) throw new Error("Reveal returned no token")

      setRevealedToken(tk)
      const ttl = typeof body.expiresInMs === "number" ? body.expiresInMs : REVEAL_TTL_MS
      const startedAt = Date.now()
      setRevealCountdown(Math.ceil(ttl / 1000))
      revealTimers.current.tick = setInterval(() => {
        const remaining = Math.max(0, ttl - (Date.now() - startedAt))
        setRevealCountdown(Math.ceil(remaining / 1000))
      }, 250)
      revealTimers.current.hide = setTimeout(() => clearReveal("expired"), ttl)
      setRevealConfirmOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reveal failed")
    } finally {
      setRevealing(false)
    }
  }

  async function handleCopyRevealed() {
    if (!revealedToken) return
    try {
      await navigator.clipboard.writeText(revealedToken)
      toast.success("Copied — clipboard will be cleared in 30 seconds")
      window.setTimeout(() => {
        navigator.clipboard.writeText("").catch(() => {})
      }, 30_000)
    } catch {
      toast.error("Copy failed")
    }
  }

  async function handleClear() {
    if (
      !window.confirm(
        "Remove the saved Claude credential? AI features will fall back to the platform-wide ANTHROPIC_API_KEY (if one is configured)."
      )
    )
      return
    setSaving(true)
    try {
      const res = await fetch("/api/academy/credentials/claude", {
        method: "DELETE",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Clear failed")
      toast.success("Credential cleared")
      const s = await fetch("/api/academy/credentials/claude").then((r) =>
        r.ok ? r.json() : null
      )
      if (s) setStatus(s as StatusResponse)
      setShowInput(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clear failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="py-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <h2 className="text-base font-bold">Claude credential</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Powers AI authoring (drafts, course scoping, media curation)
              for this academy via the Claude Agent SDK. Accepts a Console
              API key (<code className="text-[11px]">sk-ant-…</code>) or a
              Claude.ai subscription OAuth token (
              <code className="text-[11px]">sk-ant-oat…</code>). Stored
              encrypted at rest. Drafts are never used to train external
              models — see Anthropic&rsquo;s commercial terms.
            </p>
          </div>
        </div>

        {status?.configured && !showInput ? (
          <div className="rounded-md border bg-muted/40 px-3 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-mono truncate">
                  {revealedToken
                    ? revealedToken
                    : `sk-ant-${status.last4 ? "••••" + status.last4 : "••••"}`}
                </p>
                {revealedToken ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Revealed — auto-masking in {revealCountdown}s
                  </p>
                ) : (
                  status.setAt && (
                    <p className="text-xs text-muted-foreground">
                      Set {new Date(status.setAt).toLocaleString()}
                    </p>
                  )
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {revealedToken ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyRevealed}
                    title="Copy plaintext (clipboard auto-cleared in 30s)"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearReveal("manual")}
                    title="Hide credential"
                  >
                    <EyeOff className="h-3.5 w-3.5 mr-1" /> Hide
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevealConfirmOpen(true)}
                  disabled={saving || revealing}
                  title="Show full credential (audit-logged)"
                >
                  {revealing ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 mr-1" />
                  )}
                  Show
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInput(true)}
                disabled={saving}
              >
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={saving}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="claude-token" className="text-xs">
                Paste Claude token
              </Label>
              <Input
                id="claude-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-… or sk-ant-oat-…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={saving}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Generate a Console key at{" "}
                <a
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                  href="https://console.anthropic.com/settings/keys"
                >
                  console.anthropic.com
                </a>
                , or run{" "}
                <code className="text-[11px]">claude setup-token</code> in
                your terminal to mint a Claude.ai subscription OAuth token.
              </p>
            </div>
            <div className="flex items-center gap-2 justify-end">
              {status?.configured && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowInput(false)
                    setToken("")
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={saving || !token.trim()}
                size="sm"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Save credential
              </Button>
            </div>
          </div>
        )}

        {!status?.aiEnabled && status?.configured && (
          <div className="text-xs rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 px-3 py-2 text-amber-800 dark:text-amber-200">
            AI Authoring is currently disabled for this academy. Toggle
            &ldquo;AI assist&rdquo; on in the Academy tab to use this
            credential.
          </div>
        )}
      </CardContent>

      <Dialog
        open={revealConfirmOpen}
        onOpenChange={(next) => {
          if (!revealing) setRevealConfirmOpen(next)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Reveal Claude credential
            </DialogTitle>
            <DialogDescription>
              The full token will be visible in this browser for 10 seconds.
              This action is audit-logged with your user ID, IP address and
              browser. Make sure no one else can see your screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRevealConfirmOpen(false)}
              disabled={revealing}
            >
              Cancel
            </Button>
            <Button onClick={handleReveal} disabled={revealing}>
              {revealing && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Reveal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
