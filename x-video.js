var XVD_VIDEO = (() => {
  function isSite(value) {
    try { const url = new URL(value); return url.protocol === "https:" && ["x.com", "twitter.com"].includes(url.hostname); }
    catch { return false; }
  }
  function parseUrl(value) {
    if (!isSite(value)) return null;
    const url = new URL(value);
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})(?:\/video\/1)?\/?$/);
    if (!match) return null;
    return { videoId: `${match[1]}:${match[2]}`, postId: match[2], author: match[1], url: `https://x.com/${match[1]}/status/${match[2]}` };
  }
  function canonicalUrl(videoId) {
    const match = String(videoId || "").match(/^([A-Za-z0-9_]{1,15}):(\d{1,25})$/);
    if (!match) throw new Error("Invalid X video ID.");
    return `https://x.com/${match[1]}/status/${match[2]}`;
  }
  function parseTranscript(input) {
    const data = input?.result || input;
    const transcript = [];
    for (const chunk of Array.isArray(data?.content) ? data.content : []) {
      if (typeof chunk.text !== "string" || !Number.isFinite(chunk.offset) || chunk.offset < 0) continue;
      const text = chunk.text.replace(/>> ?/g, "").trim();
      if (!text) continue;
      transcript.push({ text, start: chunk.offset / 1000, duration: Math.max(0, Number(chunk.duration) || 0) / 1000, language: chunk.lang || data.lang || null });
    }
    transcript.sort((a, b) => a.start - b.start);
    if (!transcript.length) return { success: false, error: "EMPTY_TRANSCRIPT", message: "视频中没有检测到可用的语音字幕。" };
    return {
      success: true, transcript, language: typeof data.lang === "string" ? data.lang : null,
      transcriptText: transcript.map(chunk => chunk.text).join(" "),
      transcriptTextTimestamped: transcript.map(chunk => `[${Math.floor(chunk.start / 60)}:${String(Math.floor(chunk.start % 60)).padStart(2, "0")}] ${chunk.text}`).join("\n"),
    };
  }
  return { isSite, parseUrl, canonicalUrl, parseTranscript };
})();
if (typeof module !== "undefined" && module.exports) module.exports = XVD_VIDEO;
