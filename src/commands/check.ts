import * as path from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  MediaFile,
  CheckOptions,
  CheckResult,
  InvalidDimensionItem,
  DIMENSION_SPECS,
  PLATFORM_NAMES,
  FILE_TYPE_NAMES,
  DimensionSpec,
  MediaRulesConfig
} from '../types';
import { loadMetadata, formatFileSize, loadRulesConfig, mergeDimensionSpecs } from '../utils/metadata';

export async function checkCommand(
  dirPath: string,
  options: CheckOptions
): Promise<CheckResult> {
  const {
    checkCover = true,
    checkDimensions = true,
    checkDuplicates = true,
    checkLicense = true,
    platform,
    requiredTags
  } = options;

  console.log(chalk.cyan(`\n🔍 正在执行合规检查...`));
  const checks: string[] = [];
  if (checkCover) checks.push('封面检查');
  if (checkDimensions) checks.push('尺寸检查');
  if (checkDuplicates) checks.push('重复检查');
  if (checkLicense) checks.push('授权检查');
  if (requiredTags && requiredTags.length > 0) checks.push('必填标签检查');
  console.log(chalk.gray(`检查项目: ${checks.join(' | ')}\n`));

  const absoluteDir = path.resolve(dirPath);
  const savedMetadata = await loadMetadata(absoluteDir);
  let files = Object.values(savedMetadata);

  if (files.length === 0) {
    console.log(chalk.yellow('⚠️  未找到素材文件，请先运行 scan 命令'));
    return {
      missingCover: [],
      invalidDimensions: [],
      missingDimensions: [],
      duplicates: [],
      expiredLicense: [],
      missingRequiredTags: [],
      passedFiles: []
    };
  }

  if (platform) {
    files = files.filter(f => f.platform === platform);
    console.log(chalk.gray(`筛选平台: ${PLATFORM_NAMES[platform]}\n`));
  }

  const rulesConfig = await loadRulesConfig(absoluteDir);
  const effectiveSpecs = mergeDimensionSpecs(rulesConfig, DIMENSION_SPECS);
  const licenseRemindDays = rulesConfig?.licenseRemindDays ?? 30;
  const effectiveRequiredTags = requiredTags && requiredTags.length > 0
    ? requiredTags
    : (rulesConfig?.requiredTags ?? []);

  if (rulesConfig) {
    console.log(chalk.gray(`📋 已加载自定义规则配置 (.media-rules.json)`));
    if (rulesConfig.dimensionRules && rulesConfig.dimensionRules.length > 0) {
      console.log(chalk.gray(`   自定义尺寸规则: ${rulesConfig.dimensionRules.length} 条`));
    }
    if (rulesConfig.licenseRemindDays !== undefined) {
      console.log(chalk.gray(`   授权提前提醒: ${rulesConfig.licenseRemindDays} 天`));
    }
    if (rulesConfig.requiredTags && rulesConfig.requiredTags.length > 0) {
      console.log(chalk.gray(`   必填标签: ${rulesConfig.requiredTags.join(', ')}`));
    }
    console.log();
  }

  const result: CheckResult = {
    missingCover: [],
    invalidDimensions: [],
    missingDimensions: [],
    duplicates: [],
    expiredLicense: [],
    missingRequiredTags: [],
    passedFiles: []
  };

  if (checkCover) {
    result.missingCover = checkMissingCover(files);
  }

  if (checkDimensions) {
    const dimResult = checkAllDimensions(files, effectiveSpecs);
    result.invalidDimensions = dimResult.invalid;
    result.missingDimensions = dimResult.missing;
  }

  if (checkDuplicates) {
    result.duplicates = findDuplicates(files);
  }

  if (checkLicense) {
    result.expiredLicense = checkExpiredLicense(files, licenseRemindDays);
  }

  if (effectiveRequiredTags.length > 0) {
    result.missingRequiredTags = checkRequiredTags(files, effectiveRequiredTags);
  }

  const problemFileIds = new Set<string>();
  result.missingCover.forEach(f => problemFileIds.add(f.id));
  result.invalidDimensions.forEach(item => problemFileIds.add(item.file.id));
  result.missingDimensions.forEach(f => problemFileIds.add(f.id));
  result.duplicates.forEach(group => group.forEach(f => problemFileIds.add(f.id)));
  result.expiredLicense.forEach(f => problemFileIds.add(f.id));
  result.missingRequiredTags.forEach(item => problemFileIds.add(item.file.id));
  result.passedFiles = files.filter(f => !problemFileIds.has(f.id));

  printCheckResult(result, files.length, licenseRemindDays, effectiveRequiredTags);

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

  for (const [, group] of Object.entries(byPlatformAndTheme)) {
    const hasCover = group.some(f => f.isCover && f.fileType === 'image');
    if (!hasCover) {
      const nonCoverImages = group.filter(f => f.fileType === 'image' && !f.isCover);
      missing.push(...nonCoverImages.slice(0, 3));
    }
  }

  return missing;
}

function checkAllDimensions(
  files: MediaFile[],
  specs: DimensionSpec[]
): { invalid: InvalidDimensionItem[]; missing: MediaFile[] } {
  const invalid: InvalidDimensionItem[] = [];
  const missing: MediaFile[] = [];

  for (const file of files) {
    if (file.fileType === 'copy') continue;
    if (!file.platform) continue;

    const fileSpecs = specs.filter(
      s => s.platform === file.platform && s.type === file.fileType
    );

    if (fileSpecs.length === 0) continue;

    if (!file.width || !file.height) {
      missing.push(file);
      continue;
    }

    let matched: DimensionSpec | null = null;
    let matchReason = '';
    const reasons: string[] = [];

    for (const spec of fileSpecs) {
      const result = matchDimensionSpec(file, spec);
      if (result.matched) {
        matched = spec;
        matchReason = result.reason;
        break;
      } else {
        reasons.push(result.reason);
      }
    }

    if (!matched) {
      const expectedDesc = fileSpecs.map(s => s.description).join(' 或 ');
      const failReason = reasons.length > 0 ? reasons[0] : '尺寸不在允许范围内';
      invalid.push({
        file,
        expected: expectedDesc,
        actual: `${file.width}x${file.height}`,
        reason: failReason
      });
    }
  }

  return { invalid, missing };
}

function matchDimensionSpec(
  file: MediaFile,
  spec: DimensionSpec
): { matched: boolean; reason: string } {
  if (!file.width || !file.height) {
    return { matched: false, reason: '缺少尺寸信息' };
  }

  if (spec.isRatio) {
    const specRatio = spec.width / spec.height;
    const fileRatio = file.width / file.height;
    if (Math.abs(fileRatio - specRatio) < 0.05) {
      return { matched: true, reason: `比例匹配 ${spec.description}` };
    }
    return {
      matched: false,
      reason: `比例不匹配: 实际${(fileRatio).toFixed(2)}:1, 期望${spec.description}`
    };
  }

  if (file.width === spec.width && file.height === spec.height) {
    return { matched: true, reason: `尺寸完全匹配 ${spec.width}x${spec.height}` };
  }

  const specRatio = spec.width / spec.height;
  const fileRatio = file.width / file.height;
  const ratioMatch = Math.abs(fileRatio - specRatio) < 0.05;

  if (ratioMatch && spec.minWidth && spec.minHeight) {
    if (file.width >= spec.minWidth && file.height >= spec.minHeight &&
        file.width <= spec.width && file.height <= spec.height) {
      return {
        matched: true,
        reason: `同比例低一档合规: ${file.width}x${file.height} 符合 ${spec.description}`
      };
    }
    if (file.width < spec.minWidth || file.height < spec.minHeight) {
      return {
        matched: false,
        reason: `比例正确但分辨率过低: ${file.width}x${file.height} 低于最低要求 ${spec.minWidth}x${spec.minHeight}`
      };
    }
    if (file.width > spec.width || file.height > spec.height) {
      return {
        matched: false,
        reason: `比例正确但分辨率超出标准: ${file.width}x${file.height} 高于标准 ${spec.width}x${spec.height}`
      };
    }
  }

  if (ratioMatch && !spec.minWidth) {
    return {
      matched: true,
      reason: `比例匹配 ${spec.description}`
    };
  }

  if (ratioMatch) {
    return {
      matched: false,
      reason: `比例正确但分辨率 ${file.width}x${file.height} 不在 ${spec.minWidth}x${spec.minHeight}~${spec.width}x${spec.height} 范围内`
    };
  }

  return {
    matched: false,
    reason: `比例不匹配: 实际${fileRatio.toFixed(3)} 期望${specRatio.toFixed(3)} (${spec.description})`
  };
}

function findDuplicates(files: MediaFile[]): MediaFile[][] {
  const byHash: Record<string, MediaFile[]> = {};

  for (const file of files) {
    const key = file.hash || 'unknown';
    if (!byHash[key]) {
      byHash[key] = [];
    }
    byHash[key].push(file);
  }

  return Object.values(byHash).filter(group => group.length > 1);
}

function checkExpiredLicense(files: MediaFile[], remindDays: number): MediaFile[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return files.filter(file => {
    if (!file.licenseExpiry) return false;
    try {
      const expiryDate = new Date(file.licenseExpiry);
      const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= remindDays;
    } catch {
      return false;
    }
  });
}

function checkRequiredTags(
  files: MediaFile[],
  requiredTags: string[]
): Array<{ file: MediaFile; missingTags: string[] }> {
  const result: Array<{ file: MediaFile; missingTags: string[] }> = [];

  for (const file of files) {
    const missing = requiredTags.filter(tag => {
      switch (tag) {
        case 'platform': return !file.platform;
        case 'campaign': return !file.campaign;
        case 'influencer': return !file.influencer;
        case 'status': return !file.status;
        case 'licenseExpiry': return !file.licenseExpiry;
        default: return !file.tags.includes(tag);
      }
    });
    if (missing.length > 0) {
      result.push({ file, missingTags: missing });
    }
  }

  return result;
}

function printCheckResult(
  result: CheckResult,
  totalFiles: number,
  licenseRemindDays: number,
  requiredTags: string[]
): void {
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

  if (result.missingDimensions.length > 0) {
    issues.push(chalk.yellow(`⚠️  ${result.missingDimensions.length} 个素材缺少尺寸信息`));
    const table = new Table({
      head: [chalk.white('文件名'), chalk.white('平台'), chalk.white('类型')],
      colWidths: [40, 15, 10]
    });
    for (const file of result.missingDimensions) {
      table.push([
        file.fileName,
        file.platform ? PLATFORM_NAMES[file.platform] : '-',
        FILE_TYPE_NAMES[file.fileType]
      ]);
    }
    console.log(chalk.yellow('\n📐 缺少尺寸信息的素材（需补齐视频/图片分辨率）:'));
    console.log(table.toString());
  }

  if (result.invalidDimensions.length > 0) {
    issues.push(chalk.red(`❌ ${result.invalidDimensions.length} 个素材尺寸不合规`));
    const table = new Table({
      head: [
        chalk.white('文件名'),
        chalk.white('类型'),
        chalk.white('实际尺寸'),
        chalk.white('期望尺寸'),
        chalk.white('不合规原因')
      ],
      colWidths: [25, 8, 12, 30, 35]
    });
    for (const item of result.invalidDimensions) {
      table.push([
        item.file.fileName,
        FILE_TYPE_NAMES[item.file.fileType],
        chalk.yellow(item.actual),
        chalk.cyan(item.expected),
        chalk.gray(item.reason)
      ]);
    }
    console.log(chalk.red('\n📐 尺寸不合规的素材:'));
    console.log(table.toString());
  } else if (result.missingDimensions.length === 0) {
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
    issues.push(chalk.red(`❌ ${result.expiredLicense.length} 个素材授权已过期或即将到期(${licenseRemindDays}天内)`));
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
    console.log(chalk.red(`\n⏰ 授权已过期或${licenseRemindDays}天内到期的素材:`));
    console.log(table.toString());
  } else {
    issues.push(chalk.green('✅ 授权检查通过'));
  }

  if (result.missingRequiredTags.length > 0) {
    issues.push(chalk.red(`❌ ${result.missingRequiredTags.length} 个素材缺少必填标签`));
    const table = new Table({
      head: [chalk.white('文件名'), chalk.white('缺少标签')],
      colWidths: [40, 35]
    });
    for (const item of result.missingRequiredTags) {
      table.push([
        item.file.fileName,
        chalk.yellow(item.missingTags.join(', '))
      ]);
    }
    console.log(chalk.red('\n🏷️  缺少必填标签的素材:'));
    console.log(table.toString());
  } else if (requiredTags.length > 0) {
    issues.push(chalk.green('✅ 必填标签检查通过'));
  }

  if (result.passedFiles.length > 0) {
    issues.push(chalk.green(`✅ ${result.passedFiles.length} 个素材全部合规`));
  }

  console.log('\n' + '='.repeat(50));
  console.log(chalk.cyan(`\n📊 检查完成，共检查 ${totalFiles} 个文件`));
  for (const issue of issues) {
    console.log(`  ${issue}`);
  }

  const totalIssues =
    result.missingCover.length +
    result.invalidDimensions.length +
    result.missingDimensions.length +
    result.duplicates.reduce((s, g) => s + g.length, 0) +
    result.expiredLicense.length +
    result.missingRequiredTags.length;

  if (totalIssues > 0) {
    console.log(chalk.yellow(`\n⚠️  共发现 ${totalIssues} 个问题需要处理\n`));
  } else {
    console.log(chalk.green('\n🎉 所有检查通过！素材合规性良好\n'));
  }
}
