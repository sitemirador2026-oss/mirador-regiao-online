/**
 * Cloudflare Worker - Upload Proxy para R2
 * Usando R2 Bindings (API nativa do Cloudflare)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Formatar bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const instagramHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="131", "Not_A_Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cookie': 'ig_did=E8A4E4A0-1B2C-4D3E-A5F6-789012345678; csrftoken=missing; ig_nrcb=1; mid=ZwAABAABAAGAAA'
};

const instagramProfileCache = new Map();
const INSTAGRAM_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas
const instagramMetaCache = new Map();
const INSTAGRAM_META_CACHE_TTL = 2 * 60 * 1000; // 2 minutos
const instagramOembedCache = new Map();
const INSTAGRAM_OEMBED_CACHE_TTL = 10 * 60 * 1000; // 10 minutos

function decodeHtmlEntities(text = '') {
  const input = String(text || '');
  if (!input) return '';

  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);?/g, (match, entity) => {
    const normalized = String(entity || '').toLowerCase();
    if (!normalized) return match;

    if (normalized.startsWith('#x')) {
      const code = parseInt(normalized.slice(2), 16);
      if (Number.isFinite(code)) {
        try {
          return String.fromCodePoint(code);
        } catch (_error) { }
      }
      return match;
    }

    if (normalized.startsWith('#')) {
      const code = parseInt(normalized.slice(1), 10);
      if (Number.isFinite(code)) {
        try {
          return String.fromCodePoint(code);
        } catch (_error) { }
      }
      return match;
    }

    switch (normalized) {
      case 'amp': return '&';
      case 'quot': return '"';
      case 'apos': return "'";
      case 'lt': return '<';
      case 'gt': return '>';
      case 'nbsp': return ' ';
      case 'sol': return '/';
      default: return match;
    }
  });
}

function decodeEscapedUrl(url = '') {
  return decodeHtmlEntities(String(url))
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

function decodeEscapedText(text = '') {
  return decodeHtmlEntities(String(text || ''))
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (_error) {
        return '';
      }
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaTagContent(html = '', key = '', type = 'property') {
  if (!html || !key) return '';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patternA = new RegExp(`<meta[^>]*${type}=["']${escapedKey}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
  const patternB = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${type}=["']${escapedKey}["'][^>]*>`, 'i');
  const match = html.match(patternA) || html.match(patternB);
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function parseCompactNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== 'string') return 0;

  const raw = value.trim().toLowerCase();
  if (!raw) return 0;

  const compact = raw.match(/([\d.,]+)\s*(k|m|b|mil|mi)?/i);
  if (!compact) {
    const digitsOnly = raw.replace(/[^\d]/g, '');
    return digitsOnly ? parseInt(digitsOnly, 10) : 0;
  }

  const numPart = compact[1].replace(/\s/g, '');
  let numeric = 0;
  if (numPart.includes('.') && numPart.includes(',')) {
    numeric = Number(numPart.replace(/\./g, '').replace(',', '.'));
  } else if (numPart.includes(',') && !numPart.includes('.')) {
    const maybeDecimal = numPart.split(',')[1];
    if (maybeDecimal && maybeDecimal.length <= 2) {
      numeric = Number(numPart.replace(',', '.'));
    } else {
      numeric = Number(numPart.replace(/,/g, ''));
    }
  } else if (numPart.includes('.') && !numPart.includes(',')) {
    const parts = numPart.split('.');
    const looksLikeThousands = parts.length > 1 && parts.every((part, index) => {
      if (index === 0) return part.length >= 1 && part.length <= 3;
      return part.length === 3;
    });
    numeric = Number(looksLikeThousands ? parts.join('') : numPart);
  } else {
    numeric = Number(numPart.replace(/[^\d.]/g, ''));
  }

  if (!Number.isFinite(numeric)) return 0;

  const suffix = (compact[2] || '').toLowerCase();
  const multiplier =
    suffix === 'k' || suffix === 'mil' ? 1000 :
      suffix === 'm' || suffix === 'mi' ? 1000000 :
        suffix === 'b' ? 1000000000 :
          1;

  return Math.max(0, Math.round(numeric * multiplier));
}

function extractFirstIntegerByPatterns(text = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (!match || match[1] == null) continue;
    const parsed = parseInt(String(match[1]), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function extractFirstValueByPatterns(text = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (!match || match[1] == null) continue;
    return String(match[1]).trim();
  }
  return '';
}

function extractInstagramCaptionFromHtml(html = '') {
  if (!html) return '';
  return decodeEscapedText(
    extractFirstValueByPatterns(html, [
      /"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"])*)"/i,
      /\\"edge_media_to_caption\\"\s*:\s*\{\s*\\"edges\\"\s*:\s*\[\s*\{\s*\\"node\\"\s*:\s*\{\s*\\"text\\"\s*:\s*\\"((?:\\\\.|[^"])*)\\"/i,
      /"caption"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"])*)"/i,
      /\\"caption\\"\s*:\s*\{\s*\\"text\\"\s*:\s*\\"((?:\\\\.|[^"])*)\\"/i,
      /"accessibility_caption"\s*:\s*"([^"]{20,1200})"/i,
      /\\"accessibility_caption\\"\s*:\s*\\"([^"]{20,1200})\\"/i
    ])
  );
}

function extractInstagramEngagementFromHtml(html = '') {
  if (!html) return { likes: 0, comments: 0 };

  const likes = extractFirstIntegerByPatterns(html, [
    /"edge_media_preview_like"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"edge_liked_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"like_count"\s*:\s*(\d+)/i,
    /"likes"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"likesCount"\s*:\s*(\d+)/i,
    /\\"edge_media_preview_like\\"\s*:\s*\{\s*\\"count\\"\s*:\s*(\d+)/i,
    /\\"edge_liked_by\\"\s*:\s*\{\s*\\"count\\"\s*:\s*(\d+)/i,
    /\\"like_count\\"\s*:\s*(\d+)/i,
    /\\"likes\\"\s*:\s*\{\s*\\"count\\"\s*:\s*(\d+)/i,
    /\\"likesCount\\"\s*:\s*(\d+)/i
  ]);

  const comments = extractFirstIntegerByPatterns(html, [
    /"edge_media_to_comment"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"edge_media_preview_comment"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"comment_count"\s*:\s*(\d+)/i,
    /"commenter_count"\s*:\s*(\d+)/i,
    /"comments"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"commentsCount"\s*:\s*(\d+)/i,
    /\\"edge_media_to_comment\\"\s*:\s*\{\s*\\"count\\"\s*:\s*(\d+)/i,
    /\\"edge_media_preview_comment\\"\s*:\s*\{\s*\\"count\\"\s*:\s*(\d+)/i,
    /\\"comment_count\\"\s*:\s*(\d+)/i,
    /\\"commenter_count\\"\s*:\s*(\d+)/i,
    /\\"comments\\"\s*:\s*\{\s*\\"count\\"\s*:\s*(\d+)/i,
    /\\"commentsCount\\"\s*:\s*(\d+)/i
  ]);

  return { likes, comments };
}

function buildInstagramEmbedCaptionUrl(instagramUrl = '') {
  try {
    const parsed = new URL(instagramUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const mediaType = (segments[0] || '').toLowerCase();
    const shortcode = (segments[1] || '').trim();
    const allowedTypes = new Set(['p', 'reel', 'reels', 'tv']);
    if (!allowedTypes.has(mediaType) || !shortcode) return '';
    const normalizedType = mediaType === 'reels' ? 'reel' : mediaType;
    return `https://www.instagram.com/${normalizedType}/${encodeURIComponent(shortcode)}/embed/captioned/`;
  } catch (_error) {
    return '';
  }
}

function extractInstagramMetaFromEmbedHtml(html = '') {
  if (!html) {
    return {
      likes: 0,
      comments: 0,
      username: '',
      displayName: '',
      profileImage: '',
      description: '',
      image: '',
      video: '',
      isVideoPost: false
    };
  }

  const engagement = extractInstagramEngagementFromHtml(html);
  const username = sanitizeInstagramHandle(
    extractFirstValueByPatterns(html, [
      /"owner"\s*:\s*\{[^}]*"username"\s*:\s*"([a-z0-9._]{2,30})"/i,
      /\\"owner\\"\s*:\s*\{[^}]*\\"username\\"\s*:\s*\\"([a-z0-9._]{2,30})\\"/i,
      /"author_name"\s*:\s*"([^"]+)"/i,
      /\\"author_name\\"\s*:\s*\\"([^"]+)\\"/i
    ])
  );

  const displayName = decodeEscapedText(
    extractFirstValueByPatterns(html, [
      /"owner"\s*:\s*\{[^}]*"full_name"\s*:\s*"([^"]{1,180})"/i,
      /\\"owner\\"\s*:\s*\{[^}]*\\"full_name\\"\s*:\s*\\"([^"]{1,180})\\"/i
    ])
  );

  const profileImage = decodeEscapedUrl(
    extractFirstValueByPatterns(html, [
      /"profile_pic_url"\s*:\s*"([^"]+)"/i,
      /\\"profile_pic_url\\"\s*:\s*\\"([^"]+)\\"/i
    ])
  );

  const description = extractInstagramCaptionFromHtml(html);

  const image = decodeEscapedUrl(
    extractFirstValueByPatterns(html, [
      /"display_url"\s*:\s*"([^"]+)"/i,
      /\\"display_url\\"\s*:\s*\\"([^"]+)\\"/i,
      /"thumbnail_url"\s*:\s*"([^"]+)"/i,
      /\\"thumbnail_url\\"\s*:\s*\\"([^"]+)\\"/i
    ])
  );

  const video = decodeEscapedUrl(
    extractFirstValueByPatterns(html, [
      /"video_url"\s*:\s*"([^"]+)"/i,
      /\\"video_url\\"\s*:\s*\\"([^"]+)\\"/i
    ])
  );

  const isVideoPost = Boolean(
    video ||
    /"__typename"\s*:\s*"GraphVideo"/i.test(html) ||
    /\\"__typename\\"\s*:\s*\\"GraphVideo\\"/i.test(html)
  );

  return {
    likes: engagement.likes,
    comments: engagement.comments,
    username,
    displayName,
    profileImage,
    description,
    image,
    video,
    isVideoPost
  };
}

function sanitizeInstagramHandle(value = '') {
  const text = String(value || '').trim().replace(/^@/, '');
  if (!text) return '';

  const match = text.match(/[a-z0-9._]{2,30}/i);
  const handle = (match && match[0]) ? match[0].toLowerCase() : '';
  if (!handle) return '';
  if (!/[a-z]/.test(handle)) return '';
  if (/^[._]|[._]$/.test(handle)) return '';

  const blocked = new Set(['instagram', 'undefined', 'null', 'nan', 'profile', 'user']);
  if (blocked.has(handle)) return '';
  return handle;
}

function extractInstagramHandlesFromText(text = '') {
  if (!text) return [];
  const handles = new Set();
  const addHandle = (value) => {
    const clean = sanitizeInstagramHandle(value);
    if (clean) handles.add(clean);
  };

  const collaborationLead = text.match(/^\s*([a-z0-9._]{2,30})\s+(?:e|and)\s+(?:outra\s+conta|outros?\s+\d+|others?\s+\d+)/i);
  if (collaborationLead && collaborationLead[1]) addHandle(collaborationLead[1]);

  return Array.from(handles);
}

function extractInstagramCollaboratorsFromHtml(html = '') {
  if (!html) return [];
  const handles = new Set();
  const addHandle = (value) => {
    const clean = sanitizeInstagramHandle(value);
    if (clean) handles.add(clean);
  };

  const windows = html.match(/coauthor[a-z0-9_]{0,40}.{0,1200}/ig) || [];
  const usernamePattern = /\\"?username\\"?\s*:\s*\\"?([a-z0-9._]{2,30})\\"?/ig;

  for (const snippet of windows) {
    let match;
    while ((match = usernamePattern.exec(snippet)) !== null) {
      addHandle(match[1]);
    }
    usernamePattern.lastIndex = 0;
  }

  return Array.from(handles);
}

function collectInstagramCollaborators(...sources) {
  const handles = new Set();
  const addHandle = (value) => {
    const clean = sanitizeInstagramHandle(value);
    if (clean) handles.add(clean);
  };

  for (const source of sources) {
    if (!source) continue;

    if (Array.isArray(source)) {
      source.forEach(item => addHandle(item));
      continue;
    }

    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (/^[a-z0-9._]{2,30}$/i.test(trimmed)) {
        addHandle(trimmed);
      }
      extractInstagramHandlesFromText(trimmed).forEach(addHandle);
      continue;
    }
  }

  return Array.from(handles);
}

function extractInstagramUsernameFromText(text = '') {
  if (!text) return '';
  const patterns = [
    /-\s*([a-z0-9._]{2,30})\s+on\b/i,
    /@([a-z0-9._]{2,30})/i,
    /\(\s*@?([a-z0-9._]{2,30})\s*\)/i
  ];

  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match && match[1]) return match[1].toLowerCase();
  }
  return '';
}

function extractInstagramUsernameFromUrl(url = '') {
  try {
    const parsed = new URL(url);
    const first = parsed.pathname.split('/').filter(Boolean)[0] || '';
    const reserved = new Set(['p', 'reel', 'tv', 'stories', 'explore', 'accounts', 'reels']);
    if (!first || reserved.has(first.toLowerCase())) return '';
    return first.replace(/^@/, '').toLowerCase();
  } catch (_error) {
    return '';
  }
}

async function fetchTextWithRetry(url, attempts = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: instagramHeaders,
        cf: {
          cacheTtl: 0,
          cacheEverything: false
        }
      });
      if (response.ok) {
        return await response.text();
      }
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status === 429 && attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
        continue;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Falha ao buscar URL');
}

function stripJsonPreamble(payload = '') {
  return String(payload || '').replace(/^\s*for\s*\(;;\);\s*/i, '').trim();
}

