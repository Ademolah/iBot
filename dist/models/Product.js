import mongoose, { Schema } from 'mongoose';
const productSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true, index: true },
    modelName: { type: String, required: true, trim: true },
    specs: [{ type: String, trim: true }],
    aliases: [{ type: String, trim: true, lowercase: true }],
    price: { type: Number, required: true },
    inStock: { type: Boolean, default: true, index: true },
}, { timestamps: true });
productSchema.index({ name: 'text', modelName: 'text', aliases: 'text' });
export const Product = mongoose.models?.Product || mongoose.model('Product', productSchema);
