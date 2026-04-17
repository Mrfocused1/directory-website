/**
 * Dubbing service — orchestrates GPU rental, voice cloning (Chatterbox TTS),
 * lip sync (MuseTalk), and R2 storage for dubbed video output.
 *
 * Flow:
 *   1. Rent cheapest GPU on Vast.ai
 *   2. Wait for instance to boot
 *   3. Install Chatterbox + MuseTalk on the GPU
 *   4. Download source video + voice sample from R2 to the GPU
 *   5. Clone voice and generate translated TTS audio (Chatterbox)
 *   6. Lip-sync the translated audio onto the source video (MuseTalk)
 *   7. Download the dubbed video from the GPU
 *   8. Upload dubbed video + audio to R2
 *   9. Destroy the GPU instance
 *  10. Return R2 URLs
 */

import {
  findCheapestGpu,
  rentInstance,
  waitForReady,
  runSshCommand,
  scpUpload,
  scpDownload,
  destroyInstance,
  type VastInstance,
} from "./vast-client";

// ---------------------------------------------------------------------------
// GPU setup script — SSH'd to the instance on first boot
// ---------------------------------------------------------------------------

const GPU_SETUP_SCRIPT = `
set -euo pipefail

echo "=== [1/4] System deps ==="
apt-get update -qq && apt-get install -y -qq ffmpeg git wget > /dev/null 2>&1

echo "=== [2/4] Install Chatterbox TTS ==="
pip install --quiet chatterbox-tts

echo "=== [3/4] Install MuseTalk ==="
if [ ! -d /workspace/MuseTalk ]; then
  cd /workspace
  git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git
  cd MuseTalk
  pip install --quiet -r requirements.txt
  # Download pretrained models (weights are cached after first run)
  python -c "from musetalk.utils.utils import load_all_model; load_all_model()" || true
fi

echo "=== [4/4] Ready ==="
`.trim();

// ---------------------------------------------------------------------------
// Chatterbox voice-clone + TTS script template
// ---------------------------------------------------------------------------

