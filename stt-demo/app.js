"use strict";
// Cloudflare named tunnel (guess-stt) to the ASR host; replaced the VPS relay on 2026-10-06.
const API = "https://stt-api.erayy.com/guess-size-api";
const $ = (id) => document.getElementById(id);
let clip = null,
  clipURL = null,
  recorder = null,
  stream = null,
  timer = null,
  ticker = null,
  started = 0,
  busy = false;
// Per-browser memory (localStorage may be unavailable: private mode, blocked storage).
const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
// A random pseudonymous browser ID; the server uses it for per-browser rate limits.
const clientId = (() => {
  let id = store.get("guessSize.clientId", null);
  if (typeof id !== "string") {
    id = crypto.randomUUID();
    store.set("guessSize.clientId", id);
  }
  return id;
})();
const maxBytes = 8 * 1024 * 1024;
// Server messages are English; show Turkish ones (unknown messages get a generic Turkish line).
const SERVER_ERRORS = {
  "The server is temporarily unavailable. Please try again.": "Sunucu geçici olarak kullanılamıyor. Lütfen tekrar dene.",
  "Please use the demo on erayy.com.": "Lütfen erayy.com üzerindeki demoyu kullan.",
  "Choose an audio file smaller than 8 MB.": "8 MB’tan küçük bir ses dosyası seç.",
  "The model is warming up. Please try again shortly.": "Model ısınıyor. Lütfen birazdan tekrar dene.",
  "Someone else is transcribing. Please try again in a moment.": "Şu an başka biri yazıya döküyor. Lütfen birazdan tekrar dene.",
  "Incomplete upload. Please try again.": "Yükleme tamamlanmadı. Lütfen tekrar dene.",
  "That audio could not be read. Try WAV, MP3, M4A, OGG or WebM.": "Bu ses okunamadı. WAV, MP3, M4A, OGG ya da WebM dene.",
  "Please use a clip between 0.25 and 30 seconds.": "Lütfen 0,25 ile 30 saniye arasında bir kayıt kullan.",
  "Invalid audio samples.": "Geçersiz ses verisi.",
  "The recording is silent. Please try speaking closer to the microphone.": "Kayıt sessiz. Lütfen mikrofona daha yakın konuş.",
  "Audio processing timed out. Please try a shorter clip.": "Ses işleme zaman aşımına uğradı. Daha kısa bir kayıt dene.",
  "Please reload the page and try again.": "Lütfen sayfayı yenileyip tekrar dene.",
  "Too many requests. Please wait a minute and try again.": "Çok fazla istek. Lütfen bir dakika bekleyip tekrar dene.",
  "Daily limit reached: 100 transcriptions per day. Try again tomorrow, or contact Eray for more: hello@erayy.com":
    "Günlük sınıra ulaştın: günde 100 kayıt. Yarın tekrar dene ya da daha fazlası için Eray’a yaz: hello@erayy.com",
};
const turkishError = (message) =>
  SERVER_ERRORS[message] || "Yazıya dökme başarısız oldu. Lütfen tekrar dene.";
function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function resetTranscript() {
  $("copy").hidden = true;
  $("metrics").hidden = true;
  $("transcript").textContent = "Yazı dökümü burada görünecek.";
  $("transcript").classList.remove("timed", "playing");
  $("transcript").classList.add("empty");
  $("words-hint").hidden = true;
  words = [];
}
// Word-timed transcript (server `words`: [{word, start, end}] in seconds, same method as the balbal Android app):
// while the clip plays, spoken words are bright, the current one is highlighted and the rest are dimmed; clicking a
// word plays from it.
let words = [],
  frame = 0;
function showWords(list) {
  words = list;
  const box = $("transcript");
  box.textContent = "";
  list.forEach((w, i) => {
    if (i) box.append(" ");
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = w.word;
    span.title = `${w.start.toFixed(2).replace(".", ",")} sn`;
    span.addEventListener("click", () => {
      $("playback").currentTime = w.start;
      $("playback").play();
    });
    box.append(span);
  });
  box.classList.add("timed");
}
function highlight() {
  const player = $("playback"),
    t = player.currentTime,
    playing = !player.paused && !player.ended;
  $("transcript").classList.toggle("playing", playing);
  $("transcript")
    .querySelectorAll(".w")
    .forEach((span, i) => {
      span.classList.toggle("said", t >= words[i].end);
      span.classList.toggle("now", t >= words[i].start && t < words[i].end);
    });
  frame = playing ? requestAnimationFrame(highlight) : 0;
}
for (const event of ["play", "pause", "ended", "seeked"])
  $("playback").addEventListener(event, () => {
    cancelAnimationFrame(frame);
    if (words.length) highlight();
  });
