import { initAuthCreds, BufferJSON, } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
export const useRedisAuthState = async (redis, sessionId) => {
    const credsKey = `${sessionId}:creds`;
    const readData = async (key) => {
        try {
            const data = await redis.get(key);
            return data ? JSON.parse(data, BufferJSON.reviver) : null;
        }
        catch (error) {
            logger.error({ error, key }, 'Failed to read state from Redis');
            return null;
        }
    };
    const writeData = async (key, data) => {
        try {
            const payload = typeof data === 'string' ? data : JSON.stringify(data, BufferJSON.replacer);
            await redis.set(key, payload);
        }
        catch (error) {
            logger.error({ error, key }, 'Failed to write state to Redis');
        }
    };
    const removeData = async (key) => {
        try {
            await redis.del(key);
        }
        catch (error) {
            logger.error({ error, key }, 'Failed to remove state from Redis');
        }
    };
    const creds = (await readData(credsKey)) || initAuthCreds();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${sessionId}:${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = { ...value, appStateSyncKey: value.appStateSyncKey };
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${sessionId}:${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => writeData(credsKey, creds),
    };
};
