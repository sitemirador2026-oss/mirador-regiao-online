// App principal do site pÃºblico

console.log('[App] v2.5 - Script carregado');

// Dados de exemplo
const sampleNews = [
    {
        id: '1',
        title: "Prefeitura anuncia obras de infraestrutura em Mirador",
        excerpt: "Novas obras prometem melhorar a qualidade de vida dos moradores da cidade.",
        category: "mirador",
        categoryName: "Mirador",
        image: "https://via.placeholder.com/800x400/2563eb/ffffff?text=Mirador",
        date: "2026-02-03T12:30:00",
        author: "Redação",
        featured: true
    },
    {
        id: '2',
        title: "Região registra crescimento econômico no último trimestre",
        excerpt: "Dados mostram aumento de 15% na atividade economica regional.",
        category: "regiao",
        categoryName: "Região",
        image: "https://via.placeholder.com/800x400/059669/ffffff?text=Região",
        date: "2026-02-03T10:15:00",
        author: "Redação",
        featured: true
    },
    {
        id: '3',
        title: "Seleção Brasileira se prepara para próximos jogos",
        excerpt: "Tecnico convoca novos jogadores para amistosos internacionais.",
        category: "brasil",
        categoryName: "Brasil",
        image: "https://via.placeholder.com/800x400/dc2626/ffffff?text=Brasil",
        date: "2026-02-02T18:05:00",
        author: "Redação",
        featured: false
    }
];

// Inicializar dados de exemplo
async function initializeData() {
    try {
        const snapshot = await db.collection('news').limit(1).get();
        if (snapshot.empty) {
            console.log('[App] Adicionando notícias de exemplo...');
            const batch = db.batch();
            sampleNews.forEach(news => {
                const ref = db.collection('news').doc(news.id);
                batch.set(ref, { ...news, views: 0 });
            });
            await batch.commit();
            console.log('[App] Notícias adicionadas!');
        }
    } catch (error) {
        console.error('[App] Erro ao inicializar dados:', error);
    }
}

// Formatar data
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

// Formatar data e hora
function formatDateTime(dateString) {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short'
    });
    const timeStr = date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    return `${dateStr} \u2022 ${timeStr}`;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDomainFromUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./i, '');
    } catch (e) {
        return '';
    }
}

async function trackNewsView(newsId) {
    if (!newsId) return;
    try {
        await db.collection('news').doc(newsId).update({
            views: firebase.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        if (error && error.code === 'permission-denied') {
            console.warn('[Views] Permissao negada para incrementar views do post:', newsId);
            return;
        }
        console.warn('[Views] Falha ao incrementar views do post:', newsId, error);
    }
}

function parseInstagramCount(value) {
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
        suffix === 'k' || suffix === 'mil' ? 1_000 :
            suffix === 'm' || suffix === 'mi' ? 1_000_000 :
                suffix === 'b' ? 1_000_000_000 :
                    1;

    return Math.max(0, Math.round(numeric * multiplier));
}

function pickBestInstagramCount(...values) {
    const parsedValues = values
        .map(value => (value == null ? null : parseInstagramCount(value)))
        .filter(value => value != null);

    if (parsedValues.length === 0) return 0;
    const positive = parsedValues.find(value => value > 0);
    return positive != null ? positive : parsedValues[0];
}

function isGenericInstagramDisplayName(value) {
    if (!value) return true;
    const clean = String(value).trim().toLowerCase();
    return clean === 'instagram' || clean === '@instagram';
}

function extractInstagramUsernameFromUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        const first = parsed.pathname.split('/').filter(Boolean)[0] || '';
        const reserved = ['p', 'reel', 'tv', 'stories', 'explore', 'accounts'];
        if (!first || reserved.includes(first.toLowerCase())) return '';
        return first.replace(/^@/, '');
    } catch (_e) {
        return '';
    }
}

function extractInstagramUsernameFromText(text) {
    if (!text || typeof text !== 'string') return '';

    const patterns = [
        /-\s*([a-z0-9._]{2,30})\s+on\b/i,
        /\b([a-z0-9._]{2,30})\s+on\s+instagram\b/i,
        /\(@([a-z0-9._]{2,30})\)/i,
        /\bby\s+([a-z0-9._]{2,30})\b/i,
        /@([a-z0-9._]{2,30})/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1];
    }

    return '';
}

function buildUiAvatarUrl(name = 'IG') {
    const safe = (name || 'IG').toString().trim() || 'IG';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(safe)}&background=E4405F&color=fff`;
}

function sanitizeInstagramHandle(value) {
    if (value == null) return '';
    const text = String(value).trim().replace(/^@/, '');
    if (!text) return '';

    const match = text.match(/[a-z0-9._]{2,30}/i);
    const handle = (match && match[0]) ? match[0].toLowerCase() : '';
    if (!handle) return '';
    if (!/[a-z]/.test(handle)) return '';
    if (/^[._]|[._]$/.test(handle)) return '';

    const blocked = ['instagram', 'undefined', 'null', 'nan', 'profile', 'user'];
    if (blocked.includes(handle)) return '';
    return handle;
}

function extractInstagramHandlesFromText(text = '') {
    if (!text || typeof text !== 'string') return [];

    const handles = new Set();
    const addHandle = (value) => {
        const clean = sanitizeInstagramHandle(value);
        if (clean) handles.add(clean);
    };

    const collaborationLead = text.match(/^\s*([a-z0-9._]{2,30})\s+(?:e|and)\s+(?:outra\s+conta|outros?\s+\d+|others?\s+\d+)/i);
    if (collaborationLead && collaborationLead[1]) addHandle(collaborationLead[1]);

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

function formatInstagramCollaborators(handles = [], fallback = 'instagram') {
    const clean = (handles || []).map(sanitizeInstagramHandle).filter(Boolean);
    if (clean.length === 0) return fallback;
    if (clean.length === 1) return clean[0];
    return `${clean[0]} e outra conta`;
}

function hasInstagramCollaborationHint(...texts) {
    return texts.some(text => {
        if (!text || typeof text !== 'string') return false;
        return /(?:\be\b|\band\b)\s+(?:outra\s+conta|outros?\s+\d+|others?\s+\d+)/i.test(text);
    });
}

function sanitizeInstagramProfileImage(url) {
    if (!url || typeof url !== 'string') return '';
    const clean = url.trim();
    if (!clean) return '';
    return clean;
}

function cleanInstagramCaptionForDisplay(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/^\s*["']?\s*[\d.,kmb]+\s*likes?,?\s*[\d.,kmb]*\s*comments?\s*-\s*[a-z0-9._]{2,30}\s+on\s+[^:]+:?\s*/i, '')
        .replace(/^\s*["']?\s*[a-z0-9._]{2,30}\s+on\s+[^:]+:?\s*/i, '')
        .replace(/^\s*["']+|["']+\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sanitizeInstagramDisplayName(value, fallbackHandle = '', description = '', instagramUrl = '') {
    const raw = (value == null ? '' : String(value)).trim();
    const cleanedRaw = cleanInstagramCaptionForDisplay(raw);

    const candidates = [
        sanitizeInstagramHandle(cleanedRaw),
        sanitizeInstagramHandle(fallbackHandle),
        sanitizeInstagramHandle(extractInstagramUsernameFromText(description)),
        sanitizeInstagramHandle(extractInstagramUsernameFromUrl(instagramUrl))
    ].filter(Boolean);

    if (candidates.length > 0) return candidates[0];
    return '';
}

function buildInstagramAvatarUrl(username, fallbackName = 'IG') {
    const clean = sanitizeInstagramHandle(username);
    if (!clean) return '';
    return `https://unavatar.io/instagram/${encodeURIComponent(clean)}`;
}

function buildInstagramTitlePreview(title, content) {
    const cleanTitle = cleanInstagramCaptionForDisplay(title || '');
    if (cleanTitle && cleanTitle.length >= 8) {
        return cleanTitle.length > 90 ? `${cleanTitle.slice(0, 87).trimEnd()}...` : cleanTitle;
    }

    const cleanContent = cleanInstagramCaptionForDisplay(content || '');
    if (!cleanContent) return 'Post do Instagram';
    return cleanContent.length > 90 ? `${cleanContent.slice(0, 87).trimEnd()}...` : cleanContent;
}

function normalizeInstagramMeta(meta = {}, instagramUrl = '') {
    const textBlob = [
        meta.description,
        meta.title,
        meta.authorName,
        meta.author
    ].filter(Boolean).join(' | ');

    const likesMatch = textBlob.match(/([\d.,kmb]+)\s+likes?/i);
    const commentsMatch = textBlob.match(/([\d.,kmb]+)\s+comments?/i);

    const collaborators = collectInstagramCollaborators(
        meta.collaborators || [],
        meta.username,
        extractInstagramUsernameFromUrl(meta.authorUrl || ''),
        extractInstagramUsernameFromText(textBlob),
        extractInstagramUsernameFromUrl(instagramUrl)
    );

    const username = sanitizeInstagramHandle(
        meta.username ||
        collaborators[0] ||
        extractInstagramUsernameFromUrl(meta.authorUrl || '') ||
        extractInstagramUsernameFromText(textBlob) ||
        extractInstagramUsernameFromUrl(instagramUrl)
    );

    const likes = pickBestInstagramCount(meta.likes, likesMatch ? likesMatch[1] : null);
    const comments = pickBestInstagramCount(meta.comments, commentsMatch ? commentsMatch[1] : null);
    const displayName = sanitizeInstagramDisplayName(
        meta.displayName || meta.authorName || username || '',
        username,
        textBlob,
        instagramUrl
    ) || username || '';
    const hasAdditionalCollaborator = Boolean(
        meta.hasAdditionalCollaborator ||
        collaborators.length > 1 ||
        hasInstagramCollaborationHint(meta.title || '', meta.description || '', meta.authorName || '')
    );
    const cleanProfileImage = sanitizeInstagramProfileImage(meta.profileImage || '');

    return {
        likes,
        comments,
        username,
        displayName,
        profileImage: cleanProfileImage,
        collaborators,
        hasAdditionalCollaborator
    };
}

// Buscar dados de engagement do Instagram diretamente do navegador do usuÃ¡rio
async function fetchInstagramEmbedDataFromBrowser(instagramUrl) {
    try {
        const parsed = new URL(instagramUrl);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const mediaType = (segments[0] || '').toLowerCase();
        const shortcode = (segments[1] || '').trim();
        const allowedTypes = new Set(['p', 'reel', 'reels', 'tv']);
        if (!allowedTypes.has(mediaType) || !shortcode) return null;

        const normalizedType = mediaType === 'reels' ? 'reel' : mediaType;
        const embedUrl = `https://www.instagram.com/${normalizedType}/${encodeURIComponent(shortcode)}/embed/captioned/`;

        const response = await fetch(embedUrl, { credentials: 'include' });
        if (!response.ok) return null;
        const html = await response.text();
        if (!html || html.length < 500) return null;

        const extractInt = (patterns) => {
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    const val = parseInt(match[1], 10);
                    if (Number.isFinite(val) && val >= 0) return val;
                }
            }
            return 0;
        };

        const likes = extractInt([
            /"edge_media_preview_like"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /"edge_liked_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /"like_count"\s*:\s*(\d+)/i,
            /"likes"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /\\"like_count\\"\s*:\s*(\d+)/i,
            /\\"edge_media_preview_like\\"\s*:\s*\{\s*\\"count\\"\s*:\s*(\d+)/i
        ]);

        const comments = extractInt([
            /"edge_media_to_comment"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /"edge_media_preview_comment"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /"comment_count"\s*:\s*(\d+)/i,
            /"comments"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /\\"comment_count\\"\s*:\s*(\d+)/i,
            /\\"edge_media_to_comment\\"\s*:\s*\{\s*\\"count\\"\s*:\s*(\d+)/i
        ]);

        if (likes > 0 || comments > 0) {
            console.log(`[App] Embed do navegador retornou: likes=${likes}, comments=${comments} para ${shortcode}`);
            return { likes, comments };
        }

        // Tenta extrair do texto visÃ­vel do embed (ex: "1.700 curtidas")
        const textLikes = html.match(/([\d.,]+)\s*(?:likes?|curtidas?)/i);
        const textComments = html.match(/([\d.,]+)\s*(?:comments?|comentarios?)/i);
        const parsedTextLikes = textLikes ? parseInstagramCount(textLikes[1]) : 0;
        const parsedTextComments = textComments ? parseInstagramCount(textComments[1]) : 0;

        if (parsedTextLikes > 0 || parsedTextComments > 0) {
            console.log(`[App] Embed texto retornou: likes=${parsedTextLikes}, comments=${parsedTextComments} para ${shortcode}`);
            return { likes: parsedTextLikes, comments: parsedTextComments };
        }

        return null;
    } catch (_e) {
        return null;
    }
}

async function fetchInstagramMeta(instagramUrl, options = {}) {
    const forceFresh = Boolean(options.forceFresh);
    let internalMeta = null;
    let microlinkData = null;
    let noembedData = null;

    const encodedUrl = encodeURIComponent(instagramUrl);
    const requestSuffix = forceFresh ? `&_t=${Date.now()}` : '';
    const workerEndpoint = `https://mirador-r2.sitemirador2026.workers.dev/api/instagram/meta?url=${encodedUrl}${requestSuffix}`;
    const localEndpoint = `/api/instagram/meta?url=${encodedUrl}${requestSuffix}`;
    const metaEndpoints = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:')
        ? [workerEndpoint]
        : [workerEndpoint, localEndpoint];

    for (const endpoint of metaEndpoints) {
        try {
            const response = await fetch(endpoint, { cache: forceFresh ? 'no-store' : 'default' });
            if (!response.ok) continue;
            const payload = await response.json();
            if (payload && payload.success) {
                internalMeta = payload;
                break;
            }
        } catch (_e) { }
    }

    const internalLikes = internalMeta?.likes != null ? parseInstagramCount(internalMeta.likes) : 0;
    const internalComments = internalMeta?.comments != null ? parseInstagramCount(internalMeta.comments) : 0;
    const needsExternalCountFallback = internalLikes <= 0 && internalComments <= 0;
    const canUseMicrolinkNow = Date.now() >= instagramMicrolinkCooldownUntil;

    if (needsExternalCountFallback && canUseMicrolinkNow) {
        try {
            const microlinkEndpoint = `https://api.microlink.io/?url=${encodeURIComponent(instagramUrl)}`;
            const response = await fetch(microlinkEndpoint, { cache: 'default' });
            if (response.status === 429) {
                instagramMicrolinkCooldownUntil = Date.now() + INSTAGRAM_MICROLINK_COOLDOWN_MS;
            } else if (response.ok) {
                const payload = await response.json();
                microlinkData = payload?.data || null;
            }
        } catch (_e) { }
    }

    const shouldUseNoembedFallback = !internalMeta && !microlinkData;
    if (shouldUseNoembedFallback) {
        try {
            const noembedEndpoint = `https://noembed.com/embed?url=${encodeURIComponent(instagramUrl)}`;
            const response = await fetch(noembedEndpoint, { cache: 'default' });
            if (response.ok) {
                noembedData = await response.json();
            }
        } catch (_e) { }
    }

    const microlinkLikes = pickBestInstagramCount(
        microlinkData?.likes,
        microlinkData?.like_count,
        microlinkData?.engagement?.likes
    );
    const microlinkComments = pickBestInstagramCount(
        microlinkData?.comments,
        microlinkData?.comment_count,
        microlinkData?.engagement?.comments
    );
    const resolvedLikes = internalLikes > 0 ? internalLikes : microlinkLikes;
    const resolvedComments = internalComments > 0 ? internalComments : microlinkComments;
    const likesSource = internalLikes > 0 ? 'instagram' : (microlinkLikes > 0 ? 'microlink' : 'none');
    const commentsSource = internalComments > 0 ? 'instagram' : (microlinkComments > 0 ? 'microlink' : 'none');

    const merged = {
        likes: resolvedLikes,
        comments: resolvedComments,
        title: internalMeta?.title || microlinkData?.title || noembedData?.title || '',
        description: internalMeta?.description || microlinkData?.description || noembedData?.title || '',
        authorName: internalMeta?.displayName || microlinkData?.author?.name || noembedData?.author_name || '',
        authorUrl: microlinkData?.author?.url || '',
        username: internalMeta?.username || microlinkData?.author?.username || '',
        profileImage: internalMeta?.profileImage || microlinkData?.author?.image?.url || microlinkData?.author?.avatar || '',
        collaborators: internalMeta?.collaborators || [],
        hasAdditionalCollaborator: Boolean(internalMeta?.hasAdditionalCollaborator)
    };

    // Fallback final: buscar embed diretamente do navegador do usuÃ¡rio
    if (resolvedLikes <= 0 && resolvedComments <= 0) {
        try {
            const embedData = await fetchInstagramEmbedDataFromBrowser(instagramUrl);
            if (embedData) {
                if (embedData.likes > 0) merged.likes = embedData.likes;
                if (embedData.comments > 0) merged.comments = embedData.comments;
            }
        } catch (_e) { }
    }

    const normalized = normalizeInstagramMeta(merged, instagramUrl);
    return {
        ...normalized,
        likesSource: merged.likes > 0 ? (internalLikes > 0 ? 'instagram' : (microlinkLikes > 0 ? 'microlink' : 'embed')) : 'none',
        commentsSource: merged.comments > 0 ? (internalComments > 0 ? 'instagram' : (microlinkComments > 0 ? 'microlink' : 'embed')) : 'none',
        source: internalMeta ? 'instagram' : (microlinkData ? 'microlink' : (noembedData ? 'noembed' : 'unknown'))
    };
}