function setClip(blob) {
  if (blob.size > maxBytes) {
    status("Lütfen 8 MB’tan küçük bir dosya seç.", true);
    return;
  }
  clip = blob;
  if (clipURL) URL.revokeObjectURL(clipURL);
  clipURL = URL.createObjectURL(blob);
  $("playback").src = clipURL;
  $("playback").hidden = false;
  $("transcribe").hidden = false;
  resetTranscript();
  status("Hazır. Kaydı dinleyebilir ya da yazıya dökebilirsin.");
}
function setBusy(value) {
  busy = value;
  for (const id of ["record", "upload", "transcribe"]) $(id).disabled = value;
  $("transcribe").textContent = value ? "Dinliyor…" : "Bu kaydı yazıya dök →";
}
function releaseMic() {
  clearTimeout(timer);
  clearInterval(ticker);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  document.body.classList.remove("recording");
  $("record").textContent = "● Sesini kaydet";
  $("upload").disabled = false;
  $("voice-prompt").textContent = "Kayda hazır.";
}
function stopRecording() {
  if (recorder && recorder.state === "recording") recorder.stop();
}
$("record").addEventListener("click", async () => {
  if (recorder && recorder.state === "recording") {
    stopRecording();
    return;
  }
  if (busy) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    status(
      "Bu tarayıcıda kayıt yapılamıyor. Bunun yerine bir ses dosyası yükleyebilirsin.",
      true,
    );
    return;
  }
  $("record").disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const types = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const type = types.find((t) => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : {});
    let chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => {
      releaseMic();
      status("Kayıt başarısız oldu. Lütfen tekrar dene.", true);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      releaseMic();
      // A header-only file (~100 bytes) means the mic delivered no audio; don't upload it.
      if (blob.size < 1024)
        status("Kayıt boş görünüyor. Mikrofonunu kontrol et ya da bir ses dosyası yükle.", true);
      else setClip(blob);
    };
    recorder.start(1000); // flush data every second; some browsers return empty files otherwise
    started = Date.now();
    document.body.classList.add("recording");
    $("record").textContent = "■ Kaydı durdur";
    $("upload").disabled = true;
    $("transcribe").hidden = true;
    status("Kaydediliyor… bitince Durdur’a dokun.");
    ticker = setInterval(() => {
      $("voice-prompt").textContent =
        `Kaydediliyor · ${Math.floor((Date.now() - started) / 1000)} / 30s`;
    }, 250);
    timer = setTimeout(stopRecording, 30000);
  } catch (e) {
    releaseMic();
    status(
      e.name === "NotAllowedError"
        ? "Mikrofon izni reddedildi. Tarayıcında izin ver ya da bir ses dosyası yükle."
        : "Mikrofon açılamadı. Bir kayıt yüklemeyi dene.",
      true,
    );
  } finally {
    $("record").disabled = false;
  }
});
$("upload").addEventListener("click", () => {
  $("file").value = "";
  $("file").click();
});
$("file").addEventListener("change", () => {
  const f = $("file").files[0];
  if (f) setClip(f);
});
$("transcribe").addEventListener("click", async () => {
  if (!clip || busy) return;
  setBusy(true);
  resetTranscript();
  status("Yükleniyor ve yazıya dökülüyor…");
  try {
    const response = await fetch(`${API}/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": clip.type || "application/octet-stream",
        "X-Guess-Size": "1",
        "X-Client-ID": clientId,
      },
      body: clip,
      signal: AbortSignal.timeout(90000),
      credentials: "omit",
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        response.status === 429
          ? "Çok fazla istek. Lütfen bir dakika bekleyip tekrar dene."
          : "Yazıya dökme sunucusuna şu an ulaşılamıyor. Lütfen birazdan tekrar dene.",
      );
    }
    if (!response.ok)
      throw new Error(
        turkishError(result.error),
      );
    $("transcript").classList.remove("empty");
    $("transcript").textContent =
      result.text || "Konuşma algılanamadı. Daha net, Türkçe bir kayıt dene.";
    if (result.text && Array.isArray(result.words) && result.words.length) {
      showWords(result.words);
      $("words-hint").hidden = false;
    }
    $("duration").textContent =
      `${Number(result.duration_seconds).toFixed(1).replace(".", ",")} sn`;
    $("metrics").hidden = false;
    const hasTranscript = Boolean(result.text?.trim());
    $("copy").hidden = !hasTranscript;
    status(hasTranscript ? "Tamam." : "Başka bir kayıt dene.");
  } catch (e) {
    status(
      e.name === "TimeoutError"
        ? "İstek çok uzun sürdü. Daha kısa bir kayıt dene."
        : e.name === "TypeError"
          ? "Yazıya dökme sunucusuna ulaşılamadı. Lütfen birazdan tekrar dene."
          : e.message,
      true,
    );
  } finally {
    setBusy(false);
  }
});
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("transcript").textContent);
    $("copy").textContent = "Kopyalandı";
    setTimeout(() => {
      $("copy").textContent = "Kopyala";
    }, 1500);
  } catch {
    status("Kopyalamak için yazıyı seç.", true);
  }
});
window.addEventListener("pagehide", () => {
  releaseMic();
  if (clipURL) URL.revokeObjectURL(clipURL);
});
async function health() {
  try {
    const r = await fetch(`${API}/status`, {
      signal: AbortSignal.timeout(8000),
      credentials: "omit",
    });
    const s = await r.json();
    $("connection").textContent = s.ready ? "Dinlemeye hazır" : "Isınıyor";
  } catch {
    $("connection").textContent = "Sunucuya ulaşılamıyor";
  }
}
health();
setInterval(health, 60000);
