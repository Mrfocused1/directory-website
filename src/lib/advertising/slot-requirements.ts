/**
 * Creative requirements shown to advertisers when they select a slot
 * in the quote request form. Guides them on what file / dimensions /
 * format to prepare so the creator can actually accept the ad.
 *
 * Keep each line short and parseable at a glance — advertisers scan,
 * they don't read.
 */

export type SlotRequirement = {
  file: string; // accepted file formats / mime description
  dimensions: string; // aspect ratio / pixel size
  duration?: string; // for video / audio
  maxSizeMB: number;
  notes?: string;
};

export const SLOT_REQUIREMENTS: Record<string, SlotRequirement> = {
  pre_roll_video: {
    file: "MP4 or WebM (H.264, AAC audio)",
    dimensions: "1080×1920px, 9:16 vertical",
    duration: "15–30 seconds",
    maxSizeMB: 50,
    notes: "Sound-on — first second should hook the viewer.",
  },
  pre_roll_image: {
    file: "JPG, PNG, or WebP",
    dimensions: "1080×1920px, 9:16 vertical",
    maxSizeMB: 10,
    notes: "Keep key text and logo away from the edges (72px safe zone).",
  },
  pre_roll_audio: {
    file: "MP3, WAV, or M4A",
    dimensions: "Mono or stereo",
    duration: "10–20 seconds",
    maxSizeMB: 20,
    notes: "Podcast-style ad-read works best.",
  },
  mid_roll_video: {
    file: "MP4 or WebM (H.264, AAC audio)",
    dimensions: "1080×1920px, 9:16 vertical",
    duration: "15–20 seconds",
    maxSizeMB: 50,
    notes: "Shorter creatives keep completion rates high.",
  },
  post_view_overlay: {
    file: "JPG, PNG, or WebP",
    dimensions: "1080×1920px, 9:16 vertical",
    maxSizeMB: 10,
    notes: "Dismissible with one tap — strong single image beats dense copy.",
  },
  promoted_category: {
    file: "JPG, PNG, or WebP — plus tagline text",
    dimensions: "400×400px square logo",
    maxSizeMB: 5,
    notes: "Include a ≤60-character tagline for the category header.",
  },
  sponsored_reference: {
    file: "JPG, PNG, or WebP favicon/icon — plus title and URL",
    dimensions: "128×128px square",
    maxSizeMB: 2,
    notes: "Provide the link title (≤60 chars) and destination URL in the message.",
  },
  banner_top: {
    file: "JPG, PNG, or WebP",
    dimensions: "1280×96px (desktop), 640×96px (mobile)",
    maxSizeMB: 5,
    notes: "Avoid baked-in text; we overlay 'Sponsored' label automatically.",
  },
  sticky_ribbon: {
    file: "Text only — no image",
    dimensions: "≤80 characters + destination URL",
    maxSizeMB: 0,
    notes: "Send the exact copy you want in the ribbon.",
  },
  sidebar_card: {
    file: "JPG, PNG, or WebP",
    dimensions: "320×480px, 2:3 portrait",
    maxSizeMB: 5,
    notes: "Designed for a persistent sidebar — clear CTA works best.",
  },
  homepage_takeover: {
    file: "Two images: JPG, PNG, or WebP",
    dimensions: "1920×1080px desktop + 1080×1920px mobile",
    maxSizeMB: 15,
    notes: "The overlay only lasts 3–5 seconds — lead with the brand.",
  },
};
