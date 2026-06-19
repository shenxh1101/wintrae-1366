import * as fs from 'fs-extra';
import * as path from 'path';

function writeString(buf: Buffer, str: string, offset: number): void {
  for (let i = 0; i < str.length; i++) {
    buf.writeUInt8(str.charCodeAt(i), offset + i);
  }
}

function createBox(type: string, data: Buffer): Buffer {
  const size = 8 + data.length;
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(size, 0);
  writeString(buf, type, 4);
  data.copy(buf, 8);
  return buf;
}

function createFtyp(): Buffer {
  const data = Buffer.alloc(12);
  writeString(data, 'isom', 0);
  data.writeUInt32BE(512, 4);
  writeString(data, 'isom', 8);
  return createBox('ftyp', data);
}

function createMvhd(duration: number = 1000): Buffer {
  const data = Buffer.alloc(100);
  data.writeUInt8(0, 0);
  data.writeUInt8(0, 1);
  data.writeUInt8(0, 2);
  data.writeUInt8(0, 3);
  data.writeUInt32BE(0, 4);
  data.writeUInt32BE(0, 8);
  data.writeUInt32BE(1000, 12);
  data.writeUInt32BE(duration, 16);
  data.writeUInt32BE(0x00010000, 20);
  data.writeUInt16BE(0, 24);
  data.writeUInt16BE(0, 26);
  data.writeUInt16BE(0, 28);
  data.writeUInt16BE(0, 30);
  data.writeUInt16BE(0, 32);
  data.writeUInt32BE(0x00010000, 36);
  data.writeUInt32BE(0, 40);
  data.writeUInt32BE(0, 44);
  data.writeUInt32BE(0, 48);
  data.writeUInt32BE(0, 52);
  data.writeUInt32BE(0, 56);
  data.writeUInt32BE(0x40000000, 60);
  data.writeUInt32BE(0, 64);
  data.writeUInt32BE(0, 68);
  data.writeUInt32BE(0, 72);
  data.writeUInt32BE(0, 76);
  data.writeUInt32BE(0, 80);
  data.writeUInt32BE(0x40000000, 84);
  data.writeUInt32BE(0, 88);
  data.writeUInt32BE(0, 92);
  data.writeUInt32BE(2, 96);
  return createBox('mvhd', data);
}

function createTkhd(trackId: number, width: number, height: number, duration: number = 1000): Buffer {
  const data = Buffer.alloc(96);
  data.writeUInt8(0, 0);
  data.writeUInt8(0, 1);
  data.writeUInt8(0, 2);
  data.writeUInt8(0, 3);
  data.writeUInt32BE(0, 4);
  data.writeUInt32BE(0, 8);
  data.writeUInt32BE(trackId, 12);
  data.writeUInt32BE(0, 16);
  data.writeUInt32BE(duration, 20);
  data.writeUInt16BE(0, 24);
  data.writeUInt16BE(0, 26);
  data.writeUInt16BE(0, 28);
  data.writeUInt16BE(0, 30);
  data.writeUInt16BE(0, 32);
  data.writeUInt16BE(1, 34);
  data.writeUInt16BE(0, 36);
  data.writeUInt16BE(0, 38);
  data.writeUInt32BE(0, 40);
  data.writeUInt32BE(0, 44);
  data.writeUInt32BE(0, 48);
  data.writeUInt32BE(0, 52);
  data.writeUInt32BE(0, 56);
  data.writeUInt32BE(0x40000000, 60);
  data.writeUInt32BE(0, 64);
  data.writeUInt32BE(0, 68);
  data.writeUInt32BE(0, 72);
  data.writeUInt32BE(0, 76);
  data.writeUInt32BE(0, 80);
  data.writeUInt32BE(0x40000000, 84);
  data.writeUInt16BE(width, 88);
  data.writeUInt16BE(0, 90);
  data.writeUInt16BE(height, 92);
  return createBox('tkhd', data);
}

