import jwt from 'jsonwebtoken';
export const protectTenantRoute = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ status: 'error', message: 'Authentication required. Missing token credentials.' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SUPER_SECRET_SECURITY_SEED');
        req.tenantId = decoded.id;
        next();
    }
    catch (error) {
        return res.status(403).json({ status: 'error', message: 'Access Denied. Invalid, tampered, or expired security token.' });
    }
};
