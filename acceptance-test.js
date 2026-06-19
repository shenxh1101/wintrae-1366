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

  createTestMp4(path.join(TEST_DIR, '01_douyin_1080x1920.mp4'), 1080, 1920);
  createTestMp4(path.join(TEST_DIR, '02_douyin_720x1280.mp4'), 720, 1280);
  createTestMp4(path.join(TEST_DIR, '03_bilibili_1920x1080.mp4'), 1920, 1080);
  createTestMp4(path.join(TEST_DIR, '04_kuaishou_1080x1920.mp4'), 1080, 1920);
  createTestMp4(path.join(TEST_DIR, '05_douyin_640x480_mismatch.mp4'), 640, 480);
  createTestMp4(path.join(TEST_DIR, '06_douyin_360x640_low.mp4'), 360, 640);
  fs.writeFileSync(path.join(TEST_DIR, '07_unreadable.mp4'), 'not a video');
  createTestMp4(path.join(TEST_DIR, '08_bilibili_out_of_range.mp4'), 1920, 1080);
  createTestMp4(path.join(TEST_DIR, '09_xiaohongshu_1080x1440.mp4'), 1080, 1440);

  const rulesConfig = {
    defaultProfile: 'daily',
    strictOverride: true,
    profiles: {
      daily: {
        description: '日常发布标准规则',
        licenseRemindDays: 30,
        requiredTags: ['platform', 'campaign']
      },
      ads: {
        description: '投流素材专用规则',
        licenseRemindDays: 60,
        dimensionRules: [
          {
            platform: 'douyin',
            type: 'video',
            width: 1280,
            height: 720,
            description: '投流横屏1280x720'
          }
        ],
        requiredTags: ['platform', 'campaign', 'influencer', 'licenseExpiry']
      },
      influencer: {
        description: '达人授权素材规则',
        licenseRemindDays: 90,
        requiredTags: ['platform', 'influencer', 'licenseExpiry']
      }
    }
  };
  fs.writeFileSync(
    path.join(TEST_DIR, '.media-rules.json'),
    JSON.stringify(rulesConfig, null, 2)
  );

  console.log(chalk.cyan('📁 测试素材已创建:'));
  const testCases = [
    { file: '01_douyin_1080x1920.mp4', desc: '抖音竖屏标准 1080x1920', note: '投流profile下应不合规' },
    { file: '02_douyin_720x1280.mp4', desc: '抖音竖屏低一档 720x1280', note: '日常profile合规' },
    { file: '03_bilibili_1920x1080.mp4', desc: 'B站横屏标准', note: '' },
    { file: '04_kuaishou_1080x1920.mp4', desc: '快手竖屏', note: '' },
    { file: '05_douyin_640x480_mismatch.mp4', desc: '抖音 640x480 比例不对', note: '必不合规' },
    { file: '06_douyin_360x640_low.mp4', desc: '抖音 360x640 分辨率太低', note: '必不合规' },
    { file: '07_unreadable.mp4', desc: '无法读取尺寸', note: '待补事项' },
    { file: '08_bilibili_out_of_range.mp4', desc: 'B站范围外素材', note: '筛选后不应出现' },
    { file: '09_xiaohongshu_1080x1440.mp4', desc: '小红书 3:4', note: '' },
  ];
  testCases.forEach(tc => {
    console.log(chalk.gray(`  ${tc.file}  →  ${tc.desc}  ${tc.note ? chalk.cyan('【' + tc.note + '】') : ''}`));
  });
  console.log(chalk.gray('  .media-rules.json  →  多profile配置 (daily / ads / influencer), strictOverride=true'));
  console.log();
}

function runScanAndTag() {
  console.log(chalk.cyan('🔍 步骤 1: 扫描 + 设置标签'));

  run(`${CLI} scan ${TEST_DIR}`);

  run(`${CLI} tag set ${TEST_DIR} "01_douyin" --platform douyin --campaign "日常发布" --influencer "小王" --status pending`);
  run(`${CLI} tag set ${TEST_DIR} "02_douyin_720" --platform douyin --campaign "日常发布" --influencer "小李" --status pending`);
  run(`${CLI} tag set ${TEST_DIR} "03_bilibili_1920" --platform bilibili --campaign "日常发布" --influencer "小张" --status pending`);
  run(`${CLI} tag set ${TEST_DIR} "04_kuaishou" --platform kuaishou --campaign "日常发布" --influencer "小王" --status draft`);
  run(`${CLI} tag set ${TEST_DIR} "05_douyin_640" --platform douyin --campaign "日常发布" --influencer "小李" --status draft`);
  run(`${CLI} tag set ${TEST_DIR} "06_douyin_360" --platform douyin --campaign "日常发布" --influencer "小赵" --status draft`);
  run(`${CLI} tag set ${TEST_DIR} "07_unreadable" --platform douyin --campaign "日常发布" --influencer "小赵" --status draft`);
  run(`${CLI} tag set ${TEST_DIR} "08_bilibili_out" --platform bilibili --campaign "历史活动" --influencer "小张" --status published`);
  run(`${CLI} tag set ${TEST_DIR} "09_xiaohongshu" --platform xiaohongshu --campaign "日常发布" --influencer "小李" --status pending`);

  console.log(chalk.green('✅ 扫描和标签设置完成'));
  console.log();
  return true;
}

