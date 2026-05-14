// ════════════════ CONSTANTS ════════════════
const PALETTE = ['#7c5c3b','#b84c39','#4e8060','#b87d1a','#5670a8','#9b5ea8','#3a8a9e','#c0553f','#688f3a','#a05580','#4472a8','#d4812c'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STATUS_STYLE = {
  idea:{bg:'#f0e8d8',text:'#7c5c3b'},scripting:{bg:'#eadff5',text:'#6e45a8'},
  recording:{bg:'#fde8e0',text:'#b84c39'},editing:{bg:'#fef3d0',text:'#8a6010'},
  scheduled:{bg:'#d8eee4',text:'#3a7050'},published:{bg:'#d0e8d0',text:'#2a6030'},
};
const CHART_COLORS = {views:'#7c5c3b',watchTime:'#3a8a9e',subscribers:'#4e8060',impressions:'#b87d1a',ctr:'#b84c39',suggested:'#9b5ea8'};

const PLAT_DEFS = [
  {name:'YouTube',    emoji:'▶️', color:'#b84c39'},
  {name:'Instagram',  emoji:'📸', color:'#9b5ea8'},
  {name:'TikTok',     emoji:'🎵', color:'#28221e'},
  {name:'X / Twitter',emoji:'𝕏',  color:'#5670a8'},
  {name:'LinkedIn',   emoji:'💼', color:'#3a8a9e'},
  {name:'Pinterest',  emoji:'📌', color:'#b84c39'},
  {name:'Podcast',    emoji:'🎙', color:'#4e8060'},
  {name:'Blog',       emoji:'✍️', color:'#b87d1a'},
  {name:'Other',      emoji:'🌐', color:'#7a7068'},
];

function platColor(name) {
  const def = PLAT_DEFS.find(p=>p.name===name);
  return def ? def.color : PALETTE[Math.abs(hashStr(name))%PALETTE.length];
}
function platEmoji(name) {
  const def = PLAT_DEFS.find(p=>p.name===name);
  return def ? def.emoji : '🌐';
}
function hashStr(s) { let h=0; for(const c of s) h=(Math.imul(31,h)+c.charCodeAt(0))|0; return h; }

// ════════════════ STATE ════════════════
let S = {events:[],buckets:[],channels:[],csv:null,inspo:[],goals:[],goalsOpen:false};
let activeBucket = null;
let inspoFilter = 'All';
let inspoType   = 'image';
let pendingImage = null;
let amountsHidden = false;
let activeChannelFilter = null; // null = ALL

function getToken() { return localStorage.getItem('cos-token') || ''; }

async function load() {
  try {
    const res = await fetch('/api/data', { headers: { 'Authorization': `Bearer ${getToken()}` } });
    if (res.status === 401) { localStorage.removeItem('cos-token'); showAuthScreen(); return false; }
    if (res.ok) { const data = await res.json(); S = { ...S, ...data }; }
    return true;
  } catch(e) {
    showAuthScreen();
    showAuthError('Cannot connect to the server. Make sure the app is running with: npm start');
    return false;
  }
}

async function refreshToken() {
  try {
    const res = await fetch('/api/auth/refresh', { headers: { 'Authorization': `Bearer ${getToken()}` } });
    if (res.ok) { const data = await res.json(); localStorage.setItem('cos-token', data.token); }
  } catch {}
}

function persist() {
  fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
    body: JSON.stringify(S),
  }).catch(e => console.error('Failed to save data:', e));
}

// ════════════════ NAV ════════════════
const TOPBAR_META = {
  calendar:  {title:'Calendar',    sub:'Your content schedule — current month through the next 6'},
  board:     {title:'Board',       sub:'Manage buckets and channels in one place'},
  inspo:     {title:'Inspo Board', sub:'Collect links, images, and references organized by platform'},
};
const TOPBAR_BTN = {
  calendar: `<button class="btn btn-primary btn-sm" onclick="openEventModal(null)">+ Add Content</button>`,
  inspo:    `<button class="btn btn-ghost btn-sm" onclick="openInspoModal('link')">🔗 Link</button><button class="btn btn-primary btn-sm" onclick="openInspoModal('image')">+ Image</button>`,
};

document.querySelectorAll('.nav-item').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    el.classList.add('active');
    const s=el.dataset.section;
    document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
    document.getElementById('section-'+s).classList.add('active');
    document.getElementById('topbar-title').textContent=TOPBAR_META[s].title;
    document.getElementById('topbar-sub').textContent=TOPBAR_META[s].sub;
    document.getElementById('page-actions').innerHTML=TOPBAR_BTN[s]||'';
    if(s==='board') renderBoard();
    if(s==='inspo') renderInspo();
  });
});


// ════════════════ MODAL UTILS ════════════════
function openModal(id)  { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }
document.querySelectorAll('.modal-backdrop').forEach(m=>{
  m.addEventListener('click',e=>{ if(e.target===m) m.style.display='none'; });
});
function buildColors(id){
  const row=document.getElementById(id); row.innerHTML='';
  PALETTE.forEach((c,i)=>{
    const d=document.createElement('div');
    d.className='swatch'+(i===0?' selected':''); d.style.background=c; d.dataset.color=c;
    d.addEventListener('click',()=>{ row.querySelectorAll('.swatch').forEach(s=>s.classList.remove('selected')); d.classList.add('selected'); });
    row.appendChild(d);
  });
}
function pickedColor(id){ const s=document.querySelector(`#${id} .swatch.selected`); return s?s.dataset.color:PALETTE[0]; }
function fillSelect(id,arr,fn){
  const sel=document.getElementById(id); sel.innerHTML='<option value="">— None —</option>';
  arr.forEach(item=>{ const{v,t}=fn(item); const o=document.createElement('option'); o.value=v; o.textContent=t; sel.appendChild(o); });
}

// ════════════════ CALENDAR ════════════════
function renderCalendar(){
  const now=new Date(), container=document.getElementById('multi-cal');
  container.innerHTML='';
  for(let m=0;m<7;m++){
    let yr=now.getFullYear(), mo=now.getMonth()+m;
    if(mo>11){mo-=12;yr++;} container.appendChild(buildMonth(yr,mo,now,m===0));
  }
}

