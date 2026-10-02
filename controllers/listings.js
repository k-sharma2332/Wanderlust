const Listings = require("../models/listing");
const Wishlist = require("../models/wishlist");
const User = require("../models/user");
const { storeListingImages, deleteListingImages } = require("../utils/listingImages");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports.index = async (req, res, next) => {
    const { q = "", location = "", minPrice = "", maxPrice = "", sort = "newest" } = req.query;
    const filter = {};
    const search = q.trim();
    const place = location.trim();

    if (search) {
        filter.$or = [
            { title: { $regex: escapeRegex(search), $options: "i" } },
            { description: { $regex: escapeRegex(search), $options: "i" } },
            { country: { $regex: escapeRegex(search), $options: "i" } }
        ];
    }
    if (place) filter.location = { $regex: escapeRegex(place), $options: "i" };
    if (minPrice !== "" || maxPrice !== "") {
        filter.price = {};
        if (minPrice !== "" && Number.isFinite(Number(minPrice))) filter.price.$gte = Number(minPrice);
        if (maxPrice !== "" && Number.isFinite(Number(maxPrice))) filter.price.$lte = Number(maxPrice);
        if (!Object.keys(filter.price).length) delete filter.price;
    }

    const sortBy = sort === "price-low" ? { price: 1 } : sort === "price-high" ? { price: -1 } : { createdAt: -1 };
    const [result, savedListingIds] = await Promise.all([
        Listings.find(filter).sort(sortBy),
        req.user ? Wishlist.find({ user: req.user._id }).distinct("listing") : Promise.resolve([])
    ]);
    res.render(`listings/index.ejs`, {
        result,
        savedListingIds: savedListingIds.map(String),
        filters: { q, location, minPrice, maxPrice, sort }
    });
}

module.exports.renderNewForm = (req, res) => {
    res.render('listings/newListing.ejs', { enableLeaflet: true });
}

module.exports.showListing = async (req, res, next) => {
    const { id } = req.params;
    let listing = await Listings.findById(id).populate({path:"reviews", populate: {
        path: "author",
    },
}).populate("owner");
    if (!listing) {
        req.flash(`error`, `The Requested Listing Doesn't Exists!`);
        return res.redirect(`/listings`);
    }
    const reviewRatings = listing.reviews
        .map((review) => review.rating)
        .filter((rating) => Number.isFinite(rating));
    if (!listing.ratingCount && reviewRatings.length) {
        listing.ratingCount = reviewRatings.length;
        listing.averageRating = Math.round(
            reviewRatings.reduce((sum, rating) => sum + rating, 0) / listing.ratingCount * 100
        ) / 100;
    }
    const isSaved = req.user
        ? Boolean(await Wishlist.exists({ user: req.user._id, listing: listing._id }))
        : false;
    res.render(`listings/show.ejs`, {
        listing,
        isSaved,
        enableLeaflet: Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude)
    });
}

module.exports.createListing = async (req, res, next) => {
    const newListing = new Listings(req.body.listing);
    newListing.owner = req.user._id;
    newListing.images = await storeListingImages(req.files);
    if (newListing.images.length) newListing.image = newListing.images[0].url;
    try {
        await newListing.save();
        await User.updateOne({ _id: req.user._id, role: "traveler" }, { $set: { role: "host" } });
    } catch (error) {
        try {
            await deleteListingImages(newListing.images);
        } catch (cleanupError) {
            console.error("Failed to clean up listing images after a failed listing save.", cleanupError);
        }
        throw error;
    }
    req.flash("success", "New Listing Created!");
    res.redirect(`/listings`);
};

module.exports.renderEditForm = async (req, res, next) => {
    const { id } = req.params;
    let listing = await Listings.findById(id);
    if (!listing) {
        req.flash(`error`, `The Requested Listing Doesn't Exists!`);
        return res.redirect(`/listings`);
    }
    res.render(`listings/update.ejs`, { listing, enableLeaflet: true });
}

module.exports.updateListing = async (req, res, next) => {
    const { id } = req.params;
    const listing = await Listings.findById(id);
    if (!listing) {
        req.flash("error", "The requested listing could not be found.");
        return res.redirect("/listings");
    }
    const { removeImages = [], ...updates } = req.body.listing;
    const removalIds = new Set(removeImages);
    const removedImages = listing.images.filter((image) => removalIds.has(String(image._id)));
    const retainedImages = listing.images.filter((image) => !removalIds.has(String(image._id)));
    const uploadedImages = await storeListingImages(req.files);
    Object.assign(listing, updates);
    listing.images = [...retainedImages, ...uploadedImages];
    if (listing.images.length) listing.image = listing.images[0].url;
    else if (removedImages.length && !updates.image) listing.image = "";
    try {
        await listing.save();
    } catch (error) {
        try {
            await deleteListingImages(uploadedImages);
        } catch (cleanupError) {
            console.error("Failed to clean up listing images after a failed listing update.", cleanupError);
        }
        throw error;
    }
    try {
        await deleteListingImages(removedImages);
    } catch (cleanupError) {
        console.error("Failed to remove an unlinked listing image.", cleanupError);
        req.flash("error", "Your changes were saved, but a removed photo could not be cleaned up.");
    }
    req.flash("success", "Updated Requested Listing!");
    res.redirect(`/listings/${id}`);
}

module.exports.destroyListing = async (req, res, next) => {
    const { id } = req.params;
    const listing = await Listings.findByIdAndDelete(id);
    if (!listing) {
        req.flash("error", "The requested listing could not be found.");
        return res.redirect("/listings");
    }
    try {
        await deleteListingImages(listing.images);
    } catch (cleanupError) {
        console.error("Failed to remove listing image files after listing deletion.", cleanupError);
        req.flash("error", "The listing was deleted, but some image files could not be cleaned up.");
    }
    req.flash("success", "Requested Listing Deleted!");
    res.redirect(`/listings`);
}