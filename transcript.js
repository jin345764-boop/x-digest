// Fetch in the panel context: generated subtitles may take longer than a MV3 worker's fetch limit.
var XVD_TRANSCRIPT = (() => {
  const inFlight = new Map();
  async function request(url, key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try { return await fetch(url, { headers: { "x-api-key": key }, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }
  async function poll(jobId, jobKey, key, progress) {
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
      progress("正在处理视频字幕", "Supadata 正在转写。重新打开面板后会继续查询同一任务，不会重新提交。");
      const response = await request(`https://api.supadata.ai/v1/transcript/${encodeURIComponent(jobId)}`, key);
      if (response.status === 404) {
        await chrome.storage.local.remove(jobKey);
        throw new Error("字幕任务已过期。请重新打开面板后重试。");
      }
      if (!response.ok) throw new Error(`字幕任务查询失败（HTTP ${response.status}），请稍后重新打开面板继续。`);
      const data = await response.json();
      if (data.status === "completed") {
        const result = XVD_VIDEO.parseTranscript(data);
        await chrome.storage.local.remove(jobKey);
        return result;
      }
      if (data.status === "failed") {
        await chrome.storage.local.remove(jobKey);
        throw new Error("Supadata 未能处理这个视频。请确认视频可公开访问且含有语音。");
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("字幕仍在处理中，请稍后重新打开面板继续查询。任务已保留。");
  }
  async function run(videoId, progress) {
    try {
      const stored = await chrome.storage.local.get(YTD_SETTINGS.STORAGE_KEY);
      const settings = YTD_SETTINGS.normalize(stored[YTD_SETTINGS.STORAGE_KEY]);
      if (!settings.supadataApiKey) return { success: false, error: "NO_SUPADATA_KEY", message: "请在 X Digest 设置中填写 Supadata API 密钥。" };
      const url = new URL("https://api.supadata.ai/v1/transcript");
      url.searchParams.set("url", XVD_VIDEO.canonicalUrl(videoId));
      url.searchParams.set("text", "false");
      url.searchParams.set("lang", "en");
      url.searchParams.set("mode", settings.transcriptMode);
      const jobKey = `xvd_job_${videoId}`;
      const pending = (await chrome.storage.local.get(jobKey))[jobKey];
      if (pending?.jobId) return await poll(pending.jobId, jobKey, settings.supadataApiKey, progress);
      progress("正在获取视频字幕", settings.transcriptMode === "auto" ? "如无原生字幕，Supadata 将生成字幕，按视频时长计费。" : "只获取现有字幕，不会生成字幕。");
      const response = await request(url.toString(), settings.supadataApiKey);
      if (response.status === 202) {
        const data = await response.json();
        if (typeof data.jobId !== "string" || !data.jobId) throw new Error("Supadata 没有返回可用的字幕任务编号。");
        await chrome.storage.local.set({ [jobKey]: { jobId: data.jobId, createdAt: Date.now() } });
        return await poll(data.jobId, jobKey, settings.supadataApiKey, progress);
      }
      if (response.status === 206) return { success: false, error: "NO_TRANSCRIPT", message: "这个 X 视频没有可用的现有字幕。可在设置中选择“没有字幕时允许生成”；Supadata 会按视频时长计费。" };
      if (!response.ok) {
        const messages = { 401: "Supadata 密钥无效，请检查设置。", 402: "Supadata 额度不足，请检查账户。", 403: "这个视频无法公开访问，或 Supadata 账户没有访问权限。", 404: "未找到可处理的视频字幕，请确认这是公开的视频推文。", 429: "Supadata 请求过于频繁，请稍后重试。" };
        throw new Error(messages[response.status] || `字幕服务暂时不可用（HTTP ${response.status}）。`);
      }
      return XVD_VIDEO.parseTranscript(await response.json());
    } catch (error) {
      return { success: false, error: error.name === "AbortError" ? "字幕请求等待超时。请求可能仍在服务端处理，请检查 Supadata 控制台后再决定是否重试。" : error instanceof TypeError ? "无法连接 Supadata，请检查网络。" : error.message };
    }
  }
  function fetchTranscript(videoId, progress = () => {}) {
    if (inFlight.has(videoId)) return inFlight.get(videoId);
    const promise = run(videoId, progress).finally(() => inFlight.delete(videoId));
    inFlight.set(videoId, promise);
    return promise;
  }
  return { fetchTranscript };
})();
if (typeof module !== "undefined" && module.exports) module.exports = XVD_TRANSCRIPT;
