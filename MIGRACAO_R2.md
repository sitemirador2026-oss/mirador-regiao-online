# Migração Firebase → R2

Guia para migrar imagens em base64 do Firebase para o Cloudflare R2.

## Pré-requisitos

- ✅ Cloudflare Worker configurado e online
- ✅ Acesso ao painel admin do site
- ✅ Navegador moderno (Chrome, Firefox, Edge)

## Como Executar a Migração

### 1. Acesse o Painel Admin

1. Vá para `https://seu-site.com/admin`
2. Faça login com suas credenciais

### 2. Abra o Console do Navegador

Pressione `F12` ou `Ctrl+Shift+J` (Windows/Linux) ou `Cmd+Option+J` (Mac)

### 3. Execute o Script

No console, digite:

```javascript
await migrateToR2()
```

Pressione **Enter**.

### 4. Acompanhe o Progresso

O console mostrará:
- 📰 Notícia sendo processada
- 📸 Imagens detectadas
- 📦 Tamanho do arquivo
- ✅ Sucesso ou ❌ Erro

### 5. Resumo Final

Ao final, aparecerá:
```
==================================================
📊 RESUMO DA MIGRAÇÃO
==================================================
Total de notícias: 34
✅ Migradas: 28
⏭️  Puladas: 4
❌ Erros: 2
==================================================
```

## O que o Script Faz

1. **Busca** todas as notícias do Firebase
2. **Identifica** imagens em base64
3. **Converte** base64 → arquivo
4. **Envia** para o R2 via Worker
5. **Atualiza** a notícia com a nova URL

## Notas Importantes

### Imagens Já Migradas
- Notícias com URLs (http://...) são puladas automaticamente
- Não há risco de migrar duas vezes

### Backup
- As imagens originais em base64 permanecem no Firebase até você excluí-las manualmente
- As novas imagens vão para a pasta `migracao/` no R2

### Erros Comuns

| Erro | Solução |
|------|---------|
| Worker offline | Verifique se `mirador-r2` está deployado |
| Timeout | Imagem muito grande (> 10MB), tente novamente |
| CORS | Atualize a página e tente novamente |

## Verificação Pós-Migração

Após a migração, verifique:

1. **No R2 Dashboard**: https://dash.cloudflare.com → R2 → mirador-regiao-online
   - Deve aparecer a pasta `migracao/` com os arquivos

2. **No site**: Abra algumas notícias
   - As imagens devem carregar normalmente

3. **No Firebase**: As notícias migradas terão o campo `migratedAt`

## Script de Verificação

Para verificar quais notícias ainda têm base64:

```javascript
// No console do admin
const snapshot = await firebase.firestore().collection('news').get();
let comBase64 = 0;
snapshot.forEach(doc => {
  const data = doc.data();
  if (data.image && data.image.startsWith('data:image')) {
    comBase64++;
    console.log('⚠️  Base64:', doc.id, data.title);
  }
});
console.log(`\nTotal com base64: ${comBase64}`);
```

## Suporte

Se encontrar problemas:
1. Verifique o console do navegador por erros
2. Confirme que o Worker está online: https://mirador-r2.sitemirador2026.workers.dev/api/worker/status
3. Verifique o R2 Dashboard se o bucket está acessível