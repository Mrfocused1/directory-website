"use client";

import type { TopPost } from "@/lib/analytics/mock-data";

export default function TopPostsTable({ posts }: { posts: TopPost[] }) {
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-bold">Top Posts</h3>
        <p className="text-xs text-[color:var(--fg-subtle)] mt-0.5">By click-through rate</p>
      </div>

      {/* Desktop table — hidden on mobile */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-b border-[color:var(--border)] text-[color:var(--fg-subtle)]">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-3 lg:px-5 py-2.5">Post</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-3 lg:px-5 py-2.5">Views</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-3 lg:px-5 py-2.5">Clicks</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-3 lg:px-5 py-2.5">CTR</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-3 lg:px-5 py-2.5 hidden md:table-cell">Avg Watch</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-3 lg:px-5 py-2.5 hidden md:table-cell">Shares</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post, i) => (
              <tr key={post.shortcode} className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-black/[0.02] transition">
                <td className="px-3 lg:px-5 py-3">
                  <div className="flex items-center gap-2 lg:gap-3">
                    <span className="text-xs font-bold text-[color:var(--fg-subtle)] w-5 tabular-nums">{i + 1}</span>
                    <span className="font-semibold text-sm truncate max-w-[180px] lg:max-w-[260px]">{post.title}</span>
                  </div>
                </td>
                <td className="text-right px-3 lg:px-5 py-3 tabular-nums font-medium">{post.views.toLocaleString()}</td>
                <td className="text-right px-3 lg:px-5 py-3 tabular-nums font-medium">{post.clicks.toLocaleString()}</td>
                <td className="text-right px-3 lg:px-5 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    post.ctr >= 40 ? "bg-green-100 text-green-700" :
                    post.ctr >= 25 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {post.ctr}%
                  </span>
                </td>
                <td className="text-right px-3 lg:px-5 py-3 tabular-nums text-[color:var(--fg-muted)] hidden md:table-cell">
                  {Math.floor(post.avgWatchTime / 60)}:{String(post.avgWatchTime % 60).padStart(2, "0")}
                </td>
                <td className="text-right px-3 lg:px-5 py-3 tabular-nums text-[color:var(--fg-muted)] hidden md:table-cell">{post.shares}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
        {posts.map((post, i) => (
          <div key={post.shortcode} className="px-4 py-3">
            <div className="flex items-start gap-2.5 mb-2">
              <span className="text-xs font-bold text-[color:var(--fg-subtle)] mt-0.5 w-5 shrink-0 tabular-nums">{i + 1}</span>
              <span className="font-semibold text-sm leading-snug">{post.title}</span>
            </div>
            <div className="flex items-center gap-3 ml-7">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                post.ctr >= 40 ? "bg-green-100 text-green-700" :
                post.ctr >= 25 ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              }`}>
                {post.ctr}% CTR
              </span>
              <span className="text-xs text-[color:var(--fg-muted)] tabular-nums">{post.clicks} clicks</span>
              <span className="text-xs text-[color:var(--fg-muted)] tabular-nums">{post.views} views</span>
              <span className="text-xs text-[color:var(--fg-muted)] tabular-nums ml-auto">{post.shares} shares</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
