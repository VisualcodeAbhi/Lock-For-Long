// Google & Firebase Configuration
const GOOGLE_CLIENT_ID = '664114208940-kk82uu7rr9efpv0a6rm07mtv93uq3fek.apps.googleusercontent.com';
const firebaseConfig = {
    apiKey: "AIzaSyDVbyEisHJyx9GB1S8wo2--ydl03jl1mIY",
    authDomain: "lock-for-long-13949.firebaseapp.com",
    projectId: "lock-for-long-13949",
    storageBucket: "lock-for-long-13949.firebasestorage.app",
    messagingSenderId: "23095734146",
    appId: "1:23095734146:web:e2972b272944aacda6699b",
    measurementId: "G-N8KLYV537F"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const fs = firebase.firestore();
const storage = firebase.storage();

let currentUser = null;
let currentFilter = 'all';

// DOM Elements Helper
const getEl = (id) => document.getElementById(id);

// UI Elements
const dashboardView = getEl('dashboardView');
const vaultView = getEl('vaultView');
const vaultList = getEl('vaultList');
const uploadFormSection = getEl('uploadFormSection');
const viewTitle = getEl('viewTitle');
const fileInput = getEl('fileInput');
const lockTimeSelect = getEl('lockTime');
const customDateGroup = document.querySelector('.custom-date-group');
const customDateInput = getEl('customDate');
const lockBtn = getEl('lockBtn');
const modal = getEl('imageModal');
const closeBtn = document.querySelector('.close-btn');
const unlockedMediaContainer = getEl('unlockedMediaContainer');
const downloadBtn = getEl('downloadBtn');
const loginPage = getEl('loginPage');
const mainApp = getEl('mainApp');
const googleLoginContainer = getEl('googleLoginContainer');
const logoutBtn = getEl('logoutBtn');
const userNameDisplay = getEl('userName');
const userAvatar = getEl('userAvatar');
const floatingAddBtn = getEl('floatingAddBtn');
const backToDashBtn = getEl('backToDashBtn');
const storageUsedEl = getEl('storageUsed');
const storageProgressBar = getEl('storageProgressBar');

// --- Google Auth Logic ---
function handleCredentialResponse(response) {
    const responsePayload = decodeJwtResponse(response.credential);
    currentUser = {
        name: responsePayload.name,
        email: responsePayload.email,
        photoURL: responsePayload.picture
    };
    localStorage.setItem('lockOfLongUser', JSON.stringify(currentUser));
    showApp();
}

function decodeJwtResponse(token) {
    let base64Url = token.split('.')[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    let jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

function initGoogleAuth() {
    if (typeof google !== 'undefined') {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse
        });
        google.accounts.id.renderButton(
            document.getElementById("googleLoginBtnReal"),
            { theme: "outline", size: "large", width: "320" } 
        );
    }
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('lockOfLongUser');
        location.reload();
    });
}

const showApp = () => {
    if (!currentUser) return showLogin();
    loginPage.style.display = 'none';
    mainApp.style.display = 'block';
    userNameDisplay.textContent = currentUser.name;
    userAvatar.src = currentUser.photoURL;
    userAvatar.style.display = 'inline-block';
    updateDashboard();
    switchView('dashboard');
};

const showLogin = () => {
    loginPage.style.display = 'flex';
    mainApp.style.display = 'none';
};

// --- Navigation ---
const switchView = (viewName, filter = 'all') => {
    if (viewName === 'dashboard') {
        dashboardView.style.display = 'block';
        vaultView.style.display = 'none';
        floatingAddBtn.style.display = 'flex';
        uploadFormSection.style.display = 'none';
        vaultList.style.display = 'grid';
        updateDashboard();
    } else {
        dashboardView.style.display = 'none';
        vaultView.style.display = 'block';
        floatingAddBtn.style.display = 'none';
        currentFilter = filter;
        viewTitle.textContent = filter.charAt(0).toUpperCase() + filter.slice(1);
        uploadFormSection.style.display = 'none';
        vaultList.style.display = 'grid';
        loadVaultItems();
    }
};

if (backToDashBtn) backToDashBtn.addEventListener('click', () => switchView('dashboard'));
if (floatingAddBtn) floatingAddBtn.addEventListener('click', () => {
    switchView('vault', 'all');
    uploadFormSection.style.display = 'block';
    vaultList.style.display = 'none';
    viewTitle.textContent = "Lock New Secret";
});

document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => switchView('vault', card.dataset.type));
});

// --- Cloud File Operations ---
if (lockTimeSelect) {
    lockTimeSelect.addEventListener('change', (e) => {
        customDateGroup.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });
}

