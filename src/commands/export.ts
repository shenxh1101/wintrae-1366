import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  MediaFile,
  ExportOptions,
  ExportData,
  FileType,
  Platform,
  UsageStatus,
  CheckResult,
  PLATFORM_NAMES,
  FILE_TYPE_NAMES,
  STATUS_NAMES
} from '../types';
import { loadMetadata, formatFileSize, loadRulesConfig, getEffectiveRules } from '../utils/metadata';
import { checkCommand } from './check';

export async function exportCommand(
  dirPath: string,
  options: ExportOptions
): Promise<ExportData | null> {
  const {
    platform,
    startDate,
    endDate,
    preview = false,
    outputDir = './export',
    format = 'markdown',
    profile,
    includeCheck = true,
    todoOnlyCsv = false
  } = options;

  console.log(chalk.cyan(`\n📤 正在导出素材数据...`));
  const filters = [];
  if (platform) filters.push(`平台: ${PLATFORM_NAMES[platform]}`);
  if (startDate) filters.push(`开始日期: ${startDate}`);
  if (endDate) filters.push(`结束日期: ${endDate}`);
  if (filters.length > 0) console.log(chalk.gray(`筛选条件: ${filters.join(' | ')}`));
  if (profile) console.log(chalk.gray(`规则档案: ${profile}`));
  console.log(chalk.gray(`输出格式: ${format} | 预览模式: ${preview ? '是' : '否'}\n`));

  const absoluteDir = path.resolve(dirPath);
  const savedMetadata = await loadMetadata(absoluteDir);
  let files = Object.values(savedMetadata);

  if (files.length === 0) {
    console.log(chalk.yellow('⚠️  未找到素材文件，请先运行 scan 命令'));
    return null;
  }

  if (platform) {
    files = files.filter(f => f.platform === platform);
  }

  if (startDate) {
    const start = new Date(startDate);
    files = files.filter(f => {
      const fileDate = f.date ? new Date(f.date) : f.createdAt;
      return fileDate >= start;
    });
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    files = files.filter(f => {
      const fileDate = f.date ? new Date(f.date) : f.createdAt;
      return fileDate <= end;
    });
  }

  if (files.length === 0) {
    console.log(chalk.yellow('⚠️  没有符合筛选条件的素材文件'));
    return null;
  }

  const { config: rulesConfig, activeProfile } = await loadRulesConfig(absoluteDir, profile);
  const effectiveRules = getEffectiveRules(rulesConfig, activeProfile);

  let checkResult: CheckResult | null = null;

  if (includeCheck) {
    try {
      checkResult = await checkCommand(dirPath, {
        checkCover: true,
        checkDimensions: true,
        checkDuplicates: true,
        checkLicense: true,
        platform,
        requiredTags: effectiveRules?.requiredTags,
        profile: profile || activeProfile || undefined,
        startDate,
        endDate
      });
    } catch {
      console.log(chalk.yellow('⚠️  合规检查执行失败，报告中将不含检查结果'));
    }
  }

  const exportData = buildExportData(files, checkResult, effectiveRules);

  printExportPreview(exportData, rulesConfig, activeProfile);

  if (preview) {
    console.log(chalk.yellow('\n⚠️  预览模式，未生成输出文件'));
    return exportData;
  }

  const absoluteOutputDir = path.resolve(outputDir);
  await fs.ensureDir(absoluteOutputDir);

  await writeExportFiles(absoluteOutputDir, exportData, format, todoOnlyCsv);

  console.log(chalk.cyan(`\n✅ 导出完成！文件已保存到: ${absoluteOutputDir}\n`));

  return exportData;
}