function renderChannelFilter(){
  const wrap=document.getElementById('channel-filter');
  const list=document.getElementById('channel-filter-list');
  if(!wrap||!list) return;
  wrap.style.display='block';
  list.innerHTML='';

  // ALL button
  const allBtn=document.createElement('button');
  allBtn.className='ch-filter-btn'+(activeChannelFilter===null?' active':'');
  allBtn.innerHTML=`<span class="ch-filter-all-dot"></span> All`;
  allBtn.onclick=()=>{ activeChannelFilter=null; renderChannelFilter(); renderCalendar(); };
  list.appendChild(allBtn);

  // One button per channel
  S.channels.forEach(ch=>{
    const btn=document.createElement('button');
    btn.className='ch-filter-btn'+(activeChannelFilter===ch.id?' active':'');
    btn.innerHTML=`<span class="ch-filter-dot" style="background:${ch.color}"></span>${ch.icon||'📡'} ${escHtml(ch.name)}`;
    btn.onclick=()=>{ activeChannelFilter=ch.id; renderChannelFilter(); renderCalendar(); };
    list.appendChild(btn);
  });
}
function toggleSidebar(){
  document.body.classList.toggle('sidebar-hidden');
  const hidden=document.body.classList.contains('sidebar-hidden');
  document.getElementById('sidebar-toggle-icon').textContent=hidden?'▶':'◀';
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ════════════════ THEMES ════════════════
const THEME_DOTS = { beige:'#7c5c3b', light:'#4e6fa0', dark:'#2a2a32', lunar:'#5858a0' };

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'beige' ? '' : theme);
  localStorage.setItem('cwm-theme', theme);
  const btn = document.getElementById('theme-current-btn');
  if (btn) btn.style.background = THEME_DOTS[theme] || THEME_DOTS.beige;
  document.querySelectorAll('.theme-opt').forEach(el =>
    el.classList.toggle('active', el.dataset.theme === theme)
  );
}

function toggleThemePicker() {
  document.getElementById('theme-options').classList.toggle('open');
}

function setTheme(theme) {
  applyTheme(theme);
  document.getElementById('theme-options').classList.remove('open');
}

// Close picker when clicking outside
document.addEventListener('click', e => {
  if (!document.getElementById('theme-picker')?.contains(e.target)) {
    document.getElementById('theme-options')?.classList.remove('open');
  }
});

// ════════════════ ACTIONS PANEL ════════════════
function toggleActions(){
  document.body.classList.toggle('actions-open');
  const open=document.body.classList.contains('actions-open');
  document.getElementById('actions-toggle-icon').textContent=open?'▶':'◀';
  if(open) renderActions();
}

function openActionInput(){
  const wrap=document.getElementById('actions-add-wrap');
  wrap.classList.toggle('open');
  if(wrap.classList.contains('open')){
    const inp=document.getElementById('actions-input');
    inp.value='';
    inp.focus();
  }
}

function addAction(title){
  if(!title.trim()) return;
  const today=new Date();
  const ds=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const ev={
    id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    title: title.trim(),
    date: ds,
    status:'idea',
    isAction: true,
    channel: S.channels[0]?.name || '',
    bucket: '',
    notes: '',
  };
  S.events.push(ev);
  persist();
  document.getElementById('actions-input').value='';
  document.getElementById('actions-add-wrap').classList.remove('open');
  renderCalendar();
  renderActions();
}

function completeAction(id){
  S.events=S.events.filter(e=>e.id!==id);
  persist();
  renderCalendar();
  renderActions();
}

function renderActions(){
  const list=document.getElementById('actions-list');
  if(!list) return;
  const today=new Date();
  const ds=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const actions=S.events.filter(e=>e.isAction && e.date===ds);
  if(!actions.length){
    list.innerHTML='<div class="actions-empty">No actions for today</div>';
    return;
  }
  list.innerHTML=actions.map(ev=>`
    <div class="actions-item" id="action-item-${ev.id}">
      <span class="actions-item-label">${escHtml(ev.title)}</span>
      <button class="actions-check-btn" onclick="completeAction('${ev.id}')" title="Mark done">✓</button>
    </div>
  `).join('');
}

// Wire up the actions input: Enter to submit
document.addEventListener('DOMContentLoaded', ()=>{
  const inp=document.getElementById('actions-input');
  if(inp) inp.addEventListener('keydown', e=>{
    if(e.key==='Enter') addAction(inp.value);
    if(e.key==='Escape'){
      document.getElementById('actions-add-wrap').classList.remove('open');
    }
  });
});

function toggleAmounts(){
  amountsHidden=!amountsHidden;
  document.querySelectorAll('.month-spon-amount').forEach(el=>el.classList.toggle('hidden',amountsHidden));
  document.querySelectorAll('.month-spon-eye').forEach(el=>el.textContent=amountsHidden?'🙈':'👁');
}

