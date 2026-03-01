/**
 * THE SYSTEM - Solo Leveling Fitness RPG
 */

// --- CLOUD CONFIGURATION ---
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
let supabaseClient = null;

// Initialize Supabase safely
try {
    if (typeof supabase !== 'undefined' && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.warn("Cloud features disabled: Keys not configured.");
}

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('System Service Worker Online'))
            .catch(err => console.log('Service Worker Failure', err));
    });
}

let state = {
    userName: null,
    level: 1,
    currentXP: 0,
    xpRequired: 100,
    availablePoints: 0,
    stats: {
        strength: 1,
        agility: 1,
        sense: 1,
        vitality: 1,
        intelligence: 1
    },
    exercises: [],
    achievements: [],
    dailyQuest: {
        pushups: false,
        situps: false,
        squats: false,
        run: false,
        lastCompleted: null,
        lastResetDate: null
    },
    startDate: null
};

const elements = {
    userNameLabel: document.getElementById('user-name-label'),
    btnRegister: document.getElementById('btn-register'),
    currentXP: document.getElementById('current-xp'),
    requiredXP: document.getElementById('required-xp'),
    xpFill: document.getElementById('xp-progress-fill'),
    levelBadge: document.getElementById('level-badge'),
    availablePoints: document.getElementById('available-points'),
    exerciseForm: document.getElementById('exercise-form'),
    exerciseList: document.getElementById('exercise-list'),
    modal: document.getElementById('level-up-modal'),
    modalLevel: document.getElementById('modal-new-level'),
    rankText: document.getElementById('rank-text'),
    avatar: document.getElementById('character-avatar'),
    dailyBtn: document.getElementById('complete-daily'),
    totalXPVal: document.getElementById('total-xp-val')
};

async function init() {
    loadData();
    checkDailyReset();
    setupEventListeners();
    updateUI();
    startDailyTimer();

    // Check if cloud data is available - DO NOT AWAIT to prevent blocking
    if (state.userName && state.userName !== "UNREGISTERED") {
        fetchFromCloud().catch(err => console.log("Initial fetch skipped (offline)"));
    }

    // Boot sound on first click
    const bootHandler = () => {
        SystemAudio.playSystemBoot();
        window.removeEventListener('click', bootHandler);
    };
    window.addEventListener('click', bootHandler);
}

function startDailyTimer() {
    const timerEl = document.getElementById('daily-timer');
    if (!timerEl) return;

    setInterval(() => {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const diff = tomorrow - now;

        if (diff <= 1000) {
            resetDailyQuestState();
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        timerEl.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
}

function resetDailyQuestState() {
    state.dailyQuest.pushups = false;
    state.dailyQuest.situps = false;
    state.dailyQuest.squats = false;
    state.dailyQuest.run = false;
    state.dailyQuest.lastResetDate = new Date().toDateString();
    
    // Uncheck boxes in UI
    ['q-pushups', 'q-situps', 'q-squats', 'q-run'].forEach(id => {
        const cb = document.getElementById(id);
        if (cb) cb.checked = false;
    });
    
    saveData();
    updateUI();
    showToast("DAILY QUESTS HAVE RESET");
}

async function registerName() {
    document.getElementById('registration-modal').classList.remove('hidden');
    document.getElementById('reg-name-input').focus();
}

async function submitRegistration() {
    const nameInput = document.getElementById('reg-name-input');
    const name = nameInput.value;
    
    if (name && name.trim().length > 0) {
        state.userName = name.trim();
        saveData();
        updateUI();
        document.getElementById('registration-modal').classList.add('hidden');
        showToast("NAME REGISTERED TO SYSTEM");
        
        // Attempt cloud sync immediately
        await syncToCloud();
    } else {
        showToast("ERROR: IDENTITY UNKNOWN");
    }
}

function setupEventListeners() {
    elements.exerciseForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addExercise();
    });

    elements.dailyBtn.addEventListener('click', completeDailyQuest);

    // Enter key for registration
    const regInput = document.getElementById('reg-name-input');
    if (regInput) {
        regInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitRegistration();
        });
    }

    // Stat long-press listeners
    document.querySelectorAll('.stat-up').forEach(btn => {
        const stat = btn.getAttribute('data-stat');
        
        // Mouse Events
        btn.addEventListener('mousedown', () => startContinuousUpgrade(stat));
        btn.addEventListener('mouseup', stopContinuousUpgrade);
        btn.addEventListener('mouseleave', stopContinuousUpgrade);
        
        // Touch Events (for mobile)
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent ghost clicks
            startContinuousUpgrade(stat);
        });
        btn.addEventListener('touchend', stopContinuousUpgrade);
        btn.addEventListener('touchcancel', stopContinuousUpgrade);
    });

    // Checkbox listeners
    ['q-pushups', 'q-situps', 'q-squats', 'q-run'].forEach(id => {
        const cb = document.getElementById(id);
        if (cb) {
            cb.checked = state.dailyQuest[id.split('-')[1]];
            cb.addEventListener('change', (e) => {
                state.dailyQuest[id.split('-')[1]] = e.target.checked;
                saveData();
            });
        }
    });
}

