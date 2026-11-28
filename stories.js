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
  let trimDuration = 0;
  let trimObjectUrl = null;
  let storyChannel = null;
  let audienceMode = "everyone";
  let selectedAudienceIds = [];
  let closeFriendIds = [];
  let excludedAudienceIds = [];
  let privacyPeople = [];

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
      .select("id,user_id,story_type,text,media_path,background,audience,duration_hours,created_at,expires_at,trim_start_seconds,trim_end_seconds,preview_seconds")
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
      const n=group.stories.length, seg=100/n;
      ring.style.background="conic-gradient("+group.stories.map((_,i)=>"hsl("+(i*360/n)+" 85% 58%) "+(i*seg)+"% "+((i+1)*seg-1)+"%").join(",")+")";
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
    $s("storyVideoTrim").hidden=true;
    $s("storyTrimPreview").removeAttribute("src");
    if(trimObjectUrl){URL.revokeObjectURL(trimObjectUrl);trimObjectUrl=null;}
    trimDuration=0;
    $s("storyCaption").value="";
    $s("storyText").value="";
    $s("storyCreateError").textContent="";
    audienceMode="everyone";selectedAudienceIds=[];excludedAudienceIds=[];closeFriendIds=[];
    renderPrivacyControls();
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
  function formatStoryTime(seconds) {
    const n=Math.max(0,Math.floor(Number(seconds)||0));
    return Math.floor(n/60)+":"+String(n%60).padStart(2,"0");
  }
  function updateTrimLabels() {
    const start=Number($s("storyTrimStart").value)||0;
    const end=Number($s("storyTrimEnd").value)||trimDuration;
    $s("storyTrimStartLabel").textContent=formatStoryTime(start);
    $s("storyTrimEndLabel").textContent=formatStoryTime(end);
  }
  function seekTrimPreview(value) {
    const v=$s("storyTrimPreview");
    if(v.readyState>=1)try{v.currentTime=Math.max(Number($s("storyTrimStart").value)||0,Math.min(Number(value)||0,Number($s("storyTrimEnd").value)||trimDuration));}catch(_){}
  }
  $s("storyMediaFile").addEventListener("change",()=>{
    const f=$s("storyMediaFile").files[0];
    $s("storyFileName").textContent=f?f.name:"Файл не выбран";
    const panel=$s("storyVideoTrim"), preview=$s("storyTrimPreview");
    if(trimObjectUrl){URL.revokeObjectURL(trimObjectUrl);trimObjectUrl=null;}
    panel.hidden=!(f&&f.type.startsWith("video/"));
    if(!panel.hidden){
      trimObjectUrl=URL.createObjectURL(f);preview.src=trimObjectUrl;preview.load();
      preview.onloadedmetadata=()=>{
        trimDuration=preview.duration||0;
        ["storyTrimStart","storyTrimEnd","storyFrameScrub"].forEach(id=>{$s(id).max=String(trimDuration);});
        $s("storyTrimStart").value="0";$s("storyTrimEnd").value=String(trimDuration);
        $s("storyFrameScrub").value="0";updateTrimLabels();seekTrimPreview(0);
      };
    }else{trimDuration=0;}
  });
  $s("storyTrimStart").addEventListener("input",()=>{
    let start=Number($s("storyTrimStart").value),end=Number($s("storyTrimEnd").value);
    if(start>=end-1){start=Math.max(0,end-1);$s("storyTrimStart").value=String(start);}
    updateTrimLabels();seekTrimPreview(start);
  });
  $s("storyTrimEnd").addEventListener("input",()=>{
    let start=Number($s("storyTrimStart").value),end=Number($s("storyTrimEnd").value);
    if(end<=start+1){end=Math.min(trimDuration,start+1);$s("storyTrimEnd").value=String(end);}
    updateTrimLabels();seekTrimPreview(end);
  });
  $s("storyFrameScrub").addEventListener("input",e=>seekTrimPreview(e.target.value));


  async function loadPrivacyPeople() {
    const {data:visits}=await sb.from("profile_visits").select("profile_id,visited_at").eq("viewer_id",me.id).order("visited_at",{ascending:false});
    const ids=[...new Set((visits||[]).map(x=>x.profile_id).filter(x=>x!==me.id))];
    if(!ids.length){privacyPeople=[];return;}
    const {data:people}=await sb.from("profiles").select("id,display_name,avatar_url").in("id",ids);
    const map=new Map((people||[]).map(p=>[p.id,p]));
    privacyPeople=ids.map(id=>map.get(id)).filter(Boolean);
  }
  async function renderPrivacyControls() {
    const host=$s("storyPrivacyControls"); if(!host)return;
    host.innerHTML='<h3>КТО ВИДИТ ЭТУ ИСТОРИЮ</h3><div class="story-audience-choice"><label><input type="radio" name="storyAudienceMode" value="everyone" checked> Все</label><button type="button" data-privacy="exclude">добавить исключения</button></div><div class="story-audience-choice"><label><input type="radio" name="storyAudienceMode" value="close_friends"> Близкие друзья</label><button type="button" data-privacy="close">изменить</button></div><div class="story-audience-choice"><label><input type="radio" name="storyAudienceMode" value="selected"> Выбранные пользователи</label><button type="button" data-privacy="selected">выбрать</button></div><div class="story-privacy-list" id="storyPrivacyList" hidden></div>';
    await loadPrivacyPeople();
    host.querySelectorAll('input[name="storyAudienceMode"]').forEach(r=>r.addEventListener("change",()=>{audienceMode=r.value;}));
    host.querySelectorAll("[data-privacy]").forEach(b=>b.addEventListener("click",()=>showPrivacyList(b.dataset.privacy)));
  }
  async function showPrivacyList(mode) {
    const list=$s("storyPrivacyList");if(!list)return;
    audienceMode=mode==="exclude"?"everyone":mode==="close"?"close_friends":"selected";
    const radio=$s("storyPrivacyControls").querySelector('input[value="'+audienceMode+'"]');if(radio)radio.checked=true;
    if(!privacyPeople.length)await loadPrivacyPeople();
    list.hidden=false;list.innerHTML="";
    list.append(node("strong","",mode==="exclude"?"Кому запретить просмотр":mode==="close"?"Близкие друзья":"Кто увидит эту историю"));
    if(!privacyPeople.length){list.append(node("p","","Список пока пуст: сначала посетите профили пользователей."));return;}
    if(mode==="close"){
      const {data:friends}=await sb.from("close_friends").select("friend_id").eq("owner_id",me.id);
      closeFriendIds=(friends||[]).map(x=>x.friend_id);
    }
    const chosen=mode==="exclude"?excludedAudienceIds:(mode==="close"?closeFriendIds:selectedAudienceIds);
    privacyPeople.forEach(p=>{
      const row=node("label","story-privacy-person");
      const check=node("input","");check.type="checkbox";check.checked=chosen.includes(p.id);
      check.addEventListener("change",async()=>{
        const arr=mode==="exclude"?excludedAudienceIds:(mode==="close"?closeFriendIds:selectedAudienceIds);
        if(check.checked){if(!arr.includes(p.id))arr.push(p.id);}else{const i=arr.indexOf(p.id);if(i>=0)arr.splice(i,1);}
        if(mode==="close"){
          if(check.checked)await sb.from("close_friends").upsert({owner_id:me.id,friend_id:p.id},{onConflict:"owner_id,friend_id"});
          else await sb.from("close_friends").delete().eq("owner_id",me.id).eq("friend_id",p.id);
        }
      });
      row.append(check,node("span","",p.display_name||"Пользователь"));list.append(row);
    });
    const done=node("button","story-privacy-done","Готово");done.type="button";done.addEventListener("click",()=>{list.hidden=true;});list.append(done);
  }

  async function publishStory() {
    const button=$s("storyPublish"), errorBox=$s("storyCreateError");
    errorBox.textContent="";
    const duration=Number($s("storyDuration").value);
    const audience=audienceMode==="close_friends"?"close_friends":"visitors";
    const text=storyType==="text"?safeText($s("storyText").value).trim():safeText($s("storyCaption").value).trim();
    if (![4,6,12].includes(duration)) {errorBox.textContent="Выбери срок от 4 до 12 часов";return;}
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
        const clipStart=Number($s("storyTrimStart").value)||0;
        const clipEnd=Number($s("storyTrimEnd").value)||trimDuration;
        if(!trimDuration||clipEnd<=clipStart||clipEnd-clipStart>60){errorBox.textContent="Выберите фрагмент видео длительностью от 1 до 60 секунд";return;}
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
        audience,audience_mode:audienceMode,selected_user_ids:audienceMode==="selected"?selectedAudienceIds:[],excluded_user_ids:audienceMode==="everyone"?excludedAudienceIds:[],duration_hours:duration,
        trim_start_seconds:file&&file.type.startsWith("video/")?(Number($s("storyTrimStart").value)||0):0,
        trim_end_seconds:file&&file.type.startsWith("video/")?Number($s("storyTrimEnd").value):null,
        preview_seconds:file&&file.type.startsWith("video/")?(Number($s("storyFrameScrub").value)||0):0,
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
        if(s.story_type==="video"){const video=node("video","");video.src=data.signedUrl;video.controls=false;video.autoplay=true;video.playsInline=true;video.addEventListener("loadedmetadata",()=>{const start=Math.max(0,Number(s.trim_start_seconds)||0);const end=Number(s.trim_end_seconds)||video.duration;try{video.currentTime=start;}catch(_){}video.addEventListener("timeupdate",()=>{if(video.currentTime>=end){video.pause();try{video.currentTime=start;video.play();}catch(_){}}});});content.append(video);}
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
      const like=node("button","story-like","♡ Нравится");like.type="button";
      const {data:mineLike}=await sb.from("story_likes").select("story_id").eq("story_id",s.id).eq("user_id",me.id).maybeSingle();
      if(mineLike){like.classList.add("liked");like.textContent="♥ Вам нравится";}
      like.addEventListener("click",async()=>{like.disabled=true;try{if(like.classList.contains("liked")){const {error}=await sb.from("story_likes").delete().eq("story_id",s.id).eq("user_id",me.id);if(error)throw error;like.classList.remove("liked");like.textContent="♡ Нравится";}else{const {error}=await sb.from("story_likes").insert({story_id:s.id,user_id:me.id});if(error)throw error;like.classList.add("liked");like.textContent="♥ Вам нравится";}}catch(e){if(typeof toast==="function")toast("Не удалось поставить отметку");}finally{like.disabled=false;}});
      bottom.append(like);
      const {data:existing}=await sb.from("story_views").select("story_id").eq("story_id",s.id).eq("viewer_id",me.id).maybeSingle();
      if(!existing)await sb.from("story_views").insert({story_id:s.id,viewer_id:me.id});
      bottom.insertAdjacentText("afterbegin","История исчезнет через "+s.duration_hours+" ч. после публикации");
      const reply=node("button","story-like","Ответить");reply.type="button";
      reply.addEventListener("click",async()=>{
        const message=prompt("Ответ на историю:");
        if(!message||!message.trim())return;
        try{
          const {data:chatId,error:chatError}=await sb.rpc("start_private_chat",{other_user:s.user_id});
          if(chatError)throw chatError;
          const {error}=await sb.from("messages").insert({chat_id:chatId,sender_id:me.id,text:"Ответ на историю: "+message.trim().slice(0,1800)});
          if(error)throw error;
          closeOverlay("storyViewerOverlay");
          if(typeof window.openChat==="function")window.openChat(chatId);
          if(typeof toast==="function")toast("Ответ отправлен");
        }catch(e){if(typeof toast==="function")toast(e.message==="dm_not_allowed"?"Пользователь не принимает личные сообщения":"Не удалось отправить ответ");}
      });
      bottom.append(reply);
    }
    if(s.user_id===me.id){
      const {count}=await sb.from("story_likes").select("user_id",{count:"exact",head:true}).eq("story_id",s.id);
      bottom.prepend(node("span","story-like-count","♥ "+(count||0)));
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