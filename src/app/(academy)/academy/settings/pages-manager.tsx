"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

type TeamMember = { name: string; role: string; imageUrl: string }
type FaqItem = { q: string; a: string }

export type PagesData = {
  aboutHtml: string | null
  aboutHeroImageUrl: string | null
  aboutStoryImageUrl: string | null
  aboutTeamJson: TeamMember[] | null
  helpCenterHtml: string | null
  faqJson: FaqItem[] | null
  contactHtml: string | null
  contactEmail: string | null
  contactPhone: string | null
  contactAddress: string | null
  careersHtml: string | null
  becomeDeveloperHtml: string | null
  becomeDeveloperHeroImageUrl: string | null
  coursesIntroHtml: string | null
  categoriesIntroHtml: string | null
}

interface Props {
  initial: PagesData
}

export function PagesManager({ initial }: Props) {
  const router = useRouter()
  const [state, setState] = useState<PagesData>(initial)
  const [saving, setSaving] = useState<string | null>(null)

  function set<K extends keyof PagesData>(key: K, value: PagesData[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  async function save(fields: Partial<PagesData>, label: string) {
    setSaving(label)
    try {
      const res = await fetch("/api/academy/pages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? "Save failed")
      }
      toast.success(`${label} saved`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-sm">Page templates</h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            Edit copy and images shown on the public footer pages. Empty fields
            fall back to the platform defaults. Image URLs must be on the
            allowlisted hosts (Cloudinary, Unsplash, etc.).
          </p>
        </div>

        <Tabs defaultValue="about" className="pt-2">
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <TabsList className="flex w-max">
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="help">Help</TabsTrigger>
              <TabsTrigger value="faq">FAQ</TabsTrigger>
              <TabsTrigger value="contact">Contact</TabsTrigger>
              <TabsTrigger value="careers">Careers</TabsTrigger>
              <TabsTrigger value="developer">Become a Developer</TabsTrigger>
              <TabsTrigger value="catalog">Catalogue</TabsTrigger>
            </TabsList>
          </div>

          {/* ABOUT */}
          <TabsContent value="about" className="mt-4 space-y-4">
            <ImageField
              label="Hero image URL (banner)"
              value={state.aboutHeroImageUrl}
              onChange={(v) => set("aboutHeroImageUrl", v)}
            />
            <ImageField
              label="Story image URL"
              value={state.aboutStoryImageUrl}
              onChange={(v) => set("aboutStoryImageUrl", v)}
            />
            <HtmlField
              label="About body (HTML)"
              value={state.aboutHtml}
              onChange={(v) => set("aboutHtml", v)}
              placeholder="<h2>Our story</h2><p>...</p>"
              rows={10}
            />
            <TeamEditor
              value={state.aboutTeamJson}
              onChange={(v) => set("aboutTeamJson", v)}
            />
            <SaveBar
              saving={saving === "About"}
              onSave={() =>
                save(
                  {
                    aboutHtml: state.aboutHtml,
                    aboutHeroImageUrl: state.aboutHeroImageUrl,
                    aboutStoryImageUrl: state.aboutStoryImageUrl,
                    aboutTeamJson: state.aboutTeamJson,
                  },
                  "About"
                )
              }
            />
          </TabsContent>

          {/* HELP */}
          <TabsContent value="help" className="mt-4 space-y-4">
            <HtmlField
              label="Help Center body (HTML)"
              value={state.helpCenterHtml}
              onChange={(v) => set("helpCenterHtml", v)}
              placeholder="<h2>How can we help?</h2><p>...</p>"
              rows={14}
            />
            <SaveBar
              saving={saving === "Help"}
              onSave={() =>
                save({ helpCenterHtml: state.helpCenterHtml }, "Help")
              }
            />
          </TabsContent>

          {/* FAQ */}
          <TabsContent value="faq" className="mt-4 space-y-4">
            <FaqEditor
              value={state.faqJson}
              onChange={(v) => set("faqJson", v)}
            />
            <SaveBar
              saving={saving === "FAQ"}
              onSave={() => save({ faqJson: state.faqJson }, "FAQ")}
            />
          </TabsContent>

          {/* CONTACT */}
          <TabsContent value="contact" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  value={state.contactEmail ?? ""}
                  onChange={(e) =>
                    set("contactEmail", e.target.value || null)
                  }
                  placeholder="support@iesdigitalacademy.com"
                />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input
                  value={state.contactPhone ?? ""}
                  onChange={(e) =>
                    set("contactPhone", e.target.value || null)
                  }
                  placeholder="+65 1234 5678"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Textarea
                value={state.contactAddress ?? ""}
                onChange={(e) =>
                  set("contactAddress", e.target.value || null)
                }
                placeholder="Line 1&#10;Line 2&#10;Postal code"
                rows={3}
              />
            </div>
            <HtmlField
              label="Contact body (HTML)"
              value={state.contactHtml}
              onChange={(v) => set("contactHtml", v)}
              placeholder="<h2>Get in touch</h2><p>...</p>"
              rows={10}
            />
            <SaveBar
              saving={saving === "Contact"}
              onSave={() =>
                save(
                  {
                    contactHtml: state.contactHtml,
                    contactEmail: state.contactEmail,
                    contactPhone: state.contactPhone,
                    contactAddress: state.contactAddress,
                  },
                  "Contact"
                )
              }
            />
          </TabsContent>

          {/* CAREERS */}
          <TabsContent value="careers" className="mt-4 space-y-4">
            <HtmlField
              label="Careers body (HTML)"
              value={state.careersHtml}
              onChange={(v) => set("careersHtml", v)}
              placeholder="<h2>Build the future...</h2><p>...</p>"
              rows={14}
            />
            <SaveBar
              saving={saving === "Careers"}
              onSave={() =>
                save({ careersHtml: state.careersHtml }, "Careers")
              }
            />
          </TabsContent>

          {/* DEVELOPER */}
          <TabsContent value="developer" className="mt-4 space-y-4">
            <ImageField
              label="Hero image URL (logged-out signup view)"
              value={state.becomeDeveloperHeroImageUrl}
              onChange={(v) => set("becomeDeveloperHeroImageUrl", v)}
            />
            <HtmlField
              label="Logged-in marketing body (HTML)"
              value={state.becomeDeveloperHtml}
              onChange={(v) => set("becomeDeveloperHtml", v)}
              placeholder="<h2>Why teach here?</h2><p>...</p>"
              rows={10}
            />
            <SaveBar
              saving={saving === "Developer"}
              onSave={() =>
                save(
                  {
                    becomeDeveloperHtml: state.becomeDeveloperHtml,
                    becomeDeveloperHeroImageUrl:
                      state.becomeDeveloperHeroImageUrl,
                  },
                  "Become a Developer"
                )
              }
            />
          </TabsContent>

          {/* CATALOG */}
          <TabsContent value="catalog" className="mt-4 space-y-4">
            <HtmlField
              label="Browse Courses intro (HTML, optional)"
              value={state.coursesIntroHtml}
              onChange={(v) => set("coursesIntroHtml", v)}
              placeholder="<p>Looking for compliance training? See …</p>"
              rows={5}
            />
            <HtmlField
              label="Categories intro (HTML, optional)"
              value={state.categoriesIntroHtml}
              onChange={(v) => set("categoriesIntroHtml", v)}
              placeholder="<p>Pick a topic to start exploring.</p>"
              rows={5}
            />
            <SaveBar
              saving={saving === "Catalogue"}
              onSave={() =>
                save(
                  {
                    coursesIntroHtml: state.coursesIntroHtml,
                    categoriesIntroHtml: state.categoriesIntroHtml,
                  },
                  "Catalogue"
                )
              }
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function HtmlField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        rows={rows ?? 8}
        className="font-mono text-xs"
      />
      <p className="text-[10px] text-muted-foreground mt-1">
        HTML — use &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;ul&gt;,
        &lt;strong&gt;, &lt;a href&gt;. Leave empty to fall back to the default copy.
      </p>
    </div>
  )
}

function ImageField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-start gap-3">
        <div className="h-16 w-24 border rounded bg-white flex items-center justify-center overflow-hidden shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">No image</span>
          )}
        </div>
        <div className="flex-1 space-y-1">
          <Input
            type="url"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="https://res.cloudinary.com/... or https://images.unsplash.com/..."
            className="text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Must be HTTPS on an allowlisted host.
          </p>
        </div>
      </div>
    </div>
  )
}

