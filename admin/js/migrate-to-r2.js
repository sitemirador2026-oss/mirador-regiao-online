/**
 * Script de Migração: Firebase (base64) → R2
 * 
 * Como usar:
 * 1. Abra o admin do site
 * 2. Faça login
 * 3. Abra o console (F12)
 * 4. Cole este código e execute: await migrateToR2()
 */

class R2Migration {
  constructor() {
    this.workerUrl = 'https://mirador-r2.sitemirador2026.workers.dev';
    this.db = firebase.firestore();
    this.stats = {
      total: 0,
      migrated: 0,
      errors: 0,
      skipped: 0
    };
  }

  /**
   * Iniciar migração
   */
  async start() {
    console.log('🚀 Iniciando migração Firebase → R2...\n');
    
    try {
      // Buscar todas as notícias
      const snapshot = await this.db.collection('news').get();
      const news = [];
      snapshot.forEach(doc => {
        news.push({ id: doc.id, ...doc.data() });
      });
      
      console.log(`📊 Total de notícias: ${news.length}`);
      
      // Processar cada notícia
      for (const item of news) {
        await this.processNews(item);
      }
      
      // Resumo final
      this.printStats();
      
    } catch (error) {
      console.error('❌ Erro na migração:', error);
    }
  }

  /**
   * Processar uma notícia
   */
  async processNews(news) {
    this.stats.total++;
    
    console.log(`\n📰 Processando: ${news.title || news.id}`);
    
    try {
      // Verificar se tem imagem
      if (!news.image) {
        console.log('   ⏭️  Sem imagem, pulando...');
        this.stats.skipped++;
        return;
      }
      
      // Verificar se já é URL (já migrada)
      if (news.image.startsWith('http')) {
        console.log('   ⏭️  Já é URL, pulando...');
        this.stats.skipped++;
        return;
      }
      
      // Verificar se é base64
      if (!news.image.startsWith('data:image')) {
        console.log('   ⚠️  Formato não reconhecido:', news.image.substring(0, 50));
        this.stats.errors++;
        return;
      }
      
      // Extrair tipo e dados
      const match = news.image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!match) {
        console.log('   ⚠️  Formato base64 inválido');
        this.stats.errors++;
        return;
      }
      
      const [, ext, base64Data] = match;
      const mimeType = `image/${ext}`;
      
      console.log(`   📸 Imagem detectada: ${ext.toUpperCase()}`);
      
      // Converter base64 para blob
      const blob = this.base64ToBlob(base64Data, mimeType);
      console.log(`   📦 Tamanho: ${this.formatBytes(blob.size)}`);
      
      // Criar arquivo
      const filename = `migracao/${news.id}_${Date.now()}.${ext}`;
      const file = new File([blob], filename, { type: mimeType });
      
      // Upload para R2
      const result = await this.uploadToR2(file);
      
      if (result.success) {
        // Atualizar notícia no Firebase
        await this.updateNewsImage(news.id, result.url);
        console.log('   ✅ Migrado com sucesso!');
        this.stats.migrated++;
      } else {
        console.log('   ❌ Falha no upload:', result.error);
        this.stats.errors++;
      }
      
    } catch (error) {
      console.error('   ❌ Erro:', error.message);
      this.stats.errors++;
    }
  }

  /**
   * Converter base64 para Blob
   */
  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let i = 0; i < byteCharacters.length; i += 512) {
      const slice = byteCharacters.slice(i, i + 512);
      const byteNumbers = new Array(slice.length);
      
      for (let j = 0; j < slice.length; j++) {
        byteNumbers[j] = slice.charCodeAt(j);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    
    return new Blob(byteArrays, { type: mimeType });
  }

  /**
   * Upload para R2 via Worker
   */
  async uploadToR2(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'migracao');
    
    const response = await fetch(`${this.workerUrl}/api/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }
    
    return await response.json();
  }

  /**
   * Atualizar imagem da notícia no Firebase
   */
  async updateNewsImage(newsId, imageUrl) {
    await this.db.collection('news').doc(newsId).update({
      image: imageUrl,
      migratedAt: new Date().toISOString()
    });
  }

  /**
   * Mostrar estatísticas
   */
  printStats() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMO DA MIGRAÇÃO');
    console.log('='.repeat(50));
    console.log(`Total de notícias: ${this.stats.total}`);
    console.log(`✅ Migradas: ${this.stats.migrated}`);
    console.log(`⏭️  Puladas: ${this.stats.skipped}`);
    console.log(`❌ Erros: ${this.stats.errors}`);
    console.log('='.repeat(50));
  }

  /**
   * Formatar bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Função global para executar
async function migrateToR2() {
  const migrator = new R2Migration();
  await migrator.start();
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { R2Migration, migrateToR2 };
}

console.log('✅ Script de migração carregado!');
console.log('Execute: await migrateToR2()');