function buildMonth(yr,mo,today,isCurrent){
  const wrap=document.createElement('div');
  const h=document.createElement('div'); h.className='month-heading';

  // Calculate sponsorship total for this month
  const prefix=`${yr}-${String(mo+1).padStart(2,'0')}`;
  const sponEvs=S.events.filter(e=>e.sponsored&&e.date&&e.date.startsWith(prefix)&&(activeChannelFilter===null||e.channelId===activeChannelFilter));
  const sponTotal=sponEvs.reduce((sum,e)=>sum+(e.sponsoredAmount||0),0);
  const sponBadge=sponEvs.length
    ? `<span class="month-spon-badge">💰 <span class="month-spon-amount${amountsHidden?' hidden':''}">$${sponTotal.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}</span><button class="month-spon-eye" onclick="event.stopPropagation();toggleAmounts()">${amountsHidden?'🙈':'👁'}</button></span>`
    : '';

  h.innerHTML=`${MONTHS[mo]} <span class="yr">${yr}</span>${isCurrent?'<span class="now-badge">This month</span>':''}${sponBadge}`;
  wrap.appendChild(h);
  const grid=document.createElement('div'); grid.className='cal-grid';
  const wk=document.createElement('div'); wk.className='cal-weekdays';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>{ const div=document.createElement('div'); div.className='cal-weekday'; div.textContent=d; wk.appendChild(div); });
  grid.appendChild(wk);
  const days=document.createElement('div'); days.className='cal-days';
  const firstDay=new Date(yr,mo,1).getDay(), daysInMo=new Date(yr,mo+1,0).getDate(), daysInPrev=new Date(yr,mo,0).getDate();
  const total=Math.ceil((firstDay+daysInMo)/7)*7;
  for(let i=0;i<total;i++){
    let d,dm,dy,other=false;
    if(i<firstDay){d=daysInPrev-firstDay+i+1;dm=mo-1;dy=yr;if(dm<0){dm=11;dy--;}other=true;}
    else if(i>=firstDay+daysInMo){d=i-firstDay-daysInMo+1;dm=mo+1;dy=yr;if(dm>11){dm=0;dy++;}other=true;}
    else{d=i-firstDay+1;dm=mo;dy=yr;}
    const ds=`${dy}-${String(dm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=d===today.getDate()&&dm===today.getMonth()&&dy===today.getFullYear();
    const evs=S.events.filter(e=>e.date===ds&&(activeChannelFilter===null||e.channelId===activeChannelFilter));
    const cell=document.createElement('div');
    const col=i%7; // 0=Sun, 6=Sat
    const isWeekend=(col===0||col===6);
    cell.className='cal-day'+(other?' other-month':'')+(isToday?' today':'')+(isWeekend?' weekend':'');
    // Drop target
    cell.addEventListener('dragover',e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; cell.classList.add('drag-over'); });
    cell.addEventListener('dragleave',e=>{ if(!cell.contains(e.relatedTarget)) cell.classList.remove('drag-over'); });
    cell.addEventListener('drop',e=>{
      e.preventDefault(); cell.classList.remove('drag-over');
      const evId=e.dataTransfer.getData('eventId'); if(!evId) return;
      const ev=S.events.find(x=>x.id===evId); if(!ev) return;
      ev.date=ds; persist(); renderCalendar(); renderSponsoredTotal();
    });
    const num=document.createElement('div'); num.className='day-num'; num.textContent=d; cell.appendChild(num);
    const evDiv=document.createElement('div'); evDiv.className='day-events';
    evs.slice(0,4).forEach(ev=>{
      const bk=S.buckets.find(b=>b.id===ev.bucketId), col=bk?bk.color:PALETTE[0];
      const chip=document.createElement('div'); chip.className='day-event';
      chip.style.background=col+'22'; chip.style.color=col;
      chip.textContent=ev.title; chip.title=ev.title;
      chip.setAttribute('draggable','true');
      chip.addEventListener('dragstart',e=>{
        e.dataTransfer.setData('eventId',ev.id);
        e.dataTransfer.effectAllowed='move';
        chip.classList.add('dragging');
        // prevent cell click from firing
        setTimeout(()=>chip.classList.add('dragging'),0);
      });
      chip.addEventListener('dragend',()=>chip.classList.remove('dragging'));
      chip.addEventListener('click',e=>{e.stopPropagation();openDetail(ev.id);});
      evDiv.appendChild(chip);
    });
    if(evs.length>4){const m=document.createElement('div');m.className='day-event';m.style.background='var(--surface3)';m.style.color='var(--text-muted)';m.textContent=`+${evs.length-4} more`;evDiv.appendChild(m);}
    cell.appendChild(evDiv);
    const addBtn=document.createElement('div'); addBtn.className='day-add-btn'; addBtn.textContent='+';
    addBtn.addEventListener('click',e=>{e.stopPropagation();openEventModal(ds);}); cell.appendChild(addBtn);
    cell.addEventListener('click',()=>openEventModal(ds));
    days.appendChild(cell);
  }
  grid.appendChild(days); wrap.appendChild(grid); return wrap;
}
function openEventModal(dateStr){
  fillSelect('ev-bucket',S.buckets,b=>({v:b.id,t:b.name}));
  fillSelect('ev-channel',S.channels,c=>({v:c.id,t:`${c.icon||'📡'} ${c.name}`}));
  document.getElementById('ev-title').value=''; document.getElementById('ev-notes').value='';
  document.getElementById('ev-date').value=dateStr||''; document.getElementById('ev-status').value='idea';
  document.getElementById('modal-event-title').textContent=dateStr?`Add — ${fmtDate(dateStr)}`:'Add Content';
  openModal('modal-event'); setTimeout(()=>document.getElementById('ev-title').focus(),60);
}
document.getElementById('save-event-btn').addEventListener('click',()=>{
  const title=document.getElementById('ev-title').value.trim(); if(!title){alert('Please enter a title');return;}
  S.events.push({id:uid(),title,date:document.getElementById('ev-date').value,bucketId:document.getElementById('ev-bucket').value,channelId:document.getElementById('ev-channel').value,status:document.getElementById('ev-status').value,notes:document.getElementById('ev-notes').value.trim(),createdAt:Date.now()});
  persist(); closeModal('modal-event'); renderCalendar();
});
function openDetail(id){
  const ev=S.events.find(e=>e.id===id); if(!ev) return;
  const bk=S.buckets.find(b=>b.id===ev.bucketId), ch=S.channels.find(c=>c.id===ev.channelId);

  const titleInput=document.getElementById('detail-title-text');
  titleInput.value=ev.title;
  titleInput.readOnly=true;
  titleInput.onclick=()=>{
    if(!titleInput.readOnly) return;
    titleInput.readOnly=false;
    titleInput.select();
  };
  titleInput.onblur=()=>{
    const v=titleInput.value.trim();
    if(v&&v!==ev.title){ev.title=v;persist();renderCalendar();}
    else if(!v){titleInput.value=ev.title;}
    titleInput.readOnly=true;
  };
  titleInput.onkeydown=e=>{
    if(e.key==='Enter'){titleInput.blur();}
    if(e.key==='Escape'){titleInput.value=ev.title;titleInput.blur();}
  };

  const statuses=['idea','scripting','recording','editing','scheduled','published'];
  const statusPills=statuses.map(s=>{
    const ss=STATUS_STYLE[s]||STATUS_STYLE.idea;
    const isActive=ev.status===s;
    return `<button class="detail-status-btn${isActive?' active':''}" data-status="${s}"
      style="${isActive?`background:${ss.bg};color:${ss.text};border-color:${ss.text}`:''}"
      onclick="setEventStatus('${id}','${s}',this)">${s}</button>`;
  }).join('');

  const sponsoredOn=!!ev.sponsored;
  const sponsoredHTML=`
    <div class="detail-sponsored-row">
      <button class="detail-sponsored-toggle${sponsoredOn?' on':''}" id="spon-toggle-${id}" onclick="toggleSponsored('${id}')">
        💰 Sponsored${sponsoredOn?' ✓':''}
      </button>
      <div class="detail-amount-wrap" id="detail-amount-wrap-${id}" style="display:${sponsoredOn?'flex':'none'}">
        <span class="detail-amount-prefix">$</span>
        <input class="detail-amount-input" type="number" placeholder="0.00" min="0" step="0.01"
          value="${ev.sponsoredAmount||''}" oninput="setEventAmount('${id}',this.value)"/>
      </div>
    </div>`;

  const metaBadges=`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
    ${bk?`<span class="badge" style="background:${bk.color}22;color:${bk.color}">${bk.name}</span>`:''}
    ${ch?`<span class="badge" style="background:var(--surface3);color:var(--text-muted)">${ch.icon||'📡'} ${ch.name}</span>`:''}
    ${ev.date?`<span class="badge" style="background:var(--surface3);color:var(--text-muted)">📅 ${fmtDate(ev.date)}</span>`:''}
  </div>`;

  document.getElementById('detail-body').innerHTML=`
    ${metaBadges}
    <div class="detail-section-label">Status</div>
    <div class="detail-status-row">${statusPills}</div>
    ${sponsoredHTML}
    ${ev.notes?`<div class="detail-notes">${ev.notes}</div>`:''}
  `;

  document.getElementById('detail-del-btn').onclick=()=>{
    S.events=S.events.filter(e=>e.id!==id);
    persist(); closeModal('modal-detail'); renderCalendar(); renderSponsoredTotal();
  };
  openModal('modal-detail');
}

function setEventStatus(id,status,btn){
  const ev=S.events.find(e=>e.id===id); if(!ev) return;
  ev.status=status; persist();
  document.querySelectorAll('.detail-status-btn').forEach(b=>{
    const s=b.dataset.status; const ss=STATUS_STYLE[s]||STATUS_STYLE.idea;
    const active=b===btn;
    b.classList.toggle('active',active);
    b.style.background=active?ss.bg:'';
    b.style.color=active?ss.text:'';
    b.style.borderColor=active?ss.text:'';
  });
}

function toggleSponsored(id){
  const ev=S.events.find(e=>e.id===id); if(!ev) return;
  ev.sponsored=!ev.sponsored; persist();
  const btn=document.getElementById(`spon-toggle-${id}`);
  if(btn){btn.classList.toggle('on',ev.sponsored);btn.innerHTML=`💰 Sponsored${ev.sponsored?' ✓':''}`;}
  const wrap=document.getElementById(`detail-amount-wrap-${id}`);
  if(wrap) wrap.style.display=ev.sponsored?'flex':'none';
  renderSponsoredTotal();
}

function setEventAmount(id,value){
  const ev=S.events.find(e=>e.id===id); if(!ev) return;
  ev.sponsoredAmount=parseFloat(value)||0; persist(); renderSponsoredTotal();
}

// Sponsorship totals are now rendered inline in each month heading via buildMonth().
// This function re-renders the calendar to refresh all month badges.
function renderSponsoredTotal(){ renderCalendar(); }

// ════════════════ BOARD ════════════════
function renderBoard(){ renderBuckets(); renderChannels(); renderChannelFilter(); }
function renderBuckets(){
  const bar=document.getElementById('bucket-tabs-bar'), panels=document.getElementById('bucket-panels');
  bar.innerHTML=''; panels.innerHTML='';
  if(!S.buckets.length){panels.innerHTML=`<div class="panel-empty"><strong>No buckets yet</strong>Click "+ New Bucket" to create one.</div>`;return;}
  if(!activeBucket||!S.buckets.find(b=>b.id===activeBucket)) activeBucket=S.buckets[0].id;
  S.buckets.forEach(bk=>{
    const tab=document.createElement('div'); tab.className='bucket-tab'+(bk.id===activeBucket?' active':'');
    tab.innerHTML=`<span class="tab-dot" style="background:${bk.color}"></span>${bk.name}<span class="tab-x">&times;</span>`;
    tab.addEventListener('click',e=>{if(e.target.classList.contains('tab-x'))return;activeBucket=bk.id;renderBuckets();});
    tab.querySelector('.tab-x').addEventListener('click',e=>{e.stopPropagation();const cnt=S.events.filter(ev=>ev.bucketId===bk.id).length;if(!confirm(`Delete "${bk.name}"?${cnt?` Also removes ${cnt} linked item(s).`:''}`))return;S.buckets=S.buckets.filter(b=>b.id!==bk.id);if(activeBucket===bk.id)activeBucket=null;persist();renderBuckets();});
    bar.appendChild(tab);
    const panel=document.createElement('div'); panel.className='bucket-panel'+(bk.id===activeBucket?' active':'');
    const items=S.events.filter(ev=>ev.bucketId===bk.id);
    const topbar=document.createElement('div'); topbar.className='bucket-panel-topbar';
    topbar.innerHTML=`<div><h4>${bk.name}</h4>${bk.desc?`<p>${bk.desc}</p>`:''}</div><button class="btn btn-primary btn-xs">+ Add Item</button>`;
    topbar.querySelector('button').addEventListener('click',()=>openBucketItemModal(bk.id)); panel.appendChild(topbar);
    if(!items.length){const emp=document.createElement('div');emp.className='panel-empty';emp.innerHTML='<strong>Empty</strong>Hit "+ Add Item" to add content.';panel.appendChild(emp);}
    else{const grid=document.createElement('div');grid.className='bucket-items-grid';items.forEach(ev=>{const ss=STATUS_STYLE[ev.status]||STATUS_STYLE.idea,ch=S.channels.find(c=>c.id===ev.channelId);const card=document.createElement('div');card.className='bucket-item';card.innerHTML=`<button class="item-del">&times;</button><div class="bucket-item-title">${ev.title}</div><div class="bucket-item-meta"><span class="badge" style="background:${ss.bg};color:${ss.text}">${ev.status}</span>${ev.date?`<span style="font-size:11px;color:var(--text-muted)">📅 ${fmtDate(ev.date)}</span>`:''}${ch?`<span style="font-size:11px;color:var(--text-muted)">${ch.icon||'📡'} ${ch.name}</span>`:''}</div>${ev.notes?`<p style="font-size:11.5px;color:var(--text-muted);margin-top:8px;line-height:1.6">${ev.notes}</p>`:''}`;card.querySelector('.item-del').addEventListener('click',()=>{S.events=S.events.filter(e=>e.id!==ev.id);persist();renderBuckets();});grid.appendChild(card);});panel.appendChild(grid);}
    panels.appendChild(panel);
  });
}
function openBucketModal(){document.getElementById('bk-name').value='';document.getElementById('bk-desc').value='';buildColors('bk-colors');openModal('modal-bucket');setTimeout(()=>document.getElementById('bk-name').focus(),60);}
document.getElementById('save-bucket-btn').addEventListener('click',()=>{const name=document.getElementById('bk-name').value.trim();if(!name){alert('Please enter a name');return;}S.buckets.push({id:uid(),name,color:pickedColor('bk-colors'),desc:document.getElementById('bk-desc').value.trim(),createdAt:Date.now()});activeBucket=S.buckets[S.buckets.length-1].id;persist();closeModal('modal-bucket');renderBuckets();});
function openBucketItemModal(bucketId){const bk=S.buckets.find(b=>b.id===bucketId);document.getElementById('bi-modal-title').textContent=`Add to "${bk?.name||'Bucket'}"`;document.getElementById('bi-title').value='';document.getElementById('bi-notes').value='';document.getElementById('bi-date').value='';document.getElementById('bi-status').value='idea';fillSelect('bi-channel',S.channels,c=>({v:c.id,t:`${c.icon||'📡'} ${c.name}`}));document.getElementById('save-bi-btn').onclick=()=>{const title=document.getElementById('bi-title').value.trim();if(!title){alert('Please enter a title');return;}S.events.push({id:uid(),title,bucketId,channelId:document.getElementById('bi-channel').value,date:document.getElementById('bi-date').value,status:document.getElementById('bi-status').value,notes:document.getElementById('bi-notes').value.trim(),createdAt:Date.now()});persist();closeModal('modal-bi');renderBuckets();};openModal('modal-bi');setTimeout(()=>document.getElementById('bi-title').focus(),60);}
function renderChannels(){const list=document.getElementById('channels-list'),empty=document.getElementById('channels-empty');list.innerHTML='';if(!S.channels.length){list.style.display='none';empty.style.display='block';return;}list.style.display='flex';empty.style.display='none';S.channels.forEach(ch=>{const count=S.events.filter(e=>e.channelId===ch.id).length;const card=document.createElement('div');card.className='channel-card';card.style.borderLeft=`3px solid ${ch.color}`;card.innerHTML=`<button class="ch-del">&times;</button><div class="channel-card-top"><div class="ch-icon" style="background:${ch.color}18;color:${ch.color}">${ch.icon||'📡'}</div><div><div class="ch-name">${ch.name}</div>${ch.handle?`<div class="ch-handle">${ch.handle}</div>`:''}</div></div>${(ch.followers||ch.freq||count)?`<div class="ch-stats">${ch.followers?`<div class="ch-stat"><strong>${ch.followers}</strong><span>Followers</span></div>`:''} ${ch.freq?`<div class="ch-stat"><strong>${ch.freq}</strong><span>Frequency</span></div>`:''}<div class="ch-stat"><strong>${count}</strong><span>Pieces</span></div></div>`:''} ${ch.notes?`<div class="ch-notes">${ch.notes}</div>`:''}`;card.querySelector('.ch-del').addEventListener('click',()=>{if(!confirm(`Remove "${ch.name}"?`))return;S.channels=S.channels.filter(c=>c.id!==ch.id);persist();renderChannels();});list.appendChild(card);});}
function openChannelModal(){['ch-name','ch-handle','ch-followers','ch-freq','ch-notes'].forEach(id=>document.getElementById(id).value='');document.getElementById('ch-icon').value='';buildColors('ch-colors');openModal('modal-channel');setTimeout(()=>document.getElementById('ch-name').focus(),60);}
document.getElementById('save-ch-btn').addEventListener('click',()=>{const name=document.getElementById('ch-name').value.trim();if(!name){alert('Please enter a channel name');return;}S.channels.push({id:uid(),name,icon:document.getElementById('ch-icon').value.trim()||'📡',handle:document.getElementById('ch-handle').value.trim(),color:pickedColor('ch-colors'),followers:document.getElementById('ch-followers').value.trim(),freq:document.getElementById('ch-freq').value.trim(),notes:document.getElementById('ch-notes').value.trim(),createdAt:Date.now()});persist();closeModal('modal-channel');renderChannels();});

// ════════════════════════════════════════
// INSPO BOARD
// ════════════════════════════════════════

function getInspoPlatforms() {
  return ['All', ...new Set(S.inspo.map(i=>i.platform).filter(Boolean))];
}

function renderInspo() {
  renderInspoFilters();
  renderInspoGrid();
}

function renderInspoFilters() {
  const bar = document.getElementById('inspo-filters');
  const platforms = getInspoPlatforms();
  bar.innerHTML = '';
  platforms.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'plat-chip' + (inspoFilter === p ? ' active' : '');
    chip.textContent = p === 'All' ? '✦ All' : `${platEmoji(p)} ${p}`;
    chip.addEventListener('click', () => { inspoFilter = p; renderInspo(); });
    bar.appendChild(chip);
  });
}

function renderInspoGrid() {
  const grid = document.getElementById('inspo-grid');
  const items = inspoFilter === 'All' ? S.inspo : S.inspo.filter(i => i.platform === inspoFilter);

  if (!items.length) {
    grid.innerHTML = `<div class="inspo-empty"><h3>${inspoFilter === 'All' ? 'No inspiration yet' : `Nothing for ${inspoFilter}`}</h3><p>Add links or paste images to build your mood board.<br>Press <strong>⌘V</strong> anywhere to paste an image from your clipboard.</p></div>`;
    return;
  }

  grid.innerHTML = '';
  [...items].sort((a,b)=>b.createdAt-a.createdAt).forEach(item => {
    grid.appendChild(buildInspoCard(item));
  });
}

function buildInspoCard(item) {
  const col   = platColor(item.platform || 'Other');
  const emoji = platEmoji(item.platform || 'Other');
  const card  = document.createElement('div');
  card.className = 'inspo-card';

  let topHTML = '';
  if (item.type === 'image' && item.imageData) {
    topHTML = `<img src="${item.imageData}" alt="${item.title||''}" loading="lazy"/>`;
  } else if (item.type === 'link') {
    const domain = item.url ? getDomain(item.url) : '';
    topHTML = `<div class="inspo-link-preview">
      <div class="inspo-link-icon">${emoji}</div>
      <div class="inspo-link-domain">${domain}</div>
    </div>`;
  }

  card.innerHTML = `
    ${topHTML}
    <div class="inspo-card-controls">
      ${item.url ? `<div class="inspo-ctrl-btn open" onclick="window.open('${item.url}','_blank')" title="Open link">↗</div>` : ''}
      <div class="inspo-ctrl-btn" onclick="deleteInspo('${item.id}')" title="Delete">✕</div>
    </div>
    <div class="inspo-card-body">
      ${item.title ? `<div class="inspo-card-title">${item.title}</div>` : ''}
      ${item.url   ? `<a class="inspo-card-url" href="${item.url}" target="_blank" rel="noopener">${item.url}</a>` : ''}
      ${item.notes ? `<div class="inspo-card-notes">${item.notes}</div>` : ''}
      <div class="inspo-card-footer">
        <span class="inspo-card-plat" style="background:${col}18;color:${col}">${emoji} ${item.platform||'Other'}</span>
        <span class="inspo-card-date">${timeAgo(item.createdAt)}</span>
      </div>
    </div>`;

  return card;
}

function deleteInspo(id) {
  S.inspo = S.inspo.filter(i => i.id !== id);
  persist();
  renderInspo();
}

// ── Inspo Modal ──
let selectedPlatform = 'YouTube';

function openInspoModal(type) {
  inspoType = type;
  pendingImage = null;
  document.getElementById('inspo-title').value   = '';
  document.getElementById('inspo-notes').value   = '';
  document.getElementById('inspo-url').value     = '';
  document.getElementById('inspo-custom-plat').value = '';
  clearInspoImageUI();
  switchInspoType(type);
  buildPlatPills();
  openModal('modal-inspo');
  if (type === 'link') setTimeout(()=>document.getElementById('inspo-url').focus(),60);
  else setTimeout(()=>document.getElementById('inspo-title').focus(),60);
}

function switchInspoType(type) {
  inspoType = type;
  document.getElementById('type-btn-image').classList.toggle('active', type==='image');
  document.getElementById('type-btn-link').classList.toggle('active',  type==='link');
  document.getElementById('inspo-image-panel').style.display = type==='image' ? 'block' : 'none';
  document.getElementById('inspo-link-panel').style.display  = type==='link'  ? 'block' : 'none';
  document.getElementById('inspo-modal-title').textContent   = type==='image' ? 'Add Image' : 'Add Link';
}

function buildPlatPills() {
  const row = document.getElementById('plat-pills');
  row.innerHTML = '';
  PLAT_DEFS.forEach(p => {
    const pill = document.createElement('div');
    pill.className = 'plat-pill' + (selectedPlatform===p.name?' selected':'');
    pill.textContent = `${p.emoji} ${p.name}`;
    pill.addEventListener('click', () => {
      row.querySelectorAll('.plat-pill').forEach(x=>x.classList.remove('selected'));
      pill.classList.add('selected');
      selectedPlatform = p.name;
      document.getElementById('inspo-custom-plat').value = '';
    });
    row.appendChild(pill);
  });
}

document.getElementById('save-inspo-btn').addEventListener('click', () => {
  const title    = document.getElementById('inspo-title').value.trim();
  const notes    = document.getElementById('inspo-notes').value.trim();
  const url      = document.getElementById('inspo-url').value.trim();
  const custom   = document.getElementById('inspo-custom-plat').value.trim();
  const platform = custom || selectedPlatform || 'Other';

  if (inspoType === 'image' && !pendingImage) { alert('Please add an image first.'); return; }
  if (inspoType === 'link'  && !url)          { alert('Please enter a URL.'); return; }

  S.inspo.push({
    id:        uid(),
    type:      inspoType,
    title,
    notes,
    url:       inspoType==='link' ? url : '',
    imageData: inspoType==='image' ? pendingImage : null,
    platform,
    createdAt: Date.now(),
  });
  persist();
  closeModal('modal-inspo');
  pendingImage = null;
  renderInspo();
});

// ── Image drop zone ──
const imgDropZone  = document.getElementById('img-drop-zone');
const imgFileInput = document.getElementById('img-file-input');

imgDropZone.addEventListener('click', e => { if(e.target.closest('.img-preview-wrap')) return; imgFileInput.click(); });
imgDropZone.addEventListener('dragover', e => { e.preventDefault(); imgDropZone.classList.add('drag-over'); });
imgDropZone.addEventListener('dragleave', () => imgDropZone.classList.remove('drag-over'));
imgDropZone.addEventListener('drop', e => {
  e.preventDefault(); imgDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImageFile(file);
});
imgFileInput.addEventListener('change', e => { if(e.target.files[0]) loadImageFile(e.target.files[0]); });

// ── Global paste detection ──
document.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (document.getElementById('modal-inspo').style.display !== 'none') {
        if (inspoType === 'image') loadImageFile(file);
      } else {
        openInspoModal('image');
        setTimeout(() => loadImageFile(file), 100);
      }
      break;
    }
  }
});

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    const resized = await resizeImage(e.target.result, 1000);
    pendingImage = resized;
    showInspoImagePreview(resized);
  };
  reader.readAsDataURL(file);
}

function showInspoImagePreview(dataUrl) {
  document.getElementById('img-placeholder').style.display = 'none';
  document.getElementById('img-preview-wrap').style.display = 'block';
  document.getElementById('img-preview').src = dataUrl;
}

function clearInspoImage(e) {
  if (e) e.stopPropagation();
  pendingImage = null;
  clearInspoImageUI();
}

function clearInspoImageUI() {
  document.getElementById('img-placeholder').style.display = 'block';
  document.getElementById('img-preview-wrap').style.display = 'none';
  document.getElementById('img-preview').src = '';
  imgFileInput.value = '';
}

function resizeImage(dataUrl, maxW=1000) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxW/img.width);
      const w = Math.round(img.width*ratio), h = Math.round(img.height*ratio);
      const canvas = document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  });
}

// ════════════════ HELPERS ════════════════
function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}
function fmtDate(s){if(!s)return'';const[y,m,d]=s.split('-').map(Number);return`${MONTHS_S[m-1]} ${d}, ${y}`;}
function fmtDateShort(d){return`${MONTHS_S[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;}
function fmtDateShort2(s){const d=new Date(s);return!isNaN(d)?`${MONTHS_S[d.getMonth()]} ${d.getDate()}`:s;}
function fmtNum(n){if(n===null||n===undefined)return'—';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return Math.round(n).toLocaleString();}
function fmtNumShort(n){if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(0)+'K';return n;}
function parseNum(v){if(v===undefined||v===null||v==='')return null;return parseFloat(String(v).replace(/[,%]/g,''));}
function getDomain(url){try{return new URL(url).hostname.replace('www.','');}catch{return url;}}
function timeAgo(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;if(s<604800)return`${Math.floor(s/86400)}d ago`;return fmtDate(new Date(ts).toISOString().slice(0,10));}

// ════════════════ GOALS ════════════════
let editingGoalId = null;
let selectedGoalPlat = 'YouTube';

function toggleGoals() {
  S.goalsOpen = !S.goalsOpen;
  persist();
  applyGoalsOpen();
}

function applyGoalsOpen() {
  document.getElementById('goals-body').classList.toggle('open', S.goalsOpen);
  document.getElementById('goals-toggle').classList.toggle('open', S.goalsOpen);
  document.getElementById('goals-chevron').classList.toggle('open', S.goalsOpen);
}

function renderGoals() {
  const grid  = document.getElementById('goals-grid');
  const badge = document.getElementById('goals-badge');
  applyGoalsOpen();

  badge.textContent = S.goals.length;
  badge.style.display = S.goals.length ? 'inline' : 'none';

  grid.innerHTML = '';

  S.goals.forEach(g => grid.appendChild(buildGoalCard(g)));

  const add = document.createElement('div');
  add.className = 'goal-add-card';
  add.innerHTML = `<span style="font-size:18px">＋</span> New Goal`;
  add.addEventListener('click', () => openGoalModal(null));
  grid.appendChild(add);
}

function buildGoalCard(g) {
  const col     = platColor(g.platform);
  const emoji   = platEmoji(g.platform);
  const pct     = g.goalCount > 0 ? Math.min(100, (g.currentCount / g.goalCount) * 100) : 0;
  const card    = document.createElement('div');
  card.className = 'goal-card';

  const canSync = g.url && (g.metric === 'Followers' || g.metric === 'Subscribers');

  card.innerHTML = `
    <div class="goal-controls">
      ${canSync ? `<div class="goal-ctrl goal-sync-btn" id="sync-btn-${g.id}" title="Sync follower count" onclick="refreshGoalCount('${g.id}')">↻</div>` : ''}
      <div class="goal-ctrl" title="Edit" onclick="openGoalModal('${g.id}')">✎</div>
      <div class="goal-ctrl" title="Delete" onclick="deleteGoal('${g.id}')">✕</div>
    </div>
    <div class="goal-card-top">
      <div class="goal-icon" style="background:${col}18;color:${col}">${emoji}</div>
      <div>
        <div class="goal-platform">${g.platform}</div>
        <div class="goal-metric-lbl">${g.metric}</div>
      </div>
    </div>
    <div class="goal-numbers">
      <span class="goal-current" style="color:${col}">${fmtNum(g.currentCount)}</span>
      <span class="goal-sep">/</span>
      <span class="goal-target">${fmtNum(g.goalCount)}</span>
      <span class="goal-pct" style="background:${col}18;color:${col};margin-left:auto">${pct.toFixed(1)}%</span>
    </div>
    <div class="goal-bar-wrap">
      <div class="goal-bar-fill" style="width:${pct}%;background:${col}"></div>
    </div>
    ${g.url ? `
      <div class="goal-url-row">
        <a class="goal-url" href="${g.url}" target="_blank" rel="noopener">↗ ${getDomain(g.url)}</a>
        ${canSync ? `<span class="goal-sync-label">${g.lastFetched ? `Synced ${timeAgo(g.lastFetched)}` : 'Not synced yet'}</span>` : ''}
      </div>` : ''}
    ${g.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5">${g.notes}</div>` : ''}
  `;
  return card;
}

async function refreshGoalCount(goalId) {
  const goal = S.goals.find(g => g.id === goalId);
  if (!goal || !goal.url) return;

  const btn = document.getElementById(`sync-btn-${goalId}`);
  if (btn) { btn.classList.add('spinning'); btn.style.pointerEvents = 'none'; }

  try {
    const res  = await fetch(`/api/social-stats?url=${encodeURIComponent(goal.url)}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    const data = await res.json();

    if (!res.ok) {
      if (btn) { btn.classList.remove('spinning'); btn.style.pointerEvents = ''; }
      showSyncError(goalId, data.error || 'Could not fetch count');
      return;
    }

    const idx = S.goals.findIndex(g => g.id === goalId);
    if (idx !== -1) {
      S.goals[idx].currentCount = data.count;
      S.goals[idx].lastFetched  = Date.now();
    }
    persist();
    renderGoals();
  } catch {
    if (btn) { btn.classList.remove('spinning'); btn.style.pointerEvents = ''; }
    showSyncError(goalId, 'Connection error — try again');
  }
}

