/**
 * THE SYSTEM - Solo Leveling (Sentient HUD - Master Build v3)
 */

const DEFAULT_EXERCISES = [
    { id: 1, name: 'PUSH-UPS', xp: 10, stat: 'strength' },
    { id: 2, name: 'SIT-UPS', xp: 10, stat: 'vitality' },
    { id: 3, name: 'SQUATS', xp: 10, stat: 'strength' },
    { id: 4, name: 'RUNNING (1KM)', xp: 20, stat: 'agility' }
];

const MASTERIES = [
    { id: 'str_rune', name: "Strength Rune", icon: '💪', req: (s) => s.stats.strength >= 25 },
    { id: 'agi_rune', name: "Agility Rune", icon: '🏃', req: (s) => s.stats.agility >= 25 },
    { id: 'vit_rune', name: "Endurance Rune", icon: '🔋', req: (s) => s.stats.vitality >= 25 },
    { id: 'sen_rune', name: "Perception Rune", icon: '👁️', req: (s) => s.stats.sense >= 25 },
    { id: 'int_rune', name: "Intellect Rune", icon: '🧠', req: (s) => s.stats.intelligence >= 25 },
    { id: 'monarch_heart', name: "Monarch Heart", icon: '👑', req: (s) => s.level >= 50 }
];

let state = {
    userName: null,
    level: 1,
    currentXP: 0,
    xpRequired: 100,
    availablePoints: 0,
    stats: { strength: 1, agility: 1, sense: 1, vitality: 1, intelligence: 1 },
    exercises: [...DEFAULT_EXERCISES],
    realWorldExercises: [], 
    dailyQuest: { pushups: false, situps: false, squats: false, run: false, lastCompleted: null, lastResetDate: null },
    startDate: null,
    totalDailies: 0,
    dailyRewardXP: 50,
    totalDailyXP: 0,
    missionLogs: [],
    inDungeon: false,
    dungeonTimeSeconds: 3600,
    currentMP: 70
};

let els = {};
let currentEditingId = null;
let statUpgradeInterval = null, statUpgradeTimeout = null;

function init() {
    // 1. Load Data
    loadData();
    
    // 2. Bind ALL Elements immediately
    els = {
        userNameLabel: document.getElementById('user-name-label'),
        currentXP: document.getElementById('current-xp'),
        requiredXP: document.getElementById('required-xp'),
        xpFill: document.getElementById('xp-progress-fill'),
        levelBadge: document.getElementById('level-badge'),
        availablePoints: document.getElementById('available-points'),
        dungeonExerciseList: document.getElementById('exercise-list'),
        sideExerciseList: document.getElementById('real-world-side-list'),
        rankText: document.getElementById('rank-text'),
        avatar: document.getElementById('character-avatar'),
        locationTag: document.getElementById('location-tag'),
        dungeonToggle: document.getElementById('btn-dungeon-toggle'),
        mainWindow: document.getElementById('main-window'),
        raidOverlay: document.getElementById('raid-overlay'),
        questTitle: document.getElementById('quest-section-title'),
        timerEl: document.getElementById('daily-timer'),
        realWorldContent: document.getElementById('real-world-quest-content'),
        dungeonContent: document.getElementById('dungeon-quest-content'),
        configModal: document.getElementById('config-modal'),
        configInput: document.getElementById('config-input'),
        configTitle: document.getElementById('config-title'),
        configConfirmBtn: document.getElementById('config-confirm-btn'),
        dungeonAddModal: document.getElementById('dungeon-add-modal'),
        editModal: document.getElementById('edit-exercise-modal'),
        regModal: document.getElementById('registration-modal'),
        regInput: document.getElementById('reg-name-input'),
        rebootModal: document.getElementById('reboot-modal'),
        modalLevel: document.getElementById('modal-new-level'),
        totalXPVal: document.getElementById('total-xp-val'),
        dailyXPVal: document.getElementById('daily-xp-total-val'),
        cpVal: document.getElementById('cp-val'),
        inventoryModal: document.getElementById('inventory-modal'),
        inventoryGrid: document.getElementById('inventory-grid'),
        clearBanner: document.getElementById('quest-clear-banner')
    };

    // 3. Set Initial Mana if zero
    if (state.currentMP === 0) state.currentMP = getMaxMP();

    // 4. Run Core Logic
    checkLevelUp();
    runBootSequence();
    checkDailyReset();
    setupEventListeners();
    updateUI();
    startGlobalTimers();
    startManaRegen();

    window.addEventListener('click', () => { SystemAudio.init(); }, { once: true });
}

