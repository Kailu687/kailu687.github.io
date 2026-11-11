// Application intelligence database: maps DNS names to recognisable services.
// Pure ESM, no dependencies, so it runs in the local agent and in the browser demo.
//
// Each rule: suffix (matched against the end of the queried name on a label
// boundary), service, category, and `strength`:
//   "direct"  – the domain belongs to the service itself (high confidence)
//   "support" – an endpoint used mostly by that service, e.g. its CDN (medium)
//   "shared"  – shared infrastructure used by many services (low)
// `tracker: true` marks advertising / analytics endpoints.

export const CATEGORIES = {
  video: 'Video streaming',
  music: 'Music & audio',
  social: 'Social media',
  messaging: 'Messaging & calls',
  search: 'Search & services',
  productivity: 'Productivity',
  gaming: 'Gaming',
  shopping: 'Shopping',
  news: 'News & reading',
  os: 'System & updates',
  smarthome: 'Smart home',
  ads: 'Advertising',
  analytics: 'Analytics & telemetry',
  cdn: 'Shared infrastructure',
  dev: 'Developer tools',
  finance: 'Finance',
  ai: 'AI assistants',
};

const R = (suffix, service, category, strength = 'direct', extra = {}) => ({ suffix, service, category, strength, ...extra });

export const RULES = [
  // YouTube / Google
  R('youtube.com', 'YouTube', 'video'),
  R('youtu.be', 'YouTube', 'video'),
  R('googlevideo.com', 'YouTube', 'video', 'support', { role: 'Video delivery' }),
  R('youtubei.googleapis.com', 'YouTube', 'video', 'direct', { role: 'App API' }),
  R('ytimg.com', 'YouTube', 'video', 'support', { role: 'Thumbnails' }),
  R('yt3.ggpht.com', 'YouTube', 'video', 'support', { role: 'Channel images' }),
  R('youtube-nocookie.com', 'YouTube', 'video', 'support', { role: 'Embedded player' }),
  R('google.com', 'Google', 'search'),
  R('gstatic.com', 'Google', 'search', 'shared', { role: 'Static assets' }),
  R('googleapis.com', 'Google', 'search', 'shared', { role: 'Google APIs' }),
  R('gmail.com', 'Gmail', 'productivity'),
  R('mail.google.com', 'Gmail', 'productivity'),
  R('docs.google.com', 'Google Docs', 'productivity'),
  R('drive.google.com', 'Google Drive', 'productivity'),
  R('play.googleapis.com', 'Google Play', 'os', 'direct', { role: 'App store' }),
  R('android.clients.google.com', 'Android system', 'os'),
  R('connectivitycheck.gstatic.com', 'Android system', 'os', 'direct', { role: 'Connectivity check' }),
  R('doubleclick.net', 'Google Ads', 'ads', 'direct', { tracker: true }),
  R('googlesyndication.com', 'Google Ads', 'ads', 'direct', { tracker: true }),
  R('googleadservices.com', 'Google Ads', 'ads', 'direct', { tracker: true }),
  R('google-analytics.com', 'Google Analytics', 'analytics', 'direct', { tracker: true }),
  R('googletagmanager.com', 'Google Tag Manager', 'analytics', 'direct', { tracker: true }),
  R('app-measurement.com', 'Firebase Analytics', 'analytics', 'direct', { tracker: true }),
  R('crashlytics.com', 'Firebase Crashlytics', 'analytics', 'direct', { tracker: true }),

  // Meta
  R('instagram.com', 'Instagram', 'social'),
  R('cdninstagram.com', 'Instagram', 'social', 'support', { role: 'Photos & reels' }),
  R('facebook.com', 'Facebook', 'social'),
  R('fbcdn.net', 'Facebook / Instagram', 'social', 'support', { role: 'Meta media CDN' }),
  R('fbsbx.com', 'Facebook', 'social', 'support'),
  R('graph.facebook.com', 'Meta Graph API', 'analytics', 'direct', { tracker: true }),
  R('connect.facebook.net', 'Meta Pixel', 'analytics', 'direct', { tracker: true }),
  R('whatsapp.net', 'WhatsApp', 'messaging'),
  R('whatsapp.com', 'WhatsApp', 'messaging'),
  R('messenger.com', 'Messenger', 'messaging'),
  R('threads.net', 'Threads', 'social'),

  // Video / music
  R('netflix.com', 'Netflix', 'video'),
  R('nflxvideo.net', 'Netflix', 'video', 'support', { role: 'Video delivery' }),
  R('nflximg.net', 'Netflix', 'video', 'support', { role: 'Artwork' }),
  R('nflxso.net', 'Netflix', 'video', 'support'),
  R('nflxext.com', 'Netflix', 'video', 'support'),
  R('primevideo.com', 'Prime Video', 'video'),
  R('aiv-cdn.net', 'Prime Video', 'video', 'support', { role: 'Video delivery' }),
  R('hotstar.com', 'JioHotstar', 'video'),
  R('hotstarext.com', 'JioHotstar', 'video', 'support'),
  R('disneyplus.com', 'Disney+', 'video'),
  R('twitch.tv', 'Twitch', 'video'),
  R('ttvnw.net', 'Twitch', 'video', 'support', { role: 'Live video' }),
  R('spotify.com', 'Spotify', 'music'),
  R('scdn.co', 'Spotify', 'music', 'support', { role: 'Audio delivery' }),
  R('spotifycdn.com', 'Spotify', 'music', 'support'),
  R('jiosaavn.com', 'JioSaavn', 'music'),
  R('tiktok.com', 'TikTok', 'social'),
  R('tiktokcdn.com', 'TikTok', 'social', 'support', { role: 'Video delivery' }),
  R('tiktokv.com', 'TikTok', 'social', 'support'),
  R('byteoversea.com', 'TikTok', 'social', 'support'),
  R('snapchat.com', 'Snapchat', 'social'),
  R('sc-cdn.net', 'Snapchat', 'social', 'support'),
  R('reddit.com', 'Reddit', 'social'),
  R('redd.it', 'Reddit', 'social', 'support'),
  R('redditmedia.com', 'Reddit', 'social', 'support'),
  R('x.com', 'X (Twitter)', 'social'),
  R('twitter.com', 'X (Twitter)', 'social'),
  R('twimg.com', 'X (Twitter)', 'social', 'support'),
  R('linkedin.com', 'LinkedIn', 'social'),
  R('licdn.com', 'LinkedIn', 'social', 'support'),
  R('discord.com', 'Discord', 'messaging'),
  R('discord.gg', 'Discord', 'messaging'),
  R('discordapp.net', 'Discord', 'messaging', 'support'),
  R('telegram.org', 'Telegram', 'messaging'),
  R('zoom.us', 'Zoom', 'messaging'),
  R('signal.org', 'Signal', 'messaging'),

  // Microsoft / Apple / OS
  R('microsoft.com', 'Microsoft services', 'os'),
  R('windowsupdate.com', 'Windows Update', 'os'),
  R('update.microsoft.com', 'Windows Update', 'os'),
  R('delivery.mp.microsoft.com', 'Windows Update', 'os', 'direct', { role: 'Update delivery' }),
  R('msftconnecttest.com', 'Windows', 'os', 'direct', { role: 'Connectivity check' }),
  R('live.com', 'Microsoft account', 'productivity'),
  R('office.com', 'Microsoft 365', 'productivity'),
  R('office365.com', 'Microsoft 365', 'productivity'),
  R('teams.microsoft.com', 'Microsoft Teams', 'messaging'),
  R('vortex.data.microsoft.com', 'Windows telemetry', 'analytics', 'direct', { tracker: true }),
  R('events.data.microsoft.com', 'Windows telemetry', 'analytics', 'direct', { tracker: true }),
  R('bing.com', 'Bing', 'search'),
  R('apple.com', 'Apple services', 'os'),
  R('icloud.com', 'iCloud', 'productivity'),
  R('mzstatic.com', 'App Store', 'os', 'support'),
  R('itunes.apple.com', 'App Store', 'os'),
  R('push.apple.com', 'Apple push notifications', 'os'),
  R('captive.apple.com', 'Apple system', 'os', 'direct', { role: 'Connectivity check' }),
  R('xp.apple.com', 'Apple analytics', 'analytics', 'direct', { tracker: true }),
  R('samsung.com', 'Samsung services', 'os'),
  R('samsungcloudsolution.com', 'Samsung Smart TV', 'smarthome'),
  R('samsungads.com', 'Samsung Ads', 'ads', 'direct', { tracker: true }),
  R('lgtvsdp.com', 'LG Smart TV', 'smarthome'),
  R('lgsmartad.com', 'LG Ads', 'ads', 'direct', { tracker: true }),
  R('xiaomi.com', 'Xiaomi services', 'os'),
  R('miui.com', 'Xiaomi services', 'os'),

  // Smart home
  R('amazonalexa.com', 'Amazon Alexa', 'smarthome'),
  R('alexa.amazon.com', 'Amazon Alexa', 'smarthome'),
  R('avs-alexa-na.amazon.com', 'Amazon Alexa', 'smarthome'),
  R('device-metrics-us.amazon.com', 'Amazon device telemetry', 'analytics', 'direct', { tracker: true }),
  R('tuya.com', 'Tuya smart devices', 'smarthome'),
  R('tuyaeu.com', 'Tuya smart devices', 'smarthome'),
  R('tuyaus.com', 'Tuya smart devices', 'smarthome'),
  R('meethue.com', 'Philips Hue', 'smarthome'),
  R('nest.com', 'Google Nest', 'smarthome'),
  R('home.nest.com', 'Google Nest', 'smarthome'),
  R('ring.com', 'Ring', 'smarthome'),
  R('roku.com', 'Roku', 'video'),

  // Shopping / news / finance
  R('amazon.com', 'Amazon', 'shopping'),
  R('amazon.in', 'Amazon', 'shopping'),
  R('media-amazon.com', 'Amazon', 'shopping', 'support', { role: 'Images' }),
  R('ssl-images-amazon.com', 'Amazon', 'shopping', 'support'),
  R('flipkart.com', 'Flipkart', 'shopping'),
  R('flixcart.com', 'Flipkart', 'shopping', 'support'),
  R('myntra.com', 'Myntra', 'shopping'),
  R('swiggy.com', 'Swiggy', 'shopping'),
  R('zomato.com', 'Zomato', 'shopping'),
  R('paytm.com', 'Paytm', 'finance'),
  R('phonepe.com', 'PhonePe', 'finance'),
  R('wikipedia.org', 'Wikipedia', 'news'),
  R('wikimedia.org', 'Wikipedia', 'news', 'support'),
  R('nytimes.com', 'New York Times', 'news'),
  R('bbc.co.uk', 'BBC', 'news'),
  R('bbc.com', 'BBC', 'news'),

  // Gaming
  R('steampowered.com', 'Steam', 'gaming'),
  R('steamcommunity.com', 'Steam', 'gaming'),
  R('steamcontent.com', 'Steam', 'gaming', 'support', { role: 'Game downloads' }),
  R('epicgames.com', 'Epic Games', 'gaming'),
  R('playstation.net', 'PlayStation Network', 'gaming'),
  R('xboxlive.com', 'Xbox Live', 'gaming'),
  R('roblox.com', 'Roblox', 'gaming'),
  R('rbxcdn.com', 'Roblox', 'gaming', 'support'),
  R('riotgames.com', 'Riot Games', 'gaming'),
  R('pubgmobile.com', 'BGMI / PUBG Mobile', 'gaming'),

  // Dev / AI
  R('github.com', 'GitHub', 'dev'),
  R('githubusercontent.com', 'GitHub', 'dev', 'support'),
  R('stackoverflow.com', 'Stack Overflow', 'dev'),
  R('npmjs.org', 'npm', 'dev'),
  R('claude.ai', 'Claude', 'ai'),
  R('anthropic.com', 'Claude', 'ai'),
  R('chatgpt.com', 'ChatGPT', 'ai'),
  R('openai.com', 'ChatGPT', 'ai'),
  R('gemini.google.com', 'Gemini', 'ai'),

  // Ads / analytics (third party)
  R('scorecardresearch.com', 'Comscore', 'analytics', 'direct', { tracker: true }),
  R('hotjar.com', 'Hotjar', 'analytics', 'direct', { tracker: true }),
  R('mixpanel.com', 'Mixpanel', 'analytics', 'direct', { tracker: true }),
  R('segment.io', 'Segment', 'analytics', 'direct', { tracker: true }),
  R('amplitude.com', 'Amplitude', 'analytics', 'direct', { tracker: true }),
  R('appsflyer.com', 'AppsFlyer', 'analytics', 'direct', { tracker: true }),
  R('adjust.com', 'Adjust', 'analytics', 'direct', { tracker: true }),
  R('branch.io', 'Branch', 'analytics', 'direct', { tracker: true }),
  R('criteo.com', 'Criteo', 'ads', 'direct', { tracker: true }),
  R('taboola.com', 'Taboola', 'ads', 'direct', { tracker: true }),
  R('outbrain.com', 'Outbrain', 'ads', 'direct', { tracker: true }),
  R('adnxs.com', 'Xandr', 'ads', 'direct', { tracker: true }),
  R('amazon-adsystem.com', 'Amazon Ads', 'ads', 'direct', { tracker: true }),
  R('unityads.unity3d.com', 'Unity Ads', 'ads', 'direct', { tracker: true }),
  R('applovin.com', 'AppLovin', 'ads', 'direct', { tracker: true }),
  R('inmobi.com', 'InMobi', 'ads', 'direct', { tracker: true }),
  R('sentry.io', 'Sentry', 'analytics', 'direct', { tracker: true }),

  // Shared infrastructure: low confidence, many tenants
  R('cloudfront.net', 'Amazon CloudFront', 'cdn', 'shared'),
  R('amazonaws.com', 'Amazon Web Services', 'cdn', 'shared'),
  R('akamaihd.net', 'Akamai', 'cdn', 'shared'),
  R('akamaized.net', 'Akamai', 'cdn', 'shared'),
  R('akamaiedge.net', 'Akamai', 'cdn', 'shared'),
  R('edgekey.net', 'Akamai', 'cdn', 'shared'),
  R('cloudflare.com', 'Cloudflare', 'cdn', 'shared'),
  R('cdn.cloudflare.net', 'Cloudflare', 'cdn', 'shared'),
  R('fastly.net', 'Fastly', 'cdn', 'shared'),
  R('fastlylb.net', 'Fastly', 'cdn', 'shared'),
  R('azureedge.net', 'Azure CDN', 'cdn', 'shared'),
  R('azurewebsites.net', 'Microsoft Azure', 'cdn', 'shared'),
  R('googleusercontent.com', 'Google Cloud', 'cdn', 'shared'),
  R('jsdelivr.net', 'jsDelivr', 'cdn', 'shared'),
  R('ntp.org', 'Time sync', 'os', 'direct', { role: 'Clock sync' }),
];

// Build an index keyed by suffix for O(labels) lookup.
const INDEX = new Map(RULES.map(r => [r.suffix, r]));

export function normaliseName(name) {
  return String(name || '').trim().toLowerCase().replace(/\.$/, '');
}

/** Find the most specific rule whose suffix matches `name` on a label boundary. */
export function matchDomain(name) {
  const n = normaliseName(name);
  if (!n) return null;
  const labels = n.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.');
    const rule = INDEX.get(candidate);
    if (rule) return { ...rule, matched: candidate };
  }
  return null;
}

/** Registrable-ish base domain, good enough for grouping unknown names. */
export function baseDomain(name) {
  const n = normaliseName(name);
  const labels = n.split('.');
  if (labels.length <= 2) return n;
  const twoPartTlds = new Set(['co.uk', 'co.in', 'com.au', 'co.jp', 'com.br', 'org.uk', 'net.in', 'gov.in']);
  const lastTwo = labels.slice(-2).join('.');
  return twoPartTlds.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}
