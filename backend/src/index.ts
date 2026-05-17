// @ts-nocheck
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
// @ts-ignore
global.WebSocket = ws;
import { initBot, getBotClient } from './bot';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
console.log('📂 Checking for .env at:', path.resolve(__dirname, '../../.env'));
if (process.env.YT_COOKIES) {
  console.log('✅ YT_COOKIES variable is detected (Length:', process.env.YT_COOKIES.length, ')');
} else {
  console.log('⚠️ YT_COOKIES variable is NOT detected in process.env');
}

const app = express();
const port = process.env.PORT || 5001;

// Log available keys to debug environment variables
const allKeys = Object.keys(process.env);
const cookieRelatedKeys = allKeys.filter(k => k.toLowerCase().includes('cookies'));
console.log('🔑 Environment Keys containing "cookies":', cookieRelatedKeys);

if (process.env.YT_COOKIES) {
  console.log('✅ YT_COOKIES found (Length:', process.env.YT_COOKIES.length, ')');
} else if (cookieRelatedKeys.length > 0) {
  console.log('⚠️ YT_COOKIES not found, but found these instead:', cookieRelatedKeys);
} else {
  console.log('⚠️ No cookie-related variables found at all!');
}

const ytConfig = {
  executable: os.platform() === 'win32' ? 'yt-dlp' : (process.env.YT_DLP_PATH || 'yt-dlp')
};

// --- Persistent cookie file (written ONCE at startup, not per-request) ---
let persistentCookiePath: string | null = null;

const initCookies = (): void => {
  const localCookies = path.resolve(__dirname, '../cookies.txt');

  if (process.env.YT_COOKIES) {
    const val = process.env.YT_COOKIES;
    if (val.includes('# Netscape HTTP Cookie File') || val.includes('curl.haxx.se') || val.includes('\tTRUE\t')) {
      try {
        const tempPath = path.join(os.tmpdir(), `cookies-persistent.txt`);
        fs.writeFileSync(tempPath, val.replace(/\\n/g, '\n'));
        persistentCookiePath = tempPath;
        console.log(`🍪 Persistent cookie file written: ${tempPath}`);
      } catch (e) {
        console.error('Failed to write persistent cookies:', e);
      }
    }
  } else if (fs.existsSync(localCookies)) {
    const content = fs.readFileSync(localCookies, 'utf-8');
    if (content.includes('# Netscape HTTP Cookie File') || content.includes('curl.haxx.se') || content.includes('\tTRUE\t')) {
      persistentCookiePath = localCookies;
      console.log(`🍪 Using local cookie file: ${localCookies}`);
    }
  }

  if (!persistentCookiePath) {
    console.log('⚠️ No cookies available — some strategies will be limited');
  }
};

// Initialize cookies once at startup
initCookies();

// --- Download queue to limit concurrency and avoid YouTube rate limits ---
const MAX_CONCURRENT_DOWNLOADS = 2;
let activeDownloads = 0;
const downloadQueue: Array<{ resolve: (v: void) => void }> = [];

const acquireDownloadSlot = (): Promise<void> => {
  if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
    activeDownloads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    downloadQueue.push({ resolve });
  });
};

const releaseDownloadSlot = (): void => {
  if (downloadQueue.length > 0) {
    const next = downloadQueue.shift()!;
    next.resolve();
  } else {
    activeDownloads = Math.max(0, activeDownloads - 1);
  }
};

