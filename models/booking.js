const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    traveler: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    guests: { type: Number, required: true, min: 1, max: 50 },
    nights: { type: Number, required: true, min: 1 },
    nightlyRate: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    status: {
        type: String,
        enum: ["pending", "confirmed", "rejected", "cancelled"],
        default: "pending",
        index: true
    },
    listingSnapshot: {
        title: { type: String, required: true },
        location: { type: String, required: true },
        image: { type: String, required: true }
    }
}, { timestamps: true });

bookingSchema.index({ listing: 1, status: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ traveler: 1, createdAt: -1 });
bookingSchema.index({ host: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
