# ðŸ”§ ConfiguraÃ§Ã£o do Firebase - ResoluÃ§Ã£o de Problemas

## âŒ Problema
As configuraÃ§Ãµes do painel admin NÃƒO estÃ£o aparecendo no site pÃºblico.

## âœ… SoluÃ§Ã£o

### 1. ATUALIZAR REGRAS DE SEGURANÃ‡A DO FIREBASE

O site pÃºblico estÃ¡ em **mirador-web.onrender.com** e o admin em **mirador-admin.onrender.com** (domÃ­nios diferentes). Por isso, o site PRECISA ter permissÃ£o para LER as configuraÃ§Ãµes do Firebase.

#### Passo a passo:

1. Acesse: https://console.firebase.google.com
2. Selecione o projeto: **sitemirador-fb33d**
3. No menu lateral, clique em **"Firestore Database"**
4. Clique na aba **"Regras"**
5. Substitua TUDO pelo cÃ³digo abaixo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.token.email == 'sitemirador2026@gmail.com';
    }

    function isOnlyViewIncrement() {
      return request.resource.data.diff(resource.data).changedKeys().hasOnly(['views'])
        && request.resource.data.views is int
        && request.resource.data.views == ((resource.data.views is int) ? resource.data.views : 0) + 1;
    }

    match /news/{newsId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || isOnlyViewIncrement();
    }

    match /settings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

6. Clique em **"Publicar"**

### 2. LIMPAR CACHE DO NAVEGADOR

Depois de atualizar as regras, limpe o cache:

#### No site pÃºblico:
1. Aperte **F12** (abre console)
2. Clique com botÃ£o direito no botÃ£o de atualizar (ðŸ”„)
3. Selecione **"Esvaziar cache e atualizar"**

OU

1. Aperte **Ctrl + Shift + R** (Windows/Linux)
2. Ou **Cmd + Shift + R** (Mac)

### 3. TESTAR

1. Abra o painel admin: https://mirador-admin.onrender.com
2. FaÃ§a login
3. VÃ¡ em **"ConfiguraÃ§Ãµes"**
4. Altere uma cor (ex: mude o azul para vermelho #ff0000)
5. Clique em **"Salvar AlteraÃ§Ãµes"**
6. Abra o site pÃºblico: https://mirador-web.onrender.com
7. Aperte **F12** e verifique o console
8. VocÃª deve ver: `[Firebase DB] Cores atualizadas: {...}`

### 4. SE AINDA NÃƒO FUNCIONAR

Abra o console do navegador (F12) no site pÃºblico e verifique se aparece:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.token.email == 'sitemirador2026@gmail.com';
    }

    function isOnlyViewIncrement() {
      return request.resource.data.diff(resource.data).changedKeys().hasOnly(['views'])
        && request.resource.data.views is int
        && request.resource.data.views == ((resource.data.views is int) ? resource.data.views : 0) + 1;
    }

    match /news/{newsId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || isOnlyViewIncrement();
    }

    match /settings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

Se aparecer erro de **"permission-denied"**, as regras do Firebase nÃ£o foram atualizadas corretamente.

Se nÃ£o aparecer nada, o cache do navegador estÃ¡ impedindo o carregamento dos novos arquivos.

---

## ðŸ” O que foi implementado

### No Admin (mirador-admin.onrender.com):
- âœ… Salva cores no Firebase: `db.collection('settings').doc('colors')`
- âœ… Salva marca no Firebase: `db.collection('settings').doc('brand')`
- âœ… Logs detalhados no console

### No Site PÃºblico (mirador-web.onrender.com):
- âœ… Listeners em tempo real (onSnapshot)
- âœ… Quando o admin salva, o site atualiza automaticamente
- âœ… Fallback para localStorage se Firebase falhar
- âœ… Cache-busting nos arquivos JS (v2)
- âœ… Logs detalhados no console

---

## ðŸš¨ ERROS COMUNS

### "permission-denied"
**Significado:** As regras de seguranÃ§a do Firebase nÃ£o permitem leitura pÃºblica.
**SoluÃ§Ã£o:** Atualize as regras conforme o passo 1 acima.

### Nada acontece (sem logs no console)
**Significado:** O navegador estÃ¡ usando arquivos em cache.
**SoluÃ§Ã£o:** Limpe o cache (Ctrl + Shift + R) ou use modo anÃ´nimo (Ctrl + Shift + N).

### "Firebase DB v2.0" em vez de "v2.1"
**Significado:** O arquivo JS antigo ainda estÃ¡ em cache.
**SoluÃ§Ã£o:** Limpe o cache completamente ou espere alguns minutos.

---

## ðŸ“ž Suporte

Se mesmo apÃ³s seguir todos os passos nÃ£o funcionar:

1. Abra o site pÃºblico
2. Aperte F12 (console)
3. Tire um print da tela
4. Envie para anÃ¡lise