// Build yt-dlp download strategies — tried in order until one succeeds
const getDownloadStrategies = () => {
  const cookiesArgs = persistentCookiePath ? ['--cookies', persistentCookiePath] : [];
  const proxyArgs = process.env.YT_PROXY ? ['--proxy', process.env.YT_PROXY] : [];

  console.log(`🍪 Cookies: ${persistentCookiePath ? 'YES' : 'NO'}`);

  const baseArgs = [
    '--no-check-certificates',
    '--force-ipv4',
    '--sleep-requests', '0.5',
    '--add-header', 'Accept-Language: en-US,en;q=0.9',
    ...proxyArgs,
  ];

  const strategies = [
    // Strategy 1: default + cookies (let yt-dlp auto-select best client; Deno handles n-challenge)
    ...(cookiesArgs.length ? [
      { name: 'default+cookies', args: [...baseArgs, ...cookiesArgs] },
    ] : []),
    // Strategy 2: mweb (lightweight, works without cookies)
    { name: 'mweb', args: [...baseArgs, '--extractor-args', 'youtube:player_client=mweb'] },
    // Strategy 3: android_vr (no cookies needed, different fingerprint)
    { name: 'android_vr', args: [...baseArgs, '--extractor-args', 'youtube:player_client=android_vr'] },
    // Strategy 4: web_creator + cookies (needs PO token; bgutil plugin handles it)
    ...(cookiesArgs.length ? [
      { name: 'web_creator+cookies', args: [...baseArgs, '--extractor-args', 'youtube:player_client=web_creator', ...cookiesArgs] },
    ] : []),
    // Strategy 5: tv (TV client, different auth flow)
    { name: 'tv', args: [...baseArgs, '--extractor-args', 'youtube:player_client=tv'] },
  ];

  console.log(`📋 Strategies: ${strategies.map(s => s.name).join(' → ')}`);
  return strategies;
};

// --- Invidious/Piped API Fallback ---
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://vid.puffyan.us',
];

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
];

const extractVideoId = (url: string): string | null => {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch {}
  const match = url.match(/(?:v=|\/)([\w-]{11})(?:[&?\/]|$)/);
  return match ? match[1] : null;
};

const downloadViaInvidious = async (videoId: string, tmpDir: string, ffmpegLocation: string): Promise<{ file: string; title: string } | null> => {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`🌐 Trying Invidious fallback: ${instance}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${instance}/api/v1/videos/${videoId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) continue;

      const data = await resp.json() as any;
      const title = data.title || `YouTube Audio (${videoId})`;

      // Find best audio stream
      const audioFormats = (data.adaptiveFormats || [])
        .filter((f: any) => f.type?.startsWith('audio/'))
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      if (audioFormats.length === 0) continue;

      const audioUrl = audioFormats[0].url;
      if (!audioUrl) continue;

      // Download audio stream
      const audioResp = await fetch(audioUrl);
      if (!audioResp.ok) continue;

      const rawFile = path.join(tmpDir, 'raw_audio');
      const buffer = Buffer.from(await audioResp.arrayBuffer());
      fs.writeFileSync(rawFile, buffer);

      // Convert to MP3 with ffmpeg
      const outputFile = path.join(tmpDir, 'audio.mp3');
      await new Promise<void>((resolve, reject) => {
        execFile(ffmpegLocation, ['-i', rawFile, '-vn', '-ab', '192k', '-ar', '44100', '-y', outputFile],
          { timeout: 60000 }, (err) => err ? reject(err) : resolve());
      });

      if (fs.existsSync(outputFile)) {
        console.log(`✅ Invidious fallback succeeded via ${instance}`);
        return { file: outputFile, title };
      }
    } catch (e: any) {
      console.warn(`❌ Invidious ${instance} failed: ${e.message}`);
    }
  }
  return null;
};

const downloadViaPiped = async (videoId: string, tmpDir: string, ffmpegLocation: string): Promise<{ file: string; title: string } | null> => {
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`🌐 Trying Piped fallback: ${instance}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${instance}/streams/${videoId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) continue;

      const data = await resp.json() as any;
      const title = data.title || `YouTube Audio (${videoId})`;

      const audioStreams = (data.audioStreams || [])
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      if (audioStreams.length === 0) continue;

      const audioUrl = audioStreams[0].url;
      if (!audioUrl) continue;

      const audioResp = await fetch(audioUrl);
      if (!audioResp.ok) continue;

      const rawFile = path.join(tmpDir, 'raw_audio');
      const buffer = Buffer.from(await audioResp.arrayBuffer());
      fs.writeFileSync(rawFile, buffer);

      const outputFile = path.join(tmpDir, 'audio.mp3');
      await new Promise<void>((resolve, reject) => {
        execFile(ffmpegLocation, ['-i', rawFile, '-vn', '-ab', '192k', '-ar', '44100', '-y', outputFile],
          { timeout: 60000 }, (err) => err ? reject(err) : resolve());
      });

      if (fs.existsSync(outputFile)) {
        console.log(`✅ Piped fallback succeeded via ${instance}`);
        return { file: outputFile, title };
      }
    } catch (e: any) {
      console.warn(`❌ Piped ${instance} failed: ${e.message}`);
    }
  }
  return null;
};

