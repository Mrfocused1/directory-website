export type SlotStatus = "live" | "coming_soon";

export type SlotType = {
  id: string;
  name: string;
  tagline: string;
  iconName: string;
  defaultPriceCents: number;
  status: SlotStatus;
};

export const SLOT_TYPES: SlotType[] = [
  {
    id: "pre_roll_video",
    name: "Pre-roll video",
    tagline: "Play a 15-30s video before posts open",
    iconName: "video",
    defaultPriceCents: 2500,
    status: "live",
  },
  {
    id: "pre_roll_image",
    name: "Pre-roll image",
    tagline: "Show a static ad before posts open",
    iconName: "image",
    defaultPriceCents: 1500,
    status: "live",
  },
  {
    id: "pre_roll_audio",
    name: "Pre-roll audio",
    tagline: "Podcast-style audio before TTS playback",
    iconName: "audio",
    defaultPriceCents: 1200,
    status: "coming_soon",
  },
  {
    id: "mid_roll_video",
    name: "Mid-roll video",
    tagline: "Insert ad mid-way through long videos",
    iconName: "film",
    defaultPriceCents: 2000,
    status: "coming_soon",
  },
  {
    id: "post_view_overlay",
    name: "Post-view overlay",
    tagline: "Sponsor moment when a viewer closes a post",
    iconName: "layers",
    defaultPriceCents: 1800,
    status: "coming_soon",
  },
  {
    id: "promoted_category",
    name: "Promoted category",
    tagline: "Sponsor an entire tab/category",
    iconName: "tag",
    defaultPriceCents: 2200,
    status: "coming_soon",
  },
  {
    id: "sponsored_reference",
    name: "Sponsored reference",
    tagline: "Native-looking reference inside posts",
    iconName: "link",
    defaultPriceCents: 1600,
    status: "coming_soon",
  },
  {
    id: "banner_top",
    name: "Banner (top)",
    tagline: "Full-width banner at the top of your directory",
    iconName: "layout",
    defaultPriceCents: 1000,
    status: "live",
  },
  {
    id: "sticky_ribbon",
    name: "Sticky ribbon",
    tagline: "Persistent ribbon at the bottom of the viewport",
    iconName: "minus",
    defaultPriceCents: 800,
    status: "live",
  },
  {
    id: "sidebar_card",
    name: "Sidebar card",
    tagline: "Card in the persistent sidebar",
    iconName: "sidebar",
    defaultPriceCents: 900,
    status: "coming_soon",
  },
  {
    id: "homepage_takeover",
    name: "Homepage takeover",
    tagline: "Full-page skin plus welcome overlay",
    iconName: "maximize",
    defaultPriceCents: 5000,
    status: "coming_soon",
  },
];

export function getSlotType(id: string): SlotType | undefined {
  return SLOT_TYPES.find((s) => s.id === id);
}
