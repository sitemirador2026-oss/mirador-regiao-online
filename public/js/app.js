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
        
        // Últimas notícias - padrão: 2 normais + 1 especial + 2 normais + 1 especial
        const latest = news.sort((a, b) => new Date(b.date) - new Date(a.date));
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
    
    // Fechar menu ao clicar fora
    document.addEventListener('click', function(e) {
        const menu = document.getElementById('mobileMenu');
        const btn = document.querySelector('.btn-menu-mobile');
        if (menu && !menu.contains(e.target) && !btn?.contains(e.target)) {
            menu.classList.remove('active');
        }
    });
    
    console.log('[App] v2.5 - Pronto!');
});

console.log('[App] v2.5 - Script finalizado');

