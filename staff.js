// MessageRoom: staff moderation and support center
(() => {
  const $id = (id) => document.getElementById(id);
  const staffOverlay = $id("staffToolsOverlay");
  const supportOverlay = $id("supportOverlay");
  let targetUserId = null;
  let targetUsername = "";
  let userTicketId = null;
  let currentUserTicket = null;
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
  const isSupportStaff = () => isOwner() || isAdmin() || isModerator();
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
  $id("sendPersonalNotice").addEventListener("click", async () => {
    if (!targetUserId) { showMsg("staffTargetInfo","Сначала выбери пользователя.",true); return; }
    const message = $id("personalNoticeText").value.trim();
    if (!message) { showMsg("personalNoticeMsg","Напиши текст уведомления.",true); return; }
    const btn = $id("sendPersonalNotice"); btn.disabled = true;
    const { error } = await sb.rpc("staff_send_user_notice", { target: targetUserId, message_text: message });
    btn.disabled = false;
    if (error) { showMsg("personalNoticeMsg","Не удалось отправить: "+error.message,true); return; }
    $id("personalNoticeText").value = "";
    showMsg("personalNoticeMsg","Персональное уведомление отправлено.");
    toast("Сообщение отправлено пользователю");
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
    $id("supportCategory").value="";updateSupportCategoryFields();
    document.querySelectorAll("[data-support-category]").forEach(b=>b.classList.remove("active"));
    loadMyTickets();
  }
  function supportStaffView(){
    $id("supportTitle").textContent="Поддержка — обращения";
    $id("supportUserView").style.display="none";
    $id("supportStaffView").style.display="block";
    const cats=(isOwner()||isModerator())?["complaint","appeal","question","bug","other"]:["question","bug","other"];
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
    if(!me)return;
    if(typeof closeMenus==="function")closeMenus();
    supportOverlay.classList.add("open");
    supportHomeView();
    subscribeSupport();
  }
  function openSupportStaff(){
    if(!isSupportStaff())return;
    if(typeof closeMenus==="function")closeMenus();
    supportOverlay.classList.add("open");
    supportStaffView();
    $id("supportFeedReportsBtn").style.display = (window.appStatus.is_owner || window.appStatus.is_moderator) ? "block" : "none";
    subscribeSupport();
  }
  window.openSupportUser = openSupportUser;
  $id("mmSupport").addEventListener("click",openSupportUser);
  $id("settingsSupportBtn")?.addEventListener("click",openSupportUser);
  $id("railSupport").addEventListener("click",openSupportStaff);
  $id("supportClose").addEventListener("click",closeSupport);
  supportOverlay.addEventListener("click",e=>{if(e.target===supportOverlay)closeSupport();});
  function closeSupport(){
    supportOverlay.classList.remove("open");
    if(supportChannel){sb.removeChannel(supportChannel);supportChannel=null;}
    userTicketId=null;staffTicketId=null;currentUserTicket=null;
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
    if(!f){$id("supportFields").style.display="none";return;}
    $id("supportFields").style.display="block";
    $id("supportSubjectLabel").textContent=f.subject;
    $id("supportSubject").placeholder=f.subjectHint;
    if ($id("supportCategory").value === "complaint" && !$id("supportSubject").value.trim()) $id("supportSubject").value = "@";
    $id("supportDescriptionLabel").textContent=f.desc;
  }
  $id("supportSubject").addEventListener("input", () => {
    if ($id("supportCategory").value !== "complaint") return;
    const field = $id("supportSubject");
    if (!field.value.startsWith("@")) field.value = "@" + field.value.replace(/^@+/, "");
  });
  $id("supportCategory").addEventListener("change",()=>{
    updateSupportCategoryFields();
    document.querySelectorAll("[data-support-category]").forEach(b=>b.classList.toggle("active",b.dataset.supportCategory===$id("supportCategory").value));
  });
  document.querySelectorAll("[data-support-category]").forEach(button=>button.addEventListener("click",()=>{
    $id("supportCategory").value=button.dataset.supportCategory;
    updateSupportCategoryFields();
    document.querySelectorAll("[data-support-category]").forEach(b=>b.classList.toggle("active",b===button));
  }));
  updateSupportCategoryFields();

  $id("supportCreate").addEventListener("click",async()=>{
    const category=$id("supportCategory").value;
    if(!category){showMsg("supportCreateMsg","Сначала выбери категорию обращения.",true);return;}
    let subject=$id("supportSubject").value.trim();
    const description=$id("supportDescription").value.trim();
    if(category==="complaint"){
      const username=subject.replace(/^@+/,"").trim().toLowerCase();
      if(!username){showMsg("supportCreateMsg","Укажи юзернейм пользователя после @.",true);return;}
      const {data:target,error:lookupError}=await sb.from("profiles").select("id,username").ilike("username",username).maybeSingle();
      if(lookupError || !target){showMsg("supportCreateMsg","Пользователь @"+username+" не найден. Проверь юзернейм.",true);return;}
      subject="@"+target.username;
    }
    if(!subject||!description){showMsg("supportCreateMsg","Заполни тему и описание.",true);return;}
    const btn=$id("supportCreate");btn.disabled=true;showMsg("supportCreateMsg","Создаём обращение…");
    const {data,error}=await sb.rpc("support_create_ticket",{ticket_category:category,ticket_subject:subject,ticket_description:description});
    if(error){btn.disabled=false;showMsg("supportCreateMsg","Ошибка: "+error.message,true);return;}
    const file=$id("supportInitialFile")?.files?.[0]||null;
    $id("supportSubject").value="";$id("supportDescription").value="";$id("supportInitialFile").value="";
    if(file){
      if(file.size>15*1024*1024){toast("Обращение создано, но файл больше 15 МБ");}
      else {
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-90);
        const path=data+"/"+me.id+"/"+Date.now()+"_"+safeName;
        const {error:upErr}=await sb.storage.from("support-attachments").upload(path,file,{upsert:false});
        if(upErr)toast("Обращение создано, файл не загрузился: "+upErr.message);
        else {const {error:msgErr}=await sb.rpc("support_send_message",{ticket:data,message_body:"",internal_note:false,file_path:path,file_name:file.name,file_type:file.type});if(msgErr)toast("Файл загружен, но не прикреплён: "+msgErr.message);}
      }
    }
    btn.disabled=false;
    userTicketId=data;currentUserTicket={id:data,category,subject,status:"open"};
    $id("supportHome").style.display="none";$id("supportUserChat").style.display="block";
    renderUserTicketHeader();
    await loadTicketMessages(data,"supportUserMessages");
    toast("Обращение отправлено");
  });
  $id("supportUserBack").addEventListener("click",()=>{
    userTicketId=null;currentUserTicket=null;$id("supportHome").style.display="block";$id("supportUserChat").style.display="none";loadMyTickets();
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
  function renderUserTicketHeader(){
    const title=$id("supportUserTicketTitle");title.innerHTML="";
    const text=document.createElement("span");text.textContent=categoryLabel(currentUserTicket.category)+" · "+currentUserTicket.subject+" · "+ticketStatus(currentUserTicket.status);title.append(text);
    if(currentUserTicket.status==="closed"){
      const reopen=document.createElement("button");reopen.className="link-btn";reopen.textContent="Вернуть в работу";
      reopen.addEventListener("click",async()=>{const {error}=await sb.rpc("support_reopen_ticket",{ticket:currentUserTicket.id});if(error){toast("Ошибка: "+error.message);return;}currentUserTicket.status="open";renderUserTicketHeader();$id("supportUserSend").disabled=false;toast("Обращение снова открыто");});title.append(reopen);
    }
    $id("supportUserSend").disabled=currentUserTicket.status==="closed";
  }
  async function openUserTicket(ticket){
    userTicketId=ticket.id;currentUserTicket=ticket;$id("supportHome").style.display="none";$id("supportUserChat").style.display="block";
    renderUserTicketHeader();
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
    const staffMode=$id("supportStaffView").style.display!=="none";
    await loadTicketMessages(ticketId,staffMode?"supportStaffMessages":"supportUserMessages",staffMode);
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
      if(t.category==="complaint"){
        strong.classList.add("support-complaint-user");
        strong.title="Открыть профиль пользователя";
        strong.addEventListener("click",e=>{
          e.stopPropagation();
          const username=String(t.subject||"").replace(/^@+/,"").trim();
          if(username) openSupportReportedUser(username);
        });
      }
      const small=document.createElement("small");
      if(who){
        small.append(document.createTextNode("Отправитель: "));
        const sender=document.createElement("span");
        sender.className="support-sender-link";sender.textContent="@"+who.username;
        sender.title="Открыть профиль отправителя";
        sender.addEventListener("click",e=>{e.stopPropagation();openSupportReportedUser(who.username);});
        small.append(sender);
      }else small.textContent="Отправитель: Пользователь";
      small.append(document.createTextNode(" · "+ticketStatus(t.status)+" · "+new Date(t.updated_at).toLocaleString("ru-RU")));
      b.append(strong,small);b.addEventListener("click",()=>openStaffTicket(t));list.append(b);
    });
  }
  async function openSupportReportedUser(username){
    const {data,error}=await sb.from("profiles").select("id,username").ilike("username",username).maybeSingle();
    if(error||!data){toast("Пользователь не найден");return;}
    if(typeof startChatWith==="function"){
      await startChatWith(data.id);
      if(typeof openInfo==="function")openInfo();
    }
  }
  async function openStaffTicket(ticket){
    staffTicketId=ticket.id;
    $id("supportStaffSend").disabled=ticket.status==="closed"&&!isOwner();
    $id("supportStaffTicketTitle").textContent=categoryLabel(ticket.category)+" · "+ticket.subject+" · "+ticketStatus(ticket.status);
    await loadTicketMessages(ticket.id,"supportStaffMessages",true);
    renderSupportOwnerActions(ticket);
    loadStaffTickets();
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
  if(me)loadMyModerationStatus();
})();
