"use client"

import { useState, type KeyboardEvent } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, Plus } from "lucide-react"

interface Props {
  initial: string[]
}

export function LanguagesManager({ initial }: Props) {
  const router = useRouter()
  const [languages, setLanguages] = useState<string[]>(initial)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  function add() {
    const v = draft.trim()
    if (!v) return
    if (languages.some((l) => l.toLowerCase() === v.toLowerCase())) {
      toast.error("Already added")
      return
    }
    setLanguages((p) => [...p, v])
    setDraft("")
    setDirty(true)
  }

  function remove(lang: string) {
    if (languages.length <= 1) {
      toast.error("Keep at least one language")
      return
    }
    setLanguages((p) => p.filter((l) => l !== lang))
    setDirty(true)
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      add()
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/academy/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supportedLanguages: languages }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Save failed")
      }
      toast.success("Languages saved")
      setDirty(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm">Catalogue languages</h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            Powers the language filter on the public catalogue and the
            language picker in the course editor.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {languages.map((l) => (
            <Badge
              key={l}
              variant="secondary"
              className="px-2 py-1 gap-1 text-sm"
            >
              {l}
              <button
                type="button"
                onClick={() => remove(l)}
                className="hover:text-destructive"
                aria-label={`Remove ${l}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Add a language (e.g. Bahasa Malaysia)"
            maxLength={40}
          />
          <Button type="button" variant="outline" onClick={add}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save languages
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
