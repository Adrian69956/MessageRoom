// ===================== Истории MessageRoom =====================
(() => {
  const $s = (id) => document.getElementById(id);
  const rail = $s("storiesRail");
  if (!rail || typeof sb === "undefined") return;
  let storyRows = [];
  let storyGroups = [];
  let storyType = "photo";
  let activeStoryIndex = 0;
  let viewerStories = [];
  let storyTouchX = 0;
  let storyChannel = null;

  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const safeText = (value) => String(value || "").slice(0, 2000);
  const closeOverlay = (id) => { const x=$s(id); x.classList.remove("open"); x.setAttribute("aria-hidden","true"); };

  async function loadStories() {
    if (!me) return;
    const { data, error } = await sb.from("stories")
      .select("id,user_id,story_type,text,media_path,background,audience,duration_hours,created_at,expires_at")
      .gt("expires_at", new Date().toISOString()).order("created_at", {ascending:true}).limit(300);
    if (error) { console.warn("Stories unavailable:", error); return; }
    storyRows = data || [];
    if (typeof loadProfiles === "function") await loadProfiles([...new Set(storyRows.map(s=>s.user_id))]);
    const byUser = new Map();
    storyRows.forEach(s => {
      if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
      byUser.get(s.user_id).push(s);
    });
    storyGroups = [...byUser.entries()].map(([userId, stories]) => ({
      userId, stories, profile: profiles[userId] || {id:userId,display_name:"Пользователь"}
    })).sort((a,b) => {
      if (a.userId === me.id) return -1;
      if (b.userId === me.id) return 1;
      return new Date(b.stories[b.stories.length-1].created_at)-new Date(a.stories[a.stories.length-1].created_at);
    });
    renderStories();
  }

  function renderStories() {
    rail.innerHTML = "";
    const add = node("button","story-add");
    add.type="button";
    const own = node("div","story-avatar");
    const ownProfile = profiles[me.id] || {id:me.id,display_name:"Вы"};
    own.append(typeof makeAvatar==="function" ? makeAvatar(ownProfile,"") : node("span","","+"));
    own.append(node("i","story-add-plus","+"));
    add.append(own,node("span","story-label","Моя история"));
    const ownGroup=storyGroups.find(g=>g.userId===me.id);
    add.addEventListener("click",()=>ownGroup?openViewer(ownGroup.stories):openCreate());
    const plus=own.querySelector(".story-add-plus");
    if(plus)plus.addEventListener("click",e=>{e.stopPropagation();openCreate();});
    rail.append(add);
    storyGroups.filter(g=>g.userId!==me.id).forEach(group=>{
      const b=node("button","story-person");
      b.type="button";
      const ring=node("span","story-ring");
      const av=node("span","story-avatar");
      av.append(typeof makeAvatar==="function" ? makeAvatar(group.profile,"") : node("span","","?"));
      ring.append(av);
      b.append(ring,node("span","story-label",group.profile.display_name||"Пользователь"));
      b.addEventListener("click",()=>openViewer(group.stories));
      rail.append(b);
    });
    if (!storyGroups.length) rail.classList.add("empty");
    else rail.classList.remove("empty");
  }

  function openCreate() {
    storyType="photo";
    document.querySelectorAll("[data-story-type]").forEach(b=>b.classList.toggle("active",b.dataset.storyType===storyType));
    $s("storyMediaFields").hidden=false;
    $s("storyTextFields").hidden=true;
    $s("storyMediaFile").value="";
    $s("storyFileName").textContent="Файл не выбран";
    $s("storyCaption").value="";
    $s("storyText").value="";
    $s("storyCreateError").textContent="";
    $s("storyCreateOverlay").classList.add("open");
    $s("storyCreateOverlay").setAttribute("aria-hidden","false");
  }
  document.querySelectorAll("[data-story-type]").forEach(b=>b.addEventListener("click",()=>{
    storyType=b.dataset.storyType;
    document.querySelectorAll("[data-story-type]").forEach(x=>x.classList.toggle("active",x===b));
    $s("storyMediaFields").hidden=storyType==="text";
    $s("storyTextFields").hidden=storyType!=="text";
  }));
  $s("storyCreateClose").addEventListener("click",()=>closeOverlay("storyCreateOverlay"));
  $s("storyCreateOverlay").addEventListener("click",e=>{if(e.target.id==="storyCreateOverlay")closeOverlay("storyCreateOverlay");});
  $s("storyMediaFile").addEventListener("change",()=>{
    const f=$s("storyMediaFile").files[0];
    $s("storyFileName").textContent=f?f.name:"Файл не выбран";
  });

  async function publishStory() {
    const button=$s("storyPublish"), errorBox=$s("storyCreateError");
    errorBox.textContent="";
    const duration=Number($s("storyDuration").value);
    const audience=$s("storyAudience").value;
    const text=storyType==="text"?safeText($s("storyText").value).trim():safeText($s("storyCaption").value).trim();
    if (![4,6,8,12].includes(duration)) {errorBox.textContent="Выбери срок от 4 до 12 часов";return;}
    if (storyType==="text" && !text) {errorBox.textContent="Напиши текст истории";return;}
    let file=null, mediaPath=null;
    if(storyType!=="text"){
      file=$s("storyMediaFile").files[0];
      if(!file){errorBox.textContent="Выбери фото или видео";return;}
      const image=/^image\/(jpeg|png|webp|gif)$/i.test(file.type);
      const video=/^video\/(mp4|webm|quicktime)$/i.test(file.type);
      if(!image&&!video){errorBox.textContent="Формат файла не поддерживается";return;}
      if(file.size>50*1024*1024){errorBox.textContent="Максимальный размер — 50 МБ";return;}
      if(video){
        const url=URL.createObjectURL(file), v=document.createElement("video");
        const valid=await new Promise(resolve=>{v.preload="metadata";v.onloadedmetadata=()=>{const ok=v.duration<=60;URL.revokeObjectURL(url);resolve(ok);};v.onerror=()=>{URL.revokeObjectURL(url);resolve(false);};v.src=url;});
        if(!valid){errorBox.textContent="Видео должно быть не длиннее 60 секунд";return;}
      }
    }
    button.disabled=true;button.textContent="Публикуем…";
    try{
      const storyId=crypto.randomUUID();
      if(file){
        const clean=(typeof safeMediaFilename==="function"?safeMediaFilename(file.name):file.name.replace(/[^a-z0-9._-]/gi,"_"));
        mediaPath=me.id+"/"+storyId+"__"+clean;
        const {error:uploadError}=await sb.storage.from("story-media").upload(mediaPath,file,{contentType:file.type,upsert:false});
        if(uploadError)throw uploadError;
      }
        const {error}=await sb.from("stories").insert({
        id:storyId,user_id:me.id,story_type:storyType==="text"?"text":(file.type.startsWith("video/")?"video":"photo"),
        text,media_path:mediaPath,background:storyType==="text"?$s("storyBackground").value:null,
        audience,duration_hours:duration,
        expires_at:new Date(Date.now()+duration*3600000).toISOString()
      });
      if(error)throw error;
      closeOverlay("storyCreateOverlay");
      await loadStories();
      if(typeof toast==="function")toast("История опубликована");
    }catch(error){
      console.error("Story publish failed:",error);
      errorBox.textContent=error.message||"Не удалось опубликовать историю";
      if(mediaPath)await sb.storage.from("story-media").remove([mediaPath]);
    }finally{button.disabled=false;button.textContent="Опубликовать историю";}
  }
  $s("storyPublish").addEventListener("click",publishStory);

  async function openViewer(stories) {
    const selectedId=stories[0]&&stories[0].id;
    viewerStories=storyGroups.flatMap(group=>group.stories);
    activeStoryIndex=Math.max(0,viewerStories.findIndex(item=>item.id===selectedId));
    $s("storyViewerOverlay").classList.add("open");
    $s("storyViewerOverlay").setAttribute("aria-hidden","false");
    await renderViewerStory();
  }
  async function renderViewerStory() {
    const s=viewerStories[activeStoryIndex];
    if(!s)return closeOverlay("storyViewerOverlay");
    const profile=profiles[s.user_id]||{id:s.user_id,display_name:"Пользователь"};
    const bars=$s("storyViewerBars");bars.innerHTML="";
    viewerStories.forEach((_,i)=>{const track=node("span","story-progress");const fill=node("i",i<=activeStoryIndex?"done":"");track.append(fill);bars.append(track);});
    $s("storyViewerAuthor").innerHTML="";
    const av=node("span","story-viewer-avatar");
    av.append(typeof makeAvatar==="function"?makeAvatar(profile,"") : node("span","","?"));
    $s("storyViewerAuthor").append(av,node("strong","",profile.display_name||"Пользователь"),node("small","",new Date(s.created_at).toLocaleString("ru-RU")));
    const content=$s("storyViewerContent");content.innerHTML="";
    if(s.story_type==="text"){
      content.className="story-viewer-content text-story bg-"+(s.background||"blue");
      content.append(node("div","story-text-content",s.text));
    }else{
      content.className="story-viewer-content";
      try{
        const {data,error}=await sb.storage.from("story-media").createSignedUrl(s.media_path,3600);
        if(error||!data?.signedUrl)throw error||new Error("Медиа недоступно");
        if(s.story_type==="video"){const video=node("video","");video.src=data.signedUrl;video.controls=true;video.autoplay=true;video.playsInline=true;content.append(video);}
        else{const img=node("img","");img.src=data.signedUrl;img.alt="История";content.append(img);}
      }catch(e){content.append(node("div","story-media-error","Медиа недоступно"));}
      if(s.text)content.append(node("div","story-caption",s.text));
    }
    const bottom=$s("storyViewerBottom");bottom.innerHTML="";
    if(s.user_id===me.id){
      const {data:views}=await sb.from("story_views").select("viewer_id,viewed_at").eq("story_id",s.id).order("viewed_at",{ascending:false});
      const ids=(views||[]).map(v=>v.viewer_id).filter(id=>id!==me.id);
      if(ids.length){
        const {data:people}=await sb.from("profiles").select("id,display_name,avatar_url").in("id",ids);
        bottom.textContent="Просмотры: "+ids.length+" · "+(people||[]).map(p=>p.display_name).join(", ");
      }else bottom.textContent="Пока нет просмотров";
      const del=node("button","story-delete","Удалить историю");
      del.addEventListener("click",()=>deleteStory(s));
      bottom.append(del);
    }else{
      const {data:existing}=await sb.from("story_views").select("story_id").eq("story_id",s.id).eq("viewer_id",me.id).maybeSingle();
      if(!existing)await sb.from("story_views").insert({story_id:s.id,viewer_id:me.id});
      bottom.textContent="История исчезнет через "+s.duration_hours+" ч. после публикации";
    }
    $s("storyPrev").disabled=activeStoryIndex===0;
    $s("storyNext").disabled=activeStoryIndex===viewerStories.length-1;
  }
  async function deleteStory(s){
    if(!confirm("Удалить эту историю?"))return;
    const {error}=await sb.from("stories").delete().eq("id",s.id).eq("user_id",me.id);
    if(error){if(typeof toast==="function")toast("Не удалось удалить историю");return;}
    if(s.media_path)await sb.storage.from("story-media").remove([s.media_path]);
    storyRows=storyRows.filter(x=>x.id!==s.id);
    viewerStories.splice(activeStoryIndex,1);
    await loadStories();
    if(!viewerStories.length)closeOverlay("storyViewerOverlay");
    else{activeStoryIndex=Math.min(activeStoryIndex,viewerStories.length-1);await renderViewerStory();}
  }
  $s("storyViewerClose").addEventListener("click",()=>closeOverlay("storyViewerOverlay"));
  $s("storyViewerOverlay").addEventListener("click",e=>{if(e.target.id==="storyViewerOverlay")closeOverlay("storyViewerOverlay");});
  $s("storyPrev").addEventListener("click",async()=>{if(activeStoryIndex>0){activeStoryIndex--;await renderViewerStory();}});
  $s("storyNext").addEventListener("click",async()=>{if(activeStoryIndex<viewerStories.length-1){activeStoryIndex++;await renderViewerStory();}});
  $s("storyViewer").addEventListener("touchstart",e=>{storyTouchX=e.changedTouches[0].clientX;},{passive:true});
  $s("storyViewer").addEventListener("touchend",async e=>{
    const dx=e.changedTouches[0].clientX-storyTouchX;
    if(Math.abs(dx)>65){const next=activeStoryIndex+(dx<0?1:-1);if(next>=0&&next<viewerStories.length){activeStoryIndex=next;await renderViewerStory();}}
  },{passive:true});
  document.addEventListener("keydown",e=>{
    if(!$s("storyViewerOverlay").classList.contains("open"))return;
    if(e.key==="Escape")closeOverlay("storyViewerOverlay");
    if(e.key==="ArrowRight")$s("storyNext").click();
    if(e.key==="ArrowLeft")$s("storyPrev").click();
  });

  // Refresh the story rail at login and after realtime changes.
  const originalStartApp=window.startApp;
  if(typeof originalStartApp==="function"){
    window.startApp=async function(user){await originalStartApp(user);await loadStories();};
  }
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&me)loadStories();});
  const storyRealtime=()=>{
    if(!me)return;
    if(storyChannel)sb.removeChannel(storyChannel);
    storyChannel=sb.channel("stories-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"stories"},loadStories)
      .on("postgres_changes",{event:"*",schema:"public",table:"profile_visits"},loadStories)
      .on("postgres_changes",{event:"*",schema:"public",table:"close_friends"},loadStories)
      .subscribe();
  };
  const oldSubscribe=window.subscribeRealtime;
  if(typeof oldSubscribe==="function"){window.subscribeRealtime=function(){oldSubscribe();storyRealtime();};}
  const oldStopApp=window.stopApp;
  if(typeof oldStopApp==="function"){window.stopApp=function(){if(storyChannel){sb.removeChannel(storyChannel);storyChannel=null;}oldStopApp();};}
  // Initial start may have happened before this module on unusual cached clients.
  if(me){loadStories();storyRealtime();}
})();