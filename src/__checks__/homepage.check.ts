import { ApiCheck, AssertionBuilder } from "checkly/constructs";

/**
 * Homepage is the most important endpoint to monitor. 5-minute ping
 * from 3 regions; if two regions fail the same check back-to-back,
 * we page.
 */

new ApiCheck("homepage-200", {
  name: "homepage 200 OK",
  alertChannels: [], // wired up in dashboard
  request: {
    method: "GET",
    url: "https://buildmy.directory/",
    followRedirects: true,
    skipSSL: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.responseTime().lessThan(3000),
    ],
  },
  degradedResponseTime: 1500,
  maxResponseTime: 3000,
});

new ApiCheck("signup-endpoint-reachable", {
  name: "/api/auth/signup responds <3s",
  request: {
    method: "POST",
    url: "https://buildmy.directory/api/auth/signup",
    headers: [{ key: "Content-Type", value: "application/json" }],
    body: JSON.stringify({ email: "checkly@example.com", password: "short" }),
    bodyType: "JSON",
    assertions: [
      // Expect 400 (validation error for short password) — proves
      // the endpoint ran without 5xx'ing.
      AssertionBuilder.statusCode().lessThan(500),
      AssertionBuilder.responseTime().lessThan(3000),
    ],
  },
});

new ApiCheck("sitemap-200", {
  name: "sitemap.xml 200 OK",
  request: {
    method: "GET",
    url: "https://buildmy.directory/sitemap.xml",
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.headers("content-type").contains("xml"),
    ],
  },
});

new ApiCheck("robots-200", {
  name: "robots.txt 200 OK",
  request: {
    method: "GET",
    url: "https://buildmy.directory/robots.txt",
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.textBody().contains("Disallow:"),
    ],
  },
});