function createMdhd(duration: number = 1000): Buffer {
  const data = Buffer.alloc(32);
  data.writeUInt8(0, 0);
  data.writeUInt8(0, 1);
  data.writeUInt8(0, 2);
  data.writeUInt8(0, 3);
  data.writeUInt32BE(0, 4);
  data.writeUInt32BE(0, 8);
  data.writeUInt32BE(1000, 12);
  data.writeUInt32BE(duration, 16);
  data.writeUInt16BE(0x55c4, 20);
  data.writeUInt16BE(0, 22);
  data.writeUInt32BE(0, 24);
  return createBox('mdhd', data);
}

function createHdlr(): Buffer {
  const data = Buffer.alloc(25);
  data.writeUInt8(0, 0);
  data.writeUInt8(0, 1);
  data.writeUInt8(0, 2);
  data.writeUInt8(0, 3);
  data.writeUInt32BE(0, 4);
  writeString(data, 'vide', 8);
  data.writeUInt32BE(0, 12);
  data.writeUInt32BE(0, 16);
  data.writeUInt32BE(0, 20);
  data.writeUInt8(0, 24);
  return createBox('hdlr', data);
}

function createStsd(width: number, height: number): Buffer {
  const avc1Data = Buffer.alloc(86);
  avc1Data.writeUInt32BE(86, 0);
  writeString(avc1Data, 'avc1', 4);
  avc1Data.writeUInt32BE(0, 8);
  avc1Data.writeUInt16BE(1, 12);
  avc1Data.writeUInt16BE(0, 14);
  avc1Data.writeUInt32BE(0, 16);
  avc1Data.writeUInt32BE(0, 20);
  avc1Data.writeUInt32BE(0, 24);
  avc1Data.writeUInt16BE(width, 28);
  avc1Data.writeUInt16BE(height, 30);
  avc1Data.writeUInt32BE(0x00480000, 32);
  avc1Data.writeUInt32BE(0x00480000, 36);
  avc1Data.writeUInt32BE(0, 40);
  avc1Data.writeUInt16BE(24, 44);
  avc1Data.writeUInt16BE(0xffff, 46);

  writeString(avc1Data, 'avcC', 48);
  const avccSize = 23;
  avc1Data.writeUInt32BE(avccSize, 52);
  avc1Data.writeUInt8(1, 56);
  avc1Data.writeUInt8(100, 57);
  avc1Data.writeUInt8(30, 58);
  avc1Data.writeUInt8(0xff, 59);
  avc1Data.writeUInt8(0xe1, 60);
  avc1Data.writeUInt16BE(5, 61);
  avc1Data.writeUInt8(0x67, 63);
  avc1Data.writeUInt8(0x64, 64);
  avc1Data.writeUInt8(0x00, 65);
  avc1Data.writeUInt8(0x1e, 66);
  avc1Data.writeUInt8(0xac, 67);
  avc1Data.writeUInt8(0x01, 68);
  avc1Data.writeUInt8(0x01, 69);
  avc1Data.writeUInt8(0x01, 70);
  avc1Data.writeUInt8(0x40, 71);
  avc1Data.writeUInt8(0x01, 72);
  avc1Data.writeUInt8(0x01, 73);
  avc1Data.writeUInt8(0x00, 74);
  avc1Data.writeUInt8(0x00, 75);
  avc1Data.writeUInt8(0x00, 76);
  avc1Data.writeUInt8(0x00, 77);
  avc1Data.writeUInt8(0x01, 78);

  const stsdData = Buffer.alloc(8 + avc1Data.length);
  stsdData.writeUInt32BE(1, 8);
  avc1Data.copy(stsdData, 12);

  return createBox('stsd', stsdData);
}

function createStts(): Buffer {
  const data = Buffer.alloc(16);
  data.writeUInt32BE(1, 8);
  data.writeUInt32BE(1, 12);
  data.writeUInt32BE(1000, 16);
  return createBox('stts', data);
}

function createStsc(): Buffer {
  const data = Buffer.alloc(28);
  data.writeUInt32BE(1, 8);
  data.writeUInt32BE(1, 12);
  data.writeUInt32BE(1, 16);
  data.writeUInt32BE(1, 20);
  data.writeUInt32BE(0, 24);
  return createBox('stsc', data);
}

function createStsz(): Buffer {
  const data = Buffer.alloc(20);
  data.writeUInt32BE(0, 8);
  data.writeUInt32BE(1, 12);
  data.writeUInt32BE(1024, 16);
  return createBox('stsz', data);
}

function createStco(): Buffer {
  const data = Buffer.alloc(16);
  data.writeUInt32BE(1, 8);
  data.writeUInt32BE(0, 12);
  return createBox('stco', data);
}

function createMinf(width: number, height: number): Buffer {
  const vmhd = createBox('vmhd', Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
  const dinf = createBox('dinf', Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  const stsd = createStsd(width, height);
  const stts = createStts();
  const stsc = createStsc();
  const stsz = createStsz();
  const stco = createStco();

  const stblData = Buffer.concat([stsd, stts, stsc, stsz, stco]);
  const stbl = createBox('stbl', stblData);

  const minfData = Buffer.concat([vmhd, dinf, stbl]);
  return createBox('minf', minfData);
}

function createMdia(width: number, height: number): Buffer {
  const mdhd = createMdhd();
  const hdlr = createHdlr();
  const minf = createMinf(width, height);

  const mdiaData = Buffer.concat([mdhd, hdlr, minf]);
  return createBox('mdia', mdiaData);
}

function createTrak(trackId: number, width: number, height: number): Buffer {
  const tkhd = createTkhd(trackId, width, height);
  const mdia = createMdia(width, height);

  const trakData = Buffer.concat([tkhd, mdia]);
  return createBox('trak', trakData);
}

function createMoov(width: number, height: number): Buffer {
  const mvhd = createMvhd();
  const trak = createTrak(1, width, height);

  const moovData = Buffer.concat([mvhd, trak]);
  return createBox('moov', moovData);
}

function createMdat(): Buffer {
  return createBox('mdat', Buffer.from([0x00, 0x00, 0x00, 0x00]));
}

export function createTestMp4(filePath: string, width: number, height: number): void {
  const ftyp = createFtyp();
  const moov = createMoov(width, height);
  const mdat = createMdat();

  const fileData = Buffer.concat([ftyp, moov, mdat]);
  fs.writeFileSync(filePath, fileData);
  console.log(`Created: ${filePath} (${width}x${height})`);
}

export function createTestMov(filePath: string, width: number, height: number): void {
  const ftyp = createFtyp();
  const moov = createMoov(width, height);
  const mdat = createMdat();

  const fileData = Buffer.concat([ftyp, moov, mdat]);
  fs.writeFileSync(filePath, fileData);
  console.log(`Created: ${filePath} (${width}x${height})`);
}

if (require.main === module) {
  const testDir = path.join(process.cwd(), 'test-materials');
  fs.ensureDirSync(testDir);

  createTestMp4(path.join(testDir, 'douyin_portrait_1080x1920.mp4'), 1080, 1920);
  createTestMp4(path.join(testDir, 'douyin_landscape_1920x1080.mp4'), 1920, 1080);

  createTestMp4(path.join(testDir, 'bilibili_landscape_1920x1080.mp4'), 1920, 1080);
  createTestMp4(path.join(testDir, 'bilibili_portrait_1080x1920.mp4'), 1080, 1920);

  createTestMp4(path.join(testDir, 'mismatch_640x480.mp4'), 640, 480);
  createTestMov(path.join(testDir, 'mismatch_800x600.mov'), 800, 600);

  createTestMp4(path.join(testDir, 'kuaishou_portrait_1080x1920.mp4'), 1080, 1920);

  fs.writeFileSync(path.join(testDir, 'unreadable_video.mp4'), 'This is not a valid video file');
  console.log(`Created: ${path.join(testDir, 'unreadable_video.mp4')} (unreadable)`);

  console.log('\n✅ All test videos created!');
}
