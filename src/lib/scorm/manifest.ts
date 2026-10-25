/**
 * imsmanifest.xml generator for SCORM 1.2 (ADL SCORM 1.2 / IMS CP 1.1.2).
 *
 * Mirrors the manifest shape of alfredang/workplacesafety-scorm: one
 * organization, one item, one `webcontent` resource with
 * `adlcp:scormtype="sco"`, and an explicit `<file>` list so strict LMS
 * importers (Moodle, SCORM Cloud, Cornerstone) can verify every asset.
 */

export type ManifestInput = {
  identifier: string
  organizationIdentifier?: string
  itemIdentifier?: string
  resourceIdentifier?: string
  title: string
  itemTitle?: string
  launchFile: string
  files: string[]
  masteryScore?: number
  /** HH:MM:SS — optional ADL max time allowed. */
  maxTimeAllowed?: string
  version?: string
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Turn free text into a safe IMS identifier (letters, digits, - _ .). */
export function toIdentifier(value: string, prefix = "ID"): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase()
  const body = cleaned.length > 0 ? cleaned.slice(0, 48) : "SCO"
  return /^[A-Za-z_]/.test(body) ? body : `${prefix}-${body}`
}

export function buildManifest(input: ManifestInput): string {
  const orgId = input.organizationIdentifier ?? `${input.identifier}-ORG`
  const itemId = input.itemIdentifier ?? `${input.identifier}-ITEM-01`
  const resId = input.resourceIdentifier ?? `${input.identifier}-RES-01`
  const files = Array.from(new Set([input.launchFile, ...input.files]))
    .map((f) => `      <file href="${xmlEscape(f)}"/>`)
    .join("\n")
  const mastery =
    typeof input.masteryScore === "number"
      ? `        <adlcp:masteryscore>${Math.round(input.masteryScore)}</adlcp:masteryscore>\n`
      : ""
  const maxTime = input.maxTimeAllowed
    ? `        <adlcp:maxtimeallowed>${xmlEscape(input.maxTimeAllowed)}</adlcp:maxtimeallowed>\n`
    : ""

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${xmlEscape(input.identifier)}" version="${xmlEscape(input.version ?? "1.0")}"
          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                              http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                              http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>

  <organizations default="${xmlEscape(orgId)}">
    <organization identifier="${xmlEscape(orgId)}">
      <title>${xmlEscape(input.title)}</title>
      <item identifier="${xmlEscape(itemId)}" identifierref="${xmlEscape(resId)}" isvisible="true">
        <title>${xmlEscape(input.itemTitle ?? input.title)}</title>
${mastery}${maxTime}        <adlcp:datafromlms></adlcp:datafromlms>
      </item>
    </organization>
  </organizations>

  <resources>
    <resource identifier="${xmlEscape(resId)}" type="webcontent" adlcp:scormtype="sco" href="${xmlEscape(input.launchFile)}">
${files}
    </resource>
  </resources>

</manifest>
`
}
