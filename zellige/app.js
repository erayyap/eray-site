"use strict";
// erayy.com/zellige (2026-11-08): balbal-v2e-zellige (Moroccan Darija) demo. Same backend as /stt-demo (Cloudflare tunnel to
// Predator), model picked with X-Model. Unlike /stt-demo, recordings are SAVED to develop the model: nothing can be recorded,
// uploaded or sent before the visitor ticks the consent box, and every request carries X-Consent with the consent text version.
// Each result has a recording ID; this browser can send a corrected transcript or delete the recording with it.
const API = "https://stt-api.erayy.com/guess-size-api";
const MODEL = "balbal-v2e-zellige";
const CONSENT_VERSION = "zellige-v1";
const $ = (id) => document.getElementById(id);
let clip = null,
  clipURL = null,
  recorder = null,
  stream = null,
  timer = null,
  ticker = null,
  started = 0,
  busy = false,
  recordingId = null,
  modelText = "";
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
// The random pseudonymous browser ID of the erayy.com demos (rate limits; links a recording to the browser that made it).
const clientId = (() => {
  let id = store.get("guessSize.clientId", null);
  if (typeof id !== "string") {
    id = crypto.randomUUID();
    store.set("guessSize.clientId", id);
  }
  return id;
})();
const maxBytes = 8 * 1024 * 1024;
const consented = () => $("consent").checked;
function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function savedStatus(message, error = false) {
  $("saved-status").textContent = message;
  $("saved-status").classList.toggle("error", error);
}
function syncButtons() {
  const ok = consented();
  document.body.classList.toggle("consented", ok);
  const recording = recorder && recorder.state === "recording";
  $("record").disabled = busy || (!ok && !recording);
  $("upload").disabled = busy || !ok || recording;
  $("transcribe").disabled = busy || !ok;
  if (!recording) $("voice-prompt").textContent = ok ? "Ready to record." : "Tick the consent box to start.";
}
$("consent").addEventListener("change", () => {
  syncButtons();
  if (consented()) status("");
});
function resetTranscript() {
  $("copy").hidden = true;
  $("transcript").textContent = "The Darija transcript will appear here.";
  $("transcript").classList.remove("timed", "playing");
  $("transcript").classList.add("empty");
  $("words-hint").hidden = true;
  $("saved").hidden = true;
  savedStatus("");
  recordingId = null;
  words = [];
}
// Word-timed transcript: while the clip plays, spoken words are bright and the current one is highlighted; a click plays from it.
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
    span.title = `${w.start.toFixed(2)} s`;
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
    status("Please choose a file smaller than 8 MB.", true);
    return;
  }
  clip = blob;
  if (clipURL) URL.revokeObjectURL(clipURL);
  clipURL = URL.createObjectURL(blob);
  $("playback").src = clipURL;
  $("playback").hidden = false;
  $("transcribe").hidden = false;
  resetTranscript();
  status("Ready. Listen to it, or transcribe it (it will be saved).");
}
function setBusy(value) {
  busy = value;
  $("transcribe").textContent = value ? "Listening…" : "Transcribe and save →";
  syncButtons();
}
function releaseMic() {
  clearTimeout(timer);
  clearInterval(ticker);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  document.body.classList.remove("recording");
  $("record").textContent = "● Record";
  syncButtons();
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
  if (!consented()) {
    status("Please tick the consent box first.", true);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    status("This browser cannot record. You can upload an audio file instead.", true);
    return;
  }
  $("record").disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
    const type = types.find((t) => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : {});
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => {
      releaseMic();
      status("Recording failed. Please try again.", true);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      releaseMic();
      // A header-only file (~100 bytes) means the mic delivered no audio; don't upload it.
      if (blob.size < 1024) status("The recording looks empty. Check your microphone or upload a file.", true);
      else setClip(blob);
    };
    recorder.start(1000); // flush every second; some browsers return empty files otherwise
    started = Date.now();
    document.body.classList.add("recording");
    $("record").textContent = "■ Stop";
    $("transcribe").hidden = true;
    syncButtons();
    status("Recording… tap Stop when you are done.");
    ticker = setInterval(() => {
      $("voice-prompt").textContent = `Recording · ${Math.floor((Date.now() - started) / 1000)} / 30 s`;
    }, 250);
    timer = setTimeout(stopRecording, 30000);
  } catch (e) {
    releaseMic();
    status(
      e.name === "NotAllowedError"
        ? "Microphone permission was denied. Allow it in your browser or upload a file."
        : "Could not open the microphone. Try uploading a recording.",
      true,
    );
  } finally {
    syncButtons();
  }
});
$("upload").addEventListener("click", () => {
  if (!consented()) return;
  $("file").value = "";
  $("file").click();
});
$("file").addEventListener("change", () => {
  const f = $("file").files[0];
  if (f) setClip(f);
});
async function post(path, body, headers) {
  const response = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "X-Guess-Size": "1", "X-Client-ID": clientId, ...headers },
    body,
    signal: AbortSignal.timeout(90000),
    credentials: "omit",
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      response.status === 429
        ? "Too many requests. Please wait a minute and try again."
        : "The server cannot be reached right now. Please try again shortly.",
    );
  }
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
const networkMessage = (e) =>
  e.name === "TimeoutError"
    ? "The request took too long. Try a shorter clip."
    : e.name === "TypeError"
      ? "The server cannot be reached. Please try again shortly."
      : e.message;
