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
// ===== YouTube連携 =====
// Google Cloud ConsoleでOAuth 2.0「ウェブアプリ」のクライアントIDを発行し、
// 下記 GOOGLE_CLIENT_ID を自分のクライアントIDに置き換えてください。
// 承認済みJavaScript生成元には、このアプリを公開しているURL（例: https://xxxxx.github.io）を登録します。
const GOOGLE_CLIENT_ID="25670917871-k7li327gfkds9e4cork8b8c1rnf7552e.apps.googleusercontent.com";
const YOUTUBE_SCOPE="https://www.googleapis.com/auth/youtube";
let googleTokenClient=null;
let youtubeAccessToken=localStorage.getItem("musicMemoryYoutubeAccessToken")||"";

function initYouTubeAuth(){
  if(!window.google?.accounts?.oauth2)return;
  googleTokenClient=google.accounts.oauth2.initTokenClient({
    client_id:GOOGLE_CLIENT_ID,
    scope:YOUTUBE_SCOPE,
    callback:(resp)=>{
      if(resp.error){console.error("Google OAuth error",resp);alert("YouTube連携に失敗しました。Google Cloudの設定を確認してください。");return;}
      youtubeAccessToken=resp.access_token;
      localStorage.setItem("musicMemoryYoutubeAccessToken",youtubeAccessToken);
      updateYouTubeStatus();
      syncAllLocalPlaylistsToYouTube();
    }
  });
  updateYouTubeStatus();
}
function connectYouTube(){
  if(GOOGLE_CLIENT_ID.startsWith("YOUR_")){
    alert("script.js の GOOGLE_CLIENT_ID に、Google Cloud Consoleで作成したOAuthクライアントIDを設定してください。");
    return;
  }
  if(!googleTokenClient){alert("Google認証の読み込み中です。数秒待ってからもう一度お試しください。");return;}
  googleTokenClient.requestAccessToken({prompt:youtubeAccessToken?"":"consent"});
}

