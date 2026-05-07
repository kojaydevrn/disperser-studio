# Issue: Refactoring Subscription ke "Pro Plan" & Implementasi Limitasi Fitur

## Latar Belakang
Sistem langganan sebelumnya menggunakan 3 tier (Solo Dev, Studio, Enterprise). Untuk menyederhanakan bisnis, kita akan merampingkannya menjadi 1 tier saja, yaitu **Pro Plan**. Selain itu, sistem harus mulai membatasi fitur secara teknis di backend dan frontend agar *user* Free tidak bisa menggunakan fitur premium.

## Kebutuhan (Requirements)
1. **Perubahan Role & Harga:**
   - Hanya ada 2 role: **Free** dan **Pro Plan**.
   - Harga langganan Pro Plan ditetapkan sebesar **Rp 249.000 / bulan**.
   
2. **Aturan Limitasi (Feature Gating):**
   - **Free Plan:**
     - Hanya bisa *Single Import* (Tidak bisa memasukkan banyak URL sekaligus).
     - Hanya bisa *Single Upload* (Tidak bisa upload banyak file lokal sekaligus).
     - Limit harian: **Maksimal 3 Uploads / hari**.
   - **Pro Plan:**
     - *All Features Unlocked* (Bisa Bulk Import, Bulk Upload, dan tanpa limit upload harian).

---

## Langkah-Langkah Implementasi (SOP untuk Programmer / AI)

### Langkah 1: Update Environment Variables (`.env`)
- Buka file `.env` dan hapus variabel role lama (`ROLE_SOLODEV_ID`, `ROLE_STUDIO_ID`, `ROLE_ENTERPRISE_ID`) beserta variabel harganya.
- Tambahkan variabel baru:
  ```env
  ROLE_PRO_ID=[ID_ROLE_DISCORD_PRO]
  PRICE_PRO=249000
  ```

### Langkah 2: Update Logika Discord Bot (`backend/src/bot.ts`)
1. **Ubah UI Panel:** Ganti deskripsi Embed pada fungsi `initBot` agar hanya menampilkan "Pro Plan - Rp 249.000 / bulan".
2. **Sederhanakan Flow:** Karena hanya ada 1 tier, Anda bisa membuang `StringSelectMenuBuilder` sepenuhnya. 
   - Ketika tombol "Beli Subscription" diklik, bot tidak perlu bertanya lagi. Langsung saja *generate* URL Duitku seharga `249000` dengan nama target `Pro Plan`.

### Langkah 3: Update Webhook Callback (`backend/src/index.ts`)
- Pada endpoint `/api/payment/duitku-callback`, hapus pengecekan *if-else* untuk tier Solo Dev/Studio.
- Ubah logikanya menjadi:
  ```typescript
  let roleId = '';
  if (tx.role_target === 'Pro Plan') roleId = process.env.ROLE_PRO_ID || '';
  ```

### Langkah 4: Buat Database Counter & Logika Limitasi Backend (`backend/src/index.ts`)
- **Tracking Upload:** Diperlukan cara melacak jumlah upload harian. Anda bisa menambahkan kolom `uploads_today` (tipe Integer) dan `last_upload_date` (tipe Date) di tabel `users` pada Supabase.
- **Validasi di Endpoint:**
  - Setiap kali endpoint `/api/roblox/upload` atau `/api/roblox/upload-from-url` diakses, pertama ambil data user dari database.
  - Cek jika `user.current_role === 'Free'`:
    - Jika array file/url yang dikirim lebih dari 1, `return res.status(403).json({ error: "Free plan hanya mendukung Single Upload/Import." })`.
    - Cek `last_upload_date`. Jika beda hari dengan hari ini, reset `uploads_today` menjadi 0.
    - Jika `uploads_today >= 3`, `return res.status(403).json({ error: "Limit harian habis. Upgrade ke Pro Plan!" })`.
  - Jika upload sukses ke Roblox, lakukan `UPDATE users SET uploads_today = uploads_today + 1` (hanya untuk Free user).

### Langkah 5: Update UI Frontend (React)
1. **Disable Bulk Fitur:** Pada komponen upload/import (`frontend/src/pages/Upload.tsx` atau sejenisnya), cek `currentRole` user. Jika `Free`, jangan izinkan user men-select banyak file. Sembunyikan tombol "Add More".
2. **Indikator Kuota:** Tampilkan teks `Uploads Today: X / 3` di dekat tombol upload jika user adalah Free.
3. **Banner Upsell:** Jika user mencoba upload dan gagal karena limit harian, munculkan *Pop-up/Modal* cantik yang mengajak user mengklik tombol "Upgrade to Pro via Discord".
