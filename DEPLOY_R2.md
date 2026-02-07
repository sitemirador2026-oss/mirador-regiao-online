# 🚀 Deploy com Cloudflare R2

## ✅ O que foi configurado

### 1. Backend (Node.js)
- `server.js` - API para upload/listagem/deleção de arquivos
- Conecta ao Cloudflare R2 usando credenciais seguras
- Serve os arquivos estáticos (frontend)

### 2. Frontend
- `admin/js/r2-client.js` - Cliente que se comunica com o backend
- Painel atualizado sem campos de credenciais (já estão no servidor)

### 3. Configurações
- `package.json` - Dependências do Node.js
- `render.yaml` - Configuração do Render.com

---

## 📋 Como fazer o Deploy

### 1. Commit no Git
```bash
git add .
git commit -m "Adicionado backend R2"
git push
```

### 2. No Render.com

1. Acesse seu dashboard: https://dashboard.render.com
2. Delete os serviços antigos (`mirador-web` e `mirador-admin`)
3. Crie um **novo Web Service**
4. Conecte seu repositório Git
5. Render vai detectar o `render.yaml` e configurar automaticamente

### 3. Ou configure manualmente:

- **Environment**: Node
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Plan**: Free

### 4. Variáveis de Ambiente (já estão no render.yaml):
```
R2_ACCOUNT_ID=8341826f08014d0252c400798d657729
R2_BUCKET_NAME=mirador-regiao-online
R2_ACCESS_KEY_ID=82b8cac3269b84905aff1d560f9bc958
R2_SECRET_ACCESS_KEY=2aa8ee9d9bf6da4b5d7796cce1853e8bc45274ade8d88d3a70c6fd9f6989232bd
```

---

## 🎯 URLs após deploy

- **Site público**: `https://mirador-server.onrender.com/`
- **Painel admin**: `https://mirador-server.onrender.com/admin/`
- **API**: `https://mirador-server.onrender.com/api/`

---

## 🧪 Testar

1. Acesse `/admin/`
2. Vá em **"Armazenamento"**
3. Clique **"Testar Conexão"**
4. Deve mostrar: ✅ Backend conectado com sucesso!

---

## 💰 Custos

- **Render**: Grátis (servidor Node)
- **R2**: 10GB grátis, depois $0.015/GB
- **Download**: Sempre GRÁTIS

---

## 🔄 Migrar imagens existentes

1. No painel, vá em **"Armazenamento"**
2. Clique **"Verificar Imagens Base64"**
3. Clique **"Iniciar Migração"**
4. Aguarde a migração automática

**Pronto!** 🎉
