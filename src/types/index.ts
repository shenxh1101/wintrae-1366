export type FileType = 'image' | 'video' | 'copy';

export type Platform = 'wechat' | 'weibo' | 'douyin' | 'xiaohongshu' | 'bilibili' | 'kuaishou';

export type UsageStatus = 'draft' | 'pending' | 'published' | 'archived';

export interface MediaFile {
  id: string;
  originalPath: string;
  originalName: string;
  fileName: string;
  fileType: FileType;
  extension: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  hash: string;
  width?: number;
  height?: number;
  duration?: number;
  date?: string;
  platform?: Platform;
  theme?: string;
  campaign?: string;
  influencer?: string;
  status?: UsageStatus;
  licenseExpiry?: string;
  isCover?: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface ScanOptions {
  recursive?: boolean;
  includeHidden?: boolean;
}

export interface RenameOptions {
  dateFormat?: string;
  separator?: string;
  preview?: boolean;
  platform?: Platform;
  theme?: string;
}

export interface TagOptions {
  campaign?: string;
  influencer?: string;
  status?: UsageStatus;
  addTags?: string[];
  removeTags?: string[];
  licenseExpiry?: string;
  isCover?: boolean;
}

export interface CheckOptions {
  checkCover?: boolean;
  checkDimensions?: boolean;
  checkDuplicates?: boolean;
  checkLicense?: boolean;
  platform?: Platform;
}

export interface CheckResult {
  missingCover: MediaFile[];
  invalidDimensions: Array<{ file: MediaFile; expected: string; actual: string }>;
  duplicates: MediaFile[][];
  expiredLicense: MediaFile[];
}

export interface ExportOptions {
  platform?: Platform;
  startDate?: string;
  endDate?: string;
  preview?: boolean;
  outputDir?: string;
  format?: 'json' | 'csv' | 'markdown';
}

export interface ExportData {
  publishList: MediaFile[];
  materialPackages: Record<string, MediaFile[]>;
  todoItems: string[];
  statistics: {
    total: number;
    byType: Record<FileType, number>;
    byPlatform: Record<Platform, number>;
    byStatus: Record<UsageStatus, number>;
    byCampaign: Record<string, number>;
  };
}

export interface DimensionSpec {
  platform: Platform;
  type: FileType;
  width: number;
  height: number;
  description: string;
}

export const PLATFORM_NAMES: Record<Platform, string> = {
  wechat: '微信公众号',
  weibo: '微博',
  douyin: '抖音',
  xiaohongshu: '小红书',
  bilibili: '哔哩哔哩',
  kuaishou: '快手'
};

export const FILE_TYPE_NAMES: Record<FileType, string> = {
  image: '图片',
  video: '短视频',
  copy: '文案'
};

export const STATUS_NAMES: Record<UsageStatus, string> = {
  draft: '草稿',
  pending: '待发布',
  published: '已发布',
  archived: '已归档'
};

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.heic'];
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v'];
export const COPY_EXTENSIONS = ['.txt', '.md', '.docx', '.doc', '.rtf', '.wps'];

export const DIMENSION_SPECS: DimensionSpec[] = [
  { platform: 'wechat', type: 'image', width: 900, height: 500, description: '公众号封面900x500' },
  { platform: 'wechat', type: 'image', width: 2.35, height: 1, description: '公众号封面2.35:1' },
  { platform: 'weibo', type: 'image', width: 1080, height: 1080, description: '微博方图1080x1080' },
  { platform: 'douyin', type: 'video', width: 1080, height: 1920, description: '抖音竖屏9:16' },
  { platform: 'douyin', type: 'image', width: 1080, height: 1920, description: '抖音竖屏9:16' },
  { platform: 'xiaohongshu', type: 'image', width: 1080, height: 1440, description: '小红书3:4' },
  { platform: 'xiaohongshu', type: 'image', width: 1080, height: 1350, description: '小红书4:5' },
  { platform: 'xiaohongshu', type: 'video', width: 1080, height: 1920, description: '小红书竖屏9:16' },
  { platform: 'bilibili', type: 'video', width: 1920, height: 1080, description: 'B站横屏16:9' },
  { platform: 'bilibili', type: 'image', width: 1146, height: 717, description: 'B站封面1146x717' },
  { platform: 'kuaishou', type: 'video', width: 1080, height: 1920, description: '快手竖屏9:16' }
];
