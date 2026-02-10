// Firebase Database Functions v2.8 - Card Tooltip

console.log('[Firebase DB] v2.2 - Script carregado');

// Flag para rastrear se as configuraÃ§Ãµes foram carregadas
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
                console.log('[Firebase DB] Documento brand NÃƒO EXISTE no Firebase');
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

// Mostrar erro de permissÃ£o
function showPermissionError() {
    console.error('â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
    console.error('â•‘  ERRO DE PERMISSÃƒO DO FIREBASE                                 â•‘');
    console.error('â•‘                                                                â•‘');
    console.error('â•‘  O site nÃ£o consegue ler as configuraÃ§Ãµes do painel admin.    â•‘');
    console.error('â•‘                                                                â•‘');
    console.error('â•‘  SOLUÃ‡ÃƒO:                                                      â•‘');
    console.error('â•‘  1. Acesse: https://console.firebase.google.com                â•‘');
    console.error('â•‘  2. Selecione o projeto: sitemirador-fb33d                     â•‘');
    console.error('â•‘  3. VÃ¡ em "Firestore Database" > "Regras"                       â•‘');
    console.error('â•‘  4. Atualize as regras para:                                   â•‘');
    console.error('â•‘                                                                â•‘');
    console.error('â•‘  match /settings/{docId} {                                     â•‘');
    console.error('â•‘    allow read: if true;  // Leitura pÃºblica                     â•‘');
    console.error('â•‘    allow write: if request.auth != null;                        â•‘');
    console.error('â•‘  }                                                             â•‘');
    console.error('â•‘                                                                â•‘');
    console.error('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
    
    // Mostrar aviso visual apÃ³s 3 segundos se as configuraÃ§Ãµes nÃ£o carregarem
    setTimeout(() => {
        if (!settingsLoaded.colors && !settingsLoaded.brand) {
            showConfigWarning();
        }
    }, 3000);
}

// Mostrar aviso visual na pÃ¡gina
function showConfigWarning() {
    // Verificar se jÃ¡ existe
    if (document.getElementById('firebase-warning')) return;
    
    const warning = document.createElement('div');
    warning.id = 'firebase-warning';
    warning.innerHTML = `
        <div style="position:fixed; top:80px; right:20px; background:#fee2e2; border:2px solid #ef4444; 
                    color:#991b1b; padding:16px; border-radius:8px; max-width:350px; z-index:9999;
                    box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); font-family:sans-serif; font-size:14px;">
            <strong style="display:block; margin-bottom:8px; font-size:16px;">âš ï¸ ConfiguraÃ§Ãµes nÃ£o carregadas</strong>
            <p style="margin:0 0 10px 0; line-height:1.5;">
                O site nÃ£o conseguiu carregar as configuraÃ§Ãµes do painel admin.
            </p>
            <p style="margin:0 0 10px 0; font-size:13px;">
                <strong>ProvÃ¡vel causa:</strong> Regras de seguranÃ§a do Firebase
            </p>
            <button onclick="this.parentElement.remove()" 
                    style="background:#ef4444; color:white; border:none; padding:8px 16px; 
                           border-radius:4px; cursor:pointer; font-weight:bold;">
                Fechar
            </button>
            <button onclick="window.open('README-FIREBASE.md','_blank')" 
                    style="background:white; color:#991b1b; border:1px solid #991b1b; 
                           padding:8px 16px; border-radius:4px; cursor:pointer; margin-left:8px;">
                Ver soluÃ§Ã£o
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
        'MutedForeground': '--muted-foreground',
        'Header': '--header-bg',
        'HeaderText': '--header-text',
        'Card': '--card-bg',
        'FooterText': '--footer-text'
    };
    
    for (const [key, cssVar] of Object.entries(colorMap)) {
        if (colors[key]) {
            root.style.setProperty(cssVar, colors[key]);
            count++;
        }
    }
    
    console.log('[Aplicar Cores]', count, 'cores aplicadas');

    const headerColorSource = colors.Header || getComputedStyle(root).getPropertyValue('--header-bg').trim();
    const stripColor = darkenColorByPercent(headerColorSource, 10);
    if (stripColor) {
        root.style.setProperty('--header-top-strip-bg', stripColor);
    }
    
    // Ajustar cor do texto do footer baseado na cor de fundo
    adjustFooterTextColor(colors);
}

// Detectar luminosidade da cor e retornar branco ou preto
function getContrastColor(hexColor) {
    // Remover # se existir
    const hex = hexColor.replace('#', '');
    
    // Converter para RGB
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Calcular luminosidade (fÃ³rmula YIQ)
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    // Retornar branco para fundos escuros, preto para fundos claros
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

function parseCssColorToRgb(value) {
    const color = String(value || '').trim();
    if (!color) return null;

    const hexMatch = color.match(/^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/);
    if (hexMatch) {
        const raw = hexMatch[1];
        const normalized = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16)
        };
    }

    const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',').map(part => parseFloat(part.trim()));
        if (parts.length >= 3 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && Number.isFinite(parts[2])) {
            return {
                r: Math.max(0, Math.min(255, Math.round(parts[0]))),
                g: Math.max(0, Math.min(255, Math.round(parts[1]))),
                b: Math.max(0, Math.min(255, Math.round(parts[2])))
            };
        }
    }

    return null;
}

function darkenColorByPercent(color, percent = 10) {
    const rgb = parseCssColorToRgb(color);
    if (!rgb) return '';

    const factor = Math.max(0, Math.min(1, 1 - (percent / 100)));
    const r = Math.round(rgb.r * factor);
    const g = Math.round(rgb.g * factor);
    const b = Math.round(rgb.b * factor);
    return `rgb(${r}, ${g}, ${b})`;
}

function normalizeBrandText(value) {
    const text = String(value || '').normalize('NFC');
    const fixWord = (match, correctWord) => {
        if (match === match.toUpperCase()) return correctWord.toLocaleUpperCase('pt-BR');
        if (match.charAt(0) === match.charAt(0).toUpperCase()) {
            return correctWord.charAt(0).toUpperCase() + correctWord.slice(1);
        }
        return correctWord;
    };

    return text
        .replace(/\bregiao\b/gi, match => fixWord(match, 'região'))
        .replace(/\bregi\u00e3o\b/gi, match => fixWord(match, 'região'))
        .replace(/\bnoticias\b/gi, match => fixWord(match, 'notícias'));
}

// Ajustar cor do texto do footer automaticamente
function adjustFooterTextColor(colors) {
    const footerBg = colors.Muted || '#f1f5f9';
    const contrastColor = getContrastColor(footerBg);
    
    const root = document.documentElement;
    root.style.setProperty('--footer-text-auto', contrastColor);
    
    console.log('[Aplicar Cores] Cor do footer ajustada:', contrastColor, 'para fundo:', footerBg);
}

// Aplicar marca
function applyBrand(brand) {
    console.log('[Aplicar Marca] Iniciando...', brand);

    if (!brand) {
        console.log('[Aplicar Marca] Nenhuma marca recebida');
        return;
    }

    const normalizedSiteName = normalizeBrandText(brand.siteName || '');
    const siteName = normalizedSiteName || 'Mirador e Região Online';
    const siteTagline = normalizeBrandText((brand.siteTagline && String(brand.siteTagline).trim()) || 'Portal de Not\u00edcias');

    // Nome do site
    if (siteName) {
        document.title = siteName;
        const titleEl = document.getElementById('siteTitle');
        if (titleEl) titleEl.textContent = siteName;
    }

    // Logo, nome e subtitulo no header
    const logoImg = document.getElementById('siteLogoImg');
    const logoFallback = document.getElementById('siteLogoFallback');
    const logoText = document.getElementById('siteLogoText');
    const siteTaglineText = document.getElementById('siteTaglineText');
    const topStripName = document.getElementById('siteTopStripName');
    const topStripTagline = document.getElementById('siteTopStripTagline');
    const initials = String(siteName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('') || 'MRO';

    console.log('[Aplicar Marca] Elementos - logoImg:', !!logoImg, 'logoFallback:', !!logoFallback, 'logoText:', !!logoText, 'tagline:', !!siteTaglineText);
    console.log('[Aplicar Marca] Tem logo?', !!brand.logo);

    if (brand.logo && logoImg) {
        console.log('[Aplicar Marca] Aplicando logo...');
        logoImg.src = brand.logo;
        logoImg.style.display = 'block';
        logoImg.alt = siteName || 'Logo';
        if (logoFallback) logoFallback.style.display = 'none';
        console.log('[Aplicar Marca] Logo aplicada!');
    } else if (logoImg) {
        logoImg.style.display = 'none';
        if (logoFallback) {
            logoFallback.style.display = 'flex';
            logoFallback.textContent = initials;
        }
    }

    if (siteName && logoText) {
        console.log('[Aplicar Marca] Aplicando texto:', siteName);
        logoText.textContent = siteName;
        logoText.style.display = 'block';
        console.log('[Aplicar Marca] Texto aplicado!');
    }

    if (siteName && topStripName) {
        topStripName.textContent = normalizeBrandText(siteName).toLocaleUpperCase('pt-BR');
    }

    if (topStripTagline) {
        topStripTagline.textContent = normalizeBrandText(siteTagline || 'Portal de Not\u00edcias').toLocaleUpperCase('pt-BR');
    }

    if (siteTaglineText) {
        siteTaglineText.textContent = siteTagline;
        siteTaglineText.style.display = 'block';
    }

    // Footer
    const footerSiteName = document.getElementById('footerSiteName');
    if (footerSiteName && siteName) {
        footerSiteName.textContent = siteName;
    }
}
// FunÃ§Ãµes de carregamento
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

// FunÃ§Ãµes principais
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

// Carregar notÃ­cias
async function loadNewsFromFirebase() {
    try {
        const snapshot = await db.collection('news').orderBy('date', 'desc').get();
        const news = [];
        snapshot.forEach(doc => news.push({ id: doc.id, ...doc.data() }));
        return news;
    } catch (error) {
        console.error('[Firebase DB] Erro ao carregar notÃ­cias:', error);
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

// Aplicar layout
function applyLayout(layout) {
    if (!layout) return;
    
    const cardsPerRow = layout.cardsPerRow || 3;
    const instagramPostsVisible = Math.max(1, Math.min(12, Number(layout.instagramPostsVisible) || 4));
    const topBanners = layout.topBanners && typeof layout.topBanners === 'object'
        ? layout.topBanners
        : {};
    const root = document.documentElement;
    
    root.style.setProperty('--news-columns', cardsPerRow.toString());
    root.style.setProperty('--instagram-columns', instagramPostsVisible.toString());
    window.publicSiteLayoutConfig = {
        cardsPerRow,
        instagramPostsVisible,
        topBanners
    };
    window.dispatchEvent(new CustomEvent('public-layout-updated', {
        detail: window.publicSiteLayoutConfig
    }));
    console.log('[Aplicar Layout] Cards por linha:', cardsPerRow, '| Instagram visiveis:', instagramPostsVisible);
}

// Carregar layout do Firebase
async function applyFirebaseLayout() {
    try {
        const doc = await db.collection('settings').doc('layout').get();
        if (doc.exists) {
            applyLayout(doc.data());
            localStorage.setItem('publicSiteLayout', JSON.stringify(doc.data()));
            return true;
        }
    } catch (error) {
        console.error('[Firebase DB] Erro ao carregar layout:', error);
        // Tentar localStorage
        const saved = localStorage.getItem('publicSiteLayout');
        if (saved) {
            try {
                applyLayout(JSON.parse(saved));
                return true;
            } catch (e) {}
        }
    }
    return false;
}

// InicializaÃ§Ã£o
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Firebase DB] DOM carregado, iniciando...');
    
    // Carregar imediatamente
    applyFirebaseColors();
    applyFirebaseBrand();
    applyFirebaseLayout();
    
    // Iniciar listeners em tempo real
    startRealtimeListeners();
    
    // Listener para layout
    db.collection('settings').doc('layout').onSnapshot((doc) => {
        if (doc.exists) {
            console.log('[Firebase DB] Layout atualizado:', doc.data());
            applyLayout(doc.data());
            localStorage.setItem('publicSiteLayout', JSON.stringify(doc.data()));
        }
    });
});

// Exportar funÃ§Ãµes
window.applyFirebaseColors = applyFirebaseColors;
window.applyFirebaseBrand = applyFirebaseBrand;
window.loadNewsFromFirebase = loadNewsFromFirebase;
window.loadNewsById = loadNewsById;
window.incrementViews = incrementViews;

console.log('[Firebase DB] v2.2 - Pronto!');

