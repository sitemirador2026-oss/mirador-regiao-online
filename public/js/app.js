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
                <div class="news-card-source">
                    <img src="${sourceLogo}" alt="${sourceDomain}" ${!isExternal && getSiteLogo() ? 'style="width: auto; max-width: 80px; height: 16px; object-fit: contain;"' : ''}>
                    ${isExternal ? `<span class="news-card-source-name">${sourceDomain}</span>` : ''}
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
                    <div class="news-card-horizontal-source">
                        <img src="${sourceLogo}" alt="${sourceDomain}" ${!isExternal && getSiteLogo() ? 'style="width: auto; max-width: 50px; height: 12px;"' : ''}>
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
        
        // Mostrar apenas os 4 mais recentes inicialmente
        const newsToShow = showingAllInstagram ? news : news.slice(0, 4);
        
        let html = newsToShow.map(createInstagramCard).join('');
        
        // Adicionar botão "Ver Todos" se houver mais de 4 posts
        if (news.length > 4 && !showingAllInstagram) {
            html += `
                <div class="instagram-card instagram-view-all-card" onclick="toggleInstagramViewAll()">
                    <div style="aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);">
                        <div style="text-align: center; color: white;">
                            <svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24" style="margin-bottom: 0.5rem;">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                                <path d="M12 6c-3.313 0-6 2.687-6 6s2.687 6 6 6 6-2.687 6-6-2.687-6-6-6zm0 10c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z"/>
                            </svg>
                            <div style="font-size: 1rem; font-weight: 600;">Ver Todos</div>
                            <div style="font-size: 0.875rem; opacity: 0.9;">+${news.length - 4} posts</div>
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

// Toggle entre mostrar 4 ou todos
function toggleInstagramViewAll() {
    showingAllInstagram = !showingAllInstagram;
    loadInstagramNews();
}

// Atualizar estatísticas do Instagram (curtidas e comentários)
async function updateInstagramStats(newsItems) {
    for (const news of newsItems) {
        if (news.instagramUrl) {
            try {
                const stats = await fetchInstagramStats(news.instagramUrl);
                if (stats) {
                    updateInstagramCardStats(news.id, stats);
                }
            } catch (e) {
                console.log('[App] Erro ao buscar stats do Instagram:', e);
            }
        }
    }
}

// Buscar estatísticas do Instagram via API
async function fetchInstagramStats(instagramUrl) {
    try {
        // Tentar extrair usando Microlink API (gratuita)
        const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(instagramUrl)}`);
        const data = await response.json();
        
        if (data.status === 'success' && data.data) {
            // Tentar extrair likes e comments dos dados
            // Nota: A API pode não retornar sempre esses dados
            return {
                likes: data.data.likes || data.data.like_count || null,
                comments: data.data.comments || data.data.comment_count || null
            };
        }
    } catch (e) {
        console.log('[App] Microlink falhou, tentando fallback...');
    }
    
    // Se tiver dados salvos no Firebase, usar eles
    return null;
}

function createInstagramCard(news) {
    const dateObj = new Date(news.date);
    const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    
    // Usar likes e comments salvos ou padrão
    const likes = news.instagramLikes || news.likes || 0;
    const comments = news.instagramComments || news.comments || 0;
    const instagramUrl = news.instagramUrl || news.sourceUrl || '#';
    
    return `
        <article class="instagram-card" data-instagram-id="${news.id}">
            <!-- Imagem -->
            <div class="instagram-card-image-wrapper" onclick="viewNews('${news.id}')">
                <img src="${news.image}" alt="${news.title}" loading="lazy">
            </div>
            
            <!-- Conteúdo Compacto -->
            <div class="instagram-card-content">
                <!-- Header com avatar -->
                <div class="instagram-card-header">
                    <div class="instagram-card-avatar">
                        <img src="https://ui-avatars.com/api/?name=Mirador&background=E4405F&color=fff" alt="Avatar">
                    </div>
                    <div>
                        <span class="instagram-card-username">miradoronline</span>
                        <svg class="instagram-card-verified" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                    </div>
                </div>
                
                <!-- Título do post -->
                <div style="font-size: 0.8125rem; color: #262626; line-height: 1.4; margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${news.title || 'Post do Instagram'}
                </div>
                
                <!-- Ações com contadores -->
                <div class="instagram-card-actions">
                    <div class="instagram-card-actions-left">
                        <button class="instagram-card-action-btn" onclick="event.stopPropagation(); window.open('${instagramUrl}', '_blank')">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                            </svg>
                            <span class="instagram-likes-count" data-id="${news.id}">${formatNumber(likes)}</span>
                        </button>
                        <button class="instagram-card-action-btn" onclick="event.stopPropagation(); window.open('${instagramUrl}', '_blank')">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                            </svg>
                            <span class="instagram-comments-count" data-id="${news.id}">${formatNumber(comments)}</span>
                        </button>
                    </div>
                    <button class="instagram-card-action-btn" onclick="event.stopPropagation(); window.open('${instagramUrl}', '_blank')">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                    </button>
                </div>
                
                <!-- Data -->
                <div class="instagram-card-time">${dateStr}</div>
            </div>
        </article>
    `;
}

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
    
    if (likesEl && stats.likes) {
        likesEl.textContent = formatNumber(stats.likes);
    }
    if (commentsEl && stats.comments) {
        commentsEl.textContent = formatNumber(stats.comments);
    }
}

console.log('[App] v2.5 - Script finalizado');

