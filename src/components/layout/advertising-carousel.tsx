import { prisma } from "@/lib/prisma"
import { BannerRotator, type BannerSlide } from "./banner-rotator"

interface AdvertisingCarouselProps {
  academySlug?: string
  placement?: "CAROUSEL_TOP" | "SIDEBAR" | "FOOTER"
  maxSlides?: number
}

/**
 * Server component that resolves the banners for a given academy and renders
 * the client-side rotator. Public pages call this without a learner session —
 * we default to the "default" academy. Spec §4.1 permits up to 10 banners.
 */
export async function AdvertisingCarousel({
  academySlug = "default",
  placement = "CAROUSEL_TOP",
  maxSlides = 10,
}: AdvertisingCarouselProps) {
  const academy = await prisma.academy.findUnique({
    where: { slug: academySlug },
    select: { id: true },
  })
  if (!academy) return null

  const now = new Date()
  const banners = await prisma.banner.findMany({
    where: {
      academyId: academy.id,
      placement,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: maxSlides,
    select: { id: true, imageUrl: true, title: true, targetUrl: true },
  })

  if (banners.length === 0) return null

  const slides: BannerSlide[] = banners.map((b) => ({
    id: b.id,
    imageUrl: b.imageUrl,
    title: b.title,
    targetUrl: b.targetUrl,
  }))

  return <BannerRotator slides={slides} />
}
