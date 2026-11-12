// Background music is independent of paper geometry and the snow collection.
const audio = document.getElementById("background-music");
const buttons = [...document.querySelectorAll("[data-toggle-music]")];
const announcement = document.getElementById("music-status");
const STORAGE_KEY = "snowflake-studio.music";
let enabled = true;
let pending = false;
let failed = false;

try {
  enabled = localStorage.getItem(STORAGE_KEY) !== "muted";
} catch {
  // Music still works when browser storage is unavailable.
}

audio.volume = 0.28;
audio.muted = !enabled;

function announce(message) {
  announcement.textContent = message;
}

function renderMusic() {
  const playing = !audio.paused && !audio.ended;
  const active = enabled && (pending || playing);
  const state = failed ? "error" : !enabled ? "muted" : pending ? "loading" : playing ? "playing" : "idle";
  audio.dataset.state = state;
  for (const button of buttons) {
    button.dataset.state = state;
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-busy", String(pending));
    button.setAttribute("aria-label", active ? "배경음악 음소거" : "배경음악 재생");
    button.title = failed ? "음악을 불러오지 못했어요. 다시 눌러 재생하세요." : active ? "배경음악 음소거" : "배경음악 재생";
    button.querySelector("[data-music-label]").textContent = failed ? "음악 다시 켜기" : active ? "음소거" : "음악 켜기";
  }
}

function persistPreference() {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "muted");
  } catch {
    // Keep the user's selection for this tab even without persistent storage.
  }
}

async function startMusic() {
  if (pending) return;
  failed = false;
  if (!audio.getAttribute("src")) audio.src = audio.dataset.src;
  else if (audio.error) audio.load();
  audio.muted = !enabled;
  pending = true;
  renderMusic();
  try {
    // Called directly from a real click/key gesture, before any await.
    await audio.play();
    announce(enabled ? "배경음악을 재생하고 있어요." : "배경음악을 음소거했어요.");
  } catch (error) {
    if (error.name !== "NotAllowedError" && error.name !== "AbortError") failed = true;
    announce(failed ? "음악을 불러오지 못했어요. 음악 버튼을 눌러 다시 시도하세요." : "음악 켜기 버튼을 눌러 배경음악을 시작하세요.");
  } finally {
    pending = false;
    renderMusic();
  }
}

function stopAutomaticStart() {
  document.removeEventListener("click", startOnInteraction, true);
  document.removeEventListener("keydown", startOnInteraction, true);
}

function startOnInteraction(event) {
  if (!event.isTrusted || !enabled || event.target.closest?.("[data-toggle-music]")) return;
  if (event.type === "keydown" && (event.repeat || ["Shift", "Control", "Alt", "Meta", "Tab", "Escape", "CapsLock"].includes(event.key))) return;
  stopAutomaticStart();
  void startMusic();
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    stopAutomaticStart();
    if (enabled && (pending || !audio.paused)) {
      enabled = false;
      audio.muted = true;
      announce("배경음악을 음소거했어요.");
    } else {
      enabled = true;
      audio.muted = false;
      if (audio.paused) void startMusic();
      else announce("배경음악을 다시 켰어요.");
    }
    persistPreference();
    renderMusic();
  });
}

for (const name of ["playing", "pause", "volumechange", "ended"]) {
  audio.addEventListener(name, renderMusic);
}
audio.addEventListener("error", () => {
  failed = true;
  pending = false;
  announce("음악을 불러오지 못했어요. 음악 버튼을 눌러 다시 시도하세요.");
  renderMusic();
});

document.addEventListener("click", startOnInteraction, true);
document.addEventListener("keydown", startOnInteraction, true);
renderMusic();
