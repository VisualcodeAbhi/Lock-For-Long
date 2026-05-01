// Google Configuration
const GOOGLE_CLIENT_ID = '664114208940-kk82uu7rr9efpv0a6rm07mtv93uq3fek.apps.googleusercontent.com';

// Supabase Configuration
const SUPABASE_URL = 'https://ncfobvlhvdxtbhtmdegv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZm9idmxodmR4dGJodG1kZWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzEzNjEsImV4cCI6MjA5MzE0NzM2MX0.FG6u9dCtZu1vOG3qyM7PGBfLWLEVgdOaDo1zKuQX6w8';

let supabaseClient = null;

let currentUser = null;

// DOM Helper
const getEl = (id) => document.getElementById(id);

// Custom Toast Notification
function showToast(message, icon = "🚀") {
    let toast = getEl('customToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'customToast';
        toast.className = 'glass-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// --- Session Management ---
function checkAuth() {
    const saved = localStorage.getItem('lockOfLongUser');
    if (!saved && !window.location.href.includes('login.html')) {
        window.location.href = 'login.html';
    } else if (saved) {
        currentUser = JSON.parse(saved);
        updateUserUI();
    }
}

function updateUserUI() {
    const nameEl = getEl('userName');
    const avatarEl = getEl('userAvatar');
    if (nameEl) nameEl.textContent = currentUser.name;
    if (avatarEl) {
        avatarEl.src = currentUser.photoURL;
        avatarEl.style.display = 'block';
    }
}

const logoutBtn = getEl('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('lockOfLongUser');
        window.location.href = 'login.html';
    });
}

// --- Google Auth Logic ---
function handleCredentialResponse(response) {
    try {
        const responsePayload = decodeJwtResponse(response.credential);
        currentUser = {
            name: responsePayload.name,
            email: responsePayload.email,
            photoURL: responsePayload.picture
        };
        localStorage.setItem('lockOfLongUser', JSON.stringify(currentUser));
        window.location.href = 'index.html';
    } catch (e) {
        console.error("JWT Decode Error:", e);
    }
}

function decodeJwtResponse(token) {
    let base64Url = token.split('.')[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    let jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

window.onload = function () {
    if (typeof google !== 'undefined' && getEl('googleLoginBtnReal')) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse
        });
        google.accounts.id.renderButton(
            getEl("googleLoginBtnReal"),
            { theme: "outline", size: "large", width: "320" } 
        );
    }
};

// --- Dashboard Logic ---
async function updateDashboard() {
    const items = await getVaultItems();
    const counts = { image: 0, video: 0, audio: 0, document: 0, apk: 0, archive: 0 };
    let totalSize = 0;

    items.forEach(item => {
        totalSize += item.size || 0;
        const type = (item.fileType || '').toLowerCase();
        if (type.startsWith('image/')) counts.image++;
        else if (type.startsWith('video/')) counts.video++;
        else if (type.startsWith('audio/')) counts.audio++;
        else if (type.includes('pdf') || type.includes('word') || type.includes('text')) counts.document++;
        else if (item.filename.toLowerCase().endsWith('.apk')) counts.apk++;
        else if (type.includes('zip') || type.includes('rar')) counts.archive++;
    });

    for (const cat in counts) {
        const el = getEl(`count-${cat}`);
        if (el) el.textContent = counts[cat];
    }

    const sizeFormatted = formatBytes(totalSize);
    const storageUsedEl = getEl('storageUsed');
    if (storageUsedEl) storageUsedEl.textContent = `${sizeFormatted} / 64 GB`;
    const percent = Math.min((totalSize / (64 * 1024 * 1024 * 1024)) * 100, 100) || 1;
    const storageProgressBar = getEl('storageProgressBar');
    if (storageProgressBar) storageProgressBar.style.width = percent + '%';
}