function getInstagramVisiblePostsCount() {
    try {
        const runtimeLayout = window.publicSiteLayoutConfig || {};
        const savedLayout = JSON.parse(localStorage.getItem('publicSiteLayout') || '{}');
        const configuredValue = Number(runtimeLayout.instagramPostsVisible || savedLayout.instagramPostsVisible || 4);
        return Math.max(1, Math.min(12, configuredValue || 4));
    } catch (_error) {
        return 4;
    }
}

function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

const TOP_BANNER_TRANSITIONS = ['fade', 'slide', 'zoom'];
const TOP_BANNER_MOBILE_DEFAULTS = {
    transition: 'fade',
    intervalSeconds: 3
};
const DEFAULT_TOP_BANNER_SLOT = {
    mode: 'photos',
    transition: 'fade',
    intervalSeconds: 5,
    media: []
};
const topBannerTimers = {};
const topBannerStates = {};

function normalizeTopBannerMediaEntry(entry) {
    if (typeof entry === 'string') {
        const url = entry.trim();
        return url ? { url, key: '', name: '', type: '' } : null;
    }
    if (!entry || typeof entry !== 'object') return null;
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (!url) return null;
    return {
        url,
        key: typeof entry.key === 'string' ? entry.key : '',
        name: typeof entry.name === 'string' ? entry.name : '',
        type: typeof entry.type === 'string' ? entry.type : ''
    };
}

function normalizeTopBannerSlot(slot = {}) {
    const rawMode = String(slot.mode || DEFAULT_TOP_BANNER_SLOT.mode).toLowerCase();
    const mode = rawMode === 'gif' ? 'gif' : 'photos';

    const rawTransition = String(slot.transition || DEFAULT_TOP_BANNER_SLOT.transition).toLowerCase();
    const transition = TOP_BANNER_TRANSITIONS.includes(rawTransition) ? rawTransition : DEFAULT_TOP_BANNER_SLOT.transition;

    const interval = Number(slot.intervalSeconds);
    const intervalSeconds = Math.max(1, Math.min(30, Number.isFinite(interval) ? interval : DEFAULT_TOP_BANNER_SLOT.intervalSeconds));

    const sourceMedia = Array.isArray(slot.media)
        ? slot.media
        : Array.isArray(slot.images)
            ? slot.images
            : Array.isArray(slot.urls)
                ? slot.urls
                : [];

    const media = sourceMedia
        .map(normalizeTopBannerMediaEntry)
        .filter(Boolean);

    if (media.length === 0) {
        const fallbackEntry = normalizeTopBannerMediaEntry(slot.url || slot.gifUrl || '');
        if (fallbackEntry) media.push(fallbackEntry);
    }

    const normalizedMedia = mode === 'gif' ? media.slice(0, 1) : media;

    return {
        mode,
        transition,
        intervalSeconds,
        media: normalizedMedia
    };
}

function normalizeTopBannersConfig(config = {}) {
    const source = config && typeof config === 'object' ? config : {};
    const slotsArray = Array.isArray(source.slots) ? source.slots : [];

    const legacySlots = [
        source.slot1 || source.banner1 || source.left || null,
        source.slot2 || source.banner2 || source.right || null
    ].filter(Boolean);

    const sourceItems = Array.isArray(source.items)
        ? source.items
        : slotsArray.length > 0
            ? slotsArray
            : legacySlots;

    const items = sourceItems
        .map(normalizeTopBannerSlot)
        .filter(item => item && typeof item === 'object');

    const configuredDisplayCount = Number(source.displayCount);
    const fallbackDisplayCount = items.length;
    const displayCount = Math.max(
        0,
        Math.min(20, Number.isFinite(configuredDisplayCount) ? Math.round(configuredDisplayCount) : fallbackDisplayCount)
    );

    const mobileSourceRaw = source.mobile || source.mobileCarousel || {};
    const mobileSource = mobileSourceRaw && typeof mobileSourceRaw === 'object' ? mobileSourceRaw : {};
    const rawMobileTransition = String(mobileSource.transition || TOP_BANNER_MOBILE_DEFAULTS.transition).toLowerCase();
    const mobileTransition = TOP_BANNER_TRANSITIONS.includes(rawMobileTransition)
        ? rawMobileTransition
        : TOP_BANNER_MOBILE_DEFAULTS.transition;
    const rawMobileInterval = Number(mobileSource.intervalSeconds);
    const mobileIntervalSeconds = Math.max(
        1,
        Math.min(30, Number.isFinite(rawMobileInterval) ? rawMobileInterval : TOP_BANNER_MOBILE_DEFAULTS.intervalSeconds)
    );

    return {
        displayCount,
        items,
        mobile: {
            transition: mobileTransition,
            intervalSeconds: mobileIntervalSeconds
        }
    };
}

function getTopBannersLayoutConfig() {
    try {
        const runtimeLayout = window.publicSiteLayoutConfig || {};
        const savedLayout = JSON.parse(localStorage.getItem('publicSiteLayout') || '{}');
        const source = runtimeLayout.topBanners || savedLayout.topBanners || {};
        return normalizeTopBannersConfig(source);
    } catch (_error) {
        return normalizeTopBannersConfig({});
    }
}

function clearTopBannerTimer(slotId) {
    if (topBannerTimers[slotId]) {
        clearInterval(topBannerTimers[slotId]);
        delete topBannerTimers[slotId];
    }
}

function clearAllTopBannerTimers() {
    Object.keys(topBannerTimers).forEach(clearTopBannerTimer);
}

function getWrappedSlideOffset(index, currentIndex, total) {
    let offset = index - currentIndex;
    if (total > 1) {
        const half = total / 2;
        if (offset > half) offset -= total;
        if (offset < -half) offset += total;
    }
    return offset;
}

function applyTopBannerSlideState(slotId) {
    const state = topBannerStates[slotId];
    if (!state || !state.card) return;
    const slides = state.card.querySelectorAll('.top-banner-slide');
    if (!slides.length) return;

    slides.forEach((slide, index) => {
        const isActive = index === state.currentIndex;
        const offset = getWrappedSlideOffset(index, state.currentIndex, slides.length);
        slide.classList.toggle('active', isActive);
        slide.style.setProperty('--offset', String(offset));
        slide.style.zIndex = isActive ? '2' : '1';
    });
}

function startTopBannerRotation(slotId, intervalSeconds) {
    clearTopBannerTimer(slotId);
    const state = topBannerStates[slotId];
    if (!state || state.total <= 1) return;

    const intervalMs = Math.max(1000, Math.round(intervalSeconds * 1000));
    topBannerTimers[slotId] = setInterval(() => {
        const currentState = topBannerStates[slotId];
        if (!currentState || currentState.total <= 1) return;
        currentState.currentIndex = (currentState.currentIndex + 1) % currentState.total;
        applyTopBannerSlideState(slotId);
    }, intervalMs);
}

function createTopBannerImageElement(url, alt = '') {
    const img = document.createElement('img');
    img.className = 'top-banner-image';
    img.src = url;
    img.alt = alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
}

function applyTopBannerCardAspectRatio(card, media = []) {
    if (!card) return;
    card.style.removeProperty('aspect-ratio');

    const first = Array.isArray(media) ? media.find(item => item && item.url) : null;
    if (!first || !first.url) return;

    const hintWidth = Number(first.width || first.imageWidth || first.naturalWidth || 0);
    const hintHeight = Number(first.height || first.imageHeight || first.naturalHeight || 0);
    if (hintWidth > 0 && hintHeight > 0) {
        card.style.aspectRatio = `${hintWidth} / ${hintHeight}`;
        return;
    }

    const probe = new Image();
    probe.decoding = 'async';
    probe.onload = () => {
        if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
            card.style.aspectRatio = `${probe.naturalWidth} / ${probe.naturalHeight}`;
        }
    };
    probe.src = first.url;
}

function collectTopBannerMediaForMobile(items = []) {
    const media = [];
    (items || []).forEach(item => {
        if (!item || !Array.isArray(item.media) || item.media.length === 0) return;
        const first = item.media.find(entry => entry && entry.url);
        if (first) media.push(first);
    });
    return media;
}

function renderTopBannerSlot(slotId, slotConfig, card) {
    if (!card) return false;

    clearTopBannerTimer(slotId);
    delete topBannerStates[slotId];

    card.classList.remove('is-empty', 'transition-fade', 'transition-slide', 'transition-zoom');
    card.innerHTML = '';

    const media = Array.isArray(slotConfig.media) ? slotConfig.media.filter(item => item && item.url) : [];
    if (media.length === 0) {
        card.classList.add('is-empty');
        return false;
    }

    if (isMobileViewport()) {
        applyTopBannerCardAspectRatio(card, media);
    }

    const transition = TOP_BANNER_TRANSITIONS.includes(slotConfig.transition)
        ? slotConfig.transition
        : DEFAULT_TOP_BANNER_SLOT.transition;
    card.classList.add(`transition-${transition}`);

    const track = document.createElement('div');
    track.className = 'top-banner-track';
    card.appendChild(track);

    const mode = slotConfig.mode === 'gif' ? 'gif' : 'photos';
    if (mode === 'gif' || media.length === 1) {
        track.appendChild(createTopBannerImageElement(media[0].url, `Banner ${slotId}`));
        return true;
    }

    media.forEach((entry, index) => {
        const slide = document.createElement('div');
        slide.className = 'top-banner-slide';
        if (index === 0) slide.classList.add('active');
        slide.style.backgroundImage = `url("${entry.url}")`;
        track.appendChild(slide);
    });

    topBannerStates[slotId] = {
        card,
        currentIndex: 0,
        total: media.length
    };

    applyTopBannerSlideState(slotId);
    startTopBannerRotation(slotId, slotConfig.intervalSeconds);
    return true;
}

function renderTopBanners() {
    const section = document.getElementById('topBannersSection');
    const grid = document.getElementById('topBannersGrid') || (section ? section.querySelector('.top-banners-grid') : null);
    if (!section || !grid) return;

    clearAllTopBannerTimers();
    Object.keys(topBannerStates).forEach(slotId => {
        delete topBannerStates[slotId];
    });

    grid.innerHTML = '';

    const config = getTopBannersLayoutConfig();
    const items = Array.isArray(config.items)
        ? config.items.filter(item => Array.isArray(item.media) && item.media.some(media => media && media.url))
        : [];

    const maxVisible = config.displayCount > 0 ? config.displayCount : items.length;
    const itemsToRender = items.slice(0, maxVisible);

    if (isMobileViewport()) {
        const mobileMedia = collectTopBannerMediaForMobile(itemsToRender);
        if (mobileMedia.length === 0) {
            section.style.display = 'none';
            return;
        }

        const card = document.createElement('article');
        card.className = 'top-banner-card top-banner-card-mobile';
        grid.appendChild(card);

        renderTopBannerSlot('mobile-combined', {
            mode: 'photos',
            transition: (config.mobile && config.mobile.transition) || TOP_BANNER_MOBILE_DEFAULTS.transition,
            intervalSeconds: (config.mobile && config.mobile.intervalSeconds) || TOP_BANNER_MOBILE_DEFAULTS.intervalSeconds,
            media: mobileMedia
        }, card);

        grid.style.setProperty('--top-banner-columns', '1');
        section.style.display = 'block';
        return;
    }

    let visibleCount = 0;
    itemsToRender.forEach((slotConfig, index) => {
        const slotId = `banner-${index + 1}`;
        const card = document.createElement('article');
        card.className = 'top-banner-card';
        card.dataset.bannerId = slotId;
        grid.appendChild(card);

        if (renderTopBannerSlot(slotId, slotConfig, card)) {
            visibleCount += 1;
        }
    });

    grid.style.setProperty('--top-banner-columns', String(Math.max(1, visibleCount)));
    section.style.display = visibleCount > 0 ? 'block' : 'none';
}

window.addEventListener('beforeunload', clearAllTopBannerTimers);

// =========================================
// SIDEBAR BANNERS (BANNER LATERAL DESKTOP)
// =========================================

const SIDEBAR_BANNER_TRANSITIONS = ['fade', 'slide', 'zoom'];

const DEFAULT_SIDEBAR_BANNER_SLOT = {
    mode: 'photos',
    transition: 'fade',
    intervalSeconds: 5,
    media: []
};

const sidebarBannerTimers = {};
const sidebarBannerStates = {};
const SIDEBAR_BANNER_ACTIVE_CLASS = 'has-sidebar-banner';
let sidebarBannerVisibilitySyncRaf = 0;

function normalizeSidebarBannerMediaEntry(entry) {
    if (typeof entry === 'string') {
        const url = entry.trim();
        return url ? { url, key: '', name: '' } : null;
    }
    if (!entry || typeof entry !== 'object') return null;
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    return url ? { url, key: entry.key || '', name: entry.name || '' } : null;
}

function normalizeSidebarBannerSlot(slot = {}) {
    const rawMode = String(slot.mode || DEFAULT_SIDEBAR_BANNER_SLOT.mode).toLowerCase();
    const mode = rawMode === 'gif' ? 'gif' : 'photos';

    const rawTransition = String(slot.transition || DEFAULT_SIDEBAR_BANNER_SLOT.transition).toLowerCase();
    const transition = SIDEBAR_BANNER_TRANSITIONS.includes(rawTransition) ? rawTransition : DEFAULT_SIDEBAR_BANNER_SLOT.transition;

    const interval = Number(slot.intervalSeconds);
    const intervalSeconds = Math.max(1, Math.min(30, Number.isFinite(interval) ? interval : DEFAULT_SIDEBAR_BANNER_SLOT.intervalSeconds));

    const sourceMedia = Array.isArray(slot.media) ? slot.media : Array.isArray(slot.images) ? slot.images : Array.isArray(slot.urls) ? slot.urls : [];
    const media = sourceMedia.map(normalizeSidebarBannerMediaEntry).filter(Boolean);

    if (media.length === 0) {
        const fallback = normalizeSidebarBannerMediaEntry(slot.url || slot.gifUrl || '');
        if (fallback) media.push(fallback);
    }

    return {
        mode,
        transition,
        intervalSeconds,
        media: mode === 'gif' ? media.slice(0, 1) : media
    };
}

function normalizeSidebarBannersConfig(source = {}) {
    const src = source && typeof source === 'object' ? source : {};
    const sourceItems = Array.isArray(src.items) ? src.items : Array.isArray(src.slots) ? src.slots : [];
    const items = sourceItems.map(normalizeSidebarBannerSlot);
    return { items };
}

function getSidebarBannersLayoutConfig() {
    try {
        const runtimeLayout = window.publicSiteLayoutConfig || {};
        const savedLayout = JSON.parse(localStorage.getItem('publicSiteLayout') || '{}');
        const source = runtimeLayout.sidebarBanners || savedLayout.sidebarBanners || {};
        return normalizeSidebarBannersConfig(source);
    } catch (_error) {
        return normalizeSidebarBannersConfig({});
    }
}

function hasConfiguredSidebarBanners() {
    return false;
}

function clearSidebarBannerTimer(slotId) {
    if (sidebarBannerTimers[slotId]) {
        clearInterval(sidebarBannerTimers[slotId]);
        delete sidebarBannerTimers[slotId];
    }
}

function clearAllSidebarBannerTimers() {
    Object.keys(sidebarBannerTimers).forEach(clearSidebarBannerTimer);
}

function applySidebarBannerSlideState(slotId) {
    const state = sidebarBannerStates[slotId];
    if (!state || !state.card) return;
    const slides = state.card.querySelectorAll('.sidebar-banner-slide');
    if (!slides.length) return;

    slides.forEach((slide, index) => {
        const isActive = index === state.currentIndex;
        const offset = getWrappedSlideOffset(index, state.currentIndex, slides.length);
        slide.classList.toggle('active', isActive);
        slide.style.setProperty('--offset', String(offset));
        slide.style.zIndex = isActive ? '2' : '1';
    });
}

function startSidebarBannerRotation(slotId, intervalSeconds) {
    clearSidebarBannerTimer(slotId);
    const state = sidebarBannerStates[slotId];
    if (!state || state.total <= 1) return;

    const intervalMs = Math.max(1000, Math.round(intervalSeconds * 1000));
    sidebarBannerTimers[slotId] = setInterval(() => {
        const currentState = sidebarBannerStates[slotId];
        if (!currentState || currentState.total <= 1) return;
        currentState.currentIndex = (currentState.currentIndex + 1) % currentState.total;
        applySidebarBannerSlideState(slotId);
    }, intervalMs);
}

