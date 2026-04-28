"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { toast } from "sonner"
import { Loader2, Save, ExternalLink, FileText, ShieldCheck, Mail } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

type TemplateKey =
  | "refundPolicyHtml"
  | "privacyPolicyHtml"
  | "termsHtml"
  | "emailWelcomeHtml"
  | "emailInvoiceHtml"
  | "emailCertificateHtml"
  | "emailExpiryReminderHtml"

interface Tab {
  key: TemplateKey
  label: string
  description: string
  placeholder: string
  previewHref?: string
  variables?: string
}

const PAGE_TABS: Tab[] = [
  {
    key: "privacyPolicyHtml",
    label: "Privacy Policy",
    description: "Public page at /privacy",
    placeholder: "Write your privacy policy... Leave empty for the default template.",
    previewHref: "/privacy",
  },
  {
    key: "termsHtml",
    label: "Terms of Service",
    description: "Public page at /terms",
    placeholder: "Write your terms of service... Leave empty for the default template.",
    previewHref: "/terms",
  },
  {
    key: "refundPolicyHtml",
    label: "Refund Policy",
    description: "Public page at /refund-policy",
    placeholder: "Write your refund policy... Leave empty for the default template.",
    previewHref: "/refund-policy",
  },
]

const EMAIL_TABS: Tab[] = [
  {
    key: "emailWelcomeHtml",
    label: "Welcome Email",
    description: "Sent after learner registers",
    placeholder: "Welcome to {academyName}! Hi {name}, your account is ready...",
    variables: "{name}, {email}, {academyName}",
  },
  {
    key: "emailInvoiceHtml",
    label: "Invoice Email",
    description: "Sent after successful payment",
    placeholder: "Your invoice {invoiceNumber} for {courseName} is attached...",
    variables: "{name}, {invoiceNumber}, {courseName}, {amount}",
  },
  {
    key: "emailCertificateHtml",
    label: "Certificate Email",
    description: "Sent when certificate is issued",
    placeholder: "Congratulations {name}! You have earned your certificate for {courseName}...",
    variables: "{name}, {courseName}, {certificateUrl}",
  },
  {
    key: "emailExpiryReminderHtml",
    label: "Expiry Reminder",
    description: "Sent before access expires",
    placeholder: "Hi {name}, your access to {courseName} expires in {days} days...",
    variables: "{name}, {courseName}, {days}",
  },
]

interface TemplatesEditorProps {
  initial: Record<TemplateKey, string>
}

export function TemplatesEditor({ initial }: TemplatesEditorProps) {
  const [values, setValues] = useState(initial)
  const [activeTab, setActiveTab] = useState<TemplateKey>("privacyPolicyHtml")
  const [isSaving, setIsSaving] = useState(false)

  const allTabs = [...PAGE_TABS, ...EMAIL_TABS]
  const currentTab = allTabs.find((t) => t.key === activeTab)!

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch("/api/academy/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [activeTab]: values[activeTab] }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || "Failed to save")
      }
      toast.success(`${currentTab.label} saved`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      {/* Tab sidebar */}
      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Pages
          </h3>
          <div className="space-y-1">
            {PAGE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                  activeTab === tab.key
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Emails
          </h3>
          <div className="space-y-1">
            {EMAIL_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                  activeTab === tab.key
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{currentTab.label}</CardTitle>
            <CardDescription>{currentTab.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentTab.variables && (
              <p className="text-xs text-muted-foreground mb-3 p-2 bg-muted rounded">
                Available variables: <code className="text-xs">{currentTab.variables}</code>
              </p>
            )}
            <RichTextEditor
              content={values[activeTab]}
              onChange={(html) => setValues((prev) => ({ ...prev, [activeTab]: html }))}
              placeholder={currentTab.placeholder}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          {currentTab.previewHref ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={currentTab.previewHref} target="_blank">
                <ExternalLink className="h-4 w-4 mr-2" />
                Preview
              </Link>
            </Button>
          ) : (
            <div />
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Leave empty to use the default template. Changes publish immediately.
        </p>
      </div>
    </div>
  )
}
