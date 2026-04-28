import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { renderCertificateHtml } from "@/lib/certificate-html"

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

/**
 * GET — render the template against sample data so admins can iterate
 * on layout without needing a real issued certificate.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const template = await prisma.certificateTemplate.findFirst({
    where: { id, academyId },
  })
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? ""
  const html = await renderCertificateHtml({
    certificateId: "CERT-PREVIEW01",
    courseName: "Sample Course Title",
    instructorName: "Course Developer",
    nameToBeCalled: "Alex",
    certificateName: "Alex Sample Learner",
    certificateIdNumber: "ID-000123",
    cpdName: "Sample CPD",
    cpdPoints: "10.00" as unknown as never,
    issuedAt: new Date(),
    completionDate: new Date(),
    template,
    verifyUrl: `${baseUrl}/verify/CERT-PREVIEW01`,
  })

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
