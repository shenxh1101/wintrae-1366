import * as fs from 'fs-extra';
import * as path from 'path';
import * as chalk from 'chalk';
import * as Table from 'cli-table3';
import * as inquirer from 'inquirer';
import { MediaFile, RenameOptions, PLATFORM_NAMES, FILE_TYPE_NAMES } from '../types';
import {
  loadMetadata,
  saveMetadata,
  formatDate,
  sanitizeFileName,
  formatFileSize
} from '../utils/metadata';

interface RenamePlan {
  file: MediaFile;
  oldName: string;
  newName: string;
  newPath: string;
}

export async function renameCommand(dirPath: string, options: RenameOptions): Promise<MediaFile[]> {
  const {
    dateFormat = 'YYYYMMDD',
    separator = '_',
    preview = false,
    platform,
    theme
  } = options;

  console.log(chalk.cyan(`\n✏️  正在重命名素材文件...`));
  console.log(chalk.gray(`日期格式: ${dateFormat} | 分隔符: ${separator} | 预览模式: ${preview ? '是' : '否'}\n`));

  const absoluteDir = path.resolve(dirPath);
  const savedMetadata = await loadMetadata(absoluteDir);
  const files = Object.values(savedMetadata);

  if (files.length === 0) {
    console.log(chalk.yellow('⚠️  未找到素材文件，请先运行 scan 命令'));
    return files;
  }

  const plans: RenamePlan[] = [];

  for (const file of files) {
    const fileDate = file.date
      ? new Date(file.date)
      : file.createdAt;
    const dateStr = formatDate(fileDate, dateFormat);
    const filePlatform = platform || file.platform;
    const fileTheme = theme || file.theme || '未分类';

    if (!filePlatform) {
      console.log(chalk.yellow(`⚠️  跳过 ${file.fileName}：未指定平台，请使用 --platform 参数或先运行 tag 命令`));
      continue;
    }

    const baseName = sanitizeFileName(
      [dateStr, filePlatform, fileTheme].join(separator)
    );

    let newName = baseName + file.extension;
    let newPath = path.join(path.dirname(file.originalPath), newName);

    let counter = 1;
    const usedNames = plans.map(p => p.newPath);
    while (
      (await fs.pathExists(newPath) && newPath !== file.originalPath) ||
      usedNames.includes(newPath)
    ) {
      newName = `${baseName}${separator}${counter}${file.extension}`;
      newPath = path.join(path.dirname(file.originalPath), newName);
      counter++;
    }

    if (newPath !== file.originalPath) {
      plans.push({ file, oldName: file.fileName, newName, newPath });
    }
  }

  if (plans.length === 0) {
    console.log(chalk.green('✅ 所有文件已经符合命名规范，无需重命名'));
    return files;
  }

  printRenamePlans(plans);

  if (preview) {
    console.log(chalk.yellow('\n⚠️  预览模式，未执行实际重命名操作'));
    return files;
  }

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `确认重命名以上 ${plans.length} 个文件？`,
      default: false
    }
  ]);

  if (!answers.confirm) {
    console.log(chalk.yellow('已取消重命名操作'));
    return files;
  }

  const updatedFiles: MediaFile[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const plan of plans) {
    try {
      await fs.rename(plan.file.originalPath, plan.newPath);

      const updatedFile: MediaFile = {
        ...plan.file,
        fileName: plan.newName,
        originalPath: plan.newPath,
        date: plan.file.date || formatDate(plan.file.createdAt, 'YYYY-MM-DD'),
        platform: (platform || plan.file.platform)!,
        theme: theme || plan.file.theme || '未分类'
      };

      updatedFiles.push(updatedFile);
      successCount++;
      console.log(chalk.green(`✅ ${plan.oldName} → ${plan.newName}`));
    } catch (error) {
      failCount++;
      console.log(chalk.red(`❌ ${plan.oldName} 重命名失败: ${error}`));
      updatedFiles.push(plan.file);
    }
  }

  const unchangedFiles = files.filter(
    f => !plans.some(p => p.file.id === f.id)
  );
  const finalFiles = [...updatedFiles, ...unchangedFiles];

  await saveMetadata(absoluteDir, finalFiles);

  console.log(chalk.cyan(`\n📊 重命名完成！成功: ${successCount} | 失败: ${failCount}`));

  return finalFiles;
}

function printRenamePlans(plans: RenamePlan[]): void {
  const table = new Table({
    head: [
      chalk.white('类型'),
      chalk.white('原文件名'),
      chalk.white('新文件名'),
      chalk.white('大小')
    ],
    colWidths: [10, 35, 35, 12]
  });

  for (const plan of plans) {
    table.push([
      chalk.green(FILE_TYPE_NAMES[plan.file.fileType]),
      plan.oldName,
      chalk.yellow(plan.newName),
      formatFileSize(plan.file.size)
    ]);
  }

  console.log(table.toString());

  const byPlatform: Record<string, number> = {};
  for (const plan of plans) {
    const p = plan.file.platform || '未指定';
    byPlatform[p] = (byPlatform[p] || 0) + 1;
  }

  console.log(chalk.cyan(`\n📋 计划重命名 ${plans.length} 个文件`));
  for (const [platform, count] of Object.entries(byPlatform)) {
    const name = PLATFORM_NAMES[platform as keyof typeof PLATFORM_NAMES] || platform;
    console.log(chalk.gray(`  ${name}: ${count} 个`));
  }
}
