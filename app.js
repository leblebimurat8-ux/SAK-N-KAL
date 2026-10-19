// Firebase yapılandırmasını firebase-config.js dosyasına ekleyin.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDatabase, ref, onValue, runTransaction, set } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = id => document.getElementById(id);
const DAY = 24 * 60 * 60 * 1000;
const messages = [
  "Küfür etmek iletişimi bozabilir; derdini sakin anlatmayı dene.",
  "Sinirlendiğinde kısa bir mola vermek iyi gelebilir.",
  "Kelimeler iz bırakır; kırmadan konuşmayı deneyelim.",
  "Derin bir nefes al. Her tartışmayı kazanmak zorunda değilsin.",
  "Biraz su iç ve sakinleşmek için kendine zaman ver.",
  "Öfke geçer; birbirimize biraz anlayış gösterelim."
];
let currentUser = null;
let state = null;
let previousZero = { berat: false, kardelen: false };
let audioHasPlayed = { berat: false, kardelen: false };
let messageIndex = 0;
let stopListener = null;

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (err) {
    $("loginError").textContent = "Giriş yapılamadı. E-posta ve şifreyi kontrol edin.";
  }
});
$("logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  currentUser = user;
  $("login").hidden = !!user;
  $("app").hidden = !user;
  if (!user) {
    if (stopListener) stopListener();
    stopListener = null;
    $("status").textContent = "Oturum kapalı";
    return;
  }
  $("status").textContent = "Bağlanıyor…";
  const stateRef = ref(db, "sakinKal/state");
  stopListener = onValue(stateRef, async snap => {
    if (!snap.exists()) {
      const now = Date.now();
      await set(stateRef, {
        cycleStartedAt: now,
        users: {
          berat: { remaining: 20 },
          kardelen: { remaining: 20 }
        },
        lastMessageIndex: 3
      });
      return;
    }
    state = snap.val();
    await resetIfNeeded();
    render();
    $("status").textContent = "● Çevrim içi senkronize";
  }, err => {
    $("status").textContent = "Bağlantı hatası";
    console.error(err);
  });
});

async function resetIfNeeded() {
  const stateRef = ref(db, "sakinKal/state");
  await runTransaction(stateRef, current => {
    if (!current) return current;
    const now = Date.now();
    const started = Number(current.cycleStartedAt || now);
    if (now - started >= DAY) {
      return {
        ...current,
        cycleStartedAt: started + Math.floor((now - started) / DAY) * DAY,
        users: { berat: { remaining: 20 }, kardelen: { remaining: 20 } },
        lastMessageIndex: current.lastMessageIndex ?? 3
      };
    }
    return current;
  });
}

async function mark(name) {
  if (!state || !currentUser) return;
  const stateRef = ref(db, "sakinKal/state");
  const result = await runTransaction(stateRef, current => {
    if (!current) return current;
    const remaining = Number(current.users?.[name]?.remaining ?? 20);
    if (remaining <= 0) return current;
    current.users = current.users || {};
    current.users[name] = { remaining: remaining - 1 };
    current.lastMessageIndex = (Number(current.lastMessageIndex ?? 3) + 1) % messages.length;
    return current;
  });
  if (result.committed) {
    messageIndex = Number(result.snapshot.val()?.lastMessageIndex ?? 3);
    $("calmMessage").textContent = messages[messageIndex];
  }
}
$("beratButton").addEventListener("click", () => mark("berat"));
$("kardelenButton").addEventListener("click", () => mark("kardelen"));

function render() {
  if (!state?.users) return;
  for (const name of ["berat", "kardelen"]) {
    const remaining = Math.max(0, Math.min(20, Number(state.users[name]?.remaining ?? 20)));
    $(name + "Count").textContent = remaining;
    $(name + "Meter").style.width = `${remaining * 5}%`;
    $(name + "Button").disabled = remaining === 0;
    const nowZero = remaining === 0;
    if (nowZero && !previousZero[name]) {
      maybePlayMusic(name);
    }
    if (!nowZero) audioHasPlayed[name] = false;
    previousZero[name] = nowZero;
  }
  const anyZero = ["berat", "kardelen"].some(n => Number(state.users[n]?.remaining ?? 20) === 0);
  $("quotaAlert").hidden = !anyZero;
  const resetAt = Number(state.cycleStartedAt || Date.now()) + DAY;
  $("resetInfo").textContent = `Sonraki sıfırlama: ${new Date(resetAt).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}`;
  if (Number.isInteger(state.lastMessageIndex)) $("calmMessage").textContent = messages[state.lastMessageIndex];
}

function maybePlayMusic(name) {
  if (audioHasPlayed[name]) return;
  audioHasPlayed[name] = true;
  const audio = $("calmAudio");
  if (!audio.src) {
    $("musicButton").hidden = false;
    $("musicButton").textContent = "Müziği başlat";
    return;
  }
  audio.play().then(() => $("musicButton").hidden = true).catch(() => {
    $("musicButton").hidden = false;
  });
}
$("musicButton").addEventListener("click", async () => {
  const audio = $("calmAudio");
  if (!audio.src) {
    $("musicButton").textContent = "Önce music.mp3 dosyasını ekleyin";
    return;
  }
  try {
    await audio.play();
    $("musicButton").hidden = true;
  } catch {
    $("musicButton").textContent = "Tekrar dene";
  }
});

// İzinli bir ses dosyanız varsa kök dizine music.mp3 adıyla koyun.
$("calmAudio").src = "./music.mp3";