function SaveBar({
  saving,
  onSave,
}: {
  saving: boolean
  onSave: () => void
}) {
  return (
    <div className="flex justify-end pt-2 border-t">
      <Button onClick={onSave} disabled={saving} size="sm">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save
      </Button>
    </div>
  )
}

function TeamEditor({
  value,
  onChange,
}: {
  value: TeamMember[] | null
  onChange: (v: TeamMember[] | null) => void
}) {
  const list = value ?? []

  function update(i: number, patch: Partial<TeamMember>) {
    const next = list.map((m, idx) => (idx === i ? { ...m, ...patch } : m))
    onChange(next)
  }
  function remove(i: number) {
    const next = list.filter((_, idx) => idx !== i)
    onChange(next.length > 0 ? next : null)
  }
  function add() {
    onChange([...list, { name: "", role: "", imageUrl: "" }])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Team members</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add member
        </Button>
      </div>
      {list.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No team members — defaults are shown. Add one to override.
        </p>
      )}
      {list.map((m, i) => (
        <div
          key={i}
          className="grid grid-cols-1 md:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-start border rounded p-2"
        >
          <Input
            value={m.name}
            placeholder="Name"
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Input
            value={m.role}
            placeholder="Role"
            onChange={(e) => update(i, { role: e.target.value })}
          />
          <Input
            value={m.imageUrl}
            placeholder="https://..."
            onChange={(e) => update(i, { imageUrl: e.target.value })}
            className="text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(i)}
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}

function FaqEditor({
  value,
  onChange,
}: {
  value: FaqItem[] | null
  onChange: (v: FaqItem[] | null) => void
}) {
  const list = value ?? []

  function update(i: number, patch: Partial<FaqItem>) {
    const next = list.map((m, idx) => (idx === i ? { ...m, ...patch } : m))
    onChange(next)
  }
  function remove(i: number) {
    const next = list.filter((_, idx) => idx !== i)
    onChange(next.length > 0 ? next : null)
  }
  function add() {
    onChange([...list, { q: "", a: "" }])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">FAQ items</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Q&amp;A
        </Button>
      </div>
      {list.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No items — the default FAQ list is shown publicly. Add at least one
          to override.
        </p>
      )}
      {list.map((item, i) => (
        <div key={i} className="border rounded p-2 space-y-2">
          <div className="flex items-start gap-2">
            <Input
              value={item.q}
              placeholder="Question"
              onChange={(e) => update(i, { q: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(i)}
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            value={item.a}
            placeholder="Answer (HTML allowed: <strong>, <a>, etc.)"
            onChange={(e) => update(i, { a: e.target.value })}
            rows={3}
            className="font-mono text-xs"
          />
        </div>
      ))}
    </div>
  )
}
