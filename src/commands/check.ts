import * as path from 'path';
import * as chalk from 'chalk';
import * as Table from 'cli-table3';
import {
  MediaFile,
  CheckOptions,
  CheckResult,
  DIMENSION_SPECS,
  PLATFORM_NAMES,
  FILE_TYPE_NAMES
} from '../types';
import { loadMetadata, formatFileSize } from '../utils/metadata';

export async function checkCommand(
  dirPath: string,
  options: CheckOptions
): Promise<CheckResult> {
  const {
    checkCover = true,
    checkDimensions = true,
    checkDuplicates = true,
    checkLicense = true,
    platform
  } = options;

  console.log(chalk.cyan(`\n🔍 正在执行合规检查...`));
  const checks = [];
  if (checkCover) checks.push('封面检查');
  if (checkDimensions) checks.push('尺寸检查');
  if (checkDuplicates) checks.push('重复检查');
  if (checkLicense) checks.push('授权检查');
  console.log(chalk.gray(`检查项目: ${checks.join(' | ')}\n`));

  const absoluteDir = path.resolve(dirPath);
  const savedMetadata = await loadMetadata(absoluteDir);
  let files = Object.values(savedMetadata);

  if (files.length === 0) {
    console.log(chalk.yellow('⚠️  未找到素材文件，请先运行 scan 命令'));
    return {
      missingCover: [],
      invalidDimensions: [],
      duplicates: [],
      expiredLicense: []
    };
  }

  if (platform) {
    files = files.filter(f => f.platform === platform);
    console.log(chalk.gray(`筛选平台: ${PLATFORM_NAMES[platform]}\n`));
  }

  const result: CheckResult = {
    missingCover: [],
    invalidDimensions: [],
    duplicates: [],
    expiredLicense: []
  };

  if (checkCover) {
    result.missingCover = checkMissingCover(files);
  }

  if (checkDimensions) {
    result.invalidDimensions = checkInvalidDimensions(files);
  }

  if (checkDuplicates) {
    result.duplicates = checkDuplicates(files);
  }

  if (checkLicense) {
    result.expiredLicense = checkExpiredLicense(files);
  }

  printCheckResult(result, files.length);

  return result;
}

function checkMissingCover(files: MediaFile[]): MediaFile[] {
  const byPlatformAndTheme: Record<string, MediaFile[]> = {};

  for (const file of files) {
    if (!file.platform) continue;
    const key = `${file.platform}-${file.theme || 'default'}`;
    if (!byPlatformAndTheme[key]) {
      byPlatformAndTheme[key] = [];
    }
    byPlatformAndTheme[key].push(file);
  }

  const missing: MediaFile[] = [];

  for (const [key, group] of Object.entries(byPlatformAndTheme)) {
    const hasCover = group.some(f => f.isCover && f.fileType === 'image');
    if (!hasCover) {
      const nonCoverImages = group.filter(f => f.fileType === 'image' && !f.isCover);
      missing.push(...nonCoverImages.slice(0, 3));
    }
  }

  return missing;
}

function checkInvalidDimensions(
  files: MediaFile[]
): Array<{ file: MediaFile; expected: string; actual: string }> {
  const invalid: Array<{ file: MediaFile; expected: string; actual: string }> = [];

  for (const file of files) {
    if (!file.platform || !file.width || !file.height) continue;
    if (file.fileType === 'copy') continue;

    const specs = DIMENSION_SPECS.filter(
      s => s.platform === file.platform && s.type === file.fileType
    );

    if (specs.length === 0) continue;

    let isMatch = false;
    let expectedDesc = '';

    for (const spec of specs) {
      expectedDesc += `${spec.description} 或 `;
      if (spec.width > 10 && spec.height > 10) {
        if (file.width === spec.width && file.height === spec.height) {
          isMatch = true;
          break;
        }
      } else {
        const ratio = file.width / file.height;
        const specRatio = spec.width / spec.height;
        if (Math.abs(ratio - specRatio) < 0.05) {
          isMatch = true;
          break;
        }
      }
    }

    if (!isMatch) {
      invalid.push({
        file,
        expected: expectedDesc.slice(0, -3),
        actual: `${file.width}x${file.height}`
      });
    }
  }

  return invalid;
}