// --- BOOT SEQUENCE ---
function runBootSequence() {
    const overlay = document.getElementById('boot-overlay');
    const text = document.getElementById('boot-text');
    if (!overlay || !text) return;
    const name = state.userName ? state.userName.toUpperCase() : "PLAYER";
    text.textContent = `WELCOME BACK, ${name}`;
    setTimeout(() => { text.textContent = "SYNCHRONIZING WITH THE SYSTEM..."; }, 1000);
    setTimeout(() => { overlay.classList.add('fade-out'); setTimeout(() => overlay.style.display = 'none', 800); }, 2000);
}

// --- MANA LOGIC ---
function getMaxMP() { return (state.level * 50) + (state.stats.intelligence * 20); }
function startManaRegen() {
    setInterval(() => {
        const maxMP = getMaxMP();
        if (state.currentMP < maxMP) {
            state.currentMP = Math.min(maxMP, state.currentMP + 1);
            saveData();
            updateUI(); 
        }
    }, 5000);
}
function consumeMana(amount) {
    if (state.currentMP >= amount) {
        state.currentMP -= amount;
        saveData(); updateUI();
        return true;
    }
    showToast("INSUFFICIENT MANA"); return false;
}

// --- GLOBAL EXPOSED ACTIONS ---
window.openRegistrationModal = function() {
    if (!els.regModal) return;
    els.regInput.value = state.userName || "";
    els.regModal.classList.remove('hidden');
    els.regInput.focus();
};

window.confirmRegistration = function() {
    const name = els.regInput.value.trim();
    if (name) {
        state.userName = name;
        saveData(); updateUI(); closeModal('registration-modal');
        showToast(`IDENTITY VERIFIED: ${name.toUpperCase()}`);
    }
};

window.openRebootModal = function() { if (els.rebootModal) els.rebootModal.classList.remove('hidden'); };
window.confirmReboot = function() { localStorage.clear(); location.reload(); };
window.closeModal = function(id) { const m = document.getElementById(id); if (m) m.classList.add('hidden'); currentEditingId = null; };
window.logout = function() { if(confirm("DISCONNECT?")) { state.userName = null; saveData(); location.reload(); } };

window.toggleDungeon = function() {
    state.inDungeon = !state.inDungeon;
    if (state.inDungeon && state.dungeonTimeSeconds < 10) state.dungeonTimeSeconds = 3600;
    saveData(); updateUI(); SystemAudio.playNotification();
    showToast(state.inDungeon ? "ENTERED INSTANT DUNGEON" : "RETURNED TO REAL WORLD");
};

window.handleQuestTitleClick = function() { if (state.inDungeon) els.dungeonAddModal.classList.remove('hidden'); else openDailyXPConfig(); };
window.handleTimerClick = function() { if (state.inDungeon) openDungeonTimeConfig(); };

function openDailyXPConfig() {
    els.configTitle.textContent = "SET DAILY REWARD XP"; els.configInput.value = state.dailyRewardXP || 50;
    els.configConfirmBtn.onclick = () => {
        const v = parseInt(els.configInput.value);
        if (!isNaN(v) && v > 0) { state.dailyRewardXP = v; saveData(); closeModal('config-modal'); showToast(`REWARD SET: ${v} XP`); }
    };
    els.configModal.classList.remove('hidden');
}

function openDungeonTimeConfig() {
    els.configTitle.textContent = "SET DUNGEON TIME (HOURS)"; els.configInput.value = Math.max(0.1, (state.dungeonTimeSeconds / 3600).toFixed(2));
    els.configConfirmBtn.onclick = () => {
        const v = parseFloat(els.configInput.value);
        if (!isNaN(v) && v >= 0.02) { state.dungeonTimeSeconds = Math.floor(v * 3600); saveData(); updateUI(); closeModal('config-modal'); showToast(`TIMER CALIBRATED`); }
    };
    els.configModal.classList.remove('hidden');
}

