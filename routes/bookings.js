const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn } = require("../middlewares");
const bookingController = require("../controllers/bookings");

router.get("/", isLoggedIn, wrapAsync(bookingController.travelerIndex));
router.get("/:bookingId", isLoggedIn, wrapAsync(bookingController.show));
router.post("/:bookingId/cancel", isLoggedIn, wrapAsync(bookingController.cancel));

module.exports = router;
