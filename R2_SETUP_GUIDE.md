# 🚀 Guia de Configuração - Cloudflare R2

## ✅ O que já foi configurado

### 1. Bucket R2 Criado
- **Nome:** `mirador-regiao-online`
- **URL Pública:** `https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev`
- **Endpoint S3:** `https://8341826f08014d0252c400798d657729.r2.cloudflarestorage.com`

### 2. Arquivos Adicionados
- `admin/js/r2-config.js` - Configurações do R2
- `admin/js/r2-upload.js` - Módulo de upload

### 3. Painel Admin Atualizado
- Nova página de storage com métricas do R2
- Campos para inserir credenciais
- Dashboard de uso em tempo real

---

## 🔐 Como Inserir as Credenciais

### Passo 1: Pegar as credenciais
Você já criou o token! As credenciais são:

**Access Key ID:**
```
82b8cac3269b84905aff1d560f9bc958
```

**Secret Access Key:**
```
2aa8ee9d9bf6da4b5d7796cce1853e8bc45274ade8d88d3a70c6fd9f6989232bd
```

### Passo 2: Inserir no painel
1. Acesse o painel admin
2. Vá em **"Armazenamento"**
3. Na seção amarela **"Configuração R2"**
4. Cole a **Access Key ID** no primeiro campo
5. Cole a **Secret Access Key** no segundo campo
6. Clique em **"Salvar Credenciais"**
7. Clique em **"Testar Conexão"**

---

## 💰 Preços do R2

| Recurso | Free Tier | Após Free Tier |
|---------|-----------|----------------|
| **Storage** | 10GB/mês | $0,015/GB (~R$ 0,08/GB) |
| **Download** | Ilimitado | **GRÁTIS** |
| **Upload** | Ilimitado | **GRÁTIS** |

**Exemplo de custo:**
- 50GB de imagens: ~R$ 3,20/mês
- 100.000 downloads: R$ 0

---

## 📁 Estrutura de Pastas no R2

Os arquivos serão organizados assim:
```
noticias/          # Imagens de notícias
  1234567890-abc.jpg
  1234567891-def.png
  ...

stories/           # Imagens de stories
  1234567892-ghi.jpg
  ...

logos/             # Logos do site
  logo.png
  ...
```

---

## 🔧 Como Usar no Código

### Upload de imagem (JavaScript)
```javascript
// Criar instância do storage
const r2 = new R2Storage(accessKey, secretKey);

// Fazer upload
const fileInput = document.getElementById('imagem');
const file = fileInput.files[0];

const result = await r2.uploadFile(file, 'noticias');
console.log('URL:', result.url);
// Resultado: https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev/noticias/1234567890-abc.jpg
```

### Exibir imagem no site
```html
<!-- URL direta do R2 -->
<img src="https://pub-5b94009c2499437d9f5b2fb46285265a.r2.dev/noticias/imagem.jpg" />
```

---

## 🎨 Integração com Firebase

O Firestore continua sendo usado para:
- ✅ Dados das notícias (título, texto, categoria)
- ✅ URLs das imagens (agora apontando para R2)
- ✅ Autenticação do admin
- ✅ Configurações do site

**O que MUDOU:**
- ❌ Antes: `image: "data:image/jpeg;base64,/9j/4AAQ..."` (1MB+)
- ✅ Agora: `image: "https://pub-5b...r2.dev/noticias/123.jpg"` (100 bytes)

---

## ⚠️ Notas Importantes

1. **Segurança:** As credenciais são salvas no `localStorage` do navegador. Em produção, use um backend.

2. **CORS:** Já configurado para permitir upload do seu site

3. **Cache:** As imagens são servidas pelo CDN global da Cloudflare (rápido!)

4. **Backup:** Faça backup regular dos seus dados do Firebase (Firestore)

---

## 📞 Suporte

Se tiver problemas:
1. Verifique se as credenciais estão corretas
2. Teste a conexão no painel
3. Veja o console do navegador (F12) para erros

---

**Pronto para usar! 🎉**