async function fetchJsonWithRetry(url, attempts = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          ...instagramHeaders,
          'Accept': 'application/json,text/plain,*/*'
        },
        cf: {
          cacheTtl: 0,
          cacheEverything: false
        }
      });

      if (response.ok) {
        const text = await response.text();
        return JSON.parse(stripJsonPreamble(text));
      }

      lastError = new Error(`HTTP ${response.status}`);
      if (response.status === 429 && attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
        continue;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Falha ao buscar JSON');
}

async function fetchInstagramOembedMeta(instagramUrl = '') {
  const cleanUrl = String(instagramUrl || '').trim();
  if (!cleanUrl) return null;

  const cached = instagramOembedCache.get(cleanUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(cleanUrl)}`;
  const payload = await fetchJsonWithRetry(oembedUrl, 2);
  if (!payload || typeof payload !== 'object') return null;

  instagramOembedCache.set(cleanUrl, {
    data: payload,
    expiresAt: Date.now() + INSTAGRAM_OEMBED_CACHE_TTL
  });

  return payload;
}

async function fetchInstagramProfileImage(username = '') {
  const cleanUsername = String(username || '').trim().toLowerCase().replace(/^@/, '');
  if (!cleanUsername) return '';

  const cached = instagramProfileCache.get(cleanUsername);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const profileUrl = `https://www.instagram.com/${encodeURIComponent(cleanUsername)}/`;
  const html = await fetchTextWithRetry(profileUrl);
  const ogImage = extractMetaTagContent(html, 'og:image', 'property');
  const imageUrl = decodeEscapedUrl(ogImage);

  if (imageUrl) {
    instagramProfileCache.set(cleanUsername, {
      url: imageUrl,
      expiresAt: Date.now() + INSTAGRAM_CACHE_TTL
    });
  }

  return imageUrl;
}

