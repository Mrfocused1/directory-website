/**
 * Vast.ai GPU rental client — real SSH implementation.
 *
 * Lifecycle: find GPU → rent → wait for ready → SSH commands → destroy.
 * Requires env: VAST_API_KEY
 */

import { Client } from "ssh2";

const VAST_BASE = "https://console.vast.ai/api/v0";

function apiKey(): string {
  const k = process.env.VAST_API_KEY;
  if (!k) throw new Error("VAST_API_KEY not set");
  return k;
}

export interface VastInstance {
  id: number;
  status: string;
  sshHost: string;
  sshPort: number;
}

// ─── API helpers ────────────────────────────────────────────────────

async function vastFetch(path: string, init?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${VAST_BASE}${path}${sep}api_key=${apiKey()}`;
  const res = await fetch(url, { ...init, redirect: "follow" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vast API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Find cheapest GPU with ≥20GB VRAM and fast internet */
export async function findGpu(): Promise<{ id: number; gpu: string; price: number }> {
  const q = encodeURIComponent(JSON.stringify({
    gpu_ram: { gte: 20000 },
    inet_down: { gte: 400 },
    disk_space: { gte: 20 },
    rentable: { eq: true },
    dph_total: { lte: 0.15 },
    order: [["inet_down", "desc"]],
    limit: 1,
  }));
  const data = await vastFetch(`/bundles/?q=${q}`);
  const offers = data.offers || [];
  if (offers.length === 0) throw new Error("No GPU available on Vast.ai");
  const o = offers[0];
  return { id: o.id, gpu: o.gpu_name, price: o.dph_total };
}

/** Rent a GPU instance */
export async function rentGpu(offerId: number): Promise<number> {
  const data = await vastFetch(`/asks/${offerId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "me",
      image: "pytorch/pytorch:2.1.0-cuda12.1-cudnn8-devel",
      disk: 20,
      label: "bmd-dub",
    }),
  });
  if (!data.success) throw new Error("Failed to rent GPU: " + JSON.stringify(data));
  return data.new_contract;
}

/** Wait for instance to reach "running" state */
export async function waitForReady(instanceId: number, timeoutMs = 300_000): Promise<VastInstance> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await vastFetch("/instances/");
    const instances = data.instances || [];
    const inst = instances.find((i: Record<string, unknown>) => i.id === instanceId);
    if (inst && inst.actual_status === "running") {
      return {
        id: inst.id,
        status: "running",
        sshHost: inst.ssh_host || "",
        sshPort: inst.ssh_port || 22,
      };
    }
    if (inst && (inst.actual_status === "exited" || inst.actual_status === "error")) {
      throw new Error(`Instance ${instanceId} failed: ${inst.actual_status}`);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`Instance ${instanceId} timed out after ${timeoutMs / 1000}s`);
}

/** Destroy an instance immediately */
export async function destroyGpu(instanceId: number): Promise<void> {
  await vastFetch(`/instances/${instanceId}/`, { method: "DELETE" });
  console.log(`[vast] Instance ${instanceId} destroyed`);
}

// ─── SSH execution ──────────────────────────────────────────────────

/** Run a command on the GPU instance via SSH. Returns stdout. */
export function sshExec(
  host: string,
  port: number,
  command: string,
  timeoutMs = 300_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    // Read SSH private key — Vast.ai uses key-based auth
    const fs = require("fs");
    const homeDir = process.env.HOME || "/root";
    let privateKey: Buffer | undefined;
    for (const keyFile of ["id_ed25519", "id_rsa"]) {
      const keyPath = `${homeDir}/.ssh/${keyFile}`;
      try { privateKey = fs.readFileSync(keyPath); break; } catch {}
    }

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) { clearTimeout(timer); conn.end(); reject(err); return; }
          stream
            .on("close", () => {
              clearTimeout(timer);
              conn.end();
              if (stderr && !stdout) reject(new Error(stderr.slice(0, 500)));
              else resolve(stdout);
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
              process.stdout.write(data); // live logging
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString();
            });
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host,
        port,
        username: "root",
        privateKey,
        readyTimeout: 30_000,
        algorithms: { serverHostKey: ["ssh-rsa", "ssh-ed25519", "ecdsa-sha2-nistp256"] },
      } as Parameters<Client["connect"]>[0]);
  });
}

// ─── Convenience: full lifecycle ────────────────────────────────────

/** Rent a GPU, run a job, destroy it. Returns job output. */
export async function withGpu<T>(
  job: (instance: VastInstance) => Promise<T>,
): Promise<T> {
  console.log("[vast] Finding cheapest GPU...");
  const offer = await findGpu();
  console.log(`[vast] Renting ${offer.gpu} at $${offer.price.toFixed(3)}/hr...`);

  const contractId = await rentGpu(offer.id);
  console.log(`[vast] Instance ${contractId} rented. Waiting for boot...`);

  try {
    const instance = await waitForReady(contractId);
    console.log(`[vast] Instance ready: ${instance.sshHost}:${instance.sshPort}`);

    const result = await job(instance);
    return result;
  } finally {
    console.log(`[vast] Destroying instance ${contractId}...`);
    await destroyGpu(contractId).catch((e) => console.error("[vast] Destroy failed:", e));
  }
}