function loadData() {
    const saved = localStorage.getItem('soloLevelingData');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Deep merge stats and dailyQuest to preserve defaults
            state = {
                ...state,
                ...parsed,
                stats: { ...state.stats, ...(parsed.stats || {}) },
                dailyQuest: { ...state.dailyQuest, ...(parsed.dailyQuest || {}) }
            };
        } catch (e) {
            console.error("Error parsing saved data", e);
        }
    }

    // Set start date if not already set (first time user or old version)
    if (!state.startDate) {
        state.startDate = new Date().toISOString();
        saveData();
    }
}

function calculateDays() {
    if (!state.startDate) return 1;
    const start = new Date(state.startDate);
    const now = new Date();
    
    // Set both to midnight for accurate whole-day difference
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 so first day is Day 1
    return diffDays;
}

function saveData() {
    localStorage.setItem('soloLevelingData', JSON.stringify(state));
    syncToCloud();
}

async function syncToCloud() {
    const statusEl = document.getElementById('cloud-sync-status');
    if (!supabaseClient || !state.userName || state.userName === "UNREGISTERED") {
        if (statusEl) statusEl.textContent = "[ CLOUD: NOT LINKED ]";
        return;
    }

    if (!navigator.onLine) {
        if (statusEl) {
            statusEl.textContent = "[ CLOUD: OFFLINE ]";
            statusEl.style.color = "#777";
        }
        return;
    }

    if (statusEl) statusEl.textContent = "[ CLOUD: SYNCING... ]";

    try {
        const { data, error } = await supabaseClient
            .from('hunters')
            .upsert({ 
                name: state.userName, 
                data: state,
                updated_at: new Date() 
            }, { onConflict: 'name' });

        if (error) throw error;
        if (statusEl) {
            statusEl.textContent = "[ CLOUD: SYNCED ]";
            statusEl.style.color = "var(--sys-blue)";
        }
    } catch (err) {
        console.error("Cloud Sync Error:", err);
        if (statusEl) {
            statusEl.textContent = "[ CLOUD: ERROR ]";
            statusEl.style.color = "#f44336";
        }
    }
}

async function fetchFromCloud() {
    if (!supabaseClient || !state.userName) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('hunters')
            .select('data')
            .eq('name', state.userName)
            .single();

        if (data && data.data) {
            state = data.data;
            updateUI();
            showToast("DATA RETRIEVED FROM THE CLOUD");
        }
    } catch (err) {
        console.log("No cloud data found for this user.");
    }
}

function checkDailyReset() {
    const today = new Date().toDateString();
    if (state.dailyQuest.lastResetDate !== today) {
        state.dailyQuest.pushups = false;
        state.dailyQuest.situps = false;
        state.dailyQuest.squats = false;
        state.dailyQuest.run = false;
        state.dailyQuest.lastResetDate = today;
        saveData();
    }
}

function showLogoutModal() {
    document.getElementById('logout-modal').classList.remove('hidden');
}

function closeLogoutModal() {
    document.getElementById('logout-modal').classList.add('hidden');
}

async function executeLogout() {
    state.userName = null;
    saveData();
    updateUI();
    closeLogoutModal();
    showToast("SYSTEM CONNECTION TERMINATED");
}

