const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn, isAdmin } = require("../middlewares");
const adminController = require("../controllers/admin");

router.use(isLoggedIn, isAdmin);
router.get("/", wrapAsync(adminController.dashboard));
router.get("/users", wrapAsync(adminController.users));
router.post("/users/:userId/role", wrapAsync(adminController.updateUserRole));
router.get("/listings", wrapAsync(adminController.listings));
router.post("/listings/:listingId/delete", wrapAsync(adminController.deleteListing));
router.get("/reviews", wrapAsync(adminController.reviews));
router.post("/reviews/:reviewId/delete", wrapAsync(adminController.deleteReview));

module.exports = router;
