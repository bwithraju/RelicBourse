export const rateLimitConfig = {
  // Maximum number of POST /orders allowed per window per user
  maxOrdersPerWindow: 60,
  windowMs: 60 * 1000, // 1 minute window
};
