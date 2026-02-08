/**
 * R2 Client - Frontend
 * Envia arquivos para o Cloudflare Worker que faz upload pro R2
 */

class R2Client {
    constructor() {
        // URL do Cloudflare Worker (configure após o deploy)
        this.baseUrl = 'https://mirador-r2-worker.seu-subdominio.workers.dev';
        // ou use variável de ambiente/configuração
    }

    /**
     * Upload de arquivo
     * @param {File} file - Arquivo a ser enviado
     * @param {string} folder - Pasta de destino
     * @param {Function} onProgress - Callback de progresso
     */
    async uploadFile(file, folder = 'noticias', onProgress = null) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);

        try {
            if (onProgress) onProgress(10);

            const response = await fetch(`${this.baseUrl}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (onProgress) onProgress(90);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Erro no upload');
            }

            const result = await response.json();
            
            if (onProgress) onProgress(100);

            return {
                url: result.url,
                key: result.key,
                size: result.size,
                type: result.type
            };

        } catch (error) {
            console.error('[R2Client] Erro no upload:', error);
            throw error;
        }
    }

    /**
     * Listar arquivos
     */
    async listFiles(prefix = '') {
        try {
            const response = await fetch(`${this.baseUrl}/api/files?prefix=${prefix}`);
            
            if (!response.ok) {
                throw new Error('Erro ao listar arquivos');
            }

            const result = await response.json();
            return result;

        } catch (error) {
            console.error('[R2Client] Erro ao listar:', error);
            throw error;
        }
    }

    /**
     * Deletar arquivo
     */
    async deleteFile(key) {
        try {
            const response = await fetch(`${this.baseUrl}/api/files/${encodeURIComponent(key)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Erro ao deletar');
            }

            return await response.json();

        } catch (error) {
            console.error('[R2Client] Erro ao deletar:', error);
            throw error;
        }
    }

    /**
     * Testar conexão
     */
    async testConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Obter uso de storage
     */
    async getStorageUsage() {
        try {
            const result = await this.listFiles();
            const totalSize = result.files.reduce((sum, f) => sum + f.size, 0);
            
            return {
                total: totalSize,
                files: result.files.length,
                formatted: this.formatBytes(totalSize)
            };
        } catch (error) {
            return { total: 0, files: 0, formatted: '0 B' };
        }
    }

    /**
     * Formatar bytes
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { R2Client };
}
