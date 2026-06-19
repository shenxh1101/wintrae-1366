const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

const TEST_DIR = path.join(__dirname, 'acceptance-test');
const CLI = 'node ' + path.join(__dirname, 'dist', 'index.js');

function run(cmd) {
  try {
    return execSync(cmd, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function writeString(buf, str, offset) {
  for (let i = 0; i < str.length; i++) {
    buf.writeUInt8(str.charCodeAt(i), offset + i);
  }
}

function createBox(type, data) {
  const size = 8 + data.length;
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(size, 0);
  writeString(buf, type, 4);
  data.copy(buf, 8);
  return buf;
}

function createFtyp() {
  const data = Buffer.alloc(12);
  writeString(data, 'isom', 0);
  data.writeUInt32BE(512, 4);
  writeString(data, 'isom', 8);
  return createBox('ftyp', data);
}

function createMvhd() {
  const data = Buffer.alloc(100);
  data.writeUInt32BE(1000, 12);
  data.writeUInt32BE(1000, 16);
  data.writeUInt32BE(0x00010000, 20);
  data.writeUInt32BE(0x00010000, 36);
  data.writeUInt32BE(0x40000000, 60);
  data.writeUInt32BE(0x40000000, 84);
  data.writeUInt32BE(2, 96);
  return createBox('mvhd', data);
}

function createTkhd(trackId, width, height) {
  const data = Buffer.alloc(96);
  data.writeUInt32BE(trackId, 12);
  data.writeUInt32BE(1000, 20);
  data.writeUInt16BE(1, 34);
  data.writeUInt32BE(0x40000000, 60);
  data.writeUInt32BE(0x40000000, 84);
  data.writeUInt16BE(width, 88);
  data.writeUInt16BE(0, 90);
  data.writeUInt16BE(height, 92);
  return createBox('tkhd', data);
}

function createMdhd() {
  const data = Buffer.alloc(32);
  data.writeUInt32BE(1000, 12);
  data.writeUInt32BE(1000, 16);
  data.writeUInt16BE(0x55c4, 20);
  return createBox('mdhd', data);
}

function createHdlr() {
  const data = Buffer.alloc(25);
  writeString(data, 'vide', 8);
  return createBox('hdlr', data);
}

function createVmhd() {
  const data = Buffer.alloc(12);
  return createBox('vmhd', data);
}

function createDinf() {
  const data = Buffer.alloc(12);
  return createBox('dinf', data);
}

function createStsd(width, height) {
  const avc1Data = Buffer.alloc(78);
  avc1Data.writeUInt16BE(1, 6);
  avc1Data.writeUInt16BE(width, 24);
  avc1Data.writeUInt16BE(height, 26);
  avc1Data.writeUInt32BE(0x00480000, 28);
  avc1Data.writeUInt32BE(0x00480000, 32);
  avc1Data.writeUInt16BE(1, 40);
  avc1Data.writeUInt16BE(24, 74);
  avc1Data.writeUInt16BE(0xffff, 76);

  const avcc = Buffer.alloc(23);
  avcc.writeUInt32BE(23, 0);
  writeString(avcc, 'avcC', 4);
  avcc.writeUInt8(1, 8);
  avcc.writeUInt8(100, 9);
  avcc.writeUInt8(30, 10);
  avcc.writeUInt8(0xff, 11);
  avcc.writeUInt8(0xe1, 12);
  avcc.writeUInt16BE(5, 13);
  avcc.writeUInt8(0x67, 15);
  avcc.writeUInt8(0x64, 16);
  avcc.writeUInt8(0x00, 17);
  avcc.writeUInt8(0x1e, 18);
  avcc.writeUInt8(0xac, 19);
  avcc.writeUInt8(0x01, 20);
  avcc.writeUInt8(0x00, 21);
  avcc.writeUInt8(0x00, 22);

  const avc1Entry = Buffer.concat([avc1Data, avcc]);
  const avc1Size = 8 + avc1Entry.length;
  const avc1 = Buffer.alloc(avc1Size);
  avc1.writeUInt32BE(avc1Size, 0);
  writeString(avc1, 'avc1', 4);
  avc1Entry.copy(avc1, 8);

  const stsdData = Buffer.alloc(8 + avc1.length);
  stsdData.writeUInt32BE(1, 4);
  avc1.copy(stsdData, 8);
  return createBox('stsd', stsdData);
}

function createStts() {
  const data = Buffer.alloc(20);
  data.writeUInt32BE(1, 8);
  data.writeUInt32BE(1, 12);
  data.writeUInt32BE(1000, 16);
  return createBox('stts', data);
}

function createStsc() {
  const data = Buffer.alloc(28);
  data.writeUInt32BE(1, 8);
  data.writeUInt32BE(1, 12);
  data.writeUInt32BE(1, 16);
  data.writeUInt32BE(1, 20);
  return createBox('stsc', data);
}

function createStsz() {
  const data = Buffer.alloc(20);
  data.writeUInt32BE(1, 12);
  data.writeUInt32BE(1024, 16);
  return createBox('stsz', data);
}

function createStco() {
  const data = Buffer.alloc(16);
  data.writeUInt32BE(1, 8);
  return createBox('stco', data);
}

function createMinf(width, height) {
  const vmhd = createVmhd();
  const dinf = createDinf();
  const stsd = createStsd(width, height);
  const stts = createStts();
  const stsc = createStsc();
  const stsz = createStsz();
  const stco = createStco();
  const stbl = createBox('stbl', Buffer.concat([stsd, stts, stsc, stsz, stco]));
  return createBox('minf', Buffer.concat([vmhd, dinf, stbl]));
}

function createMdia(width, height) {
  const mdhd = createMdhd();
  const hdlr = createHdlr();
  const minf = createMinf(width, height);
  return createBox('mdia', Buffer.concat([mdhd, hdlr, minf]));
}

function createTrak(trackId, width, height) {
  const tkhd = createTkhd(trackId, width, height);
  const mdia = createMdia(width, height);
  return createBox('trak', Buffer.concat([tkhd, mdia]));
}

function createMoov(width, height) {
  const mvhd = createMvhd();
  const trak = createTrak(1, width, height);
  return createBox('moov', Buffer.concat([mvhd, trak]));
}

function createMdat() {
  return createBox('mdat', Buffer.from([0x00, 0x00, 0x00, 0x00]));
}

function createTestMp4(filePath, width, height) {
  const ftyp = createFtyp();
  const moov = createMoov(width, height);
  const mdat = createMdat();
  const fileData = Buffer.concat([ftyp, moov, mdat]);
  fs.writeFileSync(filePath, fileData);
}

function setupTestData() {
  fs.removeSync(TEST_DIR);
  fs.ensureDirSync(TEST_DIR);

  createTestMp4(path.join(TEST_DIR, '01_douyin_portrait_1080x1920.mp4'), 1080, 1920);
  createTestMp4(path.join(TEST_DIR, '02_douyin_landscape_1920x1080.mp4'), 1920, 1080);
  createTestMp4(path.join(TEST_DIR, '03_douyin_lowres_720x1280.mp4'), 720, 1280);
  createTestMp4(path.join(TEST_DIR, '04_bilibili_landscape_1920x1080.mp4'), 1920, 1080);
  createTestMp4(path.join(TEST_DIR, '05_bilibili_portrait_1080x1920.mp4'), 1080, 1920);
  createTestMp4(path.join(TEST_DIR, '06_kuaishou_portrait_1080x1920.mp4'), 1080, 1920);
  createTestMp4(path.join(TEST_DIR, '07_douyin_mismatch_640x480.mp4'), 640, 480);
  createTestMp4(path.join(TEST_DIR, '08_douyin_toolow_360x640.mp4'), 360, 640);
  createTestMp4(path.join(TEST_DIR, '09_mov_portrait_1080x1920.mov'), 1080, 1920);
  fs.writeFileSync(path.join(TEST_DIR, '10_unreadable.mp4'), 'This is not a valid video file');

  const rulesConfig = {
    licenseRemindDays: 14,
    requiredTags: ['platform', 'campaign']
  };
  fs.writeFileSync(
    path.join(TEST_DIR, '.media-rules.json'),
    JSON.stringify(rulesConfig, null, 2)
  );

  console.log(chalk.cyan('📁 测试素材已创建:'));
  const testCases = [
    { file: '01_douyin_portrait_1080x1920.mp4', desc: '抖音竖屏标准', expected: '✅ 合规' },
    { file: '02_douyin_landscape_1920x1080.mp4', desc: '抖音横屏标准', expected: '✅ 合规' },
    { file: '03_douyin_lowres_720x1280.mp4', desc: '抖音竖屏低一档', expected: '✅ 同比例合规' },
    { file: '04_bilibili_landscape_1920x1080.mp4', desc: 'B站横屏标准', expected: '✅ 合规' },
    { file: '05_bilibili_portrait_1080x1920.mp4', desc: 'B站竖屏标准', expected: '✅ 合规' },
    { file: '06_kuaishou_portrait_1080x1920.mp4', desc: '快手竖屏标准', expected: '✅ 合规' },
    { file: '07_douyin_mismatch_640x480.mp4', desc: '抖音比例不对', expected: '❌ 比例不匹配' },
    { file: '08_douyin_toolow_360x640.mp4', desc: '抖音比例对但太低', expected: '❌ 分辨率过低' },
    { file: '09_mov_portrait_1080x1920.mov', desc: 'MOV竖屏', expected: '✅ 合规' },
    { file: '10_unreadable.mp4', desc: '无法读取尺寸', expected: '⚠️ 待补事项' },
  ];
  testCases.forEach(tc => {
    console.log(chalk.gray(`  ${tc.file}  →  ${tc.desc}  →  ${tc.expected}`));
  });
  console.log(chalk.gray('  .media-rules.json  →  自定义规则配置'));
  console.log();
}

function runScan() {
  console.log(chalk.cyan('🔍 步骤 1: 扫描素材目录'));
  const output = run(`${CLI} scan ${TEST_DIR}`);
  if (output.includes('1080x1920') && output.includes('1920x1080') && output.includes('720x1280') && output.includes('640x480') && output.includes('360x640')) {
    console.log(chalk.green('✅ 扫描成功，正确读取到所有视频尺寸'));
  } else {
    console.log(chalk.red('❌ 扫描失败，未正确读取尺寸'));
    console.log(output);
    return false;
  }
  console.log();
  return true;
}

function runTagSet() {
  console.log(chalk.cyan('🏷️  步骤 2: 设置平台标签'));
  const tagCmds = [
    `${CLI} tag set ${TEST_DIR} "01_douyin" --platform douyin --campaign "618大促"`,
    `${CLI} tag set ${TEST_DIR} "02_douyin" --platform douyin --campaign "618大促"`,
    `${CLI} tag set ${TEST_DIR} "03_douyin_lowres" --platform douyin --campaign "618大促"`,
    `${CLI} tag set ${TEST_DIR} "04_bilibili" --platform bilibili --campaign "618大促"`,
    `${CLI} tag set ${TEST_DIR} "05_bilibili" --platform bilibili --campaign "618大促"`,
    `${CLI} tag set ${TEST_DIR} "06_kuaishou" --platform kuaishou --campaign "618大促"`,
    `${CLI} tag set ${TEST_DIR} "07_douyin_mismatch" --platform douyin`,
    `${CLI} tag set ${TEST_DIR} "08_douyin_toolow" --platform douyin`,
    `${CLI} tag set ${TEST_DIR} "09_mov" --platform douyin --campaign "618大促"`,
    `${CLI} tag set ${TEST_DIR} "10_unreadable" --platform douyin`,
  ];

  let allPass = true;
  for (const cmd of tagCmds) {
    const output = run(cmd);
    if (!output.includes('已为 1 个文件更新标签')) {
      console.log(chalk.red(`❌ 标签设置失败: ${cmd}`));
      console.log(output);
      allPass = false;
    }
  }

  if (allPass) {
    console.log(chalk.green('✅ 所有平台标签设置成功'));
  }

  console.log();
  return allPass;
}

function runTagList() {
  console.log(chalk.cyan('📋 步骤 3: 验证标签列表'));
  const output = run(`${CLI} tag list ${TEST_DIR}`);
  let pass = true;

  if (output.includes('抖音') && output.includes('哔哩哔哩') && output.includes('快手') && output.includes('618大促')) {
    console.log(chalk.green('✅ 平台名称和活动名称正确显示'));
  } else {
    console.log(chalk.red('❌ 标签列表验证失败'));
    pass = false;
  }

  console.log();
  return pass;
}

function runCsvImport() {
  console.log(chalk.cyan('📥 步骤 4: CSV 批量导入测试'));
  const csvPath = path.join(TEST_DIR, 'import-test.csv');
  const csvContent = `文件名,平台,活动,达人,状态,授权到期\n04_bilibili_landscape,bilibili,春节活动,李同学,pending,2027-01-01\n05_bilibili_portrait,bilibili,春节活动,张同学,published,2027-06-01\nnonexistent_file,douyin,测试活动,王同学,draft,2027-12-01`;
  fs.writeFileSync(csvPath, csvContent);

  const output = run(`${CLI} tag import ${TEST_DIR} "${csvPath}"`);
  let pass = true;

  if (output.includes('匹配成功: 2 行') || output.includes('已更新 2 个文件的标签')) {
    console.log(chalk.green('✅ CSV 导入成功匹配到 2 个文件'));
  } else {
    console.log(chalk.red('❌ CSV 导入匹配数量不正确'));
    console.log(output);
    pass = false;
  }

  if (output.includes('未匹配') && output.includes('nonexistent_file')) {
    console.log(chalk.green('✅ 未匹配的文件名单独列出了'));
  } else {
    console.log(chalk.red('❌ 未匹配的文件名未被单独列出'));
    pass = false;
  }

  const listOutput = run(`${CLI} tag list ${TEST_DIR}`);
  if (listOutput.includes('春节活动') && listOutput.includes('李同学')) {
    console.log(chalk.green('✅ tag list 验证 CSV 导入数据正确'));
  } else {
    console.log(chalk.red('❌ tag list 未正确显示 CSV 导入的数据'));
    pass = false;
  }

  console.log();
  return pass;
}

function runCheckDimensions() {
  console.log(chalk.cyan('📐 步骤 5: 尺寸判定增强测试'));
  const output = run(`${CLI} check ${TEST_DIR} --no-cover --no-duplicates --no-license --no-dimensions`);
  console.log();

  const dimOutput = run(`${CLI} check ${TEST_DIR} --no-cover --no-duplicates --no-license`);
  console.log(chalk.gray('─'.repeat(60)));
  console.log(dimOutput);
  console.log(chalk.gray('─'.repeat(60)));

  let pass = true;

  if (dimOutput.includes('10_unreadable') && dimOutput.includes('缺少尺寸信息')) {
    console.log(chalk.green('✅ 无法读取尺寸的文件正确归类到"缺少尺寸信息"'));
  } else {
    console.log(chalk.red('❌ 缺少尺寸信息检查失败'));
    pass = false;
  }

  if (dimOutput.includes('07_douyin_mismatch') && dimOutput.includes('640x480')) {
    console.log(chalk.green('✅ 比例不匹配的文件正确识别为不合规'));
  } else {
    console.log(chalk.red('❌ 比例不匹配检查失败'));
    pass = false;
  }

  if (dimOutput.includes('08_douyin_toolow') && dimOutput.includes('360x640') && dimOutput.includes('过低')) {
    console.log(chalk.green('✅ 比例正确但分辨率过低的文件正确识别并给出原因'));
  } else {
    console.log(chalk.red('❌ 分辨率过低检查失败'));
    pass = false;
  }

  if (dimOutput.includes('不合规原因')) {
    console.log(chalk.green('✅ 终端显示了不合规原因列'));
  } else {
    console.log(chalk.red('❌ 终端未显示不合规原因'));
    pass = false;
  }

  const lowResOk = !dimOutput.includes('03_douyin_lowres_720x1280');
  if (lowResOk) {
    console.log(chalk.green('✅ 720x1280 低一档竖屏视频被判为合规（同比例低一档规则生效）'));
  } else {
    console.log(chalk.red('❌ 720x1280 低一档竖屏视频被误判为不合规'));
    pass = false;
  }

  console.log();
  return pass;
}

function runCheckRulesConfig() {
  console.log(chalk.cyan('⚙️  步骤 6: 规则配置文件测试'));
  const output = run(`${CLI} check ${TEST_DIR} --no-cover --no-duplicates --no-license --no-dimensions --required-tags platform,campaign`);
  let pass = true;

  if (output.includes('自定义规则配置') || output.includes('.media-rules.json')) {
    console.log(chalk.green('✅ 检测到并加载了 .media-rules.json 配置'));
  } else {
    console.log(chalk.red('❌ 未检测到规则配置'));
    pass = false;
  }

  if (output.includes('必填标签') || output.includes('缺少必填标签')) {
    console.log(chalk.green('✅ 必填标签检查生效'));
  } else {
    console.log(chalk.red('❌ 必填标签检查未生效'));
    pass = false;
  }

  console.log();
  return pass;
}

function runExportWithCheck() {
  console.log(chalk.cyan('📤 步骤 7: 导出报告含合规检查结果'));
  const output = run(`${CLI} export ${TEST_DIR} --preview`);
  let pass = true;

  if (output.includes('合规') || output.includes('通过') || output.includes('待补') || output.includes('不合规')) {
    console.log(chalk.green('✅ 导出报告包含合规状态'));
  } else {
    console.log(chalk.red('❌ 导出报告缺少合规状态'));
    pass = false;
  }

  if (output.includes('[尺寸') || output.includes('[平台') || output.includes('[封面')) {
    console.log(chalk.green('✅ 待补事项按平台和问题类型分组'));
  } else {
    console.log(chalk.red('❌ 待补事项未按类型分组'));
    pass = false;
  }

  if (output.includes('合规检查汇总')) {
    console.log(chalk.green('✅ 报告包含合规检查汇总'));
  } else {
    console.log(chalk.red('❌ 报告缺少合规检查汇总'));
    pass = false;
  }

  console.log();
  return pass;
}

function main() {
  console.log(chalk.bold.cyan('\n' + '═'.repeat(70)));
  console.log(chalk.bold.cyan('          素材合规检查和报告能力 - 验收测试'));
  console.log(chalk.bold.cyan('═'.repeat(70) + '\n'));

  setupTestData();

  const results = [];
  results.push({ step: '扫描素材', pass: runScan() });
  results.push({ step: '设置标签', pass: runTagSet() });
  results.push({ step: '标签列表', pass: runTagList() });
  results.push({ step: 'CSV导入', pass: runCsvImport() });
  results.push({ step: '尺寸判定增强', pass: runCheckDimensions() });
  results.push({ step: '规则配置', pass: runCheckRulesConfig() });
  results.push({ step: '导出报告', pass: runExportWithCheck() });

  console.log(chalk.bold.cyan('═'.repeat(70)));
  console.log(chalk.bold('\n📊 测试结果汇总:\n'));

  const passed = results.filter(r => r.pass).length;
  const total = results.length;

  results.forEach(r => {
    const icon = r.pass ? chalk.green('✅') : chalk.red('❌');
    console.log(`  ${icon}  ${r.step}`);
  });

  console.log();
  if (passed === total) {
    console.log(chalk.bold.green(`🎉 所有 ${total} 项测试全部通过！`));
  } else {
    console.log(chalk.bold.red(`⚠️  ${passed}/${total} 项测试通过，请检查失败项`));
    process.exit(1);
  }

  fs.removeSync(TEST_DIR);
  console.log(chalk.gray('\n🧹 测试数据已清理\n'));
}

main();
