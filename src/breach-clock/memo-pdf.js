// =============================================================================
// MEMO PDF GENERATOR — phase 1
//
// Returns a Uint8Array of PDF bytes for the breach-notification analysis memo.
// Phase 1 produces a minimal letter-size page with a centered title, the
// generation date, and a placeholder paragraph confirming the tooling.
// Phase 2 will port the full memo content (deadline cards, suppressed
// obligations, jurisdictional counsel notes) into a paginated layout with
// embedded fonts.
// =============================================================================

import { PDFDocument, StandardFonts } from "pdf-lib";

const PAGE_WIDTH = 612;   // 8.5" × 72 DPI
const PAGE_HEIGHT = 792;  // 11"  × 72 DPI
const MARGIN = 72;        // 1"

export async function generateMemoPdf(/* facts, deadlines, suppressed */) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  const title = "Breach Notification Deadline Analysis";
  const titleSize = 22;
  const titleWidth = font.widthOfTextAtSize(title, titleSize);
  const titleY = PAGE_HEIGHT - MARGIN - titleSize;
  page.drawText(title, {
    x: (PAGE_WIDTH - titleWidth) / 2,
    y: titleY,
    size: titleSize,
    font,
  });

  const dateString = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const dateSize = 11;
  const dateWidth = font.widthOfTextAtSize(dateString, dateSize);
  const dateY = titleY - 24;
  page.drawText(dateString, {
    x: (PAGE_WIDTH - dateWidth) / 2,
    y: dateY,
    size: dateSize,
    font,
  });

  const placeholder = "Phase 1 of PDF implementation — full memo content to follow.";
  page.drawText(placeholder, {
    x: MARGIN,
    y: dateY - 60,
    size: 11,
    font,
  });

  return await pdfDoc.save();
}
