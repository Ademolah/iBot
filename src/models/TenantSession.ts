import mongoose from 'mongoose';

export interface ITenantSession {
  tenantId: string;          // Unique subscriber ID (or user reference ID)
  whatsappSessionId: string; // The session namespace string sent to Redis (e.g., "session-user123")
  alertPhoneNumber: string;  // The personal number where this user wants sales alerts routed
  isActive: boolean;
  createdAt: Date;
}

const TenantSessionSchema = new mongoose.Schema<ITenantSession>({
  tenantId: { type: String, required: true, unique: true },
  whatsappSessionId: { type: String, required: true, unique: true },
  alertPhoneNumber: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export const TenantSession = mongoose.model<ITenantSession>('TenantSession', TenantSessionSchema);
