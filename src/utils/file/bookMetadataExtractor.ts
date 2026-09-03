import * as Kookit from "../../assets/lib/kookit.min";
import { BookHelper } from "../../assets/lib/kookit.min";
import { ConfigService } from "../../assets/lib/kookit-extra-browser.min";
import { getTextRules } from "../common";
import CoverUtil from "./coverUtil";

export interface ExtractedBookMetadata {
  title: string;
  author: string;
  coverFile: File | null;
}

// Formats whose Kookit renderer returns real bibliographic metadata
// (title/author/description/publisher) via rendition.getMetadata(),
// mirroring the "pdf"/"epub"/"mobi"/"azw"/"azw3"/"fb2" branch of
// BookHelper.generateBook in kookit.min.js.
const METADATA_FORMATS = new Set(["pdf", "epub", "mobi", "azw", "azw3", "fb2"]);

// Comic formats: Kookit only extracts a cover, never a title/author, for
// these - same as the "cbr"/"cbt"/"cbz"/"cb7" branch of generateBook.
const COVER_ONLY_FORMATS = new Set(["cbr", "cbt", "cbz", "cb7"]);

/**
 * Client-side book metadata/cover extraction, factored out of
 * ImportLocal.handleBook (src/components/importLocal/component.tsx) so the
 * admin catalog upload can pre-fill title/author/cover the same way personal
 * import always has - without pulling in handleBook's local-library side
 * effects (MD5 dedupe, DatabaseService.saveRecord, BookUtil.addBook).
 *
 * Returns null when the format has no extractable metadata (txt, md, docx,
 * html, ...) or when parsing fails for any reason - callers should treat
 * that as "fall back to manual entry for this file", not as an error.
 */
export async function extractBookMetadata(
  file: File
): Promise<ExtractedBookMetadata | null> {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (!METADATA_FORMATS.has(extension) && !COVER_ONLY_FORMATS.has(extension)) {
    return null;
  }

  let fileContent: ArrayBuffer;
  try {
    fileContent = await file.arrayBuffer();
  } catch (error) {
    console.error("extractBookMetadata: failed to read file", error);
    return null;
  }

  let rendition: any;
  try {
    rendition = BookHelper.getRendition(
      fileContent,
      {
        format: extension.toUpperCase(),
        readerMode: "",
        charset: "",
        animation: ConfigService.getReaderConfig("animation") || "none",
        convertChinese: ConfigService.getReaderConfig("convertChinese"),
        bookLayout: ConfigService.getReaderConfig("bookLayout"),
        textRules: getTextRules(),
        codeHighlight: ConfigService.getReaderConfig("codeHighlight") || "",
        fullTranslationMode: "no",
        textOrientation: ConfigService.getReaderConfig("textOrientation"),
        parserRegex: "",
        isDarkMode: "no",
        isMobile: "no",
        password: "",
        isScannedPDF: "no",
        isKeepPDFBackground: "no",
      },
      Kookit
    );
  } catch (error) {
    console.error("extractBookMetadata: getRendition failed", error);
    return null;
  }

  if (!rendition) return null;

  let metadata: any;
  try {
    metadata = await rendition.getMetadata();
  } catch (error) {
    console.error("extractBookMetadata: getMetadata failed", error);
    return null;
  }

  if (!metadata) return null;

  const title = (metadata.name || "").toString().trim();
  const author = (metadata.author || "").toString().trim();
  const coverDataUrl: string = metadata.cover || "";

  let coverFile: File | null = null;
  if (coverDataUrl) {
    try {
      const { arrayBuffer, extension: coverExt } =
        await CoverUtil.convertCoverBase64(coverDataUrl);
      coverFile = new File([arrayBuffer], `cover.${coverExt}`, {
        type: `image/${coverExt}`,
      });
    } catch (error) {
      console.error("extractBookMetadata: cover conversion failed", error);
      coverFile = null;
    }
  }

  if (!title && !author && !coverFile) return null;

  return { title, author, coverFile };
}
