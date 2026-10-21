import { WASocket, proto } from '@whiskeysockets/baileys';
import { findMatchingGadget } from '../services/matcher.js';
import { sendClientAlert } from '../services/alert.js';
import { logger } from '../utils/logger.js';

// 🌟 UPGRADE: Using Regex with Word Boundaries (\b) prevents false partial-word matches
// Added 'request' based on the standard group format.
const BUYING_INTENT_REGEX = /\b(request|need|want|looking for|who has|price for|lf|wtb|how much is|how much for|cost of|who get|who dey sell|where i fit buy|available for hire|available for rent|i check for|who get am|anyone with|do you have|in need of|urgent need)\b/i;

// 🌟 UPGRADE: Added currency/pricing patterns that sellers use (e.g. "Naira only", "₦500,000", "N850,000")
const SELLING_INTENT_REGEX = /\b(for sale|selling|available now|in stock|dm for|hit me up|restocked|we have|price list|giveaway price|vendor|deal of the day|available for pickup|pay on delivery|swap available|naira only|only‼️)\b|₦\d{2,}|\bN\d{3,}/i;

export const handleIncomingMessage = async (
  sock: WASocket, 
  msg: proto.IWebMessageInfo, 
  alertPhoneNumber?: string
) => {
  try {
    if (!msg.key || !msg.message || msg.key.fromMe) return;

    // 🌟 REDIS CACHE FIX: Drop messages older than 3 minutes (180 seconds)
    const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp);
    const now = Math.floor(Date.now() / 1000);
    if (now - msgTimestamp > 180) {
      logger.info(`[CACHE DROP]: Ignored stale offline message from ${msgTimestamp}`);
      return;
    }

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || !remoteJid.endsWith('@g.us')) return;

    const messageText = 
      msg.message.conversation || 
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.documentMessage?.caption || '';

    const cleanText = messageText.trim();
    if (!cleanText) return;

    logger.info(`[PIPELINE ENTRY]: Intercepted text in group ${remoteJid}: "${cleanText.substring(0, 50)}..."`);

    if (cleanText.toLowerCase() === '!ping') {
      await sock.sendMessage(remoteJid, { text: 'iBot Online: Multi-tenant pipeline active.' });
      return;
    }

    // 1. SMARTER SELLER FILTER (Now catches price tags and strict keywords)
    if (SELLING_INTENT_REGEX.test(cleanText)) {
      logger.info(`[SELLER FILTER]: Dropped broadcast message (Detected Seller Intent/Price Tag).`);
      return;
    }

    // 2. STRICT BUYING INTENT DETECTOR
    const hasExplicitIntent = BUYING_INTENT_REGEX.test(cleanText);

    if (!hasExplicitIntent) {
      logger.info(`[PIPELINE SKIP]: Message dropped due to lack of explicit buying intent.`);
      return;
    }

    // 3. TENANT ISOLATION LOOKUP
    const rawSessionId = (sock as any).sessionId || '';
    let activeTenantId = rawSessionId.replace('session-tenant-', '');

    if (activeTenantId === 'vendor-bot-session' || !activeTenantId) {
      activeTenantId = process.env.DEV_FALLBACK_TENANT_ID || '';
    }

    // 4. INVENTORY QUERY LAYER (Allowed to be null now!)
    let match = null;
    if (activeTenantId) {
      match = await findMatchingGadget(cleanText, activeTenantId);
    }

    logger.info(`[COMMERCIAL GATEWAY]: Lead validated (Match: ${match ? match.name : 'None - General Request'}). Dispatching alert...`);

    // 5. EXTRACT METADATA & SENDER JID
    let groupName = 'WhatsApp Group';

    try {
      const groupMetadata = await sock.groupMetadata(remoteJid);
      groupName = groupMetadata.subject || groupName;
    } catch (metaErr) {
      logger.warn({ remoteJid }, 'Failed to fetch group subject, using fallback.');
    }

    const rawParticipant = 
      (msg.key as any).participant_pn || 
      (msg as any).participant_pn || 
      msg.key.participant || 
      remoteJid;

    const pushName = msg.pushName || 'Unknown Buyer';

    let sender = typeof rawParticipant === 'string' ? rawParticipant : 'Unknown';
    if (typeof rawParticipant === 'string') {
      if (rawParticipant.includes('@lid')) {
        sender = pushName;
      } else if (rawParticipant.includes('@s.whatsapp.net')) {
        const phoneNumber = rawParticipant.split('@')[0];
        sender = `+${phoneNumber} (${pushName})`;
      }
    }

    // 6. DISPATCH PRIVATE TRANSACTION ALERT TO VENDOR (Even if match is null)
    await sendClientAlert(sock, match, groupName, sender, cleanText, alertPhoneNumber, hasExplicitIntent);

    // 7. SEAMLESS UX: AUTO-DM THE BUYER (If they are using an LID)
    if (typeof rawParticipant === 'string' && rawParticipant.includes('@lid')) {
      try {
        await sock.sendMessage(rawParticipant, { 
          text: `Hi ${pushName}, I am the automated assistant for this vendor. \n\nWe have the item you just requested in stock! Tap the link below to chat with the vendor directly to close the deal:\n\nhttps://wa.me/${alertPhoneNumber}` 
        });
        logger.info(`Successfully routed LID buyer (${pushName}) to the vendor via auto-DM.`);
      } catch (dmErr) {
        logger.error({ dmErr }, 'Failed to auto-DM the LID buyer');
      }
    }

  } catch (error) {
    logger.error({ error, msgId: msg.key?.id }, 'Error inside handleIncomingMessage pipeline');
  }
};