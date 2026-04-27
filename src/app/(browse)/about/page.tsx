import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
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
  description: "Learn about Learnify - our mission, values, and the team behind the platform",
}

const stats = [
  { icon: BookOpen, value: "10,000+", label: "Courses" },
  { icon: Users, value: "500,000+", label: "Students" },
  { icon: Award, value: "5,000+", label: "Instructors" },
  { icon: Globe, value: "180+", label: "Countries" },
]

const values = [
  {
    icon: Target,
    title: "Quality Education",
    description:
      "We believe everyone deserves access to high-quality education. Our courses are created by industry experts and reviewed for quality.",
  },
  {
    icon: Users,
    title: "Community First",
    description:
      "Learning is better together. We foster a supportive community where students and instructors can connect and grow.",
  },
  {
    icon: Heart,
    title: "Passion for Learning",
    description:
      "We're passionate about helping people achieve their goals through continuous learning and skill development.",
  },
]

const team = [
  {
    name: "Sarah Johnson",
    role: "CEO & Co-Founder",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
  },
  {
    name: "Michael Chen",
    role: "CTO & Co-Founder",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
  },
  {
    name: "Emily Rodriguez",
    role: "Head of Content",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400",
  },
  {
    name: "David Kim",
    role: "Head of Engineering",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
  },
]

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Empowering Learners Worldwide
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Learnify is on a mission to transform lives through accessible,
              high-quality online education. We connect curious minds with
              expert instructors to unlock human potential.
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

      {/* Stats Section */}
      <section className="py-12 border-y bg-muted/50">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="flex justify-center mb-2">
                  <stat.icon className="h-8 w-8 text-primary" />
                </div>
                <div className="text-3xl font-bold">{stat.value}</div>
                <div className="text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative h-[400px] rounded-2xl overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800"
                alt="Team collaboration"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-6">Our Story</h2>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  Learnify was founded in 2020 with a simple belief: education
                  should be accessible to everyone, everywhere. What started as
                  a small platform with just a handful of courses has grown into
                  a global learning community.
                </p>
                <p>
                  Our founders, experienced educators and technologists, saw the
                  potential to democratize education through technology. They
                  built Learnify to bridge the gap between expert knowledge and
                  eager learners.
                </p>
                <p>
                  Today, Learnify hosts thousands of courses across diverse
                  categories, from programming and business to creative arts and
                  personal development. We&apos;re proud to have helped millions
                  of students advance their careers and pursue their passions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Our Values</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              These core values guide everything we do at Learnify
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

      {/* Team Section */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Meet Our Team</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The passionate people behind Learnify
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {team.map((member) => (
              <div key={member.name} className="text-center">
                <div className="relative w-32 h-32 mx-auto mb-4 rounded-full overflow-hidden">
                  <Image
                    src={member.image}
                    alt={member.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <h3 className="font-semibold">{member.name}</h3>
                <p className="text-sm text-muted-foreground">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-primary">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Ready to Start Learning?
            </h2>
            <p className="text-lg text-primary-foreground/80 mb-8">
              Join millions of learners and start your journey today.
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
                <Link href="/become-instructor">Become an Instructor</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
