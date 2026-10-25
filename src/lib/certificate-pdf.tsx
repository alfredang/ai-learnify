/* eslint-disable jsx-a11y/alt-text -- the Image below is from
   @react-pdf/renderer, not the HTML img element; alt is not part of its API. */
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer"
import QRCode from "qrcode"
import type { CertificateRenderData, CertificateLayoutJson } from "@/lib/certificate-html"

/**
 * Spec §13 — server-side PDF rendering. Mirror of the HTML layout in
 * `src/lib/certificate-html.ts` so what an admin previews matches what a
 * learner downloads. Uses only `@react-pdf/renderer` built-in fonts so we
 * avoid bundling font files or making outbound font requests at render time.
 */
export async function renderCertificatePdf(
  data: CertificateRenderData
): Promise<Buffer> {
  const qrPngDataUrl = await QRCode.toDataURL(data.verifyUrl, {
    margin: 0,
    width: 220,
  })

  const layout =
    (data.template?.layoutJson as CertificateLayoutJson | null) ?? null
  const accent = layout?.accentColor ?? "#1a365d"
  const fontFamily = layout?.fontFamily ?? "serif"
  const heading = fontFamily === "sans" ? "Helvetica-Bold" : "Times-Bold"
  const body = fontFamily === "sans" ? "Helvetica" : "Times-Roman"
  const signatureImageUrl = layout?.signatureImageUrl ?? null
  const watermarkText = layout?.watermarkText ?? null
  const watermarkOpacity = clamp(layout?.watermarkOpacity ?? 0.08, 0.05, 0.25)
  const borderStyle = layout?.borderStyle ?? "solid"
  const borderWidth = borderStyle === "double" ? 6 : borderStyle === "none" ? 0 : 3
  // @react-pdf supports only "solid" | "dashed" | "dotted". Approximate
  // "double" via two stacked solid borders by raising the border width.
  const borderEffectiveStyle = "solid" as const

  const displayName =
    data.certificateName ?? data.nameToBeCalled ?? "Learner"
  const completionDate = new Date(data.completionDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const cpdLine = data.cpdName
    ? `${data.cpdName}${data.cpdPoints ? ` · ${Number(data.cpdPoints)} CPD` : ""}`
    : null
  const signatoryName = data.template?.signatoryName ?? "Academy"
  const signatoryTitle = data.template?.signatoryTitle ?? ""
  const showCalledLine = data.nameToBeCalled && data.nameToBeCalled !== displayName

  const styles = StyleSheet.create({
    page: {
      padding: 30,
      backgroundColor: "#ffffff",
    },
    border: {
      flex: 1,
      borderWidth,
      borderStyle: borderEffectiveStyle,
      borderColor: borderStyle === "none" ? "#ffffff" : accent,
      padding: 36,
      position: "relative",
    },
    borderInner: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderWidth: borderStyle === "double" ? 1 : 0,
      borderStyle: "solid",
      borderColor: accent,
      margin: 3,
    },
    innerBorder: {
      position: "absolute",
      top: 8,
      left: 8,
      right: 8,
      bottom: 8,
      borderWidth: borderStyle === "none" ? 0 : 1,
      borderColor: "#cbd5e0",
    },
    watermark: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    watermarkText: {
      fontFamily: heading,
      fontSize: 80,
      color: accent,
      opacity: watermarkOpacity,
      letterSpacing: 6,
    },
    logos: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      minHeight: 64,
      marginBottom: 16,
    },
    logo: {
      maxHeight: 56,
      maxWidth: 160,
      objectFit: "contain",
    },
    headerBlock: {
      alignItems: "center",
      marginBottom: 18,
    },
    title: {
      fontFamily: heading,
      fontSize: 32,
      color: accent,
    },
    subtitle: {
      fontFamily: body,
      fontSize: 11,
      color: "#718096",
      letterSpacing: 3,
      marginTop: 4,
      textTransform: "uppercase",
    },
    contentBlock: {
      alignItems: "center",
      marginVertical: 14,
    },
    presented: {
      fontFamily: body,
      fontSize: 11,
      color: "#718096",
      letterSpacing: 2,
      marginBottom: 10,
      textTransform: "uppercase",
    },
    recipient: {
      fontFamily: heading,
      fontSize: 32,
      color: "#2d3748",
      marginBottom: 6,
      paddingBottom: 4,
      borderBottomWidth: 2,
      borderBottomColor: "#e2e8f0",
    },
    called: {
      fontFamily: body,
      fontSize: 11,
      color: "#718096",
      fontStyle: "italic",
      marginBottom: 12,
    },
    completion: {
      fontFamily: body,
      fontSize: 12,
      color: "#718096",
      marginBottom: 8,
      marginTop: 6,
    },
    courseName: {
      fontFamily: heading,
      fontSize: 22,
      color: accent,
      marginBottom: 10,
    },
    cpd: {
      fontFamily: body,
      fontSize: 11,
      color: accent,
      backgroundColor: "#ebf4ff",
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 999,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 28,
    },
    sigBlock: {
      flex: 1,
      alignItems: "center",
    },
    sigImage: {
      maxHeight: 40,
      maxWidth: 160,
      objectFit: "contain",
      marginBottom: 4,
    },
    sigLine: {
      width: 180,
      borderTopWidth: 1,
      borderTopColor: "#a0aec0",
      marginBottom: 4,
    },
    sigName: {
      fontFamily: body,
      fontSize: 12,
      fontWeight: 700,
    },
    sigTitle: {
      fontFamily: body,
      fontSize: 10,
      color: "#718096",
    },
    qrBlock: {
      flex: 1,
      alignItems: "center",
    },
    qrImg: {
      width: 90,
      height: 90,
    },
    qrLabel: {
      fontFamily: body,
      fontSize: 8,
      color: "#718096",
      letterSpacing: 1,
      marginTop: 3,
      textTransform: "uppercase",
    },
    dateBlock: {
      flex: 1,
      alignItems: "center",
    },
    dateLabel: {
      fontFamily: body,
      fontSize: 10,
      color: "#718096",
      marginBottom: 2,
    },
    dateValue: {
      fontFamily: body,
      fontSize: 12,
      fontWeight: 700,
    },
    certIdRow: {
      alignItems: "center",
      marginTop: 18,
    },
    certIdText: {
      fontFamily: body,
      fontSize: 9,
      color: "#a0aec0",
      letterSpacing: 0.5,
    },
  })

  // Suppress @react-pdf font-loading warnings for the built-in fonts; we
  // never call Font.register so any logged warning would be a deps issue,
  // not us.
  Font.registerHyphenationCallback((word) => [word])

  const Doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          <View style={styles.innerBorder} />

          {watermarkText ? (
            <View style={styles.watermark}>
              <Text style={styles.watermarkText}>{watermarkText.toUpperCase()}</Text>
            </View>
          ) : null}

          <View style={styles.logos}>
            {data.template?.primaryLogoUrl ? (
              <Image src={data.template.primaryLogoUrl} style={styles.logo} />
            ) : (
              <View />
            )}
            {data.template?.secondaryLogoUrl ? (
              <Image src={data.template.secondaryLogoUrl} style={styles.logo} />
            ) : (
              <View />
            )}
          </View>

          <View style={styles.headerBlock}>
            <Text style={styles.title}>Certificate of Completion</Text>
            <Text style={styles.subtitle}>Professional Development</Text>
          </View>

          <View style={styles.contentBlock}>
            <Text style={styles.presented}>This is to certify that</Text>
            <Text style={styles.recipient}>{displayName}</Text>
            {showCalledLine ? (
              <Text style={styles.called}>known as {data.nameToBeCalled}</Text>
            ) : null}
            <Text style={styles.completion}>has successfully completed the course</Text>
            <Text style={styles.courseName}>{data.courseName}</Text>
            {cpdLine ? <Text style={styles.cpd}>{cpdLine}</Text> : null}
          </View>

          <View style={styles.footer}>
            <View style={styles.sigBlock}>
              {signatureImageUrl ? (
                <Image src={signatureImageUrl} style={styles.sigImage} />
              ) : null}
              <View style={styles.sigLine} />
              <Text style={styles.sigName}>{signatoryName}</Text>
              {signatoryTitle ? (
                <Text style={styles.sigTitle}>{signatoryTitle}</Text>
              ) : null}
            </View>

            <View style={styles.qrBlock}>
              <Image src={qrPngDataUrl} style={styles.qrImg} />
              <Text style={styles.qrLabel}>Scan to verify</Text>
            </View>

            <View style={styles.dateBlock}>
              <Text style={styles.dateLabel}>Date of Completion</Text>
              <Text style={styles.dateValue}>{completionDate}</Text>
            </View>
          </View>

          <View style={styles.certIdRow}>
            <Text style={styles.certIdText}>
              Certificate ID: {data.certificateId}
            </Text>
            {data.certificateIdNumber ? (
              <Text style={styles.certIdText}>
                Learner ID: {data.certificateIdNumber}
              </Text>
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  )

  const blob = await pdf(Doc).toBlob()
  const arrayBuffer = await blob.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
