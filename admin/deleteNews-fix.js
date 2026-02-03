// Deletar notícia
async function deleteNews(id) {
    if (!confirm('Tem certeza que deseja excluir esta notícia?')) return;

    try {
        await db.collection('news').doc(id).delete();
        alert('✅ Notícia excluída com sucesso!');
        loadDashboard();
    } catch (error) {
        console.error('Erro ao excluir notícia:', error);
        alert('❌ Erro ao excluir notícia!');
    }
}
