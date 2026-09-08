// Script to generate placeholder PWA icons
// Run: node generate-icons.js

const fs = require('fs');
const path = require('path');

// Minimal valid PNG generator (1x1 pixel, will be replaced with real icons later)
function createPNG(size) {
  // Create a simple 1x1 PNG and we'll note it needs replacement
  // For now, we create minimal valid PNG files
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(2, 9); // color type (RGB)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // IDAT chunk - create uncompressed image data
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < size; x++) {
      // Simple gradient pattern - orange/red tones for "Los 2 Hermanos"
      const r = Math.floor(200 + (x / size) * 55);
      const g = Math.floor(100 + (y / size) * 50);
      const b = Math.floor(50);
      rawData.push(r, g, b);
    }
  }
  
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const idatChunk = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [192, 512];
sizes.forEach(size => {
  const png = createPNG(size);
  const filePath = path.join(iconsDir, `icon-${size}x${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created: icons/icon-${size}x${size}.png (${png.length} bytes)`);
});

console.log('\n✅ Placeholder icons created!');
console.log('⚠️  Replace these with your actual app icons for production.');
