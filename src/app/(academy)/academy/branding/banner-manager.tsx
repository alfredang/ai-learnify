"use client"

import { useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Trash2, Plus, Loader2 } from "lucide-react"

type Banner = {
  id: string
  imageUrl: string
  title: string | null
  targetUrl: string | null
  position: number
  isActive: boolean
}

interface BannerManagerProps {
  initialBanners: Banner[]
}

export function BannerManager({ initialBanners }: BannerManagerProps) {
  const [banners, setBanners] = useState<Banner[]>(initialBanners)
  const [newImageUrl, setNewImageUrl] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [newTargetUrl, setNewTargetUrl] = useState("")
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!newImageUrl) {
      toast.error("Image URL is required")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/academy/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: newImageUrl,
          title: newTitle || null,
          targetUrl: newTargetUrl || null,
          position: banners.length,
          isActive: true,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Create failed")
      }
      const data = (await res.json()) as { banner: Banner }
      setBanners((b) => [...b, data.banner])
      setNewImageUrl("")
      setNewTitle("")
      setNewTargetUrl("")
      toast.success("Banner added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this banner?")) return
    try {
      const res = await fetch(`/api/academy/banners/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      setBanners((b) => b.filter((x) => x.id !== id))
      toast.success("Deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    setBanners((b) => b.map((x) => (x.id === id ? { ...x, isActive } : x)))
    try {
      const res = await fetch(`/api/academy/banners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error("Could not save")
      setBanners((b) => b.map((x) => (x.id === id ? { ...x, isActive: !isActive } : x)))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold text-sm">Add a banner</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="imageUrl" className="text-xs">Image URL</Label>
              <Input
                id="imageUrl"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                disabled={creating}
              />
            </div>
            <div>
              <Label htmlFor="targetUrl" className="text-xs">Link URL (optional)</Label>
              <Input
                id="targetUrl"
                value={newTargetUrl}
                onChange={(e) => setNewTargetUrl(e.target.value)}
                placeholder="/courses"
                disabled={creating}
              />
            </div>
            <div className="md:col-span-3">
              <Label htmlFor="title" className="text-xs">Title overlay (optional)</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Summer promo"
                disabled={creating}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={creating || banners.length >= 10}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add banner
            </Button>
          </div>
          {banners.length >= 10 && (
            <p className="text-xs text-destructive">
              Banner limit reached (10). Delete one to add another.
            </p>
          )}
        </CardContent>
      </Card>

      {banners.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No banners yet. Add one above — it'll show on the public homepage and catalogue.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {banners.map((b) => (
            <Card key={b.id}>
              <div className="relative aspect-[16/6] bg-muted rounded-t-md overflow-hidden">
                {/* Using native <img> to avoid next/image domain whitelist surprises. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.imageUrl} alt={b.title ?? ""} className="object-cover w-full h-full" />
              </div>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {b.title ?? <span className="text-muted-foreground italic">(no title)</span>}
                    </div>
                    {b.targetUrl && (
                      <div className="text-xs text-muted-foreground truncate">→ {b.targetUrl}</div>
                    )}
                  </div>
                  <Badge variant={b.isActive ? "default" : "outline"}>
                    {b.isActive ? "Active" : "Hidden"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={b.isActive}
                      onCheckedChange={(v) => handleToggle(b.id, v)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {b.isActive ? "Shown to visitors" : "Hidden"}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDelete(b.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