$("transcribe").addEventListener("click", async () => {
  if (!clip || busy) return;
  if (!consented()) {
    status("Please tick the consent box first.", true);
    return;
  }
  setBusy(true);
  resetTranscript();
  status("Uploading and transcribing…");
  try {
    const result = await post("transcribe", clip, {
      "Content-Type": clip.type || "application/octet-stream",
      "X-Model": MODEL,
      "X-Consent": CONSENT_VERSION,
    });
    modelText = (result.text || "").trim();
    $("transcript").classList.remove("empty");
    $("transcript").textContent = modelText || "No speech was recognised. Try a clearer Darija recording.";
    if (modelText && Array.isArray(result.words) && result.words.length) {
      showWords(result.words);
      $("words-hint").hidden = false;
    }
    $("copy").hidden = !modelText;
    recordingId = result.recording_id || null;
    if (recordingId) {
      $("rec-id").textContent = recordingId;
      $("correction").value = modelText;
      $("send-fix").disabled = false;
      $("delete").disabled = false;
      $("delete").classList.remove("armed");
      $("delete").textContent = "Delete this recording";
      $("saved").hidden = false;
      status(`Done · ${Number(result.duration_seconds).toFixed(1)} s of audio · saved, thank you!`);
    } else {
      status(`Done · ${Number(result.duration_seconds).toFixed(1)} s of audio (this recording could not be saved).`);
    }
  } catch (e) {
    status(networkMessage(e), true);
  } finally {
    setBusy(false);
  }
});
$("send-fix").addEventListener("click", async () => {
  const text = $("correction").value.trim();
  if (!recordingId) return;
  if (!text) {
    savedStatus("The correction is empty.", true);
    return;
  }
  if (text === modelText) {
    savedStatus("The text is unchanged. Edit the words that are wrong, then send.", true);
    return;
  }
  $("send-fix").disabled = true;
  savedStatus("Sending…");
  try {
    await post("zellige-correct", JSON.stringify({ id: recordingId, text }), { "Content-Type": "application/json" });
    savedStatus("Correction saved. Shukran!");
  } catch (e) {
    savedStatus(networkMessage(e), true);
  } finally {
    $("send-fix").disabled = false;
  }
});
// Two taps to delete (no browser dialog): the first arms the button, the second deletes.
$("delete").addEventListener("click", async () => {
  if (!recordingId) return;
  const button = $("delete");
  if (!button.classList.contains("armed")) {
    button.classList.add("armed");
    button.textContent = "Tap again to delete";
    setTimeout(() => {
      if (button.classList.contains("armed")) {
        button.classList.remove("armed");
        button.textContent = "Delete this recording";
      }
    }, 5000);
    return;
  }
  button.classList.remove("armed");
  button.disabled = true;
  $("send-fix").disabled = true;
  savedStatus("Deleting…");
  try {
    await post("zellige-delete", JSON.stringify({ id: recordingId }), { "Content-Type": "application/json" });
    savedStatus(`Deleted: recording ${recordingId} and its transcript were removed from the server.`);
    button.textContent = "Deleted";
    recordingId = null;
  } catch (e) {
    savedStatus(networkMessage(e), true);
    button.disabled = false;
    $("send-fix").disabled = false;
    button.textContent = "Delete this recording";
  }
});
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("transcript").textContent);
    $("copy").textContent = "Copied";
    setTimeout(() => {
      $("copy").textContent = "Copy";
    }, 1500);
  } catch {
    status("Select the text to copy it.", true);
  }
});
window.addEventListener("pagehide", () => {
  releaseMic();
  if (clipURL) URL.revokeObjectURL(clipURL);
});
async function health() {
  try {
    const r = await fetch(`${API}/status`, { signal: AbortSignal.timeout(8000), credentials: "omit" });
    const s = await r.json();
    $("connection").textContent = s.models && s.models[MODEL] ? "Ready" : "Warming up";
  } catch {
    $("connection").textContent = "Server unreachable";
  }
}
$("consent").checked = false; // consent is given on each visit, never pre-ticked (browsers may restore form state)
syncButtons();
health();
setInterval(health, 60000);
