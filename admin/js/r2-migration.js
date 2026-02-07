/**
 * Script de Migração: Firebase Base64 → R2
 * Converte imagens em base64 do Firestore para o Cloudflare R2
 */

class R2Migration {
    constructor(r2Storage) {
        this.r2 = r2Storage;
        this.db = firebase.firestore();
        this.migrationStats = {
            total: 0,
            converted: 0,
            failed: 0,
            spaceSaved: 0
        };
    }

    /**
     * Converte base64 para Blob
     */
    base64ToBlob(base64String) {
        const arr = base64String.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        
        return new Blob([u8arr], { type: mime });
    }

    /**
     * Extrai extensão do MIME type
     */
    getExtensionFromMime(mimeType) {
        const extensions = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif'
        };
        return extensions[mimeType] || 'jpg';
    }

    /**
     * Processa uma única notícia
     */
    async processNewsItem(docId, data, onProgress) {
        const updates = {};
        let converted = false;

        try {
            // Processar imagem principal
            if (data.image && data.image.startsWith('data:')) {
                onProgress?.(`Processando imagem principal de "${data.title?.substring(0, 30) || docId}..."`);
                
                const mime = data.image.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                const extension = this.getExtensionFromMime(mime);
                const fileName = `noticias/${docId}-principal-${Date.now()}.${extension}`;
                
                // Converter base64 para File
                const blob = this.base64ToBlob(data.image);
                const file = new File([blob], fileName.split('/').pop(), { type: mime });
                
                // Upload para R2
                const result = await this.r2.uploadFile(file, 'noticias');
                
                // Calcular espaço economizado
                this.migrationStats.spaceSaved += data.image.length;
                
                // Preparar update
                updates.image = result.url;
                converted = true;
                
                onProgress?.(`✅ Imagem principal migrada: ${result.url.substring(0, 50)}...`);
            }

            // Processar galeria
            if (data.gallery && Array.isArray(data.gallery)) {
                const newGallery = [];
                
                for (let i = 0; i < data.gallery.length; i++) {
                    const item = data.gallery[i];
                    
                    if (item.url && item.url.startsWith('data:')) {
                        onProgress?.(`Processando galeria ${i + 1}/${data.gallery.length}...`);
                        
                        const mime = item.url.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                        const extension = this.getExtensionFromMime(mime);
                        const fileName = `noticias/${docId}-galeria-${i}-${Date.now()}.${extension}`;
                        
                        const blob = this.base64ToBlob(item.url);
                        const file = new File([blob], fileName.split('/').pop(), { type: mime });
                        
                        const result = await this.r2.uploadFile(file, 'noticias');
                        
                        this.migrationStats.spaceSaved += item.url.length;
                        
                        newGallery.push({
                            ...item,
                            url: result.url
                        });
                        converted = true;
                        
                        onProgress?.(`✅ Imagem ${i + 1} migrada`);
                    } else {
                        newGallery.push(item);
                    }
                }
                
                if (newGallery.length > 0) {
                    updates.gallery = newGallery;
                }
            }

            // Atualizar Firestore se houve conversão
            if (converted) {
                await this.db.collection('news').doc(docId).update(updates);
                this.migrationStats.converted++;
                onProgress?.(`✅ Notícia "${data.title?.substring(0, 30) || docId}..." atualizada no Firestore`);
            }

            return { success: true, converted, docId };

        } catch (error) {
            console.error(`[Migration] Erro ao processar ${docId}:`, error);
            this.migrationStats.failed++;
            return { success: false, error: error.message, docId };
        }
    }

    /**
     * Inicia a migração completa
     */
    async startMigration(onProgress, onComplete) {
        this.migrationStats = { total: 0, converted: 0, failed: 0, spaceSaved: 0 };
        
        try {
            onProgress?.('🚀 Iniciando migração...');
            
            // Buscar todas as notícias
            const snapshot = await this.db.collection('news').get();
            this.migrationStats.total = snapshot.size;
            
            onProgress?.(`📊 Encontradas ${snapshot.size} notícias`);
            
            let processed = 0;
            
            // Processar cada notícia
            for (const doc of snapshot.docs) {
                const data = doc.data();
                processed++;
                
                onProgress?.(`\n📰 Processando ${processed}/${snapshot.size}: ${data.title?.substring(0, 40) || doc.id}...`);
                
                await this.processNewsItem(doc.id, data, onProgress);
            }
            
            // Calcular espaço economizado em MB
            const spaceSavedMB = (this.migrationStats.spaceSaved / (1024 * 1024)).toFixed(2);
            
            onProgress?.(`\n✅ Migração concluída!`);
            onProgress?.(`📊 Resumo:`);
            onProgress?.(`   - Total: ${this.migrationStats.total}`);
            onProgress?.(`   - Convertidas: ${this.migrationStats.converted}`);
            onProgress?.(`   - Falhas: ${this.migrationStats.failed}`);
            onProgress?.(`   - Espaço economizado: ~${spaceSavedMB} MB`);
            
            onComplete?.({
                success: true,
                stats: { ...this.migrationStats, spaceSavedMB }
            });
            
        } catch (error) {
            console.error('[Migration] Erro:', error);
            onProgress?.(`\n❌ Erro na migração: ${error.message}`);
            onComplete?.({ success: false, error: error.message });
        }
    }

    /**
     * Verifica se existem imagens em base64 no Firestore
     */
    async checkBase64Images() {
        const snapshot = await this.db.collection('news').get();
        const base64Items = [];
        let totalBase64Size = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Verificar imagem principal
            if (data.image && data.image.startsWith('data:')) {
                base64Items.push({
                    id: doc.id,
                    title: data.title,
                    type: 'principal',
                    size: data.image.length
                });
                totalBase64Size += data.image.length;
            }
            
            // Verificar galeria
            if (data.gallery && Array.isArray(data.gallery)) {
                data.gallery.forEach((item, index) => {
                    if (item.url && item.url.startsWith('data:')) {
                        base64Items.push({
                            id: doc.id,
                            title: data.title,
                            type: `galeria-${index}`,
                            size: item.url.length
                        });
                        totalBase64Size += item.url.length;
                    }
                });
            }
        });

        return {
            count: base64Items.length,
            items: base64Items,
            totalSize: totalBase64Size,
            totalSizeMB: (totalBase64Size / (1024 * 1024)).toFixed(2)
        };
    }
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { R2Migration };
}