if (lockBtn) {
    lockBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) return alert("Select a file.");

        let unlockTimeMs;
        if (lockTimeSelect.value === 'custom') {
            unlockTimeMs = new Date(customDateInput.value).getTime();
            if (isNaN(unlockTimeMs) || unlockTimeMs <= Date.now()) return alert("Select a future date.");
        } else {
            unlockTimeMs = Date.now() + (parseInt(lockTimeSelect.value) * 60 * 1000);
        }

        lockBtn.disabled = true;
        lockBtn.textContent = "Uploading to Cloud...";

        try {
            // 1. Upload to Firebase Storage
            const storageRef = storage.ref(`vault/${currentUser.email}/${Date.now()}_${file.name}`);
            const uploadTask = storageRef.put(file);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                    lockBtn.textContent = `Uploading ${progress}%...`;
                },
                (error) => { throw error; },
                async () => {
                    // 2. Get Download URL
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();

                    // 3. Save Metadata to Firestore
                    await fs.collection('vaultItems').add({
                        filename: file.name,
                        fileUrl: downloadURL,
                        storagePath: uploadTask.snapshot.ref.fullPath,
                        size: file.size,
                        lockedAt: Date.now(),
                        unlockAt: unlockTimeMs,
                        userEmail: currentUser.email,
                        fileType: file.type || 'application/octet-stream'
                    });

                    fileInput.value = '';
                    switchView('dashboard');
                    alert("Locked in the Cloud successfully!");
                    lockBtn.disabled = false;
                    lockBtn.textContent = "Seal the Vault";
                }
            );
        } catch (err) {
            console.error(err);
            alert("Upload failed. Check if Storage is enabled in Test Mode.");
            lockBtn.disabled = false;
            lockBtn.textContent = "Seal the Vault";
        }
    });
}

const getVaultItems = async () => {
    if (!currentUser) return [];
    const snapshot = await fs.collection('vaultItems')
        .where('userEmail', '==', currentUser.email)
        .orderBy('unlockAt', 'asc')
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const deleteFile = async (id, storagePath) => {
    if (confirm("Delete this file from the cloud forever?")) {
        try {
            // Delete from Firestore
            await fs.collection('vaultItems').doc(id).delete();
            // Delete from Storage
            if (storagePath) {
                await storage.ref(storagePath).delete();
            }
            loadVaultItems();
            updateDashboard();
        } catch (err) {
            console.error(err);
            alert("Delete failed.");
        }
    }
};

const updateDashboard = async () => {
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
    if (storageUsedEl) storageUsedEl.textContent = `${sizeFormatted} / 64 GB`;
    const percent = Math.min((totalSize / (64 * 1024 * 1024 * 1024)) * 100, 100) || 1;
    if (storageProgressBar) storageProgressBar.style.width = percent + '%';
};

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const loadVaultItems = async () => {
    let items = await getVaultItems();
    vaultList.innerHTML = '';
    
    if (currentFilter !== 'all') {
        items = items.filter(item => {
            const type = (item.fileType || '').toLowerCase();
            if (currentFilter === 'image') return type.startsWith('image/');
            if (currentFilter === 'video') return type.startsWith('video/');
            if (currentFilter === 'audio') return type.startsWith('audio/');
            if (currentFilter === 'document') return type.includes('pdf') || type.includes('word') || type.includes('text');
            if (currentFilter === 'apk') return item.filename.toLowerCase().endsWith('.apk');
            if (currentFilter === 'archive') return type.includes('zip') || type.includes('rar');
            return false;
        });
    }

    if (items.length === 0) {
        vaultList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666; margin-top: 2rem;">Vault is empty.</p>';
        return;
    }

    items.forEach(item => {
        const isUnlocked = Date.now() >= item.unlockAt;
        const el = document.createElement('div');
        el.className = `vault-item ${isUnlocked ? 'vault-unlocked' : 'vault-locked'}`;
        el.innerHTML = `
            <div class="vault-icon">${isUnlocked ? '🔓' : '🔒'}</div>
            <div class="vault-status">${isUnlocked ? 'Ready' : 'Locked'}</div>
            <div class="countdown" id="cd-${item.id}"></div>
            <button class="unlock-btn" id="btn-${item.id}" ${!isUnlocked ? 'disabled' : ''}>${isUnlocked ? 'Open' : 'Waiting'}</button>
            ${isUnlocked ? `<button onclick="deleteFile('${item.id}', '${item.storagePath}')" style="background:none;border:none;color:#ef4444;font-size:0.7rem;margin-top:8px;cursor:pointer;">Delete Forever</button>` : ''}
        `;
        vaultList.appendChild(el);
        updateCD(item.id, item.unlockAt, isUnlocked);
        const btn = el.querySelector(`#btn-${item.id}`);
        if (btn) btn.addEventListener('click', () => openModal(item));
    });
};

const updateCD = (id, end, done) => {
    const el = getEl(`cd-${id}`);
    if (!el) return;
    if (done) return el.textContent = '00:00:00';
    const dist = end - Date.now();
    const d = Math.floor(dist / 86400000), h = Math.floor((dist % 86400000) / 3600000), m = Math.floor((dist % 3600000) / 60000), s = Math.floor((dist % 60000) / 1000);
    el.textContent = `${d > 0 ? d + 'd ' : ''}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const openModal = (item) => {
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
    downloadBtn.download = item.filename;
    modal.classList.add('active');
};

const closeModal = () => { modal.classList.remove('active'); unlockedMediaContainer.innerHTML = ''; };
if (closeBtn) closeBtn.addEventListener('click', closeModal);

// App Initialization
window.addEventListener('DOMContentLoaded', async () => {
    initGoogleAuth();
    const saved = localStorage.getItem('lockOfLongUser');
    if (saved) {
        currentUser = JSON.parse(saved);
        showApp();
    } else {
        showLogin();
    }
});