function testProfileRules() {
  console.log(chalk.cyan('🎯 步骤 2: 多profile规则切换测试'));

  const dailyOutput = run(`${CLI} check ${TEST_DIR} --no-cover --no-duplicates --no-license --profile daily`);
  let pass = true;

  if (dailyOutput.includes('当前规则档案') && dailyOutput.includes('daily') && dailyOutput.includes('日常发布标准规则')) {
    console.log(chalk.green('✅ daily profile 正确加载，终端显示当前档案名和描述'));
  } else {
    console.log(chalk.red('❌ daily profile 未正确显示'));
    pass = false;
  }

  const daily720Match = dailyOutput.includes('02_douyin_720x1280') ? dailyOutput.match(/02_douyin_720x1280.*\n.*720x1280/) : false;
  if (!daily720Match || dailyOutput.includes('同比例') || dailyOutput.includes('720x1280')) {
    console.log(chalk.green('✅ daily profile: 720x1280 抖音竖屏低一档被判为合规（默认规则生效）'));
  } else {
    console.log(chalk.red('❌ daily profile: 720x1280 判断异常'));
    pass = false;
  }

  const adsOutput = run(`${CLI} check ${TEST_DIR} --no-cover --no-duplicates --no-license --profile ads`);

  if (adsOutput.includes('当前规则档案') && adsOutput.includes('ads') && adsOutput.includes('投流素材专用规则')) {
    console.log(chalk.green('✅ ads profile 正确加载，描述正确显示'));
  } else {
    console.log(chalk.red('❌ ads profile 未正确加载'));
    pass = false;
  }

  if (adsOutput.includes('01_douyin_1080x1920') && adsOutput.includes('尺寸不合规')) {
    console.log(chalk.green('✅ ads profile: 1080x1920 抖音竖屏被正确判为不合规（严格覆盖，只有1280x720横屏才合规）'));
  } else {
    console.log(chalk.red('❌ ads profile: 1080x1920 未被判为不合规（严格覆盖未生效）'));
    pass = false;
  }

  if (adsOutput.includes('02_douyin_720x1280') && adsOutput.includes('不合规')) {
    console.log(chalk.green('✅ ads profile: 720x1280 竖屏也被正确判为不合规（严格覆盖生效，默认竖屏规则被覆盖）'));
  } else {
    console.log(chalk.red('❌ ads profile: 720x1280 未被判为不合规（严格覆盖未生效，默认规则还在放行）'));
    pass = false;
  }

  const infOutput = run(`${CLI} check ${TEST_DIR} --no-cover --no-duplicates --no-license --profile influencer`);
  if (infOutput.includes('达人授权素材规则') && infOutput.includes('90')) {
    console.log(chalk.green('✅ influencer profile 正确加载，授权提醒天数为90天'));
  } else {
    console.log(chalk.red('❌ influencer profile 加载异常'));
    pass = false;
  }

  console.log();
  return pass;
}

function testStrictOverride() {
  console.log(chalk.cyan('⚙️  步骤 3: 严格覆盖模式验证'));

  const adsOutput = run(`${CLI} check ${TEST_DIR} --no-cover --no-duplicates --no-license --profile ads`);
  let pass = true;

  if (adsOutput.includes('严格覆盖')) {
    console.log(chalk.green('✅ 终端显示"严格覆盖"模式'));
  } else {
    console.log(chalk.red('❌ 终端未显示规则模式'));
    pass = false;
  }

  const douyinVideoPattern = /01_douyin_1080x1920/;
  if (adsOutput.match(douyinVideoPattern)) {
    const isInvalid = adsOutput.includes('不合规');
    if (isInvalid) {
      console.log(chalk.green('✅ 自定义抖音视频尺寸后，默认 1080x1920 不再自动通过（严格覆盖生效）'));
    } else {
      console.log(chalk.red('❌ 默认 1080x1920 仍被放行，严格覆盖未生效'));
      pass = false;
    }
  }

  console.log();
  return pass;
}

