/**
 * Cloudflare R2 Upload - Método Alternativo usando Fetch API
 * Evita problemas de CORS usando o endpoint público
 */

class R2SimpleStorage {
    constructor(publicUrl) {
        this.publicUrl = publicUrl || 'https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev';
        this.uploadEndpoint = 'https://8341826f08014d0252c400798d657729.r2.cloudflarestorage.com/mirador-regiao-online';
    }

    /**
     * Faz upload direto via fetch (evita CORS para leitura)
     * Para upload, precisamos de um backend ou usar presigned URLs
     */
    async uploadWithPresigned(file, folder = 'noticias') {
        const key = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${file.name.split('.').pop()}`;
        
        // Nota: Para upload direto do frontend, precisamos de um backend
        // para gerar presigned URLs, ou usar um worker do Cloudflare
        
        throw new Error('Upload direto requer backend. Use o método tradicional ou implemente um Worker.');
    }

    /**
     * Converte base64 para File
     */
    base64ToFile(base64String, filename) {
        const arr = base64String.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        
        return new File([u8arr], filename, { type: mime });
    }

    /**
     * Gera URL pública para um arquivo
     */
    getPublicUrl(key) {
        return `${this.publicUrl}/${key}`;
    }
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { R2SimpleStorage };
}
