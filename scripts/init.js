/* -------------------------------------------
 * art-for-daggerheart — v14 Compendium Art integration
 * No compendium edits; supports spaces, wildcards, circle modes, and rings.
 * Dynamic system support based on module.json configuration.
 * ------------------------------------------- */

const MODULE_ID = "art-for-daggerheart";

const TOKEN_MODE = {
  WILDCARDS: "wildcards",
  WILDCARDS_RINGS: "wildcardsRings",
  CIRCLE: "circle",
  CIRCLE_RINGS: "circleRings",
  PORTRAIT_RINGS: "portraitRings"
};

// Cache for preloaded mapping data
let SUPPORTED_PACKS = new Set();
let MAPPING_DATA_LOADED = false;

function isWildcardMode(m) {
  return m === TOKEN_MODE.WILDCARDS || m === TOKEN_MODE.WILDCARDS_RINGS;
}
function hasRings(m) {
  return m === TOKEN_MODE.WILDCARDS_RINGS || m === TOKEN_MODE.CIRCLE_RINGS || m === TOKEN_MODE.PORTRAIT_RINGS;
}

/**
 * Preload all mapping files and cache supported pack collections
 * This runs during module initialization to avoid async issues during art application
 */
async function preloadMappingData() {
  const module = game.modules.get(MODULE_ID);
  const compendiumMappings = module?.flags?.compendiumArtMappings || {};
  
  SUPPORTED_PACKS.clear();
  
  debugLog("Preloading mapping data...");
  
  for (const [systemKey, config] of Object.entries(compendiumMappings)) {
    if (config?.mapping && typeof config.mapping === 'string') {
      try {
        debugLog(`Loading mapping file: ${config.mapping}`);
        const response = await fetch(config.mapping);
        if (response.ok) {
          const mappingData = await response.json();
          
          // Add all pack collection IDs from this mapping file to our supported set
          for (const packId of Object.keys(mappingData)) {
            SUPPORTED_PACKS.add(packId);
            debugLog(`Added supported pack: ${packId} (from ${systemKey})`);
          }
        } else {
          debugWarn(`Failed to fetch mapping file ${config.mapping}: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        debugError(`Error loading mapping file ${config.mapping}:`, error);
      }
    }
  }
  
  MAPPING_DATA_LOADED = true;
  debugInfo(`Mapping data preloaded. Supported packs: ${Array.from(SUPPORTED_PACKS).join(', ')}`);
}

/**
 * Check if a pack collection is supported (synchronous after preload)
 * @param {string} packId - The pack collection ID to check
 * @returns {boolean} Whether this pack is supported
 */
function isPackSupported(packId) {
  if (!MAPPING_DATA_LOADED) {
    debugWarn(`Mapping data not yet loaded, but checking pack: ${packId}`);
    return false;
  }
  
  const supported = SUPPORTED_PACKS.has(packId);
  debugLog(`Pack ${packId} support check: ${supported}`);
  return supported;
}

/** Build token paths from a portrait like ".../portraits/<Name with spaces>.<ext>" */
function buildPathsFromActorImg(actorImg) {
  const m = /^(.*)\/portraits\/([^/]+)(\.[^.\/]+)$/.exec(actorImg);
  if (!m) return {};
  const [, root, baseName, ext] = m;
  const tokensDir = `${root}/tokens`;
  const circleDir = `${root}/circle`;
  const wildcardSrc = `${tokensDir}/${encodeURIComponent(baseName)}*${ext}`; // encode only filename for wildcard
  const circleSrc   = `${circleDir}/${baseName}${ext}`;                      // spaces OK
  return { wildcardSrc, circleSrc, ext };
}

/* ---------------- Debug helpers ---------------- */
function debugOn() { return game.settings.get(MODULE_ID, "debugLogging"); }
function debugLog(...args) { if (debugOn()) console.log(`[${MODULE_ID}]`, ...args); }
function debugInfo(...args) { if (debugOn()) console.info(`[${MODULE_ID}]`, ...args); }
function debugWarn(...args) { if (debugOn()) console.warn(`[${MODULE_ID}]`, ...args); }
function debugError(...args) { if (debugOn()) console.error(`[${MODULE_ID}]`, ...args); }
function debugNotify(message, type = "info") { if (debugOn()) ui.notifications?.[type](`[${MODULE_ID}] ${message}`); }

/* ---------------- Settings ---------------- */
function registerSettings() {
  game.settings.register(MODULE_ID, "tokenAutoRotate", {
    name: "토큰 자동 회전을 코어와 동기화",
    hint: "코어의 토큰 자동 회전 설정에 그대로 반영합니다. 여기서 켜고 끄면 코어 설정도 함께 바뀌며, 그렇지 않으면 코어 설정은 건드리지 않습니다.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: async (value) => {
      try { await game.settings.set("core", "tokenAutoRotate", value); }
      catch (err) { debugWarn("Could not set core.tokenAutoRotate", err); }
    }
  });

  game.settings.register(MODULE_ID, "debugLogging", {
    name: "디버그 로깅",
    hint: "활성화하면 모듈이 상세한 진단 정보를 콘솔에 출력합니다.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "ringColor", {
    name: "토큰 링 색상",
    hint: "링 모드가 활성화되었을 때 토큰 링의 색상을 선택합니다.",
    scope: "world",
    config: true,
    type: new foundry.data.fields.ColorField({}),
    default: "#8f0000",
    requiresReload: true,
    onChange: (value) => debugNotify(`Ring color updated to ${value}.`)
  });

  game.settings.register(MODULE_ID, "tokenMode", {
    name: "토큰 모드",
    hint: "토큰의 소스와 스타일을 선택합니다.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [TOKEN_MODE.WILDCARDS]: "와일드카드만",
      [TOKEN_MODE.WILDCARDS_RINGS]: "와일드카드 + 링",
      [TOKEN_MODE.CIRCLE]: "원형만",
      [TOKEN_MODE.CIRCLE_RINGS]: "원형 + 링",
      [TOKEN_MODE.PORTRAIT_RINGS]: "초상화 + 링"
    },
    default: TOKEN_MODE.WILDCARDS_RINGS,
    requiresReload: true,
    onChange: (value) => debugNotify(`Token mode changed to ${value}.`)
  });

  game.settings.register(MODULE_ID, "tokenWidth", {
    name: "토큰 너비",
    hint: "토큰의 너비를 설정합니다 (1.0 = 기본 크기).",
    scope: "world",
    config: true,
    type: Number,
    default: 1.0,
    requiresReload: true,
    onChange: (value) => debugNotify(`Token width changed to ${value}.`)
  });

  game.settings.register(MODULE_ID, "tokenHeight", {
    name: "토큰 높이",
    hint: "토큰의 높이를 설정합니다 (1.0 = 기본 크기).",
    scope: "world",
    config: true,
    type: Number,
    default: 1.0,
    requiresReload: true,
    onChange: (value) => debugNotify(`Token height changed to ${value}.`)
  });

  game.settings.register(MODULE_ID, "imageFitMode", {
    name: "이미지 맞춤 모드",
    hint: "토큰 이미지가 토큰 프레임 안에 어떻게 맞춰질지 선택합니다.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "fill": "채우기",
      "contain": "맞춰 넣기",
      "cover": "꽉 채우기",
      "width": "너비 전체",
      "height": "높이 전체"
    },
    default: "contain",
    requiresReload: true,
    onChange: (value) => debugNotify(`Image fit mode changed to ${value}.`)
  });
}

/* ---------------- Core: apply compendium art ---------------- */
Hooks.on("applyCompendiumArt", (documentClass, source, pack, art) => {
  // Be tolerant to different pack shapes
  const packId = pack?.metadata?.id ?? pack?.collection;
  
  // Check if mapping data is loaded and if this pack is supported
  if (!MAPPING_DATA_LOADED) {
    debugWarn(`Mapping data not loaded yet for pack ${packId}. This should not happen if preload worked correctly.`);
    return;
  }
  
  if (!isPackSupported(packId)) {
    debugLog(`Pack ${packId} not supported, skipping`);
    return;
  }

  debugLog(`Processing compendium art for pack: ${packId}, actor: ${source.name}`);

  const mode = game.settings.get(MODULE_ID, "tokenMode");
  const tokenWidth = game.settings.get(MODULE_ID, "tokenWidth");
  const tokenHeight = game.settings.get(MODULE_ID, "tokenHeight");
  const imageFitMode = game.settings.get(MODULE_ID, "imageFitMode");

  // Normalize ring color (ColorField may return a Color object or a string)
  const rawRing = game.settings.get(MODULE_ID, "ringColor");
  const ringColor = (foundry?.utils?.Color?.from?.(rawRing)?.css) ?? String(rawRing);

  // Ensure token structure exists
  source.prototypeToken ??= {};
  source.prototypeToken.texture ??= {};
  source.prototypeToken.ring ??= { colors: {}, subject: {} };

  // 1) Portrait → token image (wildcards, circle, or portrait+rings)
  if (typeof art?.actor === "string" && art.actor) {
    source.img = art.actor;
    const { wildcardSrc, circleSrc } = buildPathsFromActorImg(art.actor);

    if (mode === TOKEN_MODE.PORTRAIT_RINGS) {
      // Use portrait directly with rings
      source.prototypeToken.texture.src = art.actor;
      source.prototypeToken.randomImg = false;
      debugLog(`Set portrait with rings: ${art.actor}`);
    } else if (isWildcardMode(mode) && wildcardSrc) {
      source.prototypeToken.texture.src = wildcardSrc; // e.g., ".../tokens/Cult%20Adept*.webp"
      source.prototypeToken.randomImg = true;
      debugLog(`Set wildcard token: ${wildcardSrc}`);
    } else if (circleSrc) {
      source.prototypeToken.texture.src = circleSrc;   // e.g., ".../circle/Cult Adept.webp"
      source.prototypeToken.randomImg = false;
      debugLog(`Set circle token: ${circleSrc}`);
    } else {
      // Fallback: use the portrait itself
      source.prototypeToken.texture.src = art.actor;
      source.prototypeToken.randomImg = false;
      debugLog(`Set fallback token (portrait): ${art.actor}`);
    }

    // Apply texture settings
    source.prototypeToken.width = tokenWidth;
    source.prototypeToken.height = tokenHeight;
    source.prototypeToken.texture.fit = imageFitMode;
  }

  // 2) Dynamic Token Ring
  const ringEnabled = hasRings(mode);
  source.prototypeToken.ring.enabled = ringEnabled;     // boolean
  source.prototypeToken.ring.effects = 1;
  source.prototypeToken.ring.colors.ring = ringEnabled ? ringColor : null;
  source.prototypeToken.ring.colors.background = null;
  source.prototypeToken.ring.subject.scale = ringEnabled ? 0.8 : 1.0;
  source.prototypeToken.ring.subject.texture = null;

  debugLog("CompendiumArt applied", {
    collection: packId,
    name: source.name,
    mode,
    img: source.img,
    tokenSrc: source.prototypeToken.texture?.src,
    width: source.prototypeToken.width,
    height: source.prototypeToken.height,
    fit: source.prototypeToken.texture?.fit,
    ringEnabled,
    ringColor,
    randomImg: source.prototypeToken.randomImg
  });
});

/* ===========================================================
 * Item Compendium Art (e.g., Daggerheart domain cards)
 * -----------------------------------------------------------
 * Foundry's built-in compendium art system (game.compendiumArt /
 * the "applyCompendiumArt" hook) is hardcoded to Actor documents
 * only — it always resolves "Compendium.<pack>.Actor.<id>" and the
 * art is applied in Actor#_initializeSource. Items (domain cards
 * live in the system "domains" pack as Item documents) therefore
 * never receive art that way. We replicate the behaviour for Items:
 *   1) patch the compendium INDEX img  -> browser/list thumbnails
 *   2) wrap Item#_initializeSource      -> compendium sheets + cards
 *      already embedded on existing characters (matched by
 *      _stats.compendiumSource, default art only)
 *   3) preCreateItem hook               -> bake art into newly added
 *      copies so it persists on the character
 *
 * Mapping file shape (mappings/<file>.json):
 *   { "<pack collection id>": { "<itemId>": { "item": "<img path>" } } }
 * Declared via module flag "itemArtMappings" keyed by system id.
 * =========================================================== */

const ITEM_ART_BY_UUID = new Map(); // "Compendium.<pack>.Item.<id>" -> img path
const ITEM_ART_PACKS = new Map();   // packName -> { itemId: imgPath }
let ITEM_ART_LOADED = false;
let _itemArtLoadPromise = null;

// img values we are allowed to override on already-existing (embedded/world)
// copies. This keeps user-customized art intact while still replacing the
// untouched system defaults: domain cards use a system asset icon, while
// ancestries/communities/subclasses default to core Foundry "icons/..." art.
const ITEM_ART_DEFAULT_HINTS = ["/assets/icons/domains/domain-card/"];

function isReplaceableItemImg(img) {
  if (!img) return true;
  if (img.startsWith("icons/")) return true; // core Foundry generic icons = default art
  return ITEM_ART_DEFAULT_HINTS.some(h => img.includes(h));
}

/** Fetch & parse all item-art mapping files declared for the active system. */
async function loadItemArtMappings() {
  ITEM_ART_BY_UUID.clear();
  ITEM_ART_PACKS.clear();
  try {
    const module = game.modules.get(MODULE_ID);
    const systemId = game.system?.id;
    const entry = module?.flags?.itemArtMappings?.[systemId];
    // Support a single "mapping" string or a "mappings" array of files.
    const files = entry?.mappings ?? (entry?.mapping ? [entry.mapping] : []);
    if (!files.length) { ITEM_ART_LOADED = true; return; }

    for (const file of files) {
      try {
        debugLog(`Loading item art mapping: ${file}`);
        const res = await fetch(file);
        if (!res.ok) {
          debugWarn(`Failed to fetch item art mapping ${file}: ${res.status} ${res.statusText}`);
          continue;
        }
        const data = await res.json();
        for (const [packName, items] of Object.entries(data)) {
          const byId = ITEM_ART_PACKS.get(packName) ?? {};
          for (const [itemId, info] of Object.entries(items)) {
            const img = typeof info === "string" ? info : info?.item;
            if (!img) continue;
            byId[itemId] = img;
            ITEM_ART_BY_UUID.set(`Compendium.${packName}.Item.${itemId}`, img);
          }
          ITEM_ART_PACKS.set(packName, byId);
        }
      } catch (e) {
        debugError(`Error loading item art mapping ${file}:`, e);
      }
    }
    debugInfo(`Item art loaded: ${ITEM_ART_BY_UUID.size} entries across ${ITEM_ART_PACKS.size} pack(s).`);
  } catch (e) {
    debugError("Error loading item art mappings:", e);
  }
  ITEM_ART_LOADED = true;
}

/** Resolve the art path for an item source during construction (or null). */
function resolveItemArt(source, options) {
  // Compendium-resident item: match by its own pack UUID (always override).
  const packId = options?.pack;
  if (packId) {
    const pack = game.packs?.get(packId);
    const uuid = pack?.getUuid?.(source._id);
    return (uuid && ITEM_ART_BY_UUID.has(uuid)) ? ITEM_ART_BY_UUID.get(uuid) : null;
  }
  // World / embedded copy: match by compendiumSource, only override default art.
  const cs = source?._stats?.compendiumSource;
  if (cs && ITEM_ART_BY_UUID.has(cs) && isReplaceableItemImg(source.img)) {
    return ITEM_ART_BY_UUID.get(cs);
  }
  return null;
}

/** Wrap Item#_initializeSource to apply our art (mirrors core Actor behaviour). */
function installItemArtSourcePatch() {
  const ItemClass = CONFIG?.Item?.documentClass;
  if (!ItemClass?.prototype) {
    debugWarn("Item documentClass unavailable; item art source patch skipped.");
    return;
  }
  if (ItemClass.prototype.__afdItemArtPatched) return;
  const original = ItemClass.prototype._initializeSource;
  ItemClass.prototype._initializeSource = function (source, options = {}) {
    const data = original.call(this, source, options);
    try {
      if (ITEM_ART_LOADED && data?._id) {
        const art = resolveItemArt(data, options);
        if (art) data.img = art;
      }
    } catch (e) { /* never break item initialization */ }
    return data;
  };
  ItemClass.prototype.__afdItemArtPatched = true;
  debugLog("Item art _initializeSource patch installed.");
}

/** Persist our art into newly created items (e.g., cards dropped on a sheet). */
function installItemArtCreateHook() {
  Hooks.on("preCreateItem", (item, data, options, userId) => {
    try {
      if (!ITEM_ART_LOADED) return;
      const cs = item?._stats?.compendiumSource ?? data?._stats?.compendiumSource;
      if (!cs) return;
      const art = ITEM_ART_BY_UUID.get(cs);
      if (art && isReplaceableItemImg(item.img)) item.updateSource({ img: art });
    } catch (e) { /* non-critical */ }
  });
}

/** Patch compendium index entries so browser/list thumbnails show our art. */
async function applyItemArtToIndices() {
  await _itemArtLoadPromise;
  for (const [packName, byId] of ITEM_ART_PACKS.entries()) {
    const pack = game.packs?.get(packName);
    if (!pack) { debugWarn(`Item art: pack not found ${packName}`); continue; }
    try {
      await pack.getIndex();
      let patched = 0;
      for (const [itemId, img] of Object.entries(byId)) {
        const indexEntry = pack.index?.get(itemId);
        if (indexEntry) { indexEntry.img = img; patched++; }
      }
      debugInfo(`Item art: patched ${patched}/${Object.keys(byId).length} index entries in ${packName}.`);
    } catch (e) {
      debugError(`Item art: failed to patch index for ${packName}:`, e);
    }
  }
}

/* ---------------- Hooks: bootstrap ---------------- */
Hooks.once("init", () => {
  registerSettings();
  installItemArtCreateHook();
  // Kick off the item-art mapping load early (only needs game.modules/game.system).
  _itemArtLoadPromise = loadItemArtMappings();
  console.info(`[${MODULE_ID}] v14 Compendium Art integration initialized with dynamic system support.`);
});

Hooks.once("ready", async () => {
  // Preload mapping data first
  await preloadMappingData();

  // Item art: install source patch (CONFIG.Item.documentClass is final by now)
  // and patch compendium indices once mappings are loaded.
  installItemArtSourcePatch();
  await applyItemArtToIndices();

  // Log supported systems for debugging
  const module = game.modules.get(MODULE_ID);
  const compendiumMappings = module?.flags?.compendiumArtMappings || {};
  debugInfo("Configured systems:", Object.keys(compendiumMappings));
  debugInfo("Loaded supported packs:", Array.from(SUPPORTED_PACKS));
  debugInfo("Item art packs:", Array.from(ITEM_ART_PACKS.keys()));

  debugInfo("Ready.");
});