"use client"

import dynamic from "next/dynamic"

const CourseFilters = dynamic(
  () => import("./course-filters").then((mod) => mod.CourseFilters),
  {
    ssr: false,
    loading: () => <div className="h-10 animate-pulse bg-muted rounded" />,
  }
)

type Option = { id?: string; name: string; slug: string }

interface CourseFiltersWrapperProps {
  categories?: { id: string; name: string; slug: string }[]
  sectors?: Option[]
  cpdEntries?: { id: string; name: string; slug: string }[]
  partners?: string[]
}

export function CourseFiltersWrapper({
  categories,
  sectors,
  cpdEntries,
  partners,
}: CourseFiltersWrapperProps) {
  return (
    <CourseFilters
      categories={categories}
      sectors={sectors}
      cpdEntries={cpdEntries}
      partners={partners}
    />
  )
}
