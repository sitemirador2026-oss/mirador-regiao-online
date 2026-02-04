# Regras de Segurança do Firebase

## Firestore Database Rules

Para que todas as funcionalidades funcionem corretamente, atualize as regras de segurança do Firestore no console do Firebase:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Notícias - leitura pública, escrita apenas autenticada
    match /news/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Stories ativos - leitura pública, escrita apenas autenticada
    match /stories/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Stories arquivados - apenas admins autenticados
    match /storiesArchive/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Configurações - leitura pública, escrita apenas autenticada
    match /settings/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Categorias - leitura pública, escrita apenas autenticada
    match /categories/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## Firebase Storage Rules

Para permitir upload de imagens e vídeos para stories:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /stories/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null 
                   && request.resource.size < 50 * 1024 * 1024
                   && (request.resource.contentType.matches('image/.*') 
                       || request.resource.contentType.matches('video/.*'));
    }
    
    match /news/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## Como aplicar:

1. Acesse o [Console do Firebase](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá em "Firestore Database" > "Regras"
4. Cole o código das regras do Firestore
5. Clique em "Publicar"
6. Vá em "Storage" > "Regras"
7. Cole o código das regras do Storage
8. Clique em "Publicar"

---

**Nota:** As regras acima permitem que qualquer usuário autenticado (logado no painel admin) possa criar, editar e excluir conteúdo. Se precisar de regras mais restritivas (apenas usuários específicos), entre em contato.
