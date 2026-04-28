"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import {
  COURSE_LEVELS,
  PRICE_FILTERS,
  PRODUCT_TYPE_FILTERS,
  RATING_FILTERS,
  SORT_OPTIONS,
} from "@/lib/constants"

interface Option {
  id?: string
  name: string
  slug: string
}

interface CourseFiltersProps {
  categories?: { id: string; name: string; slug: string }[]
  sectors?: Option[]
  cpdEntries?: { id: string; name: string; slug: string }[]
  partners?: string[]
}

// Phase 2: spec §4.3 adds Sector, CPD, Course/Programme, and Partner filters,
// plus Alphabetical / Partner / CPD sorts (§4.3 sort list).
export function CourseFilters({
  categories,
  sectors,
  cpdEntries,
  partners,
}: CourseFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentCategory = searchParams.get("category") || "all"
  const currentSector = searchParams.get("sector") || "all"
  const currentCpd = searchParams.get("cpd") || "all"
  const currentPartner = searchParams.get("partner") || "all"
  const currentProductType = searchParams.get("productType") || "all"
  const currentPrice = searchParams.get("price") || "all"
  const currentLevel = searchParams.get("level") || "all"
  const currentRating = searchParams.get("rating") || "all"
  const currentSort = searchParams.get("sort") || "popular"

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`?${params.toString()}`)
  }

  const clearFilters = () => {
    router.push(window.location.pathname)
  }

  const hasFilters =
    (currentCategory && currentCategory !== "all") ||
    (currentSector && currentSector !== "all") ||
    (currentCpd && currentCpd !== "all") ||
    (currentPartner && currentPartner !== "all") ||
    (currentProductType && currentProductType !== "all") ||
    (currentPrice && currentPrice !== "all") ||
    (currentLevel && currentLevel !== "all") ||
    (currentRating && currentRating !== "all")

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {sectors && sectors.length > 0 && (
        <Select value={currentSector} onValueChange={(v) => updateFilter("sector", v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.slug} value={s.slug}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {cpdEntries && cpdEntries.length > 0 && (
        <Select value={currentCpd} onValueChange={(v) => updateFilter("cpd", v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="CPD" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any CPD</SelectItem>
            {cpdEntries.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={currentProductType}
        onValueChange={(v) => updateFilter("productType", v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Content" />
        </SelectTrigger>
        <SelectContent>
          {PRODUCT_TYPE_FILTERS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Spec §4.3 — Price filter (Free / Paid) */}
      <Select value={currentPrice} onValueChange={(v) => updateFilter("price", v)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Price" />
        </SelectTrigger>
        <SelectContent>
          {PRICE_FILTERS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {partners && partners.length > 0 && (
        <Select value={currentPartner} onValueChange={(v) => updateFilter("partner", v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Partner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {partners.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {categories && (
        <Select
          value={currentCategory}
          onValueChange={(value) => updateFilter("category", value)}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.slug}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={currentLevel}
        onValueChange={(value) => updateFilter("level", value)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Levels</SelectItem>
          {COURSE_LEVELS.map((level) => (
            <SelectItem key={level.value} value={level.value}>
              {level.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentRating}
        onValueChange={(value) => updateFilter("rating", value)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Rating" />
        </SelectTrigger>
        <SelectContent>
          {RATING_FILTERS.map((filter) => (
            <SelectItem key={filter.value} value={filter.value}>
              {filter.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentSort}
        onValueChange={(value) => updateFilter("sort", value)}
      >
        <SelectTrigger className="w-[190px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4 mr-1" />
          Clear filters
        </Button>
      )}
    </div>
  )
}
