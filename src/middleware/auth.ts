import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  tenantId?: string; // Appended securely after verifying identity signatures
}

export const protectTenantRoute = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Authentication required. Missing token credentials.' });
    }

    const token = authHeader.split(' ')[1];
    
    // Validate JWT using your crypt environment secret configuration tokens
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SUPER_SECRET_SECURITY_SEED') as { id: string };
    
    // Inject the verified tenant context variable onto the Request object securely
    req.tenantId = decoded.id;
    next();
  } catch (error) {
    return res.status(403).json({ status: 'error', message: 'Access Denied. Invalid, tampered, or expired security token.' });
  }
};
