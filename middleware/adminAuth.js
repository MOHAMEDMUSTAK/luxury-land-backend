// @desc    Middleware to restrict access to admin-only routes
// @usage   router.post('/admin/broadcast', protect, adminProtect, handler)
const adminProtect = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ 
      message: 'Access denied. Admin privileges required.' 
    });
  }
  next();
};

module.exports = { adminProtect };
