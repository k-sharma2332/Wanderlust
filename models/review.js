const mongoose = require(`mongoose`);
const Schema = mongoose.Schema;

const reviewSchema = new Schema({
    listing: {
        type: Schema.Types.ObjectId,
        ref: "Listing"
    },
    comment : {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    rating : {
        type : Number,
        min : 1,
        max : 5,
    },
    createdAt : {
        type : Date,
        default : Date.now
    },
    author : {
        type : Schema.Types.ObjectId,
        ref : "User"
    },
    authorName : String
});

reviewSchema.index(
    { listing: 1, author: 1 },
    {
        unique: true,
        partialFilterExpression: { listing: { $exists: true }, author: { $exists: true } }
    }
);

module.exports = mongoose.model("Review", reviewSchema); 