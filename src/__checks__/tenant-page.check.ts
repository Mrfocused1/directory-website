import { ApiCheck, AssertionBuilder } from "checkly/constructs";

/**
 * Tenant pages are the main value delivery — if /themoneystocker is
 * down, paying creators are losing visibility right now.
 */

new ApiCheck("tenant-page-200", {
  name: "/themoneystocker 200 OK",
  request: {
    method: "GET",
    url: "https://buildmy.directory/themoneystocker",
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.responseTime().lessThan(3000),
      AssertionBuilder.textBody().contains("themoneystocker"),
    ],
  },
  degradedResponseTime: 1500,
  maxResponseTime: 3000,
});

new ApiCheck("tenant-rss-valid", {
  name: "tenant RSS feed valid",
  request: {
    method: "GET",
    url: "https://buildmy.directory/themoneystocker/feed.xml",
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.textBody().contains("<rss"),
    ],
  },
});
