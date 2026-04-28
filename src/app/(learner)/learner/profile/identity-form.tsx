"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface Props {
  initial: {
    name: string | null
    nameToBeCalled: string | null
    certificateName: string | null
    certificateIdNumber: string | null
  }
}

/**
 * Spec §3.1 identity editor. The PUT endpoint at /api/profile is shared
 * with the instructor profile form, so we send every field it expects
 * (including `name`) to avoid nulling out non-identity fields on save.
 */
export function IdentityForm({ initial }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initial.name ?? "")
  const [nameToBeCalled, setNameToBeCalled] = useState(initial.nameToBeCalled ?? "")
  const [certificateName, setCertificateName] = useState(initial.certificateName ?? "")
  const [certificateIdNumber, setCertificateIdNumber] = useState(
    initial.certificateIdNumber ?? ""
  )
  const [saving, setSaving] = useState(false)

  const dirty =
    name !== (initial.name ?? "") ||
    nameToBeCalled !== (initial.nameToBeCalled ?? "") ||
    certificateName !== (initial.certificateName ?? "") ||
    certificateIdNumber !== (initial.certificateIdNumber ?? "")

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          nameToBeCalled: nameToBeCalled.trim(),
          certificateName: certificateName.trim(),
          certificateIdNumber: certificateIdNumber.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.issues?.[0]?.message ?? data.error ?? "Save failed"
        throw new Error(msg)
      }
      toast.success("Identity updated")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Your account name. Used in the header and instructor views.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Name to Be Called</Label>
        <Input
          value={nameToBeCalled}
          onChange={(e) => setNameToBeCalled(e.target.value)}
          placeholder="e.g. Alex"
        />
        <p className="text-xs text-muted-foreground">
          How the LMS addresses you ({'"'}Welcome back, …{'"'}).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Name to Be Written into Certificate</Label>
        <Input
          value={certificateName}
          onChange={(e) => setCertificateName(e.target.value)}
          placeholder="Exactly as it should appear on your certificate"
        />
        <p className="text-xs text-muted-foreground">
          Spec §3.1 — this appears verbatim on every certificate you earn.
          UTF-8 names fully supported. Double-check spelling and capitalisation.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">ID number (optional)</Label>
        <Input
          value={certificateIdNumber}
          onChange={(e) => setCertificateIdNumber(e.target.value)}
          placeholder="Passport / NRIC / student ID"
        />
        <p className="text-xs text-muted-foreground">
          Shown on certificates when present — useful for CPD records and
          employer verification.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Save changes
        </Button>
      </div>
    </div>
  )
}
