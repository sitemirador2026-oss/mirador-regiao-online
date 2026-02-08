/**
 * Cloudflare Worker - Upload Proxy para R2
 * Usando R2 Bindings (API nativa do Cloudflare)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Formatar bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Verificar se o binding R2 está configurado
    if (!env.R2_BUCKET) {
      return new Response(
        JSON.stringify({ error: 'R2_BUCKET binding não configurado. Vá em Settings > Bindings e adicione o bucket.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Status básico
    if (path === '/api/status') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'mirador-r2-worker', timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Worker Status completo
    if (path === '/api/worker/status') {
      try {
        // Testar listando objetos
        const objects = await env.R2_BUCKET.list({ limit: 1 });
        
        return new Response(
          JSON.stringify({
            status: 'online',
            worker: 'mirador-r2',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            r2: {
              connected: true,
              bucket: 'mirador-regiao-online',
              publicUrl: 'https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev'
            },
            limits: {
              requestsPerDay: 100000,
              maxFileSize: '50MB'
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: 'online',
            worker: 'mirador-r2',
            error: error.message,
            r2: { connected: false }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Estatísticas de uso
    if (path === '/api/r2/usage') {
      try {
        const objects = await env.R2_BUCKET.list();
        let totalSize = 0;
        
        for (const object of objects.objects || []) {
          totalSize += object.size;
        }
        
        return new Response(
          JSON.stringify({
            used: totalSize,
            files: objects.objects?.length || 0,
            limit: 10 * 1024 * 1024 * 1024, // 10GB
            formatted: formatBytes(totalSize)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Listar arquivos
    if (path === '/api/files') {
      try {
        const prefix = url.searchParams.get('prefix') || '';
        const objects = await env.R2_BUCKET.list({ prefix });
        
        const files = (objects.objects || []).map(obj => ({
          key: obj.key,
          size: obj.size,
          lastModified: obj.uploaded,
          url: `https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev/${obj.key}`
        }));
        
        return new Response(
          JSON.stringify({ files }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Upload de arquivo
    if (path === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const folder = formData.get('folder') || 'noticias';
        
        if (!file) {
          return new Response(
            JSON.stringify({ error: 'Nenhum arquivo enviado' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Validar tipo - aceitar todas as imagens e vídeos comuns
        const fileType = (file.type || '').toLowerCase();
        
        // Verificar se é imagem ou vídeo válido
        const isImage = fileType.startsWith('image/');
        const isVideo = fileType.startsWith('video/');
        
        if (!isImage && !isVideo) {
          return new Response(
            JSON.stringify({ error: `Tipo não suportado: ${file.type}. Apenas imagens e vídeos são permitidos.` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Gerar nome único
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
        const key = `${folder}/${timestamp}-${safeName}`;
        
        // Fazer upload para R2
        await env.R2_BUCKET.put(key, file.stream(), {
          httpMetadata: {
            contentType: file.type
          }
        });
        
        return new Response(
          JSON.stringify({
            success: true,
            url: `https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev/${key}`,
            key: key
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Deletar arquivo
    if (path.startsWith('/api/files/') && request.method === 'DELETE') {
      try {
        const key = decodeURIComponent(path.replace('/api/files/', ''));
        await env.R2_BUCKET.delete(key);
        
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Rota não encontrada
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};