// --- Supabase Upload Logic ---
const lockBtn = getEl('lockBtn');
if (lockBtn) {
    const fileInput = getEl('fileInput');
    const lockTimeSelect = getEl('lockTime');
    const customDateInput = getEl('customDate');
    const customDateGroup = document.querySelector('.custom-date-group');

    if (lockTimeSelect) {
        lockTimeSelect.addEventListener('change', (e) => {
            customDateGroup.style.display = e.target.value === 'custom' ? 'flex' : 'none';
        });
    }

    lockBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) return showToast("Please select a file.", "📂");
        if (!supabaseClient) return showToast("Supabase is not initialized yet.", "⚠️");

        let unlockTimeMs;
        if (lockTimeSelect.value === 'custom') {
            unlockTimeMs = new Date(customDateInput.value).getTime();
            if (isNaN(unlockTimeMs) || unlockTimeMs <= Date.now()) return showToast("Select a future date.", "⏳");
        } else {
            unlockTimeMs = Date.now() + (parseInt(lockTimeSelect.value) * 60 * 1000);
        }

        lockBtn.disabled = true;
        lockBtn.textContent = "Uploading to Cloud...";

        try {
            // 1. Upload to Supabase Storage
            const filePath = `${currentUser.email}/${Date.now()}_${file.name}`;
            const { data: uploadData, error: uploadError } = await supabaseClient
                .storage
                .from('vault')
                .upload(filePath, file, { cacheControl: '3600', upsert: false });

            if (uploadError) throw new Error("Storage Upload Failed: " + uploadError.message);

            // 2. Get Public URL
            const { data: urlData } = supabaseClient.storage.from('vault').getPublicUrl(filePath);
            const publicURL = urlData.publicUrl;

            // 3. Save Record to Database
            lockBtn.textContent = "Saving Record...";
            const { error: dbError } = await supabaseClient
                .from('vault_items')
                .insert([
                    {
                        filename: file.name,
                        file_url: publicURL,
                        size: file.size,
                        locked_at: Date.now(),
                        unlock_at: unlockTimeMs,
                        user_email: currentUser.email,
                        file_type: file.type || 'application/octet-stream'
                    }
                ]);

            if (dbError) throw new Error("Database Save Failed: " + dbError.message);

            showToast("Successfully locked in the Vault!", "💎");
            setTimeout(() => {
                window.location.href = 'index.html'; // Redirect back home
            }, 1800);
        } catch (err) {
            showToast(err.message, "⚠️");
            lockBtn.disabled = false;
            lockBtn.textContent = "Seal the Vault";
        }
    });
}

// --- Vault Logic ---
const vaultList = getEl('vaultList');
async function loadVaultItems() {
    if (!vaultList) return;
    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('type') || 'all';
    const viewTitle = getEl('viewTitle');
    if (viewTitle) viewTitle.textContent = filter.charAt(0).toUpperCase() + filter.slice(1);

    let items = await getVaultItems();
    
    if (filter !== 'all') {
        items = items.filter(item => {
            const type = (item.fileType || '').toLowerCase();
            if (filter === 'image') return type.startsWith('image/');
            if (filter === 'video') return type.startsWith('video/');
            if (filter === 'audio') return type.startsWith('audio/');
            if (filter === 'document') return type.includes('pdf') || type.includes('word') || type.includes('text');
            if (filter === 'apk') return item.filename.toLowerCase().endsWith('.apk');
            if (filter === 'archive') return type.includes('zip') || type.includes('rar');
            return false;
        });
    }

    vaultList.innerHTML = '';
    if (items.length === 0) {
        vaultList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; margin-top: 4rem;">No items found.</p>';
        return;
    }

    items.forEach(item => {
        const isUnlocked = Date.now() >= item.unlockAt;
        const el = document.createElement('div');
        el.className = `vault-item glass-panel ${isUnlocked ? 'vault-unlocked' : 'vault-locked'}`;
        el.innerHTML = `
            <div class="vault-icon">${isUnlocked ? '🔓' : '🔒'}</div>
            <div class="vault-status">${isUnlocked ? 'Ready' : 'Locked'}</div>
            <div class="countdown" id="cd-${item.id}"></div>
            <button class="unlock-btn" id="btn-${item.id}" ${!isUnlocked ? 'disabled' : ''}>${isUnlocked ? 'Open' : 'Waiting'}</button>
            ${isUnlocked ? `<button onclick="deleteFileRecord('${item.id}')" style="background:none;border:none;color:#ef4444;font-size:0.7rem;margin-top:12px;cursor:pointer;opacity:0.6;">Delete Record</button>` : ''}
        `;
        vaultList.appendChild(el);
        updateCD(item.id, item.unlockAt, isUnlocked);
        const btn = el.querySelector(`#btn-${item.id}`);
        if (btn) btn.addEventListener('click', () => openModal(item));
    });
}

