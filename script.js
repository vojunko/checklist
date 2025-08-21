// --- UŽITEČNÉ ---
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const storage = {
get(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback }catch{ return fallback }},
set(key, value){ localStorage.setItem(key, JSON.stringify(value)) },
del(key){ localStorage.removeItem(key) },
keys(){ return Object.keys(localStorage) }
};
const fmtDate = (d) => d.toLocaleDateString('eng-EN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
const ymd = (d) => d.toISOString().slice(0,10);

// --- KLÍČE ---
const KEYS = {
items: 'checklist.items',
checksPrefix: 'checklist.checks.', // + YYYY-MM-DD
lastDate: 'checklist.lastDate',
rules: 'checklist.rules',
rulesStart: 'checklist.rulesStart'
};


function todayKey(){ return KEYS.checksPrefix + ymd(new Date()); }

// --- STAV ---
let items = storage.get(KEYS.items, []); // [{id, text}]


// inicializace 3měsíčního období (uloží se jen jednou, dokud uživatel nerestartuje)
function getOrInitRulesStart(){
let start = storage.get(KEYS.rulesStart, null);
if(!start){ start = ymd(new Date()); storage.set(KEYS.rulesStart, start); }
return start;
}


function addMonths(dateStr, n){
const d = new Date(dateStr + 'T00:00:00');
d.setMonth(d.getMonth() + n);
return ymd(d);
}


function ensureDailyReset(){
const last = storage.get(KEYS.lastDate, null);
const today = ymd(new Date());
if(last !== today){
// nevyprazdňujeme položky, jen zahodíme staré zaškrtnutí (uložené pod starým datem)
storage.set(KEYS.lastDate, today);
storage.set(todayKey(), []);
}
}


// --- RENDER ---
const els = {
today: $('#today'), list: $('#list'), newItem: $('#newItem'), addItem: $('#addItem'),
clearChecks: $('#clearChecks'), deleteDone: $('#deleteDone'), rules: $('#rules'),
progressBar: $('#progressBar'), progressText: $('#progressText'), period: $('#period'),
resetStart: $('#resetStart'), exportBtn: $('#exportBtn'), importBtn: $('#importBtn'), importFile: $('#importFile')
};


function renderHeader(){ els.today.textContent = `Today is ${fmtDate(new Date())}`; }


function renderPeriod(){
const start = getOrInitRulesStart();
const end = addMonths(start, 3);
const startD = new Date(start + 'T00:00:00');
const endD = new Date(end + 'T00:00:00');
const todayD = new Date();
const leftDays = Math.max(0, Math.ceil((endD - todayD) / (1000*60*60*24)));
els.period.innerHTML = `Period: <strong>${startD.toLocaleDateString('eng-EN')}</strong> → <strong>${endD.toLocaleDateString('eng-EN')}</strong>remaining <strong>${leftDays}</strong> days`;
}


function renderList(){
const checks = new Set(storage.get(todayKey(), []));
els.list.innerHTML = '';
items.forEach((it, idx) => {
const li = document.createElement('li');
li.className = 'item';
li.draggable = true;
li.dataset.id = it.id;
li.innerHTML = `
<input type="checkbox" aria-label="hotovo" ${checks.has(it.id)?'checked':''} />
<input type="text" value="${escapeHtml(it.text)}" aria-label="upravit text úkolu" />
<span class="spacer"></span>
<button class="btn-outline small" data-act="del" title="Smazat">Remove</button>
<span class="muted small" title="Pořadí: ${idx+1}"></span>
`;
// events
const cb = li.querySelector('input[type="checkbox"]');
cb.addEventListener('change', () => toggleCheck(it.id, cb.checked));
const txt = li.querySelector('input[type="text"]');
txt.addEventListener('change', () => updateText(it.id, txt.value.trim()));
txt.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.target.blur(); } });
li.querySelector('[data-act="del"]').addEventListener('click', ()=> deleteItem(it.id));
enableDrag(li);
els.list.appendChild(li);
});
renderProgress();
}


function renderProgress(){
const total = items.length;
const checks = storage.get(todayKey(), []);
const done = checks.filter(id => items.some(it=>it.id===id)).length;
const pct = total? Math.round((done/total)*100):0;
els.progressBar.style.width = pct + '%';
els.progressText.textContent = total ? `${done}/${total} completed (${pct} %)` : 'No items yet';
}

// --- LOGIKA ---
function addItemFromInput(){
const v = els.newItem.value.trim();
if(!v) return;
const id = crypto.randomUUID?.() || String(Date.now()+Math.random());
items.push({ id, text: v });
storage.set(KEYS.items, items);
els.newItem.value = '';
renderList();
}


function updateText(id, text){
const it = items.find(i=>i.id===id); if(!it) return;
it.text = text || it.text; // neumožníme prázdný text
storage.set(KEYS.items, items);
renderList();
}


function deleteItem(id){
items = items.filter(i=>i.id!==id);
storage.set(KEYS.items, items);
// odstraníme i případný dnešní check
const checks = new Set(storage.get(todayKey(), []));
checks.delete(id);
storage.set(todayKey(), [...checks]);
renderList();
}


