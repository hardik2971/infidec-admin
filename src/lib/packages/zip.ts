/**
 * Structural ZIP validation without extracting anything.
 *
 * Reads only the end-of-central-directory record and the central directory
 * (via byte-range reads), so multi-GB archives are inspected without loading
 * them into memory. Archive contents are never decompressed or executed.
 * Supports ZIP64.
 */

export type RangeReader = (start: number, endInclusive: number) => Promise<Buffer>;

export interface ZipReport {
  entries: number;
  files: number;
  directories: number;
  uncompressedBytes: number;
  encryptedEntries: number;
  topLevel: string[];
  sample: string[];
}

export class ZipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipValidationError";
  }
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const MAX_CENTRAL_DIRECTORY = 64 * 1024 * 1024;
const MAX_ENTRIES = 500_000;

function u64(buf: Buffer, offset: number): number {
  const value = buf.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipValidationError("ZIP64 value out of range.");
  return Number(value);
}

/** Paths that would escape the extraction folder or are absolute. */
function isUnsafePath(name: string): boolean {
  const n = name.replace(/\\/g, "/");
  return n.startsWith("/") || /^[a-zA-Z]:/.test(n) || n.split("/").includes("..");
}

export async function inspectZip(read: RangeReader, size: number): Promise<ZipReport> {
  if (size < 22) throw new ZipValidationError("The file is too small to be a ZIP archive.");

  const head = await read(0, 3);
  const headSig = head.readUInt32LE(0);
  if (headSig !== SIG_LOCAL && headSig !== SIG_EOCD) {
    throw new ZipValidationError("This is not a ZIP file (missing ZIP signature).");
  }

  // EOCD is in the last 22 + up to 65,535 (comment) bytes; keep 20 more for the ZIP64 locator.
  const tailLength = Math.min(size, 22 + 65_535 + 20);
  const tailStart = size - tailLength;
  const tail = await read(tailStart, size - 1);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipValidationError("The ZIP is incomplete or corrupted (no end of central directory).");

  let totalEntries = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);

  const needsZip64 = totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff;
  if (needsZip64) {
    const loc = eocd - 20;
    if (loc < 0 || tail.readUInt32LE(loc) !== SIG_ZIP64_LOCATOR) {
      throw new ZipValidationError("The ZIP64 locator is missing — the archive is corrupted.");
    }
    const z64Offset = u64(tail, loc + 8);
    if (z64Offset + 56 > size) throw new ZipValidationError("The ZIP64 directory points outside the file.");
    const rec = await read(z64Offset, z64Offset + 55);
    if (rec.readUInt32LE(0) !== SIG_ZIP64_EOCD) throw new ZipValidationError("The ZIP64 directory record is invalid.");
    totalEntries = u64(rec, 32);
    cdSize = u64(rec, 40);
    cdOffset = u64(rec, 48);
  }

  if (totalEntries === 0) throw new ZipValidationError("The ZIP archive is empty.");
  if (totalEntries > MAX_ENTRIES) throw new ZipValidationError(`The ZIP has too many entries (${totalEntries}).`);
  if (cdOffset + cdSize > size) throw new ZipValidationError("The central directory points outside the file — the ZIP is truncated.");
  if (cdSize > MAX_CENTRAL_DIRECTORY) throw new ZipValidationError("The ZIP's file index is unusually large.");

  const cd = await read(cdOffset, cdOffset + cdSize - 1);
  const topLevel = new Set<string>();
  const sample: string[] = [];
  let p = 0;
  let files = 0;
  let directories = 0;
  let uncompressedBytes = 0;
  let encryptedEntries = 0;
  let firstLocalOffset = -1;

  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ZipValidationError(`Entry ${i + 1} of ${totalEntries} is damaged — the ZIP is corrupted.`);
    }
    const flags = cd.readUInt16LE(p + 8);
    let uncompressed = cd.readUInt32LE(p + 24);
    const nameLength = cd.readUInt16LE(p + 28);
    const extraLength = cd.readUInt16LE(p + 30);
    const commentLength = cd.readUInt16LE(p + 32);
    let localOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString(flags & 0x0800 ? "utf8" : "latin1", p + 46, p + 46 + nameLength);

    // ZIP64 extended information extra field.
    if (uncompressed === 0xffffffff || localOffset === 0xffffffff) {
      let e = p + 46 + nameLength;
      const end = e + extraLength;
      while (e + 4 <= end) {
        const id = cd.readUInt16LE(e);
        const len = cd.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompressed === 0xffffffff) {
            uncompressed = u64(cd, q);
            q += 8;
          }
          if (cd.readUInt32LE(p + 20) === 0xffffffff) q += 8; // compressed size
          if (localOffset === 0xffffffff) localOffset = u64(cd, q);
          break;
        }
        e += 4 + len;
      }
    }

    if (isUnsafePath(name)) throw new ZipValidationError(`Unsafe path inside the ZIP: "${name}". Re-create the archive with relative paths.`);
    if (localOffset >= cdOffset) throw new ZipValidationError(`Entry "${name}" points outside the archive data.`);
    if (firstLocalOffset < 0 || localOffset < firstLocalOffset) firstLocalOffset = localOffset;

    if (flags & 0x0001) encryptedEntries++;
    if (name.endsWith("/")) directories++;
    else {
      files++;
      uncompressedBytes += uncompressed;
      if (sample.length < 25) sample.push(name);
    }
    const top = name.replace(/\\/g, "/").split("/")[0];
    if (top && topLevel.size < 50) topLevel.add(name.includes("/") ? `${top}/` : top);

    p += 46 + nameLength + extraLength + commentLength;
  }

  if (firstLocalOffset >= 0) {
    const local = await read(firstLocalOffset, firstLocalOffset + 3);
    if (local.readUInt32LE(0) !== SIG_LOCAL) throw new ZipValidationError("The first file header is invalid — the ZIP is corrupted.");
  }

  return {
    entries: totalEntries,
    files,
    directories,
    uncompressedBytes,
    encryptedEntries,
    topLevel: [...topLevel].sort(),
    sample,
  };
}
