const mongoose = require("mongoose");
const Booking = require("../models/booking");
const Listing = require("../models/listing");
const ExpressError = require("../utils/ExpressError");

const parseDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const getBookingForUser = async (bookingId, userId) => {
    if (!mongoose.isValidObjectId(bookingId)) throw new ExpressError(404, "The requested booking could not be found.");
    const booking = await Booking.findById(bookingId)
        .populate("listing", "title image location country owner")
        .populate("traveler", "username email")
        .populate("host", "username");
    if (!booking || !booking.traveler || !booking.host
        || (!booking.traveler._id.equals(userId) && !booking.host._id.equals(userId))) {
        throw new ExpressError(404, "The requested booking could not be found.");
    }
    return booking;
};

module.exports.renderNewForm = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new ExpressError(404, "The requested listing could not be found.");
    const listing = await Listing.findById(req.params.id).select("title image location country price maximumGuests owner");
    if (!listing) throw new ExpressError(404, "The requested listing could not be found.");
    if (!listing.owner) throw new ExpressError(409, "This stay is not currently available for booking.");
    if (listing.owner?.equals(req.user._id)) {
        req.flash("error", "You cannot request a booking for your own listing.");
        return res.redirect(`/listings/${listing._id}`);
    }
    res.render("bookings/new.ejs", { listing, today: new Date().toISOString().slice(0, 10) });
};

module.exports.create = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new ExpressError(404, "The requested listing could not be found.");
    const checkIn = parseDate(req.body.booking.checkIn);
    const checkOut = parseDate(req.body.booking.checkOut);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (!checkIn || !checkOut || checkIn < today || checkOut <= checkIn) {
        throw new ExpressError(400, "Choose valid dates. Check-in cannot be in the past and check-out must be after check-in.");
    }
    const nights = Math.round((checkOut - checkIn) / 86400000);
    if (nights > 90) throw new ExpressError(400, "A booking request cannot exceed 90 nights.");

    const listing = await Listing.findById(id);
    if (!listing) throw new ExpressError(404, "The requested listing could not be found.");
    if (!listing.owner) throw new ExpressError(409, "This stay is not currently available for booking.");
    if (listing.owner?.equals(req.user._id)) throw new ExpressError(403, "You cannot request a booking for your own listing.");
    const guests = Number(req.body.booking.guests);
    if (guests > listing.maximumGuests) throw new ExpressError(400, "Guest count exceeds the listing capacity.");

    await Booking.create({
        listing: listing._id,
        traveler: req.user._id,
        host: listing.owner,
        checkIn,
        checkOut,
        guests,
        nights,
        nightlyRate: listing.price,
        totalPrice: Math.round(listing.price * nights * 100) / 100,
        listingSnapshot: { title: listing.title, location: listing.location, image: listing.image }
    });
    req.flash("success", "Your booking request has been sent to the host.");
    res.redirect("/bookings");
};

module.exports.travelerIndex = async (req, res) => {
    const bookings = await Booking.find({ traveler: req.user._id }).sort({ createdAt: -1 }).populate("listing", "title image location country");
    res.render("bookings/index.ejs", { bookings, dashboardTitle: "My bookings", dashboardDescription: "Keep track of your stay requests and travel plans.", userRole: "traveler" });
};

module.exports.hostIndex = async (req, res) => {
    const bookings = await Booking.find({ host: req.user._id }).sort({ createdAt: -1 }).populate("listing", "title image location country").populate("traveler", "username");
    res.render("bookings/index.ejs", { bookings, dashboardTitle: "Booking requests", dashboardDescription: "Manage requests for stays you host.", userRole: "host" });
};

module.exports.show = async (req, res) => {
    const booking = await getBookingForUser(req.params.bookingId, req.user._id);
    const canManage = booking.host._id.equals(req.user._id) && booking.status === "pending";
    const canCancel = booking.traveler._id.equals(req.user._id)
        && ["pending", "confirmed"].includes(booking.status)
        && booking.checkIn > new Date();
    res.render("bookings/show.ejs", { booking, canManage, canCancel });
};

module.exports.cancel = async (req, res) => {
    const booking = await getBookingForUser(req.params.bookingId, req.user._id);
    if (!booking.traveler._id.equals(req.user._id)
        || !["pending", "confirmed"].includes(booking.status)
        || booking.checkIn <= new Date()) {
        throw new ExpressError(400, "This booking can no longer be cancelled.");
    }
    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, traveler: req.user._id, status: { $in: ["pending", "confirmed"] } },
        { $set: { status: "cancelled" } },
        { returnDocument: "after" }
    );
    if (!updated) throw new ExpressError(409, "The booking status changed. Refresh and try again.");
    if (booking.status === "confirmed") {
        await Listing.updateOne({ _id: booking.listing._id }, { $pull: { confirmedPeriods: { booking: booking._id } } });
    }
    req.flash("success", "Your booking has been cancelled.");
    res.redirect(`/bookings/${booking._id}`);
};

module.exports.confirm = async (req, res) => {
    const booking = await getBookingForUser(req.params.bookingId, req.user._id);
    if (!booking.host._id.equals(req.user._id) || booking.status !== "pending") {
        throw new ExpressError(400, "Only the host can confirm a pending request.");
    }
    const now = new Date();
    await Listing.updateOne(
        { _id: booking.listing._id },
        { $pull: { confirmedPeriods: { checkOut: { $lte: now } } } }
    );
    const reservation = await Listing.updateOne(
        {
            _id: booking.listing._id,
            confirmedPeriods: {
                $not: {
                    $elemMatch: { checkIn: { $lt: booking.checkOut }, checkOut: { $gt: booking.checkIn } }
                }
            },
            $expr: { $lt: [{ $size: { $ifNull: ["$confirmedPeriods", []] } }, 250] }
        },
        { $push: { confirmedPeriods: { booking: booking._id, checkIn: booking.checkIn, checkOut: booking.checkOut } } }
    );
    if (!reservation.modifiedCount) {
        throw new ExpressError(409, "These dates overlap another confirmed booking, so this request cannot be confirmed.");
    }
    const confirmed = await Booking.findOneAndUpdate(
        { _id: booking._id, host: req.user._id, status: "pending" },
        { $set: { status: "confirmed" } },
        { returnDocument: "after" }
    );
    if (!confirmed) {
        await Listing.updateOne({ _id: booking.listing._id }, { $pull: { confirmedPeriods: { booking: booking._id } } });
        throw new ExpressError(409, "The request changed before it could be confirmed. Refresh and try again.");
    }
    req.flash("success", "Booking confirmed.");
    res.redirect(`/bookings/${booking._id}`);
};

module.exports.reject = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.bookingId)) throw new ExpressError(404, "The pending booking request could not be found.");
    const updated = await Booking.findOneAndUpdate(
        { _id: req.params.bookingId, host: req.user._id, status: "pending" },
        { $set: { status: "rejected" } },
        { returnDocument: "after" }
    );
    if (!updated) throw new ExpressError(404, "The pending booking request could not be found.");
    req.flash("success", "Booking request declined.");
    res.redirect(`/bookings/${updated._id}`);
};
