const mongoose = require(`mongoose`);
const Review = require(`./review.js`)
const Wishlist = require("./wishlist.js");
const Schema = mongoose.Schema;
const { amenities, propertyTypes } = require("../utils/listingOptions");
const imageSchema = new Schema({
    url: { type: String, required: true },
    filename: { type: String, required: true }
});
const defaultImage = 
"https://images.unsplash.com/photo-1625505826533-5c80aca7d157?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fGdvYXxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60";

const listingSchema = new Schema({
    title : {
        type : String,
        required : true,
        trim: true,
        minlength: 2,
        maxlength: 100
    },
    description : {
        type : String,
        required : true,
        trim: true,
        maxlength: 2000
    },
    image :{
            type : String,
            set: (link) => !link ? defaultImage : link.trim(),
            default : defaultImage
    },
    images: {
        type: [imageSchema],
        default: [],
        validate: {
            validator: (images) => images.length <= 8,
            message: "A listing can have no more than 8 images."
        }
    },
    price : {
        type : Number,
        required : true,
        min: 0
    },
    location : {
        type : String,
        required : true,
        trim: true
    },
    country : {
        type : String,
        required : true,
        trim: true
    },
    propertyType: {
        type: String,
        enum: propertyTypes,
        default: "other"
    },
    amenities: {
        type: [{ type: String, enum: amenities }],
        default: [],
        validate: {
            validator: (items) => items.length <= 10,
            message: "A listing can have no more than 10 amenities."
        }
    },
    maximumGuests: { type: Number, min: 1, max: 50, default: 2 },
    bedrooms: { type: Number, min: 0, max: 50, default: 1 },
    bathrooms: { type: Number, min: 0, max: 50, default: 1 },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    averageRating: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    confirmedPeriods: {
        type: [{
            booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
            checkIn: { type: Date, required: true },
            checkOut: { type: Date, required: true }
        }],
        default: [],
        validate: {
            validator: (periods) => periods.length <= 250,
            message: "Too many future confirmed bookings are stored for this listing."
        }
    },
    reviews : [{
        type : Schema.Types.ObjectId,
        ref : "Review"
    }],
    owner: {
        type: Schema.Types.ObjectId,
        ref:"User",
    },
}, { timestamps: true });


// Mongoose Middleware for Deleting All The Reviews In Case The Parent Listing Is Deleted.
listingSchema.post(`findOneAndDelete`, async (listing) => {
    if (listing) {
        await Promise.all([
            Review.deleteMany({_id : {$in : listing.reviews}}),
            Wishlist.deleteMany({ listing: listing._id }),
            require("./booking.js").deleteMany({ listing: listing._id })
        ]);
    }
});

const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;