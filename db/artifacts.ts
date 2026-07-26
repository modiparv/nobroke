import { gzipSync } from "node:zlib";
import type { StoragePort } from "./ports.ts";

/**
 * Raw-artifact storage beyond the object store.
 *
 * PgArtifactStorage keeps the unmodified upstream payload in Postgres
 * (gzipped bytea in raw_payload) so the archive-before-parse rule holds even
 * when no object store is writable. FallbackStorage prefers the primary
 * (object storage) and falls back, remembering that it did so the caller can
 * surface it as a warning rather than hide it.
 */

interface PoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export class PgArtifactStorage implements StoragePort {
  constructor(private pool: PoolLike) {}

  async put(key: string, payload: Buffer, contentType: string): Promise<string> {
    const storageKey = `pg://raw_payload/${key}`;
    await this.pool.query(
      `insert into raw_payload (storage_key, payload, content_type, encoding, byte_size)
       values ($1, $2, $3, 'gzip', $4)
       on conflict (storage_key) do nothing`,
      [storageKey, gzipSync(payload), contentType, payload.length],
    );
    return storageKey;
  }
}

export class FallbackStorage implements StoragePort {
  /** Set after put() when the primary refused and the fallback stored it. */
  fellBackWith: string | null = null;

  constructor(
    private primary: StoragePort,
    private fallback: StoragePort,
  ) {}

  async put(key: string, payload: Buffer, contentType: string): Promise<string> {
    try {
      return await this.primary.put(key, payload, contentType);
    } catch (err) {
      this.fellBackWith = err instanceof Error ? err.message : String(err);
      return this.fallback.put(key, payload, contentType);
    }
  }
}
