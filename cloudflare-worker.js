/**
 * Cloudflare Worker - Upload Proxy para R2
 * Substitui o server.js do Render
 * 
 * Deploy: Cloudflare Dashboard > Workers & Pages > Create Service
 */

// Configuração do R2 (mesma do server.js)
const R2_CONFIG = {
  accountId: '8341826f08014d0252c400798d657729',
  bucketName: 'mirador-regiao-online',
  endpoint: 'https://8341826f08014d0252c400798d657729.r2.cloudflarestorage.com',
  publicUrl: 'https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev'
};

// Credenciais vindas das variáveis de ambiente do Cloudflare
// Configure no Cloudflare: Workers > Your Worker > Settings > Variables
// Adicione como "Secret": R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY

// Headers CORS para permitir acesso do seu domínio
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // ou especifique seu domínio
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Função para gerar assinatura AWS v4
async function signRequest(method, url, headers, payload, env) {
  const R2_ACCESS_KEY_ID = env?.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = env?.R2_SECRET_ACCESS_KEY;
  
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Credenciais R2 não configuradas');
  }
  
  const date = new Date();
  const dateStamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStamp = date.toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 15) + 'Z';
  
  const region = 'auto';
  const service = 's3';
  
  // Canonical request
  const parsedUrl = new URL(url);
  const canonicalUri = encodeURIComponent(parsedUrl.pathname).replace(/%2F/g, '/');
  const canonicalQuerystring = parsedUrl.search.slice(1);
  
  // Headers assinados - incluir host
  const allHeaders = { ...headers, 'host': parsedUrl.host };
  const signedHeadersList = Object.keys(allHeaders).map(k => k.toLowerCase()).sort();
  const signedHeaders = signedHeadersList.join(';');
  const canonicalHeaders = signedHeadersList.map(k => `${k}:${allHeaders[k].trim()}\n`).join('');
  
  const payloadHash = await crypto.subtle.digest('SHA-256', payload);
  const payloadHashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const canonicalRequest = [
    method,
    parsedUrl.pathname,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHashHex
  ].join('\n');
  
  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest));
  const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timeStamp,
    credentialScope,
    canonicalRequestHashHex
  ].join('\n');
  
  // Assinatura
  const kDate = await hmacSHA256(`AWS4${R2_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  const kSigning = await hmacSHA256(kService, 'aws4_request');
  const signature = await hmacSHA256(kSigning, stringToSign);
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Authorization header
  const authHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
  
  return {
    'Authorization': authHeader,
    'x-amz-date': timeStamp,
    'x-amz-content-sha256': payloadHashHex,
    'host': parsedUrl.host
  };
}

async function hmacSHA256(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

// Formatar bytes para human-readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Handler principal
export default {
  async fetch(request, env, ctx) {
    // Responder preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204, 
        headers: corsHeaders 
      });
    }
    
    // Rota de upload
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/upload') {
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
        
        // Validar tipo de arquivo
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
        if (!allowedTypes.includes(file.type)) {
          return new Response(
            JSON.stringify({ error: 'Tipo de arquivo não suportado' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Validar tamanho (máximo 50MB)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
          return new Response(
            JSON.stringify({ error: 'Arquivo muito grande (máx 50MB)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Gerar nome único
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
        const key = `${folder}/${timestamp}-${safeName}`;
        
        // Ler arquivo como ArrayBuffer
        const fileBuffer = await file.arrayBuffer();
        
        // Preparar headers para R2
        const headers = {
          'Host': `${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
          'Content-Type': file.type,
          'Content-Length': file.size.toString()
        };
        
        // Gerar assinatura
        const url = `${R2_CONFIG.endpoint}/${key}`;
        const authHeaders = await signRequest('PUT', url, headers, fileBuffer, env);
        
        // Fazer upload para R2
        const r2Response = await fetch(url, {
          method: 'PUT',
          headers: {
            ...headers,
            ...authHeaders
          },
          body: fileBuffer
        });
        
        if (!r2Response.ok) {
          const errorText = await r2Response.text();
          console.error('Erro R2:', errorText);
          return new Response(
            JSON.stringify({ error: 'Erro ao fazer upload para R2' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Retornar URL pública
        const publicUrl = `${R2_CONFIG.publicUrl}/${key}`;
        
        return new Response(
          JSON.stringify({
            success: true,
            url: publicUrl,
            key: key
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      } catch (error) {
        console.error('Erro:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Rota de status geral
    if (request.method === 'GET' && new URL(request.url).pathname === '/api/status') {
      return new Response(
        JSON.stringify({ 
          status: 'ok', 
          service: 'mirador-r2-worker',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Rota de debug (remover em produção)
    if (request.method === 'GET' && new URL(request.url).pathname === '/api/debug') {
      return new Response(
        JSON.stringify({
          envKeys: Object.keys(env || {}),
          hasAccessKey: !!env?.R2_ACCESS_KEY_ID,
          hasSecretKey: !!env?.R2_SECRET_ACCESS_KEY,
          accessKeyPrefix: env?.R2_ACCESS_KEY_ID ? env.R2_ACCESS_KEY_ID.substring(0, 5) + '...' : null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Rota de status do Worker (para o painel admin)
    if (request.method === 'GET' && new URL(request.url).pathname === '/api/worker/status') {
      try {
        // Verificar se credenciais estão configuradas
        const hasCredentials = env?.R2_ACCESS_KEY_ID && env?.R2_SECRET_ACCESS_KEY;
        
        if (!hasCredentials) {
          return new Response(
            JSON.stringify({
              status: 'online',
              worker: 'mirador-r2',
              version: '1.0.0',
              timestamp: new Date().toISOString(),
              r2: {
                connected: false,
                error: 'Credenciais não configuradas',
                bucket: R2_CONFIG.bucketName
              }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Testar conexão com R2
        const listUrl = `${R2_CONFIG.endpoint}?list-type=2&max-keys=1`;
        const headers = {
          'Host': `${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`
        };
        
        const authHeaders = await signRequest('GET', listUrl, headers, new ArrayBuffer(0), env);
        
        const r2Response = await fetch(listUrl, {
          method: 'GET',
          headers: { ...headers, ...authHeaders }
        });
        
        const r2Connected = r2Response.ok;
        
        return new Response(
          JSON.stringify({
            status: 'online',
            worker: 'mirador-r2',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            r2: {
              connected: r2Connected,
              bucket: R2_CONFIG.bucketName,
              endpoint: R2_CONFIG.endpoint,
              publicUrl: R2_CONFIG.publicUrl
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
            timestamp: new Date().toISOString(),
            r2: {
              connected: false,
              bucket: R2_CONFIG.bucketName
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Rota de estatísticas do R2
    if (request.method === 'GET' && new URL(request.url).pathname === '/api/r2/usage') {
      try {
        // Listar todos os objetos do bucket
        const listUrl = `${R2_CONFIG.endpoint}?list-type=2`;
        const headers = {
          'Host': `${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`
        };
        
        const authHeaders = await signRequest('GET', listUrl, headers, new ArrayBuffer(0), env);
        
        const r2Response = await fetch(listUrl, {
          method: 'GET',
          headers: { ...headers, ...authHeaders }
        });
        
        if (!r2Response.ok) {
          throw new Error('Erro ao listar arquivos');
        }
        
        const xmlText = await r2Response.text();
        
        // Parse simples do XML
        const contents = xmlText.match(/<Contents>([\s\S]*?)<\/Contents>/g) || [];
        let totalSize = 0;
        let fileCount = 0;
        
        for (const content of contents) {
          const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
          if (sizeMatch) {
            totalSize += parseInt(sizeMatch[1]);
            fileCount++;
          }
        }
        
        return new Response(
          JSON.stringify({
            used: totalSize,
            files: fileCount,
            limit: 10 * 1024 * 1024 * 1024, // 10GB
            formatted: formatBytes(totalSize)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      } catch (error) {
        console.error('Erro ao obter estatísticas:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Rota para listar arquivos
    if (request.method === 'GET' && new URL(request.url).pathname === '/api/files') {
      try {
        const url = new URL(request.url);
        const prefix = url.searchParams.get('prefix') || '';
        
        const listUrl = `${R2_CONFIG.endpoint}?list-type=2${prefix ? '&prefix=' + encodeURIComponent(prefix) : ''}`;
        const headers = {
          'Host': `${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`
        };
        
        const authHeaders = await signRequest('GET', listUrl, headers, new ArrayBuffer(0), env);
        
        const r2Response = await fetch(listUrl, {
          method: 'GET',
          headers: { ...headers, ...authHeaders }
        });
        
        if (!r2Response.ok) {
          throw new Error('Erro ao listar arquivos');
        }
        
        const xmlText = await r2Response.text();
        
        // Parse simples do XML
        const contents = xmlText.match(/<Contents>([\s\S]*?)<\/Contents>/g) || [];
        const files = [];
        
        for (const content of contents) {
          const keyMatch = content.match(/<Key>([^<]+)<\/Key>/);
          const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
          const modifiedMatch = content.match(/<LastModified>([^<]+)<\/LastModified>/);
          
          if (keyMatch && sizeMatch) {
            files.push({
              key: keyMatch[1],
              size: parseInt(sizeMatch[1]),
              lastModified: modifiedMatch ? modifiedMatch[1] : null,
              url: `${R2_CONFIG.publicUrl}/${keyMatch[1]}`
            });
          }
        }
        
        return new Response(
          JSON.stringify({ files }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      } catch (error) {
        console.error('Erro ao listar arquivos:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Rota para deletar arquivo
    if (request.method === 'DELETE') {
      const urlPath = new URL(request.url).pathname;
      const match = urlPath.match(/^\/api\/files\/(.+)$/);
      
      if (match) {
        try {
          const key = decodeURIComponent(match[1]);
          const deleteUrl = `${R2_CONFIG.endpoint}/${key}`;
          
          const headers = {
            'Host': `${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`
          };
          
          const authHeaders = await signRequest('DELETE', deleteUrl, headers, new ArrayBuffer(0), env);
          
          const r2Response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { ...headers, ...authHeaders }
          });
          
          if (!r2Response.ok && r2Response.status !== 204) {
            throw new Error('Erro ao deletar arquivo');
          }
          
          return new Response(
            JSON.stringify({ success: true, message: 'Arquivo deletado' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
          
        } catch (error) {
          console.error('Erro ao deletar:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }
    
    // Rota não encontrada
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};