// --- QUEST LOGIC ---
window.confirmAddDungeonQuest = function() {
    const n = document.getElementById('dungeon-new-name').value.trim();
    const x = parseInt(document.getElementById('dungeon-new-xp').value) || 10;
    const s = document.getElementById('dungeon-new-stat').value;
    if (!n) return;
    if (!consumeMana(10)) return;
    state.exercises.push({ id: Date.now(), name: n.toUpperCase(), xp: x, stat: s });
    saveData(); updateUI(); closeModal('dungeon-add-modal');
    document.getElementById('dungeon-new-name').value = '';
    showToast("OBJECTIVE INITIALIZED");
};

window.addSideQuest = function() {
    const ni = document.getElementById('exercise-name');
    const xi = document.getElementById('exercise-xp');
    const si = document.getElementById('exercise-stat');
    const name = ni.value.trim();
    if (!name || !consumeMana(10)) return;
    if (!state.realWorldExercises) state.realWorldExercises = [];
    state.realWorldExercises.push({ id: Date.now(), name: name.toUpperCase(), xp: parseInt(xi.value) || 10, stat: si.value });
    ni.value = ''; saveData(); updateUI(); showToast("SIDE MISSION RECORDED");
};

window.completeDailyQuest = function() {
    const q = state.dailyQuest;
    if (q.pushups && q.situps && q.squats && q.run) {
        const today = new Date().toDateString();
        if (q.lastCompleted === today) { showToast("ALREADY COMPLETED TODAY"); return; }
        const r = state.dailyRewardXP || 50;
        state.currentXP += r; state.totalDailyXP = (state.totalDailyXP || 0) + r; state.totalDailies = (state.totalDailies || 0) + 1;
        state.dailyQuest.lastCompleted = today; addLogEntry("DAILY QUEST COMPLETE", r);
        showQuestClear(); checkLevelUp(); saveData(); updateUI();
    } else { showToast("REQUIREMENTS NOT MET"); }
};

window.completeQuest = function(id, btn) {
    let ex = state.exercises.find(e => e.id === id) || (state.realWorldExercises || []).find(e => e.id === id);
    if (!ex) return;
    SystemAudio.playQuestComplete(); createXPFloater(btn, ex.xp);
    state.currentXP += ex.xp; addLogEntry(ex.name, ex.xp);
    showQuestClear(); checkLevelUp(); saveData(); updateUI();
};

window.deleteQuest = function(id) {
    state.exercises = state.exercises.filter(ex => ex.id !== id);
    if (state.realWorldExercises) state.realWorldExercises = state.realWorldExercises.filter(ex => ex.id !== id);
    saveData(); updateUI(); showToast("OBJECTIVE REMOVED");
};

function showQuestClear() {
    if (els.clearBanner) {
        els.clearBanner.classList.remove('hidden'); SystemAudio.playLevelUp();
        setTimeout(() => { if (els.clearBanner) els.clearBanner.classList.add('hidden'); }, 1500);
    }
}

// --- MASTERY ---
window.openInventoryModal = function() { renderMastery(); els.inventoryModal.classList.remove('hidden'); };
function renderMastery() {
    if (!els.inventoryGrid) return;
    els.inventoryGrid.innerHTML = '';
    MASTERIES.forEach(m => {
        const hasMastery = m.req(state);
        const div = document.createElement('div'); div.className = 'inventory-item';
        div.innerHTML = `<div class="item-icon" style="opacity: ${hasMastery ? 1 : 0.05}">${m.icon}</div><div class="item-label">${hasMastery ? m.name : '???'}</div>`;
        els.inventoryGrid.appendChild(div);
    });
}

// --- STATS & CP ---
function calculateCombatPower() {
    const s = state.stats;
    const baseStatSum = (s.strength || 0) + (s.agility || 0) + (s.sense || 0) + (s.vitality || 0) + (s.intelligence || 0);
    const cp = (state.level * 500) + (baseStatSum * 50) + Math.floor(state.currentXP * 0.5);
    return Math.max(0, cp);
}

function upgradeStat(stat) {
    if (state.availablePoints > 0) {
        state.stats[stat]++; state.availablePoints--;
        saveData(); updateUI(); SystemAudio.playClick();
        return true;
    } return false;
}
function startContinuousUpgrade(stat) {
    if (!upgradeStat(stat)) return;
    statUpgradeTimeout = setTimeout(() => {
        statUpgradeInterval = setInterval(() => { if (!upgradeStat(stat)) stopContinuousUpgrade(); }, 100);
    }, 400);
}
function stopContinuousUpgrade() { clearTimeout(statUpgradeTimeout); clearInterval(statUpgradeInterval); statUpgradeTimeout = null; statUpgradeInterval = null; }