async function logout() {
    // Legacy logout function removed to use modal workflow
}

function updateUI() {
    // Name Display
    const btnLogout = document.getElementById('btn-logout');
    const statsOwnerEl = document.getElementById('stats-owner-name');
    
    if (state.userName) {
        elements.userNameLabel.textContent = state.userName;
        if (statsOwnerEl) statsOwnerEl.textContent = state.userName.toUpperCase();
        elements.btnRegister.style.display = 'none';
        if (btnLogout) btnLogout.style.display = 'inline-block';
    } else {
        elements.userNameLabel.textContent = "UNREGISTERED";
        if (statsOwnerEl) statsOwnerEl.textContent = "PLAYER";
        elements.btnRegister.style.display = 'inline-block';
        if (btnLogout) btnLogout.style.display = 'none';
    }

    elements.currentXP.textContent = state.currentXP;
    elements.requiredXP.textContent = state.xpRequired;
    elements.levelBadge.textContent = state.level;
    elements.availablePoints.textContent = state.availablePoints;

    const dayEl = document.getElementById('current-day');
    if (dayEl) dayEl.textContent = calculateDays();

    const totalXP = (100 * (state.level - 1) * state.level / 2) + state.currentXP;
    if (elements.totalXPVal) elements.totalXPVal.textContent = totalXP;

    const percent = Math.floor((state.currentXP / state.xpRequired) * 100);
    elements.xpFill.style.width = `${percent}%`;

    // Stats
    for (const [stat, value] of Object.entries(state.stats)) {
        const el = document.getElementById(`stat-${stat}`);
        if (el) el.textContent = value;
        const btn = document.querySelector(`.stat-row[data-stat="${stat}"] .stat-up`);
        if (btn) btn.disabled = state.availablePoints <= 0;
    }

    updateCharacterVisual();
    renderExercises();
}

function updateCharacterVisual() {
    const avatar = elements.avatar;
    const rankLabel = elements.rankText;
    
    avatar.className = '';
    let rank = "E-RANK";
    let color = "#70a0a5";
    let rankClass = "rank-e";

    if (state.level >= 40) { rank = "SSS-RANK"; color = "#ffffff"; rankClass = "rank-sss"; }
    else if (state.level >= 30) { rank = "SS-RANK"; color = "#ffca28"; rankClass = "rank-ss"; }
    else if (state.level >= 25) { rank = "S-RANK"; color = "#f44336"; rankClass = "rank-s"; }
    else if (state.level >= 20) { rank = "A-RANK"; color = "#ff9800"; rankClass = "rank-a"; }
    else if (state.level >= 15) { rank = "B-RANK"; color = "#bb86fc"; rankClass = "rank-b"; }
    else if (state.level >= 10) { rank = "C-RANK"; color = "#00f2ff"; rankClass = "rank-c"; }
    else if (state.level >= 5) { rank = "D-RANK"; color = "#4caf50"; rankClass = "rank-d"; }

    avatar.classList.add(rankClass);
    rankLabel.textContent = rank;
    rankLabel.style.color = color;
    rankLabel.style.textShadow = `0 0 10px ${color}aa`;
}

function addExercise() {
    const name = document.getElementById('exercise-name').value;
    const xp = parseInt(document.getElementById('exercise-xp').value);
    const stat = document.getElementById('exercise-stat').value;

    state.exercises.push({ id: Date.now(), name, xp, stat });
    saveData();
    updateUI();
    document.getElementById('exercise-form').reset();
}

function renderExercises() {
    elements.exerciseList.innerHTML = '';
    state.exercises.forEach(ex => {
        const div = document.createElement('div');
        div.className = 'exercise-item';
        div.innerHTML = `
            <div>
                <div style="color:#fff; font-weight:bold">${ex.name}</div>
                <div style="font-size:0.8rem; color:var(--sys-blue)">+${ex.xp} XP • ${ex.stat.toUpperCase()}</div>
            </div>
            <div style="display:flex; gap:5px;">
                <button class="btn-system" style="width:auto; padding:5px 15px; margin:0" onclick="completeQuest(${ex.id}, this)">COMPLETE</button>
                <button class="btn-delete" onclick="deleteQuest(${ex.id})">DEL</button>
            </div>
        `;
        elements.exerciseList.appendChild(div);
    });
}

