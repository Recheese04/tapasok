import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/database/client";

// Uploaded bytes are only reachable through the authorized download routes, never from public/.
// They are stored in the database (stored_files) under a random key, so they survive redeployments: the host's own disk is
// read-only and temporary, which is why uploads used to fail there. The user-supplied file name is metadata only.
// Files saved by older versions on a local disk are still read from STORAGE_DIR when no database copy exists.

// The host refuses request bodies over 4.5 MB, so uploads are capped at 4 MB (next.config.ts allows Server Actions 5 MB).
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "4 MB";

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
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: `The file is larger than ${MAX_UPLOAD_LABEL}. Compress it or split it into smaller files.` };
  if (!kind.test(bytes)) return { ok: false, error: "The file's contents do not match its extension." };
  return { ok: true, mime: kind.mime };
}

const root = () => path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR ?? "./storage");
const pathFor = (key: string) => {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid storage key.");
  return path.join(/* turbopackIgnore: true */ root(), key);
};

/** Stores an upload and returns its new random key. */
export async function saveBytes(bytes: Buffer, mime = "application/octet-stream") {
  const key = randomUUID();
  await db.storedFile.create({ data: { key, content: new Uint8Array(bytes), mime, byteSize: bytes.length } });
  return key;
}

/** The bytes for a key: the database copy, or (older uploads) the file on the local disk. Throws when neither exists. */
export async function readBytes(key: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid storage key.");
  const row = await db.storedFile.findUnique({ where: { key }, select: { content: true } });
  if (row) return Buffer.from(row.content);
  return readFile(/* turbopackIgnore: true */ pathFor(key));
}

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
