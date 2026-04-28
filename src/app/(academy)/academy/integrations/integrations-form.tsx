"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Loader2, Mail, Server, Send } from "lucide-react"

export type IntegrationsValues = {
  gmail: {
    enabled: boolean
    clientId: string
    clientSecret: string
    refreshToken: string
    fromEmail: string
  }
  smtp: {
    enabled: boolean
    host: string
    port: number
    username: string
    password: string
    fromEmail: string
    secure: boolean
  }
  activeProvider: "gmail" | "smtp" | null
}

interface Props {
  initial: IntegrationsValues
}

export function IntegrationsForm({ initial }: Props) {
  const router = useRouter()
  const [gmail, setGmail] = useState(initial.gmail)
  const [smtp, setSmtp] = useState(initial.smtp)
  const [activeProvider, setActiveProvider] = useState<"gmail" | "smtp" | null>(
    initial.activeProvider
  )
  const [saving, setSaving] = useState(false)
  const [testTo, setTestTo] = useState("")
  const [testing, setTesting] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/academy/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gmail,
          smtp: { ...smtp, port: Number(smtp.port) || 587 },
          activeProvider,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Save failed")
      }
      toast.success("Integrations saved")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!testTo.trim()) {
      toast.error("Enter a recipient address")
      return
    }
    setTesting(true)
    try {
      const res = await fetch("/api/academy/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        provider?: string
        skipped?: boolean
        reason?: string | null
      }
      if (!res.ok || !data.ok) {
        toast.error(
          `Test failed (${data.provider ?? "none"})${
            data.reason ? `: ${data.reason}` : ""
          }${
            data.skipped
              ? " — provider skipped, save settings + pick an active provider first"
              : ""
          }`
        )
        return
      }
      toast.success(`Test email sent via ${data.provider ?? "unknown"}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed")
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <h2 className="font-semibold text-sm">Gmail (OAuth2)</h2>
              <p className="text-xs text-muted-foreground">
                Send via a Gmail account using OAuth2 credentials from Google
                Cloud Console. Use a refresh token issued for the
                <code className="mx-1 px-1 rounded bg-muted">https://www.googleapis.com/auth/gmail.send</code>
                scope.
              </p>
            </div>
            <Switch
              checked={gmail.enabled}
              onCheckedChange={(v) => setGmail({ ...gmail, enabled: v })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">OAuth Client ID</Label>
              <Input
                value={gmail.clientId}
                onChange={(e) => setGmail({ ...gmail, clientId: e.target.value })}
                placeholder="123456-abcdef.apps.googleusercontent.com"
                disabled={!gmail.enabled}
              />
            </div>
            <div>
              <Label className="text-xs">OAuth Client Secret</Label>
              <Input
                type="password"
                value={gmail.clientSecret}
                onChange={(e) =>
                  setGmail({ ...gmail, clientSecret: e.target.value })
                }
                placeholder="GOCSPX-..."
                disabled={!gmail.enabled}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Refresh Token</Label>
              <Input
                type="password"
                value={gmail.refreshToken}
                onChange={(e) =>
                  setGmail({ ...gmail, refreshToken: e.target.value })
                }
                placeholder="1//0g-... (long string)"
                disabled={!gmail.enabled}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Generate using the OAuth Playground or your own consent flow.
                Stored encrypted at rest by Postgres.
              </p>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Sender address</Label>
              <Input
                type="email"
                value={gmail.fromEmail}
                onChange={(e) =>
                  setGmail({ ...gmail, fromEmail: e.target.value })
                }
                placeholder="no-reply@your-academy.com"
                disabled={!gmail.enabled}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Must match (or be an authorised alias of) the Gmail account
                that owns the refresh token.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <h2 className="font-semibold text-sm">SMTP</h2>
              <p className="text-xs text-muted-foreground">
                Send via any SMTP relay (Mailgun, SendGrid, your own MTA, etc.).
              </p>
            </div>
            <Switch
              checked={smtp.enabled}
              onCheckedChange={(v) => setSmtp({ ...smtp, enabled: v })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-xs">Host</Label>
              <Input
                value={smtp.host}
                onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                placeholder="smtp.example.com"
                disabled={!smtp.enabled}
              />
            </div>
            <div>
              <Label className="text-xs">Port</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={smtp.port}
                onChange={(e) =>
                  setSmtp({ ...smtp, port: Number(e.target.value) || 587 })
                }
                disabled={!smtp.enabled}
              />
            </div>
            <div>
              <Label className="text-xs">Username</Label>
              <Input
                value={smtp.username}
                onChange={(e) => setSmtp({ ...smtp, username: e.target.value })}
                placeholder="apikey / postmaster@..."
                disabled={!smtp.enabled}
              />
            </div>
            <div>
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                value={smtp.password}
                onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                placeholder="••••••••"
                disabled={!smtp.enabled}
              />
            </div>
            <div>
              <Label className="text-xs">Sender address</Label>
              <Input
                type="email"
                value={smtp.fromEmail}
                onChange={(e) =>
                  setSmtp({ ...smtp, fromEmail: e.target.value })
                }
                placeholder="no-reply@your-academy.com"
                disabled={!smtp.enabled}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Switch
              checked={smtp.secure}
              onCheckedChange={(v) => setSmtp({ ...smtp, secure: v })}
              disabled={!smtp.enabled}
            />
            <span className="text-sm">
              Use TLS on connect (port 465). Leave off for STARTTLS on 587.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold text-sm">Active sender</h2>
          <p className="text-xs text-muted-foreground">
            Pick which configured provider should actually send mail. Saving
            with no provider falls back to the platform default (Resend) if
            available.
          </p>
          <div className="flex flex-wrap gap-2">
            <ProviderPill
              label="None (use platform default)"
              active={activeProvider === null}
              onClick={() => setActiveProvider(null)}
            />
            <ProviderPill
              label="Gmail"
              active={activeProvider === "gmail"}
              onClick={() => setActiveProvider("gmail")}
              disabled={!gmail.enabled}
            />
            <ProviderPill
              label="SMTP"
              active={activeProvider === "smtp"}
              onClick={() => setActiveProvider("smtp")}
              disabled={!smtp.enabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Send a test email</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Sends a probe message through the active provider so you can
            confirm credentials before relying on it for invoices and
            reminders. Save your changes first — the test reads what is
            stored, not the form.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send test
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save integrations
        </Button>
      </div>
    </div>
  )
}

function ProviderPill({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "px-3 py-1.5 rounded-full border text-xs font-medium transition-colors " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-accent border-border " +
            (disabled ? "opacity-50 cursor-not-allowed" : ""))
      }
    >
      {label}
    </button>
  )
}
