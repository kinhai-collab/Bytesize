import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { channels, users, videos, type User } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const emailSchema = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/me", async (req, res) => {
    const user = await getSessionUser(req);
    res.json({ user: user ? serializeUser(user) : null });
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const displayName = String(req.body?.displayName || "").trim() || null;
    const provider = String(req.body?.provider || "email").trim() || "email";

    if (!emailSchema.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
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
    res.json({ user: serializeUser(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("bytesize.sid");
      res.status(204).end();
    });
  });
}
