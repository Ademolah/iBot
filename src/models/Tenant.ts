import mongoose, { Schema, Document } from 'mongoose';

// 1. TENANT ACCOUNT SCHEMA (The Subscriber)
export interface ITenant extends Document {
  email: string;
  passwordHash: string;
  alertPhoneNumber: string; // The primary number where this tenant gets their sales notifications
  subscriptionStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
  createdAt: Date;
}

const TenantSchema = new Schema<ITenant>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  alertPhoneNumber: { type: String, required: true, trim: true },
  subscriptionStatus: { type: String, enum: ['ACTIVE', 'PAST_DUE', 'CANCELLED'], default: 'ACTIVE' },
  createdAt: { type: Date, default: Date.now }
});

// 2. WHATSAPP ENGINE CONTAINER INSTANCE SCHEMA
export interface IBotInstance extends Document {
  tenantId: mongoose.Types.ObjectId;
  sessionId: string; // Used as the unique key prefix inside Redis cache layers
  connectionStatus: 'DISCONNECTED' | 'GENERATING_QR' | 'CONNECTED';
  lastQrCode?: string;
  updatedAt: Date;
}

const BotInstanceSchema = new Schema<IBotInstance>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
  sessionId: { type: String, required: true, unique: true },
  connectionStatus: { type: String, enum: ['DISCONNECTED', 'GENERATING_QR', 'CONNECTED'], default: 'DISCONNECTED' },
  lastQrCode: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now }
});

// 🌟 CACHED MODEL GUARDS: Re-uses model instances smoothly during tsx watches
export const Tenant = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);
export const BotInstance = mongoose.models.BotInstance || mongoose.model<IBotInstance>('BotInstance', BotInstanceSchema);
