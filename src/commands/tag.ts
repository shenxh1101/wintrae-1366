import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { MediaFile, TagOptions, PLATFORM_NAMES, STATUS_NAMES, FILE_TYPE_NAMES, Platform, UsageStatus } from '../types';
import { loadMetadata, saveMetadata, formatFileSize } from '../utils/metadata';

export async function tagCommand(
  dirPath: string,
  filePattern: string | undefined,
  options: TagOptions
): Promise<MediaFile[]> {
  const {
    campaign,
    influencer,
    status,
    platform,
    addTags = [],
    removeTags = [],
    licenseExpiry,
    isCover
  } = options;

  console.log(chalk.cyan(`\n🏷️  正在为素材添加标签...`));

  const hasUpdate =
    campaign !== undefined ||
    influencer !== undefined ||
    status !== undefined ||
    platform !== undefined ||
    addTags.length > 0 ||
    removeTags.length > 0 ||
    licenseExpiry !== undefined ||
    isCover !== undefined;

  if (!hasUpdate) {
    console.log(chalk.yellow('⚠️  请指定要更新的标签或属性，使用 --help 查看帮助'));
    process.exit(1);
  }

  const absoluteDir = path.resolve(dirPath);
  const savedMetadata = await loadMetadata(absoluteDir);
  const files = Object.values(savedMetadata);

  if (files.length === 0) {
    console.log(chalk.yellow('⚠️  未找到素材文件，请先运行 scan 命令'));
    return files;
  }

  const targetFiles = filePattern
    ? files.filter(f => f.fileName.includes(filePattern) || f.originalPath.includes(filePattern))
    : files;

  if (targetFiles.length === 0) {
    console.log(chalk.yellow(`⚠️  未找到匹配 "${filePattern}" 的文件`));
    return files;
  }

  const updatedFiles: MediaFile[] = [];

  for (const file of targetFiles) {
    const updated: MediaFile = { ...file };

    if (campaign !== undefined) {
      updated.campaign = campaign || undefined;
    }
    if (influencer !== undefined) {
      updated.influencer = influencer || undefined;
    }
    if (status !== undefined) {
      updated.status = status;
    }
    if (platform !== undefined) {
      updated.platform = platform || undefined;
    }
    if (licenseExpiry !== undefined) {
      updated.licenseExpiry = licenseExpiry || undefined;
    }
    if (isCover !== undefined) {
      updated.isCover = isCover;
    }
    if (addTags.length > 0) {
      const newTags = [...new Set([...updated.tags, ...addTags])];
      updated.tags = newTags;
    }
    if (removeTags.length > 0) {
      updated.tags = updated.tags.filter(t => !removeTags.includes(t));
    }

    updatedFiles.push(updated);
  }

  const unchangedFiles = files.filter(
    f => !targetFiles.some(t => t.id === f.id)
  );
  const finalFiles = [...updatedFiles, ...unchangedFiles];

  await saveMetadata(absoluteDir, finalFiles);

  printTagResult(updatedFiles, options);

  return finalFiles;
}

function printTagResult(files: MediaFile[], options: TagOptions): void {
  const table = new Table({
    head: [
      chalk.white('文件名'),
      chalk.white('活动'),
      chalk.white('达人'),
      chalk.white('状态'),
      chalk.white('标签')
    ],
    colWidths: [35, 15, 15, 12, 30]
  });

  for (const file of files) {
    table.push([
      file.fileName,
      file.campaign || '-',
      file.influencer || '-',
      file.status ? chalk.green(STATUS_NAMES[file.status]) : '-',
      file.tags.length > 0 ? file.tags.join(', ') : '-'
    ]);
  }

  console.log(table.toString());

  console.log(chalk.cyan(`\n✅ 已为 ${chalk.bold(files.length)} 个文件更新标签`));

  const updates: string[] = [];
  if (options.campaign !== undefined) updates.push(`活动: ${options.campaign || '清除'}`);
  if (options.influencer !== undefined) updates.push(`达人: ${options.influencer || '清除'}`);
  if (options.status !== undefined) updates.push(`状态: ${STATUS_NAMES[options.status]}`);
  if (options.platform !== undefined) updates.push(`平台: ${options.platform ? PLATFORM_NAMES[options.platform] : '清除'}`);
  if (options.addTags && options.addTags.length > 0) updates.push(`添加标签: ${options.addTags.join(', ')}`);
  if (options.removeTags && options.removeTags.length > 0) updates.push(`移除标签: ${options.removeTags.join(', ')}`);
  if (options.licenseExpiry !== undefined) updates.push(`授权到期: ${options.licenseExpiry || '清除'}`);
  if (options.isCover !== undefined) updates.push(`封面: ${options.isCover ? '是' : '否'}`);

  for (const update of updates) {
    console.log(chalk.gray(`  - ${update}`));
  }

  console.log();
}

