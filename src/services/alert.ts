import { WASocket } from '@whiskeysockets/baileys';
import { IProduct } from '../models/Product.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const sendClientAlert = async (
  sock: WASocket,
  product: IProduct | null,
  groupName: string,
  buyerNumber: string,
  rawMessage: string,
  alertPhoneNumber?: string,
  hasExplicitIntent?: boolean
): Promise<void> => {
  try {
    const targetNumber = alertPhoneNumber || env.CLIENT_PHONE_NUMBER;
    
    if (!targetNumber) {
      logger.warn('Skipping alert dispatch: No valid alert phone number provided or configured.');
      return;
    }

    const clientJid = `${targetNumber.trim()}@s.whatsapp.net`;

    let finalBuyerDisplay = '';
    const cleanJid = buyerNumber.split('@')[0].split(':')[0];

    // Meta hides community members behind LIDs (Ledger IDs) usually starting with 1516
    if (buyerNumber.includes('@lid') || cleanJid.startsWith('1516')) {
      finalBuyerDisplay = 'Hidden Number (Reply directly in the group)';
    } else {
      finalBuyerDisplay = `+${cleanJid} (wa.me/${cleanJid})`;
    }

    let alertText = '';

    if (product) {
      alertText = 
        `[SALES ALERT: DIRECT MATCH]\n\n` +
        `Item: ${product.name}\n` +
        `Price: NGN ${product.price.toLocaleString()}\n` +
        `Buyer: ${finalBuyerDisplay}\n` +
        `Group: ${groupName}\n` +
        `Message: "${rawMessage}"`;
    } else if (hasExplicitIntent) {
      alertText = 
        `[HOT MARKET LEAD]\n\n` +
        `Status: Not in inventory (Source it!)\n` +
        `Buyer: ${finalBuyerDisplay}\n` +
        `Group: ${groupName}\n` +
        `Message: "${rawMessage}"`;
    } else {
      return;
    }

    await sock.sendPresenceUpdate('composing', clientJid);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await sock.sendPresenceUpdate('paused', clientJid);

    await sock.sendMessage(clientJid, { text: alertText });
    
    const logItemName = product ? product.name : 'Out-of-stock lead';
    logger.info(`Alert successfully dispatched to dynamic client JID: ${clientJid} for: ${logItemName}`);
    
  } catch (error) {
    logger.error({ error }, 'Failed to send client alert');
  }
};