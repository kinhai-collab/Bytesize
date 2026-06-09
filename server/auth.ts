import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { channels, users, videos, type User } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    oauthState?: string;
  }
}

const emailSchema = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oauthProviders = new Set(["google", "apple"]);

function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    provider: user.provider,
  };
}

export async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      email text NOT NULL UNIQUE,
      display_name text,
      provider text NOT NULL DEFAULT 'email',
      created_at timestamp DEFAULT now(),
      last_login_at timestamp DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id);`);
  await pool.query(`ALTER TABLE channels ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id);`);
}

export function configureAuth(app: Express) {
  const PgSession = connectPgSimple(session);
  const sessionSecret = process.env.SESSION_SECRET || process.env.DATABASE_URL || "bytesize-dev-session";

  app.set("trust proxy", 1);
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      name: "bytesize.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      },
    }),
  );
}

export async function getSessionUser(req: Request) {
  if (!req.session.userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
  return user || null;
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ message: "Please sign in to continue" });
  }

  (req as Request & { user: User }).user = user;
  next();
}

export function currentUser(req: Request) {
  return (req as Request & { user: User }).user;
}

async function claimLegacyDataIfFirstUser(userId: number) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count !== 1) return;

  await db.update(videos).set({ userId }).where(sql`${videos.userId} is null`);
  await db.update(channels).set({ userId }).where(sql`${channels.userId} is null`);
}

function getBaseUrl(req: Request) {
  const configured = process.env.PUBLIC_APP_URL || process.env.REPLIT_DOMAINS?.split(",")[0];
  if (configured) {
    return configured.startsWith("http") ? configured : `https://${configured}`;
  }

  return `${req.protocol}://${req.get("host")}`;
}

function makeOAuthState(req: Request, provider: string) {
  const state = `${provider}:${crypto.randomUUID()}`;
  req.session.oauthState = state;
  return state;
}

function validateOAuthState(req: Request, state: unknown, provider: string) {
  const expected = req.session.oauthState;
  req.session.oauthState = undefined;
  return typeof state === "string" && expected === state && state.startsWith(`${provider}:`);
}

async function signInUser(req: Request, userInput: { email: string; displayName?: string | null; provider: string }) {
  const email = userInput.email.trim().toLowerCase();
  const displayName = userInput.displayName?.trim() || null;
  const provider = userInput.provider.trim() || "email";

  if (!emailSchema.test(email)) {
    throw new Error("Enter a valid email address");
  }

  const existing = await db.select().from(users).where(eq(users.email, email));
  const [user] =
    existing.length > 0
      ? await db
          .update(users)
          .set({ displayName: displayName || existing[0].displayName, provider, lastLoginAt: new Date() })
          .where(eq(users.id, existing[0].id))
          .returning()
      : await db
          .insert(users)
          .values({ email, displayName, provider })
          .returning();

  await claimLegacyDataIfFirstUser(user.id);
  req.session.userId = user.id;
  return user;
}

async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google sign-in is not configured yet");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Google sign-in failed");
  }

  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("Google did not return an access token");

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });

  if (!profileResponse.ok) {
    throw new Error("Could not read your Google profile");
  }

  return (await profileResponse.json()) as { email?: string; name?: string };
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function derToJose(signature: Buffer) {
  let offset = 3;
  let rLength = signature[offset];
  offset += 1;
  let r = signature.subarray(offset, offset + rLength);
  offset += rLength + 1;
  let sLength = signature[offset];
  offset += 1;
  let s = signature.subarray(offset, offset + sLength);

  if (r[0] === 0) r = r.subarray(1);
  if (s[0] === 0) s = s.subarray(1);

  const rPadded = Buffer.concat([Buffer.alloc(Math.max(0, 32 - r.length)), r]);
  const sPadded = Buffer.concat([Buffer.alloc(Math.max(0, 32 - s.length)), s]);
  return Buffer.concat([rPadded, sPadded]);
}

function createAppleClientSecret() {
  const teamId = process.env.APPLE_TEAM_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!teamId || !clientId || !keyId || !privateKey) {
    throw new Error("Apple ID sign-in is not configured yet");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 60 * 60 * 24 * 30,
      aud: "https://appleid.apple.com",
      sub: clientId,
    }),
  );
  const data = `${header}.${payload}`;
  const signature = derToJose(crypto.sign("sha256", Buffer.from(data), privateKey));
  return `${data}.${base64Url(signature)}`;
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Apple did not return a usable identity token");
  return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
    email?: string;
  };
}

async function exchangeAppleCode(code: string, redirectUri: string) {
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Apple ID sign-in is not configured yet");
  }

  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: createAppleClientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Apple ID sign-in failed");
  }

  const tokenJson = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenJson.id_token) throw new Error("Apple did not return an identity token");
  return decodeJwtPayload(tokenJson.id_token);
}

function redirectWithAuthError(req: Request, res: Response, error: Error) {
  const message = encodeURIComponent(error.message);
  res.redirect(`${getBaseUrl(req)}/?authError=${message}`);
}

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/me", async (req, res) => {
    const user = await getSessionUser(req);
    res.json({ user: user ? serializeUser(user) : null });
  });

  app.get("/api/auth/options", (_req, res) => {
    res.json({
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
    });
  });

  app.get("/api/auth/google", (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(501).json({ message: "Google sign-in is not configured yet" });
    }

    const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      state: makeOAuthState(req, "google"),
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      if (!validateOAuthState(req, req.query.state, "google")) {
        throw new Error("Google sign-in expired. Please try again.");
      }

      const code = typeof req.query.code === "string" ? req.query.code : "";
      const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
      const profile = await exchangeGoogleCode(code, redirectUri);
      if (!profile.email) throw new Error("Google did not return an email address");
      await signInUser(req, { email: profile.email, displayName: profile.name, provider: "google" });
      res.redirect(getBaseUrl(req));
    } catch (error) {
      redirectWithAuthError(req, res, error instanceof Error ? error : new Error("Google sign-in failed"));
    }
  });

  app.get("/api/auth/apple", (req, res) => {
    if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY) {
      return res.status(501).json({ message: "Apple ID sign-in is not configured yet" });
    }

    const redirectUri = `${getBaseUrl(req)}/api/auth/apple/callback`;
    const params = new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "form_post",
      scope: "email name",
      state: makeOAuthState(req, "apple"),
    });

    res.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
  });

  app.post("/api/auth/apple/callback", async (req, res) => {
    try {
      if (!validateOAuthState(req, req.body?.state, "apple")) {
        throw new Error("Apple ID sign-in expired. Please try again.");
      }

      const code = String(req.body?.code || "");
      const redirectUri = `${getBaseUrl(req)}/api/auth/apple/callback`;
      const profile = await exchangeAppleCode(code, redirectUri);
      if (!profile.email) {
        throw new Error("Apple did not return an email address. Please use email sign-in for this Apple ID.");
      }

      await signInUser(req, { email: profile.email, provider: "apple" });
      res.redirect(getBaseUrl(req));
    } catch (error) {
      redirectWithAuthError(req, res, error instanceof Error ? error : new Error("Apple ID sign-in failed"));
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const displayName = String(req.body?.displayName || "").trim() || null;
    const provider = String(req.body?.provider || "email").trim() || "email";

    if (!emailSchema.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (oauthProviders.has(provider)) {
      return res.status(400).json({ message: "Use the sign-in button for this provider" });
    }

    const user = await signInUser(req, { email, displayName, provider });
    res.json({ user: serializeUser(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("bytesize.sid");
      res.status(204).end();
    });
  });
}
