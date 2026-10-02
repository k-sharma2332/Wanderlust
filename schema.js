const Joi = require(`joi`);
const { amenities, propertyTypes } = require("./utils/listingOptions");

module.exports.listingSchema = Joi.object({
    listing : Joi.object({
        title : Joi.string().trim().min(2).max(100).required(),
        description : Joi.string().trim().min(10).max(2000).required(),
        image : Joi.string().uri({ scheme: ["http", "https"] }).allow("", null),
        price : Joi.number().required().min(0),
        location : Joi.string().trim().min(2).max(100).required(),
        country : Joi.string().trim().min(2).max(100).required(),
        propertyType: Joi.string().valid(...propertyTypes),
        amenities: Joi.array().items(Joi.string().valid(...amenities)).max(10),
        maximumGuests: Joi.number().integer().min(1).max(50),
        bedrooms: Joi.number().integer().min(0).max(50),
        bathrooms: Joi.number().min(0).max(50),
        latitude: Joi.number().empty("").min(-90).max(90),
        longitude: Joi.number().empty("").min(-180).max(180),
        removeImages: Joi.array().items(Joi.string().hex().length(24)).max(8)
    }).required().with("latitude", "longitude").with("longitude", "latitude")
});

module.exports.reviewSchema = Joi.object({
    review : Joi.object({
        comment : Joi.string().trim().min(3).max(1000).required(),
        rating : Joi.number().required().min(1).max(5)
    }).required().unknown(false)
});

module.exports.bookingSchema = Joi.object({
    booking: Joi.object({
        checkIn: Joi.string().isoDate().required(),
        checkOut: Joi.string().isoDate().required(),
        guests: Joi.number().integer().min(1).max(50).required()
    }).required().unknown(false)
});