export async function importCsvCommand(
  dirPath: string,
  csvFilePath: string
): Promise<void> {
  console.log(chalk.cyan(`\n📥 正在从 CSV 批量导入标签...`));

  const absoluteDir = path.resolve(dirPath);
  const absoluteCsv = path.resolve(csvFilePath);

  if (!await fs.pathExists(absoluteCsv)) {
    console.log(chalk.red(`❌ CSV 文件不存在: ${absoluteCsv}`));
    process.exit(1);
  }

  const savedMetadata = await loadMetadata(absoluteDir);
  const files = Object.values(savedMetadata);

  if (files.length === 0) {
    console.log(chalk.yellow('⚠️  未找到素材文件，请先运行 scan 命令'));
    return;
  }

  const csvContent = await fs.readFile(absoluteCsv, 'utf-8');
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());

  if (lines.length < 2) {
    console.log(chalk.red('❌ CSV 文件为空或缺少数据行'));
    return;
  }

  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const fileNameIdx = headers.findIndex(h => h === 'filename' || h === '文件名' || h === 'name');
  const platformIdx = headers.findIndex(h => h === 'platform' || h === '平台');
  const campaignIdx = headers.findIndex(h => h === 'campaign' || h === '活动');
  const influencerIdx = headers.findIndex(h => h === 'influencer' || h === '达人');
  const statusIdx = headers.findIndex(h => h === 'status' || h === '状态');
  const licenseIdx = headers.findIndex(h => h === 'licenseexpiry' || h === '授权到期' || h === '授权日期');

  if (fileNameIdx === -1) {
    console.log(chalk.red('❌ CSV 必须包含"文件名"列 (filename / 文件名 / name)'));
    return;
  }

  const matched: Array<{ line: number; fileName: string; file: MediaFile; updates: Record<string, string> }> = [];
  const unmatched: Array<{ line: number; fileName: string; updates: Record<string, string> }> = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const fileName = (fields[fileNameIdx] || '').trim();
    if (!fileName) continue;

    const updates: Record<string, string> = {};
    if (platformIdx !== -1 && fields[platformIdx]) updates.platform = fields[platformIdx].trim();
    if (campaignIdx !== -1 && fields[campaignIdx]) updates.campaign = fields[campaignIdx].trim();
    if (influencerIdx !== -1 && fields[influencerIdx]) updates.influencer = fields[influencerIdx].trim();
    if (statusIdx !== -1 && fields[statusIdx]) updates.status = fields[statusIdx].trim();
    if (licenseIdx !== -1 && fields[licenseIdx]) updates.licenseExpiry = fields[licenseIdx].trim();

    const targetFile = files.find(f =>
      f.fileName === fileName || f.fileName.includes(fileName) || f.originalName.includes(fileName)
    );

    if (targetFile) {
      matched.push({ line: i + 1, fileName, file: targetFile, updates });
    } else {
      unmatched.push({ line: i + 1, fileName, updates });
    }
  }

  console.log(chalk.gray(`CSV 共 ${lines.length - 1} 行数据`));
  console.log(chalk.gray(`匹配成功: ${matched.length} 行`));
  if (unmatched.length > 0) {
    console.log(chalk.yellow(`未匹配: ${unmatched.length} 行`));
  }
  console.log();

  const updatedFiles: MediaFile[] = [];
  for (const match of matched) {
    const updated: MediaFile = { ...match.file };

    if (match.updates.platform) {
      const p = match.updates.platform as Platform;
      if (PLATFORM_NAMES[p as Platform]) {
        updated.platform = p;
      }
    }
    if (match.updates.campaign) {
      updated.campaign = match.updates.campaign;
    }
    if (match.updates.influencer) {
      updated.influencer = match.updates.influencer;
    }
    if (match.updates.status) {
      const validStatuses: UsageStatus[] = ['draft', 'pending', 'published', 'archived'];
      if (validStatuses.includes(match.updates.status as UsageStatus)) {
        updated.status = match.updates.status as UsageStatus;
      }
    }
    if (match.updates.licenseExpiry) {
      updated.licenseExpiry = match.updates.licenseExpiry;
    }

    updatedFiles.push(updated);
  }

  const unchangedFiles = files.filter(
    f => !updatedFiles.some(u => u.id === f.id)
  );
  const finalFiles = [...updatedFiles, ...unchangedFiles];

  await saveMetadata(absoluteDir, finalFiles);

  if (updatedFiles.length > 0) {
    const table = new Table({
      head: [
        chalk.white('文件名'),
        chalk.white('平台'),
        chalk.white('活动'),
        chalk.white('达人'),
        chalk.white('状态'),
        chalk.white('授权到期')
      ],
      colWidths: [30, 10, 15, 15, 10, 12]
    });

    for (const file of updatedFiles) {
      table.push([
        file.fileName,
        file.platform ? PLATFORM_NAMES[file.platform] : '-',
        file.campaign || '-',
        file.influencer || '-',
        file.status ? STATUS_NAMES[file.status] : '-',
        file.licenseExpiry || '-'
      ]);
    }

    console.log(chalk.green(`✅ 已更新 ${updatedFiles.length} 个文件的标签:`));
    console.log(table.toString());
  }

  if (unmatched.length > 0) {
    console.log(chalk.yellow(`\n⚠️  以下 ${unmatched.length} 行未匹配到文件:`));
    const table = new Table({
      head: [chalk.white('行号'), chalk.white('文件名'), chalk.white('待导入内容')],
      colWidths: [8, 30, 45]
    });

    for (const item of unmatched) {
      const details = Object.entries(item.updates)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      table.push([
        String(item.line),
        chalk.yellow(item.fileName),
        chalk.gray(details || '-')
      ]);
    }

    console.log(table.toString());
  }

  console.log();
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

