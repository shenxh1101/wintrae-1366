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
  PLATFORM_NAMES,
  FILE_TYPE_NAMES,
  STATUS_NAMES
} from '../types';
import { loadMetadata, formatFileSize } from '../utils/metadata';

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
    format = 'markdown'
  } = options;

  console.log(chalk.cyan(`\n📤 正在导出素材数据...`));
  const filters = [];
  if (platform) filters.push(`平台: ${PLATFORM_NAMES[platform]}`);
  if (startDate) filters.push(`开始日期: ${startDate}`);
  if (endDate) filters.push(`结束日期: ${endDate}`);
  if (filters.length > 0) console.log(chalk.gray(`筛选条件: ${filters.join(' | ')}`));
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

  const exportData = buildExportData(files);

  printExportPreview(exportData);

  if (preview) {
    console.log(chalk.yellow('\n⚠️  预览模式，未生成输出文件'));
    return exportData;
  }

  const absoluteOutputDir = path.resolve(outputDir);
  await fs.ensureDir(absoluteOutputDir);

  await writeExportFiles(absoluteOutputDir, exportData, format);

  console.log(chalk.cyan(`\n✅ 导出完成！文件已保存到: ${absoluteOutputDir}\n`));

  return exportData;
}

function buildExportData(files: MediaFile[]): ExportData {
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

  const todoItems: string[] = [];

  const missingPlatform = files.filter(f => !f.platform);
  if (missingPlatform.length > 0) {
    todoItems.push(`${missingPlatform.length} 个素材缺少平台标签`);
  }

  const missingCover = files.filter(f => f.fileType === 'image' && !f.isCover && f.platform);
  if (missingCover.length > 0) {
    const byPlatform: Record<string, number> = {};
    for (const f of missingCover) {
      if (f.platform) byPlatform[f.platform] = (byPlatform[f.platform] || 0) + 1;
    }
    for (const [p, count] of Object.entries(byPlatform)) {
      todoItems.push(`${PLATFORM_NAMES[p as Platform]} 有 ${count} 个图片未指定封面`);
    }
  }

  const missingDimensions = files.filter(f => f.fileType !== 'copy' && (!f.width || !f.height));
  if (missingDimensions.length > 0) {
    const videoMissing = missingDimensions.filter(f => f.fileType === 'video').length;
    const imageMissing = missingDimensions.filter(f => f.fileType === 'image').length;
    const parts: string[] = [];
    if (videoMissing > 0) parts.push(`${videoMissing} 个视频`);
    if (imageMissing > 0) parts.push(`${imageMissing} 个图片`);
    todoItems.push(`${parts.join('、')}缺少尺寸/分辨率信息，需补齐后才能进行尺寸合规检查`);
  }

  const pendingFiles = files.filter(f => !f.status || f.status === 'draft');
  if (pendingFiles.length > 0) {
    todoItems.push(`${pendingFiles.length} 个素材状态为草稿或未设置，需要确认发布计划`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiringSoon = files.filter(f => {
    if (!f.licenseExpiry) return false;
    const expiry = new Date(f.licenseExpiry);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 30;
  });
  if (expiringSoon.length > 0) {
    todoItems.push(`${expiringSoon.length} 个素材授权将在 30 天内到期，需要续签`);
  }

  const expired = files.filter(f => {
    if (!f.licenseExpiry) return false;
    return new Date(f.licenseExpiry) <= today;
  });
  if (expired.length > 0) {
    todoItems.push(`${expired.length} 个素材授权已过期，请停止使用`);
  }

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
    statistics: {
      total: files.length,
      byType,
      byPlatform,
      byStatus,
      byCampaign
    }
  };
}

function printExportPreview(data: ExportData): void {
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
        chalk.white('状态')
      ],
      colWidths: [12, 12, 15, 25, 8, 10]
    });

    for (const file of data.publishList.slice(0, 10)) {
      table.push([
        file.date || file.createdAt.toISOString().split('T')[0],
        file.platform ? PLATFORM_NAMES[file.platform] : '-',
        file.theme || '-',
        file.fileName,
        FILE_TYPE_NAMES[file.fileType],
        file.status ? STATUS_NAMES[file.status] : '-'
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
    console.log(chalk.yellow('\n⚠️  待补事项'));
    for (const item of data.todoItems) {
      console.log(chalk.gray(`  - ${item}`));
    }
  }

  console.log(chalk.cyan('\n📊 简单统计'));
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
  format: 'json' | 'csv' | 'markdown'
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
}

async function writeJSON(outputDir: string, data: ExportData, timestamp: string): Promise<void> {
  const jsonData = {
    exportDate: new Date().toISOString(),
    statistics: data.statistics,
    publishList: data.publishList.map(serializeFile),
    materialPackages: Object.fromEntries(
      Object.entries(data.materialPackages).map(([k, v]) => [k, v.map(serializeFile)])
    ),
    todoItems: data.todoItems
  };

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
    '状态', '日期', '大小', '尺寸', '是否封面', '授权到期', '标签'
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
    f.tags.join('; ')
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

async function writeMarkdown(outputDir: string, data: ExportData, timestamp: string): Promise<void> {
  let md = `# 社交媒体素材管理报告\n\n`;
  md += `导出日期: ${new Date().toLocaleString('zh-CN')}\n\n`;

  md += `## 📊 统计概览\n\n`;
  md += `- 总素材数: **${data.statistics.total}**\n`;
  md += `- 图片: ${data.statistics.byType.image} | 视频: ${data.statistics.byType.video} | 文案: ${data.statistics.byType.copy}\n\n`;

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
    md += `| 日期 | 平台 | 主题 | 文件名 | 类型 | 状态 |\n`;
    md += `|------|------|------|--------|------|------|\n`;
    for (const file of data.publishList) {
      md += `| ${file.date || file.createdAt.toISOString().split('T')[0]} | ${file.platform ? PLATFORM_NAMES[file.platform] : '-'} | ${file.theme || '-'} | ${file.fileName} | ${FILE_TYPE_NAMES[file.fileType]} | ${file.status ? STATUS_NAMES[file.status] : '-'} |\n`;
    }
  } else {
    md += `暂无待发布素材\n`;
  }

  md += `\n## 📦 素材包目录\n\n`;
  for (const [pkg, pkgFiles] of Object.entries(data.materialPackages)) {
    md += `### ${pkg} (${pkgFiles.length} 个)\n\n`;
    md += `| 文件名 | 类型 | 大小 | 达人 | 授权到期 |\n`;
    md += `|--------|------|------|------|----------|\n`;
    for (const file of pkgFiles) {
      md += `| ${file.fileName} | ${FILE_TYPE_NAMES[file.fileType]} | ${formatFileSize(file.size)} | ${file.influencer || '-'} | ${file.licenseExpiry || '-'} |\n`;
    }
    md += `\n`;
  }

  if (data.todoItems.length > 0) {
    md += `## ⚠️ 待补事项\n\n`;
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
