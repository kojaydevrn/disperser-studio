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

// Helper to get base args with dynamic cookies
const getYtBaseArgs = () => {
  let currentCookiesPath = null;
  let rawCookieString = null;
  const localCookies = path.resolve(__dirname, '../cookies.txt');
  
  if (fs.existsSync(localCookies)) {
    const content = fs.readFileSync(localCookies, 'utf-8');
    if (content.includes('# Netscape HTTP Cookie File')) {
      currentCookiesPath = localCookies;
    } else {
      rawCookieString = content.trim();
    }
  } else if (process.env.YT_COOKIES) {
    if (process.env.YT_COOKIES.includes('# Netscape HTTP Cookie File')) {
      try {
        const tempPath = path.join(os.tmpdir(), `cookies-dl-${Date.now()}.txt`);
        fs.writeFileSync(tempPath, process.env.YT_COOKIES.replace(/\\n/g, '\n'));
        currentCookiesPath = tempPath;
      } catch (e) {
        console.error('Failed to write dynamic cookies:', e);
      }
    } else {
      rawCookieString = process.env.YT_COOKIES;
    }
  }

  const args = [
    '--no-check-certificates',
    '--no-warnings',
    '--force-ipv4',
    '--sleep-requests', '1',
    '--add-header', 'Accept-Language: en-US,en;q=0.9',
    ...(rawCookieString ? ['--add-header', `Cookie: ${rawCookieString}`] : []),
    // Improved bypass strategy
    '--extractor-args', 'youtube:player_client=default,web;player_skip=web_creator',
    ...(currentCookiesPath ? ['--cookies', currentCookiesPath] : []),
    ...(process.env.YT_PROXY ? ['--proxy', process.env.YT_PROXY] : [])
  ];

  return {
    args,
    tempFile: currentCookiesPath && currentCookiesPath.includes('cookies-dl-') ? currentCookiesPath : null
  };
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

  try {
    // Step 0: Handle Dynamic Cookies
    const { args: finalBaseArgs, tempFile: currentCookiesPath } = getYtBaseArgs();

    // Step 1: Get title and duration
    const info: any = await new Promise((resolve) => {
      execFile(ytConfig.executable, [
        ...finalBaseArgs,
        '--print', '%(title)s',
        '--print', '%(duration)s',
        '--no-download',
        url
      ], { timeout: 20000 }, (err, stdout) => {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v') || url.split('/').pop() || 'audio';

        if (err) {
          resolve({ title: `YouTube Audio (${videoId})`, duration: 0 });
        } else {
          const lines = stdout.trim().split('\n');
          resolve({
            title: lines[0] || `YouTube Audio (${videoId})`,
            duration: parseFloat(lines[1]) || 0
          });
        }
      });
    });

    const title = info.title;

    // Step 2: Download and convert to MP3
    await new Promise((resolve, reject) => {
      const finalArgs = [
        ...finalBaseArgs,
        '--rm-cache-dir',
        '--format', 'bestaudio/best',
        '--ffmpeg-location', os.platform() === 'win32' ? 'ffmpeg' : (process.env.FFMPEG_PATH || 'ffmpeg'),
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputFile,
        '--no-playlist',
        url
      ];

      execFile(ytConfig.executable, finalArgs, { timeout: 180000 }, (err, stdout, stderr) => {
        // Cleanup dynamic cookies file if created
        if (currentCookiesPath && currentCookiesPath.includes('cookies-dl-')) {
          try { fs.unlinkSync(currentCookiesPath); } catch (e) { }
        }

        if (err) {
          console.error('❌ YT-DLP Exec Error:', err);
          console.error('❌ YT-DLP Stderr:', stderr);
          reject(new Error(stderr || err.message));
        } else {
          console.log('✅ YT-DLP Success Stdout:', stdout);
          resolve(undefined);
        }
      });
    });

    // Find the actual output file
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

    const stat = fs.statSync(actualFile);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size.toString());
    res.setHeader('X-Audio-Title', encodeURIComponent(title));
    res.setHeader('Access-Control-Expose-Headers', 'X-Audio-Title');

    const readStream = fs.createReadStream(actualFile);
    readStream.pipe(res);

    readStream.on('end', () => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    });

    readStream.on('error', () => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    });

  } catch (error) {
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