function deleteQuest(id) {
    state.exercises = state.exercises.filter(ex => ex.id !== id);
    saveData();
    updateUI();
    showToast("QUEST DELETED");
}

function showResetModal() {
    document.getElementById('reset-modal').classList.remove('hidden');
}

function closeResetModal() {
    document.getElementById('reset-modal').classList.add('hidden');
}

function resetSystem() {
    showResetModal();
}

function executeReset() {
    state = {
        userName: state.userName, // Preserve name across resets
        level: 1,
        currentXP: 0,
        xpRequired: 100,
        availablePoints: 0,
        stats: {
            strength: 1,
            agility: 1,
            sense: 1,
            vitality: 1,
            intelligence: 1
        },
        exercises: [],
        achievements: [],
        dailyQuest: {
            pushups: false,
            situps: false,
            squats: false,
            run: false,
            lastCompleted: null,
            lastResetDate: new Date().toDateString()
        },
        startDate: new Date().toISOString() // Restart day counter
    };
    saveData();
    updateUI();
    closeResetModal();
    showToast("SYSTEM REBOOT COMPLETE");
}

function completeQuest(id, btn) {
    const ex = state.exercises.find(e => e.id === id);
    if (!ex) return;

    SystemAudio.playQuestComplete();
    createXPFloater(btn, ex.xp);
    state.currentXP += ex.xp;
    
    checkLevelUp();
    saveData();
    updateUI();
}

function completeDailyQuest() {
    const q = state.dailyQuest;
    if (q.pushups && q.situps && q.squats && q.run) {
        const today = new Date().toDateString();
        if (q.lastCompleted === today) {
            showToast("DAILY QUEST ALREADY COMPLETED TODAY");
            return;
        }

        state.currentXP += 50;
        state.dailyQuest.lastCompleted = today;
        showToast("DAILY QUEST COMPLETE! REWARD: 50 XP");
        playLevelUpSound(); // Use same sound for major rewards
        checkLevelUp();
        saveData();
        updateUI();
    } else {
        showToast("DAILY QUEST REQUIREMENTS NOT MET");
    }
}

function checkLevelUp() {
    let leveledUp = false;
    while (state.currentXP >= state.xpRequired) {
        state.level++;
        state.currentXP -= state.xpRequired;
        state.xpRequired = state.level * 100;
        state.availablePoints++;
        leveledUp = true;
    }
    if (leveledUp) {
        elements.modalLevel.textContent = state.level;
        elements.modal.classList.remove('hidden');
        playLevelUpSound();
    }
}

let statUpgradeInterval = null;
let statUpgradeTimeout = null;

function upgradeStat(stat) {
    if (state.availablePoints > 0) {
        state.stats[stat]++;
        state.availablePoints--;
        
        // Save locally immediately but don't sync to cloud yet to avoid spam
        localStorage.setItem('soloLevelingData', JSON.stringify(state));
        updateUI();
        playClickSound();
        return true;
    }
    return false;
}

function startContinuousUpgrade(stat) {
    // Initial upgrade on press
    if (!upgradeStat(stat)) return;

    // Delay before repeating for long-press
    statUpgradeTimeout = setTimeout(() => {
        statUpgradeInterval = setInterval(() => {
            if (!upgradeStat(stat)) {
                stopContinuousUpgrade();
            }
        }, 100);
    }, 400);
}

function stopContinuousUpgrade() {
    clearTimeout(statUpgradeTimeout);
    clearInterval(statUpgradeInterval);
    statUpgradeTimeout = null;
    statUpgradeInterval = null;
    
    // Sync to cloud once after finishing the press sequence
    syncToCloud();
}

function closeModal() { elements.modal.classList.add('hidden'); }