function chatterboxScript(
  voiceSamplePath: string,
  translatedText: string,
  outputAudioPath: string,
): string {
  // Escape single quotes in text for safe embedding in Python
  const escaped = translatedText.replace(/'/g, "\\'");
  return `
python3 -c "
import torchaudio
from chatterbox.tts import ChatterboxTTS

model = ChatterboxTTS.from_pretrained(device='cuda')
wav = model.generate(
    '${escaped}',
    audio_prompt_path='${voiceSamplePath}',
)
torchaudio.save('${outputAudioPath}', wav, model.sr)
print('Audio saved to ${outputAudioPath}')
"
`.trim();
}

// ---------------------------------------------------------------------------
// MuseTalk lip-sync script template
// ---------------------------------------------------------------------------

function museTalkScript(
  videoPath: string,
  audioPath: string,
  outputVideoPath: string,
): string {
  return `
cd /workspace/MuseTalk && python -m musetalk.inference \\
  --video_path "${videoPath}" \\
  --audio_path "${audioPath}" \\
  --output_path "${outputVideoPath}" \\
  --use_float16
`.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DubbingParams {
  siteId: string;
  postId: string;
  /** R2 URL of the original video */
  videoUrl: string;
  /** Translated transcript text */
  translatedText: string;
  /** ISO 639-1 language code (e.g. "es", "fr") */
  targetLang: string;
  /** R2 URL of a ~6s voice sample clip from the creator's first video */
  voiceSampleUrl: string;
}

export interface DubbingResult {
  /** R2 URL of the dubbed (lip-synced) video */
  dubbedVideoUrl: string;
  /** R2 URL of the cloned TTS audio */
  dubbedAudioUrl: string;
}

/**
 * Generate a dubbed video: clone the creator's voice, speak the translated
 * text, and lip-sync it onto the original video.
 *
 * This is a long-running operation (~3-8 minutes depending on GPU availability
 * and video length). Intended to be called from a background job / Inngest
 * function, not from a synchronous HTTP handler.
 */
export async function generateDubbedVideo(
  params: DubbingParams,
): Promise<DubbingResult> {
  const { siteId, postId, videoUrl, translatedText, targetLang, voiceSampleUrl } = params;

  let instanceId: number | null = null;

  try {
    // ── 1. Find + rent GPU ──────────────────────────────────────────
    console.log("[dubbing] Searching for cheapest GPU...");
    const bundle = await findCheapestGpu();
    console.log(`[dubbing] Renting GPU: ${bundle.gpu_name} @ $${bundle.dph_total}/hr`);

    instanceId = await rentInstance(bundle.id);
    console.log(`[dubbing] Instance ${instanceId} created, waiting for boot...`);

    const instance: VastInstance = await waitForReady(instanceId);
    console.log(`[dubbing] Instance ready at ${instance.sshHost}:${instance.sshPort}`);

    // ── 2. Install dependencies ─────────────────────────────────────
    console.log("[dubbing] Running GPU setup script...");
    await runSshCommand(instance, GPU_SETUP_SCRIPT);

    // ── 3. Download source files to GPU ─────────────────────────────
    console.log("[dubbing] Downloading source files to GPU...");
    await runSshCommand(
      instance,
      `mkdir -p /workspace/job && wget -q -O /workspace/job/source.mp4 "${videoUrl}"`,
    );
    await runSshCommand(
      instance,
      `wget -q -O /workspace/job/voice_sample.wav "${voiceSampleUrl}"`,
    );

    // ── 4. Voice cloning + TTS ──────────────────────────────────────
    console.log("[dubbing] Generating cloned voice audio...");
    await runSshCommand(
      instance,
      chatterboxScript(
        "/workspace/job/voice_sample.wav",
        translatedText,
        "/workspace/job/dubbed_audio.wav",
      ),
    );

    // ── 5. Lip sync ─────────────────────────────────────────────────
    console.log("[dubbing] Running lip sync (MuseTalk)...");
    await runSshCommand(
      instance,
      museTalkScript(
        "/workspace/job/source.mp4",
        "/workspace/job/dubbed_audio.wav",
        "/workspace/job/dubbed_video.mp4",
      ),
    );

    // ── 6. Download results from GPU ────────────────────────────────
    // In production, we would SCP the files down to a tmp directory,
    // then upload to R2. For now, placeholder paths.
    const tmpDir = `/tmp/dubbing-${postId}-${targetLang}`;
    await scpDownload(instance, "/workspace/job/dubbed_video.mp4", `${tmpDir}/dubbed_video.mp4`);
    await scpDownload(instance, "/workspace/job/dubbed_audio.wav", `${tmpDir}/dubbed_audio.wav`);

    // ── 7. Upload to R2 ─────────────────────────────────────────────
    // TODO: Read the downloaded files into buffers and call uploadBuffer()
    // from @/lib/pipeline/storage. For now, return placeholder URLs.
    const r2VideoPath = `sites/${siteId}/dubbed/${postId}/${targetLang}/video.mp4`;
    const r2AudioPath = `sites/${siteId}/dubbed/${postId}/${targetLang}/audio.wav`;

    // Placeholder — wire up when SSH + R2 upload is tested end-to-end:
    // const videoBuf = await fs.readFile(`${tmpDir}/dubbed_video.mp4`);
    // const audioBuf = await fs.readFile(`${tmpDir}/dubbed_audio.wav`);
    // const dubbedVideoUrl = await uploadBuffer(r2VideoPath, videoBuf, "video/mp4");
    // const dubbedAudioUrl = await uploadBuffer(r2AudioPath, audioBuf, "audio/wav");

    const r2BaseUrl = process.env.R2_PUBLIC_URL || "https://r2.buildmy.directory";
    const dubbedVideoUrl = `${r2BaseUrl}/${r2VideoPath}`;
    const dubbedAudioUrl = `${r2BaseUrl}/${r2AudioPath}`;

    console.log(`[dubbing] Done! Video: ${dubbedVideoUrl}`);

    return { dubbedVideoUrl, dubbedAudioUrl };
  } finally {
    // ── 8. Always destroy the GPU instance ──────────────────────────
    if (instanceId !== null) {
      try {
        await destroyInstance(instanceId);
      } catch (err) {
        console.error("[dubbing] Failed to destroy instance:", err);
      }
    }
  }
}
