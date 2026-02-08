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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Função para gerar assinatura AWS v4
async function signRequest(method, url, headers, payload, env) {
  const R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
  
  const date = new Date();
  const dateStamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStamp = date.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
  
  const region = 'us-east-1';
  const service = 's3';
  
  // Canonical request
  const parsedUrl = new URL(url);
  const canonicalUri = parsedUrl.pathname;
  const canonicalQuerystring = parsedUrl.search.slice(1);
  
  // Headers assinados
  const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k.toLowerCase()}:${headers[k]}\n`).join('');
  
  const payloadHash = await crypto.subtle.digest('SHA-256', payload);
  const payloadHashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const canonicalRequest = [
    method,
    canonicalUri,
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
    'x-amz-content-sha256': payloadHashHex
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
    
    // Rota de status
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
    
    // Rota não encontrada
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};