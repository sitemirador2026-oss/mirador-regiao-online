// App principal do site público

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
        excerpt: "Dados mostram aumento de 15% na atividade econômica regional.",
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
        excerpt: "Técnico convoca novos jogadores para amistosos internacionais.",
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
    return `${dateStr} • ${timeStr}`;
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
    const handle = (match && match[0]) ? match[0] : '';
    if (!handle) return '';

    const blocked = ['instagram', 'undefined', 'null', 'nan', 'profile', 'user'];
    if (blocked.includes(handle.toLowerCase())) return '';
    return handle;
}

function sanitizeInstagramProfileImage(url) {
    if (!url || typeof url !== 'string') return '';
    const clean = url.trim();
    if (!clean) return '';
    const blockedParts = ['favicon', 'apple-touch-icon', 'static/images/ico', 'default_'];
    if (blockedParts.some(part => clean.toLowerCase().includes(part))) return '';
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
    if (!clean) return buildUiAvatarUrl(fallbackName);
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

    const username = sanitizeInstagramHandle(
        meta.username ||
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
    );
    const cleanProfileImage = sanitizeInstagramProfileImage(meta.profileImage || '');

    return {
        likes,
        comments,
        username,
        displayName,
        profileImage: cleanProfileImage
    };
}

async function fetchInstagramMeta(instagramUrl) {
    let internalMeta = null;
    let microlinkData = null;
    let noembedData = null;

    const encodedUrl = encodeURIComponent(instagramUrl);
    const metaEndpoints = [
        `/api/instagram/meta?url=${encodedUrl}`,
        `https://mirador-r2.sitemirador2026.workers.dev/api/instagram/meta?url=${encodedUrl}`
    ];

    for (const endpoint of metaEndpoints) {
        try {
            const response = await fetch(endpoint);
            if (!response.ok) continue;
            const payload = await response.json();
            if (payload && payload.success) {
                internalMeta = payload;
                break;
            }
        } catch (_e) {}
    }

    try {
        const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(instagramUrl)}`);
        if (response.ok) {
            const payload = await response.json();
            microlinkData = payload?.data || null;
        }
    } catch (_e) {}

    if (!microlinkData) {
        try {
            const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(instagramUrl)}`);
            if (response.ok) {
                noembedData = await response.json();
            }
        } catch (_e) {}
    }

    const merged = {
        likes: pickBestInstagramCount(
            internalMeta?.likes,
            microlinkData?.likes,
            microlinkData?.like_count,
            microlinkData?.engagement?.likes
        ),
        comments: pickBestInstagramCount(
            internalMeta?.comments,
            microlinkData?.comments,
            microlinkData?.comment_count,
            microlinkData?.engagement?.comments
        ),
        title: internalMeta?.title || microlinkData?.title || noembedData?.title || '',
        description: internalMeta?.description || microlinkData?.description || noembedData?.title || '',
        authorName: internalMeta?.displayName || microlinkData?.author?.name || noembedData?.author_name || '',
        authorUrl: microlinkData?.author?.url || '',
        username: internalMeta?.username || microlinkData?.author?.username || '',
        profileImage: internalMeta?.profileImage || microlinkData?.author?.image?.url || microlinkData?.author?.avatar || ''
    };

    return normalizeInstagramMeta(merged, instagramUrl);
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

// Obter logo do site configurada no admin
function getSiteLogo() {
    const brandSettings = localStorage.getItem('publicSiteBrand');
    if (brandSettings) {
        try {
            const settings = JSON.parse(brandSettings);
            if (settings.logo) return settings.logo;
        } catch(e) {}
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
        // Notícia própria - usar logo do site configurada
        sourceDomain = 'Nossa Notícia';
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
                    ${timeStr} • ${dateStr}
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
        sourceDomain = 'Nossa Notícia';
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
                    <span class="news-card-horizontal-time">${timeStr} • ${dateStr}</span>
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
        </article>
    `;
}

// Renderizar notícias com layout alternado
// Renderizar bloco de notícias com padrão: 2 normais + 1 especial
function renderNewsBlock(newsItems, startIndex, container) {
    const cardsPerRow = 5;
    const cardsInSpecialRow = 4;
    let html = '';
    let index = startIndex;
    let rowsRendered = 0;
    
    // Padrão: 2 normais + 1 especial (repetido 2x = 4 normais + 2 especiais)
    for (let cycle = 0; cycle < 2 && index < newsItems.length; cycle++) {
        // Fileira normal 1
        if (index < newsItems.length) {
            for (let i = 0; i < cardsPerRow && index < newsItems.length; i++) {
                html += createNewsCard(newsItems[index++]);
            }
            rowsRendered++;
        }
        
        // Fileira normal 2
        if (index < newsItems.length) {
            for (let i = 0; i < cardsPerRow && index < newsItems.length; i++) {
                html += createNewsCard(newsItems[index++]);
            }
            rowsRendered++;
        }
        
        // Fileira especial horizontal
        if (index < newsItems.length) {
            html += '<div class="news-row-horizontal">';
            for (let i = 0; i < cardsInSpecialRow && index < newsItems.length; i++) {
                html += createHorizontalNewsCard(newsItems[index++]);
            }
            html += '</div>';
            rowsRendered++;
        }
    }
    
    // Se sobrar notícias, completar com cards normais
    while (index < newsItems.length) {
        html += createNewsCard(newsItems[index++]);
    }
    
    if (container) {
        container.innerHTML = html || '<div class="empty-state">Nenhuma notícia encontrada.</div>';
    }
    
    return index; // Retorna o índice final
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
                : '<div class="empty-state">Nenhuma notícia em destaque.</div>';
        }
        
        // Últimas notícias - excluindo notícias do Instagram (têm seção própria)
        const latest = news
            .filter(n => n.source !== 'Instagram' && n.category !== 'instagram')
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        const latestContainer = document.getElementById('latestNews');
        
        if (latestContainer) {
            renderNewsBlock(latest, 0, latestContainer);
        }
        
        // Renderizar seções por categoria
        const categories = [
            { id: 'esportes', containerId: 'categoryEsportes' },
            { id: 'politica', containerId: 'categoryPolitica' },
            { id: 'policia', containerId: 'categoryPolicia' },
            { id: 'regiao', containerId: 'categoryRegiao' },
            { id: 'mirador', containerId: 'categoryMirador' },
            { id: 'brasil', containerId: 'categoryBrasil' },
            { id: 'instagram', containerId: 'categoryInstagram' }
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
        
    } catch (error) {
        console.error('[App] Erro ao renderizar notícias:', error);
    }
}

// Ver detalhes da notícia
function viewNews(id) {
    localStorage.setItem('currentNewsId', id);
    window.location.href = 'noticia.html?id=' + id;
}

// Filtrar por categoria
async function filterByCategory(category) {
    localStorage.setItem('selectedCategory', category);
    window.location.href = 'categoria.html?cat=' + category;
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
    const news = await loadNewsFromFirebase();
    const filtered = news.filter(n => n.category === category);
    const container = document.getElementById('latestNews');
    
    if (container) {
        container.innerHTML = filtered.length > 0
            ? filtered.map(createNewsCard).join('')
            : '<div class="empty-state">Nenhuma notícia nesta categoria.</div>';
        container.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Fechar menu mobile
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu?.classList.contains('active')) {
        toggleMobileMenu();
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[App] v2.5 - Inicializando...');
    
    // Inicializar dados
    await initializeData();
    
    // Renderizar notícias
    await renderNews();
    
    // Event Listeners
    document.querySelector('.btn-search')?.addEventListener('click', toggleSearchModal);
    document.querySelector('.search-close')?.addEventListener('click', toggleSearchModal);
    document.querySelector('.btn-menu-mobile')?.addEventListener('click', toggleMobileMenu);
    document.querySelector('.mobile-menu-close')?.addEventListener('click', toggleMobileMenu);
    
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
    document.getElementById('searchInput')?.addEventListener('input', function(e) {
        if (e.target.value.length >= 2) {
            searchNews(e.target.value);
        }
    });
    
    // Fechar modal ao clicar fora
    document.getElementById('searchModal')?.addEventListener('click', function(e) {
        if (e.target === this) toggleSearchModal();
    });
    
    // Links de categoria
    document.querySelectorAll('[data-category]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            filterByCategory(this.getAttribute('data-category'));
        });
    });
    
    // Fechar menu mobile ao clicar fora
    document.addEventListener('click', function(e) {
        const menu = document.getElementById('mobileMenu');
        const btn = document.querySelector('.btn-menu-mobile');
        if (menu && !menu.contains(e.target) && !btn?.contains(e.target)) {
            menu.classList.remove('active');
        }
    });
    
    // Carregar e aplicar configurações de links do rodapé
    loadFooterLinks();
    
    // Carregar stories
    loadStories();
    
    // Carregar notícias do Instagram
    loadInstagramNews();
    
    console.log('[App] v2.5 - Pronto!');
});

// Carregar configurações de links do rodapé
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
        }
    } catch (error) {
        const saved = localStorage.getItem('publicFooterLinks');
        if (saved) applyFooterLinks(JSON.parse(saved));
    }
}

function applyFooterLinks(links) {
    if (!links) return;
    
    if (links.about) {
        const el = document.getElementById('footerLinkAboutEl');
        if (el) el.href = links.about;
    }
    if (links.contact) {
        const el = document.getElementById('footerLinkContactEl');
        if (el) el.href = links.contact;
    }
    if (links.privacy) {
        const el = document.getElementById('footerLinkPrivacyEl');
        if (el) el.href = links.privacy;
    }
    if (links.terms) {
        const el = document.getElementById('footerLinkTermsEl');
        if (el) el.href = links.terms;
    }
    
    if (links.social) {
        if (links.social.instagram) {
            const el = document.getElementById('footerSocialInstagramEl');
            if (el) { el.href = links.social.instagram; el.style.display = 'flex'; }
        }
        if (links.social.facebook) {
            const el = document.getElementById('footerSocialFacebookEl');
            if (el) { el.href = links.social.facebook; el.style.display = 'flex'; }
        }
        if (links.social.twitter) {
            const el = document.getElementById('footerSocialTwitterEl');
            if (el) { el.href = links.social.twitter; el.style.display = 'flex'; }
        }
        if (links.social.youtube) {
            const el = document.getElementById('footerSocialYoutubeEl');
            if (el) { el.href = links.social.youtube; el.style.display = 'flex'; }
        }
    }
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
    if (!container) return;
    
    if (storiesData.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = storiesData.map((story, index) => {
        let avatarContent = '';
        
        if (story.type === 'text') {
            // Story de texto - mostrar círculo com gradiente
            avatarContent = `<div style="width: 100%; height: 100%; border-radius: 50%; background: ${story.bgColor || 'linear-gradient(45deg, #f09433, #e6683c, #dc2743)'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem; font-weight: bold;">T</div>`;
        } else if (story.isVideo) {
            // Story de vídeo - mostrar preview com ícone de play
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
        // Story de vídeo
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
    
    // Esconder botão "Ver no Instagram" se não tiver link
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
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('storyModalClose')?.addEventListener('click', closeStoryModal);
    document.getElementById('storyModalBackdrop')?.addEventListener('click', closeStoryModal);
    document.getElementById('storyNext')?.addEventListener('click', nextStory);
    document.getElementById('storyPrev')?.addEventListener('click', prevStory);
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('storyModal');
        if (!modal?.classList.contains('active')) return;
        
        if (e.key === 'Escape') closeStoryModal();
        if (e.key === 'ArrowRight') nextStory();
        if (e.key === 'ArrowLeft') prevStory();
    });
});

// Instagram News functionality
let allInstagramNews = [];
let showingAllInstagram = false;

window.addEventListener('public-layout-updated', () => {
    if (typeof loadInstagramNews === 'function') {
        showingAllInstagram = false;
        loadInstagramNews();
    }
});

async function loadInstagramNews() {
    try {
        let news = [];
        
        try {
            // Tentar consulta com filtros (requer índice)
            const snapshot = await db.collection('news')
                .where('source', '==', 'Instagram')
                .where('status', '==', 'published')
                .orderBy('date', 'desc')
                .limit(20)
                .get();
            
            snapshot.forEach(doc => {
                news.push({ id: doc.id, ...doc.data() });
            });
        } catch (indexError) {
            // Fallback: carregar todas e filtrar no cliente
            console.log('[App] Usando fallback para carregar notícias do Instagram');
            const snapshot = await db.collection('news')
                .orderBy('date', 'desc')
                .limit(50)
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
            return;
        }
        
        // Mostrar quantidade configurada no painel (fallback: 4)
        const instagramVisiblePosts = getInstagramVisiblePostsCount();
        const newsToShow = showingAllInstagram ? news : news.slice(0, instagramVisiblePosts);
        
        let html = newsToShow.map(createInstagramCard).join('');
        
        // Adicionar botão "Ver Todos" se houver mais posts do que o limite configurado
        if (news.length > instagramVisiblePosts && !showingAllInstagram) {
            html += `
                <div class="instagram-card instagram-view-all-card" onclick="toggleInstagramViewAll()">
                    <div style="aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);">
                        <div style="text-align: center; color: white;">
                            <svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24" style="margin-bottom: 0.5rem;">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                                <path d="M12 6c-3.313 0-6 2.687-6 6s2.687 6 6 6 6-2.687 6-6-2.687-6-6-6zm0 10c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z"/>
                            </svg>
                            <div style="font-size: 1rem; font-weight: 600;">Ver Todos</div>
                            <div style="font-size: 0.875rem; opacity: 0.9;">+${news.length - instagramVisiblePosts} posts</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // Atualizar contagens reais de curtidas/comentários
        updateInstagramStats(newsToShow);
        
    } catch (error) {
        console.error('[App] Erro ao carregar notícias do Instagram:', error);
    }
}

// Toggle entre mostrar limite configurado ou todos
function toggleInstagramViewAll() {
    showingAllInstagram = !showingAllInstagram;
    loadInstagramNews();
}

// Atualizar estatísticas do Instagram (curtidas e comentários)
async function updateInstagramStats(newsItems) {
    const requestIntervalMs = 450;
    for (const news of newsItems) {
        if (news.instagramUrl) {
            try {
                const meta = await fetchInstagramMeta(news.instagramUrl);
                if (meta) {
                    updateInstagramCardStats(news.id, meta);
                }
            } catch (e) {
                console.log('[App] Erro ao buscar stats do Instagram:', e);
            }
            await new Promise(resolve => setTimeout(resolve, requestIntervalMs));
        }
    }
}

// Variável para armazenar os dados dos posts do Instagram
let instagramPostsData = {};

function createInstagramCard(news) {
    const dateObj = new Date(news.date);
    const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Usar likes e comments salvos com parse robusto
    const likes = pickBestInstagramCount(news.instagramLikes, news.likes, 0);
    const comments = pickBestInstagramCount(news.instagramComments, news.comments, 0);
    const instagramUrl = news.instagramUrl || news.sourceUrl || '#';
    const rawContent = news.content || news.excerpt || '';
    const content = cleanInstagramCaptionForDisplay(rawContent) || rawContent;
    const profileMeta = normalizeInstagramMeta({
        likes,
        comments,
        username: news.instagramUsername,
        displayName: news.instagramDisplayName,
        profileImage: news.instagramProfileImage,
        description: rawContent,
        title: news.title || ''
    }, instagramUrl);
    const profileName = sanitizeInstagramDisplayName(
        profileMeta.displayName || profileMeta.username || '',
        profileMeta.username || '',
        rawContent,
        instagramUrl
    ) || sanitizeInstagramHandle(news.instagramDisplayName || news.instagramUsername || '') || 'instagram';
    const fallbackAvatar = buildUiAvatarUrl(profileName);
    const profileImage =
        sanitizeInstagramProfileImage(profileMeta.profileImage) ||
        sanitizeInstagramProfileImage(news.instagramProfileImage || '') ||
        buildInstagramAvatarUrl(profileMeta.username || news.instagramUsername || profileName, profileName);
    const displayTitle = buildInstagramTitlePreview(news.title, content);
    
    // Verificar se tem galeria
    const hasGallery = news.gallery && Array.isArray(news.gallery) && news.gallery.length > 0;
    const totalMedia = hasGallery ? 1 + news.gallery.length : 1;
    
    // Guardar dados para uso no modal
    instagramPostsData[news.id] = {
        ...news,
        likes: profileMeta.likes,
        comments: profileMeta.comments,
        instagramUrl,
        content,
        dateStr,
        timeStr,
        hasGallery,
        totalMedia,
        instagramUsername: sanitizeInstagramHandle(profileMeta.username || news.instagramUsername || profileName),
        instagramDisplayName: profileName,
        instagramProfileImage: profileImage,
        instagramAvatarFallback: fallbackAvatar,
        title: displayTitle
    };
    
    return `
        <article class="instagram-card" data-instagram-id="${news.id}" onclick="openInstagramModal('${news.id}')">
            <!-- Imagem de Capa -->
            <div class="instagram-card-image-wrapper">
                <img src="${news.image}" alt="${news.title}" loading="lazy">
                ${hasGallery ? `
                    <div class="instagram-gallery-indicator">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        <span>${totalMedia}</span>
                    </div>
                ` : ''}
            </div>
            
            <!-- Conteúdo Compacto -->
            <div class="instagram-card-content">
                <!-- Header com avatar -->
                <div class="instagram-card-header">
                    <div class="instagram-card-avatar">
                        <img class="instagram-profile-img" data-id="${news.id}" src="${profileImage}" alt="${profileName}" onerror="this.onerror=null;this.src='${fallbackAvatar}'">
                    </div>
                    <div class="instagram-card-user">
                        <span class="instagram-card-username" data-id="${news.id}">${profileName}</span>
                        <svg class="instagram-card-verified" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                    </div>
                    <!-- Botão fechar (só aparece quando expandido) -->
                    <button class="instagram-card-close" style="display: none;" onclick="event.stopPropagation(); closeInstagramModal();">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                
                <!-- Título do post -->
                <div class="instagram-card-title-preview" style="font-size: 0.8125rem; color: #262626; line-height: 1.4; margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${displayTitle}
                </div>
                
                <!-- Legenda completa (só aparece quando expandido) -->
                <div class="instagram-card-caption-full" style="display: none;"></div>
                
                <!-- Ações com contadores -->
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
                <div class="instagram-card-time">${dateStr} às ${timeStr}</div>
            </div>
        </article>
    `;
}

// Expandir card no grid
let expandedCardId = null;

function openInstagramModal(newsId) {
    const post = instagramPostsData[newsId];
    if (!post) return;

    // Cada abertura do post conta como uma visualizacao
    void trackNewsView(newsId);
    
    // Se já tem um card expandido, fechar ele primeiro
    if (expandedCardId && expandedCardId !== newsId) {
        const currentExpanded = document.querySelector('.instagram-card.expanded');
        if (currentExpanded) {
            closeInstagramCard(currentExpanded);
        }
    }
    
    // Encontrar o card clicado
    const card = document.querySelector(`.instagram-card[data-instagram-id="${newsId}"]`);
    if (!card) return;
    
    // PRIMEIRO: Esconder o último card para liberar espaço no grid
    hideLastCard(newsId);
    
    // DEPOIS: Expandir o card (agora tem espaço para ocupar 2 colunas)
    card.classList.add('expanded');
    expandedCardId = newsId;
    
    // Adicionar botão fechar se não existir
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
    captionFull.textContent = post.content;
    captionFull.style.display = 'block';
    captionFull.style.visibility = 'visible';
    
    // Atualizar contadores de curtidas e comentários
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
    
    // CONFIGURAR GALERIA se houver múltiplas mídias
    setupInstagramGallery(card, post);
    
    // Scroll suave para o card
    setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

// Configurar galeria de imagens/vídeos no card expandido
function setupInstagramGallery(card, post) {
    const imageWrapper = card.querySelector('.instagram-card-image-wrapper');
    if (!imageWrapper) return;
    
    // Verificar se tem galeria
    const hasGallery = post.hasGallery && post.gallery && post.gallery.length > 0;
    
    // Montar array de todas as mídias (capa + galeria)
 const allMedia = [{ type: 'image', url: post.image }]; // Capa é sempre imagem
    if (hasGallery) {
        post.gallery.forEach(item => {
            allMedia.push({
                type: item.type || 'image',
                url: item.url
            });
        });
    }
    
    // Se só tem uma mídia, não precisa de navegação
    if (allMedia.length <= 1) {
        // Remover controles de galeria se existirem
        const existingControls = imageWrapper.querySelector('.instagram-gallery-controls');
        if (existingControls) existingControls.remove();
        const existingDots = imageWrapper.querySelector('.instagram-gallery-dots');
        if (existingDots) existingDots.remove();
        // Garantir que mostra a imagem de capa
        const img = imageWrapper.querySelector('img');
        if (img) {
            img.style.display = 'block';
            img.src = post.image;
        }
        const video = imageWrapper.querySelector('video');
        if (video) video.remove();
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
        
        // Mover a imagem atual para dentro do container
        const img = imageWrapper.querySelector('img');
        if (img) {
            img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; background: #f0f0f0;';
            galleryContainer.appendChild(img);
        }
        
        imageWrapper.appendChild(galleryContainer);
    }
    
    // Criar controles de navegação
    let controls = imageWrapper.querySelector('.instagram-gallery-controls');
    if (!controls) {
        controls = document.createElement('div');
        controls.className = 'instagram-gallery-controls';
        controls.innerHTML = `
            <button class="instagram-gallery-prev" onclick="event.stopPropagation(); navigateGallery('${post.id}', -1)">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
            </button>
            <button class="instagram-gallery-next" onclick="event.stopPropagation(); navigateGallery('${post.id}', 1)">
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
    
    // Mostrar primeira mídia
    showGalleryMedia(card, allMedia, 0);
}

// Navegar na galeria
function navigateGallery(newsId, direction) {
    const card = document.querySelector(`.instagram-card[data-instagram-id="${newsId}"]`);
    if (!card) return;
    
    const post = instagramPostsData[newsId];
    if (!post) return;
    
    // Montar array de mídias
    const allMedia = [{ type: 'image', url: post.image }];
    if (post.gallery && post.gallery.length > 0) {
        post.gallery.forEach(item => {
            allMedia.push({
                type: item.type || 'image',
                url: item.url
            });
        });
    }
    
    const total = allMedia.length;
    let currentIndex = parseInt(card.dataset.galleryIndex || '0');
    
    // Calcular novo índice
    currentIndex += direction;
    if (currentIndex < 0) currentIndex = total - 1;
    if (currentIndex >= total) currentIndex = 0;
    
    card.dataset.galleryIndex = currentIndex;
    showGalleryMedia(card, allMedia, currentIndex);
}

// Mostrar mídia específica da galeria
function showGalleryMedia(card, allMedia, index) {
    const galleryContainer = card.querySelector('.instagram-gallery-container');
    if (!galleryContainer) return;
    
    const media = allMedia[index];
    
    // Limpar container
    galleryContainer.innerHTML = '';
    
    // Criar elemento de mídia
    if (media.type === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        video.controls = true;
        video.style.cssText = 'width: 100%; height: 100%; object-fit: contain; background: #000;';
        galleryContainer.appendChild(video);
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
    
    // PRIMEIRO: Esconder botão fechar e elementos do expandido
    const closeBtn = card.querySelector('.instagram-card-close');
    if (closeBtn) closeBtn.style.display = 'none';
    
    // GARANTIR que legenda completa está totalmente escondida - ANTES de mostrar o card escondido
    const captionFull = card.querySelector('.instagram-card-caption-full');
    if (captionFull) {
        captionFull.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important;';
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
            // Recriar imagem de capa
            const img = document.createElement('img');
            img.src = post.image;
            img.alt = post.title || 'Post do Instagram';
            img.loading = 'lazy';
            imageWrapper.appendChild(img);
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
    
    // Mostrar preview novamente - FORÇAR com line-clamp
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
    showLastCard();
}

function hideLastCard(newsIdToKeep) {
    // Sempre esconder o último card visível para manter tudo na mesma fileira
    // (exceto o card que está sendo expandido e o "Ver Todos")
    const allCards = document.querySelectorAll('.instagram-card:not(.instagram-view-all-card)');
    
    // Encontrar o último card que não é o que será expandido
    for (let i = allCards.length - 1; i >= 0; i--) {
        const card = allCards[i];
        const cardId = card.dataset.instagramId;
        
        // Não esconder o card que está sendo expandido
        if (cardId === newsIdToKeep) continue;
        
        // Esconder este card
        card.style.display = 'none';
        card.dataset.wasHidden = 'true';
        break; // Esconde apenas um
    }
}

function showLastCard() {
    // Mostrar o card que foi escondido
    const hiddenCard = document.querySelector('.instagram-card[data-was-hidden="true"]');
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

// Função para compartilhar notícia
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
        console.error('Notícia não encontrada:', newsId);
        return;
    }
    
    const shareUrl = `${window.location.origin}/?news=${newsId}`;
    const shareData = {
        title: news.title || 'Mirador e Região Online',
        text: news.excerpt || news.content?.substring(0, 100) || 'Confira esta notícia',
        url: shareUrl
    };
    
    try {
        // Tentar usar a API de compartilhamento nativa (mobile)
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback: copiar para clipboard
            await navigator.clipboard.writeText(`${shareData.title}\n${shareData.url}`);
            showToast('Link copiado para a área de transferência!');
        }
    } catch (error) {
        // Usuário cancelou ou erro
        if (error.name !== 'AbortError') {
            console.error('Erro ao compartilhar:', error);
            // Tentar copiar como fallback
            try {
                await navigator.clipboard.writeText(shareUrl);
                showToast('Link copiado para a área de transferência!');
            } catch (clipboardError) {
                console.error('Erro ao copiar:', clipboardError);
            }
        }
    }
}

// Função para mostrar toast
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
    
    // Adicionar animação
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
    
    // Remover após 3 segundos
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Fechar com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeInstagramModal();
    }
});

// Formatar números (1.2K, 1.5M)
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

// Atualizar estatísticas no card
function updateInstagramCardStats(newsId, stats) {
    const likesEl = document.querySelector(`.instagram-likes-count[data-id="${newsId}"]`);
    const commentsEl = document.querySelector(`.instagram-comments-count[data-id="${newsId}"]`);
    const usernameEl = document.querySelector(`.instagram-card-username[data-id="${newsId}"]`);
    const profileImgEl = document.querySelector(`.instagram-profile-img[data-id="${newsId}"]`);
    
    const current = instagramPostsData[newsId] || {};
    const currentLikes = pickBestInstagramCount(current.likes, current.instagramLikes, current.rawLikes, 0);
    const currentComments = pickBestInstagramCount(current.comments, current.instagramComments, current.rawComments, 0);
    const incomingLikes = stats && stats.likes != null ? parseInstagramCount(stats.likes) : 0;
    const incomingComments = stats && stats.comments != null ? parseInstagramCount(stats.comments) : 0;
    const finalLikesValue = incomingLikes > 0 ? incomingLikes : currentLikes;
    const finalCommentsValue = incomingComments > 0 ? incomingComments : currentComments;

    if (likesEl) {
        likesEl.textContent = formatNumber(finalLikesValue);
    }
    if (commentsEl) {
        commentsEl.textContent = formatNumber(finalCommentsValue);
    }

    const safeStatsName = isGenericInstagramDisplayName(stats?.displayName) ? '' : (stats?.displayName || '');
    const safeStatsUsername = sanitizeInstagramHandle(stats?.username || '');
    const safeCurrentUsername = sanitizeInstagramHandle(current.instagramUsername || current.instagramDisplayName || '');
    const safeCurrentName = isGenericInstagramDisplayName(current.instagramDisplayName) ? '' : (current.instagramDisplayName || '');
    const mergedProfileImage =
        sanitizeInstagramProfileImage(stats?.profileImage || '') ||
        sanitizeInstagramProfileImage(current.instagramProfileImage || '');

    const normalized = normalizeInstagramMeta({
        ...stats,
        username: safeStatsUsername || safeCurrentUsername,
        displayName: safeStatsName || safeCurrentName || safeCurrentUsername,
        profileImage: mergedProfileImage,
        description: current.content || '',
        title: current.title || ''
    }, current.instagramUrl || '');

    const finalName = sanitizeInstagramDisplayName(
        normalized.displayName || normalized.username || '',
        normalized.username || '',
        current.content || '',
        current.instagramUrl || ''
    ) || safeCurrentName || safeCurrentUsername || 'instagram';
    const fallbackAvatar = buildUiAvatarUrl(finalName);
    const finalProfileImage =
        sanitizeInstagramProfileImage(normalized.profileImage) ||
        sanitizeInstagramProfileImage(current.instagramProfileImage || '') ||
        buildInstagramAvatarUrl(normalized.username || safeCurrentUsername || finalName, finalName);

    if (usernameEl) {
        usernameEl.textContent = finalName;
    }

    if (profileImgEl) {
        profileImgEl.src = finalProfileImage;
        profileImgEl.onerror = () => {
            profileImgEl.onerror = null;
            profileImgEl.src = fallbackAvatar;
        };
    }

    if (instagramPostsData[newsId]) {
        instagramPostsData[newsId] = {
            ...instagramPostsData[newsId],
            likes: finalLikesValue,
            comments: finalCommentsValue,
            instagramUsername: sanitizeInstagramHandle(normalized.username || safeCurrentUsername || instagramPostsData[newsId].instagramUsername),
            instagramDisplayName: finalName,
            instagramProfileImage: finalProfileImage
        };
    }
}

console.log('[App] v2.5 - Script finalizado');

