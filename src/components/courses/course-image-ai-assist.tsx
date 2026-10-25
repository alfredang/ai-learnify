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
import { Label } from "@/components/ui/label"
import { Loader2, Sparkles, ExternalLink, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type CurationResult = {
  providerId: string
  title: string
  url: string
  thumbnailUrl: string | null
  license: string
  licenseVersion?: string | null
  licenseUrl: string | null
  sourceUrl: string | null
  sourceProvider: "openverse" | "wikimedia"
  attribution: string | null
  creator: string | null
  creatorUrl: string | null
  rationale: string
}

interface Props {
  academyId: string
  initialQuery?: string
  /** Called once the author picks an image. Receives the chosen URL. */
  onSelect: (chosen: { url: string; attribution: string | null; license: string }) => void
  disabled?: boolean
}

export function CourseImageAiAssist({
  academyId,
  initialQuery = "",
  onSelect,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CurationResult[]>([])
  const [pickedId, setPickedId] = useState<string | null>(null)

  async function handleSearch() {
    const q = query.trim()
    if (q.length < 2) {
      toast.error("Type a short topic to search")
      return
    }
    setLoading(true)
    setResults([])
    setPickedId(null)
    try {
      const res = await fetch("/api/ai/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          query: q,
          kind: "image",
          license: "commercial",
          pageSize: 12,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Search failed")
      const list = Array.isArray(body.results) ? (body.results as CurationResult[]) : []
      setResults(list)
      if (list.length === 0) {
        toast.message("No matches", {
          description:
            body.message ?? "Try a broader query or different keywords.",
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }

  function handleConfirm() {
    const picked = results.find((r) => r.providerId === pickedId)
    if (!picked) return
    onSelect({
      url: picked.url,
      attribution: picked.attribution,
      license: picked.license,
    })
    toast.success("Course image set", {
      description: picked.attribution
        ? `${picked.license} — ${picked.attribution}`
        : picked.license,
    })
    setOpen(false)
    setResults([])
    setPickedId(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setResults([])
          setPickedId(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            if (!query && initialQuery) setQuery(initialQuery)
          }}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          AI Assist
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Assist — course image
          </DialogTitle>
          <DialogDescription>
            Search licence-free imagery from Openverse and Wikimedia Commons,
            ranked for relevance by the AI model. Every result lists its licence
            and creator so you can attribute it correctly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ai-image-query" className="text-xs">
              Search query
            </Label>
            <div className="flex gap-2">
              <Input
                id="ai-image-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. productivity, focus desk, react code editor"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch()
                }}
              />
              <Button
                type="button"
                onClick={handleSearch}
                disabled={loading || query.trim().length < 2}
              >
                {loading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Search
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Filter: commercial-use friendly licences only.
            </p>
          </div>

          {results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
              {results.map((r) => {
                const picked = pickedId === r.providerId
                const thumb = r.thumbnailUrl ?? r.url
                return (
                  <button
                    key={r.providerId}
                    type="button"
                    onClick={() => setPickedId(r.providerId)}
                    className={cn(
                      "relative text-left rounded-md border overflow-hidden focus:outline-none transition",
                      picked
                        ? "border-primary ring-2 ring-primary/30"
                        : "hover:border-primary/60"
                    )}
                  >
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt={r.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {picked && (
                      <span className="absolute top-2 right-2 inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div className="p-2 space-y-1">
                      <p className="text-xs font-medium truncate" title={r.title}>
                        {r.title || "Untitled"}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate">{r.license}</span>
                        {r.sourceUrl && (
                          <a
                            href={r.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 hover:underline shrink-0"
                            title="View source"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {r.sourceProvider}
                          </a>
                        )}
                      </div>
                      {r.creator && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          By {r.creator}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!pickedId || loading}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Use this image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
