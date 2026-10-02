const User = require("../models/user");
const Listing = require("../models/listing");
const Wishlist = require("../models/wishlist");
const ExpressError = require("../utils/expressError");
const mongoose = require("mongoose");
const Booking = require("../models/booking");
const Review = require("../models/review");
const { extractPreferences, explainMatches } = require("../utils/travelAssistant");
const { propertyTypes } = require("../utils/listingOptions");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getWishlistListings = (userId) => Wishlist.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate({ path: "listing", populate: { path: "owner" } });

const getSafeReturnPath = (req, fallback) => {
    const referer = req.get("Referrer");
    return referer && referer.startsWith("/") && !referer.startsWith("//") && !referer.includes("\\")
        ? referer
        : fallback;
};

module.exports.renderSigupForm = (req, res) => {
    res.render("users/signup.ejs");
}

module.exports.signup = async (req, res, next) => {
    try {
        let {username, password, email} = req.body;
        const newUser = new User({username, email});
        const registeredUser = await User.register(newUser, password);
        req.login(registeredUser, (error) => {
            if (error){
                return next(error);
            } else {
                req.flash("success", "Welcome To WanderLust!");
                res.redirect("/listings");
            }
        });
    } catch(error){
        req.flash("error", error.message);
        res.redirect("/signup");
    }
}

module.exports.renderLoginForm = (req, res) => {
    res.render("users/login.ejs");
}

module.exports.renderProfile = async (req, res) => {
    const [user, savedEntries, hostedListings] = await Promise.all([
        User.findById(req.user._id).select("username email createdAt"),
        getWishlistListings(req.user._id),
        Listing.find({ owner: req.user._id }).sort({ createdAt: -1 }).select("title image images location country price")
    ]);
    if (!user) throw new ExpressError(404, "The requested profile could not be found.");
    res.render("users/profile.ejs", {
        profileUser: user,
        savedListings: savedEntries.filter((entry) => entry.listing).map((entry) => entry.listing),
        hostedListings
    });
};

module.exports.renderWishlist = async (req, res) => {
    const savedEntries = await getWishlistListings(req.user._id);
    res.render("users/wishlist.ejs", {
        savedListings: savedEntries.filter((entry) => entry.listing).map((entry) => entry.listing)
    });
};

module.exports.renderDashboard = async (req, res) => {
    if (req.user.role === "admin") return res.redirect("/admin");
    const [hostedListings, travelerBookings, hostedBookings, savedCount, reviews, reviewCount] = await Promise.all([
        Listing.find({ owner: req.user._id }).sort({ createdAt: -1 }).limit(6).select("title image location country price averageRating ratingCount"),
        Booking.find({ traveler: req.user._id }).sort({ createdAt: -1 }).limit(5).populate("listing", "title image location country"),
        Booking.find({ host: req.user._id }).sort({ createdAt: -1 }).limit(5).populate("listing", "title image location country").populate("traveler", "username"),
        Wishlist.countDocuments({ user: req.user._id }),
        Review.find({ author: req.user._id }).sort({ createdAt: -1 }).limit(5).populate("listing", "title"),
        Review.countDocuments({ author: req.user._id })
    ]);
    const isHost = req.user.role === "host" || hostedListings.length > 0 || hostedBookings.length > 0;
    const [hostListingCount, hostBookingCount, pendingCount, averageRatings] = isHost
        ? await Promise.all([
            Listing.countDocuments({ owner: req.user._id }),
            Booking.countDocuments({ host: req.user._id }),
            Booking.countDocuments({ host: req.user._id, status: "pending" }),
            Listing.aggregate([
                { $match: { owner: req.user._id } },
                { $group: {
                    _id: null,
                    weightedRating: { $sum: { $multiply: ["$averageRating", "$ratingCount"] } },
                    ratings: { $sum: "$ratingCount" }
                } }
            ])
        ])
        : [0, 0, 0, []];
    res.render("dashboard/index.ejs", {
        user: req.user,
        isHost,
        hostedListings,
        travelerBookings,
        hostedBookings,
        savedCount,
        reviews,
        reviewCount,
        hostListingCount,
        hostBookingCount,
        pendingCount,
        averageRating: averageRatings[0]?.ratings ? averageRatings[0].weightedRating / averageRatings[0].ratings : 0
    });
};

module.exports.renderAssistant = async (req, res) => {
    res.render("assistant/index.ejs", { query: "", preferences: null, recommendations: null, message: null });
};

