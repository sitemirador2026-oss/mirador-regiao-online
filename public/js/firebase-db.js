// Funções do banco de dados Firebase para o site público

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
        console.error('Erro ao carregar notícias:', error);
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
        console.error('Erro ao carregar notícia:', error);
        return null;
    }
}

// Carregar configurações de cores
async function loadColorsFromFirebase() {
    try {
        const doc = await db.collection('settings').doc('colors').get();

        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error('Erro ao carregar cores:', error);
        return null;
    }
}

// Carregar configurações da marca
async function loadBrandFromFirebase() {
    try {
        const doc = await db.collection('settings').doc('brand').get();

        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error('Erro ao carregar marca:', error);
        return null;
    }
}

// Aplicar cores do Firebase ao site
async function applyFirebaseColors() {
    console.log('Carregando cores do Firebase...');
    const colors = await loadColorsFromFirebase();

    if (colors) {
        const root = document.documentElement;

        if (colors.Primary) {
            root.style.setProperty('--primary', colors.Primary);
            console.log('Cor primária aplicada:', colors.Primary);
        }
        if (colors.Secondary) root.style.setProperty('--secondary', colors.Secondary);
        if (colors.Accent) root.style.setProperty('--accent', colors.Accent);
        if (colors.Background) root.style.setProperty('--background', colors.Background);
        if (colors.Foreground) root.style.setProperty('--foreground', colors.Foreground);
        if (colors.Muted) root.style.setProperty('--muted', colors.Muted);
        if (colors.MutedForeground) root.style.setProperty('--muted-foreground', colors.MutedForeground);

        console.log('Cores aplicadas do Firebase!', colors);
    } else {
        console.log('Nenhuma cor encontrada no Firebase - usando cores padrão');
    }
}

// Aplicar marca do Firebase ao site
async function applyFirebaseBrand() {
    console.log('Carregando marca do Firebase...');
    const brand = await loadBrandFromFirebase();

    if (brand) {
        console.log('Marca encontrada:', brand);
        
        // Aplicar nome do site
        if (brand.siteName) {
            document.title = brand.siteName;
            const titleEl = document.getElementById('siteTitle');
            if (titleEl) titleEl.textContent = brand.siteName;
        }

        // Aplicar logo ou texto
        const logoImg = document.getElementById('siteLogoImg');
        const logoText = document.getElementById('siteLogoText');

        if (brand.logo && logoImg) {
            // Mostrar logo
            console.log('Aplicando logo:', brand.logo);
            logoImg.src = brand.logo;
            logoImg.style.display = 'block';
            logoImg.alt = brand.siteName || 'Logo';
            if (logoText) logoText.style.display = 'none';
        } else if (logoText && brand.siteName) {
            // Mostrar texto
            console.log('Aplicando nome como texto:', brand.siteName);
            logoText.textContent = brand.siteName;
            logoText.style.display = 'block';
            if (logoImg) logoImg.style.display = 'none';
        }

        // Aplicar no footer
        const footerSiteName = document.getElementById('footerSiteName');
        if (footerSiteName && brand.siteName) {
            footerSiteName.textContent = brand.siteName;
        }

        console.log('Marca aplicada com sucesso!');
    } else {
        console.log('Nenhuma marca encontrada no Firebase - usando padrão');
    }
}

// Incrementar visualizações
async function incrementViews(newsId) {
    try {
        const newsRef = db.collection('news').doc(newsId);
        await newsRef.update({
            views: firebase.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error('Erro ao incrementar visualizações:', error);
    }
}
