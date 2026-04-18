export type ServiceName =
  | "scraper"
  | "piper"
  | "searxng"
  | "libretranslate"
  | "database"
  | "groq"
  | "anthropic"
  | "stripe"
  | "resend"
  | "upstash"
  | "pipeline";

export type ServiceStatus = "ok" | "degraded" | "down";
export type Severity = "info" | "warning" | "critical";

export type HealResult = { success: boolean; action: string; detail: string };

export type ServiceCheck = {
  service: ServiceName;
  status: ServiceStatus;
  latencyMs: number;
  message: string;
};

export type HealthReport = {
  overall: ServiceStatus;
  services: ServiceCheck[];
  timestamp: string;
};
