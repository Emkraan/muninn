import {
  WidgetModule,
  WidgetStatus,
  WidgetConfig,
  WidgetListItem,
  fetchWithTimeout,
  requireUrl,
  nowIso,
} from "../types";

// Minimal, dependency-free iCalendar (RFC 5545) parser: unfold lines, extract
// VEVENT SUMMARY + DTSTART. Enough for an upcoming-events widget without pulling
// a heavy ICS library into the image.
function unfold(ics: string): string[] {
  const rawLines = ics.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDate(value: string): Date | null {
  // Forms: 20260719, 20260719T130000Z, 20260719T130000
  const m = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/
  );
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (hh === undefined) {
    return new Date(Date.UTC(+y, +mo - 1, +d));
  }
  if (z === "Z") {
    return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss));
  }
  // Floating/local time: interpret as local.
  return new Date(+y, +mo - 1, +d, +hh, +mm, +ss);
}

const calendar: WidgetModule = {
  id: "calendar",
  displayName: "Calendar",
  description: "Upcoming events from a generic iCalendar (ICS) feed.",
  defaultRefreshIntervalSeconds: 900,
  configSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        title: "ICS feed URL",
        description: "Any public/authenticated .ics calendar URL",
      },
      limit: { type: "number", title: "Max events shown", default: 6 },
    },
    required: ["url"],
  },
  async fetchStatus(config: WidgetConfig): Promise<WidgetStatus> {
    try {
      const url = requireUrl(config);
      const limit =
        typeof config.limit === "number" && config.limit > 0
          ? Math.floor(config.limit)
          : 6;

      const res = await fetchWithTimeout(url);
      if (!res.ok)
        return { ok: false, error: `HTTP ${res.status}`, fetchedAt: nowIso() };

      const text = await res.text();
      const lines = unfold(text);

      const events: { summary: string; start: Date }[] = [];
      let cur: { summary?: string; start?: Date } | null = null;
      for (const line of lines) {
        if (line === "BEGIN:VEVENT") {
          cur = {};
        } else if (line === "END:VEVENT") {
          if (cur?.start) {
            events.push({
              summary: cur.summary || "(untitled)",
              start: cur.start,
            });
          }
          cur = null;
        } else if (cur) {
          const idx = line.indexOf(":");
          if (idx === -1) continue;
          const key = line.slice(0, idx);
          const val = line.slice(idx + 1);
          if (key === "SUMMARY") cur.summary = val;
          else if (key.startsWith("DTSTART")) {
            const parsed = parseIcsDate(val.trim());
            if (parsed) cur.start = parsed;
          }
        }
      }

      const now = Date.now();
      const upcoming = events
        .filter((e) => e.start.getTime() >= now - 12 * 3600 * 1000)
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(0, limit);

      const items: WidgetListItem[] = upcoming.map((e) => ({
        title: e.summary,
        subtitle: e.start.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        timestamp: e.start.toISOString(),
      }));

      return {
        ok: true,
        title: "Calendar",
        summary:
          upcoming.length > 0
            ? `Next: ${upcoming[0].summary}`
            : "No upcoming events",
        items,
        fetchedAt: nowIso(),
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
        fetchedAt: nowIso(),
      };
    }
  },
};

export default calendar;
