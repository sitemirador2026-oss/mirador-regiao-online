/**
 * Backend para Upload Cloudflare R2
 * Recebe imagens do frontend e envia para R2
 */

const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const cors = require('cors');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do R2 (do ambiente ou direto)
const R2_CONFIG = {
    accountId: process.env.R2_ACCOUNT_ID || '8341826f08014d0252c400798d657729',
    bucketName: process.env.R2_BUCKET_NAME || 'mirador-regiao-online',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '82b8cac3269b84905aff1d560f9bc958',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '2aa8ee9d9bf6da4b5d7796cce1853e8bc45274ade8d88d3a70c6fd9f6989232bd',
    publicUrl: 'https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev'
};

// Configurar S3 Client para R2
const s3Client = new S3Client({
    region: 'us-east-1',
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_CONFIG.accessKeyId,
        secretAccessKey: R2_CONFIG.secretAccessKey
    }
});

// Middleware
app.use(cors({
    origin: '*', // Permitir todas as origens (ou especificar seu domínio)
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const INSTAGRAM_FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};

const INSTAGRAM_PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const instagramProfileCache = new Map();

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

function extractInstagramEngagementFromHtml(html = '') {
    if (!html) return { likes: 0, comments: 0 };

    const likes = extractFirstIntegerByPatterns(html, [
        /"edge_media_preview_like"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
        /"edge_liked_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
        /"like_count"\s*:\s*(\d+)/i
    ]);

    const comments = extractFirstIntegerByPatterns(html, [
        /"edge_media_to_comment"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
        /"edge_media_preview_comment"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
        /"comment_count"\s*:\s*(\d+)/i
    ]);

    return { likes, comments };
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
            const response = await fetch(url, { headers: INSTAGRAM_FETCH_HEADERS });
            if (response.ok) {
                return await response.text();
            }
            lastError = new Error(`HTTP ${response.status}`);
            if (response.status === 429 && attempt < attempts) {
                await delay(350 * attempt);
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
    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }

    const profileUrl = `https://www.instagram.com/${encodeURIComponent(cleanUsername)}/`;
    const html = await fetchTextWithRetry(profileUrl);
    const ogImage = extractMetaTagContent(html, 'og:image', 'property');
    const imageUrl = decodeEscapedUrl(ogImage);

    if (imageUrl) {
        instagramProfileCache.set(cleanUsername, {
            url: imageUrl,
            expiresAt: Date.now() + INSTAGRAM_PROFILE_CACHE_TTL_MS
        });
    }

    return imageUrl;
}

async function scrapeInstagramMeta(instagramUrl = '') {
    const cleanUrl = String(instagramUrl || '').trim();
    if (!cleanUrl) {
        throw new Error('URL do Instagram ausente');
    }

    const parsedUrl = new URL(cleanUrl);
    if (!parsedUrl.hostname.includes('instagram.com')) {
        throw new Error('URL inválida: use um link do Instagram');
    }

    const html = await fetchTextWithRetry(cleanUrl);
    const ogTitle = extractMetaTagContent(html, 'og:title', 'property');
    const ogDescription = extractMetaTagContent(html, 'og:description', 'property') || extractMetaTagContent(html, 'description', 'name');
    const ogImage = decodeEscapedUrl(extractMetaTagContent(html, 'og:image', 'property'));

    let username = extractInstagramUsernameFromText(ogDescription) || extractInstagramUsernameFromText(ogTitle) || extractInstagramUsernameFromUrl(cleanUrl);

    const likesMatch = (ogDescription || '').match(/([\d.,kmb]+)\s+(?:likes?|curtidas?)/i);
    const commentsMatch = (ogDescription || '').match(/([\d.,kmb]+)\s+(?:comments?|coment[aá]rios?)/i);
    const likesFromDescription = likesMatch ? parseCompactNumber(likesMatch[1]) : 0;
    const commentsFromDescription = commentsMatch ? parseCompactNumber(commentsMatch[1]) : 0;
    const engagementFromHtml = extractInstagramEngagementFromHtml(html);
    const likes = likesFromDescription > 0 ? likesFromDescription : engagementFromHtml.likes;
    const comments = commentsFromDescription > 0 ? commentsFromDescription : engagementFromHtml.comments;

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
        collaborators,
        hasAdditionalCollaborator,
        sourceUrl: cleanUrl
    };
}

// Configurar upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido'), false);
        }
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', service: 'R2 Upload Server' });
});

app.get('/api/instagram/meta', async (req, res) => {
    try {
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0'
        });
        const url = String(req.query.url || '').trim();
        if (!url) {
            return res.status(400).json({ success: false, error: 'Parâmetro url é obrigatório' });
        }

        const data = await scrapeInstagramMeta(url);
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('Erro ao extrair meta do Instagram:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload de arquivo
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const folder = req.body.folder || 'noticias';
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = req.file.originalname.split('.').pop();
        const key = `${folder}/${timestamp}-${random}.${extension}`;

        // Upload para R2
        const command = new PutObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read'
        });

        await s3Client.send(command);

        const publicUrl = `${R2_CONFIG.publicUrl}/${key}`;

        res.json({
            success: true,
            url: publicUrl,
            key: key,
            size: req.file.size,
            type: req.file.mimetype
        });

    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ error: error.message });
    }
});

// Listar arquivos
app.get('/api/files', async (req, res) => {
    try {
        const prefix = req.query.prefix || '';
        
        const command = new ListObjectsV2Command({
            Bucket: R2_CONFIG.bucketName,
            Prefix: prefix,
            MaxKeys: 1000
        });

        const result = await s3Client.send(command);
        
        const files = (result.Contents || []).map(obj => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
            url: `${R2_CONFIG.publicUrl}/${obj.Key}`
        }));

        res.json({
            success: true,
            files: files,
            totalSize: files.reduce((sum, f) => sum + f.size, 0)
        });

    } catch (error) {
        console.error('Erro ao listar:', error);
        res.status(500).json({ error: error.message });
    }
});

// Deletar arquivo
app.delete('/api/files/:key', async (req, res) => {
    try {
        const key = decodeURIComponent(req.params.key);
        
        const command = new DeleteObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: key
        });

        await s3Client.send(command);

        res.json({ success: true, message: 'Arquivo deletado' });

    } catch (error) {
        console.error('Erro ao deletar:', error);
        res.status(500).json({ error: error.message });
    }
});

// Servir arquivos estáticos do admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📁 Bucket: ${R2_CONFIG.bucketName}`);
});
