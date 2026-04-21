(function () {
  const DEFAULT_MANIFEST = "examples/test-book/book-manifest.json";

  const state = {
    manifestUrl: "",
    manifest: null,
    nav: null,
    orderItems: [],
    sectionsById: new Map(),
    sectionByAssetHref: new Map(),
    pagePayloadCache: new Map(),
    activeSectionId: "",
    layoutPayloadCache: new Map(),
    glyphPayloadCache: new Map(),
    glyphImageCache: new Map(),
  };

  const dom = {
    manifestPath: document.getElementById("manifestPath"),
    loadBookButton: document.getElementById("loadBookButton"),
    loadExampleButton: document.getElementById("loadExampleButton"),
    statusText: document.getElementById("statusText"),
    tocList: document.getElementById("tocList"),
    tocMeta: document.getElementById("tocMeta"),
    sectionMeta: document.getElementById("sectionMeta"),
    bookTitle: document.getElementById("bookTitle"),
    bookAuthor: document.getElementById("bookAuthor"),
    renderModeBadge: document.getElementById("renderModeBadge"),
    readerBody: document.getElementById("readerBody"),
    devDetails: document.getElementById("devDetails"),
  };

  function setStatus(message, isError) {
    dom.statusText.textContent = message;
    dom.statusText.classList.toggle("error", Boolean(isError));
  }

  function resolveUrl(base, target) {
    return new URL(target, base).toString();
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return response.json();
  }

  async function readOrderChunks(entryUrl) {
    const items = [];
    const seen = new Set();
    let currentUrl = entryUrl;
    while (currentUrl && !seen.has(currentUrl)) {
      seen.add(currentUrl);
      const chunk = await fetchJson(currentUrl);
      const chunkItems = Array.isArray(chunk.items) ? chunk.items : [];
      items.push(...chunkItems);
      currentUrl = chunk.next ? resolveUrl(currentUrl, chunk.next) : "";
    }
    return items;
  }

  function buildSectionIndexes(orderItems) {
    state.sectionsById = new Map();
    state.sectionByAssetHref = new Map();
    for (const item of orderItems) {
      state.sectionsById.set(item.id, item);
      if (item.assetHref) {
        state.sectionByAssetHref.set(item.assetHref, item);
      }
    }
  }

  function renderToc(items) {
    dom.tocList.innerHTML = "";
    if (!items.length) {
      dom.tocMeta.textContent = "0 items";
      const empty = document.createElement("p");
      empty.className = "emptyState";
      empty.textContent = "No TOC payload entries were found.";
      dom.tocList.appendChild(empty);
      return;
    }

    dom.tocMeta.textContent = `${items.length} items`;
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tocButton";
      button.textContent = item.label || item.id || "Untitled";
      button.addEventListener("click", () => openTocTarget(item));
      button.dataset.target = item.target || "";
      dom.tocList.appendChild(button);
    }
  }

  function updateActiveToc(targetHref) {
    for (const node of dom.tocList.querySelectorAll(".tocButton")) {
      const isActive = node.dataset.target === targetHref;
      node.classList.toggle("active", isActive);
    }
  }

  async function loadPagePayload(pathOrUrl) {
    const url = resolveUrl(state.manifestUrl, pathOrUrl);
    if (!state.pagePayloadCache.has(url)) {
      state.pagePayloadCache.set(url, fetchJson(url));
    }
    return state.pagePayloadCache.get(url);
  }

  async function loadLayoutPayload(pathOrUrl) {
    const url = resolveUrl(state.manifestUrl, pathOrUrl);
    if (!state.layoutPayloadCache.has(url)) {
      state.layoutPayloadCache.set(url, fetchJson(url));
    }
    return state.layoutPayloadCache.get(url);
  }

  async function loadGlyphPayload(pathOrUrl) {
    const url = resolveUrl(state.manifestUrl, pathOrUrl);
    if (!state.glyphPayloadCache.has(url)) {
      state.glyphPayloadCache.set(url, fetchJson(url));
    }
    return state.glyphPayloadCache.get(url);
  }

  function loadGlyphImage(glyph, cacheKey) {
    if (!glyph) {
      return Promise.resolve(null);
    }
    if (state.glyphImageCache.has(cacheKey)) {
      return state.glyphImageCache.get(cacheKey);
    }
    const imagePromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = glyph.href ? resolveUrl(state.manifestUrl, glyph.href) : "";
    });
    state.glyphImageCache.set(cacheKey, imagePromise);
    return imagePromise;
  }

  async function prepareGlyphImages(blocks, glyphById, sectionId) {
    const tokenIds = new Set();
    for (const block of blocks) {
      for (const tokenId of block.glyphs || []) {
        tokenIds.add(tokenId);
      }
    }
    await Promise.all([...tokenIds].map((tokenId) => loadGlyphImage(glyphById.get(tokenId), `${sectionId}:${tokenId}`)));
  }

  async function renderSectionToCanvas(section, pagePayload, layoutPayload, glyphPayload) {
    const blocks = Array.isArray(pagePayload.blocks) ? pagePayload.blocks : [];
    const glyphById = new Map(((glyphPayload && glyphPayload.glyphs) || []).map((glyph) => [glyph.id, glyph]));
    await prepareGlyphImages(blocks, glyphById, section.id);

    const canvas = document.createElement("canvas");
    canvas.className = "pageCanvas";
    const width = 720;
    const paddingX = 54;
    const paddingY = 56;
    const headingGap = 24;
    const paragraphGap = 20;
    const ctx = canvas.getContext("2d");

    const titleHeight = 76;
    const contentHeight =
      blocks.reduce((sum, block) => sum + (block.height || 56), 0) +
      Math.max(0, blocks.length - 1) * paragraphGap;
    const height = paddingY * 2 + titleHeight + contentHeight;

    canvas.width = width * 2;
    canvas.height = Math.max(height, 640) * 2;
    ctx.scale(2, 2);

    ctx.fillStyle = "#fffdfa";
    ctx.fillRect(0, 0, width, Math.max(height, 640));

    ctx.fillStyle = "#18212f";
    ctx.font = "700 44px Georgia";
    ctx.fillText(section.id || "Section", paddingX, paddingY + 40);

    let cursorY = paddingY + titleHeight;
    for (const block of blocks) {
      const glyphIds = Array.isArray(block.glyphs) ? block.glyphs : [];
      const positions = Array.isArray(block.positions) ? block.positions : [];
      for (let index = 0; index < glyphIds.length; index += 1) {
        const glyphId = glyphIds[index];
        const glyph = glyphById.get(glyphId);
        const position = positions[index];
        if (!glyph || !position) continue;
        const image = await loadGlyphImage(glyph, `${section.id}:${glyphId}`);
        if (image) {
          ctx.drawImage(
            image,
            paddingX + (position.x || 0),
            cursorY + (position.y || 0),
            position.width || glyph.width,
            position.height || glyph.height
          );
        }
      }
      cursorY += (block.height || 56) + paragraphGap;
    }

    const stage = document.createElement("div");
    stage.className = "canvasStage";
    stage.appendChild(canvas);

    const meta = document.createElement("div");
    meta.className = "canvasMeta";
    const left = document.createElement("span");
    left.textContent = `${blocks.length} text blocks`;
    const right = document.createElement("span");
    right.textContent = `${layoutPayload.renderMode || "canvas-prototype"} · ${(glyphPayload && glyphPayload.count) || 0} local glyphs`;
    meta.appendChild(left);
    meta.appendChild(right);
    stage.appendChild(meta);
    return stage;
  }

  async function openSection(section) {
    if (!section) {
      return;
    }
    state.activeSectionId = section.id;
    const [pagePayload, layoutPayload, glyphPayload] = await Promise.all([
      loadPagePayload(section.page),
      loadLayoutPayload(section.layout),
      loadGlyphPayload(section.glyphs),
    ]);
    const blocks = Array.isArray(pagePayload.blocks) ? pagePayload.blocks : [];
    dom.readerBody.innerHTML = "";
    if (!blocks.length) {
      const empty = document.createElement("p");
      empty.className = "emptyState";
      empty.textContent = "This section does not contain render blocks yet.";
      dom.readerBody.appendChild(empty);
    } else {
      dom.readerBody.appendChild(await renderSectionToCanvas(section, pagePayload, layoutPayload, glyphPayload));
    }

    dom.sectionMeta.textContent = `${section.id} · ${blocks.length} text blocks`;
    dom.renderModeBadge.textContent = "Canvas Prototype";
    updateActiveToc(section.assetHref);
  }

  async function openTocTarget(item) {
    const target = String(item.target || "");
    const hashIndex = target.indexOf("#");
    const assetHref = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const section = state.sectionByAssetHref.get(assetHref);
    if (!section) {
      setStatus(`TOC target not found in reading order: ${target}`, true);
      return;
    }
    setStatus(`Opening ${item.label || section.id}`, false);
    await openSection(section);
  }

  function renderManifestDetails() {
    const manifest = state.manifest || {};
    const metadata = manifest.metadata || {};
    const author = metadata.creator || (Array.isArray(metadata.creators) ? metadata.creators.join(", ") : "");
    dom.bookTitle.textContent = metadata.title || metadata.bookTitle || "Untitled";
    dom.bookAuthor.textContent = author || "Unknown author";
    dom.devDetails.textContent = [
      `manifest: ${state.manifestUrl}`,
      `version: ${manifest.version || "?"}`,
      `navigation entry: ${manifest.navigation?.entry || "-"}`,
      `reading order entry: ${manifest.readingOrder?.entry || "-"}`,
      `layout entry: ${manifest.layout?.entry || "-"}`,
      `page data entry: ${manifest.pageData?.entry || "-"}`,
      `resources: ${(manifest.resources || []).length}`,
    ].join("\n");
  }

  async function loadBook(manifestPath) {
    const manifestUrl = resolveUrl(window.location.href, manifestPath);
    state.manifestUrl = manifestUrl;
    state.manifest = null;
    state.nav = null;
    state.orderItems = [];
    state.sectionsById = new Map();
    state.sectionByAssetHref = new Map();
    state.pagePayloadCache = new Map();
    state.activeSectionId = "";
    state.layoutPayloadCache = new Map();
    state.glyphPayloadCache = new Map();
    state.glyphImageCache = new Map();

    setStatus(`Loading manifest ${manifestPath}`, false);
    const manifest = await fetchJson(manifestUrl);
    state.manifest = manifest;

    const navUrl = resolveUrl(manifestUrl, manifest.navigation.entry);
    const orderUrl = resolveUrl(manifestUrl, manifest.readingOrder.entry);

    const [navPayload, orderItems] = await Promise.all([
      fetchJson(navUrl),
      readOrderChunks(orderUrl),
    ]);

    state.nav = navPayload;
    state.orderItems = orderItems;
    buildSectionIndexes(orderItems);
    renderManifestDetails();
    renderToc(Array.isArray(navPayload.items) ? navPayload.items : []);

    if (orderItems.length) {
      await openSection(orderItems[0]);
      setStatus(`Loaded ${orderItems.length} reading-order sections`, false);
    } else {
      dom.readerBody.innerHTML = '<p class="emptyState">No reading-order items were found.</p>';
      dom.sectionMeta.textContent = "No section loaded";
      setStatus("Manifest loaded, but reading order is empty.", true);
    }
  }

  async function handleLoadFromInput() {
    const manifestPath = String(dom.manifestPath.value || "").trim();
    if (!manifestPath) {
      setStatus("Enter a manifest path first.", true);
      return;
    }
    try {
      await loadBook(manifestPath);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to load book", true);
    }
  }

  function bootstrap() {
    const params = new URLSearchParams(window.location.search);
    const manifestPath = params.get("manifest") || DEFAULT_MANIFEST;
    dom.manifestPath.value = manifestPath;
    dom.loadBookButton.addEventListener("click", handleLoadFromInput);
    dom.loadExampleButton.addEventListener("click", async () => {
      dom.manifestPath.value = DEFAULT_MANIFEST;
      await handleLoadFromInput();
    });
    handleLoadFromInput();
  }

  bootstrap();
})();
