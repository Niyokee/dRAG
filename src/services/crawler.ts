import * as cheerio from "cheerio";
import type { CrawledPage, CrawlOptions } from "../types.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

const {
  defaultMaxPages: DEFAULT_MAX_PAGES,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  requestDelayMs: REQUEST_DELAY_MS,
  maxDepthLimit: MAX_DEPTH_LIMIT,
  maxResponseSizeBytes: MAX_RESPONSE_SIZE_BYTES,
  userAgent: USER_AGENT,
} = config.crawler;

// SSRF Protection: Block internal/private networks
const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254", // AWS/GCP metadata
];

const BLOCKED_HOSTNAME_PATTERNS = [
  /^10\.\d+\.\d+\.\d+$/, // 10.x.x.x
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/, // 172.16-31.x.x
  /^192\.168\.\d+\.\d+$/, // 192.168.x.x
  /\.local$/, // .local domains
  /\.internal$/, // .internal domains
];

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return true;
    }

    for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    // Block non-standard ports for security
    if (parsed.port && !["80", "443", ""].includes(parsed.port)) {
      return true;
    }

    return false;
  } catch {
    return true; // Block invalid URLs
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function crawlWebsite(
  startUrl: string,
  options: CrawlOptions
): Promise<CrawledPage[]> {
  // Enforce max depth limit
  const maxDepth = Math.min(options.maxDepth, MAX_DEPTH_LIMIT);
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const allowedDomains = options.allowedDomains;

  // SSRF check on start URL
  if (isBlockedUrl(startUrl)) {
    throw new Error("URL is not allowed: internal or private network detected");
  }

  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];

  const startDomain = new URL(startUrl).hostname;
  const domains = allowedDomains ?? [startDomain];

  while (queue.length > 0 && pages.length < maxPages) {
    const item = queue.shift();
    if (!item) break;

    const { url, depth } = item;

    if (visited.has(url) || depth > maxDepth) {
      continue;
    }

    // SSRF check on each URL
    if (isBlockedUrl(url)) {
      continue;
    }

    visited.add(url);

    try {
      const page = await fetchAndParsePage(url);
      if (page) {
        pages.push(page);

        if (depth < maxDepth) {
          const validLinks = filterValidLinks(page.links, domains, visited);
          for (const link of validLinks) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      // Rate limiting: delay between requests
      if (queue.length > 0) {
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (error) {
      logger.error(`Failed to crawl ${url}`, error);
    }
  }

  return pages;
}

async function fetchAndParsePage(url: string): Promise<CrawledPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Disable automatic redirects to validate redirect URLs for SSRF
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    // Handle redirects manually with SSRF validation
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return null;
      }

      const redirectUrl = new URL(location, url).href;

      // SSRF check on redirect URL
      if (isBlockedUrl(redirectUrl)) {
        logger.warn("Blocked redirect to internal URL", { from: url, to: redirectUrl });
        return null;
      }

      // Follow the redirect (single hop only to prevent redirect chains)
      return fetchWithoutRedirect(redirectUrl, controller.signal);
    }

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return null;
    }

    // Check Content-Length header if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE_BYTES) {
      logger.warn("Response too large, skipping", { url, size: contentLength });
      return null;
    }

    // Read response with size limit using streaming
    const html = await readResponseWithLimit(response, url);
    if (!html) {
      return null;
    }

    return parsePage(url, html);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read response body with size limit using streaming
 */
async function readResponseWithLimit(response: Response, url: string): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  let streamDone = false;

  while (!streamDone) {
    const result = await reader.read();
    streamDone = result.done;

    if (result.value) {
      const chunk = result.value as Uint8Array;
      totalSize += chunk.length;

      if (totalSize > MAX_RESPONSE_SIZE_BYTES) {
        logger.warn("Response exceeded size limit during streaming", { url, size: totalSize });
        await reader.cancel();
        return null;
      }

      chunks.push(chunk);
    }
  }

  return new TextDecoder().decode(
    chunks.reduce((acc, chunk) => {
      const result = new Uint8Array(acc.length + chunk.length);
      result.set(acc);
      result.set(chunk, acc.length);
      return result;
    }, new Uint8Array(0))
  );
}

/**
 * Fetch a URL without following redirects (used after manual redirect validation)
 */
async function fetchWithoutRedirect(url: string, signal: AbortSignal): Promise<CrawledPage | null> {
  const response = await fetch(url, {
    signal,
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });

  // Don't follow further redirects
  if (!response.ok || (response.status >= 300 && response.status < 400)) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return null;
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE_BYTES) {
    logger.warn("Response too large, skipping", { url, size: contentLength });
    return null;
  }

  const html = await readResponseWithLimit(response, url);
  if (!html) {
    return null;
  }

  return parsePage(url, html);
}

function parsePage(url: string, html: string): CrawledPage {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $("script, style, nav, footer, header, aside, .sidebar, .navigation").remove();

  const title = $("title").text().trim() || $("h1").first().text().trim() || url;

  // Extract main content
  const mainContent =
    $("main").text() || $("article").text() || $('[role="main"]').text() || $("body").text();

  const content = cleanText(mainContent);

  // Extract links
  const links: string[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      try {
        const absoluteUrl = new URL(href, url).href;
        if (absoluteUrl.startsWith("http")) {
          links.push(absoluteUrl);
        }
      } catch {
        // Invalid URL, skip
      }
    }
  });

  return {
    url,
    title,
    content,
    links: [...new Set(links)],
    crawledAt: new Date(),
  };
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

function filterValidLinks(
  links: string[],
  allowedDomains: string[],
  visited: Set<string>
): string[] {
  return links.filter((link) => {
    if (visited.has(link)) return false;

    try {
      const url = new URL(link);
      // Skip non-page URLs
      if (url.hash || link.match(/\.(pdf|zip|png|jpg|gif|svg|css|js)$/i)) {
        return false;
      }
      return allowedDomains.some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  });
}