// Global scope for onclick
window.deleteFileRecord = async (id) => {
    if (confirm("Delete this record forever?")) {
        const { error } = await supabaseClient.from('vault_items').delete().eq('id', id);
        if (error) {
            showToast("Delete failed: " + error.message, "⚠️");
        } else {
            showToast("Record permanently deleted.", "🗑️");
            loadVaultItems();
        }
    }
};

// --- Utilities ---
async function getVaultItems() {
    if (!currentUser || !supabaseClient) return [];
    try {
        const { data, error } = await supabaseClient
            .from('vault_items')
            .select('*')
            .eq('user_email', currentUser.email)
            .order('unlock_at', { ascending: true });
            
        if (error) throw error;
        
        return data.map(item => ({
            id: item.id,
            filename: item.filename,
            fileUrl: item.file_url,
            size: item.size,
            lockedAt: item.locked_at,
            unlockAt: item.unlock_at,
            fileType: item.file_type
        }));
    } catch (e) {
        console.error("Fetch Error:", e);
        return [];
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateCD(id, end, done) {
    const el = getEl(`cd-${id}`);
    if (!el || done) return;
    setInterval(() => {
        const dist = end - Date.now();
        if (dist <= 0) { el.textContent = '00:00:00'; return; }
        const d = Math.floor(dist / 86400000), h = Math.floor((dist % 86400000) / 3600000), m = Math.floor((dist % 3600000) / 60000), s = Math.floor((dist % 60000) / 1000);
        el.textContent = `${d > 0 ? d + 'd ' : ''}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

const modal = getEl('imageModal');
const unlockedMediaContainer = getEl('unlockedMediaContainer');
const downloadBtn = getEl('downloadBtn');

function openModal(item) {
    if (!unlockedMediaContainer) return;
    unlockedMediaContainer.innerHTML = '';
    const type = (item.fileType || '').toLowerCase();
    if (type.startsWith('image/')) {
        const img = document.createElement('img'); img.src = item.fileUrl; unlockedMediaContainer.appendChild(img);
    } else if (type.startsWith('video/')) {
        const v = document.createElement('video'); v.src = item.fileUrl; v.controls = true; unlockedMediaContainer.appendChild(v);
    } else if (type.startsWith('audio/')) {
        const a = document.createElement('audio'); a.src = item.fileUrl; a.controls = true; unlockedMediaContainer.appendChild(a);
    } else {
        unlockedMediaContainer.innerHTML = `<div style="font-size:3rem; margin-bottom:1rem;">📄</div><p>${item.filename}</p>`;
    }
    downloadBtn.href = item.fileUrl;
    modal.classList.add('active');
}

const closeBtn = document.querySelector('.close-btn');
if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        if (unlockedMediaContainer) unlockedMediaContainer.innerHTML = '';
    });
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.error("Supabase SDK failed to load.");
    }

    checkAuth();
    
    const path = window.location.pathname;
    const isHome = path.endsWith('/') || path.endsWith('index.html') || path === '';
    const isVault = path.includes('vault.html');

    if (isHome) {
        updateDashboard();
    } else if (isVault) {
        loadVaultItems();
    }
});
