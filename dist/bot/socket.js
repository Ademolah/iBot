import makeWASocket, { DisconnectReason, makeCacheableSignalKeyStore, } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger.js';
import { useRedisAuthState } from './auth.js';
import { redisClient } from '../config/redis.js';
import { setupMessageListeners } from './event.js';
import { BotInstance } from '../models/Tenant.js';
export const startBot = async (sessionId = 'vendor-bot-session', alertPhoneNumber) => {
    logger.info(`Initializing iBot Instance for Session: [${sessionId}]...`);
    const { state, saveCreds } = await useRedisAuthState(redisClient, sessionId);
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger: logger.child({ module: `baileys-${sessionId}`, level: 'warn' }),
        browser: ['Mac OS', 'Chrome', '1.0.0'],
        syncFullHistory: false,
    });
    sock.sessionId = sessionId;
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            logger.info(`✨ [QR GENERATED] Session: [${sessionId}]. Syncing matrix string to MongoDB catalog...`);
            try {
                await BotInstance.findOneAndUpdate({ sessionId }, { connectionStatus: 'GENERATING_QR', lastQrCode: qr, updatedAt: new Date() });
            }
            catch (dbErr) {
                logger.error({ dbErr, sessionId }, 'Failed to write active QR matrix to database records');
            }
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.warn({ reason: lastDisconnect?.error?.output?.statusCode, sessionId }, 'Connection closed.');
            try {
                await BotInstance.findOneAndUpdate({ sessionId }, { connectionStatus: 'DISCONNECTED', lastQrCode: null, updatedAt: new Date() });
            }
            catch (dbErr) {
                logger.error({ dbErr, sessionId }, 'Failed to clear instance connection metadata markers in DB');
            }
            if (shouldReconnect) {
                logger.info(`Attempting to reconnect dynamic session: [${sessionId}]...`);
                startBot(sessionId, alertPhoneNumber);
            }
            else {
                logger.fatal(`Bot instance [${sessionId}] was logged out. You must clear Redis keys and scan a new QR code.`);
            }
        }
        else if (connection === 'open') {
            logger.info(`✅ WhatsApp connection successfully established for session: [${sessionId}]!`);
            try {
                await BotInstance.findOneAndUpdate({ sessionId }, { connectionStatus: 'CONNECTED', lastQrCode: null, updatedAt: new Date() });
            }
            catch (dbErr) {
                logger.error({ dbErr, sessionId }, 'Failed to mark instance status as CONNECTED in database');
            }
        }
    });
    sock.ev.on('creds.update', async () => {
        try {
            await saveCreds();
        }
        catch (err) {
            logger.error(err, `Failed to save credentials updates to Redis for session: ${sessionId}`);
        }
    });
    if (alertPhoneNumber) {
        sock.alertPhoneNumber = alertPhoneNumber;
    }
    setupMessageListeners(sock);
    return sock;
};