// System Audio Engine
const SystemAudio = {
    ctx: null,
    
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // A high-tech "Ding" for notifications
    playNotification() {
        this.init();
        const t = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, t);
        osc1.frequency.exponentialRampToValueAtTime(440, t + 0.5);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1760, t);
        osc2.frequency.exponentialRampToValueAtTime(880, t + 0.5);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.5);
        osc2.stop(t + 0.5);
    },

    // Epic level up sound: Rising pitch + Shimmer
    playLevelUp() {
        this.init();
        const t = this.ctx.currentTime;
        
        // Bass Impact
        const bass = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bass.type = 'square';
        bass.frequency.setValueAtTime(60, t);
        bass.frequency.exponentialRampToValueAtTime(30, t + 0.8);
        bassGain.gain.setValueAtTime(0.1, t);
        bassGain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
        bass.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bass.start(t);
        bass.stop(t + 0.8);

        // Rising Arpeggio / Glissando
        for (let i = 0; i < 5; i++) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const delay = i * 0.1;
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220 * (i + 1), t + delay);
            osc.frequency.exponentialRampToValueAtTime(880 * (i + 1), t + delay + 0.5);
            
            g.gain.setValueAtTime(0, t + delay);
            g.gain.linearRampToValueAtTime(0.05, t + delay + 0.05);
            g.gain.exponentialRampToValueAtTime(0.01, t + delay + 0.5);
            
            osc.connect(g);
            g.connect(this.ctx.destination);
            
            osc.start(t + delay);
            osc.stop(t + delay + 0.5);
        }
    },

    // Short digital click
    playClick() {
        this.init();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.linearRampToValueAtTime(400, t + 0.05);

        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 0.05);
    },

    // System boot-up sequence
    playSystemBoot() {
        this.init();
        const t = this.ctx.currentTime;
        const low = this.ctx.createOscillator();
        const lowG = this.ctx.createGain();
        low.type = 'sine';
        low.frequency.setValueAtTime(40, t);
        low.frequency.linearRampToValueAtTime(80, t + 1);
        lowG.gain.setValueAtTime(0, t);
        lowG.gain.linearRampToValueAtTime(0.1, t + 0.5);
        lowG.gain.linearRampToValueAtTime(0, t + 1);
        low.connect(lowG); lowG.connect(this.ctx.destination);
        
        const high = this.ctx.createOscillator();
        const highG = this.ctx.createGain();
        high.type = 'sawtooth';
        high.frequency.setValueAtTime(1000, t);
        high.frequency.exponentialRampToValueAtTime(4000, t + 1);
        highG.gain.setValueAtTime(0, t);
        highG.linearRampToValueAtTime(0.02, t + 0.2);
        highG.linearRampToValueAtTime(0, t + 1);
        high.connect(highG); highG.connect(this.ctx.destination);
        
        low.start(t); high.start(t);
        low.stop(t + 1); high.stop(t + 1);
    },

    // Rewarding quest complete sound
    playQuestComplete() {
        this.init();
        const t = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const delay = i * 0.08;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + delay);
            g.gain.setValueAtTime(0, t + delay);
            g.gain.linearRampToValueAtTime(0.05, t + delay + 0.02);
            g.gain.exponentialRampToValueAtTime(0.01, t + delay + 0.2);
            osc.connect(g); g.connect(this.ctx.destination);
            osc.start(t + delay); osc.stop(t + delay + 0.2);
        });
    }
};

function playLevelUpSound() { SystemAudio.playLevelUp(); }
function playClickSound() { SystemAudio.playClick(); }

function createXPFloater(target, amount) {
    const rect = target.getBoundingClientRect();
    const floater = document.createElement('div');
    floater.className = 'xp-floater';
    floater.textContent = `+${amount} XP`;
    floater.style.left = `${rect.left}px`;
    floater.style.top = `${rect.top}px`;
    document.body.appendChild(floater);
    setTimeout(() => floater.remove(), 1000);
}

function showToast(msg) {
    SystemAudio.playNotification();
    const toast = document.createElement('div');
    toast.style = "position:fixed; bottom:20px; right:20px; background:rgba(0,242,255,0.2); border:1px solid var(--sys-blue); color:#fff; padding:15px; font-family:var(--sys-header-font); z-index:5000; animation: scanline 0.5s ease-out;";
    toast.textContent = `[ MESSAGE: ${msg} ]`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

init();
