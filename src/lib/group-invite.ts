import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const SITE_SECRET = process.env.APP_GROUP_ENCRYPTION_SECRET;
if (!SITE_SECRET) {
  throw new Error(
    "APP_GROUP_ENCRYPTION_SECRET environment variable is required for group invites"
  );
}

const ALGORITHM = "aes-256-gcm";

/**
 * Generate a random group secret (unhashed) for a new group
 */
export function generateGroupSecret(): string {
  return randomBytes(32).toString("base64");
}

/**
 * Hash a group secret for storage in the database
 */
export function hashGroupSecret(groupSecret: string): string {
  return createHash("sha256").update(groupSecret).digest("hex");
}

/**
 * Create an invite token that encrypts group ID and user email
 * salted with the group secret and site-wide secret
 */
export function createInviteToken(params: {
  groupId: string;
  email: string;
  groupSecret: string; // unhashed group secret
}): string {
  const { groupId, email, groupSecret } = params;

  // Create a salt combining group secret and site secret
  const salt = createHash("sha256")
    .update(groupSecret + SITE_SECRET)
    .digest();

  // Use first 32 bytes for key
  const key = salt.subarray(0, 32);

  // Create initialization vector
  const iv = randomBytes(16);

  // Encrypt the payload
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const payload = JSON.stringify({ groupId, email });
  const encrypted = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine iv + authTag + encrypted data
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString("base64url");
}

/**
 * Verify and decrypt an invite token
 * Returns the decrypted groupId and email if valid, or null if invalid
 */
export function verifyInviteToken(params: {
  token: string;
  groupSecret: string; // unhashed group secret
}): {
  groupId: string;
  email: string;
} | null {
  const { token, groupSecret } = params;

  try {
    // Decode the token
    const combined = Buffer.from(token, "base64url");

    // Extract iv (16 bytes), authTag (16 bytes), and encrypted data
    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const encrypted = combined.subarray(32);

    // Create the same salt
    const salt = createHash("sha256")
      .update(groupSecret + SITE_SECRET)
      .digest();

    const key = salt.subarray(0, 32);

    // Decrypt
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    const payload = JSON.parse(decrypted.toString("utf8"));

    return {
      groupId: payload.groupId,
      email: payload.email,
    };
  } catch {
    return null;
  }
}
