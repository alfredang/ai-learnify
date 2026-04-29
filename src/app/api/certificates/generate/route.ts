import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { maybeIssueCertificate, checkCertEligibility } from "@/lib/certification"

// Spec §11 requires fully automated issuance. Auto-issue already runs from
// progress / quiz / survey routes. This endpoint is a safety-valve "recheck"
// for learners who think they've satisfied every gate but haven't seen a
// certificate appear — it never bypasses the CertificateRule engine.
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const contentType = request.headers.get("content-type") ?? ""
    let courseId: string | null = null
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as { courseId?: string } | null
      courseId = body?.courseId ?? null
    } else {
      const formData = await request.formData()
      const raw = formData.get("courseId")
      courseId = typeof raw === "string" ? raw : null
    }

    if (!courseId) {
      return NextResponse.json({ message: "Course ID is required" }, { status: 400 })
    }

    const result = await maybeIssueCertificate(session.user.id, courseId)

    if (result.issued) {
      if (contentType.includes("application/json")) {
        return NextResponse.json({
          issued: true,
          certificate: {
            id: result.certificate?.id,
            certificateId: result.certificate?.certificateId,
          },
        })
      }
      return NextResponse.redirect(new URL("/certificates", request.url), 303)
    }

    if (result.reason === "ALREADY_ISSUED") {
      if (contentType.includes("application/json")) {
        return NextResponse.json({
          issued: false,
          reason: "ALREADY_ISSUED",
          certificate: {
            id: result.certificate?.id,
            certificateId: result.certificate?.certificateId,
          },
        })
      }
      return NextResponse.redirect(new URL("/certificates", request.url), 303)
    }

    const eligibility = result.eligibility ?? (await checkCertEligibility(session.user.id, courseId))
    return NextResponse.json(
      {
        issued: false,
        reason: result.reason,
        eligibility: {
          contentPct: eligibility.contentPct,
          assessmentPct: eligibility.assessmentPct,
          surveyDone: eligibility.surveyDone,
          rule: eligibility.rule,
        },
      },
      { status: 409 }
    )
  } catch (error) {
    console.error("Certificate recheck error:", error)
    return NextResponse.json({ message: "Failed to recheck certificate" }, { status: 500 })
  }
}
