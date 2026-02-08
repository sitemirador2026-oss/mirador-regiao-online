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
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};

const instagramProfileCache = new Map();
const INSTAGRAM_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas

function decodeHtmlEntities(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function decodeEscapedUrl(url = '') {
  return decodeHtmlEntities(String(url))
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
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
      const response = await fetch(url, { headers: instagramHeaders });
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

  const parsedUrl = new URL(cleanUrl);
  if (!parsedUrl.hostname.includes('instagram.com')) {
    throw new Error('URL inválida: use um link do Instagram');
  }

  const html = await fetchTextWithRetry(cleanUrl);
  const ogTitle = extractMetaTagContent(html, 'og:title', 'property');
  const ogDescription = extractMetaTagContent(html, 'og:description', 'property') || extractMetaTagContent(html, 'description', 'name');
  const ogImage = decodeEscapedUrl(extractMetaTagContent(html, 'og:image', 'property'));
  const ogVideo = decodeEscapedUrl(
    extractMetaTagContent(html, 'og:video', 'property') ||
    extractMetaTagContent(html, 'og:video:url', 'property') ||
    extractMetaTagContent(html, 'og:video:secure_url', 'property') ||
    extractMetaTagContent(html, 'twitter:player:stream', 'name')
  );
  const inlineVideoCandidates = [];
  const inlinePatterns = [
    /"video_url"\s*:\s*"([^"]+)"/i,
    /"contentUrl"\s*:\s*"([^"]+)"/i,
    /"video_versions"\s*:\s*\[\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i
  ];
  for (const pattern of inlinePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      inlineVideoCandidates.push(decodeEscapedUrl(match[1]));
    }
  }
  const inlineVideoUrl = inlineVideoCandidates.find(value => typeof value === 'string' && /^https?:\/\//i.test(value)) || '';
  const resolvedVideo = ogVideo || inlineVideoUrl || '';
  const urlLooksVideo = /\/(?:reel|reels|tv)\//i.test(parsedUrl.pathname || '');
  const htmlMarksVideo = /"is_video"\s*:\s*true/i.test(html) || /"__typename"\s*:\s*"GraphVideo"/i.test(html);
  const isVideoPost = Boolean(resolvedVideo || urlLooksVideo || htmlMarksVideo);

  const likesMatch = (ogDescription || '').match(/([\d.,kmb]+)\s+likes?/i);
  const commentsMatch = (ogDescription || '').match(/([\d.,kmb]+)\s+comments?/i);
  const likes = likesMatch ? parseCompactNumber(likesMatch[1]) : 0;
  const comments = commentsMatch ? parseCompactNumber(commentsMatch[1]) : 0;

  const username =
    extractInstagramUsernameFromText(ogDescription) ||
    extractInstagramUsernameFromText(ogTitle) ||
    extractInstagramUsernameFromUrl(cleanUrl);

  let displayName = '';
  const displayFromTitle = (ogTitle || '').match(/^(.+?)\s+\(@[a-z0-9._]{2,30}\)/i);
  if (displayFromTitle && displayFromTitle[1]) {
    displayName = decodeHtmlEntities(displayFromTitle[1]).trim();
  }

  const collaborators = collectInstagramCollaborators(
    username,
    displayName,
    extractInstagramCollaboratorsFromHtml(html)
  );
  const primaryHandle = collaborators[0] || username;
  const hasAdditionalCollaborator = Boolean(
    collaborators.length > 1 ||
    /(?:\be\b|\band\b)\s+(?:outra\s+conta|outros?\s+\d+|others?\s+\d+)/i.test(`${ogTitle || ''} ${ogDescription || ''}`)
  );

  let profileImage = '';
  if (primaryHandle) {
    try {
      profileImage = await fetchInstagramProfileImage(primaryHandle);
    } catch (_error) {
      profileImage = '';
    }
  }

  if (!profileImage && ogImage && !/\/p\/|\/reel\//i.test(cleanUrl)) {
    profileImage = ogImage;
  }

  return {
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
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/instagram/meta') {
      try {
        const instagramUrl = url.searchParams.get('url') || '';
        if (!instagramUrl) {
          return new Response(
            JSON.stringify({ success: false, error: 'Parâmetro url é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await scrapeInstagramMeta(instagramUrl);
        return new Response(
          JSON.stringify({ success: true, ...data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message || 'Erro ao extrair metadados do Instagram' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
