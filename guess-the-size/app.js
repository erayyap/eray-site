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
const maxBytes = 8 * 1024 * 1024;
function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function resetTranscript() {
  hasTranscript = false;
  $("reveal").disabled = true;
  $("copy").hidden = true;
  $("metrics").hidden = true;
  $("speed-note").hidden = true;
  $("transcript").textContent = "Your words will appear here.";
  $("transcript").classList.add("empty");
  $("answer").hidden = true;
}
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
  status("Ready. Listen back or transcribe your clip.");
}
function setBusy(value) {
  busy = value;
  for (const id of ["record", "upload", "transcribe"]) $(id).disabled = value;
  $("transcribe").textContent = value ? "Listening…" : "Transcribe this clip →";
}
function releaseMic() {
  clearTimeout(timer);
  clearInterval(ticker);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  document.body.classList.remove("recording");
  $("record").textContent = "● Record your voice";
  $("upload").disabled = false;
  $("voice-prompt").textContent = "Your voice, its best guess.";
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
      "Recording is unavailable in this browser. You can upload an audio file instead.",
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
      status("Recording failed. Please try again.", true);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      releaseMic();
      if (blob.size) setClip(blob);
    };
    recorder.start();
    started = Date.now();
    document.body.classList.add("recording");
    $("record").textContent = "■ Stop recording";
    $("upload").disabled = true;
    $("transcribe").hidden = true;
    status("Recording… tap Stop when you’re done.");
    ticker = setInterval(() => {
      $("voice-prompt").textContent =
        `Recording · ${Math.floor((Date.now() - started) / 1000)} / 30s`;
    }, 250);
    timer = setTimeout(stopRecording, 30000);
  } catch (e) {
    releaseMic();
    status(
      e.name === "NotAllowedError"
        ? "Microphone permission was denied. Allow it in your browser, or upload audio."
        : "Could not open the microphone. Try uploading a recording.",
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
  status("Uploading and transcribing…");
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
          ? "Too many requests. Please wait a minute and try again."
          : "The transcription server is unavailable. Please try again shortly.",
      );
    }
    if (!response.ok)
      throw new Error(
        result.error || "Transcription failed. Please try again.",
      );
    $("transcript").classList.remove("empty");
    $("transcript").textContent =
      result.text || "No speech was recognized. Try a clearer recording.";
    const speed = Number(result.realtime_factor);
    $("duration").textContent =
      `${Number(result.duration_seconds).toFixed(1)}s`;
    $("speed").textContent = Number.isFinite(speed)
      ? speed >= 20
        ? "20×+"
        : `${Math.min(speed, 20).toFixed(1)}×`
      : "—";
    $("metrics").hidden = false;
    $("speed-note").hidden = false;
    hasTranscript = Boolean(result.text?.trim());
    $("copy").hidden = !hasTranscript;
    $("reveal").disabled = !hasTranscript;
    $("guess-hint").textContent = hasTranscript
      ? "You’ve heard it. Now, what’s your guess?"
      : "Try a clip with audible Turkish speech.";
    status(
      hasTranscript ? "Done. Make your guess below." : "Try another recording.",
    );
  } catch (e) {
    status(
      e.name === "TimeoutError"
        ? "The request took too long. Try a shorter recording."
        : e.message === "Failed to fetch"
          ? "Could not reach the transcription server. Please try again shortly."
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
        ? (value / 1000).toFixed(2)
        : value < 20
          ? value.toFixed(1)
          : Math.round(value).toString(),
    ),
  );
  const unit = document.createElement("span");
  unit.textContent = big ? "billion" : "million";
  $("guess-value").append(unit);
  $("size").setAttribute(
    "aria-valuetext",
    `${value.toFixed(1)} million active parameters`,
  );
}
$("size").addEventListener("input", updateGuess);
document.querySelectorAll("[data-size]").forEach((b) =>
  b.addEventListener("click", () => {
    $("size").value = Math.round(
      (Math.log(Number(b.dataset.size)) / Math.log(2000)) * 1000,
    );
    updateGuess();
  }),
);
$("reveal").addEventListener("click", () => {
  if (!hasTranscript) return;
  const n = guess(),
    ratio = n / 15.4;
  let verdict =
    ratio >= 0.8 && ratio <= 1.2
      ? "That’s a very close guess."
      : ratio > 1
        ? `Your guess was ${ratio.toFixed(1)}× larger than its active size.`
        : `It uses about ${(1 / ratio).toFixed(1)}× as many active parameters as you guessed.`;
  $("verdict").textContent =
    `You guessed ${n >= 1000 ? (n / 1000).toFixed(2) + "B" : n.toFixed(1) + "M"}. ${verdict}`;
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
    $("copy").textContent = "Copied";
    setTimeout(() => {
      $("copy").textContent = "Copy";
    }, 1500);
  } catch {
    status("Select the transcript to copy it.", true);
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
    $("connection").textContent = s.ready ? "Ready to listen" : "Warming up";
  } catch {
    $("connection").textContent = "Server unavailable";
  }
}
updateGuess();
health();
setInterval(health, 60000);
