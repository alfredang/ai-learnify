---
name: frontend-design
description: IES Digital Academy design system and frontend guidelines. Use when building or modifying UI components, pages, or layouts. Enforces white theme, compact spacing, professional tone, and project-specific patterns.
license: Complete terms in LICENSE.txt
---

## IES Digital Academy — Frontend Design System

This is an engineering academy LMS. The design must be **clean, professional, institutional, and compact**. Pure white backgrounds only. No dark mode.

### Theme (LOCKED)

All colors are defined in `src/app/globals.css` as CSS custom properties using oklch. Do NOT modify theme values.

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `oklch(1 0 0)` — **pure white** | Page backgrounds, all sections |
| `--foreground` | `oklch(0.145 0 0)` — near-black | Body text, headings |
| `--primary` | `oklch(0.205 0 0)` — black | Buttons, CTAs, active states |
| `--primary-foreground` | `oklch(0.985 0 0)` — white | Text on primary backgrounds |
| `--muted` | `oklch(0.97 0 0)` — very light gray | Hover states on cards ONLY |
| `--border` | `oklch(0.922 0 0)` — light gray | Borders, dividers |
| `--destructive` | `oklch(0.577 0.245 27.325)` — red | Error states, delete actions |

**CRITICAL BACKGROUND RULES:**
- All page sections MUST use `bg-white` or no background class (inherits white)
- NEVER use `bg-muted`, `bg-muted/50`, `bg-gray-*`, `bg-slate-*`, `bg-gradient-*`, or `from-primary/10` on section-level containers
- `bg-muted/50` is ONLY acceptable on card hover states (e.g., `hover:bg-muted/50`)
- The only non-white background allowed is `bg-primary` (black) for CTA blocks
- No gradients on content sections — pure white everywhere

### Typography

- **Font**: Inter (loaded via `next/font/google` in root layout) — do NOT change or add fonts
- **Headings**: `font-bold`, sizes `text-xl` through `text-4xl`
- **Body**: `text-sm` to `text-base`
- **Secondary text**: Use `text-muted-foreground` class
- **No decorative or display fonts** — Inter for everything

### Spacing (Compact)

Sections must be tight and compact. Avoid excessive vertical padding.

| Element | Recommended Spacing |
|---------|-------------------|
| Hero section | `py-6 md:py-8` |
| Content sections | `py-4 md:py-6` to `py-8 md:py-10` |
| Between sections | `pt-4 md:pt-6 pb-4 md:pb-6` |
| CTA section | `py-8 md:py-12`, inner `py-12 md:py-16` |
| Section headings `mb` | `mb-6` to `mb-8` |
| Card padding | `p-6` |
| Grid gaps | `gap-4` to `gap-8` |

**NEVER** use `py-16`, `py-24`, `lg:py-24` or larger on sections — these create excessive whitespace.

### Components & Libraries

| What | Use | Do NOT use |
|------|-----|-----------|
| UI components | shadcn/ui from `src/components/ui/` | Material UI, Ant Design, Chakra, etc. |
| Class merging | `cn()` from `@/lib/utils` | Raw string concatenation |
| Icons | Lucide React | Font Awesome, Heroicons, etc. |
| Toasts | Sonner | react-toastify, react-hot-toast |
| Forms | React Hook Form + Zod resolver | Formik, uncontrolled forms |
| Charts | Recharts | Chart.js, D3 (unless justified) |
| Drag & Drop | dnd-kit | react-beautiful-dnd |
| Rich text | TipTap | Quill, Draft.js |

### Layout Patterns

- **Cards**: White background, subtle `border`, rounded corners (`rounded-lg`), `shadow-sm` optional
- **Grids**: Use Tailwind grid — `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` for categories, `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` for course cards
- **Responsive**: Mobile-first with `sm:`, `md:`, `lg:` breakpoints
- **Container**: Always wrap content in `<div className="container">`
- **Section separation**: Use `border-y` or `border-t` for visual breaks, NOT background color changes

### Logo & Branding

- **Logo**: IES gear/atom SVG at `/public/images/ies-logo.svg`
- **App name**: "IES Digital Academy" — displayed next to logo in header/footer
- **Logo sizes**: Header 36px, Footer 32px, Instructor sidebar 28px
- **Implementation**: `<img src="/images/ies-logo.svg" alt="IES Logo" width={36} height={36} />`

### Image Handling

- **Next.js Image**: Use `next/image` for optimized images with `fill` + `object-cover` for responsive containers
- **Allowed hosts**: Defined in `src/lib/image-hosts.ts` — Cloudinary, Unsplash, randomuser, Google, GitHub
- **Course thumbnails**: Use Cloudinary via `next-cloudinary`
- **Placeholder images**: Unsplash with `?w=800` or `?w=1200&h=400&fit=crop` params

### Page Structure Pattern

```tsx
<div className="flex flex-col">
  {/* Hero */}
  <section className="relative py-6 md:py-8 bg-white overflow-hidden">
    <div className="container">...</div>
  </section>

  {/* Content Section */}
  <section className="py-4 md:py-6">
    <div className="container">
      <h2 className="text-2xl md:text-3xl font-bold mb-6">Title</h2>
      {/* content */}
    </div>
  </section>

  {/* CTA (only place for non-white bg) */}
  <section className="py-8 md:py-12">
    <div className="container">
      <div className="rounded-3xl bg-primary px-8 py-12 md:px-16 md:py-16">
        {/* white text on black bg */}
      </div>
    </div>
  </section>
</div>
```

### Server vs Client Components

- **Server Components by default** — pages, layouts, display components
- **`"use client"` only when needed** — forms, interactive UI, hooks, event handlers
- **Data fetching**: Direct Prisma calls in server components, no API layer for internal reads
- **Client data**: React Query with 60s staleTime

### Accessibility

- Always include `alt` text on images
- Use semantic HTML (`nav`, `main`, `section`, `header`, `footer`)
- Interactive elements must have visible focus states (shadcn/ui handles this)
- Use `sr-only` for screen-reader-only labels

### Do NOT

- Add dark mode, theme toggles, or `.dark` class usage
- Use ANY gray/gradient/colored backgrounds on content sections
- Use `bg-muted`, `bg-muted/50`, `bg-gray-*`, `bg-slate-*` on sections (card hover only)
- Use fonts other than Inter
- Install additional UI, animation, or icon libraries
- Use overly playful, casual, or decorative design elements
- Add excessive vertical padding (`py-16+`) between sections
- Use inline styles — always use Tailwind utility classes
- Create `tailwind.config.ts` — Tailwind v4 is configured via PostCSS
