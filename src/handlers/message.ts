import { WASocket, proto } from '@whiskeysockets/baileys';
import { findMatchingGadget } from '../services/matcher.js';
import { sendClientAlert } from '../services/alert.js';
import { logger } from '../utils/logger.js';

const BUYING_INTENT_KEYWORDS = [
  'need', 'want', 'looking for', 'who has', 'price for', 'lf', 'wtb',
  'how much is', 'how much for', 'cost of', 'who get', 'who dey sell',
  'where i fit buy', 'available for hire', 'available for rent', 'i check for',
  'who get am', 'anyone with', 'do you have', 'in need of', 'urgent need'
];

const SELLING_INTENT_KEYWORDS = [
  'for sale', 'selling', 'available now', 'in stock', 'dm for', 'hit me up', 
  'restocked', 'we have', 'price list', 'giveaway price', 'vendor', 
  'deal of the day', 'available for pickup', 'pay on delivery', 'swap available'
];

export const handleIncomingMessage = async (
  sock: WASocket, 
  msg: proto.IWebMessageInfo, 
  alertPhoneNumber?: string
) => {
  try {
    if (!msg.key || !msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || !remoteJid.endsWith('@g.us')) return;

    const messageText = 
      msg.message.conversation || 
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.documentMessage?.caption || '';

    const cleanText = messageText.trim();
    if (!cleanText) return;

    const lowerText = cleanText.toLowerCase();

    logger.info(`[PIPELINE ENTRY]: Intercepted text in group ${remoteJid}: "${cleanText}"`);

    if (lowerText === '!ping') {
      await sock.sendMessage(remoteJid, { text: 'iBot Online: Multi-tenant pipeline active.' });
      return;
    }

    // 1. FILTER OUT SELLER BROADCASTS
    const hasSellIntent = SELLING_INTENT_KEYWORDS.some((keyword) => lowerText.includes(keyword));
    if (hasSellIntent) {
      logger.info(`[SELLER FILTER]: Dropped broadcast message.`);
      return;
    }

    // 2. ENFORCE STRICT BUYING INTENT DETECTOR
    const hasExplicitIntent = BUYING_INTENT_KEYWORDS.some((keyword) => lowerText.includes(keyword));

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

    if (!activeTenantId) {
      logger.warn('[PIPELINE BLOCKED]: Missing active tenant ID.');
      return;
    }

    // 4. INVENTORY QUERY LAYER
    const match = await findMatchingGadget(lowerText, activeTenantId);

    logger.info(`[COMMERCIAL GATEWAY]: Lead validated (Match: ${match ? match.name : 'None'}). Dispatching alert...`);

    // 5. EXTRACT METADATA & SENDER JID
    let groupName = 'WhatsApp Group';

    // Prioritize participant_pn (Phone Number) over LID identifiers
    const sender = 
      (msg.key as any).participant_pn || 
      (msg as any).participant_pn || 
      msg.key.participant || 
      remoteJid;

    try {
      const groupMetadata = await sock.groupMetadata(remoteJid);
      groupName = groupMetadata.subject || groupName;
    } catch (metaErr) {
      logger.warn({ remoteJid }, 'Failed to fetch group subject, using fallback.');
    }

    // 6. DISPATCH PRIVATE TRANSACTION ALERT
    await sendClientAlert(sock, match, groupName, sender, cleanText, alertPhoneNumber, hasExplicitIntent);

  } catch (error) {
    logger.error({ error, msgId: msg.key?.id }, 'Error inside handleIncomingMessage pipeline');
  }
};