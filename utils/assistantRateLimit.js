const ExpressError = require("./ExpressError");

const windowMs = 15 * 60 * 1000;
const maxRequests = 12;
const clients = new Map();

module.exports = (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of clients) {
        if (entry.resetAt <= now) clients.delete(key);
    }
    const key = req.user ? `user:${req.user._id}` : `ip:${req.ip}`;
    const current = clients.get(key);
    if (!current || current.resetAt <= now) {
        clients.set(key, { count: 1, resetAt: now + windowMs });
        return next();
    }
    if (current.count >= maxRequests) {
        res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
        return next(new ExpressError(429, "Travel Assistant limit reached. Please try again in a few minutes."));
    }
    current.count += 1;
    next();
};
