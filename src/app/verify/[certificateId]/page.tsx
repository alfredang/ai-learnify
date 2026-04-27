import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react"

interface VerifyPageProps {
  params: Promise<{ certificateId: string }>
}

export const metadata: Metadata = {
  title: "Verify Certificate",
  description: "Public verification of a Learnify certificate",
}

// Phase 5: spec §13 QR code target. Public, no auth — anyone can confirm a
// cert is real. Revoked certs are explicitly marked so employers aren't
// shown a green check for a cancelled credential.
export default async function VerifyCertificatePage({ params }: VerifyPageProps) {
  const { certificateId } = await params

  const cert = await prisma.certificate.findUnique({
    where: { certificateId },
    select: {
      certificateId: true,
      issuedAt: true,
      completionDate: true,
      revokedAt: true,
      revokedReason: true,
      courseName: true,
      instructorName: true,
      nameToBeCalled: true,
      certificateName: true,
      cpdName: true,
      cpdPoints: true,
      contentCompletionPct: true,
      assessmentScorePct: true,
    },
  })

  if (!cert) notFound()

  const valid = !cert.revokedAt

  return (
    <div className="container max-w-2xl py-12">
      <Card className={valid ? "" : "border-red-400"}>
        <CardContent className="p-8">
          <div className="flex items-center gap-3 mb-6">
            {valid ? (
              <ShieldCheck className="h-10 w-10 text-green-600" />
            ) : (
              <XCircle className="h-10 w-10 text-red-600" />
            )}
            <div>
              <h1 className="text-2xl font-bold">
                {valid ? "Valid Certificate" : "Revoked Certificate"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Reference: {cert.certificateId}
              </p>
            </div>
          </div>

          {!valid && cert.revokedReason && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <strong>Reason for revocation:</strong> {cert.revokedReason}
            </div>
          )}

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Recipient" value={cert.certificateName ?? cert.nameToBeCalled ?? "—"} />
            <Field label="Known as" value={cert.nameToBeCalled ?? "—"} />
            <Field label="Course" value={cert.courseName} />
            <Field label="Instructor" value={cert.instructorName} />
            <Field
              label="Completion date"
              value={new Date(cert.completionDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            />
            <Field label="Issued" value={new Date(cert.issuedAt).toLocaleDateString()} />
            {cert.cpdName && (
              <Field
                label="CPD"
                value={
                  cert.cpdPoints
                    ? `${cert.cpdName} · ${Number(cert.cpdPoints)} points`
                    : cert.cpdName
                }
              />
            )}
            {typeof cert.contentCompletionPct === "number" && (
              <Field label="Content completion" value={`${cert.contentCompletionPct}%`} />
            )}
            {typeof cert.assessmentScorePct === "number" && (
              <Field label="Assessment score" value={`${cert.assessmentScorePct}%`} />
            )}
          </dl>

          {valid && (
            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>
                Issued by Learnify. Anyone with this link can verify authenticity.
              </span>
              <Badge variant="outline" className="ml-auto">Authentic</Badge>
            </div>
          )}

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <Link href="/" className="hover:underline">
              ← Back to Learnify
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
