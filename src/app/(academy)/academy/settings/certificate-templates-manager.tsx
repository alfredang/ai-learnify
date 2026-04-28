"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2, Pencil, Star, Eye, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type LayoutJson = {
  accentColor?: string
  fontFamily?: "serif" | "sans"
  signatureImageUrl?: string | null
  watermarkText?: string | null
  watermarkOpacity?: number
  borderStyle?: "solid" | "double" | "none"
}

type Template = {
  id: string
  name: string
  primaryLogoUrl: string | null
  secondaryLogoUrl: string | null
  signatoryName: string | null
  signatoryTitle: string | null
  layoutJson: LayoutJson | null
  isDefault: boolean
}

const EMPTY_LAYOUT: LayoutJson = {
  accentColor: "#1a365d",
  fontFamily: "serif",
  signatureImageUrl: null,
  watermarkText: null,
  watermarkOpacity: 0.08,
  borderStyle: "solid",
}

const EMPTY: Template = {
  id: "",
  name: "",
  primaryLogoUrl: null,
  secondaryLogoUrl: null,
  signatoryName: null,
  signatoryTitle: null,
  layoutJson: EMPTY_LAYOUT,
  isDefault: false,
}

interface Props {
  initialTemplates: Template[]
}

export function CertificateTemplatesManager({ initialTemplates }: Props) {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const [editing, setEditing] = useState<Template | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function openNew() {
    setEditing({ ...EMPTY, layoutJson: { ...EMPTY_LAYOUT } })
  }

  function openEdit(t: Template) {
    setEditing({
      ...t,
      layoutJson: { ...EMPTY_LAYOUT, ...(t.layoutJson ?? {}) },
    })
  }

  async function handleSave() {
    if (!editing) return
    if (!editing.name.trim()) {
      toast.error("Name is required")
      return
    }
    setSaving(true)
    try {
      const body = {
        name: editing.name.trim(),
        primaryLogoUrl: editing.primaryLogoUrl,
        secondaryLogoUrl: editing.secondaryLogoUrl,
        signatoryName: editing.signatoryName,
        signatoryTitle: editing.signatoryTitle,
        layoutJson: editing.layoutJson,
        isDefault: editing.isDefault,
      }
      const res = editing.id
        ? await fetch(`/api/academy/certificate-templates/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/academy/certificate-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Save failed")
      }
      const { template } = (await res.json()) as { template: Template }
      setTemplates((prev) => {
        const next = editing.id
          ? prev.map((t) => (t.id === template.id ? template : t))
          : [...prev, template]
        return reapplyDefaultFlag(next, template)
      })
      toast.success(editing.id ? "Template updated" : "Template created")
      setEditing(null)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Delete template "${t.name}"? Issued certificates keep their snapshot.`)) {
      return
    }
    try {
      const res = await fetch(`/api/academy/certificate-templates/${t.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Delete failed")
      }
      setTemplates((prev) => prev.filter((x) => x.id !== t.id))
      toast.success("Template deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-sm">Certificate templates</h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                Spec §13 — customise the certificate layout, logos, signatory,
                and watermark. Mark exactly one template as <em>default</em>;
                it is snapshotted onto every new certificate at issue time.
              </p>
            </div>
            <Button onClick={openNew} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Logos</TableHead>
                <TableHead>Signatory</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No templates yet. Create one to start customising the certificate.
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm font-medium">{t.name}</TableCell>
                    <TableCell>
                      {t.isDefault ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                          <Star className="h-3 w-3 mr-1 fill-amber-600 text-amber-600" />
                          Default
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <LogoChip url={t.primaryLogoUrl} />
                        <LogoChip url={t.secondaryLogoUrl} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.signatoryName ?? "—"}
                      {t.signatoryTitle ? `, ${t.signatoryTitle}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewId(t.id)}
                          aria-label="Preview"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(t)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(t)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit / Create dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Edit template" : "New certificate template"}
            </DialogTitle>
            <DialogDescription>
              Changes apply to certificates issued after save. Existing
              certificates keep the layout that was active when they were issued.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-5 pt-2">
              <div>
                <Label className="text-xs">Template name</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Standard 2026"
                  maxLength={80}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <LogoUploader
                  label="Primary logo"
                  value={editing.primaryLogoUrl}
                  onChange={(url) =>
                    setEditing({ ...editing, primaryLogoUrl: url })
                  }
                />
                <LogoUploader
                  label="Secondary logo"
                  value={editing.secondaryLogoUrl}
                  onChange={(url) =>
                    setEditing({ ...editing, secondaryLogoUrl: url })
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Signatory name</Label>
                  <Input
                    value={editing.signatoryName ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        signatoryName: e.target.value || null,
                      })
                    }
                    placeholder="e.g. Dr. Jane Doe"
                    maxLength={80}
                  />
                </div>
                <div>
                  <Label className="text-xs">Signatory title</Label>
                  <Input
                    value={editing.signatoryTitle ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        signatoryTitle: e.target.value || null,
                      })
                    }
                    placeholder="e.g. Academy Director"
                    maxLength={80}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Layout</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Accent color</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={editing.layoutJson?.accentColor ?? "#1a365d"}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            layoutJson: {
                              ...editing.layoutJson,
                              accentColor: e.target.value,
                            },
                          })
                        }
                        className="w-12 h-9 p-1"
                      />
                      <Input
                        value={editing.layoutJson?.accentColor ?? "#1a365d"}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            layoutJson: {
                              ...editing.layoutJson,
                              accentColor: e.target.value,
                            },
                          })
                        }
                        placeholder="#1a365d"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Font family</Label>
                    <Select
                      value={editing.layoutJson?.fontFamily ?? "serif"}
                      onValueChange={(v) =>
                        setEditing({
                          ...editing,
                          layoutJson: {
                            ...editing.layoutJson,
                            fontFamily: v as "serif" | "sans",
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="serif">Serif (Playfair Display)</SelectItem>
                        <SelectItem value="sans">Sans (Open Sans)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Border style</Label>
                    <Select
                      value={editing.layoutJson?.borderStyle ?? "solid"}
                      onValueChange={(v) =>
                        setEditing({
                          ...editing,
                          layoutJson: {
                            ...editing.layoutJson,
                            borderStyle: v as "solid" | "double" | "none",
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solid">Solid</SelectItem>
                        <SelectItem value="double">Double</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <LogoUploader
                    label="Signature image (optional)"
                    value={editing.layoutJson?.signatureImageUrl ?? null}
                    onChange={(url) =>
                      setEditing({
                        ...editing,
                        layoutJson: {
                          ...editing.layoutJson,
                          signatureImageUrl: url,
                        },
                      })
                    }
                  />
                  <div>
                    <Label className="text-xs">Watermark text (optional)</Label>
                    <Input
                      value={editing.layoutJson?.watermarkText ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          layoutJson: {
                            ...editing.layoutJson,
                            watermarkText: e.target.value || null,
                          },
                        })
                      }
                      placeholder="e.g. CONFIDENTIAL"
                      maxLength={60}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      Watermark opacity ({(editing.layoutJson?.watermarkOpacity ?? 0.08).toFixed(2)})
                    </Label>
                    <input
                      type="range"
                      min={0.05}
                      max={0.25}
                      step={0.01}
                      value={editing.layoutJson?.watermarkOpacity ?? 0.08}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          layoutJson: {
                            ...editing.layoutJson,
                            watermarkOpacity: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="w-full mt-2"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <div className="text-sm font-medium">Make default</div>
                  <p className="text-[11px] text-muted-foreground">
                    Future certificates use this template until another is marked default.
                  </p>
                </div>
                <Switch
                  checked={editing.isDefault}
                  onCheckedChange={(v) => setEditing({ ...editing, isDefault: v })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Template preview</DialogTitle>
            <DialogDescription>
              Sample data — what an issued certificate using this template would look like.
            </DialogDescription>
          </DialogHeader>
          {previewId && (
            <iframe
              src={`/api/academy/certificate-templates/${previewId}/preview`}
              className="w-full h-[600px] border rounded-md"
              title="Certificate preview"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LogoChip({ url }: { url: string | null }) {
  if (!url) return <span className="text-xs text-muted-foreground">—</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Logo"
      className="h-7 w-auto max-w-[80px] object-contain border rounded bg-white p-0.5"
    />
  )
}

function LogoUploader({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (url: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const sigRes = await fetch("/api/upload/signature")
      if (!sigRes.ok) {
        let body: { error?: string; code?: string } = {}
        try {
          body = await sigRes.json()
        } catch {
          // ignore
        }
        if (body.code === "CLOUDINARY_NOT_CONFIGURED") {
          throw new Error(
            "Uploads aren't enabled on this site yet. Paste a logo URL below instead."
          )
        }
        throw new Error(body.error ?? "Signature request failed")
      }
      const { timestamp, signature, cloudName, apiKey } = await sigRes.json()

      const formData = new FormData()
      formData.append("file", file)
      formData.append("timestamp", String(timestamp))
      formData.append("signature", signature)
      formData.append("api_key", apiKey)
      formData.append(
        "upload_preset",
        process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!
      )

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: formData }
      )
      if (!res.ok) throw new Error("Cloudinary upload failed")
      const json = await res.json()
      onChange(json.secure_url as string)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-start gap-3">
        <div className="h-16 w-24 border rounded bg-white flex items-center justify-center overflow-hidden">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[10px] text-muted-foreground">No logo</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              Upload
            </Button>
            {value && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(null)}
              >
                Remove
              </Button>
            )}
          </div>
          <Input
            type="url"
            placeholder="Or paste a URL"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="text-xs"
          />
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadFile(f)
            }}
          />
        </div>
      </div>
    </div>
  )
}

function reapplyDefaultFlag(list: Template[], saved: Template): Template[] {
  if (!saved.isDefault) return list
  return list.map((t) =>
    t.id === saved.id ? t : t.isDefault ? { ...t, isDefault: false } : t
  )
}
