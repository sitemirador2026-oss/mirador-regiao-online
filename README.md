# Mirador e Região Online - Site Estático

Portal de notícias com hospedagem gratuita ilimitada no Render.

## 🚀 Deploy no Render (GRATUITO ILIMITADO!)

Este projeto usa **Static Sites** do Render, que oferece hospedagem **100% gratuita e ilimitada**.

### Passo 1: Conectar ao GitHub

1. Acesse [dashboard.render.com](https://dashboard.render.com)
2. Clique em **"New +"** → **"Static Site"**
3. Conecte seu repositório GitHub `mirador-regiao-online`

### Passo 2: Configurar Site Público

- **Name**: `mirador-web`
- **Branch**: `main`
- **Root Directory**: `public`
- **Build Command**: (deixe vazio)
- **Publish Directory**: `public`

Clique em **"Create Static Site"**

### Passo 3: Configurar Painel Admin

Repita o processo:
- **Name**: `mirador-admin`
- **Root Directory**: `admin`
- **Publish Directory**: `admin`

### Passo 4: Acessar

Após o deploy (1-2 minutos):
- **Site**: `https://mirador-web.onrender.com`
- **Admin**: `https://mirador-admin.onrender.com`

**Login do Admin:**
- Email: `sitemirador2026@gmail.com`
- Senha: `Casa@21@21.`

## 💻 Desenvolvimento Local

### Abrir Diretamente no Navegador

Simplesmente abra os arquivos HTML:
- `public/index.html` - Site público
- `admin/index.html` - Painel admin

**Funciona perfeitamente sem servidor!** ✅

### Ou use um servidor local simples

```bash
# Python
cd public
python -m http.server 8000

# Node.js
npx serve public
```

## 📁 Estrutura

```
mirador-regiao-online/
├── public/              # Site público
│   ├── index.html      # Página inicial
│   ├── noticia.html    # Página de notícia
│   ├── css/
│   │   └── styles.css  # Estilos
│   └── js/
│       └── app.js      # JavaScript
└── admin/              # Painel admin
    └── index.html      # Login e dashboard
```

## 💾 Armazenamento de Dados

Os dados são salvos no **localStorage** do navegador:
- ✅ Funciona offline
- ✅ Sem necessidade de banco de dados
- ✅ Simples e rápido
- ⚠️ Dados são locais (cada navegador tem seus próprios dados)

## 🎨 Funcionalidades

### Site Público
- ✅ Home com notícias em destaque
- ✅ Filtro por categoria
- ✅ Busca de notícias
- ✅ Design responsivo
- ✅ Menu mobile

### Painel Admin
- ✅ Login seguro
- ✅ Dashboard com estatísticas
- ✅ Listagem de notícias
- ✅ Exclusão de notícias
- ✅ Link direto para o site

## 🆓 Vantagens do Static Site

- ✅ **Hospedagem gratuita ilimitada** no Render
- ✅ Abre direto no navegador (sem servidor)
- ✅ Deploy instantâneo
- ✅ Mais rápido que sites dinâmicos
- ✅ Funciona offline
- ✅ Fácil de editar

## 🔒 Segurança

**IMPORTANTE:** Altere as credenciais de admin após o primeiro acesso!

Edite o arquivo `admin/index.html` e mude:
```javascript
const ADMIN_EMAIL = 'seu-email@exemplo.com';
const ADMIN_PASSWORD = 'sua-senha-segura';
```

## 📝 Licença

Projeto privado - Mirador e Região Online
