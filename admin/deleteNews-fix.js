// Deletar noticia (versao com limpeza de midia no R2)
async function deleteNews(id) {
    if (!confirm('Tem certeza que deseja excluir esta noticia?')) return;

    const extractR2Key = (url) => {
        if (typeof url !== 'string') return '';
        const clean = url.trim();
        if (!clean || clean.startsWith('data:')) return '';
        try {
            const parsed = new URL(clean);
            if (!parsed.hostname.toLowerCase().endsWith('.r2.dev')) return '';
            return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
        } catch (_error) {
            return '';
        }
    };

    try {
        const docRef = db.collection('news').doc(id);
        const docSnapshot = await docRef.get();
        const newsData = docSnapshot.exists ? (docSnapshot.data() || {}) : {};

        const urls = [];
        if (typeof newsData.image === 'string') urls.push(newsData.image);
        if (typeof newsData.instagramVideoUrl === 'string') urls.push(newsData.instagramVideoUrl);
        if (Array.isArray(newsData.gallery)) {
            newsData.gallery.forEach(item => {
                if (item && typeof item.url === 'string') urls.push(item.url);
            });
        }

        const keys = Array.from(new Set(urls.map(extractR2Key).filter(Boolean)));

        await docRef.delete();

        if (typeof r2Client !== 'undefined' && r2Client && keys.length > 0) {
            await Promise.allSettled(keys.map(key => r2Client.deleteFile(key)));
        }

        alert('Noticia excluida com sucesso!');
        loadDashboard();
    } catch (error) {
        console.error('Erro ao excluir noticia:', error);
        alert('Erro ao excluir noticia!');
    }
}
