const express =  require(`express`);
const app = express();
const ejsMate = require('ejs-mate');
const mongoose = require(`mongoose`);
const path = require(`path`);
const methodOverride = require("method-override");
const ExpressError = require(`./utils/expressError.js`);
const listingRouter = require(`./routes/listing.js`);
const reviewRouter = require(`./routes/reviews.js`);
const userRouter = require(`./routes/user.js`);
const session = require(`express-session`);
const flash = require(`connect-flash`);
const passport = require(`passport`);
const LocalStrategy = require('passport-local');
const User = require('./models/user.js');
const Review = require('./models/review.js');
const Wishlist = require('./models/wishlist.js');
const Booking = require('./models/booking.js');
const bookingRouter = require("./routes/bookings.js");
const hostRouter = require("./routes/host.js");
const adminRouter = require("./routes/admin.js");

const sessionOptions = {
    secret: process.env.SESSION_SECRET || "wanderlust-development-secret",
    resave : false,
    saveUninitialized : true,
    cookie : {
        maxAge : 7 * 24 * 60 * 60 * 1000,
        httpOnly : true,
    },
}

app.set("views", path.join(__dirname,"views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({extended: true}));
app.use(methodOverride("_method"));
app.engine(`ejs`, ejsMate);
app.use(session(sessionOptions));
app.use(flash());

// Implementing Local Strategy For Authentication For Indivisual Sessions
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

async function main(){
    await mongoose.connect(process.env.MONGODB_URI || `mongodb://127.0.0.1:27017/wanderlust`);
    await Promise.all([Review.createIndexes(), Wishlist.createIndexes(), Booking.createIndexes()]);
}

main().then(() => {
    console.log(`Connection Successfull`);
    app.listen(process.env.PORT || 8080, () => {
        console.log(`\nThe App Is Listening On Port ${process.env.PORT || 8080}`);
    });
}).catch(async (error) => {
    console.error("Application startup failed.", error);
    await mongoose.disconnect();
    process.exitCode = 1;
});

app.get('/', (req, res) => {
    res.redirect('/listings');
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: "ok",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
});

// Adding Our Flash Messages In Session Object And Making Them Acessible For All Routes
// By Storing Them In As Variables In The locals Object Of Request.
app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.user = req.user;
    res.locals.currUser = req.user;
    next();
});

app.get('/about', (req, res) => {
    res.render('about.ejs');
});

app.use(`/listings/:id/reviews`, reviewRouter);
app.use(`/listings`, listingRouter);
app.use("/bookings", bookingRouter);
app.use("/host", hostRouter);
app.use("/admin", adminRouter);
app.use(`/`, userRouter);


// Handling Errors
app.all("/{*splat}", (req, res, next) => {
    next(new ExpressError(404,"Requested Page Is Not Found!!"));
});

app.use((err, req, res, next) => {
    let {statusCode = 500, message = "Encountered Some Error!"} = err;
    console.log(`\nError Encounered!!! \n${message}!!!`);
    console.log(err);
    res.status(statusCode).render("error.ejs", {err});
});