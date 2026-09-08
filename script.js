const STORAGE_KEY="musicMemorySongs";
let songs=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
let currentTags=[];
let currentView="homeView";
let previousView="listView";
let currentDetailId=null;

const $=id=>document.getElementById(id);
const views=document.querySelectorAll(".view");

function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(songs))}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function formatDate(v){return new Date(v).toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"})}

function showView(id){
  views.forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  currentView=id;
  if(id==="homeView") renderHome();
  if(id==="listView"){populateFilters();renderList()}
}

function resetForm(){
  $("songForm").reset();$("songId").value="";currentTags=[];
  renderTags();$("formTitle").textContent="曲を登録";
}
function populateYears(){
  const y=$("year"); for(let n=new Date().getFullYear();n>=1950;n--){const o=document.createElement("option");o.value=n;o.textContent=n+"年";y.appendChild(o)}
}
function populateFilters(){
  const values=(key)=>[...new Set(songs.map(s=>s[key]).filter(Boolean))];
  const fill=(id,arr,label,sort=true)=>{const el=$(id),old=el.value;el.innerHTML=`<option value="">${label}：すべて</option>`;if(sort)arr.sort((a,b)=>String(a).localeCompare(String(b),"ja"));arr.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;el.appendChild(o)});el.value=old};
  fill("genreFilter",values("genre"),"ジャンル");
  fill("yearFilter",values("year"),"年代",false);
  fill("seasonFilter",["春","夏","秋","冬"].filter(x=>values("season").includes(x)),"季節",false);
  const tags=[...new Set(songs.flatMap(s=>s.tags||[]))];fill("tagFilter",tags,"タグ");
}
function card(s){
 return `<article class="song-card" data-id="${esc(s.id)}">
   <div class="song-main"><div><p class="song-title">${esc(s.title)}</p><div class="song-artist">${esc(s.artist)}</div>${s.work?`<div class="song-work">${esc(s.work)}</div>`:""}</div><span class="song-date">${formatDate(s.createdAt)}</span></div>
   <div class="song-meta">${s.year?`<span class="badge">${esc(s.year)}年</span>`:""}${s.genre?`<span class="badge">${esc(s.genre)}</span>`:""}${s.season?`<span class="badge">${esc(s.season)}</span>`:""}${(s.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div>
 </article>`
}
function bindCards(){document.querySelectorAll(".song-card").forEach(c=>c.onclick=()=>openDetail(c.dataset.id))}
function renderHome(){
 $("songCount").textContent=songs.length;
 $("artistCount").textContent=new Set(songs.map(s=>s.artist)).size;
 $("tagCount").textContent=new Set(songs.flatMap(s=>s.tags||[])).size;
 const recent=[...songs].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
 $("recentSongs").innerHTML=recent.length?recent.map(card).join(""):`<div class="empty-state"><div class="empty-icon">♪</div><h3>まだ曲がありません</h3><p>お気に入りの曲を登録してみましょう。</p></div>`;
 bindCards();
}
function renderList(){
 const q=$("searchInput").value.trim().toLowerCase(),g=$("genreFilter").value,y=$("yearFilter").value,se=$("seasonFilter").value,t=$("tagFilter").value,sort=$("sortSelect").value;
 let a=songs.filter(s=>{
   const text=[s.title,s.artist,s.work].join(" ").toLowerCase();
   return (!q||text.includes(q))&&(!g||s.genre===g)&&(!y||String(s.year)===y)&&(!se||s.season===se)&&(!t||(s.tags||[]).includes(t))
 });
 const cmp=(x,y)=>String(x).localeCompare(String(y),"ja");
 a.sort((x,z)=>{
  if(sort==="newest")return new Date(z.createdAt)-new Date(x.createdAt);
  if(sort==="oldest")return new Date(x.createdAt)-new Date(z.createdAt);
  if(sort==="titleAsc")return cmp(x.title,z.title);
  if(sort==="titleDesc")return cmp(z.title,x.title);
  if(sort==="artistAsc")return cmp(x.artist,z.artist);
  if(sort==="artistDesc")return cmp(z.artist,x.artist);
  if(sort==="yearAsc")return (x.year||9999)-(z.year||9999);
  return (z.year||0)-(x.year||0);
 });
 $("resultCount").textContent=`${a.length}曲`;
 $("songList").innerHTML=a.map(card).join("");
 $("emptyState").classList.toggle("hidden",a.length!==0);bindCards();
}
function renderTags(){
 $("selectedTags").innerHTML=currentTags.map((t,i)=>`<span class="tag-item">#${esc(t)} <button type="button" onclick="removeTag(${i})">×</button></span>`).join("");
}
window.removeTag=i=>{currentTags.splice(i,1);renderTags()}
function addTag(){
 const v=$("tagInput").value.trim();if(v&&!currentTags.includes(v)){currentTags.push(v);renderTags()}$("tagInput").value=""
}
function openNew(){
 resetForm();previousView=currentView==="formView"?"homeView":currentView;showView("formView")
}
function openDetail(id){
 const s=songs.find(x=>x.id===id);if(!s)return;currentDetailId=id;previousView=currentView;
 $("detailCard").innerHTML=`<h1 class="detail-title">${esc(s.title)}</h1><div class="detail-artist">${esc(s.artist)}</div>
 ${field("作品名",s.work)}${field("年代",s.year?s.year+"年":"")}${field("ジャンル",s.genre)}${field("季節",s.season)}
 ${s.tags?.length?field("タグ",s.tags.map(t=>"#"+esc(t)).join(" ")):""}${field("メモ",s.memo)}
 ${s.url?`<div class="detail-label">音楽リンク</div><a class="link-btn" href="${esc(s.url)}" target="_blank" rel="noopener">音楽サービスを開く ↗</a>`:""}
 <div class="detail-label">登録日時</div><div class="detail-value">${formatDate(s.createdAt)}</div>`;
 showView("detailView")
}
function field(label,value){return value?`<div class="detail-label">${label}</div><div class="detail-value">${value}</div>`:""}
function editCurrent(){
 const s=songs.find(x=>x.id===currentDetailId);if(!s)return;
 $("songId").value=s.id;$("title").value=s.title;$("artist").value=s.artist;$("work").value=s.work||"";
 $("year").value=s.year||"";$("genre").value=s.genre||"";$("season").value=s.season||"";$("memo").value=s.memo||"";$("url").value=s.url||"";
 currentTags=[...(s.tags||[])];renderTags();$("formTitle").textContent="曲を編集";previousView="detailView";showView("formView")
}
function deleteCurrent(){
 if(!currentDetailId)return;if(confirm("この曲を削除しますか？")){songs=songs.filter(s=>s.id!==currentDetailId);save();currentDetailId=null;showView("listView")}
}
$("songForm").onsubmit=e=>{
 e.preventDefault();
 const id=$("songId").value,old=songs.find(s=>s.id===id);
 const data={id:id||crypto.randomUUID(),title:$("title").value.trim(),artist:$("artist").value.trim(),work:$("work").value.trim(),year:$("year").value,genre:$("genre").value,season:$("season").value,tags:[...currentTags],memo:$("memo").value.trim(),url:$("url").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 if(old)songs=songs.map(s=>s.id===id?data:s);else songs.push(data);save();showView("listView")
};
$("addTagBtn").onclick=addTag;$("tagInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addTag()}});
$("addTopBtn").onclick=openNew;$("addListBtn").onclick=openNew;$("editBtn").onclick=editCurrent;$("deleteBtn").onclick=deleteCurrent;
$("cancelBtn").onclick=()=>showView(previousView==="detailView"?"listView":previousView);
$("formBackBtn").onclick=()=>showView(previousView==="detailView"?"detailView":previousView);
$("detailBackBtn").onclick=()=>showView(previousView==="formView"?"listView":previousView);
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
["searchInput","genreFilter","yearFilter","seasonFilter","tagFilter","sortSelect"].forEach(id=>$(id).addEventListener("input",renderList));
populateYears();populateFilters();renderHome();