module.exports.askAssistant = async (req, res) => {
    const query = typeof req.body.query === "string" ? req.body.query.trim() : "";
    if (query.length < 5 || query.length > 500) {
        throw new ExpressError(400, "Ask a question between 5 and 500 characters.");
    }
    const extracted = await extractPreferences(query);
    const preferences = {
        location: typeof extracted.location === "string" ? extracted.location.trim().slice(0, 80) : null,
        maxPrice: Number.isFinite(extracted.maxPrice) && extracted.maxPrice >= 0 && extracted.maxPrice <= 1_000_000 ? extracted.maxPrice : null,
        guests: Number.isInteger(extracted.guests) && extracted.guests >= 1 && extracted.guests <= 50 ? extracted.guests : null,
        propertyType: propertyTypes.includes(extracted.propertyType) ? extracted.propertyType : null,
        queryTerms: typeof extracted.queryTerms === "string" ? extracted.queryTerms.trim().slice(0, 100) : null,
        preference: typeof extracted.preference === "string" ? extracted.preference.trim().slice(0, 120) : null
    };
    const filter = {};
    if (preferences.location) filter.$or = [
        { location: { $regex: escapeRegex(preferences.location), $options: "i" } },
        { country: { $regex: escapeRegex(preferences.location), $options: "i" } }
    ];
    if (preferences.queryTerms) {
        const termsFilter = {
            $or: ["title", "description", "location", "country", "propertyType"].map((field) => ({
                [field]: { $regex: escapeRegex(preferences.queryTerms), $options: "i" }
            }))
        };
        if (filter.$or) filter.$and = [{ $or: filter.$or }, termsFilter];
        else Object.assign(filter, termsFilter);
        delete filter.$or;
    }
    if (preferences.maxPrice !== null) filter.price = { $lte: preferences.maxPrice };
    if (preferences.guests !== null) filter.maximumGuests = { $gte: preferences.guests };
    if (preferences.propertyType) filter.propertyType = preferences.propertyType;
    let candidates = await Listing.find(filter).sort({ averageRating: -1, ratingCount: -1, createdAt: -1 }).limit(12);
    if (preferences.location && preferences.queryTerms) {
        const stricter = await Listing.find({ ...filter, location: { $regex: escapeRegex(preferences.location), $options: "i" } })
            .sort({ averageRating: -1, ratingCount: -1, createdAt: -1 }).limit(12);
        if (stricter.length) candidates = stricter;
    }
    if (!candidates.length) {
        return res.status(200).render("assistant/index.ejs", {
            query,
            preferences,
            recommendations: [],
            message: "I couldn’t find a listing in Wanderlust that matches those preferences. Try widening the location or budget."
        });
    }
    const aiResult = await explainMatches(query, preferences, candidates);
    const reasons = new Map(aiResult.recommendations
        .filter((item) => candidates.some((listing) => String(listing._id) === item.listingId))
        .map((item) => [item.listingId, item.reason.slice(0, 240)]));
    const recommendations = candidates
        .filter((listing) => reasons.has(String(listing._id)))
        .map((listing) => ({ listing, reason: reasons.get(String(listing._id)) }));
    res.render("assistant/index.ejs", {
        query,
        preferences,
        recommendations,
        message: recommendations.length
            ? aiResult.message.slice(0, 500)
            : "I found some possible stays, but couldn’t produce a grounded recommendation. Please adjust your search and try again."
    });
};

module.exports.addToWishlist = async (req, res) => {
    const { listingId } = req.params;
    if (!mongoose.isValidObjectId(listingId)) throw new ExpressError(404, "The requested listing could not be found.");
    const exists = await Listing.exists({ _id: listingId });
    if (!exists) throw new ExpressError(404, "The requested listing could not be found.");
    try {
        await Wishlist.updateOne(
            { user: req.user._id, listing: listingId },
            { $setOnInsert: { user: req.user._id, listing: listingId } },
            { upsert: true }
        );
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
    req.flash("success", "Saved to your wishlist.");
    res.redirect(getSafeReturnPath(req, `/listings/${listingId}`));
};

module.exports.removeFromWishlist = async (req, res) => {
    const { listingId } = req.params;
    if (!mongoose.isValidObjectId(listingId)) throw new ExpressError(404, "The requested listing could not be found.");
    await Wishlist.deleteOne({ user: req.user._id, listing: listingId });
    req.flash("success", "Removed from your wishlist.");
    res.redirect(getSafeReturnPath(req, "/wishlist"));
};


module.exports.login = async (req, res) => {
    req.flash("success", "Welcome Back To Wanderlust!");
    if (res.locals.redirectUrl){
        const redirectUrl = res.locals.redirectUrl;
        delete req.session.redirectUrl;
        return res.redirect(redirectUrl);
    } else  {
        return res.redirect(`/listings`);
    }
}

module.exports.logout = (req, res, next) => {
    req.logout((error) => {
        if (error){
            return next(error);
        } else {
            req.flash("success", "You Are Logged Out Now!");
            res.redirect("/listings");
        }
    })
};