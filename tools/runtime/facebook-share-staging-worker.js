import { Buffer } from "buffer";
import jpeg from "jpeg-js";

globalThis.Buffer = globalThis.Buffer || Buffer;

const SOURCE_ORIGIN = "https://books-staging.reader.pub";
const API_SOURCE_ORIGIN = "https://readerpub-books-staging.pages.dev";
const SHARE_ORIGIN = "https://sh-staging.reader.pub";
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const FACEBOOK_OG_IMAGE_WIDTH = 1200;
const FACEBOOK_OG_IMAGE_HEIGHT = 630;
const META_PREVIEW_BOT_PATTERN = /\b(?:facebookexternalhit|facebot|facebookcatalog|facebookplatform|meta-externalagent|messengerbot|facebookmessengerbot|messengerexternalhit|messengerpreview)\b/i;
const META_APP_PREVIEW_PATTERN = /\b(?:FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger|MSGR|FBMessenger|MessengerForiOS|MessengerLite)\b/i;

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=600",
      "x-reader-route": "facebook-share-staging",
      ...headers,
    },
  });
}

function isPreviewBot(request) {
  const userAgent = String(request.headers.get("user-agent") || "");
  return META_PREVIEW_BOT_PATTERN.test(userAgent) || /\b(?:twitterbot|telegrambot|whatsapp|linkedinbot|slackbot)\b/i.test(userAgent);
}

function isFacebookPreviewBot(request) {
  const userAgent = String(request.headers.get("user-agent") || "");
  return META_PREVIEW_BOT_PATTERN.test(userAgent) || META_APP_PREVIEW_PATTERN.test(userAgent);
}

function shouldUseStandardCoverPreview(request) {
  const userAgent = String(request.headers.get("user-agent") || "");
  return /\b(?:twitterbot|telegrambot|whatsapp|linkedinbot|slackbot)\b/i.test(userAgent);
}

