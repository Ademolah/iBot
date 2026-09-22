import mongoose, { Schema } from 'mongoose';
const TenantSchema = new Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    alertPhoneNumber: { type: String, required: true, trim: true },
    subscriptionStatus: { type: String, enum: ['ACTIVE', 'PAST_DUE', 'CANCELLED'], default: 'ACTIVE' },
    createdAt: { type: Date, default: Date.now }
});
const BotInstanceSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
    sessionId: { type: String, required: true, unique: true },
    connectionStatus: { type: String, enum: ['DISCONNECTED', 'GENERATING_QR', 'CONNECTED'], default: 'DISCONNECTED' },
    lastQrCode: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now }
});
export const Tenant = mongoose.models.Tenant || mongoose.model('Tenant', TenantSchema);
export const BotInstance = mongoose.models.BotInstance || mongoose.model('BotInstance', BotInstanceSchema);
