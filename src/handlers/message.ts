import { WASocket, proto } from '@whiskeysockets/baileys';
import { findMatchingGadget } from '../services/matcher.js';
import { sendClientAlert } from '../services/alert.js';
import { logger } from '../utils/logger.js';

// Common phrases indicating someone is looking to buy
const BUYING_INTENT_KEYWORDS = ['need', 'want', 'looking for', 'who has', 'price for', 'lf', 'wtb'];

export const handleIncomingMessage = async (sock: WASocket, msg: proto.IWebMessageInfo) => {
  // 1. SURGICAL FIX: Ensure key and message are both safely populated
  if (!msg.key || !msg.message) return;

  const remoteJid = msg.key.remoteJid;
  // Only process messages from groups
  if (!remoteJid || !remoteJid.endsWith('@g.us')) return;

  // Extract text based on whether it's a standard text or a reply/extended text
  const messageText = 
    msg.message.conversation || 
    msg.message.extendedTextMessage?.text;

  if (!messageText) return;

  const lowerText = messageText.toLowerCase();

  // Fast fail: If the message doesn't contain a buying intent keyword, ignore it
  const hasIntent = BUYING_INTENT_KEYWORDS.some((keyword) => lowerText.includes(keyword));
  if (!hasIntent) return;

  // Search the inventory
  const match = await findMatchingGadget(lowerText);

  if (match) {
    logger.info(`Match found: ${match.name} in group ${remoteJid}`);
    
    // Fetch group metadata to get the actual group name
    let groupName = 'Unknown Group';
    try {
      const groupMetadata = await sock.groupMetadata(remoteJid);
      groupName = groupMetadata.subject;
    } catch (e) {
      logger.warn('Could not fetch group metadata');
    }

    const sender = msg.key.participant || remoteJid;

    // Trigger the alert
    await sendClientAlert(sock, match, groupName, sender, messageText);
  }
};
