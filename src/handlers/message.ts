import { WASocket, proto } from '@whiskeysockets/baileys';
import { findMatchingGadget } from '../services/matcher.js';
import { sendClientAlert } from '../services/alert.js';
import { logger } from '../utils/logger.js';

// 🌟 COMMERCIAL GRADED INTENT KEYWORDS: Rich localization targeting Nigerian vendor chat structures
const BUYING_INTENT_KEYWORDS = [
  'need', 'want', 'looking for', 'who has', 'price for', 'lf', 'wtb',
  'how much is', 'how much for', 'cost of', 'who get', 'who dey sell',
  'where i fit buy', 'available for hire', 'available for rent', 'i check for'
];

// 🌟 ANCHOR ASSETS: High-value fallback keywords to detect even if no intent phrase is captured
const CORE_ANCHOR_KEYWORDS = [
  // --- VEHICLES & RENTALS ---
  'prado', 'suv', 'toyota', 'lexus', 'honda', 'mercedes', 'benz', 'g-wagon', 'range rover', 
  'hilux', 'sienna', 'bus', 'car for hire', 'car rental',

  // --- APPLE ECOSYSTEM ---
  'iphone', 'macbook', 'mac', 'ipad', 'airpods', 'iwatch', 'apple watch', 'imac', 
  'pro max', 'm1', 'm2', 'm3', 'm4',

  // --- LAPTOPS & COMPUTERS ---
  'laptop', 'hp', 'dell', 'lenovo', 'thinkpad', 'asus', 'acer', 'toshiba', 'surface pro', 
  'desktop', 'monitor', 'pc', 'hard drive', 'ssd', 'ram', 'core i5', 'core i7', 'core i9',

  // --- SMARTPHONES & TABLETS (ANDROID) ---
  'samsung', 'galaxy', 'ultra', 'redmi', 'xiaomi', 'infinix', 'techno', 'tecno', 'oppo', 
  'vivo', 'pixel', 'google pixel', 'tablet', 'tab',

  // --- GAMING CONSOLES & TECH ---
  'playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'gaming pc', 'pad', 'controller',

  // --- TELEVISIONS & HOME AUDIO ---
  'television', 'tv', 'smart tv', 'lg', 'hisense', 'sony', 'panasonic', 'soundbar', 
  'home theater', 'speaker', 'jbl',

  // --- OFFICE & WORKSTATION ELECTRONICS ---
  'printer', 'scanner', 'projector', 'inverter', 'solar panel', 'battery', 'generator', 'gen',

  // --- PHOTOGRAPHY & PRODUCTION ---
  'camera', 'canon', 'nikon', 'sony alpha', 'drone', 'dji', 'ring light', 'microphone', 'mic'
];

// 🌟 UPGRADED SIGNATURE: Added alertPhoneNumber to match the three arguments sent by event.ts



// Define static matching criteria configurations natively


