const SOURCE_ORIGIN = "https://books-staging.reader.pub";
const API_SOURCE_ORIGIN = "https://readerpub-books-staging.pages.dev";
const SHARE_ORIGIN = "https://fb-books-staging.reader.pub";
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

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
  return /\b(?:facebookexternalhit|facebot|twitterbot|telegrambot|whatsapp|linkedinbot|slackbot)\b/i.test(userAgent);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteShareHtml(html, sharePath) {
  const sourceShareUrl = `${SOURCE_ORIGIN}${sharePath}`;
  const publicShareUrl = `${SHARE_ORIGIN}${sharePath}`;
  const shareId = sharePath.replace(/^\/s\//, "");
  const facebookImageUrl = `${SHARE_ORIGIN}/fb-og/${encodeURIComponent(shareId)}.png`;
  return setMetaTag(
    setMetaTag(
      setMetaTag(
        setMetaTag(
          setMetaTag(
            setMetaTag(
              String(html || "")
    .replace(new RegExp(escapeRegExp(sourceShareUrl), "g"), publicShareUrl)
    .replace(/<meta\s+http-equiv=["']refresh["'][^>]*>/gi, "")
                .replace(/<script\b[^>]*>[\s\S]*?window\.location\.replace[\s\S]*?<\/script>/gi, ""),
              "property",
              "og:image",
              facebookImageUrl
            ),
            "property",
            "og:image:secure_url",
            facebookImageUrl
          ),
          "property",
          "og:image:type",
          "image/png"
        ),
        "property",
        "og:image:width",
        String(OG_IMAGE_WIDTH)
      ),
      "property",
      "og:image:height",
      String(OG_IMAGE_HEIGHT)
    ),
    "name",
    "twitter:image",
    facebookImageUrl
  );
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

function drawText(image, text, x, y, scale, color) {
  const normalized = String(text || "").toUpperCase().replace(/[^A-Z0-9 .,:!?'"&-]/g, " ");
  let cursor = x;
  for (const char of normalized) {
    drawGlyph(image, char, cursor, y, scale, color);
    cursor += 6 * scale;
  }
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
  return encodePng(image);
}

async function fetchSourceShareHtml(sharePath, request) {
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("user-agent", request.headers.get("user-agent") || "facebookexternalhit/1.1");
  const upstream = await fetch(`${SOURCE_ORIGIN}${sharePath}`, {
    headers: upstreamHeaders,
    redirect: "manual",
  });
  const contentType = String(upstream.headers.get("content-type") || "");
  if (!upstream.ok || !contentType.includes("text/html")) return "";
  return upstream.text();
}

async function handleFacebookOgImage(request, url) {
  const match = url.pathname.match(/^\/fb-og\/([A-Za-z0-9_-]{4,64})\.png$/);
  if (!match) return textResponse("Not found", 404, { "cache-control": "no-store" });
  const html = await fetchSourceShareHtml(`/s/${match[1]}`, request);
  if (!html) return textResponse("Not found", 404, { "cache-control": "no-store" });
  const title = extractMetaContent(html, "property", "og:title");
  const description = extractMetaContent(html, "property", "og:description");
  return new Response(renderFacebookOgImage(title, description), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300, s-maxage=600",
      "x-reader-route": "facebook-share-og-image",
      "x-robots-tag": "all",
    },
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
    data.url = `${SOURCE_ORIGIN}/s/${encodeURIComponent(String(data.shareId))}`;
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
          "User-agent: facebookexternalhit",
          "Disallow:",
          "Allow: /",
          "",
          "User-agent: Facebot",
          "Disallow:",
          "Allow: /",
          "",
          "User-agent: *",
          "Disallow:",
          "Allow: /",
          "",
        ].join("\n")
      );
    }

    if (/^\/fb-og\/[A-Za-z0-9_-]{4,64}\.png$/.test(url.pathname)) {
      return handleFacebookOgImage(request, url);
    }

    if (!/^\/s\/[A-Za-z0-9_-]{4,64}$/.test(url.pathname)) {
      return textResponse("Not found", 404, { "cache-control": "no-store" });
    }

    const sourceUrl = `${SOURCE_ORIGIN}${url.pathname}`;
    if (!isPreviewBot(request)) {
      return Response.redirect(sourceUrl, 302);
    }

    const sourceHtml = await fetchSourceShareHtml(url.pathname, request);
    if (!sourceHtml) return textResponse("Not found", 404, { "cache-control": "no-store" });

    const html = rewriteShareHtml(sourceHtml, url.pathname);
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