async function scrapeInstagramMeta(instagramUrl = '') {
  const cleanUrl = String(instagramUrl || '').trim();
  if (!cleanUrl) throw new Error('URL do Instagram ausente');

  const cachedMeta = instagramMetaCache.get(cleanUrl);
  if (cachedMeta && cachedMeta.expiresAt > Date.now()) {
    return cachedMeta.data;
  }

  const parsedUrl = new URL(cleanUrl);
  if (!parsedUrl.hostname.includes('instagram.com')) {
    throw new Error('URL invalida: use um link do Instagram');
  }

  let html = '';
  try {
    html = await fetchTextWithRetry(cleanUrl);
  } catch (_error) {
    html = '';
  }

  let ogTitle = extractMetaTagContent(html, 'og:title', 'property');
  let ogDescription = extractMetaTagContent(html, 'og:description', 'property') || extractMetaTagContent(html, 'description', 'name');
  if (!ogDescription) {
    ogDescription = extractInstagramCaptionFromHtml(html);
  }
  let ogImage = decodeEscapedUrl(extractMetaTagContent(html, 'og:image', 'property'));
  let ogVideo = decodeEscapedUrl(
    extractMetaTagContent(html, 'og:video', 'property') ||
    extractMetaTagContent(html, 'og:video:url', 'property') ||
    extractMetaTagContent(html, 'og:video:secure_url', 'property') ||
    extractMetaTagContent(html, 'twitter:player:stream', 'name')
  );

  const descriptionText = ogDescription || '';
  let likesMatch = descriptionText.match(/([\d.,]+\s*(?:mil|[kmb])?)\s+(?:likes?|curtidas?)/i)
    || descriptionText.match(/(?:likes?|curtidas?)[:\s]+([\d.,]+\s*(?:mil|[kmb])?)/i);
  let commentsMatch = descriptionText.match(/([\d.,]+\s*(?:mil|[kmb])?)\s+(?:comments?|coment[a\u00E1]rios?)/i)
    || descriptionText.match(/(?:comments?|coment[a\u00E1]rios?)[:\s]+([\d.,]+\s*(?:mil|[kmb])?)/i);
  let likesFromDescription = likesMatch ? parseCompactNumber(likesMatch[1]) : 0;
  let commentsFromDescription = commentsMatch ? parseCompactNumber(commentsMatch[1]) : 0;
  let engagementFromHtml = extractInstagramEngagementFromHtml(html);
  let likes = likesFromDescription > 0 ? likesFromDescription : engagementFromHtml.likes;
  let comments = commentsFromDescription > 0 ? commentsFromDescription : engagementFromHtml.comments;

  let username =
    extractInstagramUsernameFromText(ogDescription) ||
    extractInstagramUsernameFromText(ogTitle) ||
    extractInstagramUsernameFromUrl(cleanUrl);

  let displayName = '';
  const displayFromTitle = (ogTitle || '').match(/^(.+?)\s+\(@[a-z0-9._]{2,30}\)/i);
  if (displayFromTitle && displayFromTitle[1]) {
    displayName = decodeHtmlEntities(displayFromTitle[1]).trim();
  }

  let embedHtml = '';
  const shouldUseEmbedFallback = (likes <= 0 && comments <= 0) || !ogTitle || !ogDescription || (!ogImage && !ogVideo);
  if (shouldUseEmbedFallback) {
    const embedUrl = buildInstagramEmbedCaptionUrl(cleanUrl);
    if (embedUrl) {
      try {
        embedHtml = await fetchTextWithRetry(embedUrl);
        const embedMeta = extractInstagramMetaFromEmbedHtml(embedHtml);

        if (likes <= 0 && embedMeta.likes > 0) likes = embedMeta.likes;
        if (comments <= 0 && embedMeta.comments > 0) comments = embedMeta.comments;
        if (!username && embedMeta.username) username = embedMeta.username;
        if (!displayName && embedMeta.displayName) displayName = embedMeta.displayName;
        if (!ogDescription && embedMeta.description) ogDescription = embedMeta.description;
        if (!ogImage && embedMeta.image) ogImage = embedMeta.image;
        if (!ogVideo && embedMeta.video) ogVideo = embedMeta.video;
      } catch (_error) {
        embedHtml = '';
      }
    }
  }

  const shouldUseOembedFallback = !ogTitle || !ogDescription || !username || (!ogImage && !ogVideo);
  if (shouldUseOembedFallback) {
    try {
      const oembed = await fetchInstagramOembedMeta(cleanUrl);
      if (oembed) {
        const oembedTitle = decodeEscapedText(oembed.title || '');
        if (!ogTitle && oembedTitle) {
          ogTitle = oembedTitle.length > 120 ? `${oembedTitle.slice(0, 117).trimEnd()}...` : oembedTitle;
        }
        if (!ogDescription && oembedTitle) ogDescription = oembedTitle;

        const oembedUsername = sanitizeInstagramHandle(
          oembed.author_name ||
          extractInstagramUsernameFromUrl(oembed.author_url || '')
        );
        if (!username && oembedUsername) username = oembedUsername;
        if (!displayName && oembed.author_name) {
          displayName = decodeEscapedText(oembed.author_name || '');
        }

        const oembedThumb = decodeEscapedUrl(oembed.thumbnail_url || '');
        if (!ogImage && oembedThumb) ogImage = oembedThumb;
      }
    } catch (_error) { }
  }
  if (!ogDescription && ogTitle) {
    ogDescription = ogTitle;
  }

  const inlineVideoCandidates = [];
  const inlinePatterns = [
    /"video_url"\s*:\s*"([^"]+)"/i,
    /\\"video_url\\"\s*:\s*\\"([^"]+)\\"/i,
    /"contentUrl"\s*:\s*"([^"]+)"/i,
    /\\"contentUrl\\"\s*:\s*\\"([^"]+)\\"/i,
    /"video_versions"\s*:\s*\[\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i,
    /\\"video_versions\\"\s*:\s*\[\s*\{[^}]*\\"url\\"\s*:\s*\\"([^"]+)\\"/i
  ];
  const htmlForVideoScan = [html, embedHtml].filter(Boolean).join('\n');
  for (const pattern of inlinePatterns) {
    const match = htmlForVideoScan.match(pattern);
    if (match && match[1]) {
      inlineVideoCandidates.push(decodeEscapedUrl(match[1]));
    }
  }

  const inlineVideoUrl = inlineVideoCandidates.find(value => typeof value === 'string' && /^https?:\/\//i.test(value)) || '';
  const resolvedVideo = ogVideo || inlineVideoUrl || '';
  const urlLooksVideo = /\/(?:reel|reels|tv)\//i.test(parsedUrl.pathname || '');
  const htmlMarksVideo =
    /"is_video"\s*:\s*true/i.test(htmlForVideoScan) ||
    /"__typename"\s*:\s*"GraphVideo"/i.test(htmlForVideoScan) ||
    /\\"is_video\\"\s*:\s*true/i.test(htmlForVideoScan) ||
    /\\"__typename\\"\s*:\s*\\"GraphVideo\\"/i.test(htmlForVideoScan);
  const isVideoPost = Boolean(resolvedVideo || urlLooksVideo || htmlMarksVideo);

  if (likes <= 0 || comments <= 0) {
    const retryText = ogDescription || '';
    likesMatch = retryText.match(/([\d.,]+\s*(?:mil|[kmb])?)\s+(?:likes?|curtidas?)/i)
      || retryText.match(/(?:likes?|curtidas?)[:\s]+([\d.,]+\s*(?:mil|[kmb])?)/i);
    commentsMatch = retryText.match(/([\d.,]+\s*(?:mil|[kmb])?)\s+(?:comments?|coment[a\u00E1]rios?)/i)
      || retryText.match(/(?:comments?|coment[a\u00E1]rios?)[:\s]+([\d.,]+\s*(?:mil|[kmb])?)/i);
    likesFromDescription = likesMatch ? parseCompactNumber(likesMatch[1]) : 0;
    commentsFromDescription = commentsMatch ? parseCompactNumber(commentsMatch[1]) : 0;
    engagementFromHtml = extractInstagramEngagementFromHtml(htmlForVideoScan);
    if (likes <= 0) likes = likesFromDescription > 0 ? likesFromDescription : engagementFromHtml.likes;
    if (comments <= 0) comments = commentsFromDescription > 0 ? commentsFromDescription : engagementFromHtml.comments;
  }

  const collaborators = collectInstagramCollaborators(username, displayName);
  const primaryHandle = collaborators[0] || username;
  const hasAdditionalCollaborator = Boolean(
    collaborators.length > 1 ||
    /(?:\be\b|\band\b)\s+(?:outra\s+conta|outros?\s+\d+|others?\s+\d+)/i.test(`${ogTitle || ''} ${ogDescription || ''}`)
  );

  let profileImage = decodeEscapedUrl(
    extractFirstValueByPatterns(embedHtml, [
      /"profile_pic_url"\s*:\s*"([^"]+)"/i,
      /\\"profile_pic_url\\"\s*:\s*\\"([^"]+)\\"/i
    ])
  );
  if (!profileImage && ogImage && !/\/p\/|\/reel\//i.test(cleanUrl)) {
    profileImage = ogImage;
  }

  const result = {
    username,
    displayName,
    profileImage,
    likes,
    comments,
    title: ogTitle || '',
    description: ogDescription || '',
    image: ogImage || '',
    video: resolvedVideo,
    mediaType: isVideoPost ? 'video' : 'image',
    isVideoPost,
    collaborators,
    hasAdditionalCollaborator,
    sourceUrl: cleanUrl
  };

  instagramMetaCache.set(cleanUrl, {
    data: result,
    expiresAt: Date.now() + INSTAGRAM_META_CACHE_TTL
  });

  return result;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/instagram/meta') {
      const instagramMetaHeaders = {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      };
      try {
        const instagramUrl = url.searchParams.get('url') || '';
        if (!instagramUrl) {
          return new Response(
            JSON.stringify({ success: false, error: 'Parâmetro url é obrigatório' }),
            { status: 400, headers: instagramMetaHeaders }
          );
        }

        const data = await scrapeInstagramMeta(instagramUrl);
        return new Response(
          JSON.stringify({ success: true, ...data }),
          { headers: instagramMetaHeaders }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message || 'Erro ao extrair metadados do Instagram' }),
          { status: 500, headers: instagramMetaHeaders }
        );
      }
    }

    // Verificar se o binding R2 está configurado
    if (!env.R2_BUCKET) {
      return new Response(
        JSON.stringify({ error: 'R2_BUCKET binding não configurado. Vá em Settings > Bindings e adicione o bucket.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Status básico
    if (path === '/api/status') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'mirador-r2-worker', timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Worker Status completo
    if (path === '/api/worker/status') {
      try {
        // Testar listando objetos
        const objects = await env.R2_BUCKET.list({ limit: 1 });

        return new Response(
          JSON.stringify({
            status: 'online',
            worker: 'mirador-r2',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            r2: {
              connected: true,
              bucket: 'mirador-regiao-online',
              publicUrl: 'https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev'
            },
            limits: {
              requestsPerDay: 100000,
              maxFileSize: '50MB'
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: 'online',
            worker: 'mirador-r2',
            error: error.message,
            r2: { connected: false }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Estatísticas de uso
    if (path === '/api/r2/usage') {
      try {
        const objects = await env.R2_BUCKET.list();
        let totalSize = 0;

        for (const object of objects.objects || []) {
          totalSize += object.size;
        }

        return new Response(
          JSON.stringify({
            used: totalSize,
            files: objects.objects?.length || 0,
            limit: 10 * 1024 * 1024 * 1024, // 10GB
            formatted: formatBytes(totalSize)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Listar arquivos
    if (path === '/api/files') {
      try {
        const prefix = url.searchParams.get('prefix') || '';
        const objects = await env.R2_BUCKET.list({ prefix });

        const files = (objects.objects || []).map(obj => ({
          key: obj.key,
          size: obj.size,
          lastModified: obj.uploaded,
          url: `https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev/${obj.key}`
        }));

        return new Response(
          JSON.stringify({ files }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Upload de arquivo
    if (path === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const folder = formData.get('folder') || 'noticias';

        if (!file) {
          return new Response(
            JSON.stringify({ error: 'Nenhum arquivo enviado' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validar tipo - aceitar todas as imagens e vídeos comuns
        const fileType = (file.type || '').toLowerCase();

        // Verificar se é imagem ou vídeo válido
        const isImage = fileType.startsWith('image/');
        const isVideo = fileType.startsWith('video/');

        if (!isImage && !isVideo) {
          return new Response(
            JSON.stringify({ error: `Tipo não suportado: ${file.type}. Apenas imagens e vídeos são permitidos.` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Gerar nome único
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
        const key = `${folder}/${timestamp}-${safeName}`;

        // Fazer upload para R2
        await env.R2_BUCKET.put(key, file.stream(), {
          httpMetadata: {
            contentType: file.type
          }
        });

        return new Response(
          JSON.stringify({
            success: true,
            url: `https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev/${key}`,
            key: key
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Deletar arquivo
    if (path.startsWith('/api/files/') && request.method === 'DELETE') {
      try {
        const key = decodeURIComponent(path.replace('/api/files/', ''));
        await env.R2_BUCKET.delete(key);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Rota não encontrada
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};
