/**
 * Mock content request data for the demo.
 * In production, replaced by DB queries.
 */

export type ContentRequest = {
  id: string;
  title: string;
  description: string | null;
  authorName: string | null;
  status: "open" | "planned" | "in_progress" | "completed" | "declined";
  isPinned: boolean;
  voteCount: number;
  hasVoted: boolean; // whether the current session has voted
  creatorNote: string | null;
  completedPostShortcode: string | null;
  createdAt: string;
  updatedAt?: string;
};

export const STATUS_CONFIG: Record<
  ContentRequest["status"],
  { label: string; color: string; bg: string }
> = {
  open: { label: "Open", color: "text-blue-700", bg: "bg-blue-100" },
  planned: { label: "Planned", color: "text-purple-700", bg: "bg-purple-100" },
  in_progress: { label: "In Progress", color: "text-yellow-700", bg: "bg-yellow-100" },
  completed: { label: "Completed", color: "text-green-700", bg: "bg-green-100" },
  declined: { label: "Declined", color: "text-red-700", bg: "bg-red-100" },
};

export function getMockRequests(): ContentRequest[] {
  return [
    {
      id: "req-1",
      title: "Deep dive into Rwanda's economic transformation",
      description: "Would love a detailed breakdown of how Rwanda went from the 1994 genocide to one of Africa's fastest growing economies. What policies worked?",
      authorName: "Marcus",
      status: "planned",
      isPinned: true,
      voteCount: 47,
      hasVoted: false,
      creatorNote: "Great suggestion! I've been researching this — expect it within the next few weeks.",
      completedPostShortcode: null,
      createdAt: "2026-04-10T14:30:00Z",
    },
    {
      id: "req-2",
      title: "The impact of BRICS expansion on African economies",
      description: "Now that more African nations are joining BRICS, what does this mean economically? Trade shifts? Currency implications?",
      authorName: "Amara",
      status: "open",
      isPinned: false,
      voteCount: 38,
      hasVoted: true,
      creatorNote: null,
      completedPostShortcode: null,
      createdAt: "2026-04-08T09:15:00Z",
    },
    {
      id: "req-3",
      title: "Africa's lithium boom — who benefits?",
      description: "Zimbabwe, DRC, and Mali are sitting on massive lithium deposits. Are African countries actually benefiting or is it another resource extraction story?",
      authorName: null,
      status: "in_progress",
      isPinned: false,
      voteCount: 34,
      hasVoted: false,
      creatorNote: "Currently filming this one. Will cover Zimbabwe and DRC specifically.",
      completedPostShortcode: null,
      createdAt: "2026-04-05T18:00:00Z",
    },
    {
      id: "req-4",
      title: "History of Pan-Africanism movement",
      description: "From Kwame Nkrumah to the AU — a timeline of the Pan-African movement and where it stands today.",
      authorName: "Kofi",
      status: "completed",
      isPinned: false,
      voteCount: 29,
      hasVoted: false,
      creatorNote: "Done! Check it out.",
      completedPostShortcode: "post-5",
      createdAt: "2026-03-28T11:00:00Z",
    },
    {
      id: "req-5",
      title: "Comparison of mobile money across Africa",
      description: "M-Pesa in Kenya vs MTN Mobile Money vs OPay in Nigeria. Which model is winning and why?",
      authorName: "Zainab",
      status: "open",
      isPinned: false,
      voteCount: 26,
      hasVoted: false,
      creatorNote: null,
      completedPostShortcode: null,
      createdAt: "2026-04-11T20:00:00Z",
    },
    {
      id: "req-6",
      title: "The economics behind African football transfers",
      description: "How much money flows from European clubs to African academies? What's the real economics of the talent pipeline?",
      authorName: "David",
      status: "open",
      isPinned: false,
      voteCount: 22,
      hasVoted: false,
      creatorNote: null,
      completedPostShortcode: null,
      createdAt: "2026-04-12T08:30:00Z",
    },
    {
      id: "req-7",
      title: "AfCFTA one year later — is it working?",
      description: null,
      authorName: "Ngozi",
      status: "open",
      isPinned: false,
      voteCount: 19,
      hasVoted: false,
      creatorNote: null,
      completedPostShortcode: null,
      createdAt: "2026-04-09T16:45:00Z",
    },
    {
      id: "req-8",
      title: "Why is Ethiopia's economy growing despite the civil war?",
      description: "The numbers don't make sense on the surface. Would love an explainer.",
      authorName: null,
      status: "open",
      isPinned: false,
      voteCount: 15,
      hasVoted: false,
      creatorNote: null,
      completedPostShortcode: null,
      createdAt: "2026-04-07T12:00:00Z",
    },
    {
      id: "req-9",
      title: "Crypto adoption rates in Africa vs rest of the world",
      description: "Nigeria and Kenya lead globally in P2P crypto trading. Why is Africa ahead on adoption?",
      authorName: "Tendai",
      status: "declined",
      isPinned: false,
      voteCount: 12,
      hasVoted: false,
      creatorNote: "This doesn't quite fit my content focus right now, but appreciate the suggestion!",
      completedPostShortcode: null,
      createdAt: "2026-04-01T10:00:00Z",
    },
  ];
}
