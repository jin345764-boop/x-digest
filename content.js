(() => {
  if (globalThis.__xVideoDigestInstalled) return;
  globalThis.__xVideoDigestInstalled = true;
  let controls;
  let currentId;
  let reconcileTimer;
  let appliedTimestamp;

  function getContext() {
    const info = XVD_VIDEO.parseUrl(location.href);
    if (!info) return null;
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const article = articles.find(item => {
      const permalink = item.querySelector("time")?.closest('a[href*="/status/"]');
      return permalink && XVD_VIDEO.parseUrl(permalink.href)?.postId === info.postId;
    });
    let videos = article ? [...article.querySelectorAll("video")].filter(video => !video.closest('div[role="link"]')) : [];
    if (!videos.length) {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) videos = [...dialog.querySelectorAll("video")];
    }
    const video = videos.length === 1 ? videos[0] : null;
    const title = article?.querySelector('[data-testid="tweetText"]')?.innerText.trim() || document.title.replace(/\s*\/\s*X$/, "").trim();
    const author = article?.querySelector('[data-testid="User-Name"]')?.innerText.split("\n").find(Boolean) || `@${info.author}`;
    return { ...info, article, video, count: videos.length, title: title.slice(0, 500), channelName: author, description: title.slice(0, 4000) };
  }

  function videoInfo(context) {
    return context ? { hasVideo: Boolean(context.video), videoId: context.videoId, title: context.title, channelName: context.channelName, description: context.description, duration: Number.isFinite(context.video?.duration) ? context.video.duration : 0, message: context.count > 1 ? "这条推文包含多个视频。当前版本支持单视频推文，请打开独立的视频帖子。" : "没有找到当前推文的播放器。请打开视频推文，并先点击播放。" } : { hasVideo: false, message: "请打开 X 视频推文的详情页。" };
  }

  async function waitForVideo() {
    const targetId = XVD_VIDEO.parseUrl(location.href)?.videoId;
    for (let attempt = 0; attempt < 40; attempt++) {
      const context = getContext();
      if (context?.videoId !== targetId || context?.video || context?.count > 1) return videoInfo(context);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return videoInfo(getContext());
  }

  async function seek(seconds, expectedId) {
    const context = getContext();
    const value = Number(seconds);
    if (!context?.video || (expectedId && context.videoId !== expectedId) || !Number.isFinite(value) || value < 0) return { success: false, error: "当前播放器与字幕不匹配，请重新打开这个视频。" };
    const video = context.video;
    if (video.readyState < 1) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { video.removeEventListener("loadedmetadata", ready); reject(new Error("播放器尚未加载，请先点击播放。")); }, 8000);
        function ready() { clearTimeout(timer); resolve(); }
        video.addEventListener("loadedmetadata", ready, { once: true });
      });
    }
    video.currentTime = Number.isFinite(video.duration) ? Math.min(value, Math.max(0, video.duration - 0.05)) : value;
    if (video.paused) video.play().catch(() => {});
    return { success: true };
  }

  async function saveNote() {
    const context = getContext();
    if (!context?.video) return;
    const result = await chrome.runtime.sendMessage({ action: "saveNote", videoId: context.videoId, timestamp: Math.max(0, Math.floor(context.video.currentTime) - 3), videoTitle: context.title, channelName: context.channelName });
    showFeedback(result.success ? "笔记已保存" : result.error || "请先在侧栏加载字幕");
  }

  function showFeedback(text) {
    const old = document.getElementById("xvd-toast"); old?.remove();
    const toast = document.createElement("div"); toast.id = "xvd-toast"; toast.textContent = text;
    toast.style.cssText = "position:fixed;bottom:28px;right:28px;background:#f7f3ec;color:#2e2a24;border:1px solid #ddd4c4;border-radius:12px;padding:12px 18px;max-width:340px;font:13px/1.6 system-ui;z-index:2147483647;box-shadow:0 4px 20px #0002";
    document.body.append(toast); setTimeout(() => toast.remove(), 3500);
  }

  function reconcile() {
    reconcileTimer = null;
    const context = getContext();
    if (!context?.video) { controls?.remove(); controls = null; return; }
    const host = context.video.closest('[data-testid="videoPlayer"]') || context.video.parentElement;
    if (!host) return;
    if (currentId !== context.videoId || controls?.parentElement !== host) {
      controls?.remove();
      currentId = context.videoId;
      const wrapper = document.createElement("div"); wrapper.id = "xvd-video-controls";
      wrapper.style.cssText = "position:absolute;top:14px;right:14px;z-index:20;display:flex;gap:7px;pointer-events:auto";
      for (const [label, action] of [["Digest", "digest"], ["Note", "note"]]) {
        const button = document.createElement("button"); button.textContent = label; button.type = "button";
        button.setAttribute("aria-label", action === "digest" ? "Open X Digest" : "Save timestamped note");
        button.style.cssText = "background:#c8674f;color:white;border:0;border-radius:999px;padding:8px 15px;font:600 12px/1.4 system-ui;cursor:pointer;box-shadow:0 3px 12px #0003";
        button.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          if (action === "digest") chrome.runtime.sendMessage({ action: "openSidePanel" }).catch(() => showFeedback("请点击工具栏中的 X Digest 图标"));
          else saveNote().catch(() => showFeedback("保存失败，请先打开侧栏"));
        });
        wrapper.append(button);
      }
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.append(wrapper); controls = wrapper;
    }
    const timestamp = new URL(location.href).searchParams.get("t");
    const marker = `${context.videoId}:${timestamp}`;
    if (/^\d+(?:\.\d+)?s?$/.test(timestamp || "") && appliedTimestamp !== marker && context.video.readyState >= 1) {
      appliedTimestamp = marker;
      seek(parseFloat(timestamp), context.videoId).catch(() => {});
    }
  }
  function schedule() { if (!reconcileTimer) reconcileTimer = setTimeout(reconcile, 150); }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message.action === "getVideoInfo") { waitForVideo().then(sendResponse); return true; }
    if (message.action === "getCurrentTime") {
      const context = getContext();
      sendResponse({ currentTime: context?.video?.currentTime || 0, paused: context?.video?.paused ?? true, videoId: context?.videoId || null }); return false;
    }
    if (message.action === "seekTo") {
      seek(message.seconds, message.videoId).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message })); return true;
    }
    if (message.action === "highlightMoments") { sendResponse({ success: true }); return false; }
    if (message.action === "showNoteSavedFeedback") { showFeedback("笔记已保存"); sendResponse({ success: true }); return false; }
    return false;
  });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("loadedmetadata", schedule, true);
  addEventListener("popstate", schedule);
  document.addEventListener("keydown", event => {
    const target = event.target;
    if (event.key.toLowerCase() !== "n" || event.ctrlKey || event.metaKey || event.altKey || target?.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target?.tagName || "")) return;
    const context = getContext();
    if (context?.video && (target === context.video || context.video.parentElement.contains(target))) { event.preventDefault(); saveNote().catch(() => {}); }
  });
  schedule();
})();
