// Firebase Database Functions v2.1

console.log('[Firebase DB] v2.1 - Script carregado');

// Flag para rastrear se as configurações foram carregadas
let settingsLoaded = {
    colors: false,
    brand: false
};

// Iniciar listeners em tempo real
function startRealtimeListeners() {
    console.log('[Firebase DB] Iniciando listeners em tempo real...');
    
    // Listener para cores
    db.collection('settings').doc('colors')
        .onSnapshot((doc) => {
            if (doc.exists) {
                console.log('[Firebase DB] Cores atualizadas:', doc.data());
                applyColors(doc.data());
                localStorage.setItem('publicSiteColors', JSON.stringify(doc.data()));
                settingsLoaded.colors = true;
                hideLoadingWarning();
            }
        }, (error) => {
            console.error('[Firebase DB] Erro ao carregar cores:', error.code, error.message);
            if (error.code === 'permission-denied') {
                showPermissionError();
            }
            // Tentar localStorage
            loadColorsFromLocalStorage();
        });
    
    // Listener para marca
    db.collection('settings').doc('brand')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                console.log('[Firebase DB] Marca atualizada:', data);
                console.log('[Firebase DB] Logo presente?', !!data.logo, 'Tamanho:', data.logo ? data.logo.length : 0);
                console.log('[Firebase DB] SiteName:', data.siteName);
                applyBrand(data);
                localStorage.setItem('publicSiteBrand', JSON.stringify(data));
                settingsLoaded.brand = true;
                hideLoadingWarning();
            } else {
                console.log('[Firebase DB] Documento brand NÃO EXISTE no Firebase');
            }
        }, (error) => {
            console.error('[Firebase DB] Erro ao carregar marca:', error.code, error.message);
            if (error.code === 'permission-denied') {
                showPermissionError();
            }
            // Tentar localStorage
            loadBrandFromLocalStorage();
        });
}

// Mostrar erro de permissão
function showPermissionError() {
    console.error('╔════════════════════════════════════════════════════════════════╗');
    console.error('║  ERRO DE PERMISSÃO DO FIREBASE                                 ║');
    console.error('║                                                                ║');
    console.error('║  O site não consegue ler as configurações do painel admin.    ║');
    console.error('║                                                                ║');
    console.error('║  SOLUÇÃO:                                                      ║');
    console.error('║  1. Acesse: https://console.firebase.google.com                ║');
    console.error('║  2. Selecione o projeto: sitemirador-fb33d                     ║');
    console.error('║  3. Vá em "Firestore Database" > "Regras"                       ║');
    console.error('║  4. Atualize as regras para:                                   ║');
    console.error('║                                                                ║');
    console.error('║  match /settings/{docId} {                                     ║');
    console.error('║    allow read: if true;  // Leitura pública                     ║');
    console.error('║    allow write: if request.auth != null;                        ║');
    console.error('║  }                                                             ║');
    console.error('║                                                                ║');
    console.error('╚════════════════════════════════════════════════════════════════╝');
    
    // Mostrar aviso visual após 3 segundos se as configurações não carregarem
    setTimeout(() => {
        if (!settingsLoaded.colors && !settingsLoaded.brand) {
            showConfigWarning();
        }
    }, 3000);
}

// Mostrar aviso visual na página
function showConfigWarning() {
    // Verificar se já existe
    if (document.getElementById('firebase-warning')) return;
    
    const warning = document.createElement('div');
    warning.id = 'firebase-warning';
    warning.innerHTML = `
        <div style="position:fixed; top:80px; right:20px; background:#fee2e2; border:2px solid #ef4444; 
                    color:#991b1b; padding:16px; border-radius:8px; max-width:350px; z-index:9999;
                    box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); font-family:sans-serif; font-size:14px;">
            <strong style="display:block; margin-bottom:8px; font-size:16px;">⚠️ Configurações não carregadas</strong>
            <p style="margin:0 0 10px 0; line-height:1.5;">
                O site não conseguiu carregar as configurações do painel admin.
            </p>
            <p style="margin:0 0 10px 0; font-size:13px;">
                <strong>Provável causa:</strong> Regras de segurança do Firebase
            </p>
            <button onclick="this.parentElement.remove()" 
                    style="background:#ef4444; color:white; border:none; padding:8px 16px; 
                           border-radius:4px; cursor:pointer; font-weight:bold;">
                Fechar
            </button>
            <button onclick="window.open('README-FIREBASE.md','_blank')" 
                    style="background:white; color:#991b1b; border:1px solid #991b1b; 
                           padding:8px 16px; border-radius:4px; cursor:pointer; margin-left:8px;">
                Ver solução
            </button>
        </div>
    `;
    document.body.appendChild(warning);
}

function hideLoadingWarning() {
    const warning = document.getElementById('firebase-warning');
    if (warning) warning.remove();
}

// Carregar do localStorage
function loadColorsFromLocalStorage() {
    const saved = localStorage.getItem('publicSiteColors');
    if (saved) {
        try {
            const colors = JSON.parse(saved);
            console.log('[Firebase DB] Cores carregadas do localStorage');
            applyColors(colors);
            settingsLoaded.colors = true;
        } catch (e) {
            console.error('[Firebase DB] Erro ao parsear cores:', e);
        }
    }
}

