import { put } from "@vercel/blob";
import type { StoragePort } from "./ports.ts";

/**
 * Vercel Blob implementation of the storage port. The returned URL is the
 * canonical retrieval handle and is what raw_artifact.storage_key records.
 *
 * Access note: Vercel Blob objects here are public-but-unguessable URLs. That
 * is acceptable for AMFI price files, which are public data republished
 * verbatim. It is NOT acceptable for user statements (Phase 2 CAS PDFs);
 * those need a private store and must not reuse this class as-is.
 */
export class BlobStorage implements StoragePort {
  async put(key: string, payload: Buffer, contentType: string): Promise<string> {
    const res = await put(key, payload, { access: "public", contentType, addRandomSuffix: false });
    return res.url;
  }
}
