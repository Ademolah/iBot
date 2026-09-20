// import { WASocket, proto } from '@whiskeysockets/baileys';
// import { findMatchingGadget } from '../services/matcher.js';
// import { sendClientAlert } from '../services/alert.js';
// import { logger } from '../utils/logger.js';

// // Common phrases indicating someone is looking to buy
// const BUYING_INTENT_KEYWORDS = ['need', 'want', 'looking for', 'who has', 'price for', 'lf', 'wtb'];

// export const handleIncomingMessage = async (sock: WASocket, msg: proto.IWebMessageInfo) => {
//   // 1. SURGICAL FIX: Ensure key and message are both safely populated
//   if (!msg.key || !msg.message) return;

//   const remoteJid = msg.key.remoteJid;
//   // Only process messages from groups
//   if (!remoteJid || !remoteJid.endsWith('@g.us')) return;

//   // Extract text based on whether it's a standard text or a reply/extended text
//   const messageText = 
//     msg.message.conversation || 
//     msg.message.extendedTextMessage?.text;

//   if (!messageText) return;

//   const lowerText = messageText.toLowerCase();

//   // Fast fail: If the message doesn't contain a buying intent keyword, ignore it
//   const hasIntent = BUYING_INTENT_KEYWORDS.some((keyword) => lowerText.includes(keyword));
//   if (!hasIntent) return;

//   // Search the inventory
//   const match = await findMatchingGadget(lowerText);

//   if (match) {
//     logger.info(`Match found: ${match.name} in group ${remoteJid}`);
    
//     // Fetch group metadata to get the actual group name
//     let groupName = 'Unknown Group';
//     try {
//       const groupMetadata = await sock.groupMetadata(remoteJid);
//       groupName = groupMetadata.subject;
//     } catch (e) {
//       logger.warn('Could not fetch group metadata');
//     }

//     const sender = msg.key.participant || remoteJid;

//     // Trigger the alert
//     await sendClientAlert(sock, match, groupName, sender, messageText);
//   }
// };

import { WASocket, proto } from '@whiskeysockets/baileys';
import { findMatchingGadget } from '../services/matcher.js';
import { sendClientAlert } from '../services/alert.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js'; // Imported env to access the client phone number

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

  // 🚀 SURGICAL TEST INSERTION: Real-time Live Bot Response Check
  if (messageText.trim() === '!ping') {
    logger.info(`🎯 [TEST SUCCESS]: Received !ping in group JID: ${remoteJid}`);
    
    try {
      await sock.sendMessage(remoteJid, { 
        text: '🤖 *iBot Online:* Connection verified! Live message listening is fully functional. ⚡' 
      });
    } catch (err) {
      logger.error(err, 'Failed to send test ping response to chat');
    }
    return; // Exit early so it doesn't run keyword logic on the test string
  }

  // 🚨 SURGICAL TEST ALERT INSERTION: Simulated DM Trigger for Prado/MacBook
  if (messageText.trim() === '!testalert') {
    logger.info(`🚨 [TEST ALERT]: Intercepted !testalert command. Dispatching simulated sales alert...`);
    
    // Hardcoded mock production product payload for pristine testing
    const mockProduct = {
      name: 'Prado SUV / MacBook Pro Bundle',
      price: 1550000,
    } as any;

    try {
      const sender = msg.key.participant || remoteJid;
      let groupName = 'Premium Vendor Marketplace';
      
      try {
        const groupMetadata = await sock.groupMetadata(remoteJid);
        groupName = groupMetadata.subject;
      } catch (e) {
        logger.warn('Could not fetch group metadata for test alert context');
      }

      // Execute the private routing to the friend's number configured in your .env
      await sendClientAlert(sock, mockProduct, groupName, sender, 'I need a clean Prado SUV or a MacBook Pro package for an urgent supply contract.');
      
      // Send receipt visibility indicator back to the group
      await sock.sendMessage(remoteJid, { 
        text: '✅ *iBot Notification Engine:* Simulated sales alert successfully dispatched to the client DM! 💸' 
      });
    } catch (err) {
      logger.error(err, 'Failed to process simulated test alert pipeline');
    }
    return; // Exit early to bypass standard production inventory lookup workflows
  }

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
