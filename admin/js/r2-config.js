/**
 * Cloudflare R2 Configuration
 * Storage for Mirador e Região Online
 */

const R2_CONFIG = {
    // Account ID da Cloudflare
    accountId: '8341826f08014d0252c400798d657729',
    
    // Nome do bucket
    bucketName: 'mirador-regiao-online',
    
    // Endpoint S3
    endpoint: 'https://8341826f08014d0252c400798d657729.r2.cloudflarestorage.com',
    
    // URL pública para acesso aos arquivos
    publicUrl: 'https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev',
    
    // Região - R2 requer 'us-east-1' para API S3
    region: 'us-east-1'
};

// Limites do Free Tier
const R2_LIMITS = {
    storageFreeGB: 10,
    classAOperations: 1000000,
    classBOperations: 10000000
};

// Preços após free tier (em dólar)
const R2_PRICING = {
    storagePerGB: 0.015,
    classAOperations: 4.50,
    classBOperations: 0.36
};

// Taxa de conversão (aproximada)
const EXCHANGE_RATE = 5.0; // 1 USD = R$ 5,00

/**
 * Calcula o custo estimado
 * @param {number} storageGB 
 * @returns {Object}
 */
function calculateR2Cost(storageGB) {
    const storageCostUSD = Math.max(0, storageGB - R2_LIMITS.storageFreeGB) * R2_PRICING.storagePerGB;
    const totalUSD = storageCostUSD;
    return {
        storage: { usd: storageCostUSD, brl: storageCostUSD * EXCHANGE_RATE },
        total: { usd: totalUSD, brl: totalUSD * EXCHANGE_RATE }
    };
}

/**
 * Calcula o custo estimado em reais
 * @param {number} storageGB - Storage em GB
 * @param {number} classAOps - Operações Classe A
 * @param {number} classBOps - Operações Classe B
 * @returns {Object} - Custo em dólar e real
 */
function calculateR2Cost(storageGB, classAOps = 0, classBOps = 0) {
    // Storage
    const storageCostUSD = Math.max(0, storageGB - R2_LIMITS.storageFreeGB) * R2_PRICING.storagePerGB;
    
    // Operações Classe A
    const classACostUSD = Math.max(0, classAOps - R2_LIMITS.classAOperations) / 1000000 * R2_PRICING.classAOperations;
    
    // Operações Classe B
    const classBCostUSD = Math.max(0, classBOps - R2_LIMITS.classBOperations) / 1000000 * R2_PRICING.classBOperations;
    
    const totalUSD = storageCostUSD + classACostUSD + classBCostUSD;
    const totalBRL = totalUSD * EXCHANGE_RATE;
    
    return {
        storage: { usd: storageCostUSD, brl: storageCostUSD * EXCHANGE_RATE },
        classA: { usd: classACostUSD, brl: classACostUSD * EXCHANGE_RATE },
        classB: { usd: classBCostUSD, brl: classBCostUSD * EXCHANGE_RATE },
        total: { usd: totalUSD, brl: totalBRL }
    };
}

/**
 * Formata bytes para unidade legível
 * @param {number} bytes 
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formata moeda para Real
 * @param {number} value 
 * @returns {string}
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { R2_CONFIG, R2_LIMITS, R2_PRICING, calculateR2Cost, formatBytes, formatCurrency };
}
