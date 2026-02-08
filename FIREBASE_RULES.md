# Firebase Rules (Firestore + Storage)

Use estas regras no Firebase Console para:
- manter leitura publica de noticias/configuracoes;
- manter escrita administrativa no painel;
- permitir que o site publico incremente somente `views` ao abrir noticia/post.

## Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return isSignedIn() &&
        request.auth.token.email == 'sitemirador2026@gmail.com';
    }

    function isOnlyViewIncrement() {
      return request.resource.data.diff(resource.data).changedKeys().hasOnly(['views']) &&
        request.resource.data.views is int &&
        request.resource.data.views == ((resource.data.views is int) ? resource.data.views : 0) + 1;
    }

    match /news/{docId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || isOnlyViewIncrement();
    }

    match /settings/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /categories/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /stories/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /storiesArchive/{docId} {
      allow read, write: if isAdmin();
    }
  }
}
```

## Storage Rules (opcional)

Se nao usa Firebase Storage no plano atual, pode ignorar.

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## Como aplicar

1. Firebase Console -> Firestore Database -> Regras.
2. Cole as regras de Firestore acima.
3. Clique em `Publicar`.
4. (Opcional) Firebase Console -> Storage -> Regras.
5. Cole as regras de Storage e publique.

## Observacao

- Com estas regras, visitantes NAO podem editar noticia.
- Visitantes so conseguem incrementar `views` em +1 por requisicao.
- O painel admin continua com controle total via usuario admin.
