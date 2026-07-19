import { prisma } from "@linkwarden/prisma";
import Parser from "rss-parser";
import { delay } from "@linkwarden/lib/utils";
import { rssHandler } from "@linkwarden/lib/rssHandler";
import { assertUrlIsSafeForServerSideFetch } from "@linkwarden/lib/ssrf";
import { safeFetch } from "@linkwarden/lib/safeFetch";

const pollingIntervalInSeconds =
  (Number(process.env.NEXT_PUBLIC_RSS_POLLING_INTERVAL_MINUTES) || 60) * 60; // Default to one hour if not set

// Per-feed network timeout. safeFetch (node-fetch v2) has no default timeout,
// so a single feed whose server accepts the connection but never responds keeps
// its fetch pending forever. Because every feed is awaited together in one
// Promise.all below, that one hung request makes the whole batch never settle,
// which freezes the polling loop indefinitely (no further cycles ever run).
const feedTimeoutInMs = 30_000;

export async function startRSSPolling() {
  console.log("\x1b[34m%s\x1b[0m", "Starting RSS polling...");
  while (true) {
    const rssSubscriptions = await prisma.rssSubscription.findMany({});

    const parser = new Parser();

    // allSettled (not all) so one failed feed can never reject the whole batch.
    await Promise.allSettled(
      rssSubscriptions.map(async (rssSubscription) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), feedTimeoutInMs);

        try {
          await assertUrlIsSafeForServerSideFetch(rssSubscription.url);
          const xml = await safeFetch(rssSubscription.url, {
            signal: controller.signal,
            timeout: feedTimeoutInMs,
          }).then((res) => res.text());
          const feed = await parser.parseString(xml);
          await rssHandler(rssSubscription, feed);
        } catch (error) {
          console.error(
            "\x1b[34m%s\x1b[0m",
            `Error processing RSS feed ${rssSubscription.url}:`,
            error
          );
        } finally {
          clearTimeout(timeout);
        }
      })
    );
    await delay(pollingIntervalInSeconds);
  }
}
