import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Uploaded bytes live outside public/ and are only reachable through the authorized download route.
// Files are stored under a random key; the user-supplied name is metadata only and never touches the path.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Kind = { mime: string; test: (b: Buffer) => boolean };
const starts = (b: Buffer, hex: string) => b.subarray(0, hex.length / 2).toString("hex") === hex;
const ZIP = (b: Buffer) => starts(b, "504b0304");
const OLE = (b: Buffer) => starts(b, "d0cf11e0a1b11ae1");
const TEXT = (b: Buffer) => !b.subarray(0, 4096).includes(0);

/** Allowed types: extension -> expected MIME and a magic-byte check, so renamed executables are rejected. */
export const ALLOWED: Record<string, Kind> = {
  pdf: { mime: "application/pdf", test: (b) => starts(b, "25504446") },
  png: { mime: "image/png", test: (b) => starts(b, "89504e47") },
  jpg: { mime: "image/jpeg", test: (b) => starts(b, "ffd8ff") },
  jpeg: { mime: "image/jpeg", test: (b) => starts(b, "ffd8ff") },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", test: ZIP },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", test: ZIP },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", test: ZIP },
  doc: { mime: "application/msword", test: OLE },
  xls: { mime: "application/vnd.ms-excel", test: OLE },
  ppt: { mime: "application/vnd.ms-powerpoint", test: OLE },
  txt: { mime: "text/plain", test: TEXT },
  csv: { mime: "text/csv", test: TEXT },
};

export function checkUpload(fileName: string, bytes: Buffer): { ok: true; mime: string } | { ok: false; error: string } {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const kind = ALLOWED[ext];
  if (!kind) return { ok: false, error: `Files of type .${ext || "?"} are not allowed. Allowed: ${Object.keys(ALLOWED).join(", ")}.` };
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "The file is larger than 10 MB." };
  if (!kind.test(bytes)) return { ok: false, error: "The file's contents do not match its extension." };
  return { ok: true, mime: kind.mime };
}

const root = () => path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR ?? "./storage");
const pathFor = (key: string) => {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid storage key.");
  return path.join(/* turbopackIgnore: true */ root(), key);
};

export async function saveBytes(bytes: Buffer) {
  const key = randomUUID();
  await mkdir(/* turbopackIgnore: true */ root(), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ pathFor(key), bytes, { flag: "wx" });
  return key;
}

export const readBytes = (key: string) => readFile(/* turbopackIgnore: true */ pathFor(key));

/** Safe value for Content-Disposition: strip path separators, control chars and quotes. */
export const safeFileName = (name: string) => name.replace(/[\\/\r\n"]/g, "_").replace(/[^\x20-\x7e]/g, "_").slice(0, 150) || "file";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Profile photos: JPEG or PNG only, verified by magic bytes, up to 2 MB. */
export function checkPhoto(bytes: Buffer): { ok: true; mime: string } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "The photo is empty." };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: "The photo is larger than 2 MB." };
  if (starts(bytes, "ffd8ff")) return { ok: true, mime: "image/jpeg" };
  if (starts(bytes, "89504e47")) return { ok: true, mime: "image/png" };
  return { ok: false, error: "The photo must be a JPG or PNG image." };
}