// --- UI REFRESH ---
function updateUI() {
    if (!els.userNameLabel) return;
    state.xpRequired = state.level * 100;
    const maxMP = getMaxMP();
    if (state.currentMP > maxMP) state.currentMP = maxMP;

    els.userNameLabel.textContent = state.userName || "UNREGISTERED";
    els.currentXP.textContent = state.currentXP;
    els.requiredXP.textContent = state.xpRequired;
    els.levelBadge.textContent = state.level;
    els.levelBadge.className = 'value';
    if (state.level >= 40) els.levelBadge.classList.add('lvl-shadow');
    else if (state.level >= 30) els.levelBadge.classList.add('lvl-legendary');
    else if (state.level >= 20) els.levelBadge.classList.add('lvl-elite');
    else if (state.level >= 10) els.levelBadge.classList.add('lvl-awakened');
    else els.levelBadge.classList.add('lvl-novice');

    els.availablePoints.textContent = state.availablePoints;
    
    if (state.inDungeon) {
        els.locationTag.textContent = "LOCATION: INSTANT DUNGEON";
        els.dungeonToggle.textContent = "LEAVE DUNGEON";
        els.questTitle.textContent = "DUNGEON QUEST";
        els.realWorldContent.classList.add('hidden'); els.dungeonContent.classList.remove('hidden');
        els.raidOverlay.classList.remove('hidden'); els.mainWindow.classList.add('dungeon-active');
    } else {
        els.locationTag.textContent = "LOCATION: REAL WORLD";
        els.dungeonToggle.textContent = "ENTER DUNGEON";
        els.questTitle.textContent = "DAILY QUEST";
        els.realWorldContent.classList.remove('hidden'); els.dungeonContent.classList.add('hidden');
        els.raidOverlay.classList.add('hidden'); els.mainWindow.classList.remove('dungeon-active');
    }

    const isDone = state.dailyQuest.lastCompleted === new Date().toDateString();
    if (els.timerEl && !state.inDungeon) els.timerEl.className = isDone ? 'quest-timer timer-complete' : 'quest-timer';
    
    if (els.totalXPVal) els.totalXPVal.textContent = ((100 * (state.level - 1) * state.level / 2) + state.currentXP).toLocaleString();
    if (els.dailyXPVal) els.dailyXPVal.textContent = (state.totalDailyXP || 0).toLocaleString();
    
    const hp = (state.level * 100) + (state.stats.vitality * 20);
    const hpEl = document.getElementById('hp-val'); if (hpEl) hpEl.textContent = `${hp} / ${hp}`;
    const mpEl = document.getElementById('mp-val'); if (mpEl) mpEl.textContent = `${state.currentMP} / ${maxMP}`;
    
    const xpPercent = Math.floor((state.currentXP / state.xpRequired) * 100);
    if (els.xpFill) els.xpFill.style.width = `${Math.min(100, xpPercent)}%`;

    for (const [stat, value] of Object.entries(state.stats)) {
        const el = document.getElementById(`stat-${stat}`); if (el) el.textContent = value;
        const btn = document.querySelector(`.stat-up[data-stat="${stat}"]`); if (btn) btn.disabled = state.availablePoints <= 0;
    }
    if (els.cpVal) els.cpVal.textContent = calculateCombatPower().toLocaleString();
    updateCharacterVisual(); renderExercises(); renderLogs();
}

