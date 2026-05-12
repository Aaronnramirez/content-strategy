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
let S = {events:[],buckets:[],channels:[],csv:null,inspo:[],goals:[],goalsOpen:true};
let activeBucket = null;
let ytRangeDays = 90, ytPeriodOffset = 0, activeInnerTab = 'yt-data';
let inspoFilter = 'All';
let inspoType   = 'image';
let pendingImage = null;

async function load() {
  try {
    const res = await fetch('/api/data');
    if (res.ok) { const data = await res.json(); S = { ...S, ...data }; }
  } catch(e) { console.error('Failed to load data:', e); }
}

function persist() {
  fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(S),
  }).catch(e => console.error('Failed to save data:', e));
}

// ════════════════ NAV ════════════════
const TOPBAR_META = {
  calendar:  {title:'Calendar',    sub:'Your content schedule — current month through the next 6'},
  board:     {title:'Board',       sub:'Manage buckets and channels in one place'},
  inspo:     {title:'Inspo Board', sub:'Collect links, images, and references organized by platform'},
  analytics: {title:'Analytics',   sub:'YouTube performance data from your imported CSV'},
  import:    {title:'CSV Import',  sub:'Upload a YouTube Studio CSV to power the Analytics tab'},
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
    if(s==='analytics') renderAnalytics();
    if(s==='import'&&S.csv) renderCSVTable();
  });
});

document.querySelectorAll('.inner-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.inner-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.inner-panel').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-'+tab.dataset.panel).classList.add('active');
    activeInnerTab=tab.dataset.panel==='yt-data'?'yt-data':'yt-suggested';
    renderAnalytics();
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
function buildMonth(yr,mo,today,isCurrent){
  const wrap=document.createElement('div');
  const h=document.createElement('div'); h.className='month-heading';
  h.innerHTML=`${MONTHS[mo]} <span class="yr">${yr}</span>${isCurrent?'<span class="now-badge">This month</span>':''}`;
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
    const evs=S.events.filter(e=>e.date===ds);
    const cell=document.createElement('div');
    cell.className='cal-day'+(other?' other-month':'')+(isToday?' today':'');
    const num=document.createElement('div'); num.className='day-num'; num.textContent=d; cell.appendChild(num);
    const evDiv=document.createElement('div'); evDiv.className='day-events';
    evs.slice(0,4).forEach(ev=>{
      const bk=S.buckets.find(b=>b.id===ev.bucketId), col=bk?bk.color:PALETTE[0];
      const chip=document.createElement('div'); chip.className='day-event';
      chip.style.background=col+'22'; chip.style.color=col; chip.textContent=ev.title; chip.title=ev.title;
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
  const bk=S.buckets.find(b=>b.id===ev.bucketId), ch=S.channels.find(c=>c.id===ev.channelId), ss=STATUS_STYLE[ev.status]||STATUS_STYLE.idea;
  document.getElementById('detail-title-text').textContent=ev.title;
  document.getElementById('detail-body').innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px"><span class="badge" style="background:${ss.bg};color:${ss.text}">${ev.status}</span>${bk?`<span class="badge" style="background:${bk.color}22;color:${bk.color}">${bk.name}</span>`:''} ${ch?`<span class="badge" style="background:var(--surface3);color:var(--text-muted)">${ch.icon||'📡'} ${ch.name}</span>`:''}</div>${ev.date?`<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">📅 ${fmtDate(ev.date)}</p>`:''}${ev.notes?`<p style="font-size:13px;color:var(--text-muted);line-height:1.7">${ev.notes}</p>`:''}`;
  document.getElementById('detail-del-btn').onclick=()=>{S.events=S.events.filter(e=>e.id!==id);persist();closeModal('modal-detail');renderCalendar();};
  openModal('modal-detail');
}

// ════════════════ BOARD ════════════════
function renderBoard(){ renderBuckets(); renderChannels(); }
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

// ════════════════ ANALYTICS ════════════════
document.querySelectorAll('.range-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.range-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');ytRangeDays=parseInt(btn.dataset.days);ytPeriodOffset=0;renderAnalytics();});});
document.getElementById('period-prev').addEventListener('click',()=>{ytPeriodOffset++;renderAnalytics();});
document.getElementById('period-next').addEventListener('click',()=>{if(ytPeriodOffset>0){ytPeriodOffset--;renderAnalytics();}});

