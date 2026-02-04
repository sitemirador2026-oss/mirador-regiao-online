// Dados de exemplo (serão salvos no Firebase)
const sampleNews = [
    {
        id: '1',
        title: "Prefeitura anuncia obras de infraestrutura em Mirador",
        excerpt: "Novas obras prometem melhorar a qualidade de vida dos moradores da cidade.",
        category: "mirador",
        categoryName: "Mirador",
        image: "https://via.placeholder.com/800x400/2563eb/ffffff?text=Mirador",
        date: "2026-02-03",
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
        date: "2026-02-03",
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
        date: "2026-02-02",
        author: "Redação",
        featured: false
    },
    {
        id: '4',
        title: "Polícia prende suspeitos de assalto na região",
        excerpt: "Operação policial resulta na prisão de três pessoas.",
        category: "policia",
        categoryName: "Polícia",
        image: "https://via.placeholder.com/800x400/7c3aed/ffffff?text=Polícia",
        date: "2026-02-02",
        author: "Redação",
        featured: false
    },
    {
        id: '5',
        title: "Time local conquista campeonato regional",
        excerpt: "Vitória histórica marca temporada do clube.",
        category: "esportes",
        categoryName: "Esportes",
        image: "https://via.placeholder.com/800x400/ea580c/ffffff?text=Esportes",
        date: "2026-02-01",
        author: "Redação",
        featured: false
    },
    {
        id: '6',
        title: "Câmara aprova novo projeto de lei municipal",
        excerpt: "Projeto visa melhorar serviços públicos na cidade.",
        category: "politica",
        categoryName: "Política",
        image: "https://via.placeholder.com/800x400/0891b2/ffffff?text=Política",
        date: "2026-02-01",
        author: "Redação",
        featured: false
    }
];

// Inicializar dados de exemplo no Firebase (apenas se não existir)
async function initializeData() {
    try {
        const snapshot = await db.collection('news').limit(1).get();

        // Se não houver notícias, adicionar dados de exemplo
        if (snapshot.empty) {
            console.log('[App] Adicionando dados de exemplo ao Firebase...');
            const batch = db.batch();

            sampleNews.forEach(news => {
                const newsRef = db.collection('news').doc(news.id);
                batch.set(newsRef, {
                    ...news,
                    views: 0,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();
            console.log('[App] Dados de exemplo adicionados!');
        }
    } catch (error) {
        console.error('[App] Erro ao inicializar dados:', error);
    }
}

// Carregar notícias do Firebase
async function loadNews() {
    return await loadNewsFromFirebase();
}

// Formatar data
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

// Criar card de notícia
function createNewsCard(news) {
    return `
        <article class="news-card" onclick="viewNews('${news.id}')">
            <img src="${news.image}" alt="${news.title}" class="news-card-image">
            <div class="news-card-content">
                <span class="news-card-category">${news.categoryName}</span>
                <h3 class="news-card-title">${news.title}</h3>
                <p class="news-card-excerpt">${news.excerpt}</p>
                <div class="news-card-meta">
                    <span>${formatDate(news.date)}</span>
                    <span>Por ${news.author}</span>
                </div>
            </div>
        </article>
    `;
}

// Renderizar notícias em destaque
async function renderFeaturedNews() {
    const news = await loadNews();
    const featured = news.filter(n => n.featured);
    const container = document.getElementById('featuredNews');

    if (featured.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma notícia em destaque.</div>';
        return;
    }

    container.innerHTML = featured.map(createNewsCard).join('');
}

// Renderizar últimas notícias
async function renderLatestNews() {
    const news = await loadNews();
    const latest = news.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
    const container = document.getElementById('latestNews');

    if (latest.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma notícia encontrada.</div>';
        return;
    }

    container.innerHTML = latest.map(createNewsCard).join('');
}

// Filtrar por categoria
async function filterByCategory(category) {
    const news = await loadNews();
    const filtered = news.filter(n => n.category === category);
    const container = document.getElementById('latestNews');

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma notícia nesta categoria.</div>';
        return;
    }

    container.innerHTML = filtered.map(createNewsCard).join('');

    // Scroll suave para as notícias
    container.scrollIntoView({ behavior: 'smooth' });
}

// Ver detalhes da notícia
function viewNews(id) {
    // Salvar ID da notícia no localStorage e redirecionar
    localStorage.setItem('currentNewsId', id);
    window.location.href = 'noticia.html';
}

// Busca de notícias
async function searchNews(query) {
    const news = await loadNews();
    const results = news.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.excerpt.toLowerCase().includes(query.toLowerCase())
    );

    const resultsContainer = document.getElementById('searchResults');

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state">Nenhum resultado encontrado.</div>';
        return;
    }

    resultsContainer.innerHTML = results.map(createNewsCard).join('');
}

// Modal de busca
function toggleSearchModal() {
    const modal = document.getElementById('searchModal');
    modal.classList.toggle('active');

    if (modal.classList.contains('active')) {
        document.getElementById('searchInput').focus();
    }
}

// Menu mobile
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    menu.classList.toggle('active');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async function () {
    console.log('[App] DOM carregado, iniciando aplicação...');
    
    // Verificar se as funções do Firebase estão disponíveis
    console.log('[App] Verificando funções:', {
        applyFirebaseColors: typeof window.applyFirebaseColors,
        applyFirebaseBrand: typeof window.applyFirebaseBrand
    });
    
    try {
        // Aplicar cores e marca do Firebase
        console.log('[App] Aplicando cores do Firebase...');
        const coresResult = await applyFirebaseColors();
        console.log('[App] Resultado cores:', coresResult);
        
        console.log('[App] Aplicando marca do Firebase...');
        const marcaResult = await applyFirebaseBrand();
        console.log('[App] Resultado marca:', marcaResult);
    } catch (error) {
        console.error('[App] ERRO ao aplicar configurações:', error);
    }

    // Inicializar dados
    await initializeData();

    // Renderizar notícias
    await renderFeaturedNews();
    await renderLatestNews();

    // Botão de busca
    document.querySelector('.btn-search').addEventListener('click', toggleSearchModal);

    // Fechar modal de busca
    document.querySelector('.search-close').addEventListener('click', toggleSearchModal);

    // Busca em tempo real
    document.getElementById('searchInput').addEventListener('input', function (e) {
        const query = e.target.value;
        if (query.length >= 2) {
            searchNews(query);
        } else {
            document.getElementById('searchResults').innerHTML = '';
        }
    });

    // Fechar modal ao clicar fora
    document.getElementById('searchModal').addEventListener('click', function (e) {
        if (e.target === this) {
            toggleSearchModal();
        }
    });

    // Menu mobile
    document.querySelector('.btn-menu-mobile').addEventListener('click', toggleMobileMenu);
    document.querySelector('.mobile-menu-close').addEventListener('click', toggleMobileMenu);

    // Links de categoria (desktop e mobile)
    document.querySelectorAll('[data-category]').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const category = this.getAttribute('data-category');
            filterByCategory(category);

            // Fechar menu mobile se estiver aberto
            const mobileMenu = document.getElementById('mobileMenu');
            if (mobileMenu.classList.contains('active')) {
                toggleMobileMenu();
            }
        });
    });

    // Fechar menu mobile ao clicar fora
    document.addEventListener('click', function (e) {
        const menu = document.getElementById('mobileMenu');
        const btnMenu = document.querySelector('.btn-menu-mobile');

        if (!menu.contains(e.target) && !btnMenu.contains(e.target)) {
            menu.classList.remove('active');
        }
    });
    
    console.log('[App] Aplicação inicializada!');
});