async function syncAllLocalPlaylistsToYouTube(){
  if(!youtubeAccessToken)return;
  let created=0;
  try{
    for(const p of playlists){
      if(!p.youtubePlaylistId){
        await createYouTubePlaylist(p);
        p.updatedAt=new Date().toISOString();
        created++;
      }
    }
    save();renderListView();
    if(created)alert(`${created}件のプレイリストをYouTube側にも作成しました。`);
  }catch(e){
    save();
    alert("YouTube同期中にエラーが発生しました。\n"+e.message);
  }
}
function updateYouTubeStatus(){
  const el=$("youtubeConnectionStatus");
  const btn=$("youtubeConnectBtn");
  if(!el)return;
  if(youtubeAccessToken){el.textContent="✓ YouTube連携済み";btn.textContent="YouTube再連携";}
  else {el.textContent="YouTube未連携";btn.textContent="YouTube連携";}
}
async function youtubeRequest(path,options={}){
  if(!youtubeAccessToken)throw new Error("YouTube未連携です。");
  const res=await fetch("https://www.googleapis.com/youtube/v3/"+path,{
    ...options,
    headers:{"Authorization":"Bearer "+youtubeAccessToken,"Content-Type":"application/json",...(options.headers||{})}
  });
  if(res.status===401){
    youtubeAccessToken="";
    localStorage.removeItem("musicMemoryYoutubeAccessToken");
    updateYouTubeStatus();
    throw new Error("YouTubeの認証期限が切れました。再連携してください。");
  }
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||"YouTube APIエラー");
  return data;
}
function getYouTubeVideoId(url){
  if(!url)return "";
  try{
    const u=new URL(url);
    if(u.hostname==="youtu.be")return u.pathname.slice(1).split("/")[0];
    if(u.hostname.includes("youtube.com")){
      if(u.pathname==="/watch")return u.searchParams.get("v")||"";
      if(u.pathname.startsWith("/shorts/"))return u.pathname.split("/")[2]||"";
      if(u.pathname.startsWith("/embed/"))return u.pathname.split("/")[2]||"";
    }
  }catch(e){}
  return "";
}
function getSongYoutubeId(song){
  // 現在のURLを最優先。旧バージョンのyoutubeVideoIdはURLがない場合だけ互換用に使う。
  return getYouTubeVideoId(song?.url||"")||song?.youtubeVideoId||"";
}
async function syncSongYoutubeUrlChange(songId,oldVideoId,newVideoId){
  if(!youtubeAccessToken||oldVideoId===newVideoId)return;
  const targets=playlists.filter(p=>p.songIds?.includes(songId)&&p.youtubePlaylistId);
  for(const p of targets){
    p.youtubePlaylistItemIds=p.youtubePlaylistItemIds||{};
    const oldItemId=p.youtubePlaylistItemIds[songId];
    // 旧URL（またはURL削除）に対応するYouTube項目を先に削除する。
    if(oldItemId){
      await youtubeRequest("playlistItems?id="+encodeURIComponent(oldItemId),{method:"DELETE"});
      delete p.youtubePlaylistItemIds[songId];
      save();
    }
    // 新しいURLがYouTube動画なら、その動画を同じプレイリストへ追加し直す。
    if(newVideoId){
      const item=await addYouTubePlaylistItem(p.youtubePlaylistId,newVideoId);
      p.youtubePlaylistItemIds[songId]=item.id;
      save();
    }
    p.updatedAt=new Date().toISOString();
  }
  save();
}
async function createYouTubePlaylist(p){
  const data=await youtubeRequest("playlists?part=snippet,status",{
    method:"POST",
    body:JSON.stringify({snippet:{title:p.name,description:p.description||"Music Memoryから作成"},status:{privacyStatus:"private"}})
  });
  p.youtubePlaylistId=data.id;
  p.youtubePlaylistItemIds={};
  await syncPlaylistSongs(p,[]);
}
async function addYouTubePlaylistItem(playlistId,videoId){
  return youtubeRequest("playlistItems?part=snippet",{
    method:"POST",
    body:JSON.stringify({snippet:{playlistId,resourceId:{kind:"youtube#video",videoId}}})
  });
}
async function deleteYouTubePlaylistItem(itemId){
  return youtubeRequest("playlistItems",{
    method:"DELETE",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({})
  });
}
async function syncPlaylistSongs(p,oldSongIds=[]){
  if(!youtubeAccessToken||!p.youtubePlaylistId)return;
  p.youtubePlaylistItemIds=p.youtubePlaylistItemIds||{};
  const oldSet=new Set(oldSongIds);
  const newSet=new Set(p.songIds);
  // 削除
  for(const songId of oldSet){
    if(!newSet.has(songId) && p.youtubePlaylistItemIds[songId]){
      await youtubeRequest("playlistItems?id="+encodeURIComponent(p.youtubePlaylistItemIds[songId]),{method:"DELETE"});
      delete p.youtubePlaylistItemIds[songId];
    }
  }
  // 追加（YouTube動画URL/IDが登録されている曲のみ）
  for(const songId of p.songIds){
    if(oldSet.has(songId)||p.youtubePlaylistItemIds[songId])continue;
    const song=songs.find(s=>s.id===songId);
    const videoId=getSongYoutubeId(song);
    if(!videoId)continue;
    const item=await addYouTubePlaylistItem(p.youtubePlaylistId,videoId);
    p.youtubePlaylistItemIds[songId]=item.id;
  }
}
async function updateYouTubePlaylistTitle(p){
  if(!youtubeAccessToken||!p.youtubePlaylistId)return;
  await youtubeRequest("playlists?part=snippet",{
    method:"PUT",
    body:JSON.stringify({id:p.youtubePlaylistId,snippet:{title:p.name,description:p.description||"Music Memoryから作成"}})
  });
}
async function deleteYouTubePlaylist(p){
  if(!youtubeAccessToken||!p.youtubePlaylistId)return;
  await youtubeRequest("playlists?id="+encodeURIComponent(p.youtubePlaylistId),{method:"DELETE"});
}
function openYouTubePlaylist(){
  const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;
  if(!p.youtubePlaylistId){alert("YouTube側のプレイリストがまだ作成されていません。YouTube連携後にプレイリストを保存してください。");return;}
  window.open("https://music.youtube.com/playlist?list="+encodeURIComponent(p.youtubePlaylistId),"_blank","noopener");
}


const $=id=>document.getElementById(id);
const views=document.querySelectorAll(".view");
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(songs));localStorage.setItem(PLAYLIST_STORAGE_KEY,JSON.stringify(playlists))}
function exportBackup(){
  const backup={
    app:"Music Memory",
    version:1,
    exportedAt:new Date().toISOString(),
    songs,
    playlists
  };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  a.href=url;
  a.download=`music-memory-backup-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}.json`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function importBackupFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!data||!Array.isArray(data.songs)||!Array.isArray(data.playlists))throw new Error("invalid");
      if(!confirm(`バックアップから復元しますか？\n現在のデータはバックアップ内のデータに置き換わります。\n\n曲：${data.songs.length}件\nプレイリスト：${data.playlists.length}件`))return;
      songs=data.songs;playlists=data.playlists;save();
      currentDetailId=null;currentPlaylistId=null;selectedArtist="";
      populateFilters();renderHome();renderListView();showView("homeView");
      alert("バックアップから復元しました。");
    }catch(e){
      alert("バックアップファイルを読み込めませんでした。Music Memoryで作成したJSONファイルを選択してください。");
    }finally{$("backupFileInput").value="";}
  };
  reader.onerror=()=>{alert("ファイルの読み込みに失敗しました。");$("backupFileInput").value="";};
  reader.readAsText(file);
}

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
  [".library-tools"].forEach(sel=>document.querySelector(sel).classList.toggle("hidden",listMode!=="songs"));
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
function card(s){return `<article class="song-card" data-id="${esc(s.id)}"><div class="song-list-main"><div class="song-list-info"><p class="song-title">${esc(s.title)}</p><div class="song-artist">${esc(s.artist||"アーティスト未設定")}</div></div><div class="song-list-right">${s.year?`<span class="song-year">${esc(s.year)}年</span>`:""}<span class="song-arrow">›</span></div></div></article>`}
function artistSongCard(s){return `<article class="song-card artist-song-card" data-id="${esc(s.id)}"><div class="song-main"><div><p class="song-title">${esc(s.title)}</p></div></div></article>`}
function bindCards(){document.querySelectorAll(".song-card").forEach(c=>c.onclick=()=>openDetail(c.dataset.id))}
function renderHome(){$("songCount").textContent=songs.length;$("artistCount").textContent=new Set(songs.map(s=>s.artist).filter(Boolean)).size;$("tagCount").textContent=new Set(songs.flatMap(s=>s.tags||[])).size;const recent=[...songs].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);$("recentSongs").innerHTML=recent.length?recent.map(card).join(""):`<div class="empty-state"><div class="empty-icon">♪</div><h3>まだ曲がありません</h3><p>お気に入りの曲を登録してみましょう。</p></div>`;bindCards()}
function updateFilterUI(){
  const ids=["genreFilter","yearFilter","seasonFilter","tagFilter"];
  const count=ids.filter(id=>$(id).value).length;
  $("activeFilterCount").textContent=count;
  $("activeFilterCount").classList.toggle("hidden",count===0);
  $("clearSearchBtn").classList.toggle("hidden",!$("searchInput").value);
}
function getSongGroupKey(title){
  const first=String(title||"").trim().charAt(0);
  if(!first)return "その他";
  const upper=first.toUpperCase();
  if(/^[A-Z]$/.test(upper))return upper;
  const hira=first.charCodeAt(0)>=0x30A1&&first.charCodeAt(0)<=0x30F6
    ?String.fromCharCode(first.charCodeAt(0)-0x60):first;
  const rows=[
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
  const row=rows.find(r=>r.chars.includes(hira));
  return row?row.key:"その他";
}
function renderList(){
  updateFilterUI();
  const q=$("searchInput").value.trim().toLowerCase(),g=$("genreFilter").value,y=$("yearFilter").value,se=$("seasonFilter").value,t=$("tagFilter").value;
  let a=songs.filter(s=>{
    const text=[s.title,s.artist,s.work].join(" ").toLowerCase();
    return(!q||text.includes(q))&&(!selectedArtist||s.artist===selectedArtist)&&(!g||s.genre===g)&&(!y||String(s.year)===y)&&(!se||s.season===se)&&(!t||(s.tags||[]).includes(t))
  });
  a.sort((x,z)=>new Date(z.createdAt)-new Date(x.createdAt));
  $("resultCount").textContent=`${a.length}曲`;
  const groups=new Map();
  a.forEach(s=>{
    const key=getSongGroupKey(s.title);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(s);
  });
  const kanaOrder=["あ","か","さ","た","な","は","ま","や","ら","わ"];
  const keys=[...groups.keys()].sort((x,z)=>{
    if(x==="その他")return 1;
    if(z==="その他")return -1;
    const xa=/^[A-Z]$/.test(x),za=/^[A-Z]$/.test(z);
    if(xa&&za)return x.localeCompare(z);
    if(xa)return -1;
    if(za)return 1;
    return kanaOrder.indexOf(x)-kanaOrder.indexOf(z);
  });
  $("songList").innerHTML=keys.map(k=>`<section class="song-group" id="song-group-${k}"><h3 class="song-group-heading">${k}</h3><div class="song-group-list">${groups.get(k).map(card).join("")}</div></section>`).join("");
  $("emptyState").classList.toggle("hidden",a.length!==0);
  bindCards();
}
function renderTags(){$("selectedTags").innerHTML=currentTags.map((t,i)=>`<span class="tag-item">#${esc(t)} <button type="button" onclick="removeTag(${i})">×</button></span>`).join("")}
window.removeTag=i=>{currentTags.splice(i,1);renderTags()};function addTag(){const v=$("tagInput").value.trim();if(v&&!currentTags.includes(v)){currentTags.push(v);renderTags()}$("tagInput").value=""}
function openNew(){resetForm();previousView=currentView==="formView"?"homeView":currentView;showView("formView")}
function openDetail(id){const s=songs.find(x=>x.id===id);if(!s)return;currentDetailId=id;previousView=currentView;$("detailCard").innerHTML=`<h1 class="detail-title">${esc(s.title)}</h1><div class="detail-artist">${esc(s.artist)}</div>${field("作品名",s.work)}${field("年代",s.year?s.year+"年":"")}${field("ジャンル",s.genre)}${field("季節",s.season)}${s.tags?.length?field("タグ",s.tags.map(t=>"#"+esc(t)).join(" ")):""}${field("メモ",s.memo)}${s.url?`<div class="detail-label">音楽リンク</div><a class="link-btn" href="${esc(s.url)}" target="_blank" rel="noopener">音楽サービスを開く ↗</a>`:""}<div class="detail-label">登録日時</div><div class="detail-value">${formatDate(s.createdAt)}</div>`;showView("detailView")}
function field(label,value){return value?`<div class="detail-label">${label}</div><div class="detail-value">${value}</div>`:""}
function editCurrent(){const s=songs.find(x=>x.id===currentDetailId);if(!s)return;$("songId").value=s.id;$("title").value=s.title;$("artist").value=s.artist;$("work").value=s.work||"";$("year").value=s.year||"";$("genre").value=s.genre||"";$("season").value=s.season||"";$("memo").value=s.memo||"";$("url").value=s.url||"";currentTags=[...(s.tags||[])];renderTags();$("formTitle").textContent="曲を編集";previousView="detailView";showView("formView")}
function deleteCurrent(){if(!currentDetailId)return;if(confirm("この曲を削除しますか？")){songs=songs.filter(s=>s.id!==currentDetailId);playlists.forEach(p=>p.songIds=p.songIds.filter(id=>id!==currentDetailId));save();currentDetailId=null;showView("listView")}}
$("songForm").onsubmit=async e=>{
  e.preventDefault();
  const id=$("songId").value,old=songs.find(s=>s.id===id);
  const oldVideoId=getSongYoutubeId(old);
  const data={id:id||crypto.randomUUID(),title:$("title").value.trim(),artist:$("artist").value.trim(),work:$("work").value.trim(),year:$("year").value,genre:$("genre").value,season:$("season").value,tags:[...currentTags],memo:$("memo").value.trim(),url:$("url").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  const newVideoId=getSongYoutubeId(data);
  if(old)songs=songs.map(s=>s.id===id?data:s);else songs.push(data);
  save();resetForm();showView("listView");
  // 既存曲のYouTube URLが変わった場合、所属する全プレイリストを同期する。
  if(old&&oldVideoId!==newVideoId&&youtubeAccessToken){
    try{
      await syncSongYoutubeUrlChange(data.id,oldVideoId,newVideoId);
      renderListView();
    }catch(err){
      console.error("YouTube URL変更同期エラー",err);
      alert("曲の変更は保存しましたが、YouTubeプレイリストのURL変更同期に失敗しました。\n"+err.message);
    }
  }
};
function openPlaylistModal(editId=null){editingPlaylistId=editId;const p=editId?playlists.find(x=>x.id===editId):null;$("playlistModalTitle").textContent=p?"プレイリストを編集":"プレイリストを作成";$("playlistNameInput").value=p?.name||"";$("playlistDescriptionInput").value=p?.description||"";$("savePlaylistBtn").textContent=p?"保存":"作成";$("playlistModal").classList.remove("hidden");$("playlistModal").setAttribute("aria-hidden","false");setTimeout(()=>$("playlistNameInput").focus(),0)}
function closePlaylistModal(){$("playlistModal").classList.add("hidden");$("playlistModal").setAttribute("aria-hidden","true");editingPlaylistId=null}
async function savePlaylist(){
  const name=$("playlistNameInput").value.trim();
  if(!name){alert("プレイリスト名を入力してください。");return}
  const description=$("playlistDescriptionInput").value.trim();
  if(editingPlaylistId){
    const p=playlists.find(x=>x.id===editingPlaylistId);
    if(!p)return;
    const oldName=p.name;
    p.name=name;p.description=description;p.updatedAt=new Date().toISOString();
    save();closePlaylistModal();renderListView();
    if(youtubeAccessToken&&p.youtubePlaylistId&&oldName!==name){
      try{await updateYouTubePlaylistTitle(p);save();}catch(e){alert("アプリ側は更新しましたが、YouTube側の更新に失敗しました。\n"+e.message);}
    }
  }else{
    const p={id:crypto.randomUUID(),name,description,songIds:[],youtubePlaylistId:null,youtubePlaylistItemIds:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    playlists.push(p);save();closePlaylistModal();renderListView();
    if(youtubeAccessToken){
      try{await createYouTubePlaylist(p);p.updatedAt=new Date().toISOString();save();renderListView();}
      catch(e){alert("アプリ側には作成しましたが、YouTube側の作成に失敗しました。\n"+e.message);}
    }
  }
}
function openSongPicker(){const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;selectedPickerSongIds=new Set(p.songIds);$("playlistSongSearch").value="";renderSongPicker();$("songPickerModal").classList.remove("hidden");$("songPickerModal").setAttribute("aria-hidden","false")}
function closeSongPicker(){$("songPickerModal").classList.add("hidden");$("songPickerModal").setAttribute("aria-hidden","true");selectedPickerSongIds.clear()}
function renderSongPicker(){const q=$("playlistSongSearch").value.trim().toLowerCase();const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;const list=songs.filter(s=>!q||[s.title,s.artist,s.work].join(" ").toLowerCase().includes(q));const el=$("songPickerList");if(!list.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">♪</div><h3>曲がありません</h3></div>';return}el.innerHTML=list.map(s=>`<label class="song-picker-row ${selectedPickerSongIds.has(s.id)?"selected":""}"><input type="checkbox" value="${esc(s.id)}" ${selectedPickerSongIds.has(s.id)?"checked":""}><span class="song-picker-row-info"><span class="song-picker-title">${esc(s.title)}</span><span class="song-picker-artist">${esc(s.artist)}</span></span></label>`).join("");el.querySelectorAll("input").forEach(input=>input.onchange=()=>{if(input.checked)selectedPickerSongIds.add(input.value);else selectedPickerSongIds.delete(input.value);input.closest(".song-picker-row").classList.toggle("selected",input.checked)})}
async function confirmAddSongs(){
  const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;
  const oldIds=[...p.songIds];
  p.songIds=[...selectedPickerSongIds];p.updatedAt=new Date().toISOString();save();closeSongPicker();openPlaylistDetail(currentPlaylistId);
  if(youtubeAccessToken&&p.youtubePlaylistId){
    try{await syncPlaylistSongs(p,oldIds);p.updatedAt=new Date().toISOString();save();openPlaylistDetail(currentPlaylistId);}
    catch(e){alert("アプリ側は更新しましたが、YouTube側の同期に失敗しました。\n"+e.message);}
  }
}
async function deletePlaylist(){
  const p=playlists.find(x=>x.id===currentPlaylistId);if(!p)return;
  if(!confirm(`「${p.name}」を削除しますか？\n曲自体は削除されません。`))return;
  playlists=playlists.filter(x=>x.id!==currentPlaylistId);save();currentPlaylistId=null;showView("listView");
  if(youtubeAccessToken&&p.youtubePlaylistId){
    try{await deleteYouTubePlaylist(p);}
    catch(e){alert("アプリ側からは削除しましたが、YouTube側の削除に失敗しました。\n"+e.message);}
  }
}
$("exportBackupBtn").onclick=exportBackup;$("importBackupBtn").onclick=()=>$("backupFileInput").click();$("backupFileInput").onchange=e=>importBackupFile(e.target.files?.[0]);
$("addTagBtn").onclick=addTag;$("tagInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addTag()}});
$("resetFilterBtn").onclick=()=>{["searchInput","genreFilter","yearFilter","seasonFilter","tagFilter"].forEach(id=>$(id).value="");selectedArtist="";updateFilterUI();renderListView()};
$("filterToggleBtn").onclick=()=>{const panel=$("filterPanel"),open=panel.classList.contains("hidden");panel.classList.toggle("hidden",!open);$("filterToggleBtn").setAttribute("aria-expanded",String(open));$("filterToggleBtn").classList.toggle("active",open)};
$("clearSearchBtn").onclick=()=>{$("searchInput").value="";renderList()};
$("songsTab").onclick=()=>{listMode="songs";selectedArtist="";renderListView()};$("artistsTab").onclick=()=>{listMode="artists";selectedArtist="";renderListView()};$("playlistsTab").onclick=()=>{listMode="playlists";selectedArtist="";renderListView()};
$("createPlaylistBtn").onclick=()=>openPlaylistModal();$("savePlaylistBtn").onclick=savePlaylist;$("youtubeConnectBtn").onclick=connectYouTube;$("playYoutubePlaylistBtn").onclick=openYouTubePlaylist;$("renamePlaylistBtn").onclick=()=>openPlaylistModal(currentPlaylistId);$("deletePlaylistBtn").onclick=deletePlaylist;$("addSongsToPlaylistBtn").onclick=openSongPicker;$("confirmAddSongsBtn").onclick=confirmAddSongs;$("playlistSongSearch").addEventListener("input",renderSongPicker);
$("artistDetailBackBtn").onclick=()=>{selectedArtist="";showView("listView")};$("playlistDetailBackBtn").onclick=()=>{currentPlaylistId=null;showView("listView")};$("detailBackBtn").onclick=()=>showView(previousView==="formView"?"listView":previousView);$("editBtn").onclick=editCurrent;$("deleteBtn").onclick=deleteCurrent;$("cancelBtn").onclick=()=>showView(previousView==="detailView"?"listView":previousView);$("formBackBtn").onclick=()=>showView(previousView==="detailView"?"detailView":previousView);
document.querySelectorAll("[data-close-modal]").forEach(b=>b.onclick=closePlaylistModal);document.querySelectorAll("[data-close-song-picker]").forEach(b=>b.onclick=closeSongPicker);
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{if(b.dataset.view==="formView")openNew();else showView(b.dataset.view)});
["searchInput","genreFilter","yearFilter","seasonFilter","tagFilter"].forEach(id=>$(id).addEventListener("input",renderList));
populateYears();populateFilters();renderListView();renderHome();setTimeout(initYouTubeAuth,500);
