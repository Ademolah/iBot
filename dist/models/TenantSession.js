import mongoose from 'mongoose';
const TenantSessionSchema = new mongoose.Schema({
    tenantId: { type: String, required: true, unique: true },
    whatsappSessionId: { type: String, required: true, unique: true },
    alertPhoneNumber: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
export const TenantSession = mongoose.model('TenantSession', TenantSessionSchema);