function checkDuplicates(files: MediaFile[]): MediaFile[][] {
  const byHash: Record<string, MediaFile[]> = {};

  for (const file of files) {
    if (!byHash[file.hash]) {
      byHash[file.hash] = [];
    }
    byHash[file.hash].push(file);
  }

  return Object.values(byHash).filter(group => group.length > 1);
}

function checkExpiredLicense(files: MediaFile[]): MediaFile[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return files.filter(file => {
    if (!file.licenseExpiry) return false;
    const expiryDate = new Date(file.licenseExpiry);
    return expiryDate <= today;
  });
}

function printCheckResult(result: CheckResult, totalFiles: number): void {
  const issues: string[] = [];

  if (result.missingCover.length > 0) {
    issues.push(chalk.red(`❌ ${result.missingCover.length} 个素材缺少封面`));
    const table = new Table({
      head: [chalk.white('文件名'), chalk.white('平台'), chalk.white('类型')],
      colWidths: [40, 15, 10]
    });
    for (const file of result.missingCover) {
      table.push([
        file.fileName,
        file.platform ? PLATFORM_NAMES[file.platform] : '-',
        FILE_TYPE_NAMES[file.fileType]
      ]);
    }
    console.log(chalk.red('\n📋 缺少封面的素材:'));
    console.log(table.toString());
  } else {
    issues.push(chalk.green('✅ 封面检查通过'));
  }

  if (result.invalidDimensions.length > 0) {
    issues.push(chalk.red(`❌ ${result.invalidDimensions.length} 个素材尺寸不合规`));
    const table = new Table({
      head: [
        chalk.white('文件名'),
        chalk.white('实际尺寸'),
        chalk.white('期望尺寸')
      ],
      colWidths: [35, 15, 40]
    });
    for (const item of result.invalidDimensions) {
      table.push([
        item.file.fileName,
        chalk.yellow(item.actual),
        chalk.cyan(item.expected)
      ]);
    }
    console.log(chalk.red('\n📐 尺寸不合规的素材:'));
    console.log(table.toString());
  } else {
    issues.push(chalk.green('✅ 尺寸检查通过'));
  }

  if (result.duplicates.length > 0) {
    const dupCount = result.duplicates.reduce((sum, g) => sum + g.length, 0);
    issues.push(chalk.red(`❌ 发现 ${result.duplicates.length} 组重复文件 (共 ${dupCount} 个文件)`));
    const table = new Table({
      head: [
        chalk.white('组号'),
        chalk.white('文件名'),
        chalk.white('大小'),
        chalk.white('路径')
      ],
      colWidths: [8, 30, 12, 40]
    });
    result.duplicates.forEach((group, idx) => {
      group.forEach((file, fileIdx) => {
        table.push([
          fileIdx === 0 ? chalk.cyan(`#${idx + 1}`) : '',
          file.fileName,
          formatFileSize(file.size),
          file.originalPath
        ]);
      });
    });
    console.log(chalk.red('\n🔄 重复文件:'));
    console.log(table.toString());
  } else {
    issues.push(chalk.green('✅ 重复检查通过'));
  }

  if (result.expiredLicense.length > 0) {
    issues.push(chalk.red(`❌ ${result.expiredLicense.length} 个素材授权已过期`));
    const table = new Table({
      head: [
        chalk.white('文件名'),
        chalk.white('授权到期'),
        chalk.white('达人')
      ],
      colWidths: [40, 15, 15]
    });
    for (const file of result.expiredLicense) {
      table.push([
        file.fileName,
        chalk.red(file.licenseExpiry || '-'),
        file.influencer || '-'
      ]);
    }
    console.log(chalk.red('\n⏰ 授权已过期的素材:'));
    console.log(table.toString());
  } else {
    issues.push(chalk.green('✅ 授权检查通过'));
  }

  console.log('\n' + '='.repeat(50));
  console.log(chalk.cyan(`\n📊 检查完成，共检查 ${totalFiles} 个文件`));
  for (const issue of issues) {
    console.log(`  ${issue}`);
  }

  const totalIssues =
    result.missingCover.length +
    result.invalidDimensions.length +
    result.duplicates.reduce((s, g) => s + g.length, 0) +
    result.expiredLicense.length;

  if (totalIssues > 0) {
    console.log(chalk.yellow(`\n⚠️  共发现 ${totalIssues} 个问题需要处理\n`));
  } else {
    console.log(chalk.green('\n🎉 所有检查通过！素材合规性良好\n'));
  }
}
