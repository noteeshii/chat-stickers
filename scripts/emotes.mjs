export function emoteMap(set) {
  const result = new Map();
  for (const emote of set?.emotes || []) {
    if ((emote.data?.flags || 0) & 256) continue;
    const host = emote.data?.host;
    const files = host?.files || [];
    const file =
      files.find((f) => f.name === "2x.webp") ||
      files.find((f) => f.name.endsWith(".webp"));
    if (!file || !host?.url || !emote.name || !emote.id) continue;
    const url = `${host.url.startsWith("//") ? "https:" : ""}${host.url}/${file.name}`;
    if (!url.startsWith("https://")) continue;
    result.set(emote.name, {
      type: "emote",
      provider: "7tv",
      id: emote.id,
      code: emote.name,
      url,
      width: file.width || 1,
      height: file.height || 1,
    });
  }
  return result;
}

export class EmoteCatalog {
  constructor(fetcher = fetch, now = Date.now) {
    this.fetcher = fetcher;
    this.now = now;
    this.global = { map: new Map(), checkedAt: -Infinity, pending: null };
    this.channels = new Map();
    this.timer = setInterval(() => {
      this.get();
      for (const roomId of this.channels.keys()) this.get(roomId);
    }, 300000);
    this.timer.unref();
  }

  dispose() {
    clearInterval(this.timer);
  }
  async refresh(entry, url, select) {
    if (entry.pending || this.now() - entry.checkedAt < 300000)
      return entry.pending;
    entry.checkedAt = this.now();
    entry.pending = (async () => {
      try {
        const response = await this.fetcher(url, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.status === 404) {
          entry.map = new Map();
          return;
        }
        if (!response.ok) throw new Error(`7TV HTTP ${response.status}`);
        entry.map = emoteMap(select(await response.json()));
      } catch {
        // Сохраняем последний успешный набор, не задерживая чат.
      } finally {
        entry.pending = null;
      }
    })();
    return entry.pending;
  }
  get(roomId) {
    void this.refresh(
      this.global,
      "https://7tv.io/v3/emote-sets/global",
      (data) => data,
    );
    let channel = this.channels.get(roomId);
    if (roomId && !channel) {
      channel = { map: new Map(), checkedAt: -Infinity, pending: null };
      this.channels.set(roomId, channel);
    }
    if (channel)
      void this.refresh(
        channel,
        `https://7tv.io/v3/users/twitch/${encodeURIComponent(roomId)}`,
        (data) => data.emote_set,
      );
    return { global: this.global.map, channel: channel?.map || new Map() };
  }
}

export function parseMessageContent(rawText, emotesTag = "", catalogs = {}) {
  const text = rawText.startsWith("\u0001ACTION ")
    ? rawText.slice(8).replace(/\u0001$/, "")
    : rawText;
  const chars = Array.from(text);
  const ranges = [];
  for (const group of emotesTag.split("/")) {
    const [id, positions] = group.split(":");
    if (!id || !positions || !/^[\w-]+$/.test(id)) continue;
    for (const position of positions.split(",")) {
      if (!/^\d+-\d+$/.test(position)) continue;
      const [start, end] = position.split("-").map(Number);
      if (start > end || end >= chars.length) continue;
      ranges.push({
        start,
        end: end + 1,
        emote: {
          type: "emote",
          provider: "twitch",
          id,
          code: chars.slice(start, end + 1).join(""),
          url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/light/2.0`,
          width: 1,
          height: 1,
        },
      });
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const valid = [];
  for (const range of ranges)
    if (range.start >= (valid.at(-1)?.end || 0)) valid.push(range);
  for (const match of text.matchAll(/\S+/gu)) {
    const emote =
      catalogs.channel?.get(match[0]) || catalogs.global?.get(match[0]);
    if (!emote) continue;
    const start = Array.from(text.slice(0, match.index)).length;
    const end = start + Array.from(match[0]).length;
    if (!valid.some((r) => start < r.end && end > r.start))
      valid.push({ start, end, emote });
  }
  valid.sort((a, b) => a.start - b.start);
  let limit = Math.min(220, chars.length);
  if (chars.length > limit) {
    let boundary = 0;
    for (const { segment } of new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(text)) {
      const next = boundary + Array.from(segment).length;
      if (next > limit) break;
      boundary = next;
    }
    limit = boundary;
  }
  const crossing = valid.find((r) => r.start < limit && r.end > limit);
  if (crossing) limit = crossing.start;
  const content = [];
  let cursor = 0;
  for (const range of valid) {
    if (range.end > limit) break;
    if (range.start > cursor)
      content.push({
        type: "text",
        text: chars.slice(cursor, range.start).join(""),
      });
    content.push(range.emote);
    cursor = range.end;
  }
  if (cursor < limit)
    content.push({ type: "text", text: chars.slice(cursor, limit).join("") });
  return { text: chars.slice(0, limit).join(""), content };
}