function renderSidebarBannerSlot(slotId, slotConfig, card) {
    const config = normalizeSidebarBannerSlot(slotConfig);
    const validMedia = config.media.filter(m => m && m.url);
    if (validMedia.length === 0) {
        card.classList.add('is-empty');
        return false;
    }
    card.classList.remove('is-empty');

    if (config.mode === 'gif') {
        const img = document.createElement('img');
        img.className = 'sidebar-banner-image';
        img.src = validMedia[0].url;
        img.alt = 'Banner lateral';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('load', () => {
            scheduleSidebarBannerVisibilitySync();
        }, { once: true });
        card.appendChild(img);
        return true;
    }

    card.classList.add(`transition-${config.transition}`);

    const track = document.createElement('div');
    track.className = 'sidebar-banner-track';
    card.appendChild(track);

    validMedia.forEach((item, index) => {
        const slide = document.createElement('div');
        slide.className = 'sidebar-banner-slide';
        slide.style.backgroundImage = `url('${item.url}')`;
        if (index === 0) {
            slide.classList.add('active');
            slide.style.zIndex = '2';
            slide.style.setProperty('--offset', '0');
        } else {
            slide.style.zIndex = '1';
            slide.style.setProperty('--offset', '1');
        }
        track.appendChild(slide);
    });

    sidebarBannerStates[slotId] = {
        card,
        currentIndex: 0,
        total: validMedia.length,
        transition: config.transition
    };

    if (validMedia.length > 1) {
        startSidebarBannerRotation(slotId, config.intervalSeconds);
    }

    // Ajustar aspect-ratio baseado na primeira imagem (para slideshow não ficar com altura 0)
    applySidebarBannerCardAspectRatio(card, validMedia);

    return true;
}

function applySidebarBannerCardAspectRatio(card, media = []) {
    if (!card) return;
    card.style.removeProperty('aspect-ratio');

    const first = Array.isArray(media) ? media.find(item => item && item.url) : null;
    if (!first || !first.url) return;

    // Tentar obter dimensÃµes se disponÃ­veis no objeto de mÃ­dia (se o admin salvar)
    // Se não, carregar a imagem para descobrir
    const probe = new Image();
    probe.onload = () => {
        if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
            card.style.aspectRatio = `${probe.naturalWidth} / ${probe.naturalHeight}`;
            scheduleSidebarBannerVisibilitySync();
        }
    };
    probe.src = first.url;
}

function setSidebarBannerVisibilityState(isVisible) {
    if (!document.body) return;
    document.body.classList.remove(SIDEBAR_BANNER_ACTIVE_CLASS);
}

function getSidebarColumnsConfig() {
    const layout = window.publicSiteLayoutConfig || {};
    const baseFromLayout = Number(layout.cardsPerRow);
    const expandedFromLayout = Number(layout.expandedCardsPerRow);
    const base = Number.isFinite(baseFromLayout) && baseFromLayout > 0 ? baseFromLayout : 5;
    const expanded = Number.isFinite(expandedFromLayout) && expandedFromLayout >= base ? expandedFromLayout : (base + 1);
    return { base, expanded };
}

function positionSidebarBannerTop(section) {
    if (!section) return;
    const topAnchor = getSidebarTopAnchor();
    if (!topAnchor) {
        section.style.removeProperty('top');
        return;
    }
    const topOffset = topAnchor.getBoundingClientRect().top + window.scrollY;
    section.style.top = `${Math.max(0, Math.round(topOffset))}px`;
}

function getSidebarTopAnchor() {
    const topBannersSection = document.getElementById('topBannersSection');
    if (topBannersSection && window.getComputedStyle(topBannersSection).display !== 'none') {
        const topBannersGrid = document.getElementById('topBannersGrid');
        const firstTopBannerCard = topBannersGrid ? topBannersGrid.querySelector('.top-banner-card') : null;
        return firstTopBannerCard || topBannersGrid || topBannersSection;
    }

    const firstVisibleContentSection = Array.from(document.querySelectorAll('main .news-section, main .category-section'))
        .find((section) => window.getComputedStyle(section).display !== 'none');

    return firstVisibleContentSection || document.querySelector('main');
}

function shouldReserveSpaceForSidebarBanner(section) {
    if (!section) return false;
    if (window.innerWidth < 1200) return false;
    if (window.getComputedStyle(section).display === 'none') return false;

    const rect = section.getBoundingClientRect();
    if (rect.height <= 0) return false;

    const sectionTop = rect.top + window.scrollY;
    const sectionBottom = sectionTop + rect.height;
    const viewportTop = window.scrollY || window.pageYOffset || 0;
    const viewportBottom = viewportTop + window.innerHeight;

    return viewportBottom > sectionTop && viewportTop < sectionBottom;
}

function syncSidebarBannerVisibilityState() {
    sidebarBannerVisibilitySyncRaf = 0;
    const section = document.getElementById('sidebarBannerSection');
    const isActive = Boolean(
        hasConfiguredSidebarBanners() &&
        window.innerWidth >= 1200 &&
        section &&
        window.getComputedStyle(section).display !== 'none' &&
        section.getBoundingClientRect().height > 0 &&
        shouldReserveSpaceForSidebarBanner(section)
    );
    setSidebarBannerVisibilityState(isActive);
}

function scheduleSidebarBannerVisibilitySync() {
    if (sidebarBannerVisibilitySyncRaf) return;
    sidebarBannerVisibilitySyncRaf = window.requestAnimationFrame(syncSidebarBannerVisibilityState);
}

function renderSidebarBanners() {
    const section = document.getElementById('sidebarBannerSection');
    const container = document.getElementById('sidebarBannersStickyContainer');
    if (!section || !container) return;

    // Banner lateral desativado por decisão de layout.
    clearAllSidebarBannerTimers();
    Object.keys(sidebarBannerStates).forEach(slotId => {
        delete sidebarBannerStates[slotId];
    });
    container.innerHTML = '';
    section.style.display = 'none';
    section.style.removeProperty('top');
    setSidebarBannerVisibilityState(false);
}

window.addEventListener('beforeunload', clearAllSidebarBannerTimers);
window.addEventListener('scroll', scheduleSidebarBannerVisibilitySync, { passive: true });
window.addEventListener('load', () => {
    const section = document.getElementById('sidebarBannerSection');
    if (section && window.getComputedStyle(section).display !== 'none') {
        positionSidebarBannerTop(section);
    }
    scheduleSidebarBannerVisibilitySync();
});

// Obter logo do site configurada no admin
function getSiteLogo() {
    const brandSettings = localStorage.getItem('publicSiteBrand');
    if (brandSettings) {
        try {
            const settings = JSON.parse(brandSettings);
            if (settings.logo) return settings.logo;
        } catch (e) { }
    }
    return null;
}

// Criar card de notícia
function createNewsCard(news) {
    const categoryLabel = news.categoryName || news.category || 'Geral';
    const isExternal = news.externalUrl || news.isImported;

    let sourceDomain, sourceLogo;

    if (isExternal) {
        // Notícia de terceiros - usar favicon
        sourceDomain = news.sourceDomain || getDomainFromUrl(news.externalUrl);
        sourceLogo = `https://www.google.com/s2/favicons?domain=${sourceDomain}&sz=64`;
    } else {
        // Notícia prÃ³pria - usar logo do site configurada
        sourceDomain = 'Nossa Noticia';
        const siteLogo = getSiteLogo();
        if (siteLogo) {
            sourceLogo = siteLogo;
        } else {
            // Se não tiver logo, usar favicon como fallback
            sourceDomain = window.location.hostname || 'miradoronline.com.br';
            sourceLogo = `https://www.google.com/s2/favicons?domain=${sourceDomain}&sz=64`;
        }
    }

    // Formatar data e hora separadamente
    const dateObj = new Date(news.date);
    const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    return `
        <article class="news-card" onclick="viewNews('${news.id}')">
            <div class="news-card-image-wrapper">
                <img src="${news.image}" alt="${news.title}" class="news-card-image">
                <div class="news-card-gradient"></div>
                <div class="news-card-overlay">
                    <h3 class="news-card-title">${news.title}</h3>
                </div>
            </div>
            <div class="news-card-footer">
                <span class="news-card-category-text">${categoryLabel}</span>
                <div class="news-card-datetime">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    ${timeStr} &#8226; ${dateStr}
                </div>
                <div class="news-card-source-row">
                    <div class="news-card-source">
                        <img src="${sourceLogo}" alt="${sourceDomain}" ${!isExternal && getSiteLogo() ? 'style="width: auto; max-width: 80px; height: 16px; object-fit: contain;"' : ''}>
                        ${isExternal ? `<span class="news-card-source-name">${sourceDomain}</span>` : ''}
                    </div>
                    <button class="news-card-share-btn" onclick="shareNews('${news.id}', event)" title="Compartilhar">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </article>
    `;
}

// Criar card de notícia HORIZONTAL - layout especial (foto esquerda, texto direita)
function createHorizontalNewsCard(news) {
    const categoryLabel = news.categoryName || news.category || 'Geral';
    const isExternal = news.externalUrl || news.isImported;

    let sourceDomain, sourceLogo;

    if (isExternal) {
        sourceDomain = news.sourceDomain || getDomainFromUrl(news.externalUrl);
        sourceLogo = `https://www.google.com/s2/favicons?domain=${sourceDomain}&sz=64`;
    } else {
        sourceDomain = 'Nossa Noticia';
        const siteLogo = getSiteLogo();
        if (siteLogo) {
            sourceLogo = siteLogo;
        } else {
            sourceDomain = window.location.hostname || 'miradoronline.com.br';
            sourceLogo = `https://www.google.com/s2/favicons?domain=${sourceDomain}&sz=64`;
        }
    }

    const dateObj = new Date(news.date);
    const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    return `
        <article class="news-card-horizontal" onclick="viewNews('${news.id}')">
            <div class="news-card-horizontal-image">
                <img src="${news.image}" alt="${news.title}">
            </div>
            <div class="news-card-horizontal-content">
                <h3 class="news-card-horizontal-title">${news.title}</h3>
                <div class="news-card-horizontal-footer">
                    <span class="news-card-horizontal-category">${categoryLabel}</span>
                    <div class="news-card-horizontal-subline">
                        <span class="news-card-horizontal-time">${timeStr} &#8226; ${dateStr}</span>
                        <div class="news-card-horizontal-source-row">
                            <div class="news-card-horizontal-source">
                                <img src="${sourceLogo}" alt="${sourceDomain}" ${!isExternal && getSiteLogo() ? 'style="width: auto; max-width: 50px; height: 12px;"' : ''}>
                            </div>
                            <button class="news-card-horizontal-share-btn" onclick="shareNews('${news.id}', event)" title="Compartilhar">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    `;
}

// Renderizar notícias com layout alternado
// Renderizar bloco de notícias com padrÃ£o: 2 normais + 1 especial
function renderNewsBlockMobile(newsItems, container) {
    let html = '';
    let index = 0;
    let cycleIndex = 0;

    while (index < newsItems.length) {
        const cardHtml = createNewsCard(newsItems[index++]);
        const isWide = cycleIndex === 0;
        html += `<div class="news-mobile-item ${isWide ? 'news-mobile-wide' : ''}">${cardHtml}</div>`;
        cycleIndex = (cycleIndex + 1) % 7; // 1 grande + 6 cards (3 fileiras de 2)
    }

    if (container) {
        container.innerHTML = html || '<div class="empty-state">Nenhuma noticia encontrada.</div>';
    }

    return index;
}

function getSidebarAbsoluteBounds() {
    if (window.innerWidth < 1200) return null;
    if (!hasConfiguredSidebarBanners()) return null;

    const section = document.getElementById('sidebarBannerSection');
    if (!section) return null;
    if (window.getComputedStyle(section).display === 'none') return null;

    const rect = section.getBoundingClientRect();
    if (rect.height <= 0) return null;

    const top = rect.top + window.scrollY;
    const bottom = top + rect.height;
    return { top, bottom };
}

function buildDesktopNewsHtml(items, cardsPerRow, cardsInSpecialRow = 4) {
    if (!Array.isArray(items) || items.length === 0) return '';

    let html = '';
    let index = 0;

    // Padrão: 2 fileiras normais + 1 fileira horizontal
    for (let cycle = 0; cycle < 2 && index < items.length; cycle++) {
        if (index < items.length) {
            for (let i = 0; i < cardsPerRow && index < items.length; i++) {
                html += createNewsCard(items[index++]);
            }
        }

        if (index < items.length) {
            for (let i = 0; i < cardsPerRow && index < items.length; i++) {
                html += createNewsCard(items[index++]);
            }
        }

        if (index < items.length) {
            html += '<div class="news-row-horizontal">';
            for (let i = 0; i < cardsInSpecialRow && index < items.length; i++) {
                html += createHorizontalNewsCard(items[index++]);
            }
            html += '</div>';
        }
    }

    while (index < items.length) {
        html += createNewsCard(items[index++]);
    }

    return html;
}

function renderNewsBlock(newsItems, startIndex, container) {
    if (isMobileViewport()) {
        if (container) {
            container.classList.remove('news-grid-split');
            const sectionEl = container.closest('.news-section');
            if (sectionEl) {
                sectionEl.classList.remove('with-sidebar-gap', 'after-sidebar');
            }
        }
        return renderNewsBlockMobile(newsItems, container);
    }

    const { base, expanded } = getSidebarColumnsConfig();
    const cardsInSpecialRow = 4;
    const items = Array.isArray(newsItems) ? newsItems.slice(startIndex) : [];
    const finalIndex = startIndex + items.length;

    if (!container) return finalIndex;

    container.classList.remove('news-grid-split');
    const sectionEl = container.closest('.news-section');
    if (sectionEl) {
        sectionEl.classList.remove('with-sidebar-gap', 'after-sidebar');
    }

    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma noticia encontrada.</div>';
        return finalIndex;
    }

    const sidebarBounds = getSidebarAbsoluteBounds();
    if (!sidebarBounds) {
        const html = buildDesktopNewsHtml(items, base, cardsInSpecialRow);
        container.innerHTML = html || '<div class="empty-state">Nenhuma noticia encontrada.</div>';
        return finalIndex;
    }

    const gridTop = container.getBoundingClientRect().top + window.scrollY;
    const overlapHeight = sidebarBounds.bottom - gridTop;

    if (overlapHeight <= 0) {
        if (sectionEl) sectionEl.classList.add('after-sidebar');
        const html = buildDesktopNewsHtml(items, expanded, cardsInSpecialRow);
        container.innerHTML = html || '<div class="empty-state">Nenhuma noticia encontrada.</div>';
        return finalIndex;
    }

    if (sectionEl) sectionEl.classList.add('with-sidebar-gap');

    const estimatedRowHeight = 248;
    const overlapRows = Math.max(1, Math.ceil(overlapHeight / estimatedRowHeight));
    const overlapCount = Math.min(items.length, overlapRows * base);

    if (overlapCount >= items.length) {
        const html = buildDesktopNewsHtml(items, base, cardsInSpecialRow);
        container.innerHTML = html || '<div class="empty-state">Nenhuma noticia encontrada.</div>';
        return finalIndex;
    }

    const firstItems = items.slice(0, overlapCount);
    const remainingItems = items.slice(overlapCount);
    const firstHtml = buildDesktopNewsHtml(firstItems, base, cardsInSpecialRow);
    const remainingHtml = buildDesktopNewsHtml(remainingItems, expanded, cardsInSpecialRow);

    container.classList.add('news-grid-split');
    container.innerHTML = `
        <div class="news-grid-part news-grid-part-base">${firstHtml}</div>
        <div class="news-grid-part news-grid-part-expanded">${remainingHtml}</div>
    `;
    return finalIndex;
}

async function renderNews() {
    try {
        const news = await loadNewsFromFirebase();

        // Armazenar todas as notícias globalmente para compartilhamento
        window.allNews = news;

        // Destaques
        const featured = news.filter(n => n.featured);
        const featuredContainer = document.getElementById('featuredNews');
        if (featuredContainer) {
            featuredContainer.innerHTML = featured.length > 0
                ? featured.map(createNewsCard).join('')
                : '<div class="empty-state">Nenhuma noticia em destaque.</div>';
        }

        // Últimas notícias - excluindo notícias do Instagram (tÃªm seÃ§Ã£o prÃ³pria)
        const latest = news
            .filter(n => n.source !== 'Instagram' && n.category !== 'instagram')
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        const latestContainer = document.getElementById('latestNews');

        if (latestContainer) {
            renderNewsBlock(latest, 0, latestContainer);
        }

        // Renderizar seÃ§Ãµes por categoria
        const categories = [
            { id: 'esportes', containerId: 'categoryEsportes' },
            { id: 'politica', containerId: 'categoryPolitica' },
            { id: 'policia', containerId: 'categoryPolicia' },
            { id: 'regiao', containerId: 'categoryRegiao' },
            { id: 'mirador', containerId: 'categoryMirador' },
            { id: 'brasil', containerId: 'categoryBrasil' }
        ];

        categories.forEach(cat => {
            const categoryNews = news
                .filter(n => n.category === cat.id)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            const container = document.getElementById(cat.containerId);
            const sectionElement = document.querySelector(`[data-category="${cat.id}"]`);

            if (container && sectionElement) {
                if (categoryNews.length > 0) {
                    renderNewsBlock(categoryNews, 0, container);
                    sectionElement.style.display = 'block';
                } else {
                    sectionElement.style.display = 'none';
                }
            }
        });

        scheduleSidebarBannerVisibilitySync();
        requestAnimationFrame(scheduleSidebarBannerVisibilitySync);

    } catch (error) {
        console.error('[App] Erro ao renderizar notícias:', error);
    }
}

