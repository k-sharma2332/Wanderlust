const mongoose = require(`mongoose`);
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose').default;

const userSchema = new Schema({
    email : {
        type : String,
        required : true
    },
    role: {
        type: String,
        enum: ["traveler", "host", "admin"],
        default: "traveler"
    }
});

userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model(`User`, userSchema);