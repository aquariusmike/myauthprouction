// server.js (FULLY ES MODULE COMPATIBLE FIX)
import express from "express";
import session from "express-session";
import passport from "passport";
import dotenv from "dotenv";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import flash from "connect-flash";
import path from "path";
import { createClient } from "redis";

// 👇 FIX: Use curly braces for named import
import { RedisStore } from "connect-redis"; 

dotenv.config();

const app = express();

// -----------------------
// REDIS CLIENT SETUP
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

  // Initialize store using the imported Class
  sessionStore = new RedisStore({
    client: redisClient,
    prefix: "sess:",
    ttl: 14 * 24 * 60 * 60, // 14 days
  });

  console.log("✅ Using Redis session store (production)");
} else {
  // Development: Use memory store (not for production!)
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
    rolling: true, // reset session expiration on activity
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS in production
      httpOnly: true,
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// -----------------------
// GOOGLE OAUTH STRATEGY
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

        if (email.endsWith("@stu.pathfinder-mm.org")) {
          role = "student";
          isAuthorized = true;
        }

        if (email === "avagarimike11@gmail.com") {
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
// AUTH ROUTES
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
// PROTECTED ROUTES
// -----------------------
function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/index.html");
}

app.get("/dashboard", ensureLoggedIn, (req, res) => {
  const { name, email, role } = req.user;
  res.send(`
    <html>
      <head>
        <title>Dashboard</title>
        <style>
          body { font-family: Arial; padding: 20px; }
          .card { padding: 20px; border: 1px solid #ddd; border-radius: 10px; margin-top: 20px; }
          .stu { background: #e3f2fd; }
          .gen { background: #fff3e0; }
        </style>
      </head>
      <body>
        <h2>Welcome ${name}</h2>
        <p>Email: ${email}</p>
        <p>Role: <b>${role}</b></p>
        ${
          role === "student"
            ? `<div class="card stu"><h3>Student Docs Section</h3></div>`
            : `<div class="card gen"><h3>Enrollment Section</h3></div>`
        }
        <br>
        <a href="/logout">Logout</a>
      </body>
    </html>
  `);
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