// Ver detalhes da notícia
function viewNews(id) {
    localStorage.setItem('currentNewsId', id);
    window.location.href = 'noticia.html?id=' + id;
}

// Busca
async function searchNews(query) {
    const news = await loadNewsFromFirebase();
    const results = news.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.excerpt.toLowerCase().includes(query.toLowerCase())
    );

    const container = document.getElementById('searchResults');
    if (container) {
        container.innerHTML = results.length > 0
            ? results.map(createNewsCard).join('')
            : '<div class="empty-state">Nenhum resultado encontrado.</div>';
    }
}

// Toggle modal de busca
function toggleSearchModal() {
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.classList.toggle('active');
        if (modal.classList.contains('active')) {
            document.getElementById('searchInput')?.focus();
        }
    }
}

// Toggle menu mobile
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.toggle('active');
}

// Side Panel (Categories Menu)
let sidePanelTimer = null;

function openSidePanel() {
    const panel = document.getElementById('sidePanel');
    const backdrop = document.getElementById('sidePanelBackdrop');

    if (panel) {
        panel.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Start auto-close timer (10 seconds)
        startSidePanelTimer();
    }
}

function closeSidePanel() {
    const panel = document.getElementById('sidePanel');
    const backdrop = document.getElementById('sidePanelBackdrop');

    if (panel) {
        panel.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';

        // Clear timer
        clearSidePanelTimer();
    }
}

function startSidePanelTimer() {
    // Clear existing timer if any
    clearSidePanelTimer();

    // Set new timer for 10 seconds
    sidePanelTimer = setTimeout(() => {
        closeSidePanel();
    }, 10000);
}

function clearSidePanelTimer() {
    if (sidePanelTimer) {
        clearTimeout(sidePanelTimer);
        sidePanelTimer = null;
    }
}

function resetSidePanelTimer() {
    // Reset timer on user interaction
    if (document.getElementById('sidePanel')?.classList.contains('active')) {
        startSidePanelTimer();
    }
}

// Filtrar por categoria
async function filterByCategory(category) {
    const normalizedCategory = String(category || '').toLowerCase();

    if (normalizedCategory === 'instagram') {
        await goToInstagramFeedSection();

        // Fechar menu mobile se estiver aberto
        const mobileMenuEl = document.getElementById('mobileMenu');
        if (mobileMenuEl?.classList.contains('active')) {
            toggleMobileMenu();
        }

        // Fechar painel lateral se estiver aberto
        closeSidePanel();
        return;
    }

    const news = await loadNewsFromFirebase();
    const filtered = news.filter(n => n.category === normalizedCategory);
    const container = document.getElementById('latestNews');

    if (container) {
        if (filtered.length > 0) {
            renderNewsBlock(filtered, 0, container);
        } else {
            container.innerHTML = '<div class="empty-state">Nenhuma noticia nesta categoria.</div>';
        }
        scheduleSidebarBannerVisibilitySync();
        requestAnimationFrame(scheduleSidebarBannerVisibilitySync);
        container.scrollIntoView({ behavior: 'smooth' });
    }

    // Fechar menu mobile
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu?.classList.contains('active')) {
        toggleMobileMenu();
    }

    closeSidePanel();
}

// InicializaÃ§Ã£o
document.addEventListener('DOMContentLoaded', async function () {
    console.log('[App] v2.5 - Inicializando...');

    // Inicializar dados
    await initializeData();

    // Event Listeners
    document.querySelector('.btn-search')?.addEventListener('click', toggleSearchModal);
    document.querySelector('.search-close')?.addEventListener('click', toggleSearchModal);
    document.querySelector('.btn-menu-mobile')?.addEventListener('click', toggleMobileMenu);
    document.querySelector('.mobile-menu-close')?.addEventListener('click', toggleMobileMenu);
    document.getElementById('instagramVideoModalClose')?.addEventListener('click', closeInstagramVideoModal);
    document.getElementById('instagramVideoModalBackdrop')?.addEventListener('click', closeInstagramVideoModal);

    // Side Panel Events
    document.getElementById('btnSideMenu')?.addEventListener('click', openSidePanel);
    document.getElementById('sidePanelClose')?.addEventListener('click', closeSidePanel);
    document.getElementById('sidePanelBackdrop')?.addEventListener('click', closeSidePanel);

    // Reset timer on interaction with side panel
    const sidePanel = document.getElementById('sidePanel');
    if (sidePanel) {
        sidePanel.addEventListener('mouseenter', clearSidePanelTimer);
        sidePanel.addEventListener('mouseleave', startSidePanelTimer);
        sidePanel.addEventListener('click', resetSidePanelTimer);
    }

    // Busca em tempo real
    document.getElementById('searchInput')?.addEventListener('input', function (e) {
        if (e.target.value.length >= 2) {
            searchNews(e.target.value);
        }
    });

    // Fechar modal ao clicar fora
    document.getElementById('searchModal')?.addEventListener('click', function (e) {
        if (e.target === this) toggleSearchModal();
    });

    // Links de categoria
    document.querySelectorAll('[data-category]').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            filterByCategory(this.getAttribute('data-category'));
        });
    });

    // Fechar menu mobile ao clicar fora
    document.addEventListener('click', function (e) {
        const menu = document.getElementById('mobileMenu');
        const btn = document.querySelector('.btn-menu-mobile');
        if (menu && !menu.contains(e.target) && !btn?.contains(e.target)) {
            menu.classList.remove('active');
        }
    });

    // Carregar e aplicar configuraÃ§Ãµes de links do rodapÃ©
    loadFooterLinks();

    // Carregar stories
    loadStories();

    // Carregar banners do topo
    renderTopBanners();

    // Carregar banners laterais (desktop)
    renderSidebarBanners();

    // Renderizar notícias (após medir banner lateral)
    await renderNews();

    // Carregar notícias do Instagram
    await loadInstagramProfileSettings();
    loadInstagramNews();

    console.log('[App] v2.5 - Pronto!');
});

const footerInstitutionalContent = {
    siteName: 'Mirador e Regiao Online',
    about: '',
    privacy: '',
    terms: ''
};

function normalizeFooterSection(section) {
    if (section === 'privacy' || section === 'terms') return section;
    return 'about';
}

function buildInstitutionalUrl(section) {
    const safeSection = normalizeFooterSection(section);
    return `institucional.html?sec=${encodeURIComponent(safeSection)}`;
}

function updateFooterInstitutionalLinks() {
    const linkMap = [
        { id: 'footerLinkAboutEl', sec: 'about' },
        { id: 'footerLinkPrivacyEl', sec: 'privacy' },
        { id: 'footerLinkTermsEl', sec: 'terms' }
    ];

    linkMap.forEach(item => {
        const el = document.getElementById(item.id);
        if (!el) return;
        el.href = buildInstitutionalUrl(item.sec);
    });
}

function isLikelyUrlText(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    return /^(https?:\/\/|www\.)/i.test(text) || /^[\w-]+\.html$/i.test(text);
}

function getSiteNameForFooter() {
    const footerSiteName = document.getElementById('footerSiteName');
    const fallbackName = footerSiteName ? footerSiteName.textContent.trim() : '';
    return fallbackName || 'Mirador e Regiao Online';
}

function getDefaultAboutText(siteName) {
    return `${siteName} nasceu para informar Mirador e toda a regiao com jornalismo local, responsabilidade editorial e compromisso com a comunidade.`;
}

function getDefaultPrivacyText(siteName) {
    return `${siteName} utiliza dados minimos de navegacao apenas para melhorar a experiencia no portal e nao comercializa dados pessoais de leitores.`;
}

function getDefaultTermsText(siteName) {
    return [
        `Os termos de uso do ${siteName} definem as regras para acesso e utilizacao do conteudo publicado no portal.`,
        '1. O conteudo tem finalidade jornalistica e informativa.',
        '2. A reproducao total do material depende de autorizacao previa da redacao.',
        '3. Comentarios e interacoes devem respeitar a legislacao vigente e a boa convivencia.',
        '4. A equipe editorial pode atualizar, corrigir ou remover publicacoes para preservar qualidade e veracidade.',
        '5. O uso continuo do portal representa concordancia com estes termos.'
    ].join('\n\n');
}

function isValidSocialLink(url) {
    const clean = String(url || '').trim();
    if (!clean) return false;
    try {
        const parsed = new URL(clean);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_error) {
        return false;
    }
}

function getPhoneHref(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const clean = raw.replace(/[^\d+]/g, '');
    return clean ? `tel:${clean}` : '';
}

function persistInstitutionalContent(siteName) {
    const payload = {
        siteName: String(siteName || '').trim() || 'Mirador e Regiao Online',
        about: footerInstitutionalContent.about,
        privacy: footerInstitutionalContent.privacy,
        terms: footerInstitutionalContent.terms,
        updatedAt: Date.now()
    };

    try {
        localStorage.setItem('publicInstitutionalContent', JSON.stringify(payload));
    } catch (_error) { }
}

// Carregar configuraÃ§Ãµes de links do rodapÃ©
async function loadFooterLinks() {
    try {
        const doc = await db.collection('settings').doc('footer').get();
        if (doc.exists) {
            const links = doc.data();
            applyFooterLinks(links);
            localStorage.setItem('publicFooterLinks', JSON.stringify(links));
        } else {
            const saved = localStorage.getItem('publicFooterLinks');
            if (saved) applyFooterLinks(JSON.parse(saved));
            else applyFooterLinks({});
        }
    } catch (_error) {
        const saved = localStorage.getItem('publicFooterLinks');
        if (saved) applyFooterLinks(JSON.parse(saved));
        else applyFooterLinks({});
    }
}

function applyFooterLinks(links) {
    const DEFAULT_VISIBLE_FOOTER_EMAIL = 'miradoreregiaoonline@gmail.com';
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const siteName = getSiteNameForFooter();
    const aboutTextRaw = String(links?.aboutText || links?.aboutDescription || '').trim();
    const privacyTextRaw = String(links?.privacyText || '').trim();
    const termsTextRaw = String(links?.termsText || '').trim();
    const contactTextRaw = String(links?.contactText || links?.contact || '').trim();
    const contactPhoneRaw = String(links?.contactPhone || links?.phone || '').trim();
    const contactEmailRaw = String(links?.contactEmail || links?.email || '').trim();

    footerInstitutionalContent.siteName = siteName;
    footerInstitutionalContent.about = aboutTextRaw && !isLikelyUrlText(aboutTextRaw)
        ? aboutTextRaw
        : getDefaultAboutText(siteName);
    footerInstitutionalContent.privacy = privacyTextRaw && !isLikelyUrlText(privacyTextRaw)
        ? privacyTextRaw
        : getDefaultPrivacyText(siteName);
    footerInstitutionalContent.terms = termsTextRaw && !isLikelyUrlText(termsTextRaw)
        ? termsTextRaw
        : getDefaultTermsText(siteName);

    const contactTextEl = document.getElementById('footerContactTextEl');
    if (contactTextEl) {
        if (contactTextRaw) {
            contactTextEl.textContent = contactTextRaw;
            contactTextEl.style.display = 'block';
        } else {
            contactTextEl.textContent = '';
            contactTextEl.style.display = 'none';
        }
    }

    const contactPhoneEl = document.getElementById('footerContactPhoneEl');
    if (contactPhoneEl) {
        if (contactPhoneRaw) {
            contactPhoneEl.textContent = contactPhoneRaw;
            contactPhoneEl.href = getPhoneHref(contactPhoneRaw) || '#';
            contactPhoneEl.style.display = 'flex';
        } else {
            contactPhoneEl.style.display = 'none';
        }
    }

    const contactEmailEl = document.getElementById('footerContactEmailEl');
    if (contactEmailEl) {
        const normalizedConfigEmail = String(contactEmailRaw || '').trim().replace(/\s+/g, '');
        const fallbackEmail = String(contactEmailEl.textContent || '').trim().replace(/\s+/g, '');
        const emailToUse = EMAIL_REGEX.test(normalizedConfigEmail)
            ? normalizedConfigEmail
            : (EMAIL_REGEX.test(fallbackEmail) ? fallbackEmail : DEFAULT_VISIBLE_FOOTER_EMAIL);
        contactEmailEl.textContent = emailToUse;
        contactEmailEl.href = `mailto:${emailToUse}`;
        contactEmailEl.style.display = 'flex';
    }

    const social = links?.social || {};
    const socialMap = [
        { id: 'footerSocialInstagramEl', value: social.instagram },
        { id: 'footerSocialFacebookEl', value: social.facebook },
        { id: 'footerSocialTwitterEl', value: social.twitter },
        { id: 'footerSocialYoutubeEl', value: social.youtube }
    ];

    socialMap.forEach(item => {
        const el = document.getElementById(item.id);
        if (!el) return;
        if (isValidSocialLink(item.value)) {
            el.href = item.value.trim();
            el.style.display = 'flex';
        } else {
            el.style.display = 'none';
        }
    });

    updateFooterInstitutionalLinks();
    persistInstitutionalContent(siteName);
}

// Stories functionality
let storiesData = [];
let currentStoryIndex = 0;
let storyProgressInterval = null;
let storyAutoAdvanceTimeout = null;
const STORY_DURATION = 5000; // 5 seconds per story

async function loadStories() {
    try {
        const snapshot = await db.collection('stories').orderBy('date', 'desc').limit(20).get();
        storiesData = [];
        snapshot.forEach(doc => {
            storiesData.push({ id: doc.id, ...doc.data() });
        });
        renderStories();
    } catch (error) {
        console.log('[App] Erro ao carregar stories:', error);
    }
}

function renderStories() {
    const container = document.getElementById('storiesContainer');
    const storiesSection = document.querySelector('.stories-section');
    if (!container) return;

    if (storiesData.length === 0) {
        container.innerHTML = '';
        if (storiesSection) storiesSection.style.display = 'none';
        return;
    }

    if (storiesSection) storiesSection.style.display = 'block';

    container.innerHTML = storiesData.map((story, index) => {
        let avatarContent = '';

        if (story.type === 'text') {
            // Story de texto - mostrar cÃ­rculo com gradiente
            avatarContent = `<div style="width: 100%; height: 100%; border-radius: 50%; background: ${story.bgColor || 'linear-gradient(45deg, #f09433, #e6683c, #dc2743)'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem; font-weight: bold;">T</div>`;
        } else if (story.isVideo) {
            // Story de vÃ­deo - mostrar preview com Ã­cone de play
            avatarContent = `
                <img src="${story.image}" alt="${story.title}" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
                    <svg width="12" height="12" fill="white" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                </div>
            `;
        } else {
            // Story de imagem
            avatarContent = `<img src="${story.image}" alt="${story.title}">`;
        }

        return `
            <div class="story-item" onclick="openStory(${index})">
                <div class="story-avatar" style="position: relative;">
                    ${avatarContent}
                </div>
                <div class="story-item-title">${story.title}</div>
            </div>
        `;
    }).join('');
}

function openStory(index) {
    currentStoryIndex = index;
    const modal = document.getElementById('storyModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        showCurrentStory();
    }
}

function closeStoryModal() {
    const modal = document.getElementById('storyModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        clearStoryTimers();
    }
}

function showCurrentStory() {
    clearStoryTimers();

    const story = storiesData[currentStoryIndex];
    if (!story) return;

    const storyContent = document.querySelector('.story-content');

    // Limpar conteúdo anterior
    storyContent.innerHTML = '';

    // Renderizar baseado no tipo
    if (story.type === 'text') {
        // Story de texto
        storyContent.innerHTML = `
            <div style="width: 100%; height: 100%; background: ${story.bgColor || 'linear-gradient(45deg, #f09433, #e6683c, #dc2743)'}; display: flex; align-items: center; justify-content: center; padding: 2rem;">
                <p style="color: white; font-size: 1.5rem; font-weight: 600; text-align: center; line-height: 1.4;">${story.text || story.title}</p>
            </div>
        `;
    } else if (story.isVideo) {
        // Story de vÃ­deo
        storyContent.innerHTML = `
            <video src="${story.image}" style="width: 100%; height: 100%; object-fit: cover;" autoplay playsinline></video>
        `;
    } else {
        // Story de imagem
        storyContent.innerHTML = `
            <img src="${story.image}" alt="${story.title}" style="width: 100%; height: 100%; object-fit: cover;">
            ${story.title ? `<div class="story-caption">${story.title}</div>` : ''}
        `;
    }

    document.getElementById('storyTime').textContent = formatStoryTime(story.date);

    // Esconder botÃ£o "Ver no Instagram" se não tiver link
    const storyLink = document.getElementById('storyLink');
    if (storyLink) {
        if (story.instagramUrl) {
            storyLink.href = story.instagramUrl;
            storyLink.style.display = 'flex';
        } else {
            storyLink.style.display = 'none';
        }
    }

    // Update navigation visibility
    const prevBtn = document.getElementById('storyPrev');
    const nextBtn = document.getElementById('storyNext');
    if (prevBtn) prevBtn.style.visibility = currentStoryIndex > 0 ? 'visible' : 'hidden';
    if (nextBtn) nextBtn.style.visibility = currentStoryIndex < storiesData.length - 1 ? 'visible' : 'hidden';

    // Start progress
    startStoryProgress();
}

