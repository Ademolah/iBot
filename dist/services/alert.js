import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
export const sendClientAlert = async (sock, product, groupName, buyerNumber, rawMessage, alertPhoneNumber) => {
    try {
        const targetNumber = alertPhoneNumber || env.CLIENT_PHONE_NUMBER;
        if (!targetNumber) {
            logger.warn('Skipping alert dispatch: No valid alert phone number provided or configured.');
            return;
        }
        const clientJid = `${targetNumber.trim()}@s.whatsapp.net`;
        const cleanIdSegment = buyerNumber.split('@')[0].split(':')[0];
        let finalBuyerDisplay = cleanIdSegment;
        if (buyerNumber.endsWith('@lid')) {
            try {
                const currentLidMap = sock.getLidToPhoneMap ? sock.getLidToPhoneMap() : {};
                const mappedPhoneNumber = currentLidMap[buyerNumber];
                if (mappedPhoneNumber) {
                    finalBuyerDisplay = mappedPhoneNumber.split('@')[0].split(':')[0];
                    logger.info(`✨ [LID TRANSLATOR SUCCESS]: Resolved ledger ID ${cleanIdSegment} to phone number: ${finalBuyerDisplay}`);
                }
                else {
                    const globalStore = sock.store;
                    const contactFromStore = globalStore?.contacts ? globalStore.contacts[buyerNumber] : null;
                    const contact = sock.contacts ? sock.contacts[buyerNumber] : null;
                    const verifiedContact = contactFromStore || contact;
                    if (verifiedContact && (verifiedContact.name || verifiedContact.notify)) {
                        finalBuyerDisplay = `${verifiedContact.name || verifiedContact.notify} (${cleanIdSegment})`;
                    }
                    else {
                        finalBuyerDisplay = cleanIdSegment;
                    }
                }
            }
            catch (translationErr) {
                logger.warn({ translationErr }, 'LID translation dictionary lookup skipped. Defaulting to raw ledger display segment.');
                finalBuyerDisplay = cleanIdSegment;
            }
        }
        const alertText = `🚨 *SALES ALERT* 🚨\n\n` +
            `Someone is looking for an item you have in stock!\n\n` +
            `📦 *Item Match:* ${product.name}\n` +
            `💰 *Listed Price:* ₦${product.price.toLocaleString()}\n\n` +
            `📍 *Group:* ${groupName}\n` +
            `👤 *Buyer:* +${finalBuyerDisplay}\n\n` +
            `💬 *Their Message:*\n"${rawMessage}"\n\n` +
            `_Reply in the group to close the sale!_`;
        await sock.sendPresenceUpdate('composing', clientJid);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await sock.sendPresenceUpdate('paused', clientJid);
        await sock.sendMessage(clientJid, { text: alertText });
        logger.info(`Alert successfully dispatched to dynamic client JID: ${clientJid} for product: ${product.name}`);
    }
    catch (error) {
        logger.error({ error }, 'Failed to send client alert');
    }
};
