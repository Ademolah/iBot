import { findMatchingGadget } from '../services/matcher.js';
import { sendClientAlert } from '../services/alert.js';
import { logger } from '../utils/logger.js';
const BUYING_INTENT_KEYWORDS = [
    'need', 'want', 'looking for', 'who has', 'price for', 'lf', 'wtb',
    'how much is', 'how much for', 'cost of', 'who get', 'who dey sell',
    'where i fit buy', 'available for hire', 'available for rent', 'i check for'
];
const CORE_ANCHOR_KEYWORDS = [
    'prado', 'suv', 'toyota', 'lexus', 'honda', 'mercedes', 'benz', 'g-wagon', 'range rover',
    'hilux', 'sienna', 'bus', 'car for hire', 'car rental',
    'iphone', 'macbook', 'mac', 'ipad', 'airpods', 'iwatch', 'apple watch', 'imac',
    'pro max', 'm1', 'm2', 'm3', 'm4',
    'laptop', 'hp', 'dell', 'lenovo', 'thinkpad', 'asus', 'acer', 'toshiba', 'surface pro',
    'desktop', 'monitor', 'pc', 'hard drive', 'ssd', 'ram', 'core i5', 'core i7', 'core i9',
    'samsung', 'galaxy', 'ultra', 'redmi', 'xiaomi', 'infinix', 'techno', 'tecno', 'oppo',
    'vivo', 'pixel', 'google pixel', 'tablet', 'tab',
    'playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'gaming pc', 'pad', 'controller',
    'television', 'tv', 'smart tv', 'lg', 'hisense', 'sony', 'panasonic', 'soundbar',
    'home theater', 'speaker', 'jbl',
    'printer', 'scanner', 'projector', 'inverter', 'solar panel', 'battery', 'generator', 'gen',
    'camera', 'canon', 'nikon', 'sony alpha', 'drone', 'dji', 'ring light', 'microphone', 'mic'
];
export const handleIncomingMessage = async (sock, msg, alertPhoneNumber) => {
    try {
        if (!msg.key || !msg.message || msg.key.fromMe)
            return;
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || !remoteJid.endsWith('@g.us'))
            return;
        const messageText = msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.documentMessage?.caption || '';
        const cleanText = messageText.trim();
        if (!cleanText)
            return;
        const lowerText = cleanText.toLowerCase();
        logger.info(`🔍 [PIPELINE ENTRY]: Intercepted raw text stream: "${cleanText}" inside group: ${remoteJid}`);
        if (lowerText === '!ping') {
            logger.info('🎯 [TEST SUCCESS]: Intercepted !ping baseline verification handler token.');
            await sock.sendMessage(remoteJid, { text: '🤖 *iBot Online:* Dynamic multi-tenant pipeline active! ⚡' });
            return;
        }
        const hasExplicitIntent = BUYING_INTENT_KEYWORDS.some((keyword) => lowerText.includes(keyword));
        const mentionsCoreAnchor = CORE_ANCHOR_KEYWORDS.some((anchor) => lowerText.includes(anchor));
        logger.info(`📊 [KEYWORD CHECK]: hasExplicitIntent=${hasExplicitIntent} | mentionsCoreAnchor=${mentionsCoreAnchor}`);
        if (!hasExplicitIntent && !mentionsCoreAnchor) {
            logger.info(`⏭️ [PIPELINE SKIP]: Message text drop. Does not match intent or anchor signatures.`);
            return;
        }
        logger.info(`💾 [DB CACHE QUERY]: Dispatching search strings into the findMatchingGadget service loop...`);
        const match = await findMatchingGadget(lowerText);
        if (!match) {
            logger.info(`❌ [MATCHER MISS]: findMatchingGadget evaluated to null. No fuzzy index matches exist in your active stock list.`);
            return;
        }
        logger.info(`✨ [COMMERCIAL MATCH]: Found item (${match.name}) from sender in group ${remoteJid}`);
        let groupName = 'Premium WhatsApp Group';
        const sender = msg.key.participant || msg.key.remoteJid || remoteJid;
        try {
            const groupMetadata = await sock.groupMetadata(remoteJid);
            groupName = groupMetadata.subject || groupName;
        }
        catch (metaErr) {
            logger.warn({ remoteJid }, 'Could not fetch group metadata dynamically, using fallback structure');
        }
        logger.info(`✉️ [DISPATCH CHANNELS]: Invoking sendClientAlert wrapper. Target client number routing to: ${alertPhoneNumber || process.env.CLIENT_PHONE_NUMBER}`);
        await sendClientAlert(sock, match, groupName, sender, cleanText, alertPhoneNumber);
    }
    catch (error) {
        logger.error({ error, msgId: msg.key?.id }, 'Critical failure encountered inside the handleIncomingMessage runtime pipeline');
    }
};