// Legacy helper for /api/youtube/info (simple, non-critical)
const getYtBaseArgs = () => {
  const args = [
    '--no-check-certificates',
    '--no-warnings',
    '--force-ipv4',
    '--sleep-requests', '0.5',
    '--add-header', 'Accept-Language: en-US,en;q=0.9',
    ...(persistentCookiePath ? ['--cookies', persistentCookiePath] : []),
    ...(process.env.YT_PROXY ? ['--proxy', process.env.YT_PROXY] : [])
  ];
  return { args, tempFile: null };
};

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ CRITICAL: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in environment variables!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Discord Bot
initBot(supabase);

app.use(cors({
  exposedHeaders: ['X-Audio-Title']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// --- Duitku Callback Endpoint ---
app.post('/api/payment/duitku-callback', async (req, res) => {
  try {
    const { merchantCode, amount, merchantOrderId, signature, reference, resultCode } = req.body;

    const apiKey = process.env.DUITKU_API_KEY || '';
    const expectedSignature = crypto.createHash('md5').update(merchantCode + amount + merchantOrderId + apiKey).digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (resultCode === '00') {
      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .update({ status: 'success' })
        .eq('merchant_order_id', merchantOrderId)
        .select()
        .single();

      if (!txError && tx) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await supabase
          .from('users')
          .update({
            current_role: tx.role_target,
            subscription_expires_at: expiresAt.toISOString()
          })
          .eq('id', tx.user_id);

        let roleId = '';
        if (tx.role_target === 'Pro Plan') roleId = process.env.ROLE_PRO_ID || '';

        const guildId = process.env.DISCORD_GUILD_ID;
        if (guildId && roleId) {
          const botClient = getBotClient();
          try {
            const guild = await botClient.guilds.fetch(guildId);
            const member = await guild.members.fetch(tx.user_id);
            await member.roles.add(roleId);

            // Format the expiration date
            const expireStr = expiresAt.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

            // Send DM with full order details
            const dmMessage = `🎉 **Pembayaran Berhasil!** 🎉\n\nTerima kasih, pembayaran langganan Anda telah kami terima.\n\n📝 **Detail Pesanan:**\n- **Order ID:** \`${tx.merchant_order_id}\`\n- **Paket Tier:** ${tx.role_target}\n- **Masa Aktif Hingga:** ${expireStr}\n\nRole Anda di server Discord dan Website sudah otomatis di-update!`;

            await member.send(dmMessage);
          } catch (e) {
            console.error('Failed to update Discord role via callback:', e);
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Duitku callback error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// --- Roblox Key Validation ---
app.post('/api/roblox/validate-key', async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'API Key is required' });
  }

  try {
    // Try to get a specific asset metadata. ID '1' is used as a test.
    // This endpoint is guaranteed to check the API Key first.
    const response = await fetch('https://apis.roblox.com/assets/v1/assets/1', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (response.status === 401) {
      return res.status(401).json({ success: false, error: 'Invalid API Key (Unauthorized)' });
    }

    if (response.status === 403) {
      const data = await response.json().catch(() => ({}));
      return res.status(403).json({
        success: false,
        error: data.message || 'Access Forbidden: Ensure your IP is whitelisted and Assets API (Read) permission is added.'
      });
    }

    // If we get 200 (Asset found) or 404 (Asset not found), the key is AUTHENTICATED.
    // 404 here means the path is valid but the specific asset 1 is not in the creator's scope or doesn't exist.
    // But importantly, 404 on this path ONLY happens if the key passed authentication.
    if (!response.ok && response.status !== 404) {
      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json({ success: false, error: data.message || `Roblox API Error: ${response.status}` });
    }

    res.json({ success: true, message: 'API Key is valid and authenticated' });
  } catch (error: any) {
    console.error('Key validation error:', error);
    res.status(500).json({ success: false, error: 'Server error during validation' });
  }
});

// --- Roblox API Endpoints ---

app.post('/api/roblox/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const { apiKey, userId, supabaseUserId, name, description } = req.body;

  if (!apiKey || !file) {
    console.error('❌ Upload failed: Missing API Key or File');
    return res.status(400).json({ success: false, error: 'Missing API Key or File' });
  }

  try {
    // RATE LIMIT CHECK
    if (supabaseUserId) {
      const { data: user } = await supabase.from('users').select('current_role, uploads_today, last_upload_date').eq('id', supabaseUserId).single();
      if (user && user.current_role === 'Free') {
        const today = new Date().toISOString().split('T')[0];
        const lastUpload = user.last_upload_date ? new Date(user.last_upload_date).toISOString().split('T')[0] : '';

        let currentUploads = user.uploads_today || 0;
        if (lastUpload !== today) currentUploads = 0; // Reset daily

        if (currentUploads >= 3) {
          return res.status(403).json({ success: false, error: 'Limit harian habis (3/3). Upgrade ke Pro Plan untuk upload sepuasnya!' });
        }

        // PRE-INCREMENT
        await supabase.from('users').update({
          uploads_today: currentUploads + 1,
          last_upload_date: new Date().toISOString()
        }).eq('id', supabaseUserId);

      }
    }

    const formData = new FormData();
    const fileBlob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });

    const metadata = {
      assetType: 'Audio',
      displayName: name || 'Uploaded Audio',
      description: description || 'Uploaded via Disperser Studio',
      creationContext: {
        creator: {
          userId: userId || "0"
        }
      }
    };

    formData.append('request', JSON.stringify(metadata));
    formData.append('fileContent', fileBlob, file.originalname || 'audio.wav');

    console.log(`🚀 Uploading to Roblox: ${metadata.displayName} (Creator: ${userId || 'unknown'})`);

    const response = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      // DECREMENT ON FAILURE
      if (supabaseUserId) {
        const { data: user } = await supabase.from('users').select('current_role, uploads_today').eq('id', supabaseUserId).single();
        if (user && user.current_role === 'Free' && (user.uploads_today || 0) > 0) {
          await supabase.from('users').update({ uploads_today: user.uploads_today - 1 }).eq('id', supabaseUserId);
        }
      }

      console.error('❌ Roblox API Error Response:', JSON.stringify(data, null, 2));
      throw new Error(data.message || `Roblox API Error: ${response.status} ${response.statusText}`);
    }

    console.log('✅ Roblox Upload Successful:', data.path || data.id || 'Operation Created');
    res.json({ success: true, operation: data });
  } catch (error) {
    // DECREMENT ON EXCEPTION
    if (supabaseUserId) {
      const { data: user } = await supabase.from('users').select('current_role, uploads_today').eq('id', supabaseUserId).single();
      if (user && user.current_role === 'Free' && (user.uploads_today || 0) > 0) {
        await supabase.from('users').update({ uploads_today: user.uploads_today - 1 }).eq('id', supabaseUserId);
      }
    }

    console.error('❌ Internal Server Error during upload:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/roblox/upload-from-url', async (req, res) => {
  const { apiKey, userId, supabaseUserId, name, description, fileUrl } = req.body;

  if (!apiKey || !fileUrl) {
    return res.status(400).json({ success: false, error: 'Missing API Key or File URL' });
  }

  try {
    // RATE LIMIT CHECK
    if (supabaseUserId) {
      const { data: user } = await supabase.from('users').select('current_role, uploads_today, last_upload_date').eq('id', supabaseUserId).single();
      if (user && user.current_role === 'Free') {
        const today = new Date().toISOString().split('T')[0];
        const lastUpload = user.last_upload_date ? new Date(user.last_upload_date).toISOString().split('T')[0] : '';

        let currentUploads = user.uploads_today || 0;
        if (lastUpload !== today) currentUploads = 0; // Reset daily

        if (currentUploads >= 3) {
          return res.status(403).json({ success: false, error: 'Limit harian habis (3/3). Upgrade ke Pro Plan untuk upload sepuasnya!' });
        }

        // PRE-INCREMENT
        await supabase.from('users').update({
          uploads_today: currentUploads + 1,
          last_upload_date: new Date().toISOString()
        }).eq('id', supabaseUserId);

      }
    }

    console.log(`📡 Fetching asset from Supabase URL...`);
    const downloadRes = await fetch(fileUrl);
    if (!downloadRes.ok) throw new Error('Failed to download asset from source URL');

    const arrayBuffer = await downloadRes.arrayBuffer();
    const fileBlob = new Blob([new Uint8Array(arrayBuffer)], { type: 'audio/wav' });

    const metadata = {
      assetType: 'Audio',
      displayName: name || 'Uploaded Audio',
      description: description || 'Uploaded via Disperser Studio',
      creationContext: {
        creator: {
          userId: userId || "0"
        }
      }
    };

    const formData = new FormData();
    formData.append('request', JSON.stringify(metadata));
    formData.append('fileContent', fileBlob, 'audio.wav');

    console.log(`🚀 Streaming to Roblox: ${metadata.displayName}`);

    const response = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      // DECREMENT ON FAILURE
      if (supabaseUserId) {
        const { data: user } = await supabase.from('users').select('current_role, uploads_today').eq('id', supabaseUserId).single();
        if (user && user.current_role === 'Free' && (user.uploads_today || 0) > 0) {
          await supabase.from('users').update({ uploads_today: user.uploads_today - 1 }).eq('id', supabaseUserId);
        }
      }
      throw new Error(data.message || 'Roblox API Error');
    }

    console.log('✅ Roblox Stream Successful');
    res.json({ success: true, operation: data });
  } catch (error) {
    // DECREMENT ON EXCEPTION
    if (supabaseUserId) {
      const { data: user } = await supabase.from('users').select('current_role, uploads_today').eq('id', supabaseUserId).single();
      if (user && user.current_role === 'Free' && (user.uploads_today || 0) > 0) {
        await supabase.from('users').update({ uploads_today: user.uploads_today - 1 }).eq('id', supabaseUserId);
      }
    }
    console.error('❌ Stream Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/roblox/operation/:id', async (req, res) => {
  const { apiKey } = req.query;
  const { id } = req.params;
  try {
    const trimmedKey = (apiKey as string)?.trim();
    const response = await fetch(`https://apis.roblox.com/assets/v1/operations/${id}`, {
      headers: { 'x-api-key': trimmedKey }
    });
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: data.message || 'Roblox Operation Error', details: data });
    }

    res.json({ success: true, operation: data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/roblox/asset/:id', async (req, res) => {
  const { apiKey } = req.query;
  const { id } = req.params;
  try {
    const trimmedKey = (apiKey as string)?.trim();
    const response = await fetch(`https://apis.roblox.com/assets/v1/assets/${id}`, {
      headers: { 'x-api-key': trimmedKey }
    });
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: data.message || 'Roblox Asset Error', details: data });
    }

    res.json({ success: true, metadata: data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- YouTube Downloader (using yt-dlp + ffmpeg) ---

app.get('/api/youtube/info', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ success: false, error: 'URL required' });

  try {
    const { args, tempFile } = getYtBaseArgs();
    const result = await new Promise((resolve, reject) => {
      execFile(ytConfig.executable, [
        ...args,
        '--print', '%(title)s',
        '--no-download',
        url
      ], { timeout: 15000 }, (err, stdout, stderr) => {
        if (tempFile) try { fs.unlinkSync(tempFile); } catch (e) { }
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout.trim());
      });
    });

    res.json({ success: true, title: result });
  } catch (error) {
    console.error('yt-dlp info error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/youtube/download', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL required' });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disperser-'));
  const outputFile = path.join(tmpDir, 'audio.mp3');
  const ffmpegLocation = os.platform() === 'win32'
    ? 'ffmpeg'
    : (process.env.FFMPEG_PATH || (fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg'));

  // Wait for a download slot (limits concurrent YouTube requests)
  console.log(`⏳ Queue: ${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS} active, ${downloadQueue.length} waiting`);
  await acquireDownloadSlot();

  try {
    // Step 1: Get title (best-effort, non-blocking)
    const videoId = extractVideoId(url) || 'audio';
    const info: any = await new Promise((resolve) => {
      const { args } = getYtBaseArgs();
      execFile(ytConfig.executable, [
        ...args,
        '--print', '%(title)s',
        '--print', '%(duration)s',
        '--no-download',
        url
      ], { timeout: 20000 }, (err, stdout) => {
        if (err) {
          console.warn('⚠️ Could not fetch video info, using fallback title');
          resolve({ title: `YouTube Audio (${videoId})`, duration: 0 });
        } else {
          const lines = stdout.trim().split('\n');
          const rawTitle = lines[0]?.trim() || '';
          const isValidTitle = rawTitle && rawTitle !== 'NA' && rawTitle !== 'nan' && !rawTitle.startsWith('ERROR');
          resolve({
            title: isValidTitle ? rawTitle : `YouTube Audio (${videoId})`,
            duration: parseFloat(lines[1]) || 0
          });
        }
      });
    });

    let title = info.title;
    console.log(`🎵 Video title: "${title}"`);

    // Step 2: Try download with multiple yt-dlp strategies
    const strategies = getDownloadStrategies();
    let lastError = '';
    let ytdlpSucceeded = false;

    for (const strategy of strategies) {
      // Clean up any previous attempt's files
      try {
        const prevFiles = fs.readdirSync(tmpDir);
        for (const f of prevFiles) {
          fs.unlinkSync(path.join(tmpDir, f));
        }
      } catch { }

      console.log(`🔄 Trying strategy: "${strategy.name}" for ${url}`);

      const downloadArgs = [
        ...strategy.args,
        '--rm-cache-dir',
        '--format', 'bestaudio/best/ba/b',
        '--ffmpeg-location', ffmpegLocation,
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputFile,
        '--no-playlist',
        url
      ];

      const result: { success: boolean; error?: string; stdout?: string } = await new Promise((resolve) => {
        execFile(ytConfig.executable, downloadArgs, { timeout: 120000 }, (err, stdout, stderr) => {
          if (err) {
            console.error(`❌ Strategy "${strategy.name}" failed:`, (stderr || err.message).substring(0, 300));
            resolve({ success: false, error: stderr || err.message });
          } else {
            console.log(`✅ Strategy "${strategy.name}" succeeded`);
            resolve({ success: true, stdout });
          }
        });
      });

      if (result.success) {
        // Download succeeded — find the output file
        let actualFile = outputFile;
        if (!fs.existsSync(actualFile)) {
          const files = fs.readdirSync(tmpDir);
          const mp3File = files.find(f => f.endsWith('.mp3'));
          if (mp3File) {
            actualFile = path.join(tmpDir, mp3File);
          } else {
            const availableFiles = fs.readdirSync(tmpDir);
            console.error('❌ MP3 file not found. Available files in tmp:', availableFiles);
            throw new Error(`MP3 conversion failed - no output file found. Found: ${availableFiles.join(', ') || 'nothing'}`);
          }
        }

        // If title is still a fallback, try fetching it with the SAME strategy that worked
        if (title.startsWith('YouTube Audio (')) {
          const fetchedTitle: string = await new Promise((resolve) => {
            execFile(ytConfig.executable, [
              ...strategy.args,
              '--print', '%(title)s',
              '--no-download',
              url
            ], { timeout: 10000 }, (err, stdout) => {
              resolve(err ? '' : (stdout.trim().split('\n')[0]?.trim() || ''));
            });
          });

          if (fetchedTitle && fetchedTitle !== 'NA' && !fetchedTitle.startsWith('ERROR')) {
            title = fetchedTitle;
          }
        }

        ytdlpSucceeded = true;
        const stat = fs.statSync(actualFile);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', stat.size.toString());
        res.setHeader('X-Audio-Title', encodeURIComponent(title));
        res.setHeader('Access-Control-Expose-Headers', 'X-Audio-Title');

        const readStream = fs.createReadStream(actualFile);
        readStream.pipe(res);

        readStream.on('end', () => {
          releaseDownloadSlot();
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
        });

        readStream.on('error', () => {
          releaseDownloadSlot();
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
        });

        return; // Success — exit the handler
      }

      lastError = result.error || 'Unknown error';

      // If rate-limited (429), skip all remaining yt-dlp strategies immediately
      if (lastError.includes('429') || lastError.includes('Too Many Requests')) {
        console.warn('⚠️ Rate-limited (429). Skipping to API fallbacks.');
        break;
      }

      // If the error is NOT about format/bot/token, don't bother retrying
      if (!lastError.includes('format') && !lastError.includes('Sign in') && !lastError.includes('bot') && !lastError.includes('DRM') && !lastError.includes('PO Token') && !lastError.includes('403') && !lastError.includes('Only images')) {
        break;
      }

      // Short delay between strategies
      await new Promise(r => setTimeout(r, 1000));
    }

    // Step 3: yt-dlp failed — try Invidious API fallback
    if (!ytdlpSucceeded && videoId) {
      console.log('🌐 All yt-dlp strategies failed. Trying API fallbacks...');

      // Clean up tmp dir for fallback
      try {
        const prevFiles = fs.readdirSync(tmpDir);
        for (const f of prevFiles) fs.unlinkSync(path.join(tmpDir, f));
      } catch { }

      // Try Invidious first
      let fallbackResult = await downloadViaInvidious(videoId, tmpDir, ffmpegLocation);

      // If Invidious failed, try Piped
      if (!fallbackResult) {
        fallbackResult = await downloadViaPiped(videoId, tmpDir, ffmpegLocation);
      }

      if (fallbackResult) {
        title = fallbackResult.title || title;
        const stat = fs.statSync(fallbackResult.file);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', stat.size.toString());
        res.setHeader('X-Audio-Title', encodeURIComponent(title));
        res.setHeader('Access-Control-Expose-Headers', 'X-Audio-Title');

        const readStream = fs.createReadStream(fallbackResult.file);
        readStream.pipe(res);

        readStream.on('end', () => {
          releaseDownloadSlot();
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
        });

        readStream.on('error', () => {
          releaseDownloadSlot();
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
        });

        return;
      }
    }

    // All methods failed
    throw new Error('Download gagal: Semua metode (yt-dlp + API fallback) gagal. Coba lagi dalam beberapa menit.');

  } catch (error) {
    releaseDownloadSlot();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    console.error('YouTube download failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Discord API Endpoints ---

app.post('/api/discord/callback', async (req, res) => {
  const { code, redirect_uri } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, error: 'Missing code' });
  }

  try {
    // 1. Exchange code for access token
    console.log('📡 Exchanging Discord code for token...');
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || "",
        client_secret: process.env.DISCORD_CLIENT_SECRET || "",
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error('❌ Discord Token Error:', tokenData);
      throw new Error(tokenData.error_description || 'Failed to exchange token');
    }

    const accessToken = tokenData.access_token;

    // 2. Get User Info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userResponse.json();

    if (!userResponse.ok) throw new Error('Failed to get user data');

    const userId = userData.id;
    console.log(`📡 Discord Login: ${userData.username} (${userId})`);

    // 2.5 Role Management & Auto-Join
    const guildId = process.env.DISCORD_GUILD_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    const ROLE_FREE_ID = process.env.ROLE_FREE_ID;
    const ROLE_SOLODEV_ID = process.env.ROLE_SOLODEV_ID;
    const ROLE_STUDIO_ID = process.env.ROLE_STUDIO_ID;
    const ROLE_ENTERPRISE_ID = process.env.ROLE_ENTERPRISE_ID;

    if (!guildId || !botToken) {
      console.error('❌ Missing Discord configuration in .env');
      return res.json({ success: true, user: userData, roleGiven: false, error: 'Server misconfiguration' });
    }

    let memberData = null;
    const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` }
    });

    if (memberRes.ok) {
      memberData = await memberRes.json();
    } else {
      console.log(`🏷️ User not in guild, attempting auto-join...`);
      const addRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          access_token: accessToken,
          roles: ROLE_FREE_ID ? [ROLE_FREE_ID] : []
        })
      });
      if (addRes.ok) {
        memberData = await addRes.json();
      } else {
        console.error('❌ Failed to auto-join guild:', await addRes.text());
      }
    }

    // Determine Role
    let currentRole = 'Free';
    if (memberData && memberData.roles) {
      if (ROLE_ENTERPRISE_ID && memberData.roles.includes(ROLE_ENTERPRISE_ID)) currentRole = 'Enterprise';
      else if (ROLE_STUDIO_ID && memberData.roles.includes(ROLE_STUDIO_ID)) currentRole = 'Studio';
      else if (ROLE_SOLODEV_ID && memberData.roles.includes(ROLE_SOLODEV_ID)) currentRole = 'Solo Dev';
      else if (ROLE_FREE_ID && memberData.roles.includes(ROLE_FREE_ID)) currentRole = 'Free';
    }

    // Fetch existing user to check expiration
    const { data: existingUser } = await supabase.from('users').select('subscription_expires_at').eq('id', userId).single();

    let isExpired = false;
    if (existingUser && existingUser.subscription_expires_at) {
      const expiresAt = new Date(existingUser.subscription_expires_at).getTime();
      if (expiresAt < Date.now() && currentRole !== 'Free') {
        currentRole = 'Free';
        isExpired = true;
        // Optionally remove Discord role here, for now we just downgrade in DB
        console.log(`⚠️ Subscription expired for ${userId}. Downgrading to Free.`);
      }
    }

    // 3. Save/Update User in Supabase
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        username: userData.username,
        avatar: userData.avatar,
        current_role: currentRole,
        last_login: new Date().toISOString()
      }, { onConflict: 'id' })
      .select('current_role, subscription_expires_at')
      .single();

    if (dbError) {
      console.error('❌ Supabase User Sync Error:', dbError);
    }

    console.log(`✅ Login successful for ${userData.username} (Role: ${currentRole})`);
    res.json({
      success: true,
      user: { ...userData, current_role: currentRole, subscription_expires_at: dbUser?.subscription_expires_at },
      roleGiven: !!memberData,
      isExpired
    });

  } catch (error) {
    console.error('❌ Discord Auth Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual Role Verification (Retry)
app.post('/api/discord/verify-role', async (req, res) => {
  const { userId } = req.body;
  const guildId = process.env.DISCORD_GUILD_ID;
  const roleId = process.env.ROLE_FREE_ID || process.env.DISCORD_ROLE_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!userId || !guildId || !roleId || !botToken) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }

  try {
    const roleUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`;
    const roleResponse = await fetch(roleUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!roleResponse.ok) {
      return res.json({ success: false, error: 'User not found in server or permission error.' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Subscription API Endpoints ---

app.post('/api/subscription/extend', async (req, res) => {
  const { userId, daysToAdd, roleName } = req.body;

  if (!userId || !daysToAdd || !roleName) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }

  try {
    const { data: existingUser } = await supabase.from('users').select('subscription_expires_at').eq('id', userId).single();

    let baseDate = new Date();
    if (existingUser && existingUser.subscription_expires_at) {
      const currentExpiry = new Date(existingUser.subscription_expires_at);
      if (currentExpiry > baseDate) {
        baseDate = currentExpiry;
      }
    }

    const newExpiry = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    const { error } = await supabase.from('users').update({
      current_role: roleName,
      subscription_expires_at: newExpiry.toISOString()
    }).eq('id', userId);

    if (error) throw error;

    res.json({ success: true, newExpiry: newExpiry.toISOString(), role: roleName });
  } catch (error: any) {
    console.error('Subscription Extension Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Start Server using http.createServer (Express v5 compatible) ---
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`✅ Disperser Backend running on http://localhost:${port}`);
});