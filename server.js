// server.js (WITH ALL FIXES AND NEW ENDPOINT)
import express from "express";
import session from "express-session";
import passport from "passport";
import dotenv from "dotenv";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import flash from "connect-flash";
import path from "path";
import { createClient } from "redis";
import { RedisStore } from "connect-redis"; 

dotenv.config();

const app = express();

// ----------------------------------------------------
// ✅ FIX 1: TRUST PROXY & Cookie Security
app.set('trust proxy', 1); 
// ----------------------------------------------------

// -----------------------
// REDIS CLIENT SETUP (No changes needed here)
// -----------------------
let redisClient;
let sessionStore;

if (process.env.KV_URL) {
  // Production: Use Redis (Vercel KV / Upstash)
  redisClient = createClient({
    url: process.env.KV_URL,
  });

  redisClient.on("error", (err) => console.error("Redis Client Error", err));
  redisClient.on("connect", () => console.log("✅ Redis Connected"));
  redisClient.connect().catch(console.error);

  sessionStore = new RedisStore({
    client: redisClient,
    prefix: "sess:",
    ttl: 14 * 24 * 60 * 60,
  });
  console.log("✅ Using Redis session store (production)");
} else {
  sessionStore = undefined;
  console.log("⚠️ Using in-memory sessions (development only)");
}

// -----------------------
// MIDDLEWARE
// -----------------------
app.use(express.static(path.join(process.cwd(), "public")));

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      // ✅ FIX 2: Correct secure flag setting for proxies
      secure: process.env.NODE_ENV === "production" && app.get('env') !== 'development', 
      httpOnly: true,
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// -----------------------
// GOOGLE OAUTH STRATEGY (No changes needed here)
// -----------------------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let role = "general";
        let isAuthorized = false;

        if (email.endsWith("@stu.pathfinder-mm.org") || email === "avagarimike11@gmail.com") {
          role = "student";
          isAuthorized = true;
        }

        if (!isAuthorized) {
          return done(null, false, {
            message: "You are not a verified student of Pathfinder Institute Myanmar.",
          });
        }

        return done(null, { email, name: profile.displayName, role });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// -----------------------
// AUTH ROUTES (No changes needed here)
// -----------------------
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/failure",
    failureFlash: true,
  }),
  (req, res) => {
    res.redirect("/dashboard");
  }
);

app.get("/auth/failure", (req, res) => {
  const messages = req.flash("error");
  const errorMessage = messages.length ? messages[0] : "Login failed.";
  const encodedMessage = encodeURIComponent(errorMessage);
  res.redirect(`/index.html?authError=${encodedMessage}`);
});

// -----------------------
// PROTECTED ROUTES & API ENDPOINTS
// -----------------------

function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/index.html");
}

// ✅ NEW ROUTE: API Endpoint for Client-Side Script
app.get("/session-info", ensureLoggedIn, (req, res) => {
    res.json({
        loggedIn: true,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
    });
});

// ✅ UPDATED ROUTE: Serve the actual Dashboard HTML file
app.get("/dashboard", ensureLoggedIn, (req, res) => {
  // Assuming dashboard.html is in your public directory
  res.sendFile(path.join(process.cwd(), "public", "dashboard.html"));
});

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/index.html"));
  });
});

// -----------------------
// START SERVER
// -----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

// -----------------------
// START SERVER
// -----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
