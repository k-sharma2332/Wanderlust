const Listing = require("../models/listing");
const Review = require("../models/review");
const ExpressError = require("../utils/expressError");

const refreshListingRating = async (listing) => {
    const ratings = await Review.find({ _id: { $in: listing.reviews } }).select("rating").lean();
    const ratingCount = ratings.length;
    const averageRating = ratingCount
        ? Math.round((ratings.reduce((sum, review) => sum + review.rating, 0) / ratingCount) * 100) / 100
        : 0;
    listing.averageRating = averageRating;
    listing.ratingCount = ratingCount;
    await listing.save();
};

module.exports.createReview = async (req, res, next) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
        throw new ExpressError(404, "The requested listing could not be found.");
    }
    if (listing.owner && listing.owner.equals(req.user._id)) {
        req.flash("error", "You cannot review your own listing.");
        return res.redirect(`/listings/${listing._id}`);
    }
    const existingReview = await Review.findOne({
        _id: { $in: listing.reviews },
        author: req.user._id
    }).select("_id");
    if (existingReview || await Review.exists({ listing: listing._id, author: req.user._id })) {
        req.flash("error", "You have already reviewed this listing. You can edit your existing review.");
        return res.redirect(`/listings/${listing._id}`);
    }

    const review = new Review({
        ...req.body.review,
        listing: listing._id,
        authorName: req.user.username,
        author: req.user._id
    });
    try {
        await review.save();
        const result = await Listing.updateOne(
            { _id: listing._id },
            { $addToSet: { reviews: review._id } }
        );
        if (!result.matchedCount) {
            await Review.deleteOne({ _id: review._id });
            throw new ExpressError(404, "The requested listing could not be found.");
        }
        listing.reviews.push(review._id);
        await refreshListingRating(listing);
    } catch (error) {
        if (error.code === 11000) {
            if (listing.reviews.some((reviewId) => reviewId.equals(review._id))) {
                await Listing.updateOne({ _id: listing._id }, { $pull: { reviews: review._id } });
            }
            req.flash("error", "You have already reviewed this listing. You can edit your existing review.");
            return res.redirect(`/listings/${listing._id}`);
        }
        if (error instanceof ExpressError) throw error;
        await Listing.updateOne({ _id: listing._id }, { $pull: { reviews: review._id } });
        await Review.deleteOne({ _id: review._id });
        throw error;
    }
    req.flash("success", "Added New Review!");
    res.redirect(`/listings/${req.params.id}`); 
}

module.exports.updateReview = async (req, res) => {
    const { id, reviewId } = req.params;
    const review = await Review.findOneAndUpdate(
        { _id: reviewId, author: req.user._id },
        req.body.review,
        { runValidators: true, new: true }
    );
    if (!review) {
        throw new ExpressError(404, "The requested review could not be found.");
    }
    const listing = await Listing.findById(id).select("reviews");
    if (listing) await refreshListingRating(listing);
    req.flash("success", "Your review has been updated.");
    res.redirect(`/listings/${id}`);
};

module.exports.destroyReview = async (req, res, next) => {
    const {id, reviewId} = req.params;
    const listing = await Listing.findByIdAndUpdate(id, {$pull :{reviews : reviewId}}, { new: true });
    if (!listing) {
        throw new ExpressError(404, "The requested listing could not be found.");
    }
    const { deletedCount } = await Review.deleteOne({ _id: reviewId, author: req.user._id });
    if (!deletedCount) {
        await Listing.updateOne({ _id: id }, { $addToSet: { reviews: reviewId } });
        throw new ExpressError(404, "The requested review could not be found.");
    }
    await refreshListingRating(listing);
    req.flash("success", "Deleted Requested Review!");
    res.redirect(`/listings/${req.params.id}`); 
};