function showSyncError(goalId, msg) {
  const btn = document.getElementById(`sync-btn-${goalId}`);
  if (!btn) return;
  btn.classList.remove('spinning');
  btn.style.pointerEvents = '';
  btn.title = msg;
  btn.style.color = 'var(--accent2)';
  setTimeout(() => { btn.style.color = ''; btn.title = 'Sync follower count'; }, 3000);
}

function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  S.goals = S.goals.filter(g => g.id !== id);
  persist(); renderGoals();
}

function openGoalModal(id) {
  editingGoalId = id;
  const g = id ? S.goals.find(x => x.id === id) : null;

  document.getElementById('goal-modal-title').textContent = id ? 'Edit Goal' : 'Add Goal';
  document.getElementById('goal-url').value     = g?.url     || '';
  document.getElementById('goal-metric').value  = g?.metric  || 'Subscribers';
  document.getElementById('goal-current').value = g?.currentCount ?? '';
  document.getElementById('goal-target').value  = g?.goalCount    ?? '';
  document.getElementById('goal-notes').value   = g?.notes   || '';
  document.getElementById('goal-custom-plat').value = '';

  selectedGoalPlat = g?.platform || 'YouTube';
  buildGoalPlatPills();
  openModal('modal-goal');
  setTimeout(() => document.getElementById('goal-current').focus(), 60);
}