export async function listTagsCommand(dirPath: string): Promise<void> {
  const absoluteDir = path.resolve(dirPath);
  const savedMetadata = await loadMetadata(absoluteDir);
  const files = Object.values(savedMetadata);

  if (files.length === 0) {
    console.log(chalk.yellow('⚠️  未找到素材文件，请先运行 scan 命令'));
    return;
  }

  console.log(chalk.cyan(`\n📋 所有文件标签列表 (共 ${files.length} 个文件)\n`));

  const table = new Table({
    head: [
      chalk.white('类型'),
      chalk.white('文件名'),
      chalk.white('平台'),
      chalk.white('活动'),
      chalk.white('达人'),
      chalk.white('状态'),
      chalk.white('封面'),
      chalk.white('授权到期'),
      chalk.white('自定义标签')
    ],
    colWidths: [8, 25, 10, 12, 12, 10, 8, 12, 20]
  });

  for (const file of files) {
    table.push([
      FILE_TYPE_NAMES[file.fileType],
      file.fileName,
      file.platform ? PLATFORM_NAMES[file.platform] : '-',
      file.campaign || '-',
      file.influencer || '-',
      file.status ? STATUS_NAMES[file.status] : '-',
      file.isCover ? '✅' : '-',
      file.licenseExpiry || '-',
      file.tags.length > 0 ? file.tags.join(', ') : '-'
    ]);
  }

  console.log(table.toString());
  console.log();

  const allTags = new Set<string>();
  const campaigns = new Set<string>();
  const influencers = new Set<string>();

  for (const file of files) {
    file.tags.forEach(t => allTags.add(t));
    if (file.campaign) campaigns.add(file.campaign);
    if (file.influencer) influencers.add(file.influencer);
  }

  console.log(chalk.cyan('📊 标签统计:'));
  console.log(chalk.gray(`  活动 (${campaigns.size}): ${[...campaigns].join(', ') || '无'}`));
  console.log(chalk.gray(`  达人 (${influencers.size}): ${[...influencers].join(', ') || '无'}`));
  console.log(chalk.gray(`  自定义标签 (${allTags.size}): ${[...allTags].join(', ') || '无'}\n`));
}