export const handleIncomingMessage = async (
  sock: WASocket, 
  msg: proto.IWebMessageInfo, 
  alertPhoneNumber?: string
) => {
  try {
    // 1. PRODUCTION GUARD CLAUSE: Ensure structure exists AND filter out the bot's own outgoing replies
    if (!msg.key || !msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    // Strictly isolate group chats to prevent personal DM spam streams
    if (!remoteJid || !remoteJid.endsWith('@g.us')) return;

    // 2. ROBUST TEXT EXTRACTION: Capture standard, extended, context-replies, and image/media captions
    const messageText = 
      msg.message.conversation || 
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.documentMessage?.caption || '';

    const cleanText = messageText.trim();
    if (!cleanText) return;

    const lowerText = cleanText.toLowerCase();

    // 🔍 REAL-TIME DEBUG TRACE 1: Entry Confirmation
    logger.info(`🔍 [PIPELINE ENTRY]: Intercepted raw text stream: "${cleanText}" inside group: ${remoteJid}`);

    // 🚀 QUICK RE-ADD TEST COMMANDS (Bypasses matcher for easier system testing if needed)
    if (lowerText === '!ping') {
      logger.info('🎯 [TEST SUCCESS]: Intercepted !ping baseline verification handler token.');
      await sock.sendMessage(remoteJid, { text: '🤖 *iBot Online:* Dynamic multi-tenant pipeline active! ⚡' });
      return;
    }

    // 3. DYNAMIC INTENT VERIFICATION LOGIC
    const hasExplicitIntent = BUYING_INTENT_KEYWORDS.some((keyword) => lowerText.includes(keyword));
    const mentionsCoreAnchor = CORE_ANCHOR_KEYWORDS.some((anchor) => lowerText.includes(anchor));

    // 🔍 REAL-TIME DEBUG TRACE 2: Evaluation Score Metrics
    logger.info(`📊 [KEYWORD CHECK]: hasExplicitIntent=${hasExplicitIntent} | mentionsCoreAnchor=${mentionsCoreAnchor}`);

    if (!hasExplicitIntent && !mentionsCoreAnchor) {
      logger.info(`⏭️ [PIPELINE SKIP]: Message text drop. Does not match intent or anchor signatures.`);
      return;
    }

    // 🌟 SURGICAL EXTRACTOR FIX: Extract the tenant ID key right from the running socket metadata details.
    // This perfectly strips away "session-tenant-" and isolates the clean MongoDB hex string.
    const rawSessionId = (sock as any).sessionId || '';
    let activeTenantId = rawSessionId.replace('session-tenant-', '');

    if (activeTenantId === 'vendor-bot-session' || !activeTenantId) {
      activeTenantId = process.env.DEV_FALLBACK_TENANT_ID || '';
      logger.info(`🛠️ [DEV MODE REDIRECT]: Routed system session fallback cleanly to test account: ${activeTenantId}`);
    }

    if (!activeTenantId) {
      logger.warn('⚠️ [PIPELINE BLOCKED]: Message skipped. Could not pull the active tenant ID from the running socket container.');
      return;
    }

    // 4. INVENTORY QUERY LAYER: Run direct semantic match passing our newly extracted tenant ID context
    logger.info(`💾 [DB CACHE QUERY]: Dispatching search strings into the findMatchingGadget service loop for tenant: ${activeTenantId}...`);
    const match = await findMatchingGadget(lowerText, activeTenantId);
    
    if (!match) {
      // 🔍 REAL-TIME DEBUG TRACE 3: Catch empty catalog filter misses or connection freezes transparently
      logger.info(`❌ [MATCHER MISS]: findMatchingGadget evaluated to null. No fuzzy index matches exist in your active stock list.`);
      return;
    }

    logger.info(`✨ [COMMERCIAL MATCH]: Found item (${match.name}) from sender in group ${remoteJid}`);

    // 5. ASYNC CONCURRENT METADATA GATHERING: Prevent thread execution locks
    let groupName = 'Premium WhatsApp Group';
    
    // 🌟 PRODUCTION SENDER UPGRADE: Prioritize the real phone number (participant_pn) over the masked LID string
    const sender = 
      (msg.key as any).participant_pn || 
      (msg as any).participant_pn || 
      msg.key.participant || 
      msg.key.remoteJid || 
      remoteJid;

    logger.info(`👤 [SENDER LOOKUP]: Successfully extracted public phone layout: ${sender}`);

    try {
      // Execute the metadata call with a fallback default to ensure the server doesn't hold up
      const groupMetadata = await sock.groupMetadata(remoteJid);
      groupName = groupMetadata.subject || groupName;
    } catch (metaErr) {
      logger.warn({ remoteJid }, 'Could not fetch group metadata dynamically, using fallback structure');
    }

    // 6. DISPATCH PRIVATE TRANSACTION ALERT 
    logger.info(`✉️ [DISPATCH CHANNELS]: Invoking sendClientAlert wrapper. Target client number routing to: ${alertPhoneNumber || process.env.CLIENT_PHONE_NUMBER}`);

    await sendClientAlert(sock, match, groupName, sender, cleanText, alertPhoneNumber);

  } catch (error) {
    // Top-level pipeline protection: Ensure an isolated processing fault never kills the server process
    logger.error({ error, msgId: msg.key?.id }, 'Critical failure encountered inside the handleIncomingMessage runtime pipeline');
  }
};