function loadBrandFromLocalStorage() {
    const saved = localStorage.getItem('publicSiteBrand');
    if (saved) {
        try {
            const brand = JSON.parse(saved);
            console.log('[Firebase DB] Marca carregada do localStorage');
            applyBrand(brand);
            settingsLoaded.brand = true;
        } catch (e) {
            console.error('[Firebase DB] Erro ao parsear marca:', e);
        }
    }
}

// Aplicar cores
function applyColors(colors) {
    if (!colors) return;
    
    const root = document.documentElement;
    let count = 0;
    
    const colorMap = {
        'Primary': '--primary',
        'Secondary': '--secondary',
        'Accent': '--accent',
        'Background': '--background',
        'Foreground': '--foreground',
        'Muted': '--muted',
        'MutedForeground': '--muted-foreground'
    };
    
    for (const [key, cssVar] of Object.entries(colorMap)) {
        if (colors[key]) {
            root.style.setProperty(cssVar, colors[key]);
            count++;
        }
    }
    
    console.log('[Aplicar Cores]', count, 'cores aplicadas');
}

// Aplicar marca
function applyBrand(brand) {
    console.log('[Aplicar Marca] Iniciando...', brand);
    
    if (!brand) {
        console.log('[Aplicar Marca] Nenhuma marca recebida');
        return;
    }
    
    // Nome do site
    if (brand.siteName) {
        document.title = brand.siteName;
        const titleEl = document.getElementById('siteTitle');
        if (titleEl) titleEl.textContent = brand.siteName;
    }
    
    // Logo ou texto
    const logoImg = document.getElementById('siteLogoImg');
    const logoText = document.getElementById('siteLogoText');
    
    console.log('[Aplicar Marca] Elementos - logoImg:', !!logoImg, 'logoText:', !!logoText);
    console.log('[Aplicar Marca] Tem logo?', !!brand.logo);
    
    if (brand.logo && logoImg) {
        console.log('[Aplicar Marca] Aplicando logo...');
        logoImg.src = brand.logo;
        logoImg.style.display = 'block';
        logoImg.alt = brand.siteName || 'Logo';
        if (logoText) logoText.style.display = 'none';
        console.log('[Aplicar Marca] ✅ Logo aplicada!');
    } else if (brand.siteName && logoText) {
        console.log('[Aplicar Marca] Aplicando texto:', brand.siteName);
        logoText.textContent = brand.siteName;
        logoText.style.display = 'block';
        if (logoImg) logoImg.style.display = 'none';
        console.log('[Aplicar Marca] ✅ Texto aplicado!');
    } else {
        console.log('[Aplicar Marca] ❌ Não foi possível aplicar marca');
    }
    
    // Footer
    const footerSiteName = document.getElementById('footerSiteName');
    if (footerSiteName && brand.siteName) {
        footerSiteName.textContent = brand.siteName;
    }
}

// Funções de carregamento
async function loadColorsFromFirebase() {
    try {
        const doc = await db.collection('settings').doc('colors').get();
        return doc.exists ? doc.data() : null;
    } catch (error) {
        console.error('[Firebase DB] Erro:', error.code);
        return null;
    }
}

async function loadBrandFromFirebase() {
    try {
        const doc = await db.collection('settings').doc('brand').get();
        return doc.exists ? doc.data() : null;
    } catch (error) {
        console.error('[Firebase DB] Erro:', error.code);
        return null;
    }
}

// Funções principais
async function applyFirebaseColors() {
    const colors = await loadColorsFromFirebase();
    if (colors) {
        applyColors(colors);
        localStorage.setItem('publicSiteColors', JSON.stringify(colors));
        settingsLoaded.colors = true;
        return true;
    }
    return false;
}

async function applyFirebaseBrand() {
    const brand = await loadBrandFromFirebase();
    if (brand) {
        applyBrand(brand);
        localStorage.setItem('publicSiteBrand', JSON.stringify(brand));
        settingsLoaded.brand = true;
        return true;
    }
    return false;
}

// Carregar notícias
async function loadNewsFromFirebase() {
    try {
        const snapshot = await db.collection('news').orderBy('date', 'desc').get();
        const news = [];
        snapshot.forEach(doc => news.push({ id: doc.id, ...doc.data() }));
        return news;
    } catch (error) {
        console.error('[Firebase DB] Erro ao carregar notícias:', error);
        return [];
    }
}

async function loadNewsById(id) {
    try {
        const doc = await db.collection('news').doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
        console.error('[Firebase DB] Erro:', error);
        return null;
    }
}

async function incrementViews(newsId) {
    try {
        await db.collection('news').doc(newsId).update({
            views: firebase.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error('[Firebase DB] Erro:', error);
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Firebase DB] DOM carregado, iniciando...');
    
    // Carregar imediatamente
    applyFirebaseColors();
    applyFirebaseBrand();
    
    // Iniciar listeners em tempo real
    startRealtimeListeners();
});

// Exportar funções
window.applyFirebaseColors = applyFirebaseColors;
window.applyFirebaseBrand = applyFirebaseBrand;
window.loadNewsFromFirebase = loadNewsFromFirebase;
window.loadNewsById = loadNewsById;
window.incrementViews = incrementViews;

console.log('[Firebase DB] v2.1 - Pronto!');
