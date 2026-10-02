const express = require(`express`);
const router = express.Router();
const wrapAsync = require(`../utils/wrapAsync.js`);
const { isLoggedIn, isOwner, validateListings, uploadListingImages } = require(`../middlewares.js`);
const { validateBooking } = require("../middlewares.js");

const listingController = require("../controllers/listings.js")

router.route("/")
    .get(wrapAsync(listingController.index))
    .post(isLoggedIn, uploadListingImages, validateListings, wrapAsync(listingController.createListing));

// 02. New And Create Route : Adding A New Listing To Our Data
router.get(`/new`, isLoggedIn, listingController.renderNewForm);
router.route("/:id/bookings")
    .get(isLoggedIn, wrapAsync(require("../controllers/bookings").renderNewForm))
    .post(isLoggedIn, validateBooking, wrapAsync(require("../controllers/bookings").create));

router.route("/:id")
    .get(wrapAsync(listingController.showListing))
    .put(isLoggedIn, isOwner, uploadListingImages, validateListings, wrapAsync(listingController.updateListing))
    .delete(isLoggedIn, isOwner, wrapAsync(listingController.destroyListing))




// 04. Edit And Update Route : Changing The Values Of The Existing Listings
router.get(`/:id/edit`, isLoggedIn, isOwner, wrapAsync(listingController.renderEditForm));




// 05. Delete Route : Deleting An Already Existing Listing Along With Its All Related Reviews

module.exports = router;