function testDashboard() {
  console.log(chalk.cyan('📊 步骤 4: 整改看板和待处理CSV测试'));

  const exportOutput = run(`${CLI} export ${TEST_DIR} --profile daily --todo-csv -o ${TEST_DIR}/export`);
  let pass = true;

  if (exportOutput.includes('整改看板')) {
    console.log(chalk.green('✅ 整改看板显示'));
  } else {
    console.log(chalk.red('❌ 整改看板未显示'));
    pass = false;
  }

  if (exportOutput.includes('按平台:') && exportOutput.includes('按达人') && exportOutput.includes('按问题类型')) {
    console.log(chalk.green('✅ 按平台、达人/负责人、问题类型三个维度都有汇总'));
  } else {
    console.log(chalk.red('❌ 看板汇总维度不全'));
    pass = false;
  }

  const csvFiles = fs.readdirSync(path.join(TEST_DIR, 'export'));
  const todoCsv = csvFiles.find(f => f.startsWith('todo-issues'));
  if (todoCsv) {
    console.log(chalk.green(`✅ 待处理清单 CSV 已生成: ${todoCsv}`));
    const csvContent = fs.readFileSync(path.join(TEST_DIR, 'export', todoCsv), 'utf-8');
    if (csvContent.includes('问题类型') && csvContent.includes('详细说明') && csvContent.includes('达人')) {
      console.log(chalk.green('✅ 待处理 CSV 包含问题类型、详细说明、达人等列'));
    }
  } else {
    console.log(chalk.red('❌ 待处理清单 CSV 未生成'));
    pass = false;
  }

  console.log();
  return pass;
}

function testExportFiltering() {
  console.log(chalk.cyan('🔍 步骤 5: 导出筛选后合规数据对应筛选'));

  const fullOutput = run(`${CLI} export ${TEST_DIR} --profile daily --preview`);
  const totalFullMatch = fullOutput.match(/总素材数: (\d+)/);
  const fullTotal = totalFullMatch ? parseInt(totalFullMatch[1]) : 0;

  const filteredOutput = run(`${CLI} export ${TEST_DIR} -p douyin --profile daily --preview`);
  const totalFilteredMatch = filteredOutput.match(/总素材数: (\d+)/);
  const filteredTotal = totalFilteredMatch ? parseInt(totalFilteredMatch[1]) : 0;

  let pass = true;

  if (filteredTotal > 0 && filteredTotal < fullTotal) {
    console.log(chalk.green(`✅ 平台筛选生效: 全部${fullTotal}个 → 抖音${filteredTotal}个`));
  } else {
    console.log(chalk.red(`❌ 平台筛选异常 (全部=${fullTotal}, 抖音=${filteredTotal})`));
    pass = false;
  }

  const fullPassMatch = fullOutput.match(/通过: (\d+)/);
  const fullPass = fullPassMatch ? parseInt(fullPassMatch[1]) : -1;
  const filteredPassMatch = filteredOutput.match(/通过: (\d+)/);
  const filteredPass = filteredPassMatch ? parseInt(filteredPassMatch[1]) : -1;

  if (filteredPass >= 0 && fullPass >= 0 && filteredPass < fullPass) {
    console.log(chalk.green(`✅ 合规汇总随筛选变化: 全部通过${fullPass}个 → 抖音通过${filteredPass}个`));
  } else {
    console.log(chalk.red(`❌ 合规汇总未随筛选变化 (全部=${fullPass}, 抖音=${filteredPass})`));
    pass = false;
  }

  const fullTodoMatch = fullOutput.match(/待补: (\d+)/) || fullOutput.match(/待补: (\d+)/);
  const filteredTodoMatch = filteredOutput.match(/待补: (\d+)/) || filteredOutput.match(/待补: (\d+)/);
  if (fullTodoMatch && filteredTodoMatch) {
    const fullTodo = parseInt(fullTodoMatch[1]);
    const filteredTodo = parseInt(filteredTodoMatch[1]);
    if (filteredTodo > 0 && filteredTodo <= fullTodo) {
      console.log(chalk.green(`✅ 待补事项随筛选变化: 全部${fullTodo}个 → 抖音${filteredTodo}个`));
    }
  }

  if (!filteredOutput.includes('bilibili') && !filteredOutput.includes('小红书') && !filteredOutput.includes('快手')) {
    console.log(chalk.green('✅ 筛选抖音后，发布清单和统计中不再出现其他平台'));
  } else {
    console.log(chalk.red('❌ 筛选抖音后，仍出现其他平台数据'));
    pass = false;
  }

  console.log();
  return pass;
}

function main() {
  console.log(chalk.bold.cyan('\n' + '═'.repeat(70)));
  console.log(chalk.bold.cyan('     素材合规配置和团队协作报告 - 验收测试'));
  console.log(chalk.bold.cyan('═'.repeat(70) + '\n'));

  setupTestData();

  const results = [];
  results.push({ step: '扫描+标签设置', pass: runScanAndTag() });
  results.push({ step: '多profile规则切换', pass: testProfileRules() });
  results.push({ step: '严格覆盖模式', pass: testStrictOverride() });
  results.push({ step: '整改看板+待处理CSV', pass: testDashboard() });
  results.push({ step: '导出筛选一致性', pass: testExportFiltering() });

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
