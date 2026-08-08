import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

const COOKIE_NAME = "bb_session";

function secret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Add it in your Vercel project's environment variables.");
  }
  return process.env.JWT_SECRET;
}

export function createSessionCookie(address) {
  const token = jwt.sign({ address }, secret(), { expiresIn: "7d" });
  return serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie() {
  return serialize(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function getAddressFromRequest(req) {
  const cookies = parse(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret());
    return payload.address;
  } catch (e) {
    return null;
  }
}

// Call at the top of any API route that requires a logged-in wallet.
// Writes a 401 response and returns null if there's no valid session.
export function requireAuth(req, res) {
  const address = getAddressFromRequest(req);
  if (!address) {
    res.status(401).json({ error: "Not authenticated — connect your wallet first." });
    return null;
  }
  return address;
}