function shouldUseFacebookQuotePreview(request) {
  return isFacebookPreviewBot(request) || !shouldUseStandardCoverPreview(request);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCloudflarePagePreview(request) {
  return String(request.cf?.verifiedBotCategory || "").toLowerCase() === "page preview";
}

function getRequestOrigin(requestUrl) {
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

function rewriteShareHtml(html, sharePath, publicShareOrigin, options = {}) {
  const sourceShareUrl = `${SOURCE_ORIGIN}${sharePath}`;
  const publicShareUrl = `${publicShareOrigin}${sharePath}`;
  const shareId = sharePath.replace(/^\/s\//, "");
  let rewritten = String(html || "")
    .replace(new RegExp(escapeRegExp(sourceShareUrl), "g"), publicShareUrl)
    .replace(new RegExp(escapeRegExp(`${SOURCE_ORIGIN}/books/content/`), "g"), `${publicShareOrigin}/books/content/`)
    .replace(/<meta\s+http-equiv=["']refresh["'][^>]*>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?window\.location\.replace[\s\S]*?<\/script>/gi, "");

  rewritten = rewriteSelectionOgHtml(rewritten, shareId, publicShareOrigin, {
    facebook: !!options.facebook,
  });

  if (options.includeRedirectScript) {
    rewritten = rewritten.replace(
      /<\/body>/i,
      `<script>window.location.replace(${JSON.stringify(sourceShareUrl)});</script>\n</body>`
    );
  }
  return rewritten;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMetaTag(html, attrName, attrValue, content) {
  const escapedContent = escapeHtml(content);
  const attrPattern = escapeRegExp(attrValue);
  const tagPattern = new RegExp(`<meta\\s+[^>]*${attrName}=["']${attrPattern}["'][^>]*>`, "i");
  const replacement = `<meta ${attrName}="${attrValue}" content="${escapedContent}" />`;
  if (tagPattern.test(html)) {
    return html.replace(tagPattern, replacement);
  }
  return html.replace(/<\/head>/i, `${replacement}\n</head>`);
}

function extractMetaContent(html, attrName, attrValue) {
  const attrPattern = escapeRegExp(attrValue);
  const tagPattern = new RegExp(`<meta\\s+[^>]*${attrName}=["']${attrPattern}["'][^>]*>`, "i");
  const tag = String(html || "").match(tagPattern);
  if (!tag) return "";
  const content = String(tag[0]).match(/\scontent=["']([^"']*)["']/i);
  return content ? decodeHtml(content[1]) : "";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function removeMetaTag(html, attrName, attrValue) {
  const attrPattern = escapeRegExp(attrValue);
  const tagPattern = new RegExp(`<meta\\s+[^>]*${attrName}=["']${attrPattern}["'][^>]*>\\s*`, "gi");
  return String(html || "").replace(tagPattern, "");
}

function setTitleTag(html, title) {
  const replacement = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title>[\s\S]*?<\/title>/i, replacement);
  return html.replace(/<\/head>/i, `${replacement}\n</head>`);
}

function parseSelectionPreviewFields(html) {
  const rawTitle = extractMetaContent(html, "property", "og:title");
  const rawDescription =
    extractMetaContent(html, "property", "og:description") ||
    extractMetaContent(html, "name", "description");
  const rawImage = extractMetaContent(html, "property", "og:image");
  const description = normalizePlainText(rawDescription);
  let title = normalizePlainText(rawTitle);
  if (description && title.endsWith(` - ${description}`)) {
    title = title.slice(0, -(` - ${description}`).length).trim();
  } else {
    title = title.replace(/\s+-\s+by\s+.+$/i, "").trim();
  }
  title = formatReaderPubOgTitle(title);
  const author = extractAuthorFromDescription(description);
  const quote = extractQuoteFromDescription(description);
  return {
    title,
    description,
    author,
    quote,
    image: rawImage,
  };
}

function normalizePlainText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatReaderPubOgTitle(title) {
  const source = normalizePlainText(title).replace(/^ReaderPub\s*-\s*/i, "").trim();
  return `ReaderPub - ${source || "ReaderPub"}`;
}

function extractAuthorFromDescription(description) {
  const match = normalizePlainText(description).match(/^by\s+(.+?)\.\s*(?:"|$)/i);
  return match ? match[1].trim() : "";
}

function extractQuoteFromDescription(description) {
  const match = String(description || "").match(/"([^"]*)"/);
  return match ? normalizePlainText(match[1]) : "";
}

function rewriteSelectionOgHtml(html, shareId, publicShareOrigin, options = {}) {
  const fields = parseSelectionPreviewFields(html);
  const shareUrl = `${publicShareOrigin}/s/${encodeURIComponent(shareId)}`;
  const coverImage = fields.image || "";
  let rewritten = setTitleTag(html, fields.title);
  rewritten = setMetaTag(rewritten, "property", "og:site_name", "ReaderPub");
  rewritten = setMetaTag(rewritten, "property", "og:type", "article");
  rewritten = setMetaTag(rewritten, "property", "og:title", fields.title);
  rewritten = setMetaTag(rewritten, "property", "og:url", shareUrl);
  rewritten = setMetaTag(rewritten, "name", "twitter:title", fields.title);

  if (options.facebook) {
    const facebookImage = `${publicShareOrigin}/fb-og/${encodeURIComponent(shareId)}.jpg`;
    rewritten = removeMetaTag(rewritten, "property", "og:description");
    rewritten = removeMetaTag(rewritten, "name", "description");
    rewritten = removeMetaTag(rewritten, "name", "twitter:description");
    rewritten = setMetaTag(rewritten, "property", "og:image", facebookImage);
    rewritten = setMetaTag(rewritten, "property", "og:image:secure_url", facebookImage);
    rewritten = setMetaTag(rewritten, "property", "og:image:type", "image/jpeg");
    rewritten = setMetaTag(rewritten, "property", "og:image:width", String(FACEBOOK_OG_IMAGE_WIDTH));
    rewritten = setMetaTag(rewritten, "property", "og:image:height", String(FACEBOOK_OG_IMAGE_HEIGHT));
    rewritten = setMetaTag(rewritten, "name", "twitter:card", "summary_large_image");
    rewritten = setMetaTag(rewritten, "name", "twitter:image", facebookImage);
    return rewritten;
  }

  if (fields.description) {
    rewritten = setMetaTag(rewritten, "name", "description", fields.description);
    rewritten = setMetaTag(rewritten, "property", "og:description", fields.description);
    rewritten = setMetaTag(rewritten, "name", "twitter:description", fields.description);
  }
  if (coverImage) {
    rewritten = setMetaTag(rewritten, "property", "og:image", coverImage);
    rewritten = setMetaTag(rewritten, "property", "og:image:secure_url", coverImage);
    rewritten = setMetaTag(rewritten, "property", "og:image:type", "image/jpeg");
    rewritten = setMetaTag(rewritten, "property", "og:image:width", "600");
    rewritten = setMetaTag(rewritten, "property", "og:image:height", "900");
    rewritten = setMetaTag(rewritten, "name", "twitter:card", "summary");
    rewritten = setMetaTag(rewritten, "name", "twitter:image", coverImage);
  }
  return rewritten;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FONT_5X7 = {
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00000", "01100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "\"": ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]
};

function createRaster(width, height, color) {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
  }
  return { width, height, pixels };
}

function fillRect(image, x, y, width, height, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(image.width, Math.ceil(x + width));
  const y1 = Math.min(image.height, Math.ceil(y + height));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const idx = (yy * image.width + xx) * 3;
      image.pixels[idx] = color[0];
      image.pixels[idx + 1] = color[1];
      image.pixels[idx + 2] = color[2];
    }
  }
}

function drawGlyph(image, glyph, x, y, scale, color) {
  const rows = FONT_5X7[glyph] || FONT_5X7["?"];
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      if (rows[row][col] === "1") fillRect(image, x + col * scale, y + row * scale, scale, scale, color);
    }
  }
}

function drawGlyphStyled(image, glyph, x, y, scale, color, options = {}) {
  const rows = FONT_5X7[glyph] || FONT_5X7["?"];
  for (let row = 0; row < rows.length; row++) {
    const slant = options.italic ? Math.max(0, 6 - row) * Math.max(1, Math.floor(scale / 3)) : 0;
    for (let col = 0; col < rows[row].length; col++) {
      if (rows[row][col] !== "1") continue;
      fillRect(image, x + col * scale + slant, y + row * scale, scale, scale, color);
      if (options.bold) fillRect(image, x + col * scale + slant + Math.max(1, Math.floor(scale / 3)), y + row * scale, scale, scale, color);
    }
  }
}

function drawText(image, text, x, y, scale, color) {
  const normalized = normalizeBitmapText(text);
  let cursor = x;
  for (const char of normalized) {
    drawGlyph(image, char, cursor, y, scale, color);
    cursor += 6 * scale;
  }
}

function drawTextStyled(image, text, x, y, scale, color, options = {}) {
  const normalized = normalizeBitmapText(text);
  let cursor = x;
  for (const char of normalized) {
    drawGlyphStyled(image, char, cursor, y, scale, color, options);
    cursor += 6 * scale + (options.bold ? Math.max(1, Math.floor(scale / 3)) : 0);
  }
}

function normalizeBitmapText(text) {
  return String(text || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,:!?'"&-]/g, " ");
}

function measureText(text, scale) {
  return String(text || "").length * 6 * scale;
}

function wrapText(text, scale, maxWidth, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  let truncated = false;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const next = line ? `${line} ${word}` : word;
    if (measureText(next, scale) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (truncated && lines.length === maxLines && words.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > 3 ? `${last.slice(0, Math.max(0, last.length - 3))}...` : last;
  }
  return lines;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32be(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  out.set(u32be(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  out.set(u32be(crc32(crcInput)), 8 + data.length);
  return out;
}

function zlibStore(bytes) {
  const blocks = [];
  blocks.push(new Uint8Array([0x78, 0x01]));
  for (let offset = 0; offset < bytes.length; offset += 65535) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + 65535));
    const final = offset + chunk.length >= bytes.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = final;
    header[1] = chunk.length & 255;
    header[2] = (chunk.length >>> 8) & 255;
    const nlen = (~chunk.length) & 0xffff;
    header[3] = nlen & 255;
    header[4] = (nlen >>> 8) & 255;
    blocks.push(header, chunk);
  }
  blocks.push(new Uint8Array(u32be(adler32(bytes))));
  return concatBytes(blocks);
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function encodePng(image) {
  const scanlineLength = 1 + image.width * 3;
  const raw = new Uint8Array(scanlineLength * image.height);
  for (let y = 0; y < image.height; y++) {
    raw[y * scanlineLength] = 0;
    raw.set(image.pixels.subarray(y * image.width * 3, (y + 1) * image.width * 3), y * scanlineLength + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(image.width), 0);
  ihdr.set(u32be(image.height), 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibStore(raw)),
    pngChunk("IEND", new Uint8Array())
  ]);
}

function encodeJpeg(image, quality = 86) {
  const data = new Uint8Array(image.width * image.height * 4);
  for (let source = 0, target = 0; source < image.pixels.length; source += 3, target += 4) {
    data[target] = image.pixels[source];
    data[target + 1] = image.pixels[source + 1];
    data[target + 2] = image.pixels[source + 2];
    data[target + 3] = 255;
  }
  return jpeg.encode({ data, width: image.width, height: image.height }, quality).data;
}

function renderFacebookOgImage(title, description) {
  const image = createRaster(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, [241, 245, 249]);
  fillRect(image, 0, 0, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, [232, 238, 245]);
  fillRect(image, 44, 44, OG_IMAGE_WIDTH - 88, OG_IMAGE_HEIGHT - 88, [255, 255, 255]);
  fillRect(image, 44, 44, 10, OG_IMAGE_HEIGHT - 88, [24, 119, 242]);
  fillRect(image, 90, 92, 170, 170, [24, 119, 242]);
  fillRect(image, 114, 116, 122, 122, [255, 255, 255]);
  drawText(image, "RP", 137, 163, 10, [24, 119, 242]);
  drawText(image, "READERPUB", 320, 92, 7, [24, 119, 242]);
  const titleLines = wrapText(title || "ReaderPub", 7, 800, 3);
  let y = 150;
  for (const line of titleLines) {
    drawText(image, line, 320, y, 7, [15, 23, 42]);
    y += 64;
  }
  const descriptionLines = wrapText(description || "", 4, 820, 5);
  y += 18;
  for (const line of descriptionLines) {
    drawText(image, line, 320, y, 4, [71, 85, 105]);
    y += 38;
  }
  drawText(image, "FB-BOOKS-STAGING.READER.PUB", 86, 548, 4, [100, 116, 139]);
  return image;
}

function drawCoverImage(target, decoded, x, y, width, height) {
  const scale = Math.max(width / decoded.width, height / decoded.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.max(0, (decoded.width - sourceWidth) / 2);
  const sourceY = Math.max(0, (decoded.height - sourceHeight) / 2);
  for (let yy = 0; yy < height; yy++) {
    const sy = Math.min(decoded.height - 1, Math.max(0, Math.floor(sourceY + yy / scale)));
    for (let xx = 0; xx < width; xx++) {
      const sx = Math.min(decoded.width - 1, Math.max(0, Math.floor(sourceX + xx / scale)));
      const sourceIndex = (sy * decoded.width + sx) * 4;
      const targetIndex = ((y + yy) * target.width + (x + xx)) * 3;
      target.pixels[targetIndex] = decoded.data[sourceIndex];
      target.pixels[targetIndex + 1] = decoded.data[sourceIndex + 1];
      target.pixels[targetIndex + 2] = decoded.data[sourceIndex + 2];
    }
  }
}

async function renderFacebookOgPng(fields) {
  const image = createRaster(FACEBOOK_OG_IMAGE_WIDTH, FACEBOOK_OG_IMAGE_HEIGHT, [238, 241, 243]);
  const coverWidth = 498;
  if (fields.image) {
    try {
      const coverResponse = await fetch(fields.image, {
        headers: { "user-agent": "facebookexternalhit/1.1" },
      });
      if (coverResponse.ok) {
        const decoded = jpeg.decode(new Uint8Array(await coverResponse.arrayBuffer()), { useTArray: true });
        drawCoverImage(image, decoded, 0, 0, coverWidth, FACEBOOK_OG_IMAGE_HEIGHT);
      }
    } catch (_error) {
      fillRect(image, 0, 0, coverWidth, FACEBOOK_OG_IMAGE_HEIGHT, [218, 224, 230]);
    }
  } else {
    fillRect(image, 0, 0, coverWidth, FACEBOOK_OG_IMAGE_HEIGHT, [218, 224, 230]);
  }
  fillRect(image, coverWidth, 0, FACEBOOK_OG_IMAGE_WIDTH - coverWidth, FACEBOOK_OG_IMAGE_HEIGHT, [231, 235, 238]);
  const quote = fields.quote ? `"${fields.quote}"` : `"${fields.description || fields.title || "ReaderPub"}"`;
  const quoteLines = wrapText(quote, 5, 610, 8);
  let y = 52;
  for (const line of quoteLines) {
    drawText(image, line, 545, y, 5, [31, 42, 51]);
    y += 48;
  }
  const authorY = Math.min(Math.max(y + 34, 430), 548);
  drawTextStyled(image, fields.author || "ReaderPub", 545, authorY, 6, [31, 42, 51], { bold: true, italic: true });
  return image;
}

function renderFacebookOgSvg(fields) {
  const cover = fields.image || "";
  const quote = fields.quote ? `"${fields.quote}"` : `"${fields.description || fields.title || "ReaderPub"}"`;
  const author = fields.author || "ReaderPub";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${FACEBOOK_OG_IMAGE_WIDTH}" height="${FACEBOOK_OG_IMAGE_HEIGHT}" viewBox="0 0 ${FACEBOOK_OG_IMAGE_WIDTH} ${FACEBOOK_OG_IMAGE_HEIGHT}">
  <rect width="1200" height="630" fill="#eef1f3"/>
  <image href="${escapeXml(cover)}" x="0" y="0" width="498" height="630" preserveAspectRatio="xMidYMid slice"/>
  <rect x="498" y="0" width="702" height="630" fill="#e7ebee"/>
  <foreignObject x="545" y="52" width="610" height="360">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Georgia, 'Times New Roman', serif; font-size: 40px; line-height: 1.32; color: #1f2a33; overflow-wrap: break-word;">
      ${escapeXml(quote)}
    </div>
  </foreignObject>
  <foreignObject x="545" y="430" width="610" height="90">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Georgia, 'Times New Roman', serif; font-size: 42px; line-height: 1.2; font-weight: 700; font-style: italic; color: #1f2a33;">
      ${escapeXml(author)}
    </div>
  </foreignObject>
</svg>`;
}

async function fetchSourceShareHtml(sharePath, request, options = {}) {
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("user-agent", options.userAgent || "facebookexternalhit/1.1");
  const upstream = await fetch(`${SOURCE_ORIGIN}${sharePath}`, {
    headers: upstreamHeaders,
    redirect: "manual",
  });
  const contentType = String(upstream.headers.get("content-type") || "");
  if (!upstream.ok || !contentType.includes("text/html")) return "";
  return upstream.text();
}

async function handleFacebookOgImage(request, url) {
  const match = url.pathname.match(/^\/fb-og\/([A-Za-z0-9_-]{4,64})\.(png|jpe?g|svg)$/);
  if (!match) return textResponse("Not found", 404, { "cache-control": "no-store" });
  const html = await fetchSourceShareHtml(`/s/${match[1]}`, request, {
    userAgent: "WhatsApp/2.24 ReaderPub-OG-Image-Source"
  });
  if (!html) return textResponse("Not found", 404, { "cache-control": "no-store" });
  if (match[2] === "svg") {
    const fields = parseSelectionPreviewFields(html);
    const publicOrigin = getRequestOrigin(request.url);
    if (fields.image) fields.image = fields.image.replace(new RegExp(escapeRegExp(`${SOURCE_ORIGIN}/books/content/`), "g"), `${publicOrigin}/books/content/`);
    return new Response(renderFacebookOgSvg(fields), {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=600",
        "x-reader-route": "facebook-share-og-image",
        "x-robots-tag": "all",
      },
    });
  }
  const fields = parseSelectionPreviewFields(html);
  return new Response(encodeJpeg(await renderFacebookOgPng(fields)), {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=300, s-maxage=600",
      "x-reader-route": "facebook-share-og-image",
      "x-robots-tag": "all",
    },
  });
}

async function handleContentProxy(request, url) {
  const upstreamUrl = new URL(url.pathname + url.search, SOURCE_ORIGIN);
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("host", new URL(SOURCE_ORIGIN).host);
  upstreamHeaders.set("user-agent", "facebookexternalhit/1.1");
  const upstream = await fetch(upstreamUrl.toString(), {
    headers: upstreamHeaders,
    redirect: "manual",
  });
  const headers = new Headers(upstream.headers);
  headers.set("cache-control", "public, max-age=3600, s-maxage=3600");
  headers.set("x-reader-route", "facebook-share-content-proxy");
  headers.set("x-robots-tag", "all");
  headers.delete("content-security-policy");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function handleShortShareApi(request, url) {
  const upstreamUrl = new URL(url.pathname + url.search, API_SOURCE_ORIGIN);
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("host", new URL(API_SOURCE_ORIGIN).host);
  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const headers = new Headers(upstream.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("x-reader-route", "facebook-share-staging-api");
  const contentType = String(headers.get("content-type") || "");
  if (!contentType.includes("application/json")) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  let data = null;
  try {
    data = await upstream.clone().json();
  } catch (_error) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  if (data && data.shareId && data.url) {
    data.url = `${SHARE_ORIGIN}/s/${encodeURIComponent(String(data.shareId))}`;
  }
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  return new Response(JSON.stringify(data), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (
      url.hostname === "books-staging.reader.pub" &&
      (
        url.pathname === "/books/api/ss" ||
        url.pathname === "/api/ss" ||
        url.pathname === "/books/reader/api/ss" ||
        url.pathname === "/books/reader1/api/ss" ||
        url.pathname === "/books/api/selection-share" ||
        url.pathname === "/api/selection-share" ||
        url.pathname === "/books/reader/api/selection-share" ||
        url.pathname === "/books/reader1/api/selection-share"
      )
    ) {
      return handleShortShareApi(request, url);
    }

    if (url.pathname === "/robots.txt") {
      return textResponse(
        [
          "User-agent: *",
          "Disallow:",
          "",
        ].join("\n")
      );
    }

    if (/^\/fb-og\/[A-Za-z0-9_-]{4,64}\.(png|jpe?g|svg)$/.test(url.pathname)) {
      return handleFacebookOgImage(request, url);
    }

    if (url.pathname.startsWith("/books/content/")) {
      return handleContentProxy(request, url);
    }

    if (!/^\/s\/[A-Za-z0-9_-]{4,64}$/.test(url.pathname)) {
      return textResponse("Not found", 404, { "cache-control": "no-store" });
    }

    const sourceHtml = await fetchSourceShareHtml(url.pathname, request);
    if (!sourceHtml) return textResponse("Not found", 404, { "cache-control": "no-store" });

    const facebookQuotePreview = shouldUseFacebookQuotePreview(request);
    const html = rewriteShareHtml(sourceHtml, url.pathname, getRequestOrigin(request.url), {
      facebook: facebookQuotePreview,
      includeRedirectScript: !facebookQuotePreview && !(isCloudflarePagePreview(request) || isPreviewBot(request)),
    });
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=600",
        "x-reader-route": "facebook-share-staging",
        "x-robots-tag": "all",
      },
    });
  },
};