function buildGoalPlatPills() {
  const row = document.getElementById('goal-plat-pills');
  row.innerHTML = '';
  PLAT_DEFS.forEach(p => {
    const pill = document.createElement('div');
    pill.className = 'plat-pill' + (selectedGoalPlat === p.name ? ' selected' : '');
    pill.textContent = `${p.emoji} ${p.name}`;
    pill.addEventListener('click', () => {
      row.querySelectorAll('.plat-pill').forEach(x => x.classList.remove('selected'));
      pill.classList.add('selected');
      selectedGoalPlat = p.name;
      document.getElementById('goal-custom-plat').value = '';
    });
    row.appendChild(pill);
  });
}

document.getElementById('save-goal-btn').addEventListener('click', () => {
  const custom   = document.getElementById('goal-custom-plat').value.trim();
  const platform = custom || selectedGoalPlat || 'Other';
  const url      = document.getElementById('goal-url').value.trim();
  const metric   = document.getElementById('goal-metric').value;
  const current  = parseInt(document.getElementById('goal-current').value) || 0;
  const target   = parseInt(document.getElementById('goal-target').value)  || 0;
  const notes    = document.getElementById('goal-notes').value.trim();

  if (!target) { alert('Please enter a goal number.'); return; }

  if (editingGoalId) {
    const idx = S.goals.findIndex(g => g.id === editingGoalId);
    if (idx !== -1) S.goals[idx] = {...S.goals[idx], platform, url, metric, currentCount:current, goalCount:target, notes};
  } else {
    S.goals.push({id:uid(), platform, url, metric, currentCount:current, goalCount:target, notes, createdAt:Date.now()});
  }
  persist();
  closeModal('modal-goal');
  renderGoals();
});