function startStoryProgress() {
    const progressBar = document.getElementById('storyProgressBar');
    if (!progressBar) return;

    progressBar.style.width = '0%';
    progressBar.style.transition = 'none';

    // Force reflow
    void progressBar.offsetWidth;

    progressBar.style.transition = `width ${STORY_DURATION}ms linear`;
    progressBar.style.width = '100%';

    storyAutoAdvanceTimeout = setTimeout(() => {
        nextStory();
    }, STORY_DURATION);
}

function clearStoryTimers() {
    if (storyProgressInterval) {
        clearInterval(storyProgressInterval);
        storyProgressInterval = null;
    }
    if (storyAutoAdvanceTimeout) {
        clearTimeout(storyAutoAdvanceTimeout);
        storyAutoAdvanceTimeout = null;
    }
}

function nextStory() {
    if (currentStoryIndex < storiesData.length - 1) {
        currentStoryIndex++;
        showCurrentStory();
    } else {
        closeStoryModal();
    }
}

function prevStory() {
    if (currentStoryIndex > 0) {
        currentStoryIndex--;
        showCurrentStory();
    }
}

function formatStoryTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Agora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return `${Math.floor(diff / 86400)} d`;
}

// Story event listeners
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('storyModalClose')?.addEventListener('click', closeStoryModal);
    document.getElementById('storyModalBackdrop')?.addEventListener('click', closeStoryModal);
    document.getElementById('storyNext')?.addEventListener('click', nextStory);
    document.getElementById('storyPrev')?.addEventListener('click', prevStory);

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
        const modal = document.getElementById('storyModal');
        if (!modal?.classList.contains('active')) return;

        if (e.key === 'Escape') closeStoryModal();
        if (e.key === 'ArrowRight') nextStory();
        if (e.key === 'ArrowLeft') prevStory();
    });
});

// Instagram News functionality
let allInstagramNews = [];
const INSTAGRAM_STATS_REQUEST_GAP_MS = 600;
const INSTAGRAM_STATS_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const INSTAGRAM_STATS_MIN_FETCH_INTERVAL_MS = 2 * 60 * 1000;
const INSTAGRAM_STATS_MAX_BACKGROUND_ITEMS = 12;
const INSTAGRAM_MICROLINK_COOLDOWN_MS = 10 * 60 * 1000;
let instagramStatsRefreshTimer = null;
let instagramStatsRefreshQueue = Promise.resolve();
const instagramStatsLastFetchMap = new Map();
let instagramMicrolinkCooldownUntil = 0;
const DEFAULT_INSTAGRAM_PROFILE_SETTINGS = {
    displayName: 'Mirador e Regiao Online',
    username: 'mirador_e_regiao_online',
    profileImage: ''
};
let instagramProfileSettings = { ...DEFAULT_INSTAGRAM_PROFILE_SETTINGS };

function normalizeInstagramProfileSettings(settings = {}) {
    const profileImageCandidates = [
        settings.profileImage,
        settings.profile_image,
        settings.profilePhoto,
        settings.profile_photo,
        settings.avatar,
        settings.avatarUrl,
        settings.avatar_url,
        settings.photo,
        settings.photoUrl,
        settings.photo_url,
        settings.image,
        settings.logo,
        settings.profile && settings.profile.image,
        settings.profile && settings.profile.photo
    ];
    const firstProfileImage = profileImageCandidates.find(value => typeof value === 'string' && value.trim());
    const displayNameRaw = (settings.displayName || settings.name || '').toString().trim();
    const usernameRaw = sanitizeInstagramHandle(settings.username || settings.handle || displayNameRaw);
    const profileImage = sanitizeInstagramProfileImage(firstProfileImage || '');

    return {
        displayName: displayNameRaw || DEFAULT_INSTAGRAM_PROFILE_SETTINGS.displayName,
        username: usernameRaw || DEFAULT_INSTAGRAM_PROFILE_SETTINGS.username,
        profileImage: profileImage || ''
    };
}

function getInstagramOfficialProfile() {
    return normalizeInstagramProfileSettings(instagramProfileSettings || {});
}

function extractInstagramProfileFromLayout(layoutData = {}) {
    const nested = (layoutData && typeof layoutData.instagramProfile === 'object' && layoutData.instagramProfile)
        ? layoutData.instagramProfile
        : {};

    return normalizeInstagramProfileSettings({
        ...nested,
        displayName:
            nested.displayName ||
            layoutData.instagramProfileDisplayName ||
            layoutData.instagramProfileName ||
            layoutData.instagramDisplayName ||
            '',
        username:
            nested.username ||
            layoutData.instagramProfileUsername ||
            layoutData.instagramUsername ||
            '',
        profileImage:
            nested.profileImage ||
            layoutData.instagramProfileImage ||
            layoutData.instagramProfilePhoto ||
            layoutData.instagramAvatar ||
            ''
    });
}

function hasInstagramProfileInLayout(layoutData = {}) {
    const nested = (layoutData && typeof layoutData.instagramProfile === 'object' && layoutData.instagramProfile)
        ? layoutData.instagramProfile
        : {};
    return Boolean(
        nested.displayName ||
        nested.username ||
        nested.profileImage ||
        layoutData.instagramProfileDisplayName ||
        layoutData.instagramProfileUsername ||
        layoutData.instagramProfileImage ||
        layoutData.instagramProfileName ||
        layoutData.instagramProfilePhoto ||
        layoutData.instagramAvatar
    );
}

function extractInstagramProfileFromBrand(brandData = {}) {
    return normalizeInstagramProfileSettings({
        displayName:
            brandData.instagramProfileDisplayName ||
            brandData.instagramDisplayName ||
            '',
        username:
            brandData.instagramProfileUsername ||
            brandData.instagramUsername ||
            brandData.instagramHandle ||
            '',
        profileImage:
            brandData.instagramProfileImage ||
            brandData.instagramProfilePhoto ||
            brandData.instagramAvatar ||
            ''
    });
}

function hasInstagramProfileInBrand(brandData = {}) {
    return Boolean(
        brandData.instagramProfileDisplayName ||
        brandData.instagramDisplayName ||
        brandData.instagramProfileUsername ||
        brandData.instagramUsername ||
        brandData.instagramHandle ||
        brandData.instagramProfileImage ||
        brandData.instagramProfilePhoto ||
        brandData.instagramAvatar
    );
}

async function loadInstagramProfileSettings() {
    let profileDoc = null;
    try {
        profileDoc = await db.collection('settings').doc('instagramProfile').get({ source: 'server' });
    } catch (_error) { }

    try {
        if (!profileDoc) {
            profileDoc = await db.collection('settings').doc('instagramProfile').get();
        }
        if (profileDoc && profileDoc.exists) {
            const normalized = normalizeInstagramProfileSettings(profileDoc.data() || {});
            instagramProfileSettings = normalized;
            localStorage.setItem('publicInstagramProfile', JSON.stringify(normalized));
            localStorage.setItem('siteInstagramProfile', JSON.stringify(normalized));
            return normalized;
        }
    } catch (error) {
        console.log('[App] Nao foi possivel carregar perfil oficial do Instagram:', error);
    }

    try {
        const layoutDoc = await db.collection('settings').doc('layout').get();
        if (layoutDoc && layoutDoc.exists && hasInstagramProfileInLayout(layoutDoc.data() || {})) {
            const normalized = extractInstagramProfileFromLayout(layoutDoc.data() || {});
            instagramProfileSettings = normalized;
            localStorage.setItem('publicInstagramProfile', JSON.stringify(normalized));
            localStorage.setItem('siteInstagramProfile', JSON.stringify(normalized));
            return normalized;
        }
    } catch (layoutError) {
        console.log('[App] Nao foi possivel carregar fallback do perfil no layout:', layoutError);
    }

    try {
        const savedLayout = localStorage.getItem('publicSiteLayout');
        if (savedLayout) {
            const parsedLayout = JSON.parse(savedLayout);
            if (hasInstagramProfileInLayout(parsedLayout)) {
                const normalizedFromLayout = extractInstagramProfileFromLayout(parsedLayout);
                instagramProfileSettings = normalizedFromLayout;
                localStorage.setItem('publicInstagramProfile', JSON.stringify(normalizedFromLayout));
                localStorage.setItem('siteInstagramProfile', JSON.stringify(normalizedFromLayout));
                return normalizedFromLayout;
            }
        }
    } catch (_error) { }

    try {
        const saved = localStorage.getItem('publicInstagramProfile');
        if (saved) {
            const normalized = normalizeInstagramProfileSettings(JSON.parse(saved));
            instagramProfileSettings = normalized;
            return normalized;
        }
    } catch (_error) { }

    try {
        const brandDoc = await db.collection('settings').doc('brand').get();
        if (brandDoc && brandDoc.exists && hasInstagramProfileInBrand(brandDoc.data() || {})) {
            const normalized = extractInstagramProfileFromBrand(brandDoc.data() || {});
            instagramProfileSettings = normalized;
            localStorage.setItem('publicInstagramProfile', JSON.stringify(normalized));
            localStorage.setItem('siteInstagramProfile', JSON.stringify(normalized));
            return normalized;
        }
    } catch (brandError) {
        console.log('[App] Nao foi possivel carregar fallback do perfil no brand:', brandError);
    }

    try {
        const savedBrand = localStorage.getItem('publicSiteBrand');
        if (savedBrand) {
            const parsedBrand = JSON.parse(savedBrand);
            if (hasInstagramProfileInBrand(parsedBrand || {})) {
                const normalized = extractInstagramProfileFromBrand(parsedBrand || {});
                instagramProfileSettings = normalized;
                localStorage.setItem('publicInstagramProfile', JSON.stringify(normalized));
                localStorage.setItem('siteInstagramProfile', JSON.stringify(normalized));
                return normalized;
            }
        }
    } catch (_error) { }

    try {
        const adminSaved = localStorage.getItem('siteInstagramProfile');
        if (adminSaved) {
            const normalized = normalizeInstagramProfileSettings(JSON.parse(adminSaved));
            instagramProfileSettings = normalized;
            localStorage.setItem('publicInstagramProfile', JSON.stringify(normalized));
            return normalized;
        }
    } catch (_error) { }

    instagramProfileSettings = { ...DEFAULT_INSTAGRAM_PROFILE_SETTINGS };
    return instagramProfileSettings;
}

function renderInstagramFeedSection(newsItems = []) {
    const section = document.getElementById('instagramFeedSection');
    const container = document.getElementById('categoryInstagramFeed');
    if (!section || !container) return;

    const items = Array.isArray(newsItems) ? newsItems : [];
    if (items.length === 0) {
        section.style.display = 'none';
        container.innerHTML = '';
        updateInstagramMobileCarousels();
        return;
    }

    section.style.display = 'block';
    container.innerHTML = items.map(createInstagramCard).join('');
    primeInstagramCardVideos(container);
    updateInstagramMobileCarousels();
}

function scrollInstagramCarousel(containerId, direction = 1, event = null) {
    if (event) event.preventDefault();
    const container = document.getElementById(containerId);
    if (!container || !isMobileViewport()) return;

    const firstCard = container.querySelector('.instagram-card');
    const computed = getComputedStyle(container);
    const gap = parseFloat(computed.columnGap || computed.gap || '0') || 0;
    const step = firstCard ? firstCard.getBoundingClientRect().width + gap : container.clientWidth;

    container.scrollBy({
        left: Math.max(1, direction) * step,
        behavior: 'smooth'
    });
}

function bindInstagramSwipeHint(container) {
    if (!container || container.dataset.swipeHintBound === '1') return;
    container.dataset.swipeHintBound = '1';
    container.addEventListener('scroll', () => {
        updateInstagramSwipeHintState(container);
    }, { passive: true });
}

function shouldIgnoreInstagramCardOpenTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(
        target.closest(
            '.instagram-card-action-btn, .instagram-card-close, .instagram-video-play-overlay, .instagram-gallery-prev, .instagram-gallery-next, a, button, input, textarea, select, label'
        )
    );
}

