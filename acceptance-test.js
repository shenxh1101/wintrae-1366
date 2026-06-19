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

  createTestMp4(path.join(TEST_DIR, '01_douyin_portrait_OK.mp4'), 1080, 1920);
  createTestMp4(path.join(TEST_DIR, '02_douyin_landscape_OK.mp4'), 1920, 1080);
  createTestMp4(path.join(TEST_DIR, '03_bilibili_landscape_OK.mp4'), 1920, 1080);
  createTestMp4(path.join(TEST_DIR, '04_bilibili_portrait_OK.mp4'), 1080, 1920);
  createTestMp4(path.join(TEST_DIR, '05_kuaishou_portrait_OK.mp4'), 1080, 1920);
  createTestMp4(path.join(TEST_DIR, '06_douyin_mismatch_FAIL.mp4'), 640, 480);
  createTestMp4(path.join(TEST_DIR, '07_mov_portrait_OK.mov'), 1080, 1920);
  fs.writeFileSync(path.join(TEST_DIR, '08_unreadable_MISSING.mp4'), 'This is not a valid video file');

  console.log(chalk.cyan('📁 测试素材已创建:'));
  const testCases = [
    { file: '01_douyin_portrait_OK.mp4', desc: '抖音竖屏 1080x1920', expected: '✅ 合规' },
    { file: '02_douyin_landscape_OK.mp4', desc: '抖音横屏 1920x1080', expected: '✅ 合规' },
    { file: '03_bilibili_landscape_OK.mp4', desc: 'B站横屏 1920x1080', expected: '✅ 合规' },
    { file: '04_bilibili_portrait_OK.mp4', desc: 'B站竖屏 1080x1920', expected: '✅ 合规' },
    { file: '05_kuaishou_portrait_OK.mp4', desc: '快手竖屏 1080x1920', expected: '✅ 合规' },
    { file: '06_douyin_mismatch_FAIL.mp4', desc: '抖音平台 640x480', expected: '❌ 尺寸不合规' },
    { file: '07_mov_portrait_OK.mov', desc: 'MOV 竖屏 1080x1920', expected: '✅ 合规' },
    { file: '08_unreadable_MISSING.mp4', desc: '无法读取尺寸', expected: '⚠️ 待补事项' },
  ];
  testCases.forEach(tc => {
    console.log(chalk.gray(`  ${tc.file}  →  ${tc.desc}  →  ${tc.expected}`));
  });
  console.log();
}

function runScan() {
  console.log(chalk.cyan('🔍 步骤 1: 扫描素材目录'));
  const output = run(`${CLI} scan ${TEST_DIR}`);
  if (output.includes('1080x1920') && output.includes('1920x1080') && output.includes('640x480')) {
    console.log(chalk.green('✅ 扫描成功，正确读取到所有视频尺寸'));
    const hasDash = output.match(/unreadable.*\n.*-.*\n/);
    if (hasDash) {
      console.log(chalk.green('✅ 无法读取的文件正确显示为 "-"'));
    }
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
    `${CLI} tag set ${TEST_DIR} "01_douyin" --platform douyin`,
    `${CLI} tag set ${TEST_DIR} "02_douyin" --platform douyin`,
    `${CLI} tag set ${TEST_DIR} "03_bilibili" --platform bilibili`,
    `${CLI} tag set ${TEST_DIR} "04_bilibili" --platform bilibili`,
    `${CLI} tag set ${TEST_DIR} "05_kuaishou" --platform kuaishou`,
    `${CLI} tag set ${TEST_DIR} "06_douyin" --platform douyin`,
    `${CLI} tag set ${TEST_DIR} "07_mov" --platform douyin`,
    `${CLI} tag set ${TEST_DIR} "08_unreadable" --platform douyin`,
  ];

  let allPass = true;
  for (const cmd of tagCmds) {
    const output = run(cmd);
    if (!output.includes('已为 1 个文件更新标签') && !output.includes('已为 2 个文件更新标签')) {
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

  if (output.includes('抖音') && output.includes('哔哩哔哩') && output.includes('快手')) {
    console.log(chalk.green('✅ 平台名称正确显示'));
  } else {
    console.log(chalk.red('❌ 平台名称未正确显示'));
    pass = false;
  }

  console.log();
  return pass;
}

function runCheck() {
  console.log(chalk.cyan('✅ 步骤 4: 执行合规检查'));
  const output = run(`${CLI} check ${TEST_DIR} --no-cover --no-duplicates --no-license`);
  console.log(chalk.gray('─'.repeat(60)));
  console.log(output);
  console.log(chalk.gray('─'.repeat(60)));

  let pass = true;

  if (output.includes('08_unreadable_MISSING.mp4') && output.includes('缺少尺寸信息')) {
    console.log(chalk.green('✅ 无法读取尺寸的文件正确归类到"缺少尺寸信息"'));
  } else {
    console.log(chalk.red('❌ 缺少尺寸信息检查失败'));
    pass = false;
  }

  if (output.includes('06_douyin_mismatch_FAIL.mp4') && output.includes('640x480') && output.includes('不合规')) {
    console.log(chalk.green('✅ 尺寸不匹配的文件正确识别为不合规'));
  } else {
    console.log(chalk.red('❌ 尺寸不合规检查失败'));
    pass = false;
  }

  const complianceFiles = ['01_douyin_portrait_OK', '02_douyin_landscape_OK', '03_bilibili_landscape_OK', '04_bilibili_portrait_OK', '05_kuaishou_portrait_OK', '07_mov_portrait_OK'];
  let allAbsent = true;
  for (const f of complianceFiles) {
    if (output.includes(f)) {
      console.log(chalk.red(`❌ ${f} 不应出现在错误列表中`));
      allAbsent = false;
      pass = false;
    }
  }
  if (allAbsent) {
    console.log(chalk.green('✅ 所有合规文件未出现在错误列表中'));
  }

  console.log();
  return pass;
}

function runExport() {
  console.log(chalk.cyan('📤 步骤 5: 导出数据并验证待补事项'));
  const output = run(`${CLI} export ${TEST_DIR} --preview`);

  let pass = true;

  if (output.includes('缺少尺寸') || output.includes('补齐') || output.includes('待补')) {
    console.log(chalk.green('✅ 导出的待补事项中包含缺少尺寸信息提示'));
  } else {
    console.log(chalk.red('❌ 导出的待补事项缺少尺寸信息提示'));
    console.log(output);
    pass = false;
  }

  console.log();
  return pass;
}

function main() {
  console.log(chalk.bold.cyan('\n' + '═'.repeat(70)));
  console.log(chalk.bold.cyan('              视频尺寸合规检查验收测试'));
  console.log(chalk.bold.cyan('═'.repeat(70) + '\n'));

  setupTestData();

  const results = [];
  results.push({ step: '扫描', pass: runScan() });
  results.push({ step: '设置标签', pass: runTagSet() });
  results.push({ step: '标签列表', pass: runTagList() });
  results.push({ step: '合规检查', pass: runCheck() });
  results.push({ step: '导出数据', pass: runExport() });

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
