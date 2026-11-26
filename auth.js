// ---------- Подключение к Supabase ----------
const SUPABASE_URL = "https://dcjttptbuiaxkwiagjtm.supabase.co";
const SUPABASE_KEY = "sb_publishable_tgAuOvM_lrb4goVzsGABXg_KLV_WPLh";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Элементы экрана входа ----------
const authScreen = document.getElementById("authScreen");
const authTitle = document.getElementById("authTitle");
const authUsernameWrap = document.getElementById("authUsernameWrap");
const authUsername = document.getElementById("authUsername");
const authHandleWrap = document.getElementById("authHandleWrap");
const authHandle = document.getElementById("authHandle");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const authSubmit = document.getElementById("authSubmit");
const authSwitch = document.getElementById("authSwitch");
const accountInfo = document.getElementById("accountInfo");
const logoutBtn = document.getElementById("logoutBtn");

let authMode = "login";     // login (вход), register (регистрация), setup (выбор юзернейма)
let pendingUser = null;     // кому нужно выбрать юзернейм
let pendingProfile = null;
let activeUserId = null;

const HANDLE_RULE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const HANDLE_HELP = "Юзернейм: 5–32 символа, латиница, цифры и _, первая — буква";

function setAuthMode(mode) {
  authMode = mode;
  const reg = mode === "register";
  const setup = mode === "setup";
  authUsernameWrap.style.display = reg ? "block" : "none";
  authHandleWrap.style.display = reg || setup ? "block" : "none";
  authEmail.style.display = setup ? "none" : "block";
  authPassword.style.display = setup ? "none" : "block";
  authTitle.textContent = setup ? "Придумайте юзернейм" : reg ? "Регистрация" : "Вход";
  authSubmit.textContent = setup ? "Сохранить" : reg ? "Зарегистрироваться" : "Войти";
  authSwitch.textContent = setup ? "Выйти из аккаунта"
    : reg ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться";
  authError.textContent = "";
}
function showAuth() { authScreen.style.display = "flex"; }

function translateError(message) {
  if (message.includes("Invalid login credentials")) return "Неверная почта или пароль";
  if (message.includes("already registered")) return "Эта почта уже зарегистрирована";
  if (message.includes("at least 6")) return "Пароль должен быть не короче 6 символов";
  if (message.includes("valid email") || message.includes("invalid format")) return "Введите настоящую почту";
  if (message.includes("Database error")) return "Не удалось создать аккаунт (возможно, юзернейм занят)";
  return message;
}

// Проверка юзернейма: формат и уникальность
async function checkHandle(handle) {
  if (!HANDLE_RULE.test(handle)) return HANDLE_HELP;
  const { data, error } = await sb.rpc("username_available", { handle: handle });
  if (error) return translateError(error.message);
  if (!data) return "Этот юзернейм уже занят";
  return "";
}

async function doLogin() {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) { authError.textContent = "Введите почту и пароль"; return; }
  const { error } = await sb.auth.signInWithPassword({ email: email, password: password });
  if (error) authError.textContent = translateError(error.message);
}

async function doRegister() {
  const name = authUsername.value.trim();
  const handle = authHandle.value.trim().replace(/^@/, "");
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!name) { authError.textContent = "Введите имя"; return; }
  if (!email || !password) { authError.textContent = "Введите почту и пароль"; return; }
  const problem = await checkHandle(handle);
  if (problem) { authError.textContent = problem; return; }
  const { data, error } = await sb.auth.signUp({
    email: email,
    password: password,
    options: { data: { display_name: name, username: handle } }
  });
  if (error) { authError.textContent = translateError(error.message); return; }
  if (!data.session) {
    authError.textContent = "Мы отправили письмо для подтверждения. Подтвердите почту и войдите.";
  }
}

async function doSetup() {
  const handle = authHandle.value.trim().replace(/^@/, "");
  const problem = await checkHandle(handle);
  if (problem) { authError.textContent = problem; return; }
  const { error } = await sb.from("profiles").update({ username: handle }).eq("id", pendingUser.id);
  if (error) {
    authError.textContent = error.code === "23505" ? "Этот юзернейм уже занят" : translateError(error.message);
    return;
  }
  enterApp(pendingUser, { display_name: pendingProfile.display_name, username: handle });
}

async function submitAuth() {
  authError.textContent = "";
  authSubmit.disabled = true;
  try {
    if (authMode === "setup") await doSetup();
    else if (authMode === "register") await doRegister();
    else await doLogin();
  } finally {
    authSubmit.disabled = false;
  }
}

// ---------- Вход в приложение и выход ----------
function enterApp(user, prof) {
  authScreen.style.display = "none";
  accountInfo.textContent = "Вы вошли как " + prof.display_name + " (@" + prof.username + ")";
  startApp(user);
}

async function handleSession(user) {
  if (activeUserId === user.id) return;
  activeUserId = user.id;
  const { data: prof, error } = await sb.from("profiles")
    .select("display_name, username").eq("id", user.id).maybeSingle();
  if (error || !prof) {
    activeUserId = null;
    showAuth();
    authError.textContent = "Не удалось загрузить профиль. Обновите страницу.";
    return;
  }
  if (!prof.username) {            // юзернейм обязателен
    pendingUser = user;
    pendingProfile = prof;
    showAuth();
    setAuthMode("setup");
    return;
  }
  enterApp(user, prof);
}

function handleSignedOut() {
  activeUserId = null;
  pendingUser = null;
  stopApp();
  showAuth();
  setAuthMode("login");
}

// ---------- Кнопки ----------
authSubmit.addEventListener("click", submitAuth);
authSwitch.addEventListener("click", async () => {
  if (authMode === "setup") await sb.auth.signOut();
  else setAuthMode(authMode === "login" ? "register" : "login");
});
[authEmail, authPassword, authUsername, authHandle].forEach((field) => {
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") submitAuth(); });
});
logoutBtn.addEventListener("click", async () => {
  document.getElementById("settingsOverlay").classList.remove("open");
  await sb.auth.signOut();
});

// Запускаем, когда загружены все файлы страницы
document.addEventListener("DOMContentLoaded", () => {
  sb.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (session) handleSession(session.user); else handleSignedOut();
    }, 0);
  });
});