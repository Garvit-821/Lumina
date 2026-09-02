const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPng(width, height) {
  // CRC32 implementation
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
  }

  // Header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8 bits per channel
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Scanlines (RGBA)
  const rawData = [];
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter byte 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Diamond distance: |dx| + |dy|
      const diamondDist = (Math.abs(dx) + Math.abs(dy)) / (width * 0.38);

      let r = 11, g = 15, b = 25, a = 255; // Background obsidian #0b0f19

      if (dist <= radius) {
        // Outer glow / circle border
        if (dist >= radius - 2) {
          // Gradient border #38bdf8 to #c084fc
          const t = (x + y) / (width + height);
          r = Math.round(56 + t * (192 - 56));
          g = Math.round(189 + t * (132 - 189));
          b = Math.round(248 + t * (252 - 248));
        } else if (diamondDist <= 1.0) {
          // Lumina Diamond Star
          const t = (x + y) / (width + height);
          r = Math.round(56 + t * (192 - 56));
          g = Math.round(189 + t * (132 - 189));
          b = Math.round(248 + t * (252 - 248));

          // Inner sparkle center
          if (dist <= 6) {
            r = 255;
            g = 255;
            b = 255;
          }
        } else {
          // Inner radial ambient glow
          const glow = Math.max(0, 1 - dist / radius);
          r = Math.round(11 + glow * 40);
          g = Math.round(15 + glow * 80);
          b = Math.round(25 + glow * 120);
        }
      } else {
        // Transparent outside circular badge
        a = 0;
        r = 0;
        g = 0;
        b = 0;
      }

      rawData.push(r, g, b, a);
    }
  }

  const compressedData = zlib.deflateSync(Buffer.from(rawData));
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const pngBuffer = createPng(128, 128);
const outPath = path.join(__dirname, '..', 'resources', 'lumina-icon.png');
fs.writeFileSync(outPath, pngBuffer);
console.log(`Saved 128x128 PNG icon to ${outPath}`);
