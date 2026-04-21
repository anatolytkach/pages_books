import fs from "fs";

function readUInt24BE(buffer, offset) {
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

function probePng(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function probeGif(buffer) {
  if (buffer.length < 10) return null;
  const signature = buffer.slice(0, 6).toString("ascii");
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8)
  };
}

function probeJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    const isSofMarker =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSofMarker && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }
    offset += segmentLength;
  }
  return null;
}

function probeWebp(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.slice(0, 4).toString("ascii") !== "RIFF") return null;
  if (buffer.slice(8, 12).toString("ascii") !== "WEBP") return null;
  const chunkType = buffer.slice(12, 16).toString("ascii");
  if (chunkType === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + readUInt24BE(buffer, 24),
      height: 1 + readUInt24BE(buffer, 27)
    };
  }
  if (chunkType === "VP8 " && buffer.length >= 30) {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  return null;
}

export function probeImageDimensions(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return probePng(buffer) || probeGif(buffer) || probeJpeg(buffer) || probeWebp(buffer);
}