function renderExercises() {
    if (els.dungeonExerciseList) {
        els.dungeonExerciseList.innerHTML = '';
        state.exercises.forEach(ex => {
            const div = document.createElement('div'); div.className = 'exercise-item';
            div.innerHTML = `<div class="quest-info"><div class="quest-name">${ex.name}</div><div class="quest-reward">+${ex.xp} XP • ${ex.stat.toUpperCase()}</div><button class="btn-edit" onclick="openEditModal(${ex.id})">EDIT DATA</button></div><div class="quest-actions"><button class="btn-complete" onclick="completeQuest(${ex.id}, this)">[ COMPLETE ]</button><button class="btn-del" onclick="deleteQuest(${ex.id})">[ DEL ]</button></div>`;
            els.dungeonExerciseList.appendChild(div);
        });
    }
    if (els.sideExerciseList) {
        els.sideExerciseList.innerHTML = '';
        (state.realWorldExercises || []).forEach(ex => {
            const div = document.createElement('div'); div.className = 'exercise-item';
            div.innerHTML = `<div class="quest-info"><div class="quest-name">${ex.name}</div><div class="quest-reward">+${ex.xp} XP • ${ex.stat.toUpperCase()}</div><button class="btn-edit" onclick="openEditModal(${ex.id})">EDIT DATA</button></div><div class="quest-actions"><button class="btn-complete" onclick="completeQuest(${ex.id}, this)">[ COMPLETE ]</button><button class="btn-del" onclick="deleteQuest(${ex.id})">[ DEL ]</button></div>`;
            els.sideExerciseList.appendChild(div);
        });
    }
}

// --- TIMERS ---
function startGlobalTimers() {
    setInterval(() => {
        if (state.inDungeon) {
            if (state.dungeonTimeSeconds > 0) state.dungeonTimeSeconds--;
            else { state.inDungeon = false; saveData(); updateUI(); showToast("DUNGEON TIME EXPIRED."); return; }
            const h = Math.floor(state.dungeonTimeSeconds / 3600), m = Math.floor((state.dungeonTimeSeconds % 3600) / 60), s = state.dungeonTimeSeconds % 60;
            if (els.timerEl) els.timerEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        } else {
            const now = new Date(); const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); const diff = tomorrow - now;
            const h = Math.floor(diff / (1000 * 60 * 60)), m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)), s = Math.floor((diff % (1000 * 60)) / 1000);
            if (els.timerEl) els.timerEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    }, 1000);
}

function checkLevelUp() {
    while (state.currentXP >= state.xpRequired) {
        state.level++; state.currentXP -= state.xpRequired; state.xpRequired = state.level * 100; state.availablePoints++;
        if (els.modalLevel) els.modalLevel.textContent = state.level;
        const m = document.getElementById('level-up-modal'); if (m) m.classList.remove('hidden');
        SystemAudio.playLevelUp();
    }
}

function setupEventListeners() {
    const f = document.getElementById('exercise-form'); if (f) f.onsubmit = (e) => { e.preventDefault(); addSideQuest(); };
    document.querySelectorAll('.stat-up').forEach(btn => {
        const s = btn.getAttribute('data-stat');
        btn.addEventListener('mousedown', () => startContinuousUpgrade(s));
        btn.addEventListener('mouseup', stopContinuousUpgrade); btn.addEventListener('mouseleave', stopContinuousUpgrade);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); startContinuousUpgrade(s); });
        btn.addEventListener('touchend', stopContinuousUpgrade); btn.addEventListener('touchcancel', stopContinuousUpgrade);
    });
    ['q-pushups', 'q-situps', 'q-squats', 'q-run'].forEach(id => {
        const cb = document.getElementById(id); if (cb) cb.addEventListener('change', (e) => { state.dailyQuest[id.split('-')[1]] = e.target.checked; saveData(); updateUI(); });
    });
}

window.openEditModal = function(id) {
    let ex = state.exercises.find(e => e.id === id) || (state.realWorldExercises || []).find(e => e.id === id);
    if (!ex) return;
    currentEditingId = id; document.getElementById('edit-name').value = ex.name; document.getElementById('edit-xp').value = ex.xp; document.getElementById('edit-stat').value = ex.stat; els.editModal.classList.remove('hidden');
};

window.saveExerciseEdit = function() {
    let ex = state.exercises.find(e => e.id === currentEditingId) || (state.realWorldExercises || []).find(e => e.id === currentEditingId);
    if (!ex) return;
    ex.name = document.getElementById('edit-name').value.toUpperCase(); ex.xp = parseInt(document.getElementById('edit-xp').value) || 10; ex.stat = document.getElementById('edit-stat').value;
    saveData(); updateUI(); closeModal('edit-exercise-modal'); showToast("DATA UPDATED");
};

function loadData() {
    const s = localStorage.getItem('soloLevelingData');
    if (s) { try { state = { ...state, ...JSON.parse(s) }; } catch (e) {} }
}
function saveData() { localStorage.setItem('soloLevelingData', JSON.stringify(state)); }
function checkDailyReset() {
    const t = new Date().toDateString();
    if (state.dailyQuest.lastResetDate !== t) {
        state.dailyQuest.pushups = state.dailyQuest.situps = state.dailyQuest.squats = state.dailyQuest.run = false;
        state.dailyQuest.lastResetDate = t; saveData();
    }
}
function updateCharacterVisual() {
    const a = els.avatar; if (!a) return; a.className = ''; 
    let r = "E-RANK", c = "#70a0a5", rc = "rank-e";
    if (state.level >= 40) { r = "SSS-RANK"; c = "#ffffff"; rc = "rank-sss"; }
    else if (state.level >= 30) { r = "SS-RANK"; c = "#ffca28"; rc = "rank-ss"; }
    else if (state.level >= 25) { r = "S-RANK"; c = "#f44336"; rc = "rank-s"; }
    else if (state.level >= 20) { r = "A-RANK"; c = "#ff9800"; rc = "rank-a"; }
    else if (state.level >= 15) { r = "B-RANK"; color = "#bb86fc"; rc = "rank-b"; }
    else if (state.level >= 10) { r = "C-RANK"; c = "#00f2ff"; rc = "rank-c"; }
    else if (state.level >= 5) { r = "D-RANK"; c = "#4caf50"; rc = "rank-d"; }
    a.classList.add(rc); els.rankText.textContent = r; els.rankText.style.color = c;
}
function addLogEntry(n, x) {
    const d = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    state.missionLogs.unshift({ date: d, name: n, xp: x }); if (state.missionLogs.length > 15) state.missionLogs.pop();
}
function toggleLogs() { const l = document.getElementById('hunter-logs'); if (l) l.classList.toggle('hidden'); renderLogs(); }
function renderLogs() {
    const c = document.getElementById('hunter-logs'); if (!c) return;
    c.innerHTML = state.missionLogs.length ? '' : '<div style="text-align:center; opacity:0.5; font-size:0.7rem;">NO RECORDS FOUND</div>';
    state.missionLogs.forEach(l => {
        const d = document.createElement('div'); d.className = 'log-entry';
        d.innerHTML = `<span class="log-date">[ ${l.date} ]</span><span class="log-name">${l.name}</span><span class="log-xp">+${l.xp} XP</span>`;
        c.appendChild(d);
    });
}
function showToast(m) {
    SystemAudio.playNotification();
    const t = document.createElement('div');
    t.style = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--sys-panel-grad); border:1px solid var(--sys-blue); color:#fff; padding:10px 20px; font-family:var(--sys-header-font); z-index:5000; font-size:0.7rem; box-shadow:0 0 20px var(--sys-blue-glow); text-align:center;";
    t.textContent = `[ ${m} ]`; document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
}
function createXPFloater(t, a) {
    if (!t) return; const r = t.getBoundingClientRect(); const f = document.createElement('div');
    f.className = 'xp-floater'; f.textContent = `+${a} XP`; f.style.left = `${r.left}px`; f.style.top = `${r.top}px`;
    document.body.appendChild(f); setTimeout(() => f.remove(), 1000);
}
const SystemAudio = {
    ctx: null,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); },
    playNotification() { this.init(); const t = this.ctx.currentTime; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(440, t+0.5); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1, t+0.05); g.gain.exponentialRampToValueAtTime(0.01, t+0.5); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.5); },
    playLevelUp() { this.init(); const t = this.ctx.currentTime; const b = this.ctx.createOscillator(), bg = this.ctx.createGain(); b.type = 'square'; b.frequency.setValueAtTime(60, t); bg.gain.setValueAtTime(0.1, t); b.connect(bg); bg.connect(this.ctx.destination); b.start(t); b.stop(t+0.5); },
    playClick() { this.init(); const t = this.ctx.currentTime; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(1200, t); g.gain.setValueAtTime(0.05, t); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.05); },
    playSystemBoot() { this.init(); const t = this.ctx.currentTime; const l = this.ctx.createOscillator(); l.frequency.setValueAtTime(40, t); l.connect(this.ctx.destination); l.start(t); l.stop(t+0.5); },
    playQuestComplete() { this.init(); const t = this.ctx.currentTime; [523, 659, 783].forEach((f, i) => { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.setValueAtTime(f, t+(i*0.1)); o.connect(g); g.connect(this.ctx.destination); o.start(t+(i*0.1)); o.stop(t+(i*0.1)+0.2); }); }
};

init();
