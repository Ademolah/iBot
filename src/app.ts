import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.routes.js';
import tenantRoutes from './routes/tenantRoutes.routes.js';

const app = express();

// 1. Enterprise Security & Universal Middleware Layers
app.use(cors()); // Crucial for enabling your React/Next.js dashboard frontend to query the API safely
app.use(express.json()); // Explicit JSON payload transformer integration

// 2. SaaS Domain Endpoint Mapping
app.use('/api/auth', authRoutes);     // Public accounts signup & security validation gateways
app.use('/api/tenant', tenantRoutes); // Strict JWT protected dashboard transaction endpoints

export default app;
