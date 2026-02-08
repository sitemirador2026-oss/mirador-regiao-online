/**
 * Cloudflare Worker - Upload Proxy para R2
 * Substitui o server.js do Render
 */

const R2_CONFIG = {
  accountId: '8341826f08014d0252c400798d657729',
  bucketName: 'mirador-regiao-online',
  endpoint: 'https://8341826f08014d0252c400798d657729.r2.cloudflarestorage.com',
  publicUrl: 'https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// SHA-256 hash
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// HMAC-SHA256
async function hmacSHA256(key, message) {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuffer = new TextEncoder().encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  return new Uint8Array(signature);
}

// Gerar assinatura AWS Signature Version 4
async function getSignedHeaders(method, path, queryString, env) {
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  
  if (!accessKeyId || !secretKey) {
    throw new Error('Credenciais R2 não configuradas');
  }
  
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
  
  const region = 'auto';
  const service = 's3';
  
  // Host
  const host = `${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`;
  
  // Payload vazio para GET
  const payloadHash = method === 'GET' 
    ? 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    : await sha256('');
  
  // Canonical Request
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  
  const canonicalRequest = [
    method,
    path,
    queryString || '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  // String to Sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash
  ].join('\n');
  
  // Signing Key
  const kDate = await hmacSHA256(`AWS4${secretKey}`, dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  const kSigning = await hmacSHA256(kService, 'aws4_request');
  
  // Signature
  const signature = await hmacSHA256(kSigning, stringToSign);
  const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Authorization Header
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
  
  return {
    'Authorization': authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'host': host
  };
}

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
    
    // Status
    if (path === '/api/status') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'mirador-r2-worker', timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Worker Status
    if (path === '/api/worker/status') {
      try {
        const signedHeaders = await getSignedHeaders('GET', '/', '', env);
        const r2Url = `${R2_CONFIG.endpoint}/`;
        
        const r2Response = await fetch(r2Url, {
          method: 'GET',
          headers: signedHeaders
        });
        
        return new Response(
          JSON.stringify({
            status: 'online',
            worker: 'mirador-r2',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            r2: {
              connected: r2Response.ok,
              status: r2Response.status,
              bucket: R2_CONFIG.bucketName,
              publicUrl: R2_CONFIG.publicUrl
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: 'online',
            error: error.message,
            r2: { connected: false }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // R2 Usage
    if (path === '/api/r2/usage') {
      try {
        const signedHeaders = await getSignedHeaders('GET', '/', '', env);
        const r2Url = `${R2_CONFIG.endpoint}/`;
        
        const r2Response = await fetch(r2Url, {
          method: 'GET',
          headers: signedHeaders
        });
        
        if (!r2Response.ok) {
          throw new Error(`R2 Error: ${r2Response.status}`);
        }
        
        const xmlText = await r2Response.text();
        const contents = xmlText.match(/<Contents>([\s\S]*?)<\/Contents>/g) || [];
        
        let totalSize = 0;
        for (const content of contents) {
          const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
          if (sizeMatch) totalSize += parseInt(sizeMatch[1]);
        }
        
        return new Response(
          JSON.stringify({
            used: totalSize,
            files: contents.length,
            limit: 10 * 1024 * 1024 * 1024,
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
    
    // List files
    if (path === '/api/files') {
      try {
        const prefix = url.searchParams.get('prefix') || '';
        const queryString = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
        const signedHeaders = await getSignedHeaders('GET', '/', queryString, env);
        
        const r2Url = `${R2_CONFIG.endpoint}/${queryString}`;
        const r2Response = await fetch(r2Url, {
          method: 'GET',
          headers: signedHeaders
        });
        
        if (!r2Response.ok) {
          throw new Error(`R2 Error: ${r2Response.status}`);
        }
        
        const xmlText = await r2Response.text();
        const contents = xmlText.match(/<Contents>([\s\S]*?)<\/Contents>/g) || [];
        
        const files = contents.map(content => {
          const keyMatch = content.match(/<Key>([^<]+)<\/Key>/);
          const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
          return {
            key: keyMatch?.[1] || '',
            size: parseInt(sizeMatch?.[1] || '0'),
            url: `${R2_CONFIG.publicUrl}/${keyMatch?.[1] || ''}`
          };
        });
        
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
    
    // Upload
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
        
        // Validar tipo
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
        if (!allowedTypes.includes(file.type)) {
          return new Response(
            JSON.stringify({ error: 'Tipo não suportado' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Gerar nome
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
        const key = `${folder}/${timestamp}-${safeName}`;
        
        // Ler arquivo
        const fileBuffer = await file.arrayBuffer();
        
        // Fazer upload para R2
        const accessKeyId = env.R2_ACCESS_KEY_ID;
        const secretKey = env.R2_SECRET_ACCESS_KEY;
        
        const now = new Date();
        const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
        const amzDate = now.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
        
        const host = `${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`;
        const r2Path = `/${key}`;
        
        // Calcular hash do payload
        const payloadHash = await crypto.subtle.digest('SHA-256', fileBuffer);
        const payloadHashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Canonical Request
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHashHex}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        
        const canonicalRequest = [
          'PUT',
          r2Path,
          '',
          canonicalHeaders,
          signedHeaders,
          payloadHashHex
        ].join('\n');
        
        // String to Sign
        const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
        const canonicalRequestHash = await sha256(canonicalRequest);
        
        const stringToSign = [
          'AWS4-HMAC-SHA256',
          amzDate,
          credentialScope,
          canonicalRequestHash
        ].join('\n');
        
        // Signing Key
        const kDate = await hmacSHA256(`AWS4${secretKey}`, dateStamp);
        const kRegion = await hmacSHA256(kDate, 'auto');
        const kService = await hmacSHA256(kRegion, 's3');
        const kSigning = await hmacSHA256(kService, 'aws4_request');
        
        // Signature
        const signature = await hmacSHA256(kSigning, stringToSign);
        const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Upload
        const r2Url = `${R2_CONFIG.endpoint}${r2Path}`;
        const r2Response = await fetch(r2Url, {
          method: 'PUT',
          headers: {
            'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`,
            'x-amz-date': amzDate,
            'x-amz-content-sha256': payloadHashHex,
            'host': host,
            'Content-Type': file.type
          },
          body: fileBuffer
        });
        
        if (!r2Response.ok) {
          const errorText = await r2Response.text();
          throw new Error(`Upload failed: ${r2Response.status}`);
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            url: `${R2_CONFIG.publicUrl}/${key}`,
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
    
    // Delete file
    if (path.startsWith('/api/files/') && request.method === 'DELETE') {
      try {
        const key = decodeURIComponent(path.replace('/api/files/', ''));
        const signedHeaders = await getSignedHeaders('DELETE', `/${key}`, '', env);
        
        const r2Url = `${R2_CONFIG.endpoint}/${key}`;
        const r2Response = await fetch(r2Url, {
          method: 'DELETE',
          headers: signedHeaders
        });
        
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
    
    // Not found
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};