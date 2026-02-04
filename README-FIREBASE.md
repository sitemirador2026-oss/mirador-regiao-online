# 🔧 Configuração do Firebase - Resolução de Problemas

## ❌ Problema
As configurações do painel admin NÃO estão aparecendo no site público.

## ✅ Solução

### 1. ATUALIZAR REGRAS DE SEGURANÇA DO FIREBASE

O site público está em **mirador-web.onrender.com** e o admin em **mirador-admin.onrender.com** (domínios diferentes). Por isso, o site PRECISA ter permissão para LER as configurações do Firebase.

#### Passo a passo:

1. Acesse: https://console.firebase.google.com
2. Selecione o projeto: **sitemirador-fb33d**
3. No menu lateral, clique em **"Firestore Database"**
4. Clique na aba **"Regras"**
5. Substitua TUDO pelo código abaixo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir leitura pública de notícias
    match /news/{newsId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Permitir leitura pública de configurações
    match /settings/{settingId} {
      allow read: if true;  // IMPORTANTE!
      allow write: if request.auth != null;
    }
  }
}
```

6. Clique em **"Publicar"**

### 2. LIMPAR CACHE DO NAVEGADOR

Depois de atualizar as regras, limpe o cache:

#### No site público:
1. Aperte **F12** (abre console)
2. Clique com botão direito no botão de atualizar (🔄)
3. Selecione **"Esvaziar cache e atualizar"**

OU

1. Aperte **Ctrl + Shift + R** (Windows/Linux)
2. Ou **Cmd + Shift + R** (Mac)

### 3. TESTAR

1. Abra o painel admin: https://mirador-admin.onrender.com
2. Faça login
3. Vá em **"Configurações"**
4. Altere uma cor (ex: mude o azul para vermelho #ff0000)
5. Clique em **"Salvar Alterações"**
6. Abra o site público: https://mirador-web.onrender.com
7. Aperte **F12** e verifique o console
8. Você deve ver: `[Firebase DB] Cores atualizadas: {...}`

### 4. SE AINDA NÃO FUNCIONAR

Abra o console do navegador (F12) no site público e verifique se aparece:

```
[Firebase DB] v2.1 - Script carregado
[Firebase DB] v2.1 - Pronto!
[Firebase DB] Cores atualizadas: {...}
```

Se aparecer erro de **"permission-denied"**, as regras do Firebase não foram atualizadas corretamente.

Se não aparecer nada, o cache do navegador está impedindo o carregamento dos novos arquivos.

---

## 🔍 O que foi implementado

### No Admin (mirador-admin.onrender.com):
- ✅ Salva cores no Firebase: `db.collection('settings').doc('colors')`
- ✅ Salva marca no Firebase: `db.collection('settings').doc('brand')`
- ✅ Logs detalhados no console

### No Site Público (mirador-web.onrender.com):
- ✅ Listeners em tempo real (onSnapshot)
- ✅ Quando o admin salva, o site atualiza automaticamente
- ✅ Fallback para localStorage se Firebase falhar
- ✅ Cache-busting nos arquivos JS (v2)
- ✅ Logs detalhados no console

---

## 🚨 ERROS COMUNS

### "permission-denied"
**Significado:** As regras de segurança do Firebase não permitem leitura pública.
**Solução:** Atualize as regras conforme o passo 1 acima.

### Nada acontece (sem logs no console)
**Significado:** O navegador está usando arquivos em cache.
**Solução:** Limpe o cache (Ctrl + Shift + R) ou use modo anônimo (Ctrl + Shift + N).

### "Firebase DB v2.0" em vez de "v2.1"
**Significado:** O arquivo JS antigo ainda está em cache.
**Solução:** Limpe o cache completamente ou espere alguns minutos.

---

## 📞 Suporte

Se mesmo após seguir todos os passos não funcionar:

1. Abra o site público
2. Aperte F12 (console)
3. Tire um print da tela
4. Envie para análise
