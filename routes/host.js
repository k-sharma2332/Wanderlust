const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn } = require("../middlewares");
const bookingController = require("../controllers/bookings");

router.get("/bookings", isLoggedIn, wrapAsync(bookingController.hostIndex));
router.post("/bookings/:bookingId/confirm", isLoggedIn, wrapAsync(bookingController.confirm));
router.post("/bookings/:bookingId/reject", isLoggedIn, wrapAsync(bookingController.reject));

module.exports = router;
