window.__GMOD_SELF_HOSTED__ = true;

// Websim flattens uploaded sub-folder files into the project root, so paths
// like StreamingAssets/aa/catalog.bin and StreamingAssets/aa/bundles-local00/*.bundle
// 404. When running on a websim host, rewrite those request URLs to the flat
// layout that actually exists. No-op on localhost / any other host, so
// `node server.mjs` keeps working unchanged.
(function installWebsimPathRewriter() {
  const host = (typeof location !== "undefined" && location.hostname) || "";
  const onWebsim = /(^|\.)websim\.com$/i.test(host);
  if (!onWebsim) return;

  const rewriteString = (url) => {
    if (typeof url !== "string") return url;
    // Strip query parameters from binary files (wasm/data) - websim CDN returns 500 for these
    const stripped = url.replace(/(\.(?:wasm|data))\?[^#]*/g, "$1");
    // Rewrite flattened StreamingAssets paths
    return stripped
      .replace(/(^|\/)StreamingAssets\/aa\/bundles-local00\/(?=[^/?#])/g, "$1")
      .replace(/(^|\/)StreamingAssets\/aa\/(?=[^/?#])/g, "$1");
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    return origOpen.call(this, method, rewriteString(url), ...rest);
  };

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      if (typeof input === "string") {
        return origFetch.call(this, rewriteString(input), init);
      }
      if (input && typeof input.url === "string") {
        const rewritten = rewriteString(input.url);
        if (rewritten !== input.url) {
          return origFetch.call(this, new Request(rewritten, input), init);
        }
      }
      return origFetch.call(this, input, init);
    };
  }
})();

// Unity WebGL builds frequently create their AudioContext before any user
// gesture, leaving it in "suspended" state on Safari / iframe-embedded hosts
// (Safari is strictest here, and websim's preview iframe doesn't include
// `autoplay` in its Permissions-Policy `allow=` attribute). We intercept the
// AudioContext constructor so we can track every context Unity creates, then
// resume them on the first real user input. Harmless when audio is already
// running because we only resume contexts whose state is "suspended".
(function installAudioContextResumer() {
  const tracked = new Set();

  const wrap = (OrigCtor) => {
    if (!OrigCtor || OrigCtor.__gmodAudioWrapped) return OrigCtor;
    const Wrapped = function (...args) {
      const ctx = new OrigCtor(...args);
      tracked.add(ctx);
      return ctx;
    };
    Wrapped.prototype = OrigCtor.prototype;
    Wrapped.__gmodAudioWrapped = true;
    return Wrapped;
  };

  try {
    if (window.AudioContext) window.AudioContext = wrap(window.AudioContext);
    if (window.webkitAudioContext)
      window.webkitAudioContext = wrap(window.webkitAudioContext);
  } catch (_) {}

  const resumeAll = () => {
    tracked.forEach((ctx) => {
      try {
        if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
          ctx.resume().catch(() => {});
        }
      } catch (_) {}
    });
  };

  const events = ["pointerdown", "mousedown", "keydown", "touchstart", "click"];
  events.forEach((ev) =>
    window.addEventListener(ev, resumeAll, { capture: true, passive: true })
  );
})();

// Audio is resumed by installAudioContextResumer above on the first user
// gesture. No on-screen overlay is needed.

const remoteAddressablesUrl = new URL(
  "./StreamingAssets/aa/bundles-local00",
  document.baseURI
).href.replace(/\/$/, "");

const noop = () => {};
const resolved = (value) => Promise.resolve(value);

const fakePlayer = {
  getData: () => resolved({}),
  setData: () => resolved(),
  isAuthorized: () => false,
  getName: () => "unauthorized",
  getUniqueID: () => "unauthorized",
  getPhoto: () => "",
  getPayingStatus: () => "unknown",
};

const fakeYsdk = {
  on: noop,
  environment: {
    i18n: { lang: "en", tld: "com" },
    app: { id: "448583" },
    browser: { lang: navigator.language || "en" },
    payload: "",
  },
  deviceInfo: {
    type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
    isMobile: () => /Mobi|Android/i.test(navigator.userAgent),
    isDesktop: () => !/Mobi|Android/i.test(navigator.userAgent),
    isTablet: () => false,
    isTV: () => false,
  },
  adv: {
    showFullscreenAdv: ({ callbacks } = {}) => {
      callbacks?.onOpen?.();
      callbacks?.onClose?.(false);
    },
    showRewardedVideo: ({ callbacks } = {}) => {
      callbacks?.onOpen?.();
      callbacks?.onRewarded?.();
      callbacks?.onClose?.();
    },
    getBannerAdvStatus: () => resolved({ stickyAdvIsShowing: false }),
    hideBannerAdv: noop,
    showBannerAdv: noop,
  },
  feedback: {
    canReview: () => resolved({ value: false, reason: "self-hosted" }),
    requestReview: () => resolved({ feedbackSent: false }),
  },
  shortcut: {
    canShowPrompt: () => resolved({ canShow: false }),
    showPrompt: () => resolved({ outcome: "rejected" }),
  },
  features: {
    GamesAPI: {
      getAllGames: () => resolved({ games: [], developerURL: "" }),
    },
  },
  leaderboards: {
    setScore: noop,
    getDescription: () => resolved({
      default: false,
      description: {
        invert_sort_order: false,
        score_format: { options: { decimal_offset: 0 } },
        type: "numeric",
      },
    }),
    getEntries: () => resolved({ entries: [] }),
  },
  auth: {
    openAuthDialog: () => resolved(),
  },
  getPlayer: () => resolved(fakePlayer),
  getFlags: () => resolved({
    FLAG_ALL_GAMES_LINK: "",
    FLAG_COMMUNITY_LINK: "",
    FLAG_IS_ALL_GAMES_BUTTON_ACTIVE: "false",
    FLAG_IS_COMMUNITY_BUTTON_ACTIVE: "false",
    GAMEPLAY_ADV_INTERVAL: "999999",
    GAMEPLAY_FIRST_ADV_INTERVAL: "999999",
    REMOTE_ADDRESSABLES_URL: remoteAddressablesUrl,
  }),
};

window.YaGames = {
  init: () => resolved(fakeYsdk),
};
