const fallback = "your-secret-key";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET must be set when NODE_ENV=production. Refuse to start with a default secret.",
  );
}

if (!process.env.JWT_SECRET) {
  console.warn(
    "⚠️  JWT_SECRET not set — using insecure dev fallback. Set JWT_SECRET in .env before deploy.",
  );
}

export const jwtConstants = {
  secret: process.env.JWT_SECRET || fallback,
};
