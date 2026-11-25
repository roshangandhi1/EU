import { get, put } from "@vercel/blob";
import type { BlobStore } from "./files";

/** Private Vercel Blob store (BLOB_READ_WRITE_TOKEN, production only). */
export const vercelBlobs: BlobStore = {
  async put(path, bytes, mime) {
    await put(path, Buffer.from(bytes), { access: "private", contentType: mime, addRandomSuffix: false, allowOverwrite: false });
  },
  async get(path) {
    const r = await get(path, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return { stream: r.stream, mime: r.blob.contentType };
  },
};

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
