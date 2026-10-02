const express = require("express");
const router = express.Router({mergeParams : true});
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { isLoggedIn, saveRedirectUrl } = require("../middlewares.js");

const userController = require("../controllers/users.js");

router.route("/signup")
.get( userController.renderSigupForm)
.post( wrapAsync(userController.signup));

router.route("/login")
.get(userController.renderLoginForm )
.post(saveRedirectUrl,passport.authenticate("local", { failureRedirect : "/login", failureFlash : true}), userController.login );

router.get("/profile", isLoggedIn, wrapAsync(userController.renderProfile));
router.get("/wishlist", isLoggedIn, wrapAsync(userController.renderWishlist));
router.post("/wishlist/:listingId", isLoggedIn, wrapAsync(userController.addToWishlist));
router.delete("/wishlist/:listingId", isLoggedIn, wrapAsync(userController.removeFromWishlist));
router.get("/dashboard", isLoggedIn, wrapAsync(userController.renderDashboard));
router.get("/assistant", wrapAsync(userController.renderAssistant));
router.post("/assistant", require("../utils/assistantRateLimit"), wrapAsync(userController.askAssistant));



// 03. Logout Route : Logout Current User
router.get("/logout", userController.logout );

module.exports = router;