function getFileCheckStatus(file: MediaFile, checkResult: CheckResult | null): string {
  if (!checkResult) return '未检查';

  if (checkResult.passedFiles.some(f => f.id === file.id)) return '✅ 通过';
  if (checkResult.missingDimensions.some(f => f.id === file.id)) return '⚠️ 待补';
  if (checkResult.invalidDimensions.some(item => item.file.id === file.id)) return '❌ 不合规';
  if (checkResult.missingCover.some(f => f.id === file.id)) return '⚠️ 待补';
  if (checkResult.expiredLicense.some(f => f.id === file.id)) return '⚠️ 待补';
  if (checkResult.missingRequiredTags.some(item => item.file.id === file.id)) return '⚠️ 待补';
  if (checkResult.duplicates.some(group => group.some(f => f.id === file.id))) return '⚠️ 待补';
  return '✅ 通过';
}

function getTodoProblemTypes(file: MediaFile, checkResult: CheckResult | null): string[] {
  if (!checkResult) return [];
  const types: string[] = [];
  if (checkResult.missingCover.some(f => f.id === file.id)) types.push('缺少封面');
  if (checkResult.missingDimensions.some(f => f.id === file.id)) types.push('缺少尺寸');
  if (checkResult.invalidDimensions.some(item => item.file.id === file.id)) types.push('尺寸不合规');
  if (checkResult.duplicates.some(group => group.some(f => f.id === file.id))) types.push('重复文件');
  if (checkResult.expiredLicense.some(f => f.id === file.id)) types.push('授权到期');
  if (checkResult.missingRequiredTags.some(item => item.file.id === file.id)) types.push('缺少必填标签');
  return types;
}

function buildExportData(
  files: MediaFile[],
  checkResult: CheckResult | null,
  rulesConfig: import('../types').ProfileRules | null
): ExportData {
  const publishList = files
    .filter(f => f.status === 'pending' || f.status === 'draft')
    .sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : a.createdAt;
      const dateB = b.date ? new Date(b.date) : b.createdAt;
      return dateA.getTime() - dateB.getTime();
    });

  const materialPackages: Record<string, MediaFile[]> = {};
  for (const file of files) {
    const key = file.campaign || '未分类活动';
    if (!materialPackages[key]) {
      materialPackages[key] = [];
    }
    materialPackages[key].push(file);
  }

  const todoItems = buildGroupedTodoItems(files, checkResult, rulesConfig);

  const byType: Record<FileType, number> = { image: 0, video: 0, copy: 0 };
  const byPlatform: Record<Platform, number> = {
    wechat: 0, weibo: 0, douyin: 0, xiaohongshu: 0, bilibili: 0, kuaishou: 0
  };
  const byStatus: Record<UsageStatus, number> = {
    draft: 0, pending: 0, published: 0, archived: 0
  };
  const byCampaign: Record<string, number> = {};

  for (const file of files) {
    byType[file.fileType]++;
    if (file.platform) byPlatform[file.platform]++;
    if (file.status) byStatus[file.status]++;
    const campaign = file.campaign || '未分类';
    byCampaign[campaign] = (byCampaign[campaign] || 0) + 1;
  }

  return {
    publishList,
    materialPackages,
    todoItems,
    checkResult,
    statistics: {
      total: files.length,
      byType,
      byPlatform,
      byStatus,
      byCampaign
    }
  };
}

