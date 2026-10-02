const Listing = require(`./models/listing.js`)
const Review = require(`./models/review.js`)
const { listingSchema } = require(`./schema.js`);
const { reviewSchema } = require(`./schema.js`);
const { bookingSchema } = require("./schema.js");
const ExpressError = require(`./utils/expressError.js`);
const multer = require("multer");
const listingImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 8, fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, next) => {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
            return next(new ExpressError(400, "Upload JPEG, PNG, or WebP images only."));
        }
        next(null, true);
    }
});

module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()){
        req.session.redirectUrl = req.originalUrl;
        req.flash("error", "You Must Be Logged In As A User First!");
        return res.redirect("/login");
    }
    else next();
}

module.exports.isAdmin = (req, res, next) => {
    if (req.user?.role !== "admin") {
        req.flash("error", "Administrator access is required.");
        return res.redirect("/profile");
    }
    next();
};

module.exports.saveRedirectUrl = (req, res, next) => {
    if (req.session.redirectUrl){
        res.locals.redirectUrl = req.session.redirectUrl;
    }
    next();
}

module.exports.isOwner = async (req, res, next) => {
    const {id} = req.params;
    let listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "The requested listing could not be found.");
        return res.redirect("/listings");
    }
    if (!listing.owner || !req.user || !listing.owner.equals(req.user._id)){
        req.flash('error', `You Don't Have The Permission To Update Or Delete This Listing.`);
        return res.redirect(`/listings/${id}`);
    }
    else next();
}

module.exports.isAuthor = async (req, res, next) => {
    const {id, reviewId} = req.params;
    let review = await Review.findById(reviewId);
    let listing = await Listing.findById(id).select("reviews");
    const belongsToListing = listing && listing.reviews.some((listedReviewId) => listedReviewId.equals(reviewId));
    const matchesListing = !review?.listing || review.listing.equals(id);
    if (!review || !belongsToListing || !matchesListing || !review.author || !req.user || !review.author.equals(req.user._id)){
        req.flash('error', `You Don't Have The Permission To Change This Review.`);
        return res.redirect(`/listings/${id}`);
    }
    else next();
}

module.exports.uploadListingImages = (req, res, next) => {
    listingImageUpload.array("images", 8)(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError) {
            const message = error.code === "LIMIT_FILE_SIZE"
                ? "Each image must be 5 MB or smaller."
                : error.code === "LIMIT_UNEXPECTED_FILE"
                    ? "Upload no more than 8 images."
                    : "The image upload could not be processed.";
            return next(new ExpressError(400, message));
        }
        if (error instanceof ExpressError) return next(error);
        next(error);
    });
};

module.exports.validateListings = (req, res, next) => {
    if (req.body.listing?.amenities !== undefined && !Array.isArray(req.body.listing.amenities)) {
        req.body.listing.amenities = [req.body.listing.amenities];
    }
    if (req.body.listing?.removeImages !== undefined && !Array.isArray(req.body.listing.removeImages)) {
        req.body.listing.removeImages = [req.body.listing.removeImages];
    }
    const { error } = listingSchema.validate(req.body, { abortEarly: false, convert: true });
    if (error){
        const errMsg = error.details.map((el) => el.message).join(", ");
        throw new ExpressError(400, errMsg);
    }

    const removalIds = new Set(req.body.listing.removeImages || []);
    const listingQuery = req.params.id
        ? Listing.findById(req.params.id).select("images").lean()
        : Promise.resolve(null);
    listingQuery.then((listing) => {
        const retainedCount = listing
            ? listing.images.filter((image) => !removalIds.has(String(image._id))).length
            : 0;
        if (retainedCount + (req.files || []).length > 8) {
            return next(new ExpressError(400, "A listing can have no more than 8 images."));
        }
        next();
    }, next);
};

module.exports.validateRatings = (req, res, next) => {
    let { error } = reviewSchema.validate(req.body);
    if (error){
        let errMsg = error.details.map((el) => el.message).join(", ");
        throw new ExpressError(400, errMsg);
    }
    else next();
};

module.exports.validateBooking = (req, res, next) => {
    const { error } = bookingSchema.validate(req.body, { abortEarly: false, convert: true });
    if (error) {
        throw new ExpressError(400, error.details.map((detail) => detail.message).join(", "));
    }
    next();
};