/**
 * R2 Client - Frontend
 * Envia arquivos para o Cloudflare Worker que faz upload pro R2
 */

class R2Client {
    constructor(options = {}) {
        const defaultWorkerUrl = 'https://mirador-r2.sitemirador2026.workers.dev';
        const defaultRenderUrl = 'https://mirador-admin.onrender.com';
        const configuredBaseUrl = (options.baseUrl || defaultWorkerUrl).replace(/\/+$/, '');
        const configuredFallbackUrls = Array.isArray(options.fallbackUrls) ? options.fallbackUrls : [];

        const allCandidates = [
            configuredBaseUrl,
            ...configuredFallbackUrls,
            defaultRenderUrl
        ]
            .map(url => String(url || '').trim().replace(/\/+$/, ''))
            .filter(Boolean);

        this.baseUrl = allCandidates[0] || defaultWorkerUrl;
        this.baseUrls = Array.from(new Set(allCandidates));
    }

    buildCandidateUrls(path = '') {
        const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
        return this.baseUrls.map(base => `${base}${normalizedPath}`);
    }

    async requestWithFallback(path, init = {}) {
        const requestUrls = this.buildCandidateUrls(path);
        let lastError = null;

        for (const url of requestUrls) {
            try {
                const response = await fetch(url, init);
                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}`;
                    try {
                        const errorJson = await response.clone().json();
                        errorMessage = errorJson?.error || errorJson?.message || errorMessage;
                    } catch (_jsonError) {
                        try {
                            const errorText = await response.clone().text();
                            if (errorText) errorMessage = errorText;
                        } catch (_textError) { }
                    }

                    const httpError = new Error(errorMessage);
                    httpError.status = response.status;
                    httpError.url = url;
                    lastError = httpError;
                    continue;
                }

                const expectsJson = String(path || '').startsWith('/api/');
                if (expectsJson) {
                    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
                    if (!contentType.includes('application/json')) {
                        const invalidResponseError = new Error('Resposta invalida do endpoint de API');
                        invalidResponseError.url = url;
                        lastError = invalidResponseError;
                        continue;
                    }
                }

                this.baseUrl = String(new URL(url).origin).replace(/\/+$/, '');
                return response;
            } catch (error) {
                lastError = error;
                continue;
            }
        }

        throw lastError || new Error('Falha ao conectar com os endpoints de upload');
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

            const response = await this.requestWithFallback('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (onProgress) onProgress(90);

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
            const response = await this.requestWithFallback(`/api/files?prefix=${encodeURIComponent(prefix || '')}`);

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
            const response = await this.requestWithFallback(`/api/files/${encodeURIComponent(key)}`, {
                method: 'DELETE'
            });

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
            const response = await this.requestWithFallback('/api/health');
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