function buildGroupedTodoItems(
  files: MediaFile[],
  checkResult: CheckResult | null,
  rulesConfig: import('../types').ProfileRules | null
): string[] {
  const items: string[] = [];

  const missingPlatform = files.filter(f => !f.platform);
  if (missingPlatform.length > 0) {
    items.push(`[平台] ${missingPlatform.length} 个素材缺少平台标签`);
  }

  if (checkResult) {
    if (checkResult.missingDimensions.length > 0) {
      const byPlat: Record<string, string[]> = {};
      for (const f of checkResult.missingDimensions) {
        const platName = f.platform ? PLATFORM_NAMES[f.platform] : '未指定平台';
        if (!byPlat[platName]) byPlat[platName] = [];
        byPlat[platName].push(f.fileName);
      }
      for (const [plat, names] of Object.entries(byPlat)) {
        items.push(`[尺寸/缺信息] ${plat}: ${names.length} 个素材缺少尺寸信息 (${names.slice(0, 3).join(', ')}${names.length > 3 ? ' 等' : ''})`);
      }
    }

    if (checkResult.invalidDimensions.length > 0) {
      const byPlat: Record<string, string[]> = {};
      for (const item of checkResult.invalidDimensions) {
        const platName = item.file.platform ? PLATFORM_NAMES[item.file.platform] : '未指定平台';
        if (!byPlat[platName]) byPlat[platName] = [];
        byPlat[platName].push(`${item.actual}(${item.reason})`);
      }
      for (const [plat, details] of Object.entries(byPlat)) {
        items.push(`[尺寸/不合规] ${plat}: ${details.length} 个素材尺寸不合规 - ${details.slice(0, 2).join('; ')}${details.length > 2 ? ' 等' : ''}`);
      }
    }

    if (checkResult.missingCover.length > 0) {
      const byPlat: Record<string, number> = {};
      for (const f of checkResult.missingCover) {
        const platName = f.platform ? PLATFORM_NAMES[f.platform] : '未指定平台';
        byPlat[platName] = (byPlat[platName] || 0) + 1;
      }
      for (const [plat, count] of Object.entries(byPlat)) {
        items.push(`[封面] ${plat}: ${count} 个图片未指定封面`);
      }
    }

    if (checkResult.missingRequiredTags.length > 0) {
      const byPlat: Record<string, string[]> = {};
      for (const item of checkResult.missingRequiredTags) {
        const platName = item.file.platform ? PLATFORM_NAMES[item.file.platform] : '未指定平台';
        if (!byPlat[platName]) byPlat[platName] = [];
        byPlat[platName].push(...item.missingTags);
      }
      for (const [plat, tags] of Object.entries(byPlat)) {
        const uniqueTags = [...new Set(tags)];
        items.push(`[必填标签] ${plat}: 缺少 ${uniqueTags.join(', ')}`);
      }
    }

    if (checkResult.expiredLicense.length > 0) {
      const expired = checkResult.expiredLicense.filter(f => {
        if (!f.licenseExpiry) return false;
        return new Date(f.licenseExpiry) <= new Date();
      });
      const remindDays = rulesConfig?.licenseRemindDays ?? 30;
      const expiringSoon = checkResult.expiredLicense.filter(f => {
        if (!f.licenseExpiry) return false;
        const diff = Math.ceil((new Date(f.licenseExpiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return diff > 0 && diff <= remindDays;
      });

      if (expired.length > 0) {
        items.push(`[授权/已过期] ${expired.length} 个素材授权已过期，请停止使用`);
      }
      if (expiringSoon.length > 0) {
        items.push(`[授权/即将到期] ${expiringSoon.length} 个素材授权将在${remindDays}天内到期，需要续签`);
      }
    }
  } else {
    const missingDimensions = files.filter(f => f.fileType !== 'copy' && (!f.width || !f.height));
    if (missingDimensions.length > 0) {
      const videoMissing = missingDimensions.filter(f => f.fileType === 'video').length;
      const imageMissing = missingDimensions.filter(f => f.fileType === 'image').length;
      const parts: string[] = [];
      if (videoMissing > 0) parts.push(`${videoMissing} 个视频`);
      if (imageMissing > 0) parts.push(`${imageMissing} 个图片`);
      items.push(`[尺寸/缺信息] ${parts.join('、')}缺少尺寸/分辨率信息`);
    }
  }

  const pendingFiles = files.filter(f => !f.status || f.status === 'draft');
  if (pendingFiles.length > 0) {
    items.push(`[状态] ${pendingFiles.length} 个素材状态为草稿或未设置，需要确认发布计划`);
  }

  return items;
}

function buildDashboard(checkResult: CheckResult | null, files: MediaFile[]): {
  byPlatform: Record<string, number>;
  byInfluencer: Record<string, number>;
  byProblemType: Record<string, number>;
  totalIssues: number;
  todoFiles: MediaFile[];
} {
  const byPlatform: Record<string, number> = {};
  const byInfluencer: Record<string, number> = {};
  const byProblemType: Record<string, number> = {};
  const todoFiles: MediaFile[] = [];
  const seenIds = new Set<string>();

  if (!checkResult) {
    return { byPlatform, byInfluencer, byProblemType, totalIssues: 0, todoFiles: [] };
  }

  function addFile(file: MediaFile, problemType: string) {
    if (!seenIds.has(file.id)) {
      todoFiles.push(file);
      seenIds.add(file.id);
    }
    const platName = file.platform ? PLATFORM_NAMES[file.platform] : '未指定';
    byPlatform[platName] = (byPlatform[platName] || 0) + 1;
    const influencer = file.influencer || '未分配';
    byInfluencer[influencer] = (byInfluencer[influencer] || 0) + 1;
    byProblemType[problemType] = (byProblemType[problemType] || 0) + 1;
  }

  for (const f of checkResult.missingCover) addFile(f, '缺少封面');
  for (const f of checkResult.missingDimensions) addFile(f, '缺少尺寸信息');
  for (const item of checkResult.invalidDimensions) addFile(item.file, '尺寸不合规');
  for (const f of checkResult.expiredLicense) addFile(f, '授权到期');
  for (const item of checkResult.missingRequiredTags) addFile(item.file, '缺少必填标签');
  for (const group of checkResult.duplicates) {
    for (const f of group) addFile(f, '重复文件');
  }

  const totalIssues =
    checkResult.missingCover.length +
    checkResult.missingDimensions.length +
    checkResult.invalidDimensions.length +
    checkResult.expiredLicense.length +
    checkResult.missingRequiredTags.length +
    checkResult.duplicates.reduce((s, g) => s + g.length, 0);

  return { byPlatform, byInfluencer, byProblemType, totalIssues, todoFiles };
}

function printExportPreview(data: ExportData, fullConfig: import('../types').MediaRulesConfig | null, activeProfile: string | null): void {
  console.log(chalk.cyan('📋 发布清单'));
  console.log(chalk.gray(`待发布素材: ${data.publishList.length} 个\n`));

  if (data.publishList.length > 0) {
    const table = new Table({
      head: [
        chalk.white('日期'),
        chalk.white('平台'),
        chalk.white('主题'),
        chalk.white('文件名'),
        chalk.white('类型'),
        chalk.white('状态'),
        chalk.white('合规')
      ],
      colWidths: [12, 12, 15, 25, 8, 10, 10]
    });

    for (const file of data.publishList.slice(0, 10)) {
      const status = getFileCheckStatus(file, data.checkResult);
      table.push([
        file.date || file.createdAt.toISOString().split('T')[0],
        file.platform ? PLATFORM_NAMES[file.platform] : '-',
        file.theme || '-',
        file.fileName,
        FILE_TYPE_NAMES[file.fileType],
        file.status ? STATUS_NAMES[file.status] : '-',
        status
      ]);
    }

    console.log(table.toString());
    if (data.publishList.length > 10) {
      console.log(chalk.gray(`... 还有 ${data.publishList.length - 10} 个素材\n`));
    }
  }

  console.log(chalk.cyan('\n📦 素材包目录'));
  for (const [pkg, pkgFiles] of Object.entries(data.materialPackages)) {
    const byTypeCount: Record<string, number> = {};
    for (const f of pkgFiles) {
      byTypeCount[FILE_TYPE_NAMES[f.fileType]] = (byTypeCount[FILE_TYPE_NAMES[f.fileType]] || 0) + 1;
    }
    const typeStr = Object.entries(byTypeCount)
      .map(([t, c]) => `${t}: ${c}`)
      .join(', ');
    console.log(chalk.gray(`  ${pkg}: ${pkgFiles.length} 个 (${typeStr})`));
  }

  if (data.todoItems.length > 0) {
    console.log(chalk.yellow('\n⚠️  待补事项（按平台和问题类型分组）'));
    for (const item of data.todoItems) {
      console.log(chalk.gray(`  - ${item}`));
    }
  }

  if (data.checkResult) {
    const cr = data.checkResult;
    console.log(chalk.cyan('\n📊 合规检查汇总'));
    console.log(chalk.gray(`  ✅ 通过: ${cr.passedFiles.length} 个`));
    console.log(chalk.gray(`  ⚠️  待补: ${cr.missingDimensions.length + cr.missingCover.length + cr.missingRequiredTags.length} 个`));
    console.log(chalk.gray(`  ❌ 不合规: ${cr.invalidDimensions.length} 个`));

    const dashboard = buildDashboard(cr, data.publishList);
    console.log(chalk.cyan('\n📋 整改看板'));

    if (Object.keys(dashboard.byPlatform).length > 0) {
      console.log(chalk.gray('  按平台:'));
      for (const [plat, count] of Object.entries(dashboard.byPlatform)) {
        console.log(chalk.gray(`    ${plat}: ${count} 个问题`));
      }
    }

    if (Object.keys(dashboard.byInfluencer).length > 0) {
      console.log(chalk.gray('  按达人/负责人:'));
      for (const [inf, count] of Object.entries(dashboard.byInfluencer)) {
        console.log(chalk.gray(`    ${inf}: ${count} 个问题`));
      }
    }

    if (Object.keys(dashboard.byProblemType).length > 0) {
      console.log(chalk.gray('  按问题类型:'));
      for (const [ptype, count] of Object.entries(dashboard.byProblemType)) {
        console.log(chalk.gray(`    ${ptype}: ${count} 个`));
      }
    }

    if (dashboard.todoFiles.length > 0) {
      console.log(chalk.gray(`  待处理素材总数: ${dashboard.todoFiles.length} 个`));
    }
  }

  console.log(chalk.cyan('\n📈 简单统计'));
  console.log(chalk.gray(`  总素材数: ${data.statistics.total}`));
  console.log(chalk.gray(`  按类型: 图片 ${data.statistics.byType.image} | 视频 ${data.statistics.byType.video} | 文案 ${data.statistics.byType.copy}`));

  const platformStats = Object.entries(data.statistics.byPlatform)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${PLATFORM_NAMES[k as Platform]}: ${v}`)
    .join(' | ');
  if (platformStats) console.log(chalk.gray(`  按平台: ${platformStats}`));

  const statusStats = Object.entries(data.statistics.byStatus)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${STATUS_NAMES[k as UsageStatus]}: ${v}`)
    .join(' | ');
  if (statusStats) console.log(chalk.gray(`  按状态: ${statusStats}`));
}

async function writeExportFiles(
  outputDir: string,
  data: ExportData,
  format: 'json' | 'csv' | 'markdown',
  todoOnlyCsv: boolean
): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === 'json' || format === 'markdown') {
    await writeJSON(outputDir, data, timestamp);
  }

  if (format === 'csv' || format === 'markdown') {
    await writeCSV(outputDir, data, timestamp);
  }

  if (format === 'markdown') {
    await writeMarkdown(outputDir, data, timestamp);
  }

  if (todoOnlyCsv && data.checkResult) {
    await writeTodoOnlyCSV(outputDir, data, timestamp);
  }
}

