/**
 * Mock newsletter/subscriber data for the dashboard demo.
 */

import { subDays, format } from "date-fns";

export type Subscriber = {
  id: string;
  email: string;
  name: string | null;
  categories: string[];
  frequency: "weekly" | "daily" | "monthly";
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
};

export type DigestEntry = {
  id: string;
  subject: string;
  postCount: number;
  recipientCount: number;
  openCount: number;
  clickCount: number;
  sentAt: string;
};

export type GrowthPoint = {
  date: string;
  total: number;
  newSubs: number;
};

// Fixed date for deterministic rendering
const today = new Date("2026-04-13T12:00:00Z");

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function getMockSubscribers(): Subscriber[] {
  return [
    { id: "sub-1", email: "marcus@gmail.com", name: "Marcus", categories: [], frequency: "weekly", isVerified: true, isActive: true, createdAt: "2026-03-15T10:00:00Z" },
    { id: "sub-2", email: "amara.jones@outlook.com", name: "Amara", categories: ["Africa", "Economics"], frequency: "weekly", isVerified: true, isActive: true, createdAt: "2026-03-18T14:30:00Z" },
    { id: "sub-3", email: "kofi.mensah@yahoo.com", name: "Kofi", categories: ["Africa"], frequency: "daily", isVerified: true, isActive: true, createdAt: "2026-03-20T09:00:00Z" },
    { id: "sub-4", email: "zainab@hotmail.com", name: "Zainab", categories: ["Economics", "Politics"], frequency: "weekly", isVerified: true, isActive: true, createdAt: "2026-03-22T16:45:00Z" },
    { id: "sub-5", email: "david.smith@gmail.com", name: "David", categories: [], frequency: "monthly", isVerified: true, isActive: true, createdAt: "2026-03-25T11:00:00Z" },
    { id: "sub-6", email: "ngozi.okafor@gmail.com", name: "Ngozi", categories: ["Black History"], frequency: "weekly", isVerified: true, isActive: true, createdAt: "2026-03-28T08:00:00Z" },
    { id: "sub-7", email: "tendai@proton.me", name: "Tendai", categories: ["Current Affairs"], frequency: "weekly", isVerified: true, isActive: true, createdAt: "2026-04-01T13:20:00Z" },
    { id: "sub-8", email: "sarah.k@gmail.com", name: "Sarah", categories: [], frequency: "weekly", isVerified: true, isActive: true, createdAt: "2026-04-03T10:00:00Z" },
    { id: "sub-9", email: "james.obi@outlook.com", name: "James", categories: ["Africa", "Politics"], frequency: "daily", isVerified: true, isActive: true, createdAt: "2026-04-05T15:30:00Z" },
    { id: "sub-10", email: "fatima@gmail.com", name: "Fatima", categories: ["Economics"], frequency: "weekly", isVerified: true, isActive: true, createdAt: "2026-04-07T12:00:00Z" },
    { id: "sub-11", email: "chen.wei@mail.com", name: null, categories: [], frequency: "weekly", isVerified: true, isActive: true, createdAt: "2026-04-09T09:00:00Z" },
    { id: "sub-12", email: "old.user@gmail.com", name: "Former Reader", categories: [], frequency: "weekly", isVerified: true, isActive: false, createdAt: "2026-03-10T10:00:00Z" },
    { id: "sub-13", email: "unverified@test.com", name: null, categories: [], frequency: "weekly", isVerified: false, isActive: true, createdAt: "2026-04-12T18:00:00Z" },
  ];
}

export function getMockDigests(): DigestEntry[] {
  return [
    { id: "d-1", subject: "This week: Nigeria's oil revenue & Rwanda's growth story", postCount: 4, recipientCount: 9, openCount: 7, clickCount: 4, sentAt: "2026-04-12T08:00:00Z" },
    { id: "d-2", subject: "New posts on BRICS expansion & CFA Franc economics", postCount: 3, recipientCount: 8, openCount: 6, clickCount: 3, sentAt: "2026-04-05T08:00:00Z" },
    { id: "d-3", subject: "Africa's lithium boom + 2 more posts this week", postCount: 3, recipientCount: 7, openCount: 5, clickCount: 3, sentAt: "2026-03-29T08:00:00Z" },
    { id: "d-4", subject: "Pan-Africanism history & South Africa's energy crisis", postCount: 5, recipientCount: 5, openCount: 4, clickCount: 2, sentAt: "2026-03-22T08:00:00Z" },
  ];
}

export function getMockGrowth(): GrowthPoint[] {
  const rand = seededRandom(500);
  let total = 2;
  return Array.from({ length: 30 }, (_, i) => {
    const date = subDays(today, 29 - i);
    const newSubs = Math.round(rand() * 1.5);
    total += newSubs;
    return {
      date: format(date, "yyyy-MM-dd"),
      total,
      newSubs,
    };
  });
}

export function getMockCategoryBreakdown(subscribers: Subscriber[]): { category: string; count: number }[] {
  const active = subscribers.filter((s) => s.isActive && s.isVerified);
  const allCats = ["Africa", "Economics", "Politics", "Black History", "Current Affairs"];
  const counts: Record<string, number> = {};

  for (const cat of allCats) counts[cat] = 0;

  for (const sub of active) {
    if (sub.categories.length === 0) {
      // Subscribed to all
      for (const cat of allCats) counts[cat]++;
    } else {
      for (const cat of sub.categories) {
        if (cat in counts) counts[cat]++;
      }
    }
  }

  return allCats.map((c) => ({ category: c, count: counts[c] })).sort((a, b) => b.count - a.count);
}
