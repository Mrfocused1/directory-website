/**
 * Vast.ai GPU rental client for on-demand voice cloning + lip sync.
 *
 * Lifecycle: search cheapest GPU -> rent instance -> wait until ready ->
 * run setup + processing commands via SSH -> destroy instance.
 *
 * Requires env: VAST_API_KEY
 */

const VAST_BASE_URL = "https://console.vast.ai/api/v0";

function getApiKey(): string {
  const key = process.env.VAST_API_KEY;
  if (!key) throw new Error("[vast] VAST_API_KEY is not configured");
  return key;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VastInstance {
  id: number;
  status: string; // "running" | "loading" | "exited" etc.
  sshHost: string;
  sshPort: number;
  publicIpaddr: string;
}

interface BundleResult {
  id: number;
  dph_total: number; // dollars per hour
  gpu_ram: number;
  gpu_name: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function vastFetch<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const key = getApiKey();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${VAST_BASE_URL}${path}${sep}api_key=${key}`;

  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...opts.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[vast] ${res.status} ${res.statusText}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the cheapest available GPU instance with >= 20 GB VRAM.
 * Prefers RTX 3090 / RTX 4090 / A6000 class cards.
 */
export async function findCheapestGpu(): Promise<BundleResult> {
  const query = JSON.stringify({
    gpu_ram: ">=20",
    rentable: true,
    order: [["dph_total", "asc"]],
    limit: 1,
  });

  const bundles = await vastFetch<BundleResult[]>(
    `/bundles?q=${encodeURIComponent(query)}`,
  );

  if (!bundles.length) {
    throw new Error("[vast] No available GPU instances found");
  }

  return bundles[0];
}

/**
 * Rent a specific GPU bundle. Returns the instance ID.
 */
export async function rentInstance(bundleId: number): Promise<number> {
  const key = getApiKey();
  const result = await vastFetch<{ new_contract: number }>(
    `/asks/${bundleId}/?api_key=${key}`,
    {
      method: "PUT",
      body: JSON.stringify({
        client_id: "me",
        image: "pytorch/pytorch:2.1.0-cuda12.1-cudnn8-devel",
        disk: 20,
        label: "bmd-dubbing",
      }),
    },
  );

  return result.new_contract;
}

/**
 * Poll until the rented instance reaches "running" status.
 * Times out after ~5 minutes.
 */
export async function waitForReady(
  instanceId: number,
  maxWaitMs = 5 * 60 * 1000,
): Promise<VastInstance> {
  const key = getApiKey();
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const instances = await vastFetch<VastInstance[]>(
      `/instances?api_key=${key}`,
    );

    const inst = instances.find((i) => i.id === instanceId);
    if (inst && inst.status === "running") {
      return inst;
    }

    // Wait 10 seconds between polls
    await new Promise((r) => setTimeout(r, 10_000));
  }

  throw new Error(
    `[vast] Instance ${instanceId} did not become ready within ${maxWaitMs / 1000}s`,
  );
}

/**
 * Run a command on the instance via SSH.
 *
 * NOTE: In production this would shell out to `ssh` or use an SSH library
 * (e.g. `ssh2`). For now this is a placeholder that logs the command.
 * The actual SSH execution will be wired up when the Vast.ai API key is
 * provisioned and the GPU pipeline is tested end-to-end.
 */
export async function runSshCommand(
  instance: VastInstance,
  command: string,
): Promise<string> {
  // TODO: Replace with real SSH execution using instance.sshHost + instance.sshPort
  // Example: spawn(`ssh -p ${instance.sshPort} root@${instance.sshHost} "${command}"`)
  console.log(
    `[vast] SSH → ${instance.sshHost}:${instance.sshPort} $ ${command}`,
  );

  // Placeholder return — real implementation returns stdout
  return `[placeholder] Would run on ${instance.sshHost}: ${command}`;
}

/**
 * Upload a file to the instance via SCP.
 *
 * NOTE: Placeholder — same SSH-library caveat as runSshCommand.
 */
export async function scpUpload(
  instance: VastInstance,
  localPath: string,
  remotePath: string,
): Promise<void> {
  // TODO: Replace with real SCP using instance.sshHost + instance.sshPort
  console.log(
    `[vast] SCP ${localPath} → ${instance.sshHost}:${instance.sshPort}:${remotePath}`,
  );
}

/**
 * Download a file from the instance via SCP.
 *
 * NOTE: Placeholder — same SSH-library caveat as runSshCommand.
 */
export async function scpDownload(
  instance: VastInstance,
  remotePath: string,
  localPath: string,
): Promise<void> {
  // TODO: Replace with real SCP using instance.sshHost + instance.sshPort
  console.log(
    `[vast] SCP ${instance.sshHost}:${instance.sshPort}:${remotePath} → ${localPath}`,
  );
}

/**
 * Destroy (terminate) a rented instance. Always call this in a finally block.
 */
export async function destroyInstance(instanceId: number): Promise<void> {
  const key = getApiKey();
  await vastFetch<unknown>(`/instances/${instanceId}/?api_key=${key}`, {
    method: "DELETE",
  });
  console.log(`[vast] Destroyed instance ${instanceId}`);
}
