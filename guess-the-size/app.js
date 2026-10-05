"use strict";
const API = "https://94.249.207.221/guess-size-api";
const $ = (id) => document.getElementById(id);
let clip = null,
  clipURL = null,
  recorder = null,
  stream = null,
  timer = null,
  ticker = null,
  started = 0,
  busy = false,
  hasTranscript = false;
let submission = null, guessSaved = false, savingGuess = false;
const maxBytes = 8 * 1024 * 1024;
const tr = (x, digits = 1) => x.toFixed(digits).replace(".", ",");
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
};
const turkishError = (message) =>
  SERVER_ERRORS[message] || "Yazıya dökme başarısız oldu. Lütfen tekrar dene.";
function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function resetTranscript() {
  hasTranscript = false;
  $("reveal").disabled = true;
  $("copy").hidden = true;
  $("metrics").hidden = true;
  $("transcript").textContent = "Yazı dökümü burada görünecek.";
  $("transcript").classList.add("empty");
  $("answer").hidden = true;
}
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
      if (blob.size) setClip(blob);
    };
    recorder.start();
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
    $("duration").textContent =
      `${Number(result.duration_seconds).toFixed(1).replace(".", ",")} sn`;
    $("metrics").hidden = false;
    hasTranscript = Boolean(result.text?.trim());
    $("copy").hidden = !hasTranscript;
    $("reveal").disabled = !hasTranscript;
    $("guess-hint").textContent = hasTranscript
      ? "Duydun. Peki kaç aktif parametre sence?"
      : "Net duyulan Türkçe konuşma içeren bir kayıt dene.";
    status(
      hasTranscript ? "Tamam. Tahminini aşağıda yap." : "Başka bir kayıt dene.",
    );
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
function guess() {
  return Math.pow(2000, Number($("size").value) / 1000);
}
function updateGuess() {
  const value = guess(),
    big = value >= 1000;
  $("guess-value").replaceChildren(
    document.createTextNode(
      big
        ? tr(value / 1000, 2)
        : value < 20
          ? tr(value)
          : Math.round(value).toString(),
    ),
  );
  const unit = document.createElement("span");
  unit.textContent = big ? "milyar" : "milyon";
  $("guess-value").append(unit);
  // The mound illustration grows with the guess.
  document.querySelector(".scale-art")?.style.setProperty("--g", Number($("size").value) / 1000);
  $("size").setAttribute(
    "aria-valuetext",
    `${value.toFixed(1).replace(".", ",")} milyon aktif parametre`,
  );
}
$("size").addEventListener("input", updateGuess);
// Reference figures are sized on the same log scale as the slider.
document.querySelectorAll("[data-size]").forEach((button) =>
  button.style.setProperty("--s", Math.log(Number(button.dataset.size)) / Math.log(2000)),
);
document.querySelectorAll("[data-size]").forEach((b) =>
  b.addEventListener("click", () => {
    $("size").value = Math.round(
      (Math.log(Number(b.dataset.size)) / Math.log(2000)) * 1000,
    );
    updateGuess();
  }),
);
$("reveal").addEventListener("click", async () => {
  if (!hasTranscript || savingGuess) return;
  submission ||= {
    submission_id: crypto.randomUUID(),
    active_parameters: Math.round(guess() * 1_000_000),
  };
  if (!guessSaved) {
    savingGuess = true;
    setBusy(true);
    $("reveal").disabled = true;
    $("reveal").textContent = "Tahminin kaydediliyor…";
    $("size").disabled = true;
    document.querySelectorAll("[data-size]").forEach(b => b.disabled = true);
    try {
      const response = await fetch(`${API}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Guess-Size": "1" },
        credentials: "omit",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(submission),
      });
      if (!response.ok || !(await response.json()).saved) throw new Error("Save failed");
      guessSaved = true;
      $("guess-hint").textContent = "Tahminin kaydedildi.";
    } catch {
      $("guess-hint").textContent = "Tahminin kaydedilemedi. Biraz bekleyip tekrar dene.";
      $("reveal").textContent = "Tahminimi tekrar kaydet ↗";
      return;
    } finally {
      savingGuess = false;
      setBusy(false);
      $("reveal").disabled = false;
    }
  }
  $("reveal").textContent = "Tahmin kilitlendi ✓";
  const n = submission.active_parameters / 1_000_000,
    ratio = n / 15.4;
  let verdict =
    ratio >= 0.8 && ratio <= 1.2
      ? "Çok yakın bir tahmin."
      : ratio > 1
        ? `Tahminin, aktif boyutunun ${tr(ratio)} katıydı.`
        : `Model, tahmininin yaklaşık ${tr(1 / ratio)} katı aktif parametre kullanıyor.`;
  $("verdict").textContent =
    `Tahminin: ${n >= 1000 ? tr((n / 1000), 2) + " milyar" : tr(n) + " milyon"} aktif parametre. ${verdict}`;
  $("answer").hidden = false;
  $("answer").focus({ preventScroll: true });
  $("answer").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "nearest",
  });
});
$("again").addEventListener("click", () => {
  document.querySelector(".voice").scrollIntoView({ behavior: "smooth" });
  $("record").focus({ preventScroll: true });
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
updateGuess();
health();
setInterval(health, 60000);