// ════════════════ AUTH ════════════════
let authMode = 'login';

function showAuthScreen() {
  document.getElementById('auth-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('auth-email').focus(), 60);
}
function hideAuthScreen() { document.getElementById('auth-overlay').style.display = 'none'; }

function logout() {
  localStorage.removeItem('cos-token');
  S = {events:[],buckets:[],channels:[],csv:null,inspo:[],goals:[],goalsOpen:true};
  document.getElementById('sidebar-user').style.display = 'none';
  showAuthScreen();
}

function switchAuthTab(tab) {
  authMode = tab;
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('auth-confirm-wrap').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('auth-submit-btn').textContent = tab === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-footer-text').innerHTML = tab === 'login'
    ? `Don't have an account? <span class="auth-switch" onclick="switchAuthTab('signup')">Create one free</span>`
    : `Already have an account? <span class="auth-switch" onclick="switchAuthTab('login')">Sign in</span>`;
  document.getElementById('auth-error').style.display = 'none';
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
});

document.getElementById('auth-submit-btn').addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showAuthError('Please enter your email and password.'); return; }
  if (authMode === 'signup') {
    if (password.length < 8) { showAuthError('Password must be at least 8 characters.'); return; }
    if (password !== document.getElementById('auth-confirm').value) { showAuthError('Passwords do not match.'); return; }
  }
  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true; btn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';
  try {
    const res  = await fetch(`/api/auth/${authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      showAuthError(data.error || 'Something went wrong. Is the server running?');
      btn.disabled = false; btn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
      return;
    }
    localStorage.setItem('cos-token', data.token);
    setUserInSidebar(data.email);
    hideAuthScreen();
    S = {events:[],buckets:[],channels:[],csv:null,inspo:[],goals:[],goalsOpen:true};
    const ok = await load(); if (!ok) return;
    renderCalendar(); renderGoals(); renderSponsoredTotal();
  } catch {
    showAuthError('Cannot reach the server. Make sure the app is running with: npm start');
    btn.disabled = false; btn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
  }
});

function showAuthError(msg) {
  const el = document.getElementById('auth-error'); el.textContent = msg; el.style.display = 'block';
}
function setUserInSidebar(email) {
  document.getElementById('sidebar-user-email').textContent = email;
  document.getElementById('sidebar-user-avatar').textContent = email[0].toUpperCase();
  document.getElementById('sidebar-user').style.display = 'flex';
}

['auth-email','auth-password','auth-confirm'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('auth-submit-btn').click(); });
});

// ════════════════ INIT ════════════════
async function init() {
  applyTheme(localStorage.getItem('cwm-theme') || 'beige');
  const token = getToken();
  if (!token) { showAuthScreen(); return; }
  const ok = await load(); if (!ok) return;
  hideAuthScreen();
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    setUserInSidebar(payload.email);
  } catch {}
  refreshToken(); // extend session in background
  renderCalendar(); renderGoals(); renderSponsoredTotal(); renderActions(); renderChannelFilter();
}
init();
