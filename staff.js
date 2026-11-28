// MessageRoom: staff moderation and support center
(() => {
  const $id = (id) => document.getElementById(id);
  const staffOverlay = $id("staffToolsOverlay");
  const supportOverlay = $id("supportOverlay");
  let targetUserId = null;
  let targetUsername = "";
  let userTicketId = null;
  let staffTicketId = null;
  let supportChannel = null;
  let supportCategory = "complaint";
  let supportTicketCache = [];
  let staffTicketCache = [];
  let supportProfiles = {};
  let staffAssignees = [];

  const isOwner = () => !!window.appStatus?.is_owner;
  const isAdmin = () => !!window.appStatus?.is_admin_role;
  const isModerator = () => !!window.appStatus?.is_moderator;
  const isSupportStaff = () => isOwner() || isAdmin();
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function showMsg(id, text, error=false) {
    const node = $id(id);
    if (!node) return;
    node.textContent = text;
    node.className = "settings-msg" + (error ? " error" : "");
  }

  function refreshStaffToolVisibility() {
    $id("warningControls").style.display = (isOwner() || isModerator()) ? "block" : "none";
    $id("restrictionControls").style.display = (isOwner() || isAdmin()) ? "block" : "none";
    $id("staffToolsTitle").textContent = isModerator() ? "Предупреждение" : "Временное ограничение";
  }

  function openStaffAction(userId=null, username="") {
    if (!(isOwner() || isAdmin() || isModerator())) return;
    targetUserId = userId || null;
    targetUsername = username || "";
    $id("staffTargetSearch").value = username ? "@" + username : "";
    $id("staffTargetSearch").disabled = !!userId;
    $id("staffTargetInfo").textContent = userId ? "Выбран пользователь @" + (username || "пользователь") : "Введи точный юзернейм пользователя.";
    $id("warningReason").value = "Спам или навязчивая реклама";
    $id("warningCustom").value = "";
    $id("warningCustom").style.display = "none";
    $id("restrictionHours").value = "24";
    $id("restrictionReason").value = "";
    refreshStaffToolVisibility();
    staffOverlay.classList.add("open");
  }
  window.openStaffAction = openStaffAction;

  $id("staffTargetSearch").addEventListener("change", async () => {
    const username = $id("staffTargetSearch").value.trim().replace(/^@/,"");
    if (!username) { targetUserId=null; showMsg("staffTargetInfo","Введи точный юзернейм.",true); return; }
    const {data,error}=await sb.from("profiles").select("id,username,display_name").eq("username",username).maybeSingle();
    if(error || !data) { targetUserId=null; showMsg("staffTargetInfo","Пользователь не найден.",true); return; }
    targetUserId=data.id; targetUsername=data.username;
    showMsg("staffTargetInfo","Выбран: "+(data.display_name||"Пользователь")+" · @"+data.username);
  });
  $id("warningReason").addEventListener("change", () => {
    $id("warningCustom").style.display = $id("warningReason").value === "custom" ? "block" : "none";
  });
  $id("issueWarning").addEventListener("click", async () => {
    if (!targetUserId) { showMsg("staffTargetInfo","Сначала выбери пользователя.",true); return; }
    const selected=$id("warningReason").value;
    const reason=selected==="custom" ? $id("warningCustom").value.trim() : selected;
    if(!reason) { showMsg("staffTargetInfo","Укажи причину предупреждения.",true); return; }
    const btn=$id("issueWarning");btn.disabled=true;
    const {error}=await sb.rpc("staff_issue_warning",{target:targetUserId,warning_reason:reason});
    btn.disabled=false;
    if(error){showMsg("staffTargetInfo","Не удалось выдать предупреждение: "+error.message,true);return;}
    staffOverlay.classList.remove("open");toast("Предупреждение выдано");
  });
  $id("issueRestriction").addEventListener("click", async () => {
    if (!targetUserId) { showMsg("staffTargetInfo","Сначала выбери пользователя.",true); return; }
    const hours=Number($id("restrictionHours").value);
    const reason=$id("restrictionReason").value.trim();
    if(!Number.isInteger(hours)||hours<1||hours>24){showMsg("staffTargetInfo","Срок должен быть от 1 до 24 часов.",true);return;}
    if(!reason){showMsg("staffTargetInfo","Укажи причину ограничения.",true);return;}
    const btn=$id("issueRestriction");btn.disabled=true;
    const {error}=await sb.rpc("admin_set_restriction",{
      target:targetUserId,kind:$id("restrictionType").value,duration_hours:hours,restriction_reason:reason
    });
    btn.disabled=false;
    if(error){showMsg("staffTargetInfo","Не удалось применить ограничение: "+error.message,true);return;}
    staffOverlay.classList.remove("open");toast("Ограничение применено");
  });
  $id("staffToolsClose").addEventListener("click",()=>staffOverlay.classList.remove("open"));
  staffOverlay.addEventListener("click",e=>{if(e.target===staffOverlay)staffOverlay.classList.remove("open");});
  $id("railStaff").addEventListener("click",()=>openStaffAction());

  async function loadMyModerationStatus() {
    if (!window.me) return;
    const {data,error}=await sb.rpc("get_my_moderation_status");
    const list=$id("myModerationList");
    if(!list)return;
    list.innerHTML="";
    if(error){list.textContent="Не удалось загрузить данные.";return;}
    const warnings=data?.warnings||[], restrictions=data?.restrictions||[];
    if(!warnings.length&&!restrictions.length){list.textContent="Активных ограничений и предупреждений нет.";return;}
    warnings.forEach(w=>{
      const item=document.createElement("div");item.className="moderation-status-item";
      item.textContent="Предупреждение: "+w.reason;
      const small=document.createElement("small");small.textContent=new Date(w.created_at).toLocaleString("ru-RU");item.append(small);list.append(item);
    });
    restrictions.forEach(r=>{
      const labels={posts:"Запрет публикаций",comments:"Запрет комментариев",media:"Запрет загрузки фото, видео и аудио"};
      const item=document.createElement("div");item.className="moderation-status-item";
      item.textContent=(labels[r.type]||r.type)+": "+r.reason;
      const small=document.createElement("small");small.textContent="Действует до "+new Date(r.expires_at).toLocaleString("ru-RU");item.append(small);list.append(item);
    });
  }
  window.refreshMyModerationStatus=loadMyModerationStatus;
  $id("railMe").addEventListener("click",()=>setTimeout(loadMyModerationStatus,100));
  document.querySelectorAll('[data-go="scrAccount"]').forEach(b=>b.addEventListener("click",()=>setTimeout(loadMyModerationStatus,100)));

  function categoryLabel(cat) {
    return ({complaint:"Жалоба",appeal:"Апелляция",question:"Вопрос",bug:"Ошибка",other:"Другое"})[cat]||cat;
  }
  function ticketStatus(status){return status==="closed"?"Закрыто":"Открыто";}
  function supportHomeView(){
    $id("supportTitle").textContent="Центр поддержки";
    $id("supportUserView").style.display="block";
    $id("supportStaffView").style.display="none";
    $id("supportHome").style.display="block";
    $id("supportUserChat").style.display="none";
    loadMyTickets();
  }
  function supportStaffView(){
    $id("supportTitle").textContent="Поддержка — обращения";
    $id("supportUserView").style.display="none";
    $id("supportStaffView").style.display="block";
    const cats=isOwner()?["complaint","appeal","question","bug","other"]:["question","bug","other"];
    $id("supportCategoryTabs").innerHTML="";
    cats.forEach((cat,i)=>{
      const b=document.createElement("button");b.textContent=categoryLabel(cat);b.dataset.category=cat;
      if(i===0)b.classList.add("active");
      b.addEventListener("click",()=>{
        supportCategory=cat;
        $id("supportCategoryTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));
        loadStaffTickets();
      });
      $id("supportCategoryTabs").append(b);
    });
    supportCategory=cats[0];
    loadStaffTickets();
    if(isOwner())loadStaffAssignees();
  }
  function openSupportUser(){
    if(!window.me)return;
    supportOverlay.classList.add("open");
    supportHomeView();
    subscribeSupport();
  }
  function openSupportStaff(){
    if(!isSupportStaff())return;
    supportOverlay.classList.add("open");
    supportStaffView();
    subscribeSupport();
  }
  $id("mmSupport").addEventListener("click",openSupportUser);
  $id("railSupport").addEventListener("click",openSupportStaff);
  $id("supportClose").addEventListener("click",closeSupport);
  supportOverlay.addEventListener("click",e=>{if(e.target===supportOverlay)closeSupport();});
  function closeSupport(){
    supportOverlay.classList.remove("open");
    if(supportChannel){sb.removeChannel(supportChannel);supportChannel=null;}
    userTicketId=null;staffTicketId=null;
  }
  function subscribeSupport(){
    if(supportChannel)return;
    supportChannel=sb.channel("support-center-"+me.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"support_tickets"},()=>{
        if($id("supportOverlay").classList.contains("open")){
          if($id("supportStaffView").style.display!=="none")loadStaffTickets();
          else if($id("supportUserChat").style.display==="none")loadMyTickets();
        }
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"support_messages"},payload=>{
        const ticketId=payload.new?.ticket_id||payload.old?.ticket_id;
        if(ticketId && (ticketId===userTicketId||ticketId===staffTicketId)) {
          if(userTicketId)loadTicketMessages(userTicketId,"supportUserMessages");
          if(staffTicketId)loadTicketMessages(staffTicketId,"supportStaffMessages",true);
        }
      }).subscribe();
  }

  const catFields={
    complaint:{subject:"Юзернейм нарушителя",subjectHint:"@username",desc:"Опиши нарушение, где оно произошло и приложи доказательства"},
    appeal:{subject:"Какое наказание обжалуешь",subjectHint:"Например: запрет комментариев",desc:"Почему считаешь наказание ошибочным?"},
    question:{subject:"Тема вопроса",subjectHint:"Кратко сформулируй вопрос",desc:"Подробно опиши, что хочешь узнать"},
    bug:{subject:"Где произошла ошибка",subjectHint:"Например: лента публикаций",desc:"Что ожидалось и что произошло?"},
    other:{subject:"Тема обращения",subjectHint:"Краткая тема",desc:"Опиши, с чем нужна помощь"}
  };
  function updateSupportCategoryFields(){
    const f=catFields[$id("supportCategory").value];
    $id("supportSubjectLabel").textContent=f.subject;
    $id("supportSubject").placeholder=f.subjectHint;
    $id("supportDescriptionLabel").textContent=f.desc;
  }
  $id("supportCategory").addEventListener("change",updateSupportCategoryFields);
  updateSupportCategoryFields();

  $id("supportCreate").addEventListener("click",async()=>{
    const category=$id("supportCategory").value;
    const subject=$id("supportSubject").value.trim();
    const description=$id("supportDescription").value.trim();
    if(!subject||!description){showMsg("supportCreateMsg","Заполни тему и описание.",true);return;}
    const btn=$id("supportCreate");btn.disabled=true;showMsg("supportCreateMsg","Создаём обращение…");
    const {data,error}=await sb.rpc("support_create_ticket",{ticket_category:category,ticket_subject:subject,ticket_description:description});
    if(error){btn.disabled=false;showMsg("supportCreateMsg","Ошибка: "+error.message,true);return;}
    const file=$id("supportUserFile")?.files?.[0]||null;
    $id("supportSubject").value="";$id("supportDescription").value="";
    if(file)await uploadSupportFile(data,file,"supportUserReply","supportUserFile");
    btn.disabled=false;
    userTicketId=data;
    $id("supportHome").style.display="none";$id("supportUserChat").style.display="block";
    $id("supportUserTicketTitle").textContent=categoryLabel(category)+" · "+subject;
    await loadTicketMessages(data,"supportUserMessages");
    toast("Обращение отправлено");
  });
  $id("supportUserBack").addEventListener("click",()=>{
    userTicketId=null;$id("supportHome").style.display="block";$id("supportUserChat").style.display="none";loadMyTickets();
  });
  async function loadMyTickets(){
    const list=$id("mySupportTickets");list.innerHTML="Загрузка…";
    const {data,error}=await sb.from("support_tickets").select("id,category,subject,status,updated_at").order("updated_at",{ascending:false}).limit(50);
    list.innerHTML="";
    if(error){list.textContent="Не удалось загрузить обращения: "+error.message;return;}
    if(!data?.length){list.textContent="Обращений пока нет.";return;}
    data.forEach(t=>{
      const b=document.createElement("button");b.className="support-ticket";
      const strong=document.createElement("strong");strong.textContent=categoryLabel(t.category)+" · "+t.subject;
      const small=document.createElement("small");small.textContent=ticketStatus(t.status)+" · "+new Date(t.updated_at).toLocaleString("ru-RU");
      b.append(strong,small);b.addEventListener("click",()=>openUserTicket(t));list.append(b);
    });
  }
  async function openUserTicket(ticket){
    userTicketId=ticket.id;$id("supportHome").style.display="none";$id("supportUserChat").style.display="block";
    $id("supportUserTicketTitle").textContent=categoryLabel(ticket.category)+" · "+ticket.subject+" · "+ticketStatus(ticket.status);
    await loadTicketMessages(ticket.id,"supportUserMessages");
  }

  async function uploadSupportFile(ticketId,file,textareaId,fileInputId){
    if(file.size>15*1024*1024){toast("Файл больше 15 МБ");return false;}
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-90);
    const path=ticketId+"/"+me.id+"/"+Date.now()+"_"+safeName;
    const {error:uploadError}=await sb.storage.from("support-attachments").upload(path,file,{upsert:false});
    if(uploadError){toast("Не удалось загрузить файл: "+uploadError.message);return false;}
    const body=$id(textareaId).value.trim();
    const {error}=await sb.rpc("support_send_message",{
      ticket:ticketId,message_body:body,internal_note:false,file_path:path,file_name:file.name,file_type:file.type
    });
    if(error){toast("Файл загружен, но сообщение не отправлено: "+error.message);return false;}
    $id(textareaId).value="";$id(fileInputId).value="";
    return true;
  }

  async function loadTicketMessages(ticketId,containerId,staff=false){
    const box=$id(containerId);box.innerHTML="Загрузка…";
    const {data,error}=await sb.from("support_messages").select("id,sender_id,body,is_internal,created_at,attachment_path,attachment_name")
      .eq("ticket_id",ticketId).order("created_at",{ascending:true}).limit(200);
    box.innerHTML="";
    if(error){box.textContent="Не удалось загрузить переписку: "+error.message;return;}
    const ids=[...new Set((data||[]).map(m=>m.sender_id).filter(Boolean))];
    if(ids.length){
      const {data:people}=await sb.from("profiles").select("id,display_name,username").in("id",ids);
      (people||[]).forEach(p=>supportProfiles[p.id]=p);
    }
    for(const m of data||[]){
      const node=document.createElement("div");
      node.className="support-message"+(m.sender_id===me.id?" mine":"")+(m.is_internal?" internal":"");
      const who=m.is_internal?"Внутренняя заметка":(m.sender_id===me.id?"Вы":(supportProfiles[m.sender_id]?.display_name||"Сотрудник"));
      const body=document.createElement("div");body.textContent=(m.is_internal?"[ВНУТРЕННЕЕ] ":"")+m.body;
      node.append(body);
      if(m.attachment_path){
        const {data:signed}=await sb.storage.from("support-attachments").createSignedUrl(m.attachment_path,3600);
        if(signed?.signedUrl){const a=document.createElement("a");a.href=signed.signedUrl;a.target="_blank";a.rel="noopener";a.textContent=m.attachment_name||"Открыть вложение";node.append(a);}
      }
      const small=document.createElement("small");small.textContent=who+" · "+new Date(m.created_at).toLocaleString("ru-RU");node.append(small);
      box.append(node);
    }
    box.scrollTop=box.scrollHeight;
  }

  async function sendSupportMessage(ticketId,textareaId,fileInputId,internal=false){
    const body=$id(textareaId).value.trim(),file=$id(fileInputId).files[0]||null;
    if(!body&&!file)return;
    const btn=internal?$id("supportStaffSend"):$id("supportUserSend");btn.disabled=true;
    if(file){
      if(file.size>15*1024*1024){toast("Файл больше 15 МБ");btn.disabled=false;return;}
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-90);
      const path=ticketId+"/"+me.id+"/"+Date.now()+"_"+safeName;
      const {error:upErr}=await sb.storage.from("support-attachments").upload(path,file,{upsert:false});
      if(upErr){toast("Не удалось загрузить файл: "+upErr.message);btn.disabled=false;return;}
      const {error}=await sb.rpc("support_send_message",{
        ticket:ticketId,message_body:body,internal_note:internal,file_path:path,file_name:file.name,file_type:file.type
      });
      if(error)toast("Ошибка: "+error.message);
    }else{
      const {error}=await sb.rpc("support_send_message",{ticket:ticketId,message_body:body,internal_note:internal});
      if(error)toast("Ошибка: "+error.message);
    }
    if(!internal){$id(textareaId).value="";$id(fileInputId).value="";}
    else {$id(textareaId).value="";$id("supportInternal").checked=false;}
    btn.disabled=false;
    await loadTicketMessages(ticketId,internal||isSupportStaff()?"supportStaffMessages":"supportUserMessages",isSupportStaff());
  }
  $id("supportUserSend").addEventListener("click",()=>userTicketId&&sendSupportMessage(userTicketId,"supportUserReply","supportUserFile",false));
  $id("supportStaffSend").addEventListener("click",()=>staffTicketId&&sendSupportMessage(staffTicketId,"supportStaffReply","supportStaffFile",$id("supportInternal").checked));

  async function loadStaffTickets(){
    const list=$id("supportStaffTickets");list.innerHTML="Загрузка…";
    let q=sb.from("support_tickets").select("id,user_id,category,subject,description,status,assigned_to,created_at,updated_at").eq("category",supportCategory).order("updated_at",{ascending:false}).limit(100);
    const {data,error}=await q;
    list.innerHTML="";
    if(error){list.textContent="Ошибка загрузки: "+error.message;return;}
    staffTicketCache=data||[];
    if(!staffTicketCache.length){list.textContent="Обращений в этой категории нет.";return;}
    const ids=[...new Set(staffTicketCache.map(t=>t.user_id))];
    const {data:people}=await sb.from("profiles").select("id,display_name,username").in("id",ids);
    (people||[]).forEach(p=>supportProfiles[p.id]=p);
    staffTicketCache.forEach(t=>{
      const b=document.createElement("button");b.className="support-ticket"+(t.id===staffTicketId?" active":"");
      const who=supportProfiles[t.user_id];
      const strong=document.createElement("strong");strong.textContent=t.subject;
      const small=document.createElement("small");small.textContent=(who?"@"+who.username:"Пользователь")+" · "+ticketStatus(t.status)+" · "+new Date(t.updated_at).toLocaleString("ru-RU");
      b.append(strong,small);b.addEventListener("click",()=>openStaffTicket(t));list.append(b);
    });
  }
  async function openStaffTicket(ticket){
    staffTicketId=ticket.id;
    $id("supportStaffTicketTitle").textContent=categoryLabel(ticket.category)+" · "+ticket.subject+" · "+ticketStatus(ticket.status);
    await loadTicketMessages(ticket.id,"supportStaffMessages",true);
    await loadInternalNotes(ticket.id);
    renderSupportOwnerActions(ticket);
    loadStaffTickets();
  }
  async function loadInternalNotes(ticketId){
    const box=$id("supportInternalNotes");box.innerHTML="";
    if(!(isOwner()||isAdmin()))return;
    const {data,error}=await sb.from("support_internal_notes").select("body,created_at,author_id").eq("ticket_id",ticketId).order("created_at");
    if(error)return;
    if(data?.length){const title=document.createElement("strong");title.textContent="Внутренние заметки";box.append(title);
      data.forEach(n=>{const p=document.createElement("div");p.textContent=n.body+" · "+new Date(n.created_at).toLocaleString("ru-RU");box.append(p);});}
  }
  function renderSupportOwnerActions(ticket){
    const box=$id("supportOwnerActions");box.innerHTML="";
    if(isOwner()){
      const close=document.createElement("button");close.textContent=ticket.status==="closed"?"Обращение закрыто":"Закрыть обращение";
      close.disabled=ticket.status==="closed";
      close.addEventListener("click",async()=>{
        const {error}=await sb.rpc("support_set_ticket_status",{ticket:ticket.id,new_status:"closed"});
        if(error){toast("Ошибка: "+error.message);return;}await openStaffTicket({...ticket,status:"closed"});loadStaffTickets();
      });box.append(close);
      const assign=document.createElement("select");
      const none=document.createElement("option");none.value="";none.textContent="Без ответственного";assign.append(none);
      staffAssignees.forEach(u=>{const o=document.createElement("option");o.value=u.id;o.textContent=(u.role==="admin"?"Администратор":u.role==="moderator"?"Модератор":"Владелец")+" · @"+u.username;assign.append(o);});
      assign.value=ticket.assigned_to||"";
      assign.addEventListener("change",async()=>{
        const {error}=await sb.rpc("support_assign_ticket",{ticket:ticket.id,staff_user:assign.value||null});
        if(error)toast("Не удалось назначить: "+error.message);else toast("Ответственный обновлён");
      });box.append(assign);
    }
    if(ticket.status==="closed" && (isOwner()||isAdmin())){
      const reopen=document.createElement("button");reopen.textContent="Вернуть в работу";
      reopen.addEventListener("click",async()=>{const {error}=await sb.rpc("support_reopen_ticket",{ticket:ticket.id});if(error)toast("Ошибка: "+error.message);else{toast("Обращение открыто");await openStaffTicket({...ticket,status:"open"});loadStaffTickets();}});
      box.append(reopen);
    }
  }
  async function loadStaffAssignees(){
    const {data,error}=await sb.rpc("owner_search_users",{q:""});
    if(error)return;
    staffAssignees=(data||[]).filter(u=>["owner","admin","moderator"].includes(u.role));
  }

  $id("supportCategory").addEventListener("change",updateSupportCategoryFields);
  updateSupportCategoryFields();
  if(window.appStatus?.is_owner || window.appStatus?.is_admin_role || window.appStatus?.is_moderator)refreshStaffToolVisibility();
})();
