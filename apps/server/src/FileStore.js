import fs from 'fs/promises';

/**
 * Byte-level storage seam for DocumentService: every file write/delete goes
 * through here, so the backing store is swappable (tests, or a cloud edition
 * writing to object storage) without touching document logic. Paths are still
 * built exclusively by tenantDir.js — this class never constructs them.
 */
export class FileStore {
  /** @param {string} filePath @param {Buffer|string} data */
  async write(filePath, data) {
    await fs.writeFile(filePath, data);
  }

  /** Remove a file if it exists; missing files are not an error. */
  async remove(filePath) {
    await fs.rm(filePath, { force: true });
  }
}
