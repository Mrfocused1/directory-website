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

new ApiCheck("auth-endpoint-reachable", {
  name: "auth endpoint reachable",
  request: {
    method: "GET",
    url: "https://buildmy.directory/api/auth/is-admin",
    assertions: [
      // Anonymous callers get 200 with {isAdmin:false}. Any non-200
      // means auth session handling is broken.
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody("$.isAdmin").equals(false),
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
