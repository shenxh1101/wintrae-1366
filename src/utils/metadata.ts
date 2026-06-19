import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as imageSize from 'image-size';
import { MediaFile, FileType, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, COPY_EXTENSIONS, Platform, MediaRulesConfig, DimensionSpec } from '../types';

function findBox(buffer: Buffer, boxType: string, start: number, end: number): { offset: number; size: number } | null {
  let offset = start;
  while (offset < end - 8) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size <= 0 || offset + size > end) break;
    if (type === boxType) return { offset, size };
    offset += size;
  }
  return null;
}

function readMp4Dimensions(filePath: string): { width?: number; height?: number } {
  try {
    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.statSync(filePath).size;

    const header = Buffer.alloc(8);
    let offset = 0;
    while (offset < fileSize - 8) {
      fs.readSync(fd, header, 0, 8, offset);
      const size = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);

      if (size <= 0 || offset + size > fileSize) break;

      if (type === 'moov') {
        const moovBuffer = Buffer.alloc(size);
        fs.readSync(fd, moovBuffer, 0, size, offset);

        const trak = findBox(moovBuffer, 'trak', 8, size);
        if (!trak) { fs.closeSync(fd); return {}; }

        const mdia = findBox(moovBuffer, 'mdia', trak.offset + 8, trak.offset + trak.size);
        if (!mdia) { fs.closeSync(fd); return {}; }

        const minf = findBox(moovBuffer, 'minf', mdia.offset + 8, mdia.offset + mdia.size);
        if (!minf) { fs.closeSync(fd); return {}; }

        const stbl = findBox(moovBuffer, 'stbl', minf.offset + 8, minf.offset + minf.size);
        if (!stbl) { fs.closeSync(fd); return {}; }

        const stsd = findBox(moovBuffer, 'stsd', stbl.offset + 8, stbl.offset + stbl.size);
        if (!stsd) { fs.closeSync(fd); return {}; }

        let cursor = stsd.offset + 8 + 8;
        const numEntries = moovBuffer.readUInt32BE(stsd.offset + 8 + 4);

        for (let i = 0; i < numEntries && cursor < stsd.offset + stsd.size; i++) {
          const entryStart = cursor;
          const entrySize = moovBuffer.readUInt32BE(cursor);
          const entryType = moovBuffer.toString('ascii', cursor + 4, cursor + 8);

          if (['avc1', 'hvc1', 'hev1', 'mp4v', 'av01', 'vp09', 'apcn', 'apch', 'apco', 'apcs'].includes(entryType)) {
            const width = moovBuffer.readUInt16BE(entryStart + 32);
            const height = moovBuffer.readUInt16BE(entryStart + 34);
            if (width > 0 && height > 0) {
              fs.closeSync(fd);
              return { width, height };
            }
          }

          cursor += entrySize;
        }

        fs.closeSync(fd);
        return {};
      }

      offset += size;
    }

    fs.closeSync(fd);
  } catch {
    // parse failed, return empty
  }
  return {};
}

const METADATA_FILE = '.media-metadata.json';

export function getFileType(extension: string): FileType | null {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (COPY_EXTENSIONS.includes(ext)) return 'copy';
  return null;
}

export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function getFileDimensions(filePath: string, fileType: FileType): { width?: number; height?: number } {
  if (fileType === 'image') {
    try {
      const dimensions = imageSize.imageSize(filePath);
      return { width: dimensions.width, height: dimensions.height };
    } catch {
      return {};
    }
  }

  if (fileType === 'video') {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mp4' || ext === '.mov') {
      const dims = readMp4Dimensions(filePath);
      if (dims.width && dims.height) {
        return dims;
      }
    }
    return {};
  }

  return {};
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatDate(date: Date, format: string = 'YYYYMMDD'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day);
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function parseFileName(fileName: string): Partial<MediaFile> {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  const parts = baseName.split('_');
  const result: Partial<MediaFile> = {};

  if (parts.length >= 3) {
    const dateMatch = parts[0].match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateMatch) {
      result.date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }

    const platformPattern = /^(wechat|weibo|douyin|xiaohongshu|bilibili|kuaishou)$/i;
    if (platformPattern.test(parts[1])) {
      result.platform = parts[1].toLowerCase() as Platform;
    }

    if (parts.length >= 3) {
      result.theme = parts.slice(2).join('_');
    }
  }

  return result;
}

export async function loadMetadata(dirPath: string): Promise<Record<string, MediaFile>> {
  const metaPath = path.join(dirPath, METADATA_FILE);
  if (await fs.pathExists(metaPath)) {
    try {
      const data = await fs.readJSON(metaPath);
      const result: Record<string, MediaFile> = {};
      for (const [key, value] of Object.entries(data)) {
        const mf = value as MediaFile;
        result[key] = {
          ...mf,
          createdAt: new Date(mf.createdAt),
          modifiedAt: new Date(mf.modifiedAt)
        };
      }
      return result;
    } catch {
      return {};
    }
  }
  return {};
}

export async function saveMetadata(dirPath: string, files: MediaFile[]): Promise<void> {
  const metaPath = path.join(dirPath, METADATA_FILE);
  const data: Record<string, MediaFile> = {};
  for (const file of files) {
    data[file.id] = file;
  }
  await fs.writeJSON(metaPath, data, { spaces: 2 });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const RULES_FILE = '.media-rules.json';

export async function loadRulesConfig(dirPath: string): Promise<MediaRulesConfig | null> {
  const rulesPath = path.join(dirPath, RULES_FILE);
  if (await fs.pathExists(rulesPath)) {
    try {
      return await fs.readJSON(rulesPath);
    } catch {
      return null;
    }
  }
  return null;
}

export function mergeDimensionSpecs(config: MediaRulesConfig | null, defaults: DimensionSpec[]): DimensionSpec[] {
  if (!config || !config.dimensionRules || config.dimensionRules.length === 0) {
    return defaults;
  }
  const customSpecs: DimensionSpec[] = config.dimensionRules.map(rule => ({
    platform: rule.platform,
    type: rule.type,
    width: rule.width,
    height: rule.height,
    minWidth: rule.minWidth,
    minHeight: rule.minHeight,
    isRatio: rule.isRatio ?? false,
    description: rule.description
  }));
  const customKeys = new Set(customSpecs.map(s => `${s.platform}-${s.type}-${s.width}x${s.height}`));
  const merged = [...customSpecs];
  for (const spec of defaults) {
    const key = `${spec.platform}-${spec.type}-${spec.width}x${spec.height}`;
    if (!customKeys.has(key)) {
      merged.push(spec);
    }
  }
  return merged;
}