function bindInstagramMobileTapOpen(container) {
    if (!container || container.dataset.mobileTapOpenBound === '1') return;
    container.dataset.mobileTapOpenBound = '1';

    let touchStartX = 0;
    let touchStartY = 0;

    container.addEventListener('touchstart', (event) => {
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, { passive: true });

    container.addEventListener('touchend', (event) => {
        if (!isMobileViewport()) return;
        const touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;

        const dx = Math.abs(touch.clientX - touchStartX);
        const dy = Math.abs(touch.clientY - touchStartY);
        if (dx > 12 || dy > 12) return;

        const target = event.target;
        if (!target || shouldIgnoreInstagramCardOpenTarget(target)) return;

        const card = target.closest('.instagram-card');
        if (!card || !container.contains(card)) return;
        if (card.classList.contains('expanded')) return;

        const newsId = card.dataset.instagramId;
        if (!newsId) return;
        openInstagramModal(newsId, card);
    }, { passive: true });
}

function updateInstagramSwipeHintPosition(container, shell = null) {
    if (!container) return;
    const parentShell = shell || container.closest('.instagram-carousel-shell');
    if (!parentShell) return;

    const card = container.querySelector('.instagram-card:not(.expanded)');
    const imageWrapper = card ? card.querySelector('.instagram-card-image-wrapper') : null;
    if (!imageWrapper) {
        parentShell.style.removeProperty('--instagram-swipe-hint-top');
        return;
    }

    const shellRect = parentShell.getBoundingClientRect();
    const imageRect = imageWrapper.getBoundingClientRect();
    const centeredInCover = (imageRect.top - shellRect.top) + (imageRect.height / 2) - 10;
    const topPx = Math.max(18, Math.round(centeredInCover));
    parentShell.style.setProperty('--instagram-swipe-hint-top', `${topPx}px`);
}

function updateInstagramSwipeHintState(container) {
    if (!container) return;
    const shell = container.closest('.instagram-carousel-shell');
    if (!shell) return;

    const isMobileCarousel = isMobileViewport() && container.classList.contains('instagram-mobile-carousel');
    const hasOverflow = (container.scrollWidth - container.clientWidth) > 8;
    const atEnd = (container.scrollLeft + container.clientWidth) >= (container.scrollWidth - 8);
    const hasExpandedCard = Boolean(container.querySelector('.instagram-card.expanded'));

    updateInstagramSwipeHintPosition(container, shell);

    shell.classList.toggle('is-hint-visible', Boolean(isMobileCarousel && hasOverflow && !atEnd && !hasExpandedCard));
    shell.classList.toggle('is-scroll-end', Boolean(isMobileCarousel && hasOverflow && atEnd));

    if (!isMobileCarousel || !hasOverflow || hasExpandedCard) {
        shell.classList.remove('is-hint-visible');
        shell.classList.remove('is-scroll-end');
    }
}

function updateInstagramMobileCarousels() {
    const isMobile = isMobileViewport();
    const sections = [
        { containerId: 'instagramNewsGrid', buttonId: 'instagramTopNextBtn' },
        { containerId: 'categoryInstagramFeed', buttonId: 'instagramFeedNextBtn' }
    ];

    sections.forEach(entry => {
        const container = document.getElementById(entry.containerId);
        const button = document.getElementById(entry.buttonId);
        if (!container) return;

        bindInstagramSwipeHint(container);
        bindInstagramMobileTapOpen(container);

        if (isMobile) {
            container.classList.add('instagram-mobile-carousel');
            if (button) {
                const cardCount = container.querySelectorAll('.instagram-card').length;
                button.style.display = cardCount > 1 ? 'inline-flex' : 'none';
            }
        } else {
            container.classList.remove('instagram-mobile-carousel');
            container.scrollLeft = 0;
            if (button) {
                button.style.display = 'none';
            }
        }

        requestAnimationFrame(() => updateInstagramSwipeHintState(container));
        setTimeout(() => updateInstagramSwipeHintState(container), 120);
    });
}

async function goToInstagramFeedSection() {
    if (!Array.isArray(allInstagramNews) || allInstagramNews.length === 0) {
        await loadInstagramNews();
    } else {
        renderInstagramFeedSection(allInstagramNews);
        queueInstagramStatsRefresh(allInstagramNews, {
            force: false,
            forceFresh: false,
            limit: INSTAGRAM_STATS_MAX_BACKGROUND_ITEMS
        });
    }

    const section = document.getElementById('instagramFeedSection');
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

window.addEventListener('public-layout-updated', async () => {
    renderTopBanners();
    renderSidebarBanners();
    await renderNews();
    if (typeof loadInstagramNews === 'function') {
        await loadInstagramProfileSettings();
        loadInstagramNews();
    }
});

let lastMobileViewportState = isMobileViewport();
let responsiveViewportTimer = null;

window.addEventListener('resize', () => {
    clearTimeout(responsiveViewportTimer);
    responsiveViewportTimer = setTimeout(async () => {
        const isMobileNow = isMobileViewport();
        renderTopBanners();
        renderSidebarBanners();
        await renderNews();
        updateInstagramMobileCarousels();

        if (isMobileNow !== lastMobileViewportState) {
            lastMobileViewportState = isMobileNow;
            if (typeof loadInstagramNews === 'function') {
                loadInstagramNews();
            }
        }
    }, 180);
});

async function loadInstagramNews() {
    try {
        await loadInstagramProfileSettings();
        let news = [];

        try {
            // Tentar consulta com filtros (requer Ã­ndice)
            const snapshot = await db.collection('news')
                .where('source', '==', 'Instagram')
                .where('status', '==', 'published')
                .orderBy('date', 'desc')
                .get();

            snapshot.forEach(doc => {
                news.push({ id: doc.id, ...doc.data() });
            });
        } catch (indexError) {
            // Fallback: carregar todas e filtrar no cliente
            console.log('[App] Usando fallback para carregar notícias do Instagram');
            const snapshot = await db.collection('news')
                .orderBy('date', 'desc')
                .get();

            snapshot.forEach(doc => {
                const data = doc.data();
                if ((data.source === 'Instagram' || data.category === 'instagram') && data.status === 'published') {
                    news.push({ id: doc.id, ...data });
                }
            });
        }

        const container = document.getElementById('instagramNewsGrid');
        if (!container) return;

        allInstagramNews = news;

        if (news.length === 0) {
            container.innerHTML = '';
            renderInstagramFeedSection([]);
            updateInstagramMobileCarousels();
            stopInstagramStatsAutoRefresh();
            return;
        }

        // Mostrar quantidade configurada no painel (fallback: 4)
        const instagramVisiblePosts = getInstagramVisiblePostsCount();
        const newsToShow = news.slice(0, instagramVisiblePosts);

        container.innerHTML = newsToShow.map(createInstagramCard).join('');
        primeInstagramCardVideos(container);
        renderInstagramFeedSection(news);
        updateInstagramMobileCarousels();

        // Atualizar contagens reais de curtidas/comentÃ¡rios
        queueInstagramStatsRefresh(newsToShow, { force: true, forceFresh: false });
        scheduleInstagramStatsAutoRefresh();

    } catch (error) {
        console.error('[App] Erro ao carregar notícias do Instagram:', error);
    }
}

// Atualizar estatÃ­sticas do Instagram (curtidas e comentÃ¡rios)
function getInstagramStatsFetchKey(newsItem = {}) {
    if (newsItem.id) return `id:${newsItem.id}`;
    if (newsItem.instagramUrl) return `url:${newsItem.instagramUrl}`;
    return '';
}

function normalizeInstagramStatsQueue(newsItems = [], limit = 0) {
    const list = Array.isArray(newsItems) ? newsItems : [];
    const deduped = [];
    const seen = new Set();
    const maxItems = Number(limit) > 0 ? Number(limit) : 0;

    for (const item of list) {
        if (!item || !item.instagramUrl) continue;
        const key = getInstagramStatsFetchKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
        if (maxItems > 0 && deduped.length >= maxItems) break;
    }

    return deduped;
}

function getRenderedInstagramNews() {
    const renderedItems = [];
    const seen = new Set();
    const selectors = [
        '#instagramNewsGrid .instagram-card[data-instagram-id]',
        '#categoryInstagramFeed .instagram-card[data-instagram-id]'
    ];

    document.querySelectorAll(selectors.join(',')).forEach((card) => {
        const newsId = card?.dataset?.instagramId;
        if (!newsId || seen.has(newsId)) return;
        seen.add(newsId);

        const fromAllNews = Array.isArray(allInstagramNews)
            ? allInstagramNews.find(item => item && item.id === newsId)
            : null;
        if (fromAllNews && fromAllNews.instagramUrl) {
            renderedItems.push(fromAllNews);
            return;
        }

        const fromRuntime = instagramPostsData[newsId];
        if (fromRuntime && fromRuntime.instagramUrl) {
            renderedItems.push(fromRuntime);
        }
    });

    return renderedItems;
}

function shouldRefreshInstagramStats(fetchKey, force = false) {
    if (force) return true;
    const lastFetchAt = instagramStatsLastFetchMap.get(fetchKey) || 0;
    return (Date.now() - lastFetchAt) >= INSTAGRAM_STATS_MIN_FETCH_INTERVAL_MS;
}

function scheduleInstagramStatsAutoRefresh() {
    stopInstagramStatsAutoRefresh();

    if (!Array.isArray(allInstagramNews) || allInstagramNews.length === 0) return;

    instagramStatsRefreshTimer = setInterval(() => {
        if (document.hidden) return;
        const renderedPosts = getRenderedInstagramNews();
        if (renderedPosts.length === 0) return;
        queueInstagramStatsRefresh(renderedPosts, {
            force: false,
            forceFresh: false,
            limit: INSTAGRAM_STATS_MAX_BACKGROUND_ITEMS
        });
    }, INSTAGRAM_STATS_REFRESH_INTERVAL_MS);
}

function stopInstagramStatsAutoRefresh() {
    if (!instagramStatsRefreshTimer) return;
    clearInterval(instagramStatsRefreshTimer);
    instagramStatsRefreshTimer = null;
}

function queueInstagramStatsRefresh(newsItems = [], options = {}) {
    const queueItems = normalizeInstagramStatsQueue(newsItems, options.limit || 0);
    if (queueItems.length === 0) return Promise.resolve();

    instagramStatsRefreshQueue = instagramStatsRefreshQueue
        .catch(() => { })
        .then(() => runInstagramStatsRefresh(queueItems, options));

    return instagramStatsRefreshQueue;
}

async function runInstagramStatsRefresh(newsItems = [], options = {}) {
    const queueItems = normalizeInstagramStatsQueue(newsItems, options.limit || 0);
    if (queueItems.length === 0) return;

    const force = Boolean(options.force);
    const forceFresh = options.forceFresh !== false;

    for (const news of queueItems) {
        const fetchKey = getInstagramStatsFetchKey(news);
        if (!fetchKey || !news.instagramUrl) continue;
        if (!shouldRefreshInstagramStats(fetchKey, force)) continue;

        try {
            const meta = await fetchInstagramMeta(news.instagramUrl, { forceFresh });
            if (meta) {
                updateInstagramCardStats(news.id, meta);
                instagramStatsLastFetchMap.set(fetchKey, Date.now());
            }
        } catch (e) {
            console.log('[App] Erro ao buscar stats do Instagram:', e);
        }

        if (INSTAGRAM_STATS_REQUEST_GAP_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, INSTAGRAM_STATS_REQUEST_GAP_MS));
        }
    }
}

async function updateInstagramStats(newsItems, options = {}) {
    return queueInstagramStatsRefresh(newsItems, options);
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!Array.isArray(allInstagramNews) || allInstagramNews.length === 0) return;
    const renderedPosts = getRenderedInstagramNews();
    if (renderedPosts.length === 0) return;
    queueInstagramStatsRefresh(renderedPosts, {
        force: true,
        forceFresh: false,
        limit: INSTAGRAM_STATS_MAX_BACKGROUND_ITEMS
    });
});

// VariÃ¡vel para armazenar os dados dos posts do Instagram
let instagramPostsData = {};

function getInstagramPrimaryMedia(post = {}) {
    const allMedia = getInstagramAllMedia(post);
    if (allMedia.length > 0) {
        return allMedia[0];
    }

    const fallbackVideo = resolveInstagramVideoUrl(post);
    if (fallbackVideo) {
        return {
            type: 'video',
            url: fallbackVideo,
            poster: sanitizeMediaUrl(post.image)
        };
    }

    const fallbackImage = sanitizeMediaUrl(post.image);
    if (fallbackImage) {
        return {
            type: isLikelyVideoUrl(fallbackImage) ? 'video' : 'image',
            url: fallbackImage,
            poster: ''
        };
    }

    return { type: 'image', url: '', poster: '' };
}

function isLikelyVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const clean = url.trim().toLowerCase();
    if (!clean) return false;
    return /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i.test(clean) || /\/video\//i.test(clean);
}

function sanitizeMediaUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const clean = url.trim();
    if (!clean) return '';

    const lowered = clean.toLowerCase();
    const invalidValues = ['undefined', 'null', 'none', 'nan', 'false', '#', 'about:blank'];
    if (invalidValues.includes(lowered)) return '';

    return clean;
}

function isLikelyPosterImage(url) {
    const clean = sanitizeMediaUrl(url).toLowerCase();
    if (!clean) return false;
    if (clean.startsWith('data:image/')) return true;
    if (/thumbnail|thumb|poster|preview|frame/i.test(clean)) return true;
    if (/via\.placeholder\.com|placehold\.co/i.test(clean)) return true;
    if (/sem\+imagem|sem-imagem/i.test(clean)) return true;
    return false;
}

function extractVideoUrlFromGalleryItems(gallery = []) {
    if (!Array.isArray(gallery)) return '';

    for (const item of gallery) {
        if (!item) continue;

        if (typeof item === 'string') {
            const url = sanitizeMediaUrl(item);
            if (url && isLikelyVideoUrl(url)) return url;
            continue;
        }

        const url = sanitizeMediaUrl(
            item.videoUrl ||
            item.video ||
            item.playableUrl ||
            item.playable_url ||
            item.url ||
            item.mediaUrl ||
            item.src
        );
        if (!url) continue;

        const typeHints = [
            item.type,
            item.mediaType,
            item.kind,
            item.mimeType,
            item.mime,
            item.format
        ]
            .filter(value => typeof value === 'string' && value.trim())
            .join(' ')
            .toLowerCase();

        const explicitVideo = item.isVideo === true || typeHints.includes('video') || Boolean(sanitizeMediaUrl(item.videoUrl || item.video || item.playableUrl || item.playable_url));
        if (explicitVideo || isLikelyVideoUrl(url)) {
            return url;
        }
    }

    return '';
}

function resolveInstagramVideoUrl(post = {}) {
    const candidates = [
        post.instagramVideoUrl,
        post.videoUrl,
        post.video,
        post.instagramVideo,
        post.mediaUrl
    ];
    const ambiguousCandidates = [];

    for (const candidate of candidates) {
        const value = sanitizeMediaUrl(candidate);
        if (!value) continue;
        if (isLikelyVideoUrl(value)) return value;
        ambiguousCandidates.push(value);
    }

    const galleryVideo = extractVideoUrlFromGalleryItems(post.gallery);
    if (galleryVideo) return galleryVideo;

    if (ambiguousCandidates.length > 0) {
        return ambiguousCandidates[0];
    }

    const imageAsVideo = sanitizeMediaUrl(post.image);
    if (isLikelyVideoUrl(imageAsVideo)) return imageAsVideo;

    return '';
}

function normalizeInstagramMediaItem(item = {}, fallbackPoster = '') {
    if (typeof item === 'string') {
        const stringUrl = sanitizeMediaUrl(item);
        if (!stringUrl) return null;
        return {
            type: isLikelyVideoUrl(stringUrl) ? 'video' : 'image',
            url: stringUrl,
            poster: ''
        };
    }

    const url = sanitizeMediaUrl(
        item.url ||
        item.mediaUrl ||
        item.videoUrl ||
        item.playableUrl ||
        item.playable_url ||
        item.video ||
        item.image ||
        item.src
    );
    if (!url) return null;

    const declaredType = [
        item.type,
        item.mediaType,
        item.kind,
        item.mimeType,
        item.mime,
        item.format
    ]
        .find(value => typeof value === 'string' && value.trim());
    const declaredTypeNormalized = String(declaredType || '').toLowerCase();
    const explicitVideo =
        item.isVideo === true ||
        declaredTypeNormalized.includes('video') ||
        Boolean(sanitizeMediaUrl(item.videoUrl || item.video || item.playableUrl || item.playable_url));
    const isVideo = explicitVideo || isLikelyVideoUrl(url);
    const poster = isVideo
        ? (sanitizeMediaUrl(item.poster) || sanitizeMediaUrl(fallbackPoster))
        : '';

    return {
        type: isVideo ? 'video' : 'image',
        url,
        poster
    };
}

function getInstagramAllMedia(post = {}) {
    const media = [];
    const addMedia = (item) => {
        if (!item || !item.url) return;
        const existingByUrl = media.findIndex(existing => existing.url === item.url);
        if (existingByUrl >= 0) {
            if (media[existingByUrl].type === 'image' && item.type === 'video') {
                media[existingByUrl] = item;
            }
            return;
        }
        const exists = media.some(existing => existing.url === item.url && existing.type === item.type);
        if (exists) return;
        media.push(item);
    };

    const rawImageUrl = sanitizeMediaUrl(post.image);
    const imageUrl = rawImageUrl && !isLikelyVideoUrl(rawImageUrl) ? rawImageUrl : '';
    const mediaTypeHint = (post.instagramMediaType || post.mediaType || '').toString().toLowerCase();
    const mainVideoUrl = resolveInstagramVideoUrl(post);
    const galleryMedia = Array.isArray(post.gallery)
        ? post.gallery
            .map(item => normalizeInstagramMediaItem(item, imageUrl))
            .filter(Boolean)
        : [];
    const hasVideoInGallery = galleryMedia.some(item => item.type === 'video');
    const effectiveMediaTypeHint = mediaTypeHint || (hasVideoInGallery ? 'video' : '');
    const consumePosterFromGallery = (videoUrl = '', forceFromSingleImage = false) => {
        if (!galleryMedia.length) return '';

        // Remover videos duplicados da midia principal (nao contam como midia extra)
        if (videoUrl) {
            for (let i = galleryMedia.length - 1; i >= 0; i--) {
                const item = galleryMedia[i];
                if (item.type === 'video' && item.url === videoUrl) {
                    galleryMedia.splice(i, 1);
                }
            }
        }

        const imageIndexes = [];
        let extraVideoCount = 0;
        galleryMedia.forEach((item, index) => {
            if (item.type === 'image') imageIndexes.push(index);
            if (item.type === 'video' && item.url !== videoUrl) extraVideoCount += 1;
        });

        if (imageIndexes.length === 0) return '';

        const firstImageIndex = imageIndexes[0];
        const candidatePoster = galleryMedia[firstImageIndex]?.url || '';
        if (!candidatePoster) return '';

        const hasSingleImageOnly = imageIndexes.length === 1 && extraVideoCount === 0;
        const shouldConsume =
            isLikelyPosterImage(candidatePoster) ||
            (forceFromSingleImage && hasSingleImageOnly);

        if (!shouldConsume) return '';

        galleryMedia.splice(firstImageIndex, 1);
        return candidatePoster;
    };

    let primary = null;
    let primaryFromGallery = false;

    if (effectiveMediaTypeHint === 'video') {
        let chosenVideo = mainVideoUrl;

        if (!chosenVideo) {
            const galleryVideoIndex = galleryMedia.findIndex(item => item.type === 'video');
            if (galleryVideoIndex >= 0) {
                chosenVideo = galleryMedia[galleryVideoIndex].url;
                galleryMedia.splice(galleryVideoIndex, 1);
                primaryFromGallery = true;
            }
        }

        if (chosenVideo) {
            let poster = imageUrl;

            // Quando o post e apenas video e veio "imagem extra" como miniatura,
            // usar essa imagem como poster sem contar como segunda midia.
            if (!poster) {
                poster = consumePosterFromGallery(chosenVideo, primaryFromGallery || effectiveMediaTypeHint === 'video');
            }

            primary = {
                type: 'video',
                url: chosenVideo,
                poster: poster || ''
            };
        }
    }

    if (!primary) {
        if (mainVideoUrl && (effectiveMediaTypeHint === 'video' || !imageUrl || isLikelyVideoUrl(mainVideoUrl))) {
            primary = {
                type: 'video',
                url: mainVideoUrl,
                poster: imageUrl || ''
            };
        } else if (rawImageUrl) {
            primary = {
                type: isLikelyVideoUrl(rawImageUrl) ? 'video' : 'image',
                url: rawImageUrl,
                poster: ''
            };
        } else if (mainVideoUrl) {
            primary = {
                type: 'video',
                url: mainVideoUrl,
                poster: ''
            };
        } else if (galleryMedia.length > 0) {
            primary = galleryMedia.shift();
        }
    }

    if (
        primary &&
        primary.type === 'video' &&
        !primary.poster
    ) {
        primary.poster = consumePosterFromGallery(primary.url, effectiveMediaTypeHint === 'video') || '';
    }

    addMedia(primary);
    galleryMedia.forEach(addMedia);

    return media;
}

function primeInstagramCardVideoFrame(videoEl) {
    if (!videoEl) return;
    if (videoEl.dataset.previewPrimed === '1') return;
    if (videoEl.controls) return;

    const markPrimed = () => {
        videoEl.dataset.previewPrimed = '1';
        try {
            videoEl.pause();
        } catch (_error) { }
    };

    const applyPreviewFrame = () => {
        if (videoEl.dataset.previewPrimed === '1') return;
        const duration = Number(videoEl.duration) || 0;
        if (!Number.isFinite(duration) || duration <= 0) {
            markPrimed();
            return;
        }

        const target = Math.min(0.25, Math.max(0.02, duration / 8));
        const onSeeked = () => {
            videoEl.removeEventListener('seeked', onSeeked);
            markPrimed();
        };
        videoEl.addEventListener('seeked', onSeeked, { once: true });

        try {
            videoEl.currentTime = target;
        } catch (_error) {
            markPrimed();
        }
    };

    if (videoEl.readyState >= 1) {
        applyPreviewFrame();
    } else {
        videoEl.addEventListener('loadedmetadata', applyPreviewFrame, { once: true });
        videoEl.addEventListener('error', markPrimed, { once: true });
    }
}

function primeInstagramCardVideos(root = document) {
    if (!root) return;
    const videos = root.querySelectorAll('video[data-instagram-card-video="true"]');
    videos.forEach(videoEl => primeInstagramCardVideoFrame(videoEl));
}

function getInstagramVideoMediaForPlayer(post = {}, preferredIndex = null) {
    const media = getInstagramAllMedia(post);
    if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < media.length) {
        const preferred = media[preferredIndex];
        if (preferred && preferred.type === 'video' && preferred.url) {
            return preferred;
        }
    }

    const firstVideo = media.find(item => item && item.type === 'video' && item.url);
    if (firstVideo) return firstVideo;

    if (post.instagramVideoUrl) {
        return {
            type: 'video',
            url: post.instagramVideoUrl,
            poster: post.image || ''
        };
    }

    return null;
}

function openInstagramVideoPlayer(newsId, event = null, preferredIndex = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const post = instagramPostsData[newsId];
    if (!post) return;

    const media = getInstagramVideoMediaForPlayer(post, preferredIndex);
    if (!media || !media.url) return;

    const modal = document.getElementById('instagramVideoModal');
    const player = document.getElementById('instagramVideoPlayer');
    if (!modal || !player) return;

    player.pause();
    player.src = media.url;
    if (media.poster) {
        player.poster = media.poster;
    } else {
        player.removeAttribute('poster');
    }

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        const playPromise = player.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => { });
        }
    });
}

function handleInstagramCardVideoClick(newsId, event = null, preferredIndex = null, sourceElement = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const card = (sourceElement && typeof sourceElement.closest === 'function')
        ? sourceElement.closest('.instagram-card')
        : document.querySelector(`.instagram-card[data-instagram-id="${newsId}"]`);

    if (card && !card.classList.contains('expanded')) {
        openInstagramModal(newsId, card);
        return;
    }

    openInstagramVideoPlayer(newsId, null, preferredIndex);
}

function closeInstagramVideoModal() {
    const modal = document.getElementById('instagramVideoModal');
    const player = document.getElementById('instagramVideoPlayer');
    if (!modal || !player) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');

    try {
        player.pause();
    } catch (_error) { }
    player.removeAttribute('src');
    player.load();

    document.body.style.overflow = '';

    // Ao fechar o player, fechar tambÃ©m o post expandido.
    closeInstagramModal();
}

function isInstagramVideoModalOpen() {
    const modal = document.getElementById('instagramVideoModal');
    return Boolean(modal && modal.classList.contains('active'));
}

function getInstagramPostCaption(post = {}, newsId = '') {
    const directCandidates = [
        post.content,
        post.excerpt,
        post.rawContent,
        post.caption,
        post.description
    ];

    for (const candidate of directCandidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    if (newsId && Array.isArray(allInstagramNews)) {
        const originalPost = allInstagramNews.find(item => item && item.id === newsId);
        if (originalPost) {
            const originalCandidates = [
                originalPost.content,
                originalPost.excerpt,
                originalPost.caption,
                originalPost.description
            ];
            for (const candidate of originalCandidates) {
                if (typeof candidate === 'string' && candidate.trim()) {
                    return candidate.trim();
                }
            }
        }
    }

    return '';
}

function createInstagramCard(news) {
    const dateObj = new Date(news.date);
    const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const cachedPost = instagramPostsData[news.id] || {};

    // Prioriza valores atualizados em runtime para não voltar a zero apÃ³s re-render
    const likes = pickBestInstagramCount(
        cachedPost.likes,
        cachedPost.instagramLikes,
        news.instagramLikes,
        news.likes,
        0
    );
    const comments = pickBestInstagramCount(
        cachedPost.comments,
        cachedPost.instagramComments,
        news.instagramComments,
        news.comments,
        0
    );
    const instagramUrl = news.instagramUrl || news.sourceUrl || '#';
    const rawContent = news.content || news.excerpt || '';
    const content = cleanInstagramCaptionForDisplay(rawContent) || rawContent;
    const profileMeta = normalizeInstagramMeta({
        likes,
        comments,
        username: cachedPost.instagramUsername || news.instagramUsername,
        displayName: cachedPost.instagramDisplayName || news.instagramDisplayName,
        profileImage: cachedPost.instagramProfileImage || news.instagramProfileImage,
        description: rawContent,
        title: news.title || ''
    }, instagramUrl);
    const officialProfile = getInstagramOfficialProfile();
    const fallbackHandle = sanitizeInstagramHandle(
        news.instagramUsername ||
        profileMeta.username ||
        news.instagramDisplayName ||
        profileMeta.displayName ||
        ''
    );
    const profileHandle = officialProfile.username || fallbackHandle || DEFAULT_INSTAGRAM_PROFILE_SETTINGS.username;
    const profileName = officialProfile.displayName || news.instagramDisplayName || profileMeta.displayName || profileHandle;
    const profileImage = sanitizeInstagramProfileImage(
        officialProfile.profileImage ||
        news.instagramProfileImage ||
        profileMeta.profileImage ||
        ''
    );
    const hasAvatar = Boolean(profileImage);
    const displayTitle = buildInstagramTitlePreview(news.title, content);

    // Verificar se tem galeria e tipo da midia principal
    const allMedia = getInstagramAllMedia(news);
    const primaryMedia = allMedia[0] || { type: 'image', url: '', poster: '' };
    const hasGallery = allMedia.length > 1;
    const totalMedia = allMedia.length;

    // Guardar dados para uso no modal
    const existingPostData = instagramPostsData[news.id] || {};
    instagramPostsData[news.id] = {
        ...news,
        ...existingPostData,
        likes: profileMeta.likes,
        comments: profileMeta.comments,
        instagramUrl,
        content,
        rawContent,
        dateStr,
        timeStr,
        hasGallery,
        totalMedia,
        instagramMediaType: primaryMedia.type,
        instagramVideoUrl: primaryMedia.type === 'video' ? primaryMedia.url : '',
        instagramUsername: profileHandle,
        instagramDisplayName: profileName,
        instagramProfileImage: profileImage || '',
        instagramCollaborators: [],
        instagramHasCollaborator: false,
        title: displayTitle
    };

    return `
        <article class="instagram-card" data-instagram-id="${news.id}" onclick="openInstagramModal('${news.id}', this)">
            <!-- Imagem de Capa -->
            <div class="instagram-card-image-wrapper ${primaryMedia.type === 'video' ? 'is-video' : ''}">
                ${primaryMedia.type === 'video'
            ? `<video src="${primaryMedia.url}" poster="${primaryMedia.poster || ''}" muted playsinline preload="metadata" data-instagram-card-video="true" onloadedmetadata="primeInstagramCardVideoFrame(this)" oncanplay="primeInstagramCardVideoFrame(this)" onclick="handleInstagramCardVideoClick('${news.id}', event, null, this)"></video>
                       <button type="button" class="instagram-video-play-overlay" onclick="handleInstagramCardVideoClick('${news.id}', event, null, this)" aria-label="Reproduzir video">
                           <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                       </button>`
            : `<img src="${primaryMedia.url}" alt="${news.title}" loading="lazy">`
        }
                ${hasGallery ? `
                    <div class="instagram-gallery-indicator">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        <span>${totalMedia}</span>
                    </div>
                ` : ''}
            </div>
            
            <!-- ConteÃºdo Compacto -->
            <div class="instagram-card-content">
                <!-- Header com avatar -->
                <div class="instagram-card-header">
                    <div class="instagram-card-avatar ${hasAvatar ? '' : 'is-empty'}" data-id="${news.id}">
                        ${hasAvatar ? `<img class="instagram-profile-img" data-id="${news.id}" src="${profileImage}" alt="${profileName}" onerror="this.onerror=null;const wrapper=this.closest('.instagram-card-avatar');if(wrapper){wrapper.classList.add('is-empty');}this.remove();">` : ''}
                    </div>
                    <div class="instagram-card-user">
                        <span class="instagram-card-username" data-id="${news.id}">${profileName}</span>
                        <svg class="instagram-card-verified" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                    </div>
                    <!-- BotÃ£o fechar (sÃ³ aparece quando expandido) -->
                    <button class="instagram-card-close" style="display: none;" onclick="event.stopPropagation(); closeInstagramModal();">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                
                <!-- TÃ­tulo do post -->
                <div class="instagram-card-title-preview" style="font-size: 0.8125rem; color: #262626; line-height: 1.4; margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${displayTitle}
                </div>

                <div class="instagram-card-caption-mobile">
                    ${escapeHtml(content || displayTitle || '')}
                </div>
                
                <!-- Legenda completa (sÃ³ aparece quando expandido) -->
                <div class="instagram-card-caption-full"></div>
                
                <!-- AÃ§Ãµes com contadores -->
                <div class="instagram-card-actions">
                    <div class="instagram-card-actions-left">
                        <button class="instagram-card-action-btn" onclick="event.stopPropagation(); window.open('${instagramUrl}', '_blank')">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                            </svg>
                            <span class="instagram-likes-count" data-id="${news.id}">${formatNumber(profileMeta.likes)}</span>
                        </button>
                        <button class="instagram-card-action-btn" onclick="event.stopPropagation(); window.open('${instagramUrl}', '_blank')">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                            </svg>
                            <span class="instagram-comments-count" data-id="${news.id}">${formatNumber(profileMeta.comments)}</span>
                        </button>
                    </div>
                    <button class="instagram-card-action-btn" onclick="event.stopPropagation(); window.open('${instagramUrl}', '_blank')">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                    </button>
                    <button class="instagram-card-action-btn share-btn" onclick="shareNews('${news.id}', event)">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                        </svg>
                    </button>
                </div>
                
                <!-- Data -->
                <div class="instagram-card-time">${dateStr} &agrave;s ${timeStr}</div>
            </div>
        </article>
    `;
}

// Expandir card no grid
let expandedCardId = null;

function openInstagramModal(newsId, cardElement = null) {
    const post = instagramPostsData[newsId];
    if (!post) return;

    // Cada abertura do post conta como uma visualizacao
    void trackNewsView(newsId);

    // Se jÃ¡ tem um card expandido, fechar ele primeiro
    if (expandedCardId && expandedCardId !== newsId) {
        const currentExpanded = document.querySelector('.instagram-card.expanded');
        if (currentExpanded) {
            closeInstagramCard(currentExpanded);
        }
    }

    // Encontrar o card clicado
    const card = (cardElement && cardElement.classList && cardElement.classList.contains('instagram-card'))
        ? cardElement
        : document.querySelector(`.instagram-card[data-instagram-id="${newsId}"]`);
    if (!card) return;
    if (card.classList.contains('expanded')) return;

    // Em desktop, escondemos o último card para preservar a grade quando o card expande.
    if (!isMobileViewport()) {
        hideLastCard(newsId, card);
    }

    // DEPOIS: Expandir o card (agora tem espaÃ§o para ocupar 2 colunas)
    card.classList.add('expanded');
    expandedCardId = newsId;
    const mobileCarousel = card.closest('.instagram-news-grid');
    if (mobileCarousel) {
        updateInstagramSwipeHintState(mobileCarousel);
    }

    // Adicionar botÃ£o fechar se não existir
    let closeBtn = card.querySelector('.instagram-card-close');
    if (!closeBtn) {
        closeBtn = document.createElement('button');
        closeBtn.className = 'instagram-card-close';
        closeBtn.innerHTML = `
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        `;
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeInstagramCard(card);
        };
        const header = card.querySelector('.instagram-card-header');
        if (header) header.appendChild(closeBtn);
    }
    closeBtn.style.display = 'flex';

    // Esconder preview e mostrar conteúdo completo
    const titlePreview = card.querySelector('.instagram-card-title-preview');
    if (titlePreview) titlePreview.style.display = 'none';

    const time = card.querySelector('.instagram-card-time');
    if (time) time.style.display = 'none';

    // Adicionar legenda completa se não existir
    let captionFull = card.querySelector('.instagram-card-caption-full');
    if (!captionFull) {
        captionFull = document.createElement('div');
        captionFull.className = 'instagram-card-caption-full';
        const content = card.querySelector('.instagram-card-content');
        if (content) {
            const actions = card.querySelector('.instagram-card-actions');
            if (actions) {
                content.insertBefore(captionFull, actions);
            } else {
                content.appendChild(captionFull);
            }
        }
    }
    const captionText = getInstagramPostCaption(post, newsId);
    captionFull.textContent = captionText || 'Sem legenda disponivel.';
    captionFull.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; height: auto !important; overflow-y: auto !important; margin-bottom: 0.75rem !important; padding: 0 !important;';

    // Atualizar contadores de curtidas e comentÃ¡rios
    const likesEl = card.querySelector('.instagram-likes-count');
    const commentsEl = card.querySelector('.instagram-comments-count');
    if (likesEl) likesEl.textContent = formatNumber(post.likes || 0);
    if (commentsEl) commentsEl.textContent = formatNumber(post.comments || 0);

    // ATUALIZAR todos os links do Instagram com a URL correta
    const actionButtons = card.querySelectorAll('.instagram-card-action-btn');
    actionButtons.forEach(btn => {
        // Atualizar o onclick para abrir o link correto
        const newBtn = btn.cloneNode(true);
        newBtn.onclick = (e) => {
            e.stopPropagation();
            window.open(post.instagramUrl, '_blank');
        };
        btn.parentNode.replaceChild(newBtn, btn);
    });

    // CONFIGURAR GALERIA se houver mÃºltiplas mÃ­dias
    setupInstagramGallery(card, post);

    // Scroll suave para o card
    setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

// Configurar galeria de imagens/vÃ­deos no card expandido
function setupInstagramGallery(card, post) {
    const imageWrapper = card.querySelector('.instagram-card-image-wrapper');
    if (!imageWrapper) return;

    // Montar array de todas as mÃ­dias vÃ¡lidas (capa + galeria)
    const allMedia = getInstagramAllMedia(post);

    // Se sÃ³ tem uma mÃ­dia, não precisa de navegação
    if (allMedia.length <= 1) {
        // Remover controles de galeria se existirem
        const existingControls = imageWrapper.querySelector('.instagram-gallery-controls');
        if (existingControls) existingControls.remove();
        const existingDots = imageWrapper.querySelector('.instagram-gallery-dots');
        if (existingDots) existingDots.remove();
        const galleryContainer = imageWrapper.querySelector('.instagram-gallery-container');
        if (galleryContainer) galleryContainer.remove();

        const primary = getInstagramPrimaryMedia(post);
        const newsId = card.dataset.instagramId || '';

        imageWrapper.classList.toggle('is-video', primary.type === 'video');
        imageWrapper.innerHTML = primary.type === 'video'
            ? `<video src="${primary.url}" poster="${primary.poster || ''}" muted playsinline preload="metadata" data-instagram-card-video="true" onclick="handleInstagramCardVideoClick('${newsId}', event, null, this)"></video>
               <button type="button" class="instagram-video-play-overlay" onclick="handleInstagramCardVideoClick('${newsId}', event, null, this)" aria-label="Reproduzir video">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
               </button>`
            : `<img src="${primary.url}" alt="${post.title || 'Post do Instagram'}" loading="lazy">`;
        if (primary.type === 'video') {
            const previewVideo = imageWrapper.querySelector('video[data-instagram-card-video="true"]');
            primeInstagramCardVideoFrame(previewVideo);
        }
        return;
    }

    // Guardar dados da galeria no card
    card.dataset.galleryIndex = '0';
    card.dataset.galleryTotal = allMedia.length;

    // Criar container da galeria se não existir
    let galleryContainer = imageWrapper.querySelector('.instagram-gallery-container');
    if (!galleryContainer) {
        galleryContainer = document.createElement('div');
        galleryContainer.className = 'instagram-gallery-container';
        galleryContainer.style.cssText = 'width: 100%; height: 100%; position: relative; overflow: hidden;';

        // Mover a midia atual para dentro do container
        const img = imageWrapper.querySelector('img');
        if (img) {
            img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; background: #f0f0f0;';
            galleryContainer.appendChild(img);
        }
        const existingVideo = imageWrapper.querySelector('video');
        if (existingVideo) {
            existingVideo.style.cssText = 'width: 100%; height: 100%; object-fit: contain; background: #f0f0f0;';
            galleryContainer.appendChild(existingVideo);
        }

        imageWrapper.appendChild(galleryContainer);
    }

    // Criar controles de navegação
    let controls = imageWrapper.querySelector('.instagram-gallery-controls');
    if (!controls) {
        controls = document.createElement('div');
        controls.className = 'instagram-gallery-controls';
        controls.innerHTML = `
            <button class="instagram-gallery-prev" onclick="event.stopPropagation(); navigateGallery(this.closest('.instagram-card'), -1)">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
            </button>
            <button class="instagram-gallery-next" onclick="event.stopPropagation(); navigateGallery(this.closest('.instagram-card'), 1)">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
            </button>
        `;
        imageWrapper.appendChild(controls);
    }

    // Criar indicadores (dots)
    let dots = imageWrapper.querySelector('.instagram-gallery-dots');
    if (!dots) {
        dots = document.createElement('div');
        dots.className = 'instagram-gallery-dots';
        dots.innerHTML = allMedia.map((_, i) => `
            <span class="instagram-gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>
        `).join('');
        imageWrapper.appendChild(dots);
    }

    // Mostrar primeira mÃ­dia
    showGalleryMedia(card, allMedia, 0);
}

// Navegar na galeria
function navigateGallery(cardOrNewsId, direction) {
    const card = (cardOrNewsId && typeof cardOrNewsId === 'object' && cardOrNewsId.nodeType === 1)
        ? cardOrNewsId
        : document.querySelector(`.instagram-card[data-instagram-id="${cardOrNewsId}"]`);
    if (!card) return;

    const newsId = card.dataset.instagramId;
    if (!newsId) return;

    const post = instagramPostsData[newsId];
    if (!post) return;

    // Montar array de mÃ­dias
    const allMedia = getInstagramAllMedia(post);

    const total = allMedia.length;
    if (total === 0) return;
    let currentIndex = parseInt(card.dataset.galleryIndex || '0');

    // Calcular novo Ã­ndice
    currentIndex += direction;
    if (currentIndex < 0) currentIndex = total - 1;
    if (currentIndex >= total) currentIndex = 0;

    card.dataset.galleryIndex = currentIndex;
    showGalleryMedia(card, allMedia, currentIndex);
}

// Mostrar mÃ­dia especÃ­fica da galeria
function showGalleryMedia(card, allMedia, index) {
    const galleryContainer = card.querySelector('.instagram-gallery-container');
    if (!galleryContainer) return;

    const media = allMedia[index];
    if (!media) return;
    const newsId = card.dataset.instagramId || '';
    const imageWrapper = card.querySelector('.instagram-card-image-wrapper');
    if (imageWrapper) {
        imageWrapper.classList.toggle('is-video', media.type === 'video');
    }

    // Limpar container
    galleryContainer.innerHTML = '';

    // Criar elemento de mÃ­dia
    if (media.type === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        if (media.poster) video.poster = media.poster;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.dataset.instagramCardVideo = 'true';
        video.style.cssText = 'width: 100%; height: 100%; object-fit: contain; background: #f0f0f0;';
        video.addEventListener('click', (event) => handleInstagramCardVideoClick(newsId, event, index, video));
        galleryContainer.appendChild(video);
        primeInstagramCardVideoFrame(video);

        const playOverlay = document.createElement('button');
        playOverlay.type = 'button';
        playOverlay.className = 'instagram-video-play-overlay';
        playOverlay.setAttribute('aria-label', 'Reproduzir video');
        playOverlay.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
        playOverlay.onclick = (event) => handleInstagramCardVideoClick(newsId, event, index, playOverlay);
        galleryContainer.appendChild(playOverlay);
    } else {
        const img = document.createElement('img');
        img.src = media.url;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; background: #f0f0f0;';
        galleryContainer.appendChild(img);
    }

    // Atualizar dots
    const dots = card.querySelectorAll('.instagram-gallery-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function closeInstagramCard(card) {
    if (!card) return;

    card.classList.remove('expanded');
    expandedCardId = null;

    // PRIMEIRO: Esconder botÃ£o fechar e elementos do expandido
    const closeBtn = card.querySelector('.instagram-card-close');
    if (closeBtn) closeBtn.style.display = 'none';

    // GARANTIR que legenda completa estÃ¡ totalmente escondida - ANTES de mostrar o card escondido
    const captionFull = card.querySelector('.instagram-card-caption-full');
    if (captionFull) {
        captionFull.removeAttribute('style');
        captionFull.style.display = 'none';
    }

    // RESTAURAR imagem de capa e remover controles da galeria
    const imageWrapper = card.querySelector('.instagram-card-image-wrapper');
    if (imageWrapper) {
        // Remover controles da galeria
        const controls = imageWrapper.querySelector('.instagram-gallery-controls');
        if (controls) controls.remove();
        const dots = imageWrapper.querySelector('.instagram-gallery-dots');
        if (dots) dots.remove();
        const galleryContainer = imageWrapper.querySelector('.instagram-gallery-container');
        if (galleryContainer) galleryContainer.remove();

        // Restaurar imagem de capa
        const newsId = card.dataset.instagramId;
        const post = instagramPostsData[newsId];
        if (post) {
            // Limpar wrapper
            imageWrapper.innerHTML = '';
            const primary = getInstagramPrimaryMedia(post);
            imageWrapper.classList.toggle('is-video', primary.type === 'video');
            if (primary.type === 'video') {
                const video = document.createElement('video');
                video.src = primary.url;
                video.poster = primary.poster || '';
                video.muted = true;
                video.playsInline = true;
                video.preload = 'metadata';
                video.dataset.instagramCardVideo = 'true';
                video.addEventListener('click', (event) => handleInstagramCardVideoClick(newsId, event, null, video));
                video.addEventListener('loadedmetadata', () => primeInstagramCardVideoFrame(video), { once: true });
                imageWrapper.appendChild(video);
                primeInstagramCardVideoFrame(video);

                const playOverlay = document.createElement('button');
                playOverlay.type = 'button';
                playOverlay.className = 'instagram-video-play-overlay';
                playOverlay.setAttribute('aria-label', 'Reproduzir video');
                playOverlay.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
                playOverlay.onclick = (event) => handleInstagramCardVideoClick(newsId, event, null, playOverlay);
                imageWrapper.appendChild(playOverlay);
            } else {
                const img = document.createElement('img');
                img.src = primary.url;
                img.alt = post.title || 'Post do Instagram';
                img.loading = 'lazy';
                imageWrapper.appendChild(img);
            }
            // Recriar indicador de galeria se houver
            if (post.hasGallery && post.totalMedia > 1) {
                const indicator = document.createElement('div');
                indicator.className = 'instagram-gallery-indicator';
                indicator.innerHTML = `
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <span>${post.totalMedia}</span>
                `;
                imageWrapper.appendChild(indicator);
            }
        }
    }

    // Mostrar preview novamente - FORÃ‡AR com line-clamp
    const titlePreview = card.querySelector('.instagram-card-title-preview');
    if (titlePreview) {
        titlePreview.style.display = '-webkit-box';
        titlePreview.style.webkitLineClamp = '2';
        titlePreview.style.webkitBoxOrient = 'vertical';
        titlePreview.style.overflow = 'hidden';
    }

    const time = card.querySelector('.instagram-card-time');
    if (time) time.style.display = '';

    // DEPOIS: Mostrar o card que estava escondido (evita reflow que mostra a legenda)
    showLastCard(card);

    const mobileCarousel = card.closest('.instagram-news-grid');
    if (mobileCarousel) {
        updateInstagramSwipeHintState(mobileCarousel);
    }
}

function hideLastCard(newsIdToKeep, expandedCard = null) {
    // Sempre esconder o último card visÃ­vel para manter tudo na mesma fileira
    // (exceto o card que estÃ¡ sendo expandido)
    const scope = (expandedCard && typeof expandedCard.closest === 'function')
        ? expandedCard.closest('.instagram-news-grid')
        : null;
    const allCards = (scope || document).querySelectorAll('.instagram-card');

    // Encontrar o último card que não Ã© o que serÃ¡ expandido
    for (let i = allCards.length - 1; i >= 0; i--) {
        const card = allCards[i];
        const cardId = card.dataset.instagramId;

        // NÃ£o esconder o card que estÃ¡ sendo expandido
        if (cardId === newsIdToKeep) continue;

        // Esconder este card
        card.style.display = 'none';
        card.dataset.wasHidden = 'true';
        break; // Esconde apenas um
    }
}

function showLastCard(referenceCard = null) {
    const scope = (referenceCard && typeof referenceCard.closest === 'function')
        ? referenceCard.closest('.instagram-news-grid')
        : null;

    // Mostrar o card que foi escondido
    const hiddenCard = (scope || document).querySelector('.instagram-card[data-was-hidden="true"]');
    if (hiddenCard) {
        hiddenCard.style.display = '';
        hiddenCard.dataset.wasHidden = '';
    }
}

function closeInstagramModal() {
    if (expandedCardId) {
        const card = document.querySelector('.instagram-card.expanded');
        if (card) {
            closeInstagramCard(card);
        }
        expandedCardId = null;
    }
}

// FunÃ§Ã£o para compartilhar notícia
async function shareNews(newsId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    // Buscar dados da notícia
    let news = instagramPostsData[newsId];

    // Se não encontrar nos posts do Instagram, buscar no array de notícias
    if (!news && window.allNews) {
        news = window.allNews.find(n => n.id === newsId);
    }

    if (!news) {
        console.error('Noticia nao encontrada:', newsId);
        return;
    }

    const shareUrl = `${window.location.origin}/?news=${newsId}`;
    const shareData = {
        title: news.title || 'Mirador e Regiao Online',
        text: news.excerpt || news.content?.substring(0, 100) || 'Confira esta noticia',
        url: shareUrl
    };

    try {
        // Tentar usar a API de compartilhamento nativa (mobile)
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback: copiar para clipboard
            await navigator.clipboard.writeText(`${shareData.title}\n${shareData.url}`);
            showToast('Link copiado para a area de transferencia!');
        }
    } catch (error) {
        // UsuÃ¡rio cancelou ou erro
        if (error.name !== 'AbortError') {
            console.error('Erro ao compartilhar:', error);
            // Tentar copiar como fallback
            try {
                await navigator.clipboard.writeText(shareUrl);
                showToast('Link copiado para a area de transferencia!');
            } catch (clipboardError) {
                console.error('Erro ao copiar:', clipboardError);
            }
        }
    }
}

// FunÃ§Ã£o para mostrar toast
function showToast(message) {
    // Remover toast anterior se existir
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        animation: slideUp 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;

    // Adicionar animaÃ§Ã£o
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateX(-50%) translateY(100px); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes slideDown {
            from { transform: translateX(-50%) translateY(0); opacity: 1; }
            to { transform: translateX(-50%) translateY(100px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    // Remover apÃ³s 3 segundos
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Fechar com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (isInstagramVideoModalOpen()) {
            closeInstagramVideoModal();
            return;
        }
        closeInstagramModal();
    }
});

// Formatar nÃºmeros (1.2K, 1.5M)
function formatNumber(num) {
    if (!num || num === 0) return '0';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Atualizar estatÃ­sticas no card
function updateInstagramCardStats(newsId, stats) {
    const likesEls = document.querySelectorAll(`.instagram-likes-count[data-id="${newsId}"]`);
    const commentsEls = document.querySelectorAll(`.instagram-comments-count[data-id="${newsId}"]`);
    const usernameEls = document.querySelectorAll(`.instagram-card-username[data-id="${newsId}"]`);
    const avatarWrapperEls = document.querySelectorAll(`.instagram-card-avatar[data-id="${newsId}"]`);

    const current = instagramPostsData[newsId] || {};
    const currentLikes = pickBestInstagramCount(current.likes, current.instagramLikes, current.rawLikes, 0);
    const currentComments = pickBestInstagramCount(current.comments, current.instagramComments, current.rawComments, 0);
    const incomingLikes = stats && stats.likes != null ? parseInstagramCount(stats.likes) : 0;
    const incomingComments = stats && stats.comments != null ? parseInstagramCount(stats.comments) : 0;
    const likesSource = String(stats?.likesSource || stats?.source || '').toLowerCase();
    const commentsSource = String(stats?.commentsSource || stats?.source || '').toLowerCase();
    const canTrustIncomingLikes = likesSource === 'instagram' || likesSource === 'embed';
    const canTrustIncomingComments = commentsSource === 'instagram' || commentsSource === 'embed';
    const finalLikesValue = incomingLikes > 0
        ? (canTrustIncomingLikes ? incomingLikes : Math.max(currentLikes, incomingLikes))
        : currentLikes;
    const finalCommentsValue = incomingComments > 0
        ? (canTrustIncomingComments ? incomingComments : Math.max(currentComments, incomingComments))
        : currentComments;

    likesEls.forEach((el) => {
        el.textContent = formatNumber(finalLikesValue);
    });
    commentsEls.forEach((el) => {
        el.textContent = formatNumber(finalCommentsValue);
    });

    const officialProfile = getInstagramOfficialProfile();
    const safeCurrentUsername = sanitizeInstagramHandle(current.instagramUsername || '');
    const finalName = officialProfile.displayName || current.instagramDisplayName || safeCurrentUsername || DEFAULT_INSTAGRAM_PROFILE_SETTINGS.displayName;
    const finalUsername = officialProfile.username || safeCurrentUsername || DEFAULT_INSTAGRAM_PROFILE_SETTINGS.username;
    const finalProfileImage = sanitizeInstagramProfileImage(
        officialProfile.profileImage ||
        current.instagramProfileImage ||
        stats?.profileImage ||
        ''
    );

    usernameEls.forEach((el) => {
        el.textContent = finalName;
    });

    avatarWrapperEls.forEach((avatarWrapperEl) => {
        const existingImg = avatarWrapperEl.querySelector('.instagram-profile-img');
        if (finalProfileImage) {
            avatarWrapperEl.classList.remove('is-empty');
            let imgEl = existingImg;
            if (!imgEl) {
                imgEl = document.createElement('img');
                imgEl.className = 'instagram-profile-img';
                imgEl.setAttribute('data-id', newsId);
                avatarWrapperEl.appendChild(imgEl);
            }
            imgEl.alt = finalName;
            imgEl.src = finalProfileImage;
            imgEl.onerror = () => {
                imgEl.onerror = null;
                imgEl.remove();
                avatarWrapperEl.classList.add('is-empty');
            };
        } else {
            avatarWrapperEl.classList.add('is-empty');
            if (existingImg) {
                existingImg.remove();
            }
        }
    });

    if (instagramPostsData[newsId]) {
        instagramPostsData[newsId] = {
            ...instagramPostsData[newsId],
            likes: finalLikesValue,
            comments: finalCommentsValue,
            instagramLikes: finalLikesValue,
            instagramComments: finalCommentsValue,
            instagramUsername: finalUsername,
            instagramDisplayName: finalName,
            instagramProfileImage: finalProfileImage || '',
            instagramCollaborators: [],
            instagramHasCollaborator: false
        };
    }

    if (Array.isArray(allInstagramNews)) {
        const index = allInstagramNews.findIndex(item => item && item.id === newsId);
        if (index >= 0) {
            allInstagramNews[index] = {
                ...allInstagramNews[index],
                likes: finalLikesValue,
                comments: finalCommentsValue,
                instagramLikes: finalLikesValue,
                instagramComments: finalCommentsValue,
                instagramUsername: finalUsername,
                instagramDisplayName: finalName,
                instagramProfileImage: finalProfileImage || allInstagramNews[index].instagramProfileImage || ''
            };
        }
    }

    // Persistir engagement no Firestore para não perder ao recarregar a pÃ¡gina
    if ((finalLikesValue > 0 || finalCommentsValue > 0) && typeof db !== 'undefined') {
        try {
            const updatePayload = {};
            if (finalLikesValue > 0) updatePayload.instagramLikes = finalLikesValue;
            if (finalCommentsValue > 0) updatePayload.instagramComments = finalCommentsValue;
            if (Object.keys(updatePayload).length > 0) {
                db.collection('news').doc(newsId).update(updatePayload).catch((err) => {
                    console.log('[App] NÃ£o foi possÃ­vel persistir engagement no Firestore:', err.message || err);
                });
            }
        } catch (_e) { }
    }
}

console.log('[App] v2.5 - Script finalizado');


