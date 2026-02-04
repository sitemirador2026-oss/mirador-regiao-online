// Funções do banco de dados Firebase para o site público

console.log('[Firebase DB] Script carregado');

// Testar conexão com Firebase
async function testFirebaseConnection() {
    console.log('[Firebase DB] Testando conexão...');
    try {
        // Tentar ler um documento de teste
        const testDoc = await db.collection('settings').doc('test').get();
        console.log('[Firebase DB] Conexão OK - permissões de leitura funcionando');
        return true;
    } catch (error) {
        console.error('[Firebase DB] ERRO de conexão:', error.code, error.message);
        if (error.code === 'permission-denied') {
            console.error('[Firebase DB] PERMISSÃO NEGADA - Verifique as regras de segurança do Firebase');
        }
        return false;
    }
}

// Carregar todas as notícias
async function loadNewsFromFirebase() {
    try {
        const snapshot = await db.collection('news')
            .orderBy('date', 'desc')
            .get();

        const news = [];
        snapshot.forEach(doc => {
            news.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return news;
    } catch (error) {
        console.error('[Firebase DB] Erro ao carregar notícias:', error);
        return [];
    }
}

// Carregar uma notícia específica
async function loadNewsById(id) {
    try {
        const doc = await db.collection('news').doc(id).get();

        if (doc.exists) {
            return {
                id: doc.id,
                ...doc.data()
            };
        }
        return null;
    } catch (error) {
        console.error('[Firebase DB] Erro ao carregar notícia:', error);
        return null;
    }
}

// Carregar configurações de cores do Firebase
async function loadColorsFromFirebase() {
    console.log('[Firebase DB] Carregando cores do Firebase...');
    try {
        const doc = await db.collection('settings').doc('colors').get();
        
        if (doc.exists) {
            console.log('[Firebase DB] Cores encontradas:', doc.data());
            return doc.data();
        } else {
            console.log('[Firebase DB] Documento de cores não existe no Firebase');
            return null;
        }
    } catch (error) {
        console.error('[Firebase DB] ERRO ao carregar cores:', error.code, error.message);
        return null;
    }
}

// Carregar configurações da marca do Firebase
async function loadBrandFromFirebase() {
    console.log('[Firebase DB] Carregando marca do Firebase...');
    try {
        const doc = await db.collection('settings').doc('brand').get();
        
        if (doc.exists) {
            console.log('[Firebase DB] Marca encontrada:', doc.data());
            return doc.data();
        } else {
            console.log('[Firebase DB] Documento de marca não existe no Firebase');
            return null;
        }
    } catch (error) {
        console.error('[Firebase DB] ERRO ao carregar marca:', error.code, error.message);
        return null;
    }
}

// Aplicar cores do Firebase ao site
async function applyFirebaseColors() {
    console.log('[Aplicar Cores] Iniciando...');
    
    let colors = null;
    let source = '';
    
    // Tentar carregar do Firebase
    try {
        colors = await loadColorsFromFirebase();
        if (colors) {
            source = 'firebase';
            // Salvar no localStorage para fallback
            localStorage.setItem('publicSiteColors', JSON.stringify(colors));
            console.log('[Aplicar Cores] Cores salvas no localStorage');
        }
    } catch (error) {
        console.error('[Aplicar Cores] Erro ao carregar do Firebase:', error);
    }
    
    // Fallback para localStorage
    if (!colors) {
        console.log('[Aplicar Cores] Tentando localStorage...');
        const savedColors = localStorage.getItem('publicSiteColors');
        if (savedColors) {
            try {
                colors = JSON.parse(savedColors);
                source = 'localStorage';
                console.log('[Aplicar Cores] Cores carregadas do localStorage:', colors);
            } catch (e) {
                console.error('[Aplicar Cores] Erro ao parsear localStorage:', e);
            }
        }
    }
    
    if (!colors) {
        console.log('[Aplicar Cores] Nenhuma cor encontrada, usando padrão');
        return false;
    }
    
    console.log('[Aplicar Cores] Aplicando de:', source);
    
    // Aplicar as cores
    const root = document.documentElement;
    let count = 0;
    
    if (colors.Primary) {
        root.style.setProperty('--primary', colors.Primary);
        console.log('[Aplicar Cores] --primary =', colors.Primary);
        count++;
    }
    if (colors.Secondary) {
        root.style.setProperty('--secondary', colors.Secondary);
        count++;
    }
    if (colors.Accent) {
        root.style.setProperty('--accent', colors.Accent);
        count++;
    }
    if (colors.Background) {
        root.style.setProperty('--background', colors.Background);
        count++;
    }
    if (colors.Foreground) {
        root.style.setProperty('--foreground', colors.Foreground);
        count++;
    }
    if (colors.Muted) {
        root.style.setProperty('--muted', colors.Muted);
        count++;
    }
    if (colors.MutedForeground) {
        root.style.setProperty('--muted-foreground', colors.MutedForeground);
        count++;
    }
    
    console.log('[Aplicar Cores]', count, 'cores aplicadas de', source);
    return true;
}

// Aplicar marca do Firebase ao site
async function applyFirebaseBrand() {
    console.log('[Aplicar Marca] Iniciando...');
    
    let brand = null;
    let source = '';
    
    // Tentar carregar do Firebase
    try {
        brand = await loadBrandFromFirebase();
        if (brand) {
            source = 'firebase';
            // Salvar no localStorage para fallback
            localStorage.setItem('publicSiteBrand', JSON.stringify(brand));
            console.log('[Aplicar Marca] Marca salva no localStorage');
        }
    } catch (error) {
        console.error('[Aplicar Marca] Erro ao carregar do Firebase:', error);
    }
    
    // Fallback para localStorage
    if (!brand) {
        console.log('[Aplicar Marca] Tentando localStorage...');
        const savedBrand = localStorage.getItem('publicSiteBrand');
        if (savedBrand) {
            try {
                brand = JSON.parse(savedBrand);
                source = 'localStorage';
                console.log('[Aplicar Marca] Marca carregada do localStorage:', brand);
            } catch (e) {
                console.error('[Aplicar Marca] Erro ao parsear localStorage:', e);
            }
        }
    }
    
    if (!brand) {
        console.log('[Aplicar Marca] Nenhuma marca encontrada, usando padrão');
        return false;
    }
    
    console.log('[Aplicar Marca] Aplicando de:', source, brand);
    
    // Aplicar nome do site
    if (brand.siteName) {
        document.title = brand.siteName;
        const titleEl = document.getElementById('siteTitle');
        if (titleEl) {
            titleEl.textContent = brand.siteName;
            console.log('[Aplicar Marca] Título:', brand.siteName);
        }
    }
    
    // Aplicar logo
    const logoImg = document.getElementById('siteLogoImg');
    const logoText = document.getElementById('siteLogoText');
    
    if (brand.logo && logoImg) {
        console.log('[Aplicar Marca] Aplicando logo...');
        logoImg.src = brand.logo;
        logoImg.style.display = 'block';
        logoImg.alt = brand.siteName || 'Logo';
        if (logoText) logoText.style.display = 'none';
        console.log('[Aplicar Marca] Logo aplicada!');
    } else if (brand.siteName && logoText) {
        console.log('[Aplicar Marca] Aplicando texto:', brand.siteName);
        logoText.textContent = brand.siteName;
        logoText.style.display = 'block';
        if (logoImg) logoImg.style.display = 'none';
    }
    
    // Footer
    const footerSiteName = document.getElementById('footerSiteName');
    if (footerSiteName && brand.siteName) {
        footerSiteName.textContent = brand.siteName;
    }
    
    console.log('[Aplicar Marca] Marca aplicada com sucesso de', source);
    return true;
}

// Incrementar visualizações
async function incrementViews(newsId) {
    try {
        const newsRef = db.collection('news').doc(newsId);
        await newsRef.update({
            views: firebase.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error('[Firebase DB] Erro ao incrementar visualizações:', error);
    }
}

// Função para forçar aplicação de configurações (para teste)
function forceApplySettings() {
    console.log('[FORCE] Aplicando configurações manualmente...');
    applyFirebaseColors();
    applyFirebaseBrand();
}

// Função para verificar o localStorage
function checkLocalStorage() {
    console.log('[DEBUG] Verificando localStorage...');
    const colors = localStorage.getItem('publicSiteColors');
    const brand = localStorage.getItem('publicSiteBrand');
    
    console.log('[DEBUG] Cores:', colors ? JSON.parse(colors) : 'Não encontrado');
    console.log('[DEBUG] Marca:', brand ? JSON.parse(brand) : 'Não encontrado');
    
    return { colors: colors ? JSON.parse(colors) : null, brand: brand ? JSON.parse(brand) : null };
}

// Função para limpar cache
function clearSettingsCache() {
    localStorage.removeItem('publicSiteColors');
    localStorage.removeItem('publicSiteBrand');
    console.log('[DEBUG] Cache limpo!');
}

// Exportar funções para teste
window.testFirebaseConnection = testFirebaseConnection;
window.loadColorsFromFirebase = loadColorsFromFirebase;
window.loadBrandFromFirebase = loadBrandFromFirebase;
window.forceApplySettings = forceApplySettings;
window.checkLocalStorage = checkLocalStorage;
window.clearSettingsCache = clearSettingsCache;

console.log('[Firebase DB] Script finalizado');
console.log('[Firebase DB] Funções disponíveis no console:');
console.log('  - testFirebaseConnection() - Testar conexão com Firebase');
console.log('  - loadColorsFromFirebase() - Carregar cores do Firebase');
console.log('  - loadBrandFromFirebase() - Carregar marca do Firebase');
console.log('  - forceApplySettings() - Forçar aplicação das configurações');
console.log('  - checkLocalStorage() - Verificar localStorage');
console.log('  - clearSettingsCache() - Limpar cache local');
