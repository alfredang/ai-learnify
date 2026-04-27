import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { renderCertificateHtml } from "@/lib/certificate-html"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }

    const certificate = await prisma.certificate.findUnique({
      where: { id },
      include: {
        template: true,
      },
    })

    if (!certificate) {
      return NextResponse.json({ message: "Certificate not found" }, { status: 404 })
    }

    if (certificate.userId !== session.user.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 })
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? ""
    const verifyUrl = `${baseUrl}/verify/${certificate.certificateId}`

    const html = await renderCertificateHtml({
      certificateId: certificate.certificateId,
      courseName: certificate.courseName,
      instructorName: certificate.instructorName,
      nameToBeCalled: certificate.nameToBeCalled,
      certificateName: certificate.certificateName,
      certificateIdNumber: certificate.certificateIdNumber,
      cpdName: certificate.cpdName,
      cpdPoints: certificate.cpdPoints,
      issuedAt: certificate.issuedAt,
      completionDate: certificate.completionDate,
      template: certificate.template,
      verifyUrl,
    })

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  } catch (error) {
    console.error("Certificate download error:", error)
    return NextResponse.json({ message: "Failed to download certificate" }, { status: 500 })
  }
}
