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
  let editedMediaFile = null;
  let editedOverlayFile = null;
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
      .select("id,user_id,story_type,text,media_path,overlay_path,background,audience,duration_hours,created_at,expires_at,trim_start_seconds,trim_end_seconds,preview_seconds")
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
    await renderStories();
  }

  async function renderStories() {
    const allIds=storyGroups.flatMap(group=>group.stories.map(story=>story.id));
    const {data:seenRows}=allIds.length?await sb.from("story_views").select("story_id").eq("viewer_id",me.id).in("story_id",allIds):{data:[]};
    const seenIds=new Set((seenRows||[]).map(row=>row.story_id));
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
      ring.style.background="conic-gradient("+group.stories.map((story,i)=>{
        const color=seenIds.has(story.id)?"#777":"hsl("+(i*360/n)+" 85% 58%)";
        return color+" "+(i*seg)+"% "+((i+1)*seg-1)+"%";
      }).join(",")+")";
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
    $s("storyMediaFile").value="";editedMediaFile=null;editedOverlayFile=null;
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
    $s("storyCreateCard").hidden=false;$s("storyPrivacyScreen").hidden=true;
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
  $s("storyNextPrivacy").addEventListener("click",()=>{if(storyType!=="text"&&!$s("storyMediaFile").files[0]){$s("storyCreateError").textContent="Выбери фото или видео";return;}$s("storyCreateCard").hidden=true;$s("storyPrivacyScreen").hidden=false;});
  $s("storyPrivacyBack").addEventListener("click",()=>{$s("storyPrivacyScreen").hidden=true;$s("storyCreateCard").hidden=false;});
  $s("storyPrivacyClose").addEventListener("click",()=>closeOverlay("storyCreateOverlay"));
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



  function openCanvasTextEditor(canvas,ctx,state,snapshot) {
    let panel=$s("storyTextOverlayEditor");
    if(!panel){
      panel=node("div","story-text-overlay-editor");panel.id="storyTextOverlayEditor";
      panel.innerHTML='<section><header><strong>Добавить текст</strong><button type="button" data-text-close>×</button></header><textarea rows="3" maxlength="160" placeholder="Введите текст…"></textarea><div class="story-text-emoji"><button type="button">😀</button><button type="button">❤️</button><button type="button">🔥</button><button type="button">✨</button><button type="button">😂</button><button type="button">🥰</button></div><div class="story-text-settings"><select data-font><option value="Arial">Современный</option><option value="Georgia">С засечками</option><option value="monospace">Моноширинный</option></select><input data-size type="range" min="18" max="96" value="42"><input data-color type="color" value="#ffffff"><label><input data-fill type="checkbox"> Подложка</label></div><button type="button" data-text-apply>Готово</button></section>';
      document.body.append(panel);
      panel.querySelector("[data-text-close]").onclick=()=>panel.classList.remove("open");
      panel.querySelectorAll(".story-text-emoji button").forEach(b=>b.onclick=()=>{
        const area=panel.querySelector("textarea"),start=area.selectionStart,end=area.selectionEnd;
        area.value=area.value.slice(0,start)+b.textContent+area.value.slice(end);area.focus();area.selectionStart=area.selectionEnd=start+b.textContent.length;
      });
    }
    const area=panel.querySelector("textarea");area.value="";panel.classList.add("open");area.focus();
    panel.querySelector("[data-text-apply]").onclick=()=>{
      const value=area.value.trim();if(!value){panel.classList.remove("open");return;}
      snapshot();
      const font=panel.querySelector("[data-font]").value,size=Number(panel.querySelector("[data-size]").value),color=panel.querySelector("[data-color]").value,fill=panel.querySelector("[data-fill]").checked;
      const lines=value.split("\n").slice(0,5),lineHeight=size*1.2,totalHeight=lines.length*lineHeight;
      ctx.save();ctx.font="bold "+size+"px "+font;ctx.textAlign="center";ctx.textBaseline="middle";
      const maxWidth=canvas.width*.86,wrapped=[];
      lines.forEach(line=>{let current="";line.split(/\s+/).forEach(word=>{const test=current?current+" "+word:word;if(ctx.measureText(test).width>maxWidth&&current){wrapped.push(current);current=word;}else current=test;});if(current)wrapped.push(current);});
      const widest=Math.max(0,...wrapped.map(line=>ctx.measureText(line).width));
      const x=canvas.width/2,y=canvas.height/2;
      if(fill){ctx.fillStyle="#0009";const w=Math.min(maxWidth,widest+size*.7),h=wrapped.length*lineHeight+size*.35;ctx.beginPath();ctx.roundRect(x-w/2,y-h/2,w,h,size*.18);ctx.fill();}
      ctx.fillStyle=color;wrapped.forEach((line,i)=>{const yy=y+(i-(wrapped.length-1)/2)*lineHeight;ctx.strokeStyle="#0009";ctx.lineWidth=Math.max(2,size*.08);ctx.strokeText(line,x,yy,maxWidth);ctx.fillText(line,x,yy,maxWidth);});
      ctx.restore();panel.classList.remove("open");
    };
  }

  function openStoryVideoOverlayEditor() {
    const source=$s("storyTrimPreview");
    if(!source||!source.videoWidth){if(typeof toast==="function")toast("Сначала выберите видео");return;}
    let modal=$s("storyVideoOverlayEditor");
    if(!modal){
      modal=node("div","story-photo-editor");modal.id="storyVideoOverlayEditor";
      modal.innerHTML='<header><button type="button" data-overlay-cancel>‹ Назад</button><strong>Рисунок и текст на видео</strong><button type="button" data-overlay-clear>Очистить</button></header><div class="story-video-overlay-stage"><video muted playsinline></video><canvas></canvas></div><footer><button type="button" data-overlay-undo>↶</button><button type="button" data-overlay-redo>↷</button><button type="button" data-overlay-tool="draw" class="active">Кисть</button><button type="button" data-overlay-tool="text">Текст</button><label>Размер <input type="range" min="2" max="48" value="7"></label><div class="story-photo-colors"><button type="button" data-overlay-color="#fff" style="background:#fff"></button><button type="button" data-overlay-color="#ff3158" style="background:#ff3158"></button><button type="button" data-overlay-color="#ffcc00" style="background:#ffcc00"></button><button type="button" data-overlay-color="#26d07c" style="background:#26d07c"></button><button type="button" data-overlay-color="#1687ff" style="background:#1687ff"></button><button type="button" data-overlay-color="#a855f7" style="background:#a855f7"></button></div><button type="button" data-overlay-save>✓</button></footer>';
      document.body.append(modal);
    }
    const video=modal.querySelector("video"),canvas=modal.querySelector("canvas"),ctx=canvas.getContext("2d");
    const state={color:"#fff",tool:"draw",history:[],redo:[]};
    const snapshot=()=>{state.history.push(canvas.toDataURL("image/png"));if(state.history.length>25)state.history.shift();state.redo=[];};
    const restore=data=>{const im=new Image();im.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);};im.src=data;};
    video.src=source.src;
    video.onloadedmetadata=()=>{
      const scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
      canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
      video.currentTime=Math.max(Number($s("storyTrimStart").value)||0,Math.min(Number($s("storyFrameScrub").value)||0,Number($s("storyTrimEnd").value)||video.duration));
      state.history=[canvas.toDataURL("image/png")];state.redo=[];modal.classList.add("open");
    };
    video.load();
    modal.querySelector("[data-overlay-cancel]").onclick=()=>modal.classList.remove("open");
    modal.querySelector("[data-overlay-clear]").onclick=()=>{snapshot();ctx.clearRect(0,0,canvas.width,canvas.height);};
    modal.querySelector("[data-overlay-undo]").onclick=()=>{if(state.history.length>1){state.redo.push(state.history.pop());restore(state.history[state.history.length-1]);}};
    modal.querySelector("[data-overlay-redo]").onclick=()=>{if(state.redo.length){const value=state.redo.pop();state.history.push(value);restore(value);}};
    modal.querySelectorAll("[data-overlay-tool]").forEach(b=>b.onclick=()=>{
      state.tool=b.dataset.overlayTool;modal.querySelectorAll("[data-overlay-tool]").forEach(x=>x.classList.toggle("active",x===b));
      if(state.tool==="text")openCanvasTextEditor(canvas,ctx,state,snapshot);
    });
    modal.querySelectorAll("[data-overlay-color]").forEach(b=>b.onclick=()=>{state.color=b.dataset.overlayColor;});
    modal.querySelector("[data-overlay-save]").onclick=()=>canvas.toBlob(blob=>{if(blob){editedOverlayFile=new File([blob],"story-overlay.png",{type:"image/png"});modal.classList.remove("open");if(typeof toast==="function")toast("Рисунок добавлен к видео");}},"image/png");
    let drawing=false;
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
    canvas.onpointerdown=e=>{if(state.tool!=="draw")return;drawing=true;canvas.setPointerCapture(e.pointerId);const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.strokeStyle=state.color;ctx.lineWidth=Number(modal.querySelector('input[type="range"]').value)*canvas.width/canvas.clientWidth;ctx.lineCap="round";ctx.lineJoin="round";};
    canvas.onpointermove=e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();};
    canvas.onpointerup=()=>{if(drawing){drawing=false;snapshot();}};
  }

  function openStoryPhotoEditor(file) {
    let modal=$s("storyPhotoEditor");
    if(!modal){
      modal=node("div","story-photo-editor");modal.id="storyPhotoEditor";
      modal.innerHTML='<header><button type="button" data-photo-cancel>‹ Назад</button><strong>Редактор истории</strong><button type="button" data-photo-clear>Очистить</button></header><canvas id="storyPhotoCanvas"></canvas><footer><button type="button" data-photo-undo>↶</button><button type="button" data-photo-redo>↷</button><button type="button" data-photo-tool="draw" class="active">Кисть</button><button type="button" data-photo-tool="text">Текст</button><label>Размер <input type="range" min="2" max="48" value="7"></label><div class="story-photo-colors"><button type="button" data-color="#fff" style="background:#fff"></button><button type="button" data-color="#ff3158" style="background:#ff3158"></button><button type="button" data-color="#ffcc00" style="background:#ffcc00"></button><button type="button" data-color="#26d07c" style="background:#26d07c"></button><button type="button" data-color="#1687ff" style="background:#1687ff"></button><button type="button" data-color="#a855f7" style="background:#a855f7"></button><button type="button" data-color="#111" style="background:#111"></button></div><button type="button" data-photo-save>✓</button></footer>';
      document.body.append(modal);
    }
    const canvas=$s("storyPhotoCanvas"),ctx=canvas.getContext("2d"),image=new Image();
    const state={color:"#fff",tool:"draw",history:[],redo:[]};
    const restore=data=>{const im=new Image();im.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);};im.src=data;};
    const snapshot=()=>{state.history.push(canvas.toDataURL());if(state.history.length>30)state.history.shift();state.redo=[];};
    modal.querySelector("[data-photo-cancel]").onclick=()=>modal.classList.remove("open");
    modal.querySelector("[data-photo-clear]").onclick=()=>{snapshot();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);};
    modal.querySelector("[data-photo-undo]").onclick=()=>{if(state.history.length>1){state.redo.push(state.history.pop());restore(state.history[state.history.length-1]);}};
    modal.querySelector("[data-photo-redo]").onclick=()=>{if(state.redo.length){const value=state.redo.pop();state.history.push(value);restore(value);}};
    modal.querySelectorAll("[data-photo-tool]").forEach(button=>button.onclick=()=>{
      state.tool=button.dataset.photoTool;
      modal.querySelectorAll("[data-photo-tool]").forEach(x=>x.classList.toggle("active",x===button));
      if(state.tool==="text")openCanvasTextEditor(canvas,ctx,state,snapshot);
    });
    modal.querySelectorAll("[data-color]").forEach(button=>button.onclick=()=>{state.color=button.dataset.color;});
    modal.querySelector("[data-photo-save]").onclick=()=>canvas.toBlob(blob=>{if(blob){editedMediaFile=new File([blob],"story-edited.jpg",{type:"image/jpeg"});$s("storyFileName").textContent=editedMediaFile.name+" · изменено";modal.classList.remove("open");}},"image/jpeg",.92);
    image.onload=()=>{
      const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);state.history=[canvas.toDataURL()];state.redo=[];modal.classList.add("open");
    };
    image.src=URL.createObjectURL(file);
    let drawing=false;
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
    canvas.onpointerdown=e=>{if(state.tool!=="draw")return;drawing=true;canvas.setPointerCapture(e.pointerId);const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.strokeStyle=state.color;ctx.lineWidth=Number(modal.querySelector('input[type="range"]').value)*canvas.width/canvas.clientWidth;ctx.lineCap="round";ctx.lineJoin="round";};
    canvas.onpointermove=e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();};
    canvas.onpointerup=()=>{if(drawing){drawing=false;snapshot();}};
  }
  $s("storyMediaFile").addEventListener("change",()=>{
    editedOverlayFile=null;
    const f=$s("storyMediaFile").files[0];editedMediaFile=null;
    if(f&&f.type.startsWith("image/"))openStoryPhotoEditor(f);
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
  $s("storyVideoEdit").addEventListener("click",()=>openStoryVideoOverlayEditor());


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
      file=editedMediaFile||$s("storyMediaFile").files[0];
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
      let overlayPath=null;
      if(file){
        const clean=(typeof safeMediaFilename==="function"?safeMediaFilename(file.name):file.name.replace(/[^a-z0-9._-]/gi,"_"));
        mediaPath=me.id+"/"+storyId+"__"+clean;
        const {error:uploadError}=await sb.storage.from("story-media").upload(mediaPath,file,{contentType:file.type,upsert:false});
        if(uploadError)throw uploadError;
      }
      if(editedOverlayFile){
        overlayPath=me.id+"/"+storyId+"__overlay.png";
        const {error:overlayError}=await sb.storage.from("story-media").upload(overlayPath,editedOverlayFile,{contentType:"image/png",upsert:false});
        if(overlayError)throw overlayError;
      }
        const {error}=await sb.from("stories").insert({
        id:storyId,user_id:me.id,story_type:storyType==="text"?"text":(file.type.startsWith("video/")?"video":"photo"),
        text,media_path:mediaPath,overlay_path:overlayPath,background:storyType==="text"?$s("storyBackground").value:null,
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
      const cleanup=[mediaPath,overlayPath].filter(Boolean);if(cleanup.length)await sb.storage.from("story-media").remove(cleanup);
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
        if(s.story_type==="video"){
          const video=node("video","");video.src=data.signedUrl;video.controls=false;video.autoplay=true;video.playsInline=true;
          video.addEventListener("loadedmetadata",()=>{const start=Math.max(0,Number(s.trim_start_seconds)||0);const end=Number(s.trim_end_seconds)||video.duration;try{video.currentTime=start;}catch(_){}video.addEventListener("timeupdate",()=>{if(video.currentTime>=end){video.pause();try{video.currentTime=start;video.play();}catch(_){}}});});
          content.append(video);
          if(s.overlay_path){const {data:overlay}=await sb.storage.from("story-media").createSignedUrl(s.overlay_path,3600);if(overlay?.signedUrl){const layer=node("img","story-video-overlay");layer.src=overlay.signedUrl;layer.alt="";content.append(layer);}}
        }
        else{const img=node("img","");img.src=data.signedUrl;img.alt="История";content.append(img);}
      }catch(e){content.append(node("div","story-media-error","Медиа недоступно"));}
      if(s.text)content.append(node("div","story-caption",s.text));
    }
    const bottom=$s("storyViewerBottom");bottom.innerHTML="";
    if(s.user_id===me.id){
      const {count:viewCount}=await sb.from("story_views").select("viewer_id",{count:"exact",head:true}).eq("story_id",s.id);
      const viewsButton=node("button","story-owner-views","◉ "+(viewCount||0)+" просмотров");
      viewsButton.type="button";
      viewsButton.addEventListener("click",()=>showStoryViewers(s));
      bottom.append(viewsButton);
      const {count:likeCount}=await sb.from("story_likes").select("user_id",{count:"exact",head:true}).eq("story_id",s.id);
      bottom.append(node("span","story-like-count","♥ "+(likeCount||0)));
      const menu=node("button","story-owner-menu","⋯");
      menu.type="button";menu.setAttribute("aria-label","Меню истории");
      menu.addEventListener("click",()=>openStoryOwnerMenu(s));
      $s("storyViewerAuthor").append(menu);
    }else{
      const status=node("span","story-viewer-status","Ответить на историю");
      const reply=node("button","story-reply","Ответить");
      reply.type="button";
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
      const like=node("button","story-like","♡");
      like.type="button";like.setAttribute("aria-label","Нравится");
      const {data:mineLike}=await sb.from("story_likes").select("story_id").eq("story_id",s.id).eq("user_id",me.id).maybeSingle();
      if(mineLike){like.classList.add("liked");like.textContent="♥";}
      like.addEventListener("click",async()=>{
        like.disabled=true;
        try{
          if(like.classList.contains("liked")){
            const {error}=await sb.from("story_likes").delete().eq("story_id",s.id).eq("user_id",me.id);
            if(error)throw error;like.classList.remove("liked");like.textContent="♡";
          }else{
            const {error}=await sb.from("story_likes").insert({story_id:s.id,user_id:me.id});
            if(error)throw error;like.classList.add("liked");like.textContent="♥";
          }
        }catch(e){if(typeof toast==="function")toast("Не удалось поставить отметку");}
        finally{like.disabled=false;}
      });
      const {data:existing}=await sb.from("story_views").select("story_id").eq("story_id",s.id).eq("viewer_id",me.id).maybeSingle();
      if(!existing)await sb.from("story_views").insert({story_id:s.id,viewer_id:me.id});
      bottom.append(status,reply,like);
    }
    $s("storyPrev").disabled=activeStoryIndex===0;
    $s("storyNext").disabled=activeStoryIndex===viewerStories.length-1;
  }

  async function showStoryViewers(story) {
    const {data:views,error}=await sb.from("story_views").select("viewer_id,viewed_at").eq("story_id",story.id).order("viewed_at",{ascending:false});
    if(error){if(typeof toast==="function")toast("Не удалось загрузить зрителей");return;}
    const ids=[...new Set((views||[]).map(v=>v.viewer_id).filter(id=>id!==me.id))];
    const {data:people}=ids.length?await sb.from("profiles").select("id,display_name,avatar_url").in("id",ids):{data:[]};
    const byId=new Map((people||[]).map(p=>[p.id,p]));
    let modal=$s("storyViewersModal");
    if(!modal){modal=node("div","story-viewers-modal");modal.id="storyViewersModal";modal.innerHTML='<section><header><strong>Просмотрели историю</strong><button type="button" aria-label="Закрыть">×</button></header><div class="story-viewers-list"></div></section>';document.body.append(modal);modal.querySelector("header button").onclick=()=>modal.classList.remove("open");}
    const list=modal.querySelector(".story-viewers-list");list.innerHTML="";
    ids.forEach(id=>{const p=byId.get(id)||{display_name:"Пользователь"};list.append(node("div","story-viewer-person",p.display_name));});
    if(!ids.length)list.append(node("p","","Пока никто не посмотрел"));
    modal.classList.add("open");
  }
  async function openStoryOwnerMenu(story) {
    const old=$s("storyOwnerMenuPopup");if(old){old.remove();return;}
    const popup=node("div","story-owner-menu-popup");popup.id="storyOwnerMenuPopup";
    const edit=node("button","","Изменить подпись");edit.type="button";
    const remove=node("button","danger","Удалить историю");remove.type="button";
    popup.append(edit,remove);$s("storyViewer").append(popup);
    edit.onclick=async()=>{
      popup.remove();
      const caption=prompt("Новая подпись:",story.text||"");
      if(caption===null)return;
      const {error}=await sb.from("stories").update({text:caption.slice(0,2000)}).eq("id",story.id).eq("user_id",me.id);
      if(error){if(typeof toast==="function")toast("Не удалось изменить историю");return;}
      story.text=caption.slice(0,2000);await renderViewerStory();
      if(typeof toast==="function")toast("История обновлена");
    };
    remove.onclick=()=>{popup.remove();deleteStory(story);};
    setTimeout(()=>document.addEventListener("pointerdown",function closeMenu(e){if(!popup.contains(e.target)){popup.remove();document.removeEventListener("pointerdown",closeMenu);}}),0);
  }
  async function deleteStory(s){
    if(!confirm("Удалить эту историю?"))return;
    const {error}=await sb.from("stories").delete().eq("id",s.id).eq("user_id",me.id);
    if(error){if(typeof toast==="function")toast("Не удалось удалить историю");return;}
    const mediaToRemove=[s.media_path,s.overlay_path].filter(Boolean);if(mediaToRemove.length)await sb.storage.from("story-media").remove(mediaToRemove);
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