function toggleCheck(id, checked){
const checks = new Set(storage.get(todayKey(), []));
if(checked) checks.add(id); else checks.delete(id);
storage.set(todayKey(), [...checks]);
renderProgress();
}


function clearTodayChecks(){ storage.set(todayKey(), []); renderList(); }


function deleteDoneItems(){
const checks = new Set(storage.get(todayKey(), []));
items = items.filter(i=>!checks.has(i.id));
storage.set(KEYS.items, items);
storage.set(todayKey(), []);
renderList();
}

// --- DRAG N DROP POŘADÍ ---
function enableDrag(li){
li.addEventListener('dragstart', ()=> li.classList.add('dragging'));
li.addEventListener('dragend', ()=> { li.classList.remove('dragging'); persistOrder(); });
els.list.addEventListener('dragover', (e)=>{
  e.preventDefault();
  const dragging = $('.item.dragging');
  const after = getDragAfterElement(els.list, e.clientY);
  if(!after) els.list.appendChild(dragging);
  else els.list.insertBefore(dragging, after);
});
}


function getDragAfterElement(container, y){
const elsArr = [...container.querySelectorAll('.item:not(.dragging)')];
return elsArr.reduce((closest, child)=>{
const box = child.getBoundingClientRect();
const offset = y - box.top - box.height/2;
if(offset < 0 && offset > closest.offset){ return { offset, element: child } } else { return closest }
}, { offset: Number.NEGATIVE_INFINITY }).element;
}


function persistOrder(){
const orderIds = $$('.item', els.list).map(li=>li.dataset.id);
items.sort((a,b)=> orderIds.indexOf(a.id) - orderIds.indexOf(b.id));
storage.set(KEYS.items, items);
renderList();
}

// --- EXPORT / IMPORT ---
function exportData() {
    const data = {
        items, // všechny položky checklistu
        allChecks: storage.keys()
            .filter(k => k.startsWith(KEYS.checksPrefix))
            .reduce((acc, k) => { acc[k] = storage.get(k, []); return acc; }, {}),
        rules: storage.get(KEYS.rules, ''),
        rulesStart: storage.get(KEYS.rulesStart, ymd(new Date()))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'checklist-data.json';
    a.click();
    URL.revokeObjectURL(url);
}

const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);

            if (Array.isArray(data.items)) items = data.items;
            storage.set(KEYS.items, items);

            if (data.allChecks && typeof data.allChecks === 'object') {
                Object.entries(data.allChecks).forEach(([k,v]) => {
                    if (k.startsWith(KEYS.checksPrefix)) storage.set(k, v);
                });
            }

            if (typeof data.rules === 'string') storage.set(KEYS.rules, data.rules);
            if (typeof data.rulesStart === 'string') storage.set(KEYS.rulesStart, data.rulesStart);

            els.rules.value = storage.get(KEYS.rules, '');
            renderPeriod();
            renderList();
        } catch(e) {
            alert('Import selhal: ' + e.message);
        }
    };
    reader.readAsText(file);
}

// --- UTIL ---
function escapeHtml(s){
return s.replace(/[&<>\"]+/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;' }[c]));
}

// --- INIT ---
function init(){
ensureDailyReset();
renderHeader();
renderPeriod();
els.rules.value = storage.get(KEYS.rules, '');
renderList();


// events
els.addItem.addEventListener('click', addItemFromInput);
els.newItem.addEventListener('keydown', (e)=>{ if(e.key==='Enter') addItemFromInput(); });
els.clearChecks.addEventListener('click', clearTodayChecks);
els.deleteDone.addEventListener('click', deleteDoneItems);
els.rules.addEventListener('input', ()=> storage.set(KEYS.rules, els.rules.value));
els.exportBtn.addEventListener('click', exportData);
els.importBtn.addEventListener('click', ()=> els.importFile.click());
els.importFile.addEventListener('change', (e)=>{ const f=e.target.files?.[0]; if(f) importData(f); e.target.value=''; });

els.importFile.addEventListener('change', (e)=>{
  const f = e.target.files[0];
  if(f){
    const reader = new FileReader();
    reader.onload = function(ev){ 
      console.log('Obsah souboru:', ev.target.result);
    };
    reader.readAsText(f);
  }
});
// aktualizace času na pozadí (kvůli půlnoci)
setInterval(()=>{
const was = storage.get(KEYS.lastDate, null);
ensureDailyReset();
const now = storage.get(KEYS.lastDate, null);
if(was!==now){ renderHeader(); renderList(); }
renderPeriod();
}, 60*1000);
}

// === THEME TOGGLE ===
const themeToggle = document.getElementById("themeToggle");

// načti uložený režim
const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  document.body.classList.toggle("light", savedTheme === "light");
}

// nastavení tlačítka
function updateThemeButton() {
  if (document.body.classList.contains("light")) {
    themeToggle.textContent = "🌙";
  } else {
    themeToggle.textContent = "☀️";
  }
}
updateThemeButton();

// kliknutí na přepínač
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  const newTheme = document.body.classList.contains("light") ? "light" : "dark";
  localStorage.setItem("theme", newTheme);
  updateThemeButton();
});

document.addEventListener('DOMContentLoaded', init);