function renderAnalytics(){if(activeInnerTab==='yt-data')renderYTData();else renderYTSuggested();}

function detectCols(headers){const h=headers.map(x=>x.toLowerCase().trim());const find=(...t)=>h.findIndex(x=>t.some(s=>x.includes(s)));return{date:find('date'),views:find('views'),watchTime:find('watch time'),subs:find('subscriber'),impressions:h.findIndex(x=>x.includes('impression')&&!x.includes('click')&&!x.includes('through')),ctr:find('click-through','ctr'),avgDuration:find('average view duration'),trafficSrc:find('traffic source'),};}

function getDateRange(){const end=new Date();end.setHours(23,59,59,0);end.setDate(end.getDate()-ytPeriodOffset*ytRangeDays);const start=new Date(end);start.setDate(start.getDate()-ytRangeDays+1);start.setHours(0,0,0,0);return{start,end};}

function renderYTData(){
  const el=document.getElementById('yt-data-content');
  if(!S.csv){el.innerHTML=uploadPromptHTML('YouTube Data','Export from <strong>YouTube Studio → Analytics → Content → Export</strong>.');return;}
  const[headers,...allRows]=S.csv.rows, cols=detectCols(headers);
  if(cols.date===-1||cols.views===-1){el.innerHTML=`<div class="upload-prompt"><h3>Unrecognised format</h3><p>This CSV doesn't have the expected columns. Try the <strong>Overview</strong> export from YouTube Studio Analytics.</p></div>`;return;}
  const{start,end}=getDateRange();
  document.getElementById('range-label').textContent=`${fmtDateShort(start)} – ${fmtDateShort(end)}`;
  document.getElementById('period-next').style.opacity=ytPeriodOffset===0?'.4':'1';
  document.getElementById('period-next').style.pointerEvents=ytPeriodOffset===0?'none':'';
  const rows=allRows.filter(r=>{const ds=(r[cols.date]||'').trim();if(!ds)return false;const d=new Date(ds);return !isNaN(d)&&d>=start&&d<=end;}).sort((a,b)=>new Date(a[cols.date])-new Date(b[cols.date]));
  if(!rows.length){el.innerHTML=`<div class="upload-prompt"><h3 style="font-size:14px">No data in this range</h3><p>Try a different range or navigate to an earlier period.</p></div>`;return;}
  const sum=k=>rows.reduce((acc,r)=>acc+(parseNum(r[cols[k]])||0),0);
  const avg=k=>cols[k]===-1?null:sum(k)/rows.filter(r=>r[cols[k]]!==undefined).length;
  const totalViews=sum('views'),totalWatchH=cols.watchTime!==-1?sum('watchTime'):null,totalSubs=cols.subs!==-1?sum('subs'):null,totalImpr=cols.impressions!==-1?sum('impressions'):null,avgCTR=cols.ctr!==-1?avg('ctr'):null;
  let cardsHTML=`<div class="metric-cards"><div class="metric-card"><div class="metric-card-label">Views</div><div class="metric-card-value" style="color:${CHART_COLORS.views}">${fmtNum(totalViews)}</div><div class="metric-card-sub">in ${rows.length} days</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:100%;background:${CHART_COLORS.views}"></div></div></div>`;
  if(totalWatchH!==null)cardsHTML+=`<div class="metric-card"><div class="metric-card-label">Watch Time</div><div class="metric-card-value" style="color:${CHART_COLORS.watchTime}">${fmtNum(Math.round(totalWatchH))}h</div><div class="metric-card-sub">${fmtNum(Math.round(totalWatchH*60))} mins</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:80%;background:${CHART_COLORS.watchTime}"></div></div></div>`;
  if(totalSubs!==null)cardsHTML+=`<div class="metric-card"><div class="metric-card-label">Subscribers</div><div class="metric-card-value" style="color:${CHART_COLORS.subscribers}">${totalSubs>=0?'+':''}${fmtNum(totalSubs)}</div><div class="metric-card-sub">gained in period</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:65%;background:${CHART_COLORS.subscribers}"></div></div></div>`;
  if(totalImpr!==null)cardsHTML+=`<div class="metric-card"><div class="metric-card-label">Impressions</div><div class="metric-card-value" style="color:${CHART_COLORS.impressions}">${fmtNum(totalImpr)}</div><div class="metric-card-sub">${avgCTR!==null?`CTR: ${avgCTR.toFixed(1)}%`:''}</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:55%;background:${CHART_COLORS.impressions}"></div></div></div>`;
  if(avgCTR!==null)cardsHTML+=`<div class="metric-card"><div class="metric-card-label">Avg CTR</div><div class="metric-card-value" style="color:${CHART_COLORS.ctr}">${avgCTR.toFixed(1)}%</div><div class="metric-card-sub">click-through rate</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:${Math.min(avgCTR*10,100)}%;background:${CHART_COLORS.ctr}"></div></div></div>`;
  cardsHTML+='</div>';
  const chartData=rows.map(r=>({date:(r[cols.date]||'').trim(),views:parseNum(r[cols.views])||0,watchTime:cols.watchTime!==-1?parseNum(r[cols.watchTime])||0:null}));
  const tableIdxs=[cols.date,cols.views,cols.watchTime,cols.subs,cols.impressions,cols.ctr,cols.avgDuration].filter(i=>i!==-1);
  const tableHeaders=headers.filter((_,i)=>tableIdxs.includes(i));
  const tableHTML=`<div class="yt-table-wrap"><div class="yt-table-header"><h4>Daily Breakdown</h4><span style="font-size:12px;color:var(--text-muted)">${rows.length} rows</span></div><div class="yt-scroll"><table><thead><tr>${tableHeaders.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${[...rows].reverse().map(r=>`<tr>${tableIdxs.map(i=>`<td>${r[i]||''}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  el.innerHTML=cardsHTML+`<div class="chart-wrap" id="yt-chart-wrap"><div class="chart-header"><h4>Views Over Time</h4><div class="chart-legend"><div class="legend-item"><div class="legend-dot" style="background:${CHART_COLORS.views}"></div>Views</div>${cols.watchTime!==-1?`<div class="legend-item"><div class="legend-dot" style="background:${CHART_COLORS.watchTime}"></div>Watch Time (h)</div>`:''}</div></div><div id="chart-svg-container"></div></div>`+tableHTML;
  requestAnimationFrame(()=>{const c=document.getElementById('chart-svg-container');if(c)drawMultiLineChart(c,chartData,cols);});
}

function drawMultiLineChart(container,data,cols){
  if(data.length<2){container.innerHTML='<p style="color:var(--text-muted);font-size:12px;padding:20px">Not enough data points.</p>';return;}
  const W=760,H=220,PT=14,PR=20,PB=38,PL=52,IW=W-PL-PR,IH=H-PT-PB;
  const maxViews=Math.max(...data.map(d=>d.views))||1;
  const hasWT=cols.watchTime!==-1&&data.some(d=>d.watchTime!==null);
  const maxWT=hasWT?Math.max(...data.map(d=>d.watchTime||0))||1:1;
  const wtScale=maxViews/maxWT;
  const px=i=>PL+(i/(data.length-1))*IW, py=(v,mx=maxViews)=>PT+IH-(v/mx)*IH;
  function smoothPath(pts){if(pts.length<2)return'';let d=`M ${pts[0][0]},${pts[0][1]}`;for(let i=0;i<pts.length-1;i++){const x0=pts[i-1]?pts[i-1][0]:pts[i][0],y0=pts[i-1]?pts[i-1][1]:pts[i][1],x1=pts[i][0],y1=pts[i][1],x2=pts[i+1][0],y2=pts[i+1][1],x3=pts[i+2]?pts[i+2][0]:x2,y3=pts[i+2]?pts[i+2][1]:y2,cp1x=x1+(x2-x0)/6,cp1y=y1+(y2-y0)/6,cp2x=x2-(x3-x1)/6,cp2y=y2-(y3-y1)/6;d+=` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`;}return d;}
  const vPts=data.map((d,i)=>[px(i),py(d.views)]);
  const wPts=hasWT?data.map((d,i)=>[px(i),py((d.watchTime||0)*wtScale)]):[];
  const vPath=smoothPath(vPts), wPath=hasWT?smoothPath(wPts):'';
  let gridSVG='',labelSVG='';
  for(let g=0;g<=4;g++){const y=PT+(g/4)*IH,val=Math.round(maxViews*(1-g/4));gridSVG+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#d4cec5" stroke-width="1" stroke-dasharray="3,3"/>`;labelSVG+=`<text x="${PL-6}" y="${y+4}" text-anchor="end" fill="#7a7068" font-size="10" font-family="-apple-system,sans-serif">${fmtNumShort(val)}</text>`;}
  const xStep=Math.max(1,Math.floor(data.length/6));
  let xLabels='';
  data.forEach((d,i)=>{if(i%xStep===0||i===data.length-1){const dt=new Date(d.date),lbl=!isNaN(dt)?`${MONTHS_S[dt.getMonth()]} ${dt.getDate()}`:d.date;xLabels+=`<text x="${px(i)}" y="${H-6}" text-anchor="middle" fill="#7a7068" font-size="10" font-family="-apple-system,sans-serif">${lbl}</text>`;}});
  const gId1='gv'+uid(), gId2='gw'+uid();
  const aV=vPath+` L ${vPts[vPts.length-1][0]},${PT+IH} L ${PL},${PT+IH} Z`;
  const aW=hasWT?wPath+` L ${wPts[wPts.length-1][0]},${PT+IH} L ${PL},${PT+IH} Z`:'';
  const dots=data.map((d,i)=>`<circle class="chart-dot" cx="${px(i)}" cy="${py(d.views)}" r="3.5" fill="${CHART_COLORS.views}" opacity="0" data-label="${fmtDateShort2(d.date)}" data-views="${d.views}" data-wt="${d.watchTime!==null?d.watchTime.toFixed(1):''}"/>`).join('');
  const svg=`<svg viewBox="0 0 ${W} ${H}" class="chart-svg" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${gId1}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${CHART_COLORS.views}" stop-opacity=".18"/><stop offset="100%" stop-color="${CHART_COLORS.views}" stop-opacity="0"/></linearGradient>${hasWT?`<linearGradient id="${gId2}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${CHART_COLORS.watchTime}" stop-opacity=".14"/><stop offset="100%" stop-color="${CHART_COLORS.watchTime}" stop-opacity="0"/></linearGradient>`:''}</defs>${gridSVG}${labelSVG}${xLabels}${hasWT?`<path d="${aW}" fill="url(#${gId2})"/><path d="${wPath}" fill="none" stroke="${CHART_COLORS.watchTime}" stroke-width="1.5" stroke-dasharray="5,3"/>`:''}<path d="${aV}" fill="url(#${gId1})"/><path d="${vPath}" fill="none" stroke="${CHART_COLORS.views}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><g>${dots}</g></svg>`;
  container.innerHTML=svg;
  const tooltip=document.getElementById('chart-tooltip');
  container.querySelectorAll('.chart-dot').forEach(dot=>{dot.addEventListener('mouseenter',()=>{dot.setAttribute('opacity','1');const wt=dot.dataset.wt?`<div>Watch Time: <strong>${dot.dataset.wt}h</strong></div>`:'';tooltip.innerHTML=`<strong>${dot.dataset.label}</strong><div>Views: <strong>${fmtNum(parseInt(dot.dataset.views))}</strong></div>${wt}`;tooltip.style.display='block';});dot.addEventListener('mousemove',e=>{tooltip.style.left=(e.clientX+12)+'px';tooltip.style.top=(e.clientY-40)+'px';});dot.addEventListener('mouseleave',()=>{dot.setAttribute('opacity','0');tooltip.style.display='none';});});
}

function renderYTSuggested(){
  const el=document.getElementById('yt-sug-content');
  if(!S.csv){el.innerHTML=uploadPromptHTML('Suggested Traffic','Export from <strong>YouTube Studio → Analytics → Reach tab → Traffic sources → Export</strong>. The file should have a <code>Traffic source type</code> column.');return;}
  const[headers,...allRows]=S.csv.rows, cols=detectCols(headers);
  if(cols.trafficSrc===-1){el.innerHTML=`<div class="upload-prompt"><h3>Traffic Sources CSV needed</h3><p>Your current CSV is an overview export.<br>To see Suggested Traffic data, upload the <strong>Traffic Sources</strong> report from YouTube Studio → Analytics → Reach tab → Traffic sources → Export.</p></div>`;return;}
  const vCol=cols.views!==-1?cols.views:headers.findIndex(h=>h.toLowerCase().includes('view'));
  const wtCol=cols.watchTime!==-1?cols.watchTime:headers.findIndex(h=>h.toLowerCase().includes('watch'));
  const sourceMap={};
  allRows.forEach(r=>{const src=(r[cols.trafficSrc]||'').trim();if(!src)return;const v=parseNum(r[vCol])||0,w=wtCol!==-1?parseNum(r[wtCol])||0:0;if(!sourceMap[src])sourceMap[src]={views:0,watchTime:0};sourceMap[src].views+=v;sourceMap[src].watchTime+=w;});
  const sources=Object.entries(sourceMap).map(([name,d])=>({name,...d})).sort((a,b)=>b.views-a.views);
  const totalViews=sources.reduce((s,x)=>s+x.views,0)||1;
  const sugRow=sources.find(s=>s.name.toLowerCase().includes('suggested'));
  let metricsHTML='<div class="metric-cards">';
  if(sugRow){const pct=(sugRow.views/totalViews*100).toFixed(1);metricsHTML+=`<div class="metric-card"><div class="metric-card-label">Views from Suggested</div><div class="metric-card-value" style="color:${CHART_COLORS.suggested}">${fmtNum(sugRow.views)}</div><div class="metric-card-sub">${pct}% of total views</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:${pct}%;background:${CHART_COLORS.suggested}"></div></div></div><div class="metric-card"><div class="metric-card-label">Suggested Watch Time</div><div class="metric-card-value" style="color:${CHART_COLORS.suggested}">${fmtNum(Math.round(sugRow.watchTime))}h</div><div class="metric-card-sub">from recommended content</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:${pct}%;background:${CHART_COLORS.suggested}"></div></div></div>`;}
  metricsHTML+=`<div class="metric-card"><div class="metric-card-label">Total Sources</div><div class="metric-card-value" style="color:var(--accent)">${sources.length}</div><div class="metric-card-sub">traffic channels found</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:100%;background:var(--accent)"></div></div></div><div class="metric-card"><div class="metric-card-label">Total Views</div><div class="metric-card-value" style="color:var(--accent)">${fmtNum(totalViews)}</div><div class="metric-card-sub">across all sources</div><div class="metric-card-bar"><div class="metric-card-bar-fill" style="width:100%;background:var(--accent)"></div></div></div></div>`;
  const maxSrcV=sources[0]?.views||1;
  let srcHTML='<div class="sug-source-list">';
  sources.forEach((src,i)=>{const isSug=src.name.toLowerCase().includes('suggested'),color=isSug?CHART_COLORS.suggested:PALETTE[i%PALETTE.length],pct=(src.views/totalViews*100).toFixed(1),bw=(src.views/maxSrcV*100).toFixed(1);srcHTML+=`<div class="sug-source-row"><div class="sug-source-name" style="color:${isSug?CHART_COLORS.suggested:'inherit'}">${isSug?'✨ ':''}<strong>${src.name}</strong></div><div class="sug-bar-wrap"><div class="sug-bar" style="width:${bw}%;background:${color}"></div></div><div class="sug-views" style="color:${color}">${fmtNum(src.views)}</div><div class="sug-pct">${pct}%</div></div>`;});
  srcHTML+='</div>';
  const tableHTML=`<div class="yt-table-wrap"><div class="yt-table-header"><h4>Traffic Source Breakdown</h4></div><div class="yt-scroll"><table><thead><tr><th>Traffic Source</th><th>Views</th>${wtCol!==-1?'<th>Watch Time (h)</th>':''}<th>% of Total</th></tr></thead><tbody>${sources.map(s=>`<tr><td>${s.name}</td><td>${fmtNum(s.views)}</td>${wtCol!==-1?`<td>${fmtNum(Math.round(s.watchTime))}</td>`:''}<td>${(s.views/totalViews*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div></div>`;
  el.innerHTML=metricsHTML+`<div class="chart-wrap"><div class="chart-header"><h4>Views by Traffic Source</h4></div><div id="sug-bar-chart"></div></div>`+srcHTML+tableHTML;
  requestAnimationFrame(()=>{const bc=document.getElementById('sug-bar-chart');if(bc)drawHBarChart(bc,sources,totalViews);});
}

function drawHBarChart(container,sources,total){
  const top8=sources.slice(0,8),W=760,rowH=32,PT=10,PB=10,PL=200,PR=60,H=PT+top8.length*rowH+PB,maxV=top8[0]?.views||1,IW=W-PL-PR;
  let bars='',labels='',values='';
  top8.forEach((s,i)=>{const isSug=s.name.toLowerCase().includes('suggested'),color=isSug?CHART_COLORS.suggested:PALETTE[i%PALETTE.length],y=PT+i*rowH,bw=(s.views/maxV)*IW;bars+=`<rect x="${PL}" y="${y+6}" width="${Math.max(bw,2)}" height="${rowH-12}" rx="3" fill="${color}" opacity=".85"/>`;labels+=`<text x="${PL-8}" y="${y+rowH/2+4}" text-anchor="end" fill="#7a7068" font-size="11" font-family="-apple-system,sans-serif">${s.name.length>24?s.name.slice(0,24)+'…':s.name}</text>`;values+=`<text x="${PL+bw+6}" y="${y+rowH/2+4}" fill="#7a7068" font-size="11" font-family="-apple-system,sans-serif">${fmtNum(s.views)} (${(s.views/total*100).toFixed(1)}%)</text>`;});
  container.innerHTML=`<svg viewBox="0 0 ${W} ${H}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">${labels}${bars}${values}</svg>`;
}

function uploadPromptHTML(name,instructions){return`<div class="upload-prompt"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><h3>No CSV data yet</h3><p>${instructions}</p><button class="btn btn-primary" style="margin-top:4px" onclick="document.querySelector('.nav-item[data-section=import]').click()">Go to CSV Import →</button></div>`;}

// ════════════════ CSV IMPORT ════════════════
const dropZone=document.getElementById('drop-zone'),csvInput=document.getElementById('csv-input');
dropZone.addEventListener('click',()=>csvInput.click());
dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('drag-over');});
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.classList.remove('drag-over');if(e.dataTransfer.files[0])loadCSV(e.dataTransfer.files[0]);});
csvInput.addEventListener('change',e=>{if(e.target.files[0])loadCSV(e.target.files[0]);});
document.getElementById('csv-clear').addEventListener('click',()=>{S.csv=null;persist();document.getElementById('csv-preview').style.display='none';csvInput.value='';});
function loadCSV(file){const reader=new FileReader();reader.onload=e=>{const rows=parseCSV(e.target.result);if(!rows.length){alert('Could not parse CSV');return;}S.csv={filename:file.name,rows,at:Date.now()};persist();renderCSVTable();};reader.readAsText(file);}
function parseCSV(txt){return txt.split(/\r?\n/).filter(l=>l.trim()).map(line=>{const row=[];let inQ=false,cur='';for(const c of line){if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){row.push(cur.trim());cur='';}else{cur+=c;}}row.push(cur.trim());return row;});}
function renderCSVTable(){const d=S.csv;if(!d)return;const[headers,...rows]=d.rows;document.getElementById('csv-filename').textContent=d.filename;document.getElementById('csv-stats').textContent=`${rows.length} rows · ${headers.length} columns · loaded ${fmtDate(new Date(d.at).toISOString().slice(0,10))}`;document.getElementById('csv-thead').innerHTML='<tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr>';document.getElementById('csv-tbody').innerHTML=rows.slice(0,500).map(r=>'<tr>'+headers.map((_,i)=>`<td title="${(r[i]||'').replace(/"/g,'&quot;')}">${r[i]||''}</td>`).join('')+'</tr>').join('')+(rows.length>500?`<tr><td colspan="${headers.length}" style="text-align:center;color:var(--text-muted);padding:12px">Showing first 500 of ${rows.length} rows</td></tr>`:'');document.getElementById('csv-preview').style.display='block';}

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

function getYTStatsFromCSV() {
  if (!S.csv) return null;
  const [headers, ...rows] = S.csv.rows;
  const cols = detectCols(headers);
  if (cols.views === -1) return null;
  const subsGained = cols.subs !== -1 ? rows.reduce((a,r) => a + (parseNum(r[cols.subs])||0), 0) : null;
  const totalViews  = rows.reduce((a,r) => a + (parseNum(r[cols.views])||0), 0);
  const totalWatchH = cols.watchTime !== -1 ? rows.reduce((a,r) => a + (parseNum(r[cols.watchTime])||0), 0) : null;
  const dateRange   = rows.length ? `${rows.length} days of data` : null;
  return { subsGained, totalViews, totalWatchH, dateRange };
}

function renderGoals() {
  const grid  = document.getElementById('goals-grid');
  const badge = document.getElementById('goals-badge');
  applyGoalsOpen();

  badge.textContent = S.goals.length;
  badge.style.display = S.goals.length ? 'inline' : 'none';

  const ytStats = getYTStatsFromCSV();
  grid.innerHTML = '';

  S.goals.forEach(g => grid.appendChild(buildGoalCard(g, ytStats)));

  const add = document.createElement('div');
  add.className = 'goal-add-card';
  add.innerHTML = `<span style="font-size:18px">＋</span> New Goal`;
  add.addEventListener('click', () => openGoalModal(null));
  grid.appendChild(add);
}

function buildGoalCard(g, ytStats) {
  const col     = platColor(g.platform);
  const emoji   = platEmoji(g.platform);
  const pct     = g.goalCount > 0 ? Math.min(100, (g.currentCount / g.goalCount) * 100) : 0;
  const isYT    = g.platform === 'YouTube';
  const card    = document.createElement('div');
  card.className = 'goal-card';

  let csvHTML = '';
  if (isYT && ytStats) {
    const parts = [];
    if (ytStats.subsGained !== null && g.metric === 'Subscribers')
      parts.push(`📊 ${ytStats.subsGained >= 0 ? '+' : ''}${fmtNum(ytStats.subsGained)} subs from CSV`);
    if (g.metric === 'Views' || g.metric === 'Total Views')
      parts.push(`📊 ${fmtNum(ytStats.totalViews)} views from CSV`);
    if (g.metric === 'Watch Hours' && ytStats.totalWatchH !== null)
      parts.push(`📊 ${fmtNum(Math.round(ytStats.totalWatchH))}h from CSV`);
    if (parts.length)
      csvHTML = `<div class="goal-csv-row">${parts.map(p=>`<span class="goal-csv-stat">${p}</span>`).join('')}${ytStats.dateRange?`<span class="goal-csv-stat" style="background:var(--surface3);color:var(--text-muted)">📅 ${ytStats.dateRange}</span>`:''}</div>`;
  }

  card.innerHTML = `
    <div class="goal-controls">
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
    ${g.url ? `<a class="goal-url" href="${g.url}" target="_blank" rel="noopener">↗ ${getDomain(g.url)}</a>` : ''}
    ${g.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5">${g.notes}</div>` : ''}
    ${csvHTML}
  `;
  return card;
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

// ════════════════ INIT ════════════════
async function init() {
  await load();
  renderCalendar();
  renderGoals();
  if (S.csv) renderCSVTable();
}
init();
