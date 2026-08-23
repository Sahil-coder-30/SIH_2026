export const requireRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.admin.role)) {
            return res.status(403).json({
                status:  'error',
                code:    'FORBIDDEN',
                message: `Action requires one of the following roles: ${allowedRoles.join(', ')}. Your role: ${req.admin.role}`,
            });
        }

        next();
    };
};
