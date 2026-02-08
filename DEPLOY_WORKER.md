# Deploy do Cloudflare Worker

Este Worker substitui o servidor Node.js no Render para fazer upload de arquivos para o R2.

## Vantagens

- ✅ **Nunca dorme** - sempre responde instantaneamente
- ✅ **100.000 requests/dia grátis** - impossível estourar para um portal local
- ✅ **Mesma rede do R2** - upload rápido
- ✅ **Sem servidor para manter** - deploy automático

## Passo a passo do Deploy

### 1. Acesse o Cloudflare Dashboard

1. Vá para https://dash.cloudflare.com
2. Faça login com sua conta

### 2. Crie o Worker

1. No menu lateral, clique em **"Workers & Pages"**
2. Clique em **"Create application"**
3. Selecione **"Create Worker"**
4. Dê um nome: `mirador-r2-worker`
5. Clique em **"Deploy"**

### 3. Configure as Variáveis de Ambiente

1. No Worker criado, vá em **"Settings"** (aba acima)
2. Clique em **"Variables"**
3. Adicione as seguintes variáveis (como "Secret"):

| Nome | Valor |
|------|-------|
| `R2_ACCESS_KEY_ID` | `82b8cac3269b84905aff1d560f9bc958` |
| `R2_SECRET_ACCESS_KEY` | `2aa8ee9d9bf6da4b5d7796cce1853e8bc45274ade8d88d3a70c6fd9f6989232bd` |

4. Clique em **"Save"**

### 4. Cole o Código

1. Volte para a aba **"Quick edit"** (ou clique em "Edit code")
2. Apague TODO o código padrão
3. Cole o conteúdo do arquivo `cloudflare-worker.js` (deste repositório)
4. Clique em **"Save and deploy"**

### 5. Teste o Worker

Acesse no navegador:
```
https://mirador-r2-worker.seu-subdominio.workers.dev/api/status
```

Deve retornar:
```json
{"status":"ok","service":"mirador-r2-worker"}
```

### 6. Atualize o Frontend

No arquivo `admin/js/r2-client.js`, atualize a URL:

```javascript
this.baseUrl = 'https://mirador-r2-worker.seu-subdominio.workers.dev';
```

Substitua pelo URL real do seu Worker.

### 7. Commit e Deploy

```bash
git add .
git commit -m "Migra upload para Cloudflare Worker (elimina Render)"
git push
```

## Configuração de CORS (se necessário)

Se der erro de CORS no frontend, adicione seu domínio no Worker:

```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://seu-dominio.com', // especifique seu domínio
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
```

## Monitoramento

No Cloudflare Dashboard > Workers & Pages > mirador-r2-worker:
- Veja quantas requests foram feitas
- Verifique logs de erro em "Real-time logs"

## Troubleshooting

### Erro "Unauthorized"
Verifique se as credenciais do R2 estão corretas nas variáveis de ambiente.

### Erro de CORS
Verifique se o `Access-Control-Allow-Origin` está configurado corretamente.

### Upload muito lento
O Worker tem limites de tamanho. Arquivos grandes (>100MB) podem ter problemas.

## Limite do Plano Gratuito

- **100.000 requests/dia** - praticamente infinito para uploads
- **10ms CPU time** por request - suficiente para uploads
- **Sub-request limit** - pode fazer chamadas para o R2

Para um portal de notícias local, você nunca vai atingir esses limites.

## Próximos Passos

Depois de configurado, você pode:
1. ✅ Desligar o `mirador-server` no Render (economiza as 750h)
2. ✅ Manter apenas `mirador-web` e `mirador-admin` (static sites)
3. ✅ O upload funcionará 24/7 sem "dormir"