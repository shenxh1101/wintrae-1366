import * as path from 'path';
import * as chalk from 'chalk';
import * as Table from 'cli-table3';
import { MediaFile, TagOptions, PLATFORM_NAMES, STATUS_NAMES, FILE_TYPE_NAMES } from '../types';
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

  printTagResult(targetFiles, options);

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
  if (options.addTags.length > 0) updates.push(`添加标签: ${options.addTags.join(', ')}`);
  if (options.removeTags.length > 0) updates.push(`移除标签: ${options.removeTags.join(', ')}`);
  if (options.licenseExpiry !== undefined) updates.push(`授权到期: ${options.licenseExpiry || '清除'}`);
  if (options.isCover !== undefined) updates.push(`封面: ${options.isCover ? '是' : '否'}`);

  for (const update of updates) {
    console.log(chalk.gray(`  - ${update}`));
  }

  console.log();
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
