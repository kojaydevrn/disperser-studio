import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, TextChannel } from 'discord.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

let botClient: Client;

export function initBot(supabase: any) {
  botClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel],
  });

  botClient.on('ready', async () => {
    console.log(`Bot logged in as ${botClient.user?.tag}`);

    // Setup Subscription Panel
    const channelId = process.env.DISCORD_SUBSCRIPTION_CHANNEL_ID;
    if (channelId) {
      try {
        const channel = await botClient.channels.fetch(channelId) as TextChannel;
        if (channel) {
          // Check if panel already exists
          const messages = await channel.messages.fetch({ limit: 10 });
          const hasPanel = messages.some(m => m.author.id === botClient.user?.id && m.embeds.length > 0 && m.embeds[0].title === '💎 Disperser Studio Subscriptions');
          
          if (!hasPanel) {
            const embed = new EmbedBuilder()
              .setTitle('💎 Disperser Studio Pro')
              .setDescription('Upgrade to Pro Plan to unlock Bulk Imports, Unlimited Uploads, and maximum limits.\n\n**Harga:** Rp 249.000 / bulan')
              .setColor('#00FFFF');

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('buy_pro')
                .setLabel('Beli Pro Plan (Rp 249k)')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛒')
            );

            await channel.send({ embeds: [embed], components: [row] });
            console.log('Subscription panel created.');
          }
        }
      } catch (err) {
        console.error('Failed to setup subscription panel:', err);
      }
    }
  });

  botClient.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'buy_pro') {
      
      let currentInfo = '';
      try {
        const { data: user } = await supabase.from('users').select('current_role, subscription_expires_at').eq('id', interaction.user.id).single();
        if (user && user.current_role && user.current_role !== 'Free') {
           const expireStr = user.subscription_expires_at ? new Date(user.subscription_expires_at).toLocaleDateString('id-ID') : '-';
           currentInfo = `\n\n📌 **Status Anda Saat Ini:**\nTier: **${user.current_role}**\nBerakhir Pada: **${expireStr}**\n*(Membeli lagi akan memperpanjang masa aktif 30 hari)*`;
        }
      } catch (err) {
        console.error('Failed to fetch user role:', err);
      }

      await interaction.deferReply({ ephemeral: true });

      const roleName = 'Pro Plan';
      const userId = interaction.user.id;
      const price = parseInt(process.env.PRICE_PRO || '249000');

      const merchantCode = process.env.DUITKU_MERCHANT_CODE || '';
      const apiKey = process.env.DUITKU_API_KEY || '';
      const merchantOrderId = `ORDER-${Date.now()}`;
      
      const signatureString = merchantCode + merchantOrderId + price + apiKey;
      const signature = crypto.createHash('md5').update(signatureString).digest('hex');

      // 1. Simpan Transaksi (Pending)
      const { error: dbError } = await supabase.from('transactions').insert([{
        merchant_order_id: merchantOrderId,
        user_id: userId,
        role_target: roleName,
        status: 'pending'
      }]);

      if (dbError) {
        console.error('Transaction DB Error:', dbError);
        return interaction.editReply({ content: 'Gagal membuat transaksi. Hubungi admin.', components: [] });
      }

      // 2. Request API Duitku
      try {
        const isSandbox = process.env.DUITKU_ENV === 'sandbox';
        const apiUrl = isSandbox 
          ? 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry' 
          : 'https://passport.duitku.com/webapi/api/merchant/v2/inquiry';

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantCode,
            paymentAmount: price,
            paymentMethod: "VC", 
            merchantOrderId,
            productDetails: `Langganan ${roleName}`,
            email: "customer@disperser.com",
            callbackUrl: `${process.env.API_URL}/api/payment/duitku-callback`,
            returnUrl: `${process.env.APP_URL}/dashboard`,
            signature,
            expiryPeriod: 30
          })
        });

        const data: any = await response.json();

        if (data.statusCode === '00' && data.paymentUrl) {
          const payRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Bayar Sekarang via Duitku')
              .setStyle(ButtonStyle.Link)
              .setURL(data.paymentUrl)
          );

          await interaction.editReply({
            content: `Anda akan membeli **${roleName}**.\nTotal Harga: **Rp ${price.toLocaleString('id-ID')}**${currentInfo}\n\nSilakan klik tombol di bawah untuk menyelesaikan pembayaran.`,
            components: [payRow]
          });
        } else {
          console.error('Duitku API Error Response:', data);
          const errorMsg = data.Message || data.statusMessage || JSON.stringify(data);
          await interaction.editReply({ content: `Gagal menghubungi payment gateway. Reason: \`${errorMsg}\``, components: [] });
        }
      } catch (err) {
        console.error('Duitku API Error:', err);
        await interaction.editReply({ content: 'Terjadi kesalahan sistem saat menghubungi Duitku.', components: [] });
      }
    }
  });

  botClient.login(process.env.DISCORD_BOT_TOKEN).catch(console.error);
}

export function getBotClient() {
  return botClient;
}
