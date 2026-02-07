/**
 * Cloudflare R2 Upload Module
 * Módulo para upload de arquivos para o R2
 * 
 * NOTA DE SEGURANÇA: Este módulo usa credenciais no frontend.
 * Para produção, recomenda-se usar Firebase Functions ou backend seguro.
 */

// Carregar AWS SDK (deve ser incluído no HTML)
// <script src="https://cdn.jsdelivr.net/npm/@aws-sdk/client-s3@3.400.0/dist-cjs/index.js"></script>

class R2Storage {
    constructor(accessKeyId, secretAccessKey) {
        this.config = {
            region: R2_CONFIG.region,
            endpoint: R2_CONFIG.endpoint,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey
            }
        };
        this.bucketName = R2_CONFIG.bucketName;
        this.publicUrl = R2_CONFIG.publicUrl;
        
        // Inicializar cliente S3 (AWS SDK)
        this.initClient();
    }
    
    initClient() {
        // Verificar se AWS SDK está carregado
        if (typeof AWS === 'undefined') {
            console.warn('AWS SDK não carregado. Carregando dinamicamente...');
            this.loadAwsSdk().then(() => this.initClient());
            return;
        }
        
        console.log('[R2] Inicializando cliente S3...');
        console.log('[R2] Endpoint:', this.config.endpoint);
        console.log('[R2] Bucket:', this.bucketName);
        console.log('[R2] Access Key:', this.config.credentials.accessKeyId.substring(0, 10) + '...');
        
        try {
            this.s3Client = new AWS.S3({
                region: this.config.region,
                endpoint: this.config.endpoint,
                credentials: new AWS.Credentials(
                    this.config.credentials.accessKeyId,
                    this.config.credentials.secretAccessKey
                ),
                signatureVersion: 'v4',
                s3ForcePathStyle: true // Importante para R2
            });
            
            console.log('[R2] Cliente S3 inicializado com sucesso');
        } catch (error) {
            console.error('[R2] Erro ao inicializar cliente:', error);
            throw error;
        }
    }
    
    loadAwsSdk() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://sdk.amazonaws.com/js/aws-sdk-2.1000.0.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    /**
     * Gera um nome único para o arquivo
     */
    generateFileName(originalName, folder = 'noticias') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = originalName.split('.').pop().toLowerCase();
        return `${folder}/${timestamp}-${random}.${extension}`;
    }
    
    /**
     * Valida o arquivo antes do upload
     */
    validateFile(file) {
        const maxSize = 50 * 1024 * 1024; // 50MB
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
        
        if (file.size > maxSize) {
            throw new Error(`Arquivo muito grande. Máximo: 50MB`);
        }
        
        if (!allowedTypes.includes(file.type)) {
            throw new Error(`Tipo de arquivo não permitido. Use: JPG, PNG, WEBP, GIF, MP4, WEBM`);
        }
        
        return true;
    }
    
    /**
     * Faz upload de um arquivo
     * @param {File} file - Arquivo do input file
     * @param {string} folder - Pasta de destino (default: 'noticias')
     * @returns {Promise<{url: string, key: string, size: number}>}
     */
    async uploadFile(file, folder = 'noticias') {
        try {
            // Validar arquivo
            this.validateFile(file);
            
            // Aguardar inicialização do cliente
            if (!this.s3Client) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (!this.s3Client) {
                    throw new Error('Cliente S3 não inicializado');
                }
            }
            
            const key = this.generateFileName(file.name, folder);
            
            const params = {
                Bucket: this.bucketName,
                Key: key,
                Body: file,
                ContentType: file.type,
                ACL: 'public-read'
            };
            
            console.log('Iniciando upload para R2:', key);
            
            const result = await this.s3Client.upload(params).promise();
            
            console.log('Upload concluído:', result);
            
            // Retornar URL pública
            return {
                url: `${this.publicUrl}/${key}`,
                key: key,
                size: file.size,
                type: file.type
            };
            
        } catch (error) {
            console.error('Erro no upload:', error);
            throw new Error(`Falha no upload: ${error.message}`);
        }
    }
    
    /**
     * Faz upload de múltiplos arquivos
     * @param {FileList} files - Lista de arquivos
     * @param {Function} onProgress - Callback de progresso (index, total)
     * @returns {Promise<Array>}
     */
    async uploadMultiple(files, onProgress = null) {
        const results = [];
        
        for (let i = 0; i < files.length; i++) {
            if (onProgress) {
                onProgress(i + 1, files.length, files[i].name);
            }
            
            const result = await this.uploadFile(files[i]);
            results.push(result);
        }
        
        return results;
    }
    
    /**
     * Lista arquivos no bucket
     * @param {string} prefix - Prefixo (pasta)
     * @returns {Promise<Array>}
     */
    async listFiles(prefix = '') {
        try {
            const params = {
                Bucket: this.bucketName,
                Prefix: prefix,
                MaxKeys: 1000
            };
            
            const result = await this.s3Client.listObjectsV2(params).promise();
            
            return result.Contents.map(obj => ({
                key: obj.Key,
                size: obj.Size,
                lastModified: obj.LastModified,
                url: `${this.publicUrl}/${obj.Key}`
            }));
            
        } catch (error) {
            console.error('Erro ao listar arquivos:', error);
            throw error;
        }
    }
    
    /**
     * Deleta um arquivo
     * @param {string} key - Chave do arquivo
     */
    async deleteFile(key) {
        try {
            const params = {
                Bucket: this.bucketName,
                Key: key
            };
            
            await this.s3Client.deleteObject(params).promise();
            console.log('Arquivo deletado:', key);
            
        } catch (error) {
            console.error('Erro ao deletar arquivo:', error);
            throw error;
        }
    }
    
    /**
     * Calcula o uso total de storage
     * @returns {Promise<{total: number, files: number}>}
     */
    async getStorageUsage() {
        try {
            const files = await this.listFiles();
            const totalSize = files.reduce((sum, file) => sum + file.size, 0);
            
            return {
                total: totalSize,
                files: files.length,
                formatted: formatBytes(totalSize)
            };
            
        } catch (error) {
            console.error('Erro ao calcular uso:', error);
            return { total: 0, files: 0, formatted: '0 B' };
        }
    }
}

// Função auxiliar para converter Base64 para File
function base64ToFile(base64String, filename, mimeType) {
    const arr = base64String.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], filename, { type: mimeType || mime });
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { R2Storage, base64ToFile };
}
