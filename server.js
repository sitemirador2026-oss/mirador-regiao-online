/**
 * Backend para Upload Cloudflare R2
 * Recebe imagens do frontend e envia para R2
 */

const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');
const fsp = fs.promises;

let ffmpegBinaryPath = '';
try {
    ffmpegBinaryPath = process.env.FFMPEG_PATH || require('ffmpeg-static') || '';
} catch (_error) {
    ffmpegBinaryPath = process.env.FFMPEG_PATH || '';
}

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
const ARTICLE_FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache'
};

const INSTAGRAM_PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const instagramProfileCache = new Map();
const INSTAGRAM_META_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min
const instagramMetaCache = new Map();
const INSTAGRAM_OEMBED_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const instagramOembedCache = new Map();
const MAX_UPLOAD_FILE_BYTES = 120 * 1024 * 1024;
const MAX_IOS_TRANSCODE_INPUT_BYTES = 180 * 1024 * 1024;
const IOS_TRANSCODE_TIMEOUT_MS = 3 * 60 * 1000;
const ARTICLE_LIKES_PREFIX = 'metrics/article-likes';
const INSTAGRAM_FOLDER_PATTERN = /^instagram(?:\/|$)/i;
const ALLOWED_INSTAGRAM_VIDEO_MIME_TYPES = new Set([
    'video/mp4',
    'video/quicktime',
    'video/x-m4v'
]);
const articleLikesLocks = new Map();
const LOCAL_LIKES_DIR = path.join(__dirname, '.metrics');
const LOCAL_LIKES_FILE = path.join(LOCAL_LIKES_DIR, 'article-likes.json');
const R2_PUBLIC_HOST = (() => {
    try {
        return String(new URL(R2_CONFIG.publicUrl).hostname || '').toLowerCase();
    } catch (_error) {
        return '';
    }
})();

function clampToSafeInt(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
}

function sanitizeNewsId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    return sanitized;
}

function sanitizeUploadFolder(value, fallback = 'noticias') {
    const raw = String(value || '').trim();
    const normalized = raw
        .replace(/\\/g, '/')
        .replace(/[^a-zA-Z0-9/_-]/g, '')
        .replace(/\/{2,}/g, '/')
        .replace(/^\/+|\/+$/g, '');
    return normalized || fallback;
}

function getFileExtension(fileName = '') {
    const raw = String(fileName || '').trim().toLowerCase();
    if (!raw) return '';
    const dotIndex = raw.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === raw.length - 1) return '';
    return raw.slice(dotIndex + 1).replace(/[^a-z0-9]/g, '');
}

function normalizeUploadedContentType(fileType = '', fileName = '') {
    const type = String(fileType || '').trim().toLowerCase();
    const ext = getFileExtension(fileName);

    if (ext === 'mp4' || ext === 'm4v' || type === 'video/x-m4v') {
        return 'video/mp4';
    }
    if (ext === 'mov') {
        return 'video/quicktime';
    }
    if (type === 'video/quicktime' && ext === 'mp4') {
        return 'video/mp4';
    }

    if (type) return type;

    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'mov') return 'video/quicktime';

    return 'application/octet-stream';
}

function sanitizeHttpUrl(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
    } catch (_error) { }
    return '';
}

function extractR2KeyFromPublicUrl(url = '') {
    const cleanUrl = sanitizeHttpUrl(url);
    if (!cleanUrl) return '';
    if (!R2_PUBLIC_HOST) return '';

    try {
        const parsed = new URL(cleanUrl);
        if (String(parsed.hostname || '').toLowerCase() !== R2_PUBLIC_HOST) return '';
        const key = decodeURIComponent(String(parsed.pathname || '').replace(/^\/+/, '').trim());
        if (!key || key.includes('..')) return '';
        return key;
    } catch (_error) {
        return '';
    }
}

function buildIosTranscodedKey(sourceKey = '') {
    const cleanKey = String(sourceKey || '').trim().replace(/^\/+/, '');
    if (!cleanKey) return '';

    const parts = cleanKey.split('/');
    const fileName = parts.pop() || 'video.mp4';
    const sourceFolder = sanitizeUploadFolder(parts.join('/'), 'instagram');
    const baseName = fileName
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'video';
    const hash = crypto.createHash('sha1').update(cleanKey).digest('hex').slice(0, 12);

    return `${sourceFolder}/transcoded/${baseName}-${hash}-ios-h264.mp4`;
}

function isR2NotFoundError(error) {
    const statusCode = Number(error?.$metadata?.httpStatusCode || 0);
    return (
        error?.name === 'NoSuchKey' ||
        error?.Code === 'NoSuchKey' ||
        statusCode === 404
    );
}

async function doesR2ObjectExist(key = '') {
    if (!key) return false;
    try {
        const command = new GetObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: key,
            Range: 'bytes=0-0'
        });
        const result = await s3Client.send(command);
        const body = result?.Body;
        if (body) {
            if (typeof body.destroy === 'function') {
                body.destroy();
            } else if (typeof body.cancel === 'function') {
                await body.cancel();
            }
        }
        return true;
    } catch (error) {
        if (isR2NotFoundError(error)) return false;
        throw error;
    }
}

async function fetchRemoteVideoBufferWithLimit(url, maxBytes = MAX_IOS_TRANSCODE_INPUT_BYTES) {
    const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
            'Cache-Control': 'no-cache'
        }
    });

    if (!response.ok) {
        throw new Error(`Falha ao baixar video de origem (HTTP ${response.status})`);
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const lengthHeader = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(lengthHeader) && lengthHeader > maxBytes) {
        throw new Error(`Video excede limite de processamento (${Math.round(maxBytes / (1024 * 1024))}MB).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
        throw new Error('Arquivo de origem vazio.');
    }
    if (buffer.length > maxBytes) {
        throw new Error(`Video excede limite de processamento (${Math.round(maxBytes / (1024 * 1024))}MB).`);
    }

    return {
        buffer,
        contentType,
        finalUrl: sanitizeHttpUrl(response.url || url) || sanitizeHttpUrl(url),
        status: response.status
    };
}

function getFfmpegBinary() {
    return process.env.FFMPEG_PATH || ffmpegBinaryPath || 'ffmpeg';
}

function runFfmpegProcess(args = [], timeoutMs = IOS_TRANSCODE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const ffmpegBin = getFfmpegBinary();
        const child = spawn(ffmpegBin, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });

        let stderr = '';
        let finished = false;
        const finish = (error = null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (error) {
                reject(error);
                return;
            }
            resolve();
        };

        const timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch (_error) { }
            finish(new Error('Timeout ao converter video para formato compativel.'));
        }, Math.max(30000, Number(timeoutMs || IOS_TRANSCODE_TIMEOUT_MS)));

        child.stderr.on('data', (chunk) => {
            stderr += String(chunk || '');
            if (stderr.length > 12000) {
                stderr = stderr.slice(-12000);
            }
        });

        child.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                finish(new Error('FFmpeg nao encontrado no servidor.'));
                return;
            }
            finish(error);
        });

        child.on('close', (code) => {
            if (code === 0) {
                finish();
                return;
            }
            const detail = String(stderr || '').trim();
            finish(new Error(`Falha ao converter video (ffmpeg exit ${code}). ${detail || ''}`.trim()));
        });
    });
}

async function transcodeVideoBufferToIosCompatibleMp4(inputBuffer) {
    if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length <= 0) {
        throw new Error('Buffer de video invalido para conversao.');
    }

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mirador-ios-transcode-'));
    const inputPath = path.join(tempDir, 'input-video.bin');
    const outputPath = path.join(tempDir, 'output-ios.mp4');

    try {
        await fsp.writeFile(inputPath, inputBuffer);

        const args = [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-i', inputPath,
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-profile:v', 'high',
            '-level', '4.1',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '48000',
            '-ac', '2',
            '-max_muxing_queue_size', '2048',
            outputPath
        ];

        await runFfmpegProcess(args, IOS_TRANSCODE_TIMEOUT_MS);
        const outputBuffer = await fsp.readFile(outputPath);
        if (!outputBuffer || outputBuffer.length <= 0) {
            throw new Error('A conversao retornou arquivo vazio.');
        }
        return outputBuffer;
    } finally {
        await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => { });
    }
}

function getArticleLikesKey(newsId) {
    const safeNewsId = sanitizeNewsId(newsId);
    return safeNewsId ? `${ARTICLE_LIKES_PREFIX}/${safeNewsId}.json` : '';
}

async function bodyToString(body) {
    if (!body) return '';
    if (typeof body.transformToString === 'function') {
        return body.transformToString();
    }

    return await new Promise((resolve, reject) => {
        const chunks = [];
        body.on('data', chunk => chunks.push(Buffer.from(chunk)));
        body.on('error', reject);
        body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
}

async function readArticleLikesFromR2(newsId) {
    const key = getArticleLikesKey(newsId);
    if (!key) return 0;

    try {
        const command = new GetObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: key
        });
        const result = await s3Client.send(command);
        const rawBody = await bodyToString(result.Body);
        const payload = JSON.parse(rawBody || '{}');
        return clampToSafeInt(payload.likes);
    } catch (error) {
        const statusCode = Number(error?.$metadata?.httpStatusCode || 0);
        if (
            error?.name === 'NoSuchKey' ||
            error?.Code === 'NoSuchKey' ||
            statusCode === 404
        ) {
            return 0;
        }
        throw error;
    }
}

async function writeArticleLikesToR2(newsId, likes) {
    const key = getArticleLikesKey(newsId);
    if (!key) throw new Error('ID da notícia inválido');

    const payload = {
        newsId: sanitizeNewsId(newsId),
        likes: clampToSafeInt(likes),
        updatedAt: Date.now()
    };

    const command = new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: key,
        Body: Buffer.from(JSON.stringify(payload)),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-store'
    });
    await s3Client.send(command);

    return payload.likes;
}

function runLikesLocked(newsId, task) {
    const safeNewsId = sanitizeNewsId(newsId);
    if (!safeNewsId) return Promise.reject(new Error('ID da notícia inválido'));

    const previousTask = articleLikesLocks.get(safeNewsId) || Promise.resolve();
    const nextTask = previousTask
        .catch(() => { })
        .then(task)
        .finally(() => {
            if (articleLikesLocks.get(safeNewsId) === nextTask) {
                articleLikesLocks.delete(safeNewsId);
            }
        });

    articleLikesLocks.set(safeNewsId, nextTask);
    return nextTask;
}

async function incrementArticleLikesInR2(newsId) {
    return runLikesLocked(newsId, async () => {
        const currentLikes = await readArticleLikesFromR2(newsId);
        const nextLikes = clampToSafeInt(currentLikes + 1);
        await writeArticleLikesToR2(newsId, nextLikes);
        return nextLikes;
    });
}

async function readArticleLikesFromLocalStore(newsId) {
    const safeNewsId = sanitizeNewsId(newsId);
    if (!safeNewsId) return 0;

    try {
        const raw = await fs.promises.readFile(LOCAL_LIKES_FILE, 'utf8');
        const payload = JSON.parse(raw || '{}');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return 0;
        }
        return clampToSafeInt(payload[safeNewsId]);
    } catch (error) {
        if (error && error.code === 'ENOENT') return 0;
        console.warn('[Likes] Falha ao ler fallback local:', error?.message || error);
        return 0;
    }
}

async function writeArticleLikesToLocalStore(newsId, likes) {
    const safeNewsId = sanitizeNewsId(newsId);
    if (!safeNewsId) throw new Error('ID da notícia inválido');

    let payload = {};
    try {
        const raw = await fs.promises.readFile(LOCAL_LIKES_FILE, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            payload = parsed;
        }
    } catch (error) {
        if (!(error && error.code === 'ENOENT')) {
            console.warn('[Likes] Falha ao carregar fallback local para escrita:', error?.message || error);
        }
    }

    payload[safeNewsId] = clampToSafeInt(likes);
    await fs.promises.mkdir(LOCAL_LIKES_DIR, { recursive: true });
    await fs.promises.writeFile(LOCAL_LIKES_FILE, JSON.stringify(payload), 'utf8');
    return payload[safeNewsId];
}

async function readArticleLikesWithFallback(newsId) {
    try {
        return await readArticleLikesFromR2(newsId);
    } catch (error) {
        console.warn('[Likes] R2 indisponível (leitura), usando fallback local:', error?.message || error);
        return readArticleLikesFromLocalStore(newsId);
    }
}

async function incrementArticleLikesWithFallback(newsId) {
    try {
        return await incrementArticleLikesInR2(newsId);
    } catch (error) {
        console.warn('[Likes] R2 indisponível (incremento), usando fallback local:', error?.message || error);
        const currentLikes = await readArticleLikesFromLocalStore(newsId);
        const nextLikes = clampToSafeInt(currentLikes + 1);
        await writeArticleLikesToLocalStore(newsId, nextLikes);
        return nextLikes;
    }
}

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

function sanitizeExternalArticleUrl(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
        const parsed = new URL(raw);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
    } catch (_error) { }

    return '';
}

function escapeHtmlText(value = '') {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(value = '') {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function shortenText(value = '', limit = 300) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= limit) return normalized;

    const clipped = normalized.slice(0, limit);
    const boundary = clipped.lastIndexOf(' ');
    const safeCut = boundary > Math.floor(limit * 0.45) ? clipped.slice(0, boundary) : clipped;
    return `${safeCut.trim()}...`;
}

function stripHtmlToText(html = '') {
    return decodeHtmlEntities(
        String(html || '')
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<br\b[^>]*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/h[1-6]>/gi, '\n')
            .replace(/<\/li>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\r/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim()
    );
}

function extractTitleTagContent(html = '') {
    const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    return match ? decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
}

function extractImageFromJsonLdValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
        for (const item of value) {
            const extracted = extractImageFromJsonLdValue(item);
            if (extracted) return extracted;
        }
        return '';
    }
    if (typeof value === 'object') {
        return String(
            value.url ||
            value.contentUrl ||
            value.thumbnailUrl ||
            value['@id'] ||
            ''
        ).trim();
    }
    return '';
}

function collectJsonLdNodes(payload) {
    const queue = Array.isArray(payload) ? [...payload] : [payload];
    const nodes = [];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        if (Array.isArray(current)) {
            queue.push(...current);
            continue;
        }

        if (typeof current !== 'object') continue;
        nodes.push(current);

        if (Array.isArray(current['@graph'])) queue.push(...current['@graph']);
        if (current.mainEntity) queue.push(current.mainEntity);
        if (current.itemListElement) queue.push(current.itemListElement);
    }

    return nodes;
}

function extractJsonLdArticleData(html = '') {
    const scripts = String(html || '').match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
    const best = {
        title: '',
        description: '',
        articleBody: '',
        image: ''
    };

    for (const scriptTag of scripts) {
        const jsonText = String(scriptTag || '')
            .replace(/^<script\b[^>]*>/i, '')
            .replace(/<\/script>$/i, '')
            .trim();
        if (!jsonText) continue;

        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch (_error) {
            continue;
        }

        const nodes = collectJsonLdNodes(parsed);
        for (const node of nodes) {
            const typeRaw = node?.['@type'];
            const typeText = (Array.isArray(typeRaw) ? typeRaw.join(' ') : String(typeRaw || '')).toLowerCase();
            if (!/(newsarticle|article|blogposting|reportage|analysis)/i.test(typeText)) continue;

            const title = String(node.headline || node.name || '').trim();
            const description = String(node.description || '').trim();
            const articleBody = String(node.articleBody || node.text || '').trim();
            const image = extractImageFromJsonLdValue(node.image || node.thumbnailUrl);

            if (!best.title && title) best.title = title;
            if (!best.description && description) best.description = description;
            if (!best.image && image) best.image = image;
            if (articleBody.length > best.articleBody.length) best.articleBody = articleBody;
        }
    }

    return best;
}

function extractBestArticleBlockHtml(rawHtml = '') {
    const html = String(rawHtml || '');
    if (!html) return '';

    const searchSpace = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');

    const candidates = [];
    const pushCandidate = (candidateHtml = '') => {
        const cleanHtml = String(candidateHtml || '').trim();
        if (!cleanHtml) return;

        const plainText = stripHtmlToText(cleanHtml);
        const textLength = plainText.length;
        if (textLength < 280) return;

        const paragraphCount = (cleanHtml.match(/<p\b/gi) || []).length;
        const headingCount = (cleanHtml.match(/<h[1-6]\b/gi) || []).length;
        const imageCount = (cleanHtml.match(/<img\b/gi) || []).length;
        const linkCount = (cleanHtml.match(/<a\b/gi) || []).length;
        const listItemCount = (cleanHtml.match(/<li\b/gi) || []).length;
        const textPerLink = textLength / Math.max(1, linkCount);
        const linkDensity = linkCount / Math.max(1, paragraphCount + headingCount + 1);
        const listDensity = listItemCount / Math.max(1, paragraphCount + 1);
        const noisyPenalty = /(newsletter|publicidade|anuncio|advert|cookie|consent|inscreva|assine|share|social|coment[aá]rio|tags?|assuntos?|recomendad|mais lidas|relacionad|trust project|seguir|seguindo|siga-nos|autor|reda[cç][aã]o|biografia)/i.test(cleanHtml) ? 1100 : 0;
        const linkPenalty = (linkDensity > 1.4 ? Math.round((linkDensity - 1.4) * 520) : 0) + (textPerLink < 90 ? 900 : 0);
        const listPenalty = listDensity > 2.2 ? Math.round((listDensity - 2.2) * 380) : 0;
        const score = textLength + paragraphCount * 160 + headingCount * 100 + imageCount * 40 - noisyPenalty - linkPenalty - listPenalty;

        candidates.push({ html: cleanHtml, score, textLength });
    };

    const patternList = [
        /<article\b[^>]*>[\s\S]*?<\/article>/gi,
        /<(main|section|div)\b[^>]*(?:itemprop=["']articleBody["']|id=["'][^"']*(?:article|content|post|entry|story|news|materia|conteudo|texto)[^"']*["']|class=["'][^"']*(?:article|content|post|entry|story|news|materia|conteudo|texto)[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi
    ];

    for (const pattern of patternList) {
        let match;
        while ((match = pattern.exec(searchSpace)) !== null) {
            pushCandidate(match[0]);
        }
    }

    if (candidates.length === 0) {
        const bodyMatch = searchSpace.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
        pushCandidate(bodyMatch ? bodyMatch[1] : searchSpace);
    }

    if (candidates.length === 0) return '';
    candidates.sort((a, b) => b.score - a.score || b.textLength - a.textLength);
    return candidates[0].html;
}

function normalizeResourceUrl(value = '', baseUrl = '', options = {}) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const attrName = String(options.forAttribute || '').toLowerCase();
    const lower = raw.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) return '';

    if (attrName === 'href' && (raw.startsWith('#') || lower.startsWith('mailto:') || lower.startsWith('tel:'))) {
        return raw;
    }

    if (attrName === 'src' && lower.startsWith('data:image/')) {
        return raw;
    }

    if (lower.startsWith('data:')) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;

    try {
        return new URL(raw, baseUrl).toString();
    } catch (_error) {
        return '';
    }
}

function sanitizeExtractedArticleHtml(rawHtml = '', baseUrl = '') {
    if (!rawHtml) return '';

    let html = String(rawHtml)
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<(iframe|object|embed|form|input|button|textarea|select|svg|canvas|audio|video)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<(iframe|object|embed|form|input|button|textarea|select|svg|canvas|audio|video)\b[^>]*\/?>/gi, ' ');

    const noisyBlockPattern = /<(div|section|aside|nav|footer|header)\b[^>]*(?:id|class)=["'][^"']*(?:ad-|ads|advert|banner|cookie|consent|newsletter|promo|related|share|social|outbrain|taboola|recommended|comment|paywall|subscribe|popup|modal|author|bio|tag|tags|assunto|list|lista|menu|header|footer|sidebar|widget|trust|recomendad|mais-lidas|mais-lidos|veja-tambem|leia-tambem)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
    html = html.replace(noisyBlockPattern, ' ');

    const allowedTags = new Set([
        'p', 'br', 'strong', 'em', 'b', 'i', 'u',
        'a', 'blockquote',
        'h2', 'h3', 'h4', 'h5', 'h6',
        'img', 'figure', 'figcaption'
    ]);
    const noisyImagePattern = /(avatar|author|profile|perfil|logo|icon|ico|sprite|favicon|gravatar|newsletter|ads?|banner|placeholder|thumb|thumbnail|marca-dagua|watermark|\/assets\/img\/|\/lgo\/|\.svg(?:$|\?))/i;
    let keptImageCount = 0;
    const MAX_CONTENT_IMAGES = 6;

    html = html.replace(/<(\/?)([a-z0-9:-]+)([^>]*)>/gi, (_fullMatch, slash, rawTagName, rawAttrs = '') => {
        const tagName = String(rawTagName || '').toLowerCase();
        if (!allowedTags.has(tagName)) return '';

        if (slash) {
            return `</${tagName}>`;
        }

        if (tagName === 'br') return '<br>';

        const attributes = [];
        const attrRegex = /([a-z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
            const name = String(attrMatch[1] || '').toLowerCase();
            const rawValue = String(attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '').trim();
            if (!name || !rawValue) continue;

            if (
                name.startsWith('on') ||
                name === 'style' ||
                name === 'class' ||
                name === 'id' ||
                name === 'srcset' ||
                name === 'sizes' ||
                name === 'width' ||
                name === 'height' ||
                name.startsWith('data-')
            ) {
                continue;
            }

            if (tagName === 'a') {
                if (name !== 'href') continue;
                const safeHref = normalizeResourceUrl(rawValue, baseUrl, { forAttribute: 'href' });
                if (!safeHref) continue;
                attributes.push(`href="${escapeHtmlAttribute(safeHref)}"`);
                continue;
            }

            if (tagName === 'img') {
                if (!['src', 'alt', 'title', 'loading'].includes(name)) continue;
                if (name === 'src') {
                    const safeSrc = normalizeResourceUrl(rawValue, baseUrl, { forAttribute: 'src' });
                    if (!safeSrc) continue;
                    if (noisyImagePattern.test(safeSrc)) continue;
                    if (keptImageCount >= MAX_CONTENT_IMAGES) continue;
                    attributes.push(`src="${escapeHtmlAttribute(safeSrc)}"`);
                    continue;
                }
                if (name === 'alt' && noisyImagePattern.test(rawValue)) continue;
                attributes.push(`${name}="${escapeHtmlAttribute(rawValue)}"`);
                continue;
            }

            if (['title'].includes(name)) {
                attributes.push(`${name}="${escapeHtmlAttribute(rawValue)}"`);
            }
        }

        if (tagName === 'a') {
            attributes.push('target="_blank"');
            attributes.push('rel="noopener nofollow"');
        }

        if (tagName === 'img' && !attributes.some(attr => attr.startsWith('loading='))) {
            attributes.push('loading="lazy"');
        }
        if (tagName === 'img' && attributes.some(attr => attr.startsWith('src='))) {
            keptImageCount += 1;
        }

        return `<${tagName}${attributes.length > 0 ? ` ${attributes.join(' ')}` : ''}>`;
    });

    html = html
        .replace(/<(p|figure|figcaption|blockquote|h2|h3|h4|h5|h6)\b[^>]*>\s*<\/\1>/gi, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    if (html.length > 250000) {
        html = html.slice(0, 250000);
    }

    return html;
}

function postProcessArticleContentHtml(contentHtml = '') {
    let html = String(contentHtml || '');
    if (!html) return '';

    const noisySnippetPattern = /(leia também|veja também|mais lidas|mais lidos|mais notícias|conteúdo patrocinado|publicidade|anúncio|assine|inscreva-se|newsletter|siga-nos|compartilhe|coment[aá]rios?|tags?:|assuntos?:|trust project|todos os direitos reservados|política de privacidade|termos de uso|seguir|seguindo|por reda[cç][aã]o|por poder360|veja gente|copyright|resumo foi|resumo gerado por ferramenta de ia)/i;

    html = html
        .replace(/<h([2-6])>\s*<p>/gi, '<h$1>')
        .replace(/<\/p>\s*<\/h([2-6])>/gi, '</h$1>');

    html = html.replace(/<(p|h2|h3|h4|h5|h6|figcaption|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi, (blockHtml) => {
        const blockText = stripHtmlToText(blockHtml);
        const linkCount = (String(blockHtml).match(/<a\b/gi) || []).length;

        if (!blockText) return ' ';
        if (noisySnippetPattern.test(blockText) && blockText.length < 450) return ' ';
        if (linkCount >= 3 && blockText.length < 360) return ' ';
        if (linkCount >= 2 && blockText.length < 210) return ' ';
        if (blockText.length < 26 && !/[.!?]/.test(blockText) && linkCount === 0) return ' ';
        return blockHtml;
    });

    const structuredBlocks = html.match(/<(h2|h3|h4|h5|h6|p|blockquote|figure|figcaption)\b[\s\S]*?<\/\1>/gi) || [];
    if (structuredBlocks.length > 0) {
        const blocksHtml = structuredBlocks.join('\n');
        const originalTextLength = stripHtmlToText(html).length;
        const blocksTextLength = stripHtmlToText(blocksHtml).length;
        if (blocksTextLength > 0 && (blocksTextLength / Math.max(1, originalTextLength)) >= 0.55) {
            html = blocksHtml;
        }
    }

    html = html
        .replace(/<img\b(?![^>]*\bsrc=)[^>]*>/gi, ' ')
        .replace(/<figure\b[^>]*>(?:(?!<img\b)[\s\S])*?<\/figure>/gi, ' ')
        .replace(/<a\b[^>]*>\s*<\/a>/gi, ' ')
        .replace(/<(p|figure|figcaption|blockquote|h2|h3|h4|h5|h6)\b[^>]*>\s*<\/\1>/gi, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    return html;
}

function extractArticlePayloadFromHtml(html = '', pageUrl = '') {
    const cleanHtml = String(html || '');
    const jsonLd = extractJsonLdArticleData(cleanHtml);

    const metaTitle = extractMetaTagContent(cleanHtml, 'og:title', 'property')
        || extractMetaTagContent(cleanHtml, 'twitter:title', 'name')
        || extractTitleTagContent(cleanHtml);
    const metaDescription = extractMetaTagContent(cleanHtml, 'og:description', 'property')
        || extractMetaTagContent(cleanHtml, 'description', 'name')
        || extractMetaTagContent(cleanHtml, 'twitter:description', 'name');
    const metaImage = extractMetaTagContent(cleanHtml, 'og:image', 'property')
        || extractMetaTagContent(cleanHtml, 'twitter:image', 'name')
        || '';

    const fallbackArticleBodyHtml = jsonLd.articleBody
        ? String(jsonLd.articleBody)
            .split(/\n{2,}/)
            .map(chunk => chunk.trim())
            .filter(Boolean)
            .map(chunk => `<p>${escapeHtmlText(chunk)}</p>`)
            .join('')
        : '';

    const bestBlockHtml = extractBestArticleBlockHtml(cleanHtml);
    const sanitizedContent = sanitizeExtractedArticleHtml(bestBlockHtml || fallbackArticleBodyHtml, pageUrl);
    const curatedContent = postProcessArticleContentHtml(sanitizedContent);
    const textFromContent = stripHtmlToText(curatedContent || fallbackArticleBodyHtml);
    const fallbackParagraphContent = textFromContent
        ? textFromContent
            .split(/\n{2,}/)
            .map(chunk => chunk.trim())
            .filter(Boolean)
            .slice(0, 40)
            .map(chunk => `<p>${escapeHtmlText(chunk)}</p>`)
            .join('')
        : '';
    let finalContent = curatedContent || fallbackParagraphContent;
    if ((String(finalContent).match(/<img\b/gi) || []).length === 0) {
        finalContent = String(finalContent)
            .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, ' ')
            .replace(/<figure\b[^>]*>\s*<\/figure>/gi, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    const title = decodeEscapedText(jsonLd.title || metaTitle || '');
    const description = decodeEscapedText(jsonLd.description || metaDescription || '');
    const excerpt = shortenText(description || textFromContent, 320);

    const firstContentImage = extractFirstValueByPatterns(finalContent, [
        /<img\b[^>]*src=["']([^"']+)["']/i
    ]);
    const image = normalizeResourceUrl(
        jsonLd.image || metaImage || firstContentImage,
        pageUrl,
        { forAttribute: 'src' }
    );

    return {
        title,
        description,
        excerpt,
        image,
        content: finalContent
    };
}

async function fetchAndExtractArticle(url) {
    const targetUrl = sanitizeExternalArticleUrl(url);
    if (!targetUrl) {
        throw new Error('URL invalida. Informe um link http(s).');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
        response = await fetch(targetUrl, {
            method: 'GET',
            headers: ARTICLE_FETCH_HEADERS,
            redirect: 'follow',
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!response || !response.ok) {
        const status = response ? response.status : 0;
        throw new Error(`Falha ao buscar pagina de origem (HTTP ${status || 0})`);
    }

    const finalUrl = sanitizeExternalArticleUrl(response.url || targetUrl) || targetUrl;
    const html = await response.text();
    const payload = extractArticlePayloadFromHtml(html, finalUrl);
    const sourceDomain = (() => {
        try {
            return new URL(finalUrl).hostname.replace(/^www\./i, '');
        } catch (_error) {
            return '';
        }
    })();

    return {
        ...payload,
        externalUrl: finalUrl,
        sourceDomain
    };
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

function stripJsonPreamble(payload = '') {
    return String(payload || '').replace(/^\s*for\s*\(;;\);\s*/i, '').trim();
}

async function fetchJsonWithRetry(url, attempts = 2) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    ...INSTAGRAM_FETCH_HEADERS,
                    Accept: 'application/json,text/plain,*/*'
                }
            });
            if (response.ok) {
                const text = await response.text();
                return JSON.parse(stripJsonPreamble(text));
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
        expiresAt: Date.now() + INSTAGRAM_OEMBED_CACHE_TTL_MS
    });

    return payload;
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
                    ogTitle = oembedTitle.length > 120 ? (oembedTitle.slice(0, 117).trimEnd() + '...') : oembedTitle;
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
        /(?:\be\b|\band\b)\s+(?:outra\s+conta|outros?\s+\d+|others?\s+\d+)/i.test((ogTitle || '') + ' ' + (ogDescription || ''))
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
        expiresAt: Date.now() + INSTAGRAM_META_CACHE_TTL_MS
    });

    return result;
}

// Configurar upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_UPLOAD_FILE_BYTES
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'];
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

app.get('/api/news/:id/likes', async (req, res) => {
    try {
        const newsId = sanitizeNewsId(req.params.id);
        if (!newsId) {
            return res.status(400).json({ success: false, error: 'ID da notícia inválido' });
        }

        const likes = await readArticleLikesWithFallback(newsId);
        return res.json({
            success: true,
            newsId,
            likes
        });
    } catch (error) {
        console.error('Erro ao consultar curtidas no R2:', error);
        return res.status(500).json({ success: false, error: 'Falha ao consultar curtidas' });
    }
});

app.post('/api/news/:id/like', async (req, res) => {
    try {
        const newsId = sanitizeNewsId(req.params.id);
        if (!newsId) {
            return res.status(400).json({ success: false, error: 'ID da notícia inválido' });
        }

        const likes = await incrementArticleLikesWithFallback(newsId);
        return res.json({
            success: true,
            newsId,
            likes
        });
    } catch (error) {
        console.error('Erro ao registrar curtida no R2:', error);
        return res.status(500).json({ success: false, error: 'Falha ao registrar curtida' });
    }
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

app.get('/api/article/extract', async (req, res) => {
    try {
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0'
        });

        const requestedUrl = String(req.query.url || '').trim();
        if (!requestedUrl) {
            return res.status(400).json({ success: false, error: 'Parametro url e obrigatorio' });
        }

        const extracted = await fetchAndExtractArticle(requestedUrl);
        return res.json({
            success: true,
            title: extracted.title || '',
            description: extracted.description || '',
            excerpt: extracted.excerpt || '',
            image: extracted.image || '',
            content: extracted.content || '',
            sourceDomain: extracted.sourceDomain || '',
            externalUrl: extracted.externalUrl || sanitizeExternalArticleUrl(requestedUrl) || ''
        });
    } catch (error) {
        console.error('Erro ao extrair materia externa:', error?.message || error);
        return res.status(500).json({
            success: false,
            error: error?.message || 'Falha ao extrair conteudo da noticia'
        });
    }
});

app.post('/api/video/transcode-ios', async (req, res) => {
    try {
        const sourceUrl = sanitizeHttpUrl(req.body?.url || '');
        if (!sourceUrl) {
            return res.status(400).json({ success: false, error: 'Parametro url e obrigatorio.' });
        }

        const sourceKey = extractR2KeyFromPublicUrl(sourceUrl);
        if (!sourceKey) {
            return res.status(400).json({ success: false, error: 'URL de video invalida. Use arquivo do R2 publico.' });
        }

        const sourceExt = getFileExtension(sourceKey);
        if (!['mp4', 'm4v', 'mov', 'webm'].includes(sourceExt)) {
            return res.status(400).json({ success: false, error: `Formato de origem nao suportado: .${sourceExt || 'desconhecido'}` });
        }

        const targetKey = buildIosTranscodedKey(sourceKey);
        if (!targetKey) {
            return res.status(400).json({ success: false, error: 'Nao foi possivel gerar chave de destino para transcodificacao.' });
        }

        const targetUrl = `${R2_CONFIG.publicUrl}/${targetKey}`;
        const alreadyExists = await doesR2ObjectExist(targetKey);
        if (alreadyExists) {
            return res.json({
                success: true,
                reused: true,
                url: targetUrl,
                key: targetKey,
                type: 'video/mp4'
            });
        }

        const source = await fetchRemoteVideoBufferWithLimit(sourceUrl, MAX_IOS_TRANSCODE_INPUT_BYTES);
        const sourceContentType = String(source.contentType || '').toLowerCase();
        if (sourceContentType && !sourceContentType.startsWith('video/')) {
            return res.status(400).json({
                success: false,
                error: `Arquivo de origem nao e video (${sourceContentType || 'desconhecido'}).`
            });
        }

        const outputBuffer = await transcodeVideoBufferToIosCompatibleMp4(source.buffer);

        const putCommand = new PutObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: targetKey,
            Body: outputBuffer,
            ContentType: 'video/mp4',
            CacheControl: 'public, max-age=31536000, immutable',
            ACL: 'public-read',
            Metadata: {
                sourcekey: sourceKey.slice(0, 512),
                generatedfor: 'ios-compatibility'
            }
        });
        await s3Client.send(putCommand);

        return res.json({
            success: true,
            reused: false,
            url: targetUrl,
            key: targetKey,
            inputBytes: source.buffer.length,
            outputBytes: outputBuffer.length,
            type: 'video/mp4'
        });
    } catch (error) {
        console.error('Erro ao gerar versao iOS compativel:', error);
        return res.status(500).json({
            success: false,
            error: error?.message || 'Falha ao gerar versao compativel para iOS.'
        });
    }
});

// Upload de arquivo
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const folder = sanitizeUploadFolder(req.body.folder || 'noticias');
        const fileType = String(req.file.mimetype || '').toLowerCase();
        const fileSize = Number(req.file.size || 0);
        const isImage = fileType.startsWith('image/');
        const isVideo = fileType.startsWith('video/');

        if (!Number.isFinite(fileSize) || fileSize <= 0) {
            return res.status(400).json({ error: 'Arquivo invalido: tamanho 0 bytes.' });
        }

        if (!isImage && !isVideo) {
            return res.status(400).json({ error: 'Tipo de arquivo nao suportado. Apenas imagem e video.' });
        }

        if (isVideo && INSTAGRAM_FOLDER_PATTERN.test(folder) && !ALLOWED_INSTAGRAM_VIDEO_MIME_TYPES.has(fileType)) {
            return res.status(400).json({ error: `Formato de video nao suportado para Instagram: ${req.file.mimetype || 'desconhecido'}. Use MP4, MOV ou M4V.` });
        }

        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = String(req.file.originalname || '')
            .split('.')
            .pop()
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase() || 'bin';
        const key = `${folder}/${timestamp}-${random}.${extension}`;
        const normalizedContentType = normalizeUploadedContentType(fileType, req.file.originalname || `arquivo.${extension}`);

        // Upload para R2
        const command = new PutObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: key,
            Body: req.file.buffer,
            ContentType: normalizedContentType,
            CacheControl: 'public, max-age=31536000, immutable',
            ACL: 'public-read'
        });

        await s3Client.send(command);

        const publicUrl = `${R2_CONFIG.publicUrl}/${key}`;

        res.json({
            success: true,
            url: publicUrl,
            key: key,
            size: fileSize,
            type: normalizedContentType
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
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                error: `Arquivo excede o limite de ${Math.round(MAX_UPLOAD_FILE_BYTES / (1024 * 1024))}MB`
            });
        }
        return res.status(400).json({ error: err.message || 'Erro de upload' });
    }

    if (err) {
        return res.status(400).json({ error: err.message || 'Erro ao processar requisicao' });
    }

    return next();
});

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
