import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Download, ShieldCheck, XCircle } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Certificate",
  description: "Preview and download your certificate",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CertificateViewPage({ params }: PageProps) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    redirect(`/login?callbackUrl=/certificates/${id}`)
  }

  const cert = await prisma.certificate.findUnique({
    where: { id },
    select: {
      id: true,
      certificateId: true,
      userId: true,
      courseId: true,
      courseName: true,
      instructorName: true,
      certificateName: true,
      nameToBeCalled: true,
      certificateIdNumber: true,
      cpdName: true,
      cpdPoints: true,
      issuedAt: true,
      completionDate: true,
      revokedAt: true,
      revokedReason: true,
      contentCompletionPct: true,
      assessmentScorePct: true,
    },
  })

  if (!cert || cert.userId !== session.user.id) {
    notFound()
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const verifyUrl = `${baseUrl}/verify/${cert.certificateId}`
  const previewUrl = `/api/certificates/${cert.id}/download?format=html`
  const pdfUrl = `/api/certificates/${cert.id}/download`
  const revoked = !!cert.revokedAt

  return (
    <div className="container max-w-4xl py-8">
      <Link
        href="/certificates"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to certificates
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{cert.courseName}</h1>
            {revoked ? (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" /> Revoked
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3 w-3 text-green-600" /> Valid
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Certificate ID: <span className="font-mono">{cert.certificateId}</span>
          </p>
        </div>
        {!revoked && (
          <Button asChild>
            <Link href={pdfUrl} target="_blank">
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Link>
          </Button>
        )}
      </div>

      {revoked && cert.revokedReason && (
        <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Reason for revocation:</strong> {cert.revokedReason}
        </div>
      )}

      <Card className="overflow-hidden mb-6">
        <iframe
          src={previewUrl}
          title={`Certificate ${cert.certificateId}`}
          className="w-full"
          style={{ height: 760, border: 0 }}
        />
      </Card>

      <Card>
        <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
          <Field label="Recipient" value={cert.certificateName ?? cert.nameToBeCalled ?? "—"} />
          <Field label="Known as" value={cert.nameToBeCalled ?? "—"} />
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
          {cert.certificateIdNumber && (
            <Field label="Learner ID" value={cert.certificateIdNumber} />
          )}
          {cert.cpdName && (
            <Field
              label="CPD"
              value={
                cert.cpdPoints ? `${cert.cpdName} · ${Number(cert.cpdPoints)} points` : cert.cpdName
              }
            />
          )}
          {typeof cert.contentCompletionPct === "number" && (
            <Field label="Content completion" value={`${cert.contentCompletionPct}%`} />
          )}
          {typeof cert.assessmentScorePct === "number" && (
            <Field label="Assessment score" value={`${cert.assessmentScorePct}%`} />
          )}
          <div className="sm:col-span-2 pt-2 border-t">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Public verification link
            </dt>
            <dd className="mt-1 text-sm break-all">
              <Link href={`/verify/${cert.certificateId}`} className="text-primary hover:underline">
                {verifyUrl}
              </Link>
            </dd>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
