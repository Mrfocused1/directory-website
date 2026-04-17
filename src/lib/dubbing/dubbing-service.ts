/**
 * Dubbing Service — voice cloning via Vast.ai GPU.
 *
 * Phase 1: Cloned voice audio (Chatterbox TTS on GPU)
 * Phase 2: Lip-synced video (MuseTalk — future)
 *
 * Flow:
 * 1. Translate transcript via LibreTranslate
 * 2. Rent GPU via Vast.ai
 * 3. SSH in → install Chatterbox + download video
 * 4. Extract 6s voice sample from original video
 * 5. Generate translated speech with cloned voice
 * 6. Download audio, upload to R2
 * 7. Destroy GPU
 */

import { withGpu, sshExec, type VastInstance } from "./vast-client";
import { uploadBuffer } from "../pipeline/storage";
import { translateText } from "../translate";

export interface DubbingResult {
  audioUrl: string;
  videoUrl: string | null;
  lang: string;
}

export async function generateDubbedAudio(params: {
  siteSlug: string;
  postShortcode: string;
  videoUrl: string;
  transcript: string;
  targetLang: string;
}): Promise<DubbingResult> {
  const { siteSlug, postShortcode, videoUrl, transcript, targetLang } = params;

  // Translate
  console.log(`[dubbing] Translating to ${targetLang}...`);
  const translated = await translateText(transcript, targetLang);
  if (translated === transcript) throw new Error("Translation failed");

  // Run on GPU
  const audioBuffer = await withGpu(async (inst: VastInstance) => {
    const ssh = (cmd: string, timeout?: number) =>
      sshExec(inst.sshHost, inst.sshPort, cmd, timeout);

    // Setup
    console.log("[dubbing] Setting up GPU...");
    await ssh("apt-get update -qq && apt-get install -y -qq ffmpeg curl", 120_000);
    await ssh("pip install -q chatterbox-tts torchaudio soundfile", 300_000);

    // Download video
    console.log("[dubbing] Downloading video...");
    await ssh(`curl -sL -o /tmp/orig.mp4 "${videoUrl}"`, 60_000);

    // Extract voice sample (6s starting at 2s)
    await ssh(
      "ffmpeg -y -i /tmp/orig.mp4 -ss 2 -t 6 -vn -ar 24000 -ac 1 /tmp/voice.wav",
      30_000,
    );

    // Write translated text to file (avoids shell escaping issues)
    const safeText = translated.slice(0, 2000).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await ssh(`echo "${safeText}" > /tmp/text.txt`, 10_000);

    // Generate cloned speech
    console.log("[dubbing] Generating cloned voice...");
    await ssh(
      `python3 << 'PYEOF'
import torch
from chatterbox.tts import ChatterboxTTS
import torchaudio

model = ChatterboxTTS.from_pretrained(device="cuda")
text = open("/tmp/text.txt").read().strip()
wav = model.generate(text, audio_prompt_path="/tmp/voice.wav")
torchaudio.save("/tmp/dubbed.wav", wav, model.sr)
print("SUCCESS: audio generated")
PYEOF`,
      600_000,
    );

    // Download the audio via base64
    console.log("[dubbing] Downloading audio...");
    const b64 = await ssh("base64 -w0 /tmp/dubbed.wav", 60_000);
    return Buffer.from(b64.trim(), "base64");
  });

  // Upload to R2
  console.log("[dubbing] Uploading to R2...");
  const key = `sites/${siteSlug}/dubbed/${postShortcode}_${targetLang}.wav`;
  const audioUrl = await uploadBuffer(key, audioBuffer, "audio/wav");

  return { audioUrl, videoUrl: null, lang: targetLang };
}
