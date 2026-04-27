import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { IdentityForm } from "./identity-form"

export default async function LearnerProfilePage() {
  const session = await auth()
  if (!session?.user) return null

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      nameToBeCalled: true,
      certificateName: true,
      certificateIdNumber: true,
      createdAt: true,
      platformRole: true,
      academyMemberships: {
        select: { role: true, academy: { select: { name: true } } },
      },
      _count: {
        select: {
          certificates: { where: { revokedAt: null } },
          accessGrants: { where: { isActive: true } },
        },
      },
    },
  })

  if (!user) return null

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §3.1 identity. These values are printed on every certificate you
          earn — edit them carefully.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <IdentityForm
            initial={{
              name: user.name,
              nameToBeCalled: user.nameToBeCalled,
              certificateName: user.certificateName,
              certificateIdNumber: user.certificateIdNumber,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Field label="Email" value={user.email} />
          <Field
            label="Member since"
            value={new Date(user.createdAt).toLocaleDateString()}
          />
          <Field
            label="Active enrolments"
            value={String(user._count.accessGrants)}
          />
          <Field
            label="Certificates earned"
            value={String(user._count.certificates)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {user.platformRole !== "NONE" && (
            <div className="flex items-center justify-between">
              <span>Platform</span>
              <Badge>{user.platformRole.replace("_", " ")}</Badge>
            </div>
          )}
          {user.academyMemberships.length === 0 ? (
            <div className="text-muted-foreground">No academy memberships.</div>
          ) : (
            user.academyMemberships.map((m, i) => (
              <div key={i} className="flex items-center justify-between">
                <span>{m.academy.name}</span>
                <Badge variant="outline">{m.role.replace("_", " ")}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
