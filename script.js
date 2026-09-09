const STORAGE_KEY="musicMemorySongs";
const PLAYLIST_STORAGE_KEY="musicMemoryPlaylists";
let songs=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
let playlists=JSON.parse(localStorage.getItem(PLAYLIST_STORAGE_KEY)||"[]");
let currentTags=[];
let currentView="homeView";
let previousView="listView";
let currentDetailId=null;
let selectedArtist="";
let listMode="songs";
let currentPlaylistId=null;
let editingPlaylistId=null;
let selectedPickerSongIds=new Set();

const $=id=>document.getElementById(id);
const views=document.querySelectorAll(".view");
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(songs));localStorage.setItem(PLAYLIST_STORAGE_KEY,JSON.stringify(playlists))}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function formatDate(v){return new Date(v).toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"})}
function showView(id){
  views.forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===id || (["artistDetailView","playlistDetailView"].includes(id)&&b.dataset.view==="listView")));
  currentView=id;
  if(id==="homeView") renderHome();
  if(id==="listView"){populateFilters();renderListView()}
}
function renderListView(){
  $("songsTab").classList.toggle("active",listMode==="songs");
  $("artistsTab").classList.toggle("active",listMode==="artists");
  $("playlistsTab").classList.toggle("active",listMode==="playlists");
  $("artistSection").classList.toggle("hidden",listMode!=="artists");
  $("playlistSection").classList.toggle("hidden",listMode!=="playlists");
  $("listTitle").textContent=listMode==="artists"?"アーティスト一覧":listMode==="playlists"?"プレイリスト":"曲一覧";
  [".search-box",".filter-grid",".filter-actions"].forEach(sel=>document.querySelector(sel).classList.toggle("hidden",listMode!=="songs"));
  $("resultCount").classList.toggle("hidden",listMode!=="songs");
  $("songList").classList.toggle("hidden",listMode!=="songs");
  $("emptyState").classList.toggle("hidden",listMode!=="songs");
  if(listMode==="artists")renderArtistList();
  else if(listMode==="playlists")renderPlaylistList();
  else renderList();
}
function renderArtistList(){
  const artists=[...new Set(songs.map(s=>s.artist).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"ja"));
  const el=$("artistList");
  if(!artists.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">♪</div><h3>アーティストがありません</h3><p>曲を登録するとアーティストが表示されます。</p></div>';return}

  // アーティスト名の先頭文字でグループ化。
  // 英字は A〜Z、ひらがな・カタカナは「あ・か・さ…」の行でまとめる。
  const kanaRows=[
    {key:"あ",chars:"あいうえおぁぃぅぇぉ"},
    {key:"か",chars:"かきくけこがぎぐげご"},
    {key:"さ",chars:"さしすせそざじずぜぞ"},
    {key:"た",chars:"たちつてとだぢづでどっ"},
    {key:"な",chars:"なにぬねの"},
    {key:"は",chars:"はひふへほばびぶべぼぱぴぷぺぽ"},
    {key:"ま",chars:"まみむめも"},
    {key:"や",chars:"やゆよゃゅょ"},
    {key:"ら",chars:"らりるれろ"},
    {key:"わ",chars:"わをん"}
  ];
  const toHiragana=ch=>{
    const code=ch.charCodeAt(0);
    return code>=0x30A1&&code<=0x30F6?String.fromCharCode(code-0x60):ch;
  };
  const getArtistGroup=artist=>{
    const first=String(artist).trim().charAt(0);
    const upper=first.toUpperCase();
    if(/^[A-Z]$/.test(upper)) return upper;
    const hira=toHiragana(first);
    const row=kanaRows.find(r=>r.chars.includes(hira));
    return row?row.key:"その他";
  };

  const groups=new Map();
  artists.forEach(artist=>{
    const key=getArtistGroup(artist);
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(artist);
  });

  const kanaOrder=kanaRows.map(r=>r.key);
  const keys=[...groups.keys()].sort((a,b)=>{
    if(a==="その他") return 1;
    if(b==="その他") return -1;
    const aIsAlpha=/^[A-Z]$/.test(a), bIsAlpha=/^[A-Z]$/.test(b);
    if(aIsAlpha&&bIsAlpha) return a.localeCompare(b);
    if(aIsAlpha) return -1;
    if(bIsAlpha) return 1;
    return kanaOrder.indexOf(a)-kanaOrder.indexOf(b);
  });

  keys.forEach(key=>groups.get(key).sort((a,b)=>String(a).localeCompare(String(b),"ja")));

  el.innerHTML=keys.map(key=>`
    <section class="artist-group">
      <h3 class="artist-group-heading">${esc(key)}</h3>
      <div class="artist-group-list">
        ${groups.get(key).map(a=>`<button type="button" class="artist-row" data-artist="${esc(a)}"><span class="artist-name">${esc(a)}</span><span class="artist-row-right"><span class="artist-count">${songs.filter(s=>s.artist===a).length}曲</span><span class="artist-arrow">›</span></span></button>`).join("")}
      </div>
    </section>
  `).join("");

  el.querySelectorAll(".artist-row").forEach(btn=>btn.onclick=()=>openArtistDetail(btn.dataset.artist));
}
function openArtistDetail(artist){
  selectedArtist=artist;$("artistDetailTitle").textContent=artist;
  const artistSongs=songs.filter(s=>s.artist===artist).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  $("artistSongList").innerHTML=artistSongs.map(artistSongCard).join("");$("artistSongEmpty").classList.toggle("hidden",artistSongs.length!==0);bindCards();showView("artistDetailView");
}
function renderPlaylistList(){
  const el=$("playlistList");
  if(!playlists.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">♫</div><h3>プレイリストがありません</h3><p>好きな曲をまとめて、自分だけのプレイリストを作ってみましょう。</p></div>';return}
  el.innerHTML=playlists.map(p=>{const count=p.songIds.filter(id=>songs.some(s=>s.id===id)).length;return `<button type="button" class="playlist-row" data-playlist-id="${esc(p.id)}"><span class="playlist-main"><span class="playlist-cover">♫</span><span><span class="playlist-name">${esc(p.name)}</span>${p.description?`<span class="playlist-description">${esc(p.description)}</span>`:""}</span></span><span class="playlist-row-right"><span class="playlist-count">${count}曲</span><span class="playlist-arrow">›</span></span></button>`}).join("");
  el.querySelectorAll(".playlist-row").forEach(btn=>btn.onclick=()=>openPlaylistDetail(btn.dataset.playlistId));
}
function openPlaylistDetail(id){
  const p=playlists.find(x=>x.id===id);if(!p)return;currentPlaylistId=id;
  $("playlistDetailTitle").textContent=p.name;const validIds=p.songIds.filter(songId=>songs.some(s=>s.id===songId));p.songIds=validIds;
  const list=validIds.map(songId=>songs.find(s=>s.id===songId)).filter(Boolean);$("playlistDetailCount").textContent=`${list.length}曲`;
  $("playlistSongList").innerHTML=list.map(playlistSongCard).join("");$("playlistSongEmpty").classList.toggle("hidden",list.length!==0);bindCards();showView("playlistDetailView");
}
function playlistSongCard(s){return `<article class="song-card playlist-song-card" data-id="${esc(s.id)}"><div class="song-main"><div><p class="song-title">${esc(s.title)}</p><div class="song-artist">${esc(s.artist)}</div></div></div></article>`}
function resetForm(){$("songForm").reset();$("songId").value="";currentTags=[];renderTags();$("formTitle").textContent="曲を登録"}
function populateYears(){const y=$("year");for(let n=new Date().getFullYear();n>=1950;n--){const o=document.createElement("option");o.value=n;o.textContent=n+"年";y.appendChild(o)}}
function populateFilters(){const values=key=>[...new Set(songs.map(s=>s[key]).filter(Boolean))];const fill=(id,arr,label,sort=true)=>{const el=$(id),old=el.value;el.innerHTML=`<option value="">${label}：すべて</option>`;if(sort)arr.sort((a,b)=>String(a).localeCompare(String(b),"ja"));arr.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;el.appendChild(o)});el.value=old};fill("genreFilter",values("genre"),"ジャンル");fill("yearFilter",values("year"),"年代",false);fill("seasonFilter",["春","夏","秋","冬"].filter(x=>values("season").includes(x)),"季節",false);fill("tagFilter",[...new Set(songs.flatMap(s=>s.tags||[]))],"タグ")}
function card(s){return `<article class="song-card" data-id="${esc(s.id)}"><div class="song-main"><div><p class="song-title">${esc(s.title)}</p><div class="song-artist">${esc(s.artist)}</div>${s.work?`<div class="song-work">${esc(s.work)}</div>`:""}</div><span class="song-date">${formatDate(s.createdAt)}</span></div><div class="song-meta">${s.year?`<span class="badge">${esc(s.year)}年</span>`:""}${s.genre?`<span class="badge">${esc(s.genre)}</span>`:""}${s.season?`<span class="badge">${esc(s.season)}</span>`:""}${(s.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div></article>`}
function artistSongCard(s){return `<article class="song-card artist-song-card" data-id="${esc(s.id)}"><div class="song-main"><div><p class="song-title">${esc(s.title)}</p></div></div></article>`}
function bindCards(){document.querySelectorAll(".song-card").forEach(c=>c.onclick=()=>openDetail(c.dataset.id))}
function renderHome(){$("songCount").textContent=songs.length;$("artistCount").textContent=new Set(songs.map(s=>s.artist).filter(Boolean)).size;$("tagCount").textContent=new Set(songs.flatMap(s=>s.tags||[])).size;const recent=[...songs].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);$("recentSongs").innerHTML=recent.length?recent.map(card).join(""):`<div class="empty-state"><div class="empty-icon">♪</div><h3>まだ曲がありません</h3><p>お気に入りの曲を登録してみましょう。</p></div>`;bindCards()}
function renderList(){const q=$("searchInput").value.trim().toLowerCase(),g=$("genreFilter").value,y=$("yearFilter").value,se=$("seasonFilter").value,t=$("tagFilter").value,sort=$("sortSelect").value;let a=songs.filter(s=>{const text=[s.title,s.artist,s.work].join(" ").toLowerCase();return(!q||text.includes(q))&&(!selectedArtist||s.artist===selectedArtist)&&(!g||s.genre===g)&&(!y||String(s.year)===y)&&(!se||s.season===se)&&(!t||(s.tags||[]).includes(t))});const cmp=(x,y)=>String(x).localeCompare(String(y),"ja");a.sort((x,z)=>{if(sort==="newest")return new Date(z.createdAt)-new Date(x.createdAt);if(sort==="oldest")return new Date(x.createdAt)-new Date(z.createdAt);if(sort==="titleAsc")return cmp(x.title,z.title);if(sort==="titleDesc")return cmp(z.title,x.title);if(sort==="artistAsc")return cmp(x.artist,z.artist);if(sort==="artistDesc")return cmp(z.artist,x.artist);if(sort==="yearAsc")return(x.year||9999)-(z.year||9999);return(z.year||0)-(x.year||0)});$("resultCount").textContent=`${a.length}曲`;$("songList").innerHTML=a.map(card).join("");$("emptyState").classList.toggle("hidden",a.length!==0);bindCards()}
function renderTags(){$("selectedTags").innerHTML=currentTags.map((t,i)=>`<span class="tag-item">#${esc(t)} <button type="button" onclick="removeTag(${i})">×</button></span>`).join("")}
window.removeTag=i=>{currentTags.splice(i,1);renderTags()};function addTag(){const v=$("tagInput").value.trim();if(v&&!currentTags.includes(v)){currentTags.push(v);renderTags()}$("tagInput").value=""}
function openNew(){resetForm();previousView=currentView==="formView"?"homeView":currentView;showView("formView")}
function openDetail(id){const s=songs.find(x=>x.id===id);if(!s)return;currentDetailId=id;previousView=currentView;$("detailCard").innerHTML=`<h1 class="detail-title">${esc(s.title)}</h1><div class="detail-artist">${esc(s.artist)}</div>${field("作品名",s.work)}${field("年代",s.year?s.year+"年":"")}${field("ジャンル",s.genre)}${field("季節",s.season)}${s.tags?.length?field("タグ",s.tags.map(t=>"#"+esc(t)).join(" ")):""}${field("メモ",s.memo)}${s.url?`<div class="detail-label">音楽リンク</div><a class="link-btn" href="${esc(s.url)}" target="_blank" rel="noopener">音楽サービスを開く ↗</a>`:""}<div class="detail-label">登録日時</div><div class="detail-value">${formatDate(s.createdAt)}</div>`;showView("detailView")}
function field(label,value){return value?`<div class="detail-label">${label}</div><div class="detail-value">${value}</div>`:""}
function editCurrent(){const s=songs.find(x=>x.id===currentDetailId);if(!s)return;$("songId").value=s.id;$("title").value=s.title;$("artist").value=s.artist;$("work").value=s.work||"";$("year").value=s.year||"";$("genre").value=s.genre||"";$("season").value=s.season||"";$("memo").value=s.memo||"";$("url").value=s.url||"";currentTags=[...(s.tags||[])];renderTags();$("formTitle").textContent="曲を編集";previousView="detailView";showView("formView")}
function deleteCurrent(){if(!currentDetailId)return;if(confirm("この曲を削除しますか？")){songs=songs.filter(s=>s.id!==currentDetailId);playlists.forEach(p=>p.songIds=p.songIds.filter(id=>id!==currentDetailId));save();currentDetailId=null;showView("listView")}}
$("songForm").onsubmit=e=>{e.preventDefault();const id=$("songId").value,old=songs.find(s=>s.id===id);const data={id:id||crypto.randomUUID(),title:$("title").value.trim(),artist:$("artist").value.trim(),work:$("work").value.trim(),year:$("year").value,genre:$("genre").value,season:$("season").value,tags:[...currentTags],memo:$("memo").value.trim(),url:$("url").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};if(old)songs=songs.map(s=>s.id===id?data:s);else songs.push(data);save();resetForm();showView("listView")};
function openPlaylistModal(editId=null){editingPlaylistId=editId;const p=editId?playlists.find(x=>x.id===editId):null;$("playlistModalTitle").textContent=p?"プレイリストを編集":"プレイリストを作成";$("playlistNameInput").value=p?.name||"";$("playlistDescriptionInput").value=p?.description||"";$("savePlaylistBtn").textContent=p?"保存":"作成";$("playlistModal").classList.remove("hidden");$("playlistModal").setAttribute("aria-hidden","false");setTimeout(()=>$("playlistNameInput").focus(),0)}
function closePlaylistModal(){$("playlistModal").classList.add("hidden");$("playlistModal").setAttribute("aria-hidden","true");editingPlaylistId=null}
function savePlaylist(){const name=$("playlistNameInput").value.trim();if(!name){alert("プレイリスト名を入力してください。");return}const description=$("playlistDescriptionInput").value.trim();if(editingPlaylistId){const p=playlists.find(x=>x.id===editingPlaylistId);if(p){p.name=name;p.description=description}}else playlists.push({id:crypto.randomUUID(),name,description,songIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});save();closePlaylistModal();renderListView()}
function openSongPicker(){const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;selectedPickerSongIds=new Set(p.songIds);$("playlistSongSearch").value="";renderSongPicker();$("songPickerModal").classList.remove("hidden");$("songPickerModal").setAttribute("aria-hidden","false")}
function closeSongPicker(){$("songPickerModal").classList.add("hidden");$("songPickerModal").setAttribute("aria-hidden","true");selectedPickerSongIds.clear()}
function renderSongPicker(){const q=$("playlistSongSearch").value.trim().toLowerCase();const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;const list=songs.filter(s=>!q||[s.title,s.artist,s.work].join(" ").toLowerCase().includes(q));const el=$("songPickerList");if(!list.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">♪</div><h3>曲がありません</h3></div>';return}el.innerHTML=list.map(s=>`<label class="song-picker-row ${selectedPickerSongIds.has(s.id)?"selected":""}"><input type="checkbox" value="${esc(s.id)}" ${selectedPickerSongIds.has(s.id)?"checked":""}><span class="song-picker-row-info"><span class="song-picker-title">${esc(s.title)}</span><span class="song-picker-artist">${esc(s.artist)}</span></span></label>`).join("");el.querySelectorAll("input").forEach(input=>input.onchange=()=>{if(input.checked)selectedPickerSongIds.add(input.value);else selectedPickerSongIds.delete(input.value);input.closest(".song-picker-row").classList.toggle("selected",input.checked)})}
function confirmAddSongs(){const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;p.songIds=[...selectedPickerSongIds];p.updatedAt=new Date().toISOString();save();closeSongPicker();openPlaylistDetail(currentPlaylistId)}
function deletePlaylist(){const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;if(confirm(`「${p.name}」を削除しますか？\n曲自体は削除されません。`)){playlists=playlists.filter(x=>x.id!==currentPlaylistId);save();currentPlaylistId=null;showView("listView")}}
$("addTagBtn").onclick=addTag;$("tagInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addTag()}});
$("resetFilterBtn").onclick=()=>{["searchInput","genreFilter","yearFilter","seasonFilter","tagFilter"].forEach(id=>$(id).value="");$("sortSelect").value="newest";selectedArtist="";renderListView()};
$("songsTab").onclick=()=>{listMode="songs";selectedArtist="";renderListView()};$("artistsTab").onclick=()=>{listMode="artists";selectedArtist="";renderListView()};$("playlistsTab").onclick=()=>{listMode="playlists";selectedArtist="";renderListView()};
$("createPlaylistBtn").onclick=()=>openPlaylistModal();$("savePlaylistBtn").onclick=savePlaylist;$("renamePlaylistBtn").onclick=()=>openPlaylistModal(currentPlaylistId);$("deletePlaylistBtn").onclick=deletePlaylist;$("addSongsToPlaylistBtn").onclick=openSongPicker;$("confirmAddSongsBtn").onclick=confirmAddSongs;$("playlistSongSearch").addEventListener("input",renderSongPicker);
$("artistDetailBackBtn").onclick=()=>{selectedArtist="";showView("listView")};$("playlistDetailBackBtn").onclick=()=>{currentPlaylistId=null;showView("listView")};$("detailBackBtn").onclick=()=>showView(previousView==="formView"?"listView":previousView);$("editBtn").onclick=editCurrent;$("deleteBtn").onclick=deleteCurrent;$("cancelBtn").onclick=()=>showView(previousView==="detailView"?"listView":previousView);$("formBackBtn").onclick=()=>showView(previousView==="detailView"?"detailView":previousView);
document.querySelectorAll("[data-close-modal]").forEach(b=>b.onclick=closePlaylistModal);document.querySelectorAll("[data-close-song-picker]").forEach(b=>b.onclick=closeSongPicker);
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{if(b.dataset.view==="formView")openNew();else showView(b.dataset.view)});
["searchInput","genreFilter","yearFilter","seasonFilter","tagFilter","sortSelect"].forEach(id=>$(id).addEventListener("input",renderList));
populateYears();populateFilters();renderListView();renderHome();
