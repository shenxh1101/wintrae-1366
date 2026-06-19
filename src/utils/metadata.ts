import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as imageSize from 'image-size';
import { MediaFile, FileType, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, COPY_EXTENSIONS, Platform } from '../types';

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
