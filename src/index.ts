#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { scanCommand } from './commands/scan';
import { renameCommand } from './commands/rename';
import { tagCommand, listTagsCommand } from './commands/tag';
import { checkCommand } from './commands/check';
import { exportCommand } from './commands/export';
import { Platform, UsageStatus } from './types';

const program = new Command();

program
  .name('media-cli')
  .description('社交媒体素材批量管理工具')
  .version('1.0.0')
  .addHelpText('before', `${chalk.cyan('📱 社交媒体素材管理 CLI 工具')}\n`);

program
  .command('scan')
  .description('扫描指定目录，识别图片、短视频和文案文件')
  .argument('<dir>', '要扫描的目录路径')
  .option('-r, --no-recursive', '不递归扫描子目录')
  .option('-H, --include-hidden', '包含隐藏文件')
  .action(async (dir: string, options) => {
    try {
      await scanCommand(dir, {
        recursive: options.recursive !== false,
        includeHidden: options.includeHidden
      });
    } catch (error) {
      console.error(chalk.red(`\n❌ 扫描失败: ${error}`));
      process.exit(1);
    }
  });

program
  .command('rename')
  .description('按日期、平台、主题自动重命名素材文件')
  .argument('<dir>', '素材目录路径')
  .option('-d, --date-format <format>', '日期格式，默认 YYYYMMDD', 'YYYYMMDD')
  .option('-s, --separator <char>', '文件名分隔符，默认 _', '_')
  .option('-p, --platform <platform>', '目标平台 (wechat|weibo|douyin|xiaohongshu|bilibili|kuaishou)')
  .option('-t, --theme <theme>', '主题名称')
  .option('--preview', '预览模式，不执行实际重命名')
  .action(async (dir: string, options) => {
    try {
      await renameCommand(dir, {
        dateFormat: options.dateFormat,
        separator: options.separator,
        platform: options.platform as Platform,
        theme: options.theme,
        preview: options.preview
      });
    } catch (error) {
      console.error(chalk.red(`\n❌ 重命名失败: ${error}`));
      process.exit(1);
    }
  });

const tagCmd = program
  .command('tag')
  .description('管理素材标签：活动名、达人名、使用状态等');

tagCmd
  .command('set')
  .description('设置或更新素材标签')
  .argument('<dir>', '素材目录路径')
  .argument('[pattern]', '文件名匹配模式（可选，不指定则更新所有文件）')
  .option('-c, --campaign <name>', '活动名称，传空字符串清除')
  .option('-i, --influencer <name>', '达人名称，传空字符串清除')
  .option('-s, --status <status>', '使用状态 (draft|pending|published|archived)')
  .option('-a, --add-tags <tags>', '添加自定义标签，多个用逗号分隔', (val) => val.split(','))
  .option('-r, --remove-tags <tags>', '移除自定义标签，多个用逗号分隔', (val) => val.split(','))
  .option('-l, --license-expiry <date>', '授权到期日期 (YYYY-MM-DD)，传空字符串清除')
  .option('--cover', '标记为封面图')
  .action(async (dir: string, pattern: string | undefined, options) => {
    try {
      await tagCommand(dir, pattern, {
        campaign: options.campaign,
        influencer: options.influencer,
        status: options.status as UsageStatus,
        addTags: options.addTags || [],
        removeTags: options.removeTags || [],
        licenseExpiry: options.licenseExpiry,
        isCover: options.cover ? true : undefined
      });
    } catch (error) {
      console.error(chalk.red(`\n❌ 标签更新失败: ${error}`));
      process.exit(1);
    }
  });

tagCmd
  .command('list')
  .description('列出所有文件的标签信息')
  .argument('<dir>', '素材目录路径')
  .action(async (dir: string) => {
    try {
      await listTagsCommand(dir);
    } catch (error) {
      console.error(chalk.red(`\n❌ 读取标签失败: ${error}`));
      process.exit(1);
    }
  });

program
  .command('check')
  .description('检查素材合规性：缺少封面、尺寸不合规、重复文件、过期授权')
  .argument('<dir>', '素材目录路径')
  .option('--no-cover', '跳过封面检查')
  .option('--no-dimensions', '跳过尺寸检查')
  .option('--no-duplicates', '跳过重复文件检查')
  .option('--no-license', '跳过授权检查')
  .option('-p, --platform <platform>', '仅检查指定平台的素材')
  .action(async (dir: string, options) => {
    try {
      await checkCommand(dir, {
        checkCover: options.cover !== false,
        checkDimensions: options.dimensions !== false,
        checkDuplicates: options.duplicates !== false,
        checkLicense: options.license !== false,
        platform: options.platform as Platform
      });
    } catch (error) {
      console.error(chalk.red(`\n❌ 检查失败: ${error}`));
      process.exit(1);
    }
  });

program
  .command('export')
  .description('导出发布清单、素材包目录、待补事项和统计数据')
  .argument('<dir>', '素材目录路径')
  .option('-p, --platform <platform>', '按平台筛选')
  .option('--start-date <date>', '开始日期 (YYYY-MM-DD)')
  .option('--end-date <date>', '结束日期 (YYYY-MM-DD)')
  .option('-o, --output-dir <path>', '输出目录，默认 ./export', './export')
  .option('-f, --format <format>', '输出格式 (json|csv|markdown)', 'markdown')
  .option('--preview', '预览模式，只显示不生成文件')
  .action(async (dir: string, options) => {
    try {
      await exportCommand(dir, {
        platform: options.platform as Platform,
        startDate: options.startDate,
        endDate: options.endDate,
        outputDir: options.outputDir,
        format: options.format as 'json' | 'csv' | 'markdown',
        preview: options.preview
      });
    } catch (error) {
      console.error(chalk.red(`\n❌ 导出失败: ${error}`));
      process.exit(1);
    }
  });

program.addHelpText('after', `
${chalk.cyan('📖 使用示例:')}

  ${chalk.gray('# 扫描素材目录')}
  media-cli scan ./materials

  ${chalk.gray('# 预览重命名方案')}
  media-cli rename ./materials --platform douyin --theme 618促销 --preview

  ${chalk.gray('# 执行重命名')}
  media-cli rename ./materials --platform douyin --theme 618促销

  ${chalk.gray('# 为所有文件设置活动标签')}
  media-cli tag set ./materials --campaign "618大促"

  ${chalk.gray('# 为特定文件设置达人标签和状态')}
  media-cli tag set ./materials "cover" --influencer "张同学" --status pending

  ${chalk.gray('# 标记封面图')}
  media-cli tag set ./materials "main_cover" --cover

  ${chalk.gray('# 查看所有标签')}
  media-cli tag list ./materials

  ${chalk.gray('# 执行合规检查')}
  media-cli check ./materials

  ${chalk.gray('# 只检查重复和授权')}
  media-cli check ./materials --no-cover --no-dimensions

  ${chalk.gray('# 预览导出数据')}
  media-cli export ./materials --platform douyin --preview

  ${chalk.gray('# 导出指定时间范围的数据')}
  media-cli export ./materials --start-date 2024-01-01 --end-date 2024-06-30

${chalk.cyan('💡 支持的平台:')} wechat(微信), weibo(微博), douyin(抖音), xiaohongshu(小红书), bilibili(B站), kuaishou(快手)
${chalk.cyan('💡 支持的文件类型:')}
  图片: jpg, jpeg, png, gif, webp, bmp, tiff, heic
  视频: mp4, mov, avi, mkv, flv, wmv, webm, m4v
  文案: txt, md, docx, doc, rtf, wps
`);

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red(`\n❌ 执行出错: ${error.message}`));
  process.exit(1);
});