async function writeJSON(outputDir: string, data: ExportData, timestamp: string): Promise<void> {
  const jsonData: Record<string, unknown> = {
    exportDate: new Date().toISOString(),
    statistics: data.statistics,
    publishList: data.publishList.map(f => ({
      ...serializeFile(f),
      complianceStatus: getFileCheckStatus(f, data.checkResult)
    })),
    materialPackages: Object.fromEntries(
      Object.entries(data.materialPackages).map(([k, v]) => [k, v.map(serializeFile)])
    ),
    todoItems: data.todoItems
  };

  if (data.checkResult) {
    const dashboard = buildDashboard(data.checkResult, data.publishList);
    jsonData.checkResult = {
      passed: data.checkResult.passedFiles.length,
      pending: data.checkResult.missingDimensions.length + data.checkResult.missingCover.length + data.checkResult.missingRequiredTags.length,
      nonCompliant: data.checkResult.invalidDimensions.length,
      invalidDimensions: data.checkResult.invalidDimensions.map(item => ({
        fileName: item.file.fileName,
        actual: item.actual,
        expected: item.expected,
        reason: item.reason
      })),
      missingDimensions: data.checkResult.missingDimensions.map(f => f.fileName),
      missingCover: data.checkResult.missingCover.map(f => f.fileName),
      expiredLicense: data.checkResult.expiredLicense.map(f => f.fileName),
      dashboard: {
        byPlatform: dashboard.byPlatform,
        byInfluencer: dashboard.byInfluencer,
        byProblemType: dashboard.byProblemType,
        totalIssues: dashboard.totalIssues,
        todoFileCount: dashboard.todoFiles.length
      }
    };
  }

  await fs.writeJSON(
    path.join(outputDir, `material-data-${timestamp}.json`),
    jsonData,
    { spaces: 2 }
  );
}

