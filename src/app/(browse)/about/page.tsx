import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Users,
  BookOpen,
  Award,
  Globe,
  Target,
  Heart,
  ArrowRight,
} from "lucide-react"

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Learn about IES Digital Academy — our mission, values, and the people behind the platform",
}

type TeamMember = { name: string; role: string; imageUrl: string }

const DEFAULT_ABOUT_HTML = `
<h2>Our story</h2>
<p>IES Digital Academy was founded to make professional, certificate-bearing education accessible to learners anywhere in the world. We started with a simple belief: <strong>learning should fit your life</strong>, not the other way around.</p>
<p>The platform you see today is a self-paced, asynchronous LMS designed for international scale. Every feature — from 90-day access windows to QR-verified certificates and four-way revenue sharing — exists to serve a specific learner or partner outcome documented in our product specification.</p>
<p>We work with Course Developers, Marketers, and Academy Admins from multiple jurisdictions, with full multi-currency, multi-language, and tax-compliant invoicing built in.</p>
`

const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200"
const DEFAULT_STORY_IMAGE =
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800"

const DEFAULT_TEAM: TeamMember[] = [
  {
    name: "Sarah Johnson",
    role: "Academy Director",
    imageUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
  },
  {
    name: "Michael Chen",
    role: "Head of Engineering",
    imageUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
  },
  {
    name: "Emily Rodriguez",
    role: "Head of Content",
    imageUrl:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400",
  },
  {
    name: "David Kim",
    role: "Lead Instructional Designer",
    imageUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
  },
]

const stats = [
  { icon: BookOpen, value: "Self-paced", label: "100% asynchronous" },
  { icon: Award, value: "QR-verified", label: "Public certificate verify" },
  { icon: Globe, value: "Multi-currency", label: "Tax-aware invoicing" },
  { icon: Users, value: "4-way split", label: "Transparent revenue share" },
]

const values = [
  {
    icon: Target,
    title: "Outcomes Over Activity",
    description:
      "Certification is gated by real completion criteria — content, assessment, and survey. We measure what actually moves the needle for learners.",
  },
  {
    icon: Users,
    title: "Fair By Design",
    description:
      "Revenue is split four ways across Academy, Developer, Marketer, and Platform Support — every transaction is recorded in an append-only ledger.",
  },
  {
    icon: Heart,
    title: "Records That Last",
    description:
      "Learner data is retained permanently with soft-delete only. Your achievements are yours — and verifiable — forever.",
  },
]

async function getAbout() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: {
      name: true,
      aboutHtml: true,
      aboutHeroImageUrl: true,
      aboutStoryImageUrl: true,
      aboutTeamJson: true,
    },
  })
  const team =
    Array.isArray(academy?.aboutTeamJson) &&
    (academy?.aboutTeamJson as TeamMember[]).length > 0
      ? (academy?.aboutTeamJson as TeamMember[])
      : DEFAULT_TEAM
  return {
    academyName: academy?.name ?? "IES Digital Academy",
    html: academy?.aboutHtml || DEFAULT_ABOUT_HTML,
    heroImage: academy?.aboutHeroImageUrl || DEFAULT_HERO_IMAGE,
    storyImage: academy?.aboutStoryImageUrl || DEFAULT_STORY_IMAGE,
    team,
  }
}

export default async function AboutPage() {
  const { academyName, html, storyImage, team } = await getAbout()

  return (
    <div className="flex flex-col">
      <section className="py-16 md:py-24 bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              {academyName}
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Self-paced, certificate-bearing learning for an international
              audience — built on transparent revenue sharing and verifiable
              outcomes.
            </p>
            <Button size="lg" asChild>
              <Link href="/courses">
                Explore Courses
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-12 border-y bg-muted/50">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="flex justify-center mb-2">
                  <stat.icon className="h-8 w-8 text-primary" />
                </div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-muted-foreground text-sm">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative h-[400px] rounded-2xl overflow-hidden">
              <Image
                src={storyImage}
                alt="Our story"
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <div
              className="prose prose-slate max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">What we stand for</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The principles that shape every feature we ship
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value) => (
              <Card key={value.title}>
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <value.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{value.title}</h3>
                  <p className="text-muted-foreground">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {team.length > 0 && (
        <section className="py-16 md:py-24">
          <div className="container">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Meet the team</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                The people behind {academyName}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {team.map((member) => (
                <div key={member.name} className="text-center">
                  <div className="relative w-32 h-32 mx-auto mb-4 rounded-full overflow-hidden bg-muted">
                    {member.imageUrl ? (
                      <Image
                        src={member.imageUrl}
                        alt={member.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <h3 className="font-semibold">{member.name}</h3>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 md:py-24 bg-primary">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Ready to start learning?
            </h2>
            <p className="text-lg text-primary-foreground/80 mb-8">
              Browse the full catalogue or apply to publish your own courses.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/courses">Browse Courses</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent text-primary-foreground border-primary-foreground hover:bg-primary-foreground hover:text-primary"
                asChild
              >
                <Link href="/become-instructor">Become a Course Developer</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
