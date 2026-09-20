import {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  BufferJSON,
} from '@whiskeysockets/baileys';
// 1. SURGICAL FIX: Import the proper RedisClientType from 'redis' instead of ioredis
import { RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';

export const useRedisAuthState = async (
  redis: any, // 2. Typed perfectly to your actual redis wrapper config
  sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  const credsKey = `${sessionId}:creds`;

  const readData = async (key: string) => {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data, BufferJSON.reviver) : null;
    } catch (error) {
      logger.error({ error, key }, 'Failed to read state from Redis');
      return null;
    }
  };

  const writeData = async (key: string, data: any) => {
    try {
      await redis.set(key, JSON.stringify(data, BufferJSON.replacer));
    } catch (error) {
      logger.error({ error, key }, 'Failed to write state to Redis');
    }
  };

  const removeData = async (key: string) => {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Failed to remove state from Redis');
    }
  };

  // Fetch existing credentials from Redis or initialize new ones
  const creds: AuthenticationCreds = (await readData(credsKey)) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${sessionId}:${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = { ...value, appStateSyncKey: value.appStateSyncKey }; 
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]![id];
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
