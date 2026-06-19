import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { MediaFile, ScanOptions, FILE_TYPE_NAMES } from '../types';
import {
  getFileType,
  calculateFileHash,
  getFileDimensions,
  generateId,
  parseFileName,
  loadMetadata,
  saveMetadata,
  formatFileSize
} from '../utils/metadata';

export async function scanCommand(dirPath: string, options: ScanOptions): Promise<MediaFile[]> {
  const { recursive = true, includeHidden = false } = options;

  console.log(chalk.cyan(`\n🔍 正在扫描目录: ${chalk.bold(dirPath)}`));
  console.log(chalk.gray(`递归: ${recursive ? '是' : '否'} | 包含隐藏文件: ${includeHidden ? '是' : '否'}\n`));

  const absoluteDir = path.resolve(dirPath);
  if (!(await fs.pathExists(absoluteDir))) {
    console.log(chalk.red(`❌ 目录不存在: ${absoluteDir}`));
    process.exit(1);
  }

  const savedMetadata = await loadMetadata(absoluteDir);
  const files: MediaFile[] = [];

  async function processFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath);
    const fileType = getFileType(ext);

    if (!fileType) return;

    const stats = await fs.stat(filePath);
    const baseName = path.basename(filePath);

    const existing = Object.values(savedMetadata).find(
      (m) => m.originalPath === filePath
    );

    let hash: string;
    if (existing && existing.modifiedAt.getTime() === stats.mtime.getTime()) {
      hash = existing.hash;
    } else {
      hash = await calculateFileHash(filePath);
    }

    const dimensions = getFileDimensions(filePath, fileType);
    const parsedInfo = parseFileName(baseName);

    const mediaFile: MediaFile = {
      id: existing?.id || generateId(),
      originalPath: filePath,
      originalName: baseName,
      fileName: baseName,
      fileType,
      extension: ext.toLowerCase(),
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      hash,
      ...dimensions,
      ...parsedInfo,
      campaign: existing?.campaign,
      influencer: existing?.influencer,
      status: existing?.status,
      licenseExpiry: existing?.licenseExpiry,
      isCover: existing?.isCover,
      tags: existing?.tags || [],
      metadata: existing?.metadata || {}
    };

    files.push(mediaFile);
  }

  async function walkDirectory(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith('.')) continue;
      if (entry.name === '.media-metadata.json') continue;

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (recursive) {
          await walkDirectory(fullPath);
        }
      } else if (entry.isFile()) {
        await processFile(fullPath);
      }
    }
  }

  await walkDirectory(absoluteDir);

  await saveMetadata(absoluteDir, files);

  printScanResult(files);

  return files;
}

function printScanResult(files: MediaFile[]): void {
  const table = new Table({
    head: [
      chalk.white('类型'),
      chalk.white('文件名'),
      chalk.white('大小'),
      chalk.white('尺寸'),
      chalk.white('平台'),
      chalk.white('主题')
    ],
    colWidths: [10, 40, 12, 12, 10, 20]
  });

  const typeCount: Record<string, number> = { image: 0, video: 0, copy: 0 };

  for (const file of files) {
    typeCount[file.fileType]++;
    const dimension = file.width && file.height
      ? `${file.width}x${file.height}`
      : '-';

    table.push([
      chalk.green(FILE_TYPE_NAMES[file.fileType]),
      file.fileName,
      formatFileSize(file.size),
      dimension,
      file.platform || '-',
      file.theme || '-'
    ]);
  }

  console.log(table.toString());

  console.log(chalk.cyan(`\n📊 扫描完成！共找到 ${chalk.bold(files.length)} 个素材文件`));
  console.log(chalk.gray(
    `图片: ${typeCount.image} | 视频: ${typeCount.video} | 文案: ${typeCount.copy}`
  ));
  console.log(chalk.gray('元数据已保存到 .media-metadata.json\n'));
}
