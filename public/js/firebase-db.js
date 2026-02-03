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

// Aplicar cores do Firebase ao site
async function applyFirebaseColors() {
    const colors = await loadColorsFromFirebase();

    if (colors) {
        const root = document.documentElement;

        if (colors.Primary) root.style.setProperty('--primary', colors.Primary);
        if (colors.Secondary) root.style.setProperty('--secondary', colors.Secondary);
        if (colors.Background) root.style.setProperty('--background', colors.Background);
        if (colors.Foreground) root.style.setProperty('--foreground', colors.Foreground);
        if (colors.Muted) root.style.setProperty('--muted', colors.Muted);
        if (colors.MutedForeground) root.style.setProperty('--muted-foreground', colors.MutedForeground);
        if (colors.Border) root.style.setProperty('--border', colors.Border);

        console.log('Cores aplicadas do Firebase!');
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
