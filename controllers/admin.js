const mongoose = require("mongoose");
const User = require("../models/user");
const Listing = require("../models/listing");
const Review = require("../models/review");
const Booking = require("../models/booking");
const Wishlist = require("../models/wishlist");
const ExpressError = require("../utils/ExpressError");
const { deleteListingImages } = require("../utils/listingImages");

module.exports.dashboard = async (req, res) => {
    const [totalUsers, totalListings, totalBookings, totalReviews, bookingsByStatus, recentListings] = await Promise.all([
        User.countDocuments(),
        Listing.countDocuments(),
        Booking.countDocuments(),
        Review.countDocuments(),
        Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
        Listing.find().sort({ createdAt: -1 }).limit(5).select("title location country createdAt")
    ]);
    res.render("dashboard/admin.ejs", {
        totalUsers, totalListings, totalBookings, totalReviews,
        bookingsByStatus, recentListings
    });
};

module.exports.users = async (req, res) => {
    const users = await User.find().sort({ createdAt: -1 }).select("username email role createdAt").limit(250);
    res.render("dashboard/adminUsers.ejs", { users });
};

module.exports.updateUserRole = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.userId)) throw new ExpressError(404, "The requested user could not be found.");
    const role = req.body.role;
    if (!["traveler", "host", "admin"].includes(role)) throw new ExpressError(400, "Choose a valid account role.");
    if (String(req.user._id) === req.params.userId) throw new ExpressError(400, "You cannot change your own administrator role.");
    const target = await User.findById(req.params.userId).select("role");
    if (!target) throw new ExpressError(404, "The requested user could not be found.");
    if (target.role === "admin" && role !== "admin" && await User.countDocuments({ role: "admin" }) <= 1) {
        throw new ExpressError(400, "At least one administrator must remain on the platform.");
    }
    target.role = role;
    await target.save();
    req.flash("success", "User role updated.");
    res.redirect("/admin/users");
};

module.exports.listings = async (req, res) => {
    const listings = await Listing.find().sort({ createdAt: -1 }).populate("owner", "username").limit(250);
    res.render("dashboard/adminListings.ejs", { listings });
};

module.exports.deleteListing = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.listingId)) throw new ExpressError(404, "The requested listing could not be found.");
    const listing = await Listing.findByIdAndDelete(req.params.listingId);
    if (!listing) throw new ExpressError(404, "The requested listing could not be found.");
    try {
        await deleteListingImages(listing.images);
    } catch (error) {
        console.error("Failed to remove listing images after administrator deletion.", error);
        req.flash("error", "The listing was removed, but some image files could not be cleaned up.");
    }
    req.flash("success", "Listing removed.");
    res.redirect("/admin/listings");
};

module.exports.reviews = async (req, res) => {
    const reviews = await Review.find().sort({ createdAt: -1 }).limit(250)
        .populate("listing", "title")
        .populate("author", "username");
    res.render("dashboard/adminReviews.ejs", { reviews });
};

module.exports.deleteReview = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.reviewId)) throw new ExpressError(404, "The requested review could not be found.");
    const review = await Review.findByIdAndDelete(req.params.reviewId);
    if (!review) throw new ExpressError(404, "The requested review could not be found.");
    const listing = review.listing
        ? await Listing.findByIdAndUpdate(review.listing, { $pull: { reviews: review._id } }, { returnDocument: "after" })
        : null;
    if (listing) {
        const ratings = await Review.find({ _id: { $in: listing.reviews } }).select("rating").lean();
        listing.ratingCount = ratings.length;
        listing.averageRating = ratings.length
            ? Math.round(ratings.reduce((sum, item) => sum + item.rating, 0) / ratings.length * 100) / 100
            : 0;
        await listing.save();
    }
    req.flash("success", "Review removed.");
    res.redirect("/admin/reviews");
};
