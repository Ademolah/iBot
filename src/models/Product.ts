import { Schema, model, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;          // e.g., "Apple MacBook Pro M2"
  brand: string;         // e.g., "Apple"
  modelName: string;     // e.g., "MacBook Pro"
  specs: string[];       // e.g., ["16GB", "512GB", "M2"]
  aliases: string[];     // e.g., ["mac m2", "macbook m2", "m2 pro"]
  price: number;         // e.g., 1200000
  inStock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true, index: true },
    modelName: { type: String, required: true, trim: true },
    specs: [{ type: String, trim: true }],
    aliases: [{ type: String, trim: true, lowercase: true }],
    price: { type: Number, required: true },
    inStock: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Compound Text Index for fast full-text searching
productSchema.index({ name: 'text', modelName: 'text', aliases: 'text' });

export const Product = model<IProduct>('Product', productSchema);