// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBIIAcATNjWCO8aMYZMKxVcqV37DwmixVI",
    authDomain: "sitemirador-fb33d.firebaseapp.com",
    projectId: "sitemirador-fb33d",
    storageBucket: "sitemirador-fb33d.firebasestorage.app",
    messagingSenderId: "341361537788",
    appId: "1:341361537788:web:d0948a0e25e7b89e419d79"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Inicializar Firestore
const db = firebase.firestore();

// Configurar para usar dados offline
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Múltiplas abas abertas, persistência desabilitada');
        } else if (err.code == 'unimplemented') {
            console.log('Navegador não suporta persistência');
        }
    });

console.log('Firebase inicializado com sucesso!');