function serializeFile(file: MediaFile) {
  return {
    fileName: file.fileName,
    originalPath: file.originalPath,
    fileType: FILE_TYPE_NAMES[file.fileType],
    platform: file.platform ? PLATFORM_NAMES[file.platform] : '-',
    theme: file.theme || '-',
    campaign: file.campaign || '-',
    influencer: file.influencer || '-',
    status: file.status ? STATUS_NAMES[file.status] : '-',
    date: file.date || file.createdAt.toISOString().split('T')[0],
    size: formatFileSize(file.size),
    dimensions: file.width && file.height ? `${file.width}x${file.height}` : '-',
    isCover: file.isCover ? '是' : '否',
    licenseExpiry: file.licenseExpiry || '-',
    tags: file.tags.join(', ')
  };
}

async function writeCSV(outputDir: string, data: ExportData, timestamp: string): Promise<void> {
  const headers = [
    '文件名', '路径', '类型', '平台', '主题', '活动', '达人',
    '状态', '日期', '大小', '尺寸', '是否封面', '授权到期', '标签', '合规状态'
  ];

  const allFiles = Object.values(data.materialPackages).flat();
  const rows = allFiles.map(f => [
    f.fileName,
    f.originalPath,
    FILE_TYPE_NAMES[f.fileType],
    f.platform ? PLATFORM_NAMES[f.platform] : '-',
    f.theme || '-',
    f.campaign || '-',
    f.influencer || '-',
    f.status ? STATUS_NAMES[f.status] : '-',
    f.date || f.createdAt.toISOString().split('T')[0],
    formatFileSize(f.size),
    f.width && f.height ? `${f.width}x${f.height}` : '-',
    f.isCover ? '是' : '否',
    f.licenseExpiry || '-',
    f.tags.join('; '),
    getFileCheckStatus(f, data.checkResult)
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  await fs.writeFile(
    path.join(outputDir, `material-list-${timestamp}.csv`),
    '\ufeff' + csvContent
  );
}

async function writeTodoOnlyCSV(outputDir: string, data: ExportData, timestamp: string): Promise<void> {
  if (!data.checkResult) return;

  const headers = [
    '文件名', '平台', '达人', '问题类型', '详细说明', '原始路径'
  ];

  const rows: string[][] = [];

  for (const f of data.checkResult.missingCover) {
    rows.push([
      f.fileName,
      f.platform ? PLATFORM_NAMES[f.platform] : '-',
      f.influencer || '-',
      '缺少封面',
      '该平台/主题缺少封面图',
      f.originalPath
    ]);
  }

  for (const f of data.checkResult.missingDimensions) {
    rows.push([
      f.fileName,
      f.platform ? PLATFORM_NAMES[f.platform] : '-',
      f.influencer || '-',
      '缺少尺寸信息',
      '无法读取分辨率，请补齐视频/图片尺寸信息',
      f.originalPath
    ]);
  }

  for (const item of data.checkResult.invalidDimensions) {
    rows.push([
      item.file.fileName,
      item.file.platform ? PLATFORM_NAMES[item.file.platform] : '-',
      item.file.influencer || '-',
      '尺寸不合规',
      `${item.actual} 不符合 ${item.expected}，原因: ${item.reason}`,
      item.file.originalPath
    ]);
  }

  for (const f of data.checkResult.expiredLicense) {
    const isExpired = f.licenseExpiry && new Date(f.licenseExpiry) <= new Date();
    rows.push([
      f.fileName,
      f.platform ? PLATFORM_NAMES[f.platform] : '-',
      f.influencer || '-',
      isExpired ? '授权已过期' : '授权即将到期',
      `授权到期日: ${f.licenseExpiry}`,
      f.originalPath
    ]);
  }

  for (const item of data.checkResult.missingRequiredTags) {
    rows.push([
      item.file.fileName,
      item.file.platform ? PLATFORM_NAMES[item.file.platform] : '-',
      item.file.influencer || '-',
      '缺少必填标签',
      `缺少: ${item.missingTags.join(', ')}`,
      item.file.originalPath
    ]);
  }

  for (let i = 0; i < data.checkResult.duplicates.length; i++) {
    const group = data.checkResult.duplicates[i];
    for (const f of group) {
      rows.push([
        f.fileName,
        f.platform ? PLATFORM_NAMES[f.platform] : '-',
        f.influencer || '-',
        '重复文件',
        `重复组 #${i + 1}，共 ${group.length} 个重复文件`,
        f.originalPath
      ]);
    }
  }

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  await fs.writeFile(
    path.join(outputDir, `todo-issues-${timestamp}.csv`),
    '\ufeff' + csvContent
  );
  console.log(chalk.gray(`  📋 待处理清单 CSV: todo-issues-${timestamp}.csv`));
}

async function writeMarkdown(outputDir: string, data: ExportData, timestamp: string): Promise<void> {
  let md = `# 社交媒体素材管理报告\n\n`;
  md += `导出日期: ${new Date().toLocaleString('zh-CN')}\n\n`;

  md += `## 📊 统计概览\n\n`;
  md += `- 总素材数: **${data.statistics.total}**\n`;
  md += `- 图片: ${data.statistics.byType.image} | 视频: ${data.statistics.byType.video} | 文案: ${data.statistics.byType.copy}\n\n`;

  if (data.checkResult) {
    const cr = data.checkResult;
    const dashboard = buildDashboard(cr, data.publishList);

    md += `### 合规检查汇总\n\n`;
    md += `- ✅ 通过: ${cr.passedFiles.length} 个\n`;
    md += `- ⚠️ 待补: ${cr.missingDimensions.length + cr.missingCover.length + cr.missingRequiredTags.length} 个\n`;
    md += `- ❌ 不合规: ${cr.invalidDimensions.length} 个\n\n`;

    md += `### 整改看板\n\n`;

    if (Object.keys(dashboard.byPlatform).length > 0) {
      md += `**按平台:**\n\n`;
      md += `| 平台 | 待处理数 |\n|------|----------|\n`;
      for (const [plat, count] of Object.entries(dashboard.byPlatform)) {
        md += `| ${plat} | ${count} |\n`;
      }
      md += `\n`;
    }

    if (Object.keys(dashboard.byInfluencer).length > 0) {
      md += `**按达人/负责人:**\n\n`;
      md += `| 达人 | 待处理数 |\n|------|----------|\n`;
      for (const [inf, count] of Object.entries(dashboard.byInfluencer)) {
        md += `| ${inf} | ${count} |\n`;
      }
      md += `\n`;
    }

    if (Object.keys(dashboard.byProblemType).length > 0) {
      md += `**按问题类型:**\n\n`;
      md += `| 问题类型 | 数量 |\n|----------|------|\n`;
      for (const [ptype, count] of Object.entries(dashboard.byProblemType)) {
        md += `| ${ptype} | ${count} |\n`;
      }
      md += `\n`;
    }
  }

  md += `### 按平台分布\n\n`;
  md += `| 平台 | 数量 |\n|------|------|\n`;
  for (const [platform, count] of Object.entries(data.statistics.byPlatform)) {
    if (count > 0) {
      md += `| ${PLATFORM_NAMES[platform as Platform]} | ${count} |\n`;
    }
  }

  md += `\n### 按状态分布\n\n`;
  md += `| 状态 | 数量 |\n|------|------|\n`;
  for (const [status, count] of Object.entries(data.statistics.byStatus)) {
    if (count > 0) {
      md += `| ${STATUS_NAMES[status as UsageStatus]} | ${count} |\n`;
    }
  }

  md += `\n## 📋 发布清单\n\n`;
  if (data.publishList.length > 0) {
    md += `| 日期 | 平台 | 主题 | 文件名 | 类型 | 状态 | 合规 |\n`;
    md += `|------|------|------|--------|------|------|------|\n`;
    for (const file of data.publishList) {
      const status = getFileCheckStatus(file, data.checkResult);
      md += `| ${file.date || file.createdAt.toISOString().split('T')[0]} | ${file.platform ? PLATFORM_NAMES[file.platform] : '-'} | ${file.theme || '-'} | ${file.fileName} | ${FILE_TYPE_NAMES[file.fileType]} | ${file.status ? STATUS_NAMES[file.status] : '-'} | ${status} |\n`;
    }
  } else {
    md += `暂无待发布素材\n`;
  }

  md += `\n## 📦 素材包目录\n\n`;
  for (const [pkg, pkgFiles] of Object.entries(data.materialPackages)) {
    md += `### ${pkg} (${pkgFiles.length} 个)\n\n`;
    md += `| 文件名 | 类型 | 大小 | 达人 | 授权到期 | 合规 |\n`;
    md += `|--------|------|------|------|----------|------|\n`;
    for (const file of pkgFiles) {
      const status = getFileCheckStatus(file, data.checkResult);
      md += `| ${file.fileName} | ${FILE_TYPE_NAMES[file.fileType]} | ${formatFileSize(file.size)} | ${file.influencer || '-'} | ${file.licenseExpiry || '-'} | ${status} |\n`;
    }
    md += `\n`;
  }

  if (data.checkResult && data.checkResult.invalidDimensions.length > 0) {
    md += `## ❌ 尺寸不合规明细\n\n`;
    md += `| 文件名 | 平台 | 实际尺寸 | 期望尺寸 | 原因 |\n`;
    md += `|--------|------|----------|----------|------|\n`;
    for (const item of data.checkResult.invalidDimensions) {
      md += `| ${item.file.fileName} | ${item.file.platform ? PLATFORM_NAMES[item.file.platform] : '-'} | ${item.actual} | ${item.expected} | ${item.reason} |\n`;
    }
    md += `\n`;
  }

  if (data.todoItems.length > 0) {
    md += `## ⚠️ 待补事项（按平台和问题类型分组）\n\n`;
    for (const item of data.todoItems) {
      md += `- [ ] ${item}\n`;
    }
    md += `\n`;
  }

  await fs.writeFile(
    path.join(outputDir, `material-report-${timestamp}.md`),
    md
  );
}
