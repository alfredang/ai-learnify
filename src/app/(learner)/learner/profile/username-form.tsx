"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface Props {
  initial: string | null
}

export function UsernameForm({ initial }: Props) {
  const router = useRouter()
  const [username, setUsername] = useState(initial ?? "")
  const [saving, setSaving] = useState(false)

  const dirty = username !== (initial ?? "")

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.issues?.[0]?.message ?? data.error ?? "Save failed"
        throw new Error(msg)
      }
      toast.success("Username updated")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Username</Label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your-handle"
        />
        <p className="text-xs text-muted-foreground">
          3–32 chars, lowercase letters, digits, dashes, underscores. Used as an
          alternative login to your email.
        </p>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Save username
        </Button>
      </div>
    </div>
  )
}
