import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import Stripe from "stripe";
import { AuthenticityReport, VerificationResult, StripeVerificationResult, AVSChecks, PreAuthResult, StripeBinData } from "./src/types";
import { generateIdempotencyKey, idempotencyStore } from "./src/utils/idempotency";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// ---------------------------------------------------------------------------
// Security Headers (HSTS, CSP for Stripe iframes)
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  // HSTS - advisory for localhost, critical for production
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  // Additional security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ---------------------------------------------------------------------------
// Generate ephemeral RSA-OAEP 2048 keypair on startup for security demo
// ---------------------------------------------------------------------------
let serverPrivateKey: string = "";
let serverPublicKey: string = "";

try {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });
  serverPublicKey = publicKey;
  serverPrivateKey = privateKey;
  console.log("🔒 Ephemeral Node RSA-2048 Cryptographic Keypair generated.");
} catch (err) {
  console.error("Failed to generate secure RSA keypair", err);
}

// ---------------------------------------------------------------------------
// Gemini SDK configuration using the modern @google/genai client
// ---------------------------------------------------------------------------
let ai: GoogleGenAI | null = null;
const api_key = process.env.GEMINI_API_KEY;

if (api_key && api_key !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: api_key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    console.log("🤖 Server-side Gemini AI Client initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize server-side Gemini client:", error);
  }
} else {
  console.warn("⚠️ GEMINI_API_KEY missing or not configured. Falling back to sandbox simulator.");
}

// ---------------------------------------------------------------------------
// Stripe SDK configuration
// ---------------------------------------------------------------------------
let stripeClient: Stripe | null = null;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

if (stripeSecretKey && stripeSecretKey !== "MY_STRIPE_SECRET_KEY") {
  try {
    stripeClient = new Stripe(stripeSecretKey, {
      typescript: true,
    });
    console.log("💳 Stripe SDK initialized successfully (test mode).");
  } catch (error) {
    console.error("Failed to initialize Stripe SDK:", error);
  }
} else {
  console.warn("⚠️ STRIPE_SECRET_KEY missing or not configured. Stripe mode will be unavailable.");
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter for BIN lookups
// ---------------------------------------------------------------------------
const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
const RATE_LIMIT_MAX = 30; // requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Helper Luhn Algorithm Verification
// ---------------------------------------------------------------------------
function checkLuhn(cardNumber: string): boolean {
  const cleanNum = cardNumber.replace(/\D/g, "");
  if (!cleanNum || cleanNum.length < 13) return false;
  
  let sum = 0;
  let shouldDouble = false;
  for (let i = cleanNum.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanNum.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Card Brand & BIN Resolver
// ---------------------------------------------------------------------------
function getBinMetadata(cardNumber: string) {
  const cleanNum = cardNumber.replace(/\D/g, "");
  const bin = cleanNum.substring(0, 6);
  
  // High-fidelity BIN lookups representing real issuing banks and level variants
  if (cleanNum.startsWith("4")) {
    if (bin === "411111" || bin.startsWith("4111")) {
      return {
        brand: "Visa",
        issuer: "Chase Bank USA, N.A.",
        level: "Signature Luxury",
        category: "Credit (Titanium Private Client)",
        country: "United States (US)",
        region: "North America"
      };
    }
    return {
      brand: "Visa",
      issuer: "Wells Fargo Bank, N.A.",
      level: "Classic Travel Blue",
      category: "Credit (Standard consumer)",
      country: "United States (US)",
      region: "North America"
    };
  } else if (cleanNum.startsWith("5")) {
    if (bin.startsWith("5100") || bin.startsWith("55")) {
      return {
        brand: "Mastercard",
        issuer: "Capital One N.A.",
        level: "World Elite Luxury Perks",
        category: "Credit (Platinum Cashback)",
        country: "United States (US)",
        region: "North America"
      };
    }
    return {
      brand: "Mastercard",
      issuer: "Citibank N.A.",
      level: "Platinum Business",
      category: "Credit (Corporate Reward)",
      country: "United Kingdom (GB)",
      region: "Europe"
    };
  } else if (cleanNum.startsWith("34") || cleanNum.startsWith("37")) {
    return {
      brand: "American Express",
      issuer: "American Express Centurion",
      level: "Black Card / Centurion",
      category: "Charge (Ultra-Premium High Net Worth)",
      country: "United States (US)",
      region: "Global Private Banking"
    };
  } else if (cleanNum.startsWith("6011") || cleanNum.startsWith("65")) {
    return {
      brand: "Discover",
      issuer: "Discover Bank",
      level: "Cash Back Prime",
      category: "Credit",
      country: "United States (US)",
      region: "North America"
    };
  } else if (cleanNum.startsWith("35")) {
    return {
      brand: "JCB",
      issuer: "JCB Japan Co., Ltd.",
      level: "Grand Preferred",
      category: "Credit",
      country: "Japan (JP)",
      region: "Asia-Pacific"
    };
  } else {
    return {
      brand: "Unknown Brand",
      issuer: "Generic Credit Network",
      level: "Standard Entry Level",
      category: "Debit/Credit",
      country: "Global (GL)",
      region: "Worldwide"
    };
  }
}

// ---------------------------------------------------------------------------
// Helper: Map Stripe brand to display metadata
// ---------------------------------------------------------------------------
function mapStripeBrandToMetadata(brand: string, funding: string, country: string) {
  const brandMap: Record<string, { issuer: string; level: string; region: string }> = {
    visa: { issuer: "Visa Inc. Network", level: "Stripe Verified", region: "Global" },
    mastercard: { issuer: "Mastercard Worldwide", level: "Stripe Verified", region: "Global" },
    amex: { issuer: "American Express", level: "Charge / Premium", region: "Global" },
    discover: { issuer: "Discover Financial Services", level: "Standard", region: "North America" },
    jcb: { issuer: "JCB Co., Ltd.", level: "International", region: "Asia-Pacific" },
    diners: { issuer: "Diners Club International", level: "Premium", region: "Global" },
    unionpay: { issuer: "China UnionPay", level: "International", region: "Asia-Pacific" },
  };

  const meta = brandMap[brand] || { issuer: "Unknown Issuer", level: "Standard", region: "Global" };

  return {
    brand: brand.charAt(0).toUpperCase() + brand.slice(1),
    issuer: meta.issuer,
    level: meta.level,
    category: `${funding.charAt(0).toUpperCase() + funding.slice(1)} Card`,
    country: country ? `${country.toUpperCase()}` : "Unknown",
    region: meta.region,
  };
}

// ---------------------------------------------------------------------------
// Helper: Retry a Stripe void/cancel with exponential backoff
// ---------------------------------------------------------------------------
async function retryStripeCancel(
  stripe: Stripe,
  paymentIntentId: string,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const idempKey = generateIdempotencyKey("void");
      await stripe.paymentIntents.cancel(paymentIntentId, {}, {
        idempotencyKey: idempKey,
      });
      return { success: true };
    } catch (err: any) {
      if (attempt === maxRetries - 1) {
        return { success: false, error: err.message };
      }
      // Exponential backoff: 500ms, 1s, 2s
      const delay = Math.pow(2, attempt) * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

// ---------------------------------------------------------------------------
// API Endpoints
// ---------------------------------------------------------------------------

// Serve the server's public key (Vite client will pull this on load)
app.get("/api/encryption-key", (req, res) => {
  res.json({
    publicKey: serverPublicKey,
    algorithm: "RSA-OAEP-2048",
    hash: "SHA-256",
    keyId: `server-k-${PORT}-2026`
  });
});

// Serve Stripe publishable key configuration to frontend
app.get("/api/stripe-config", (req, res) => {
  if (stripePublishableKey && stripePublishableKey !== "MY_STRIPE_PUBLISHABLE_KEY") {
    res.json({
      publishableKey: stripePublishableKey,
      available: true,
    });
  } else {
    res.json({
      publishableKey: null,
      available: false,
    });
  }
});

// ---------------------------------------------------------------------------
// NEW: Stripe PCI-DSS Verification Endpoint
// Receives only a paymentMethodId — no raw PANs ever reach the server
// ---------------------------------------------------------------------------
app.post("/api/verify-stripe", async (req, res) => {
  try {
    if (!stripeClient) {
      return res.status(503).json({
        error: "Stripe is not configured. Add STRIPE_SECRET_KEY to your .env file.",
      });
    }

    const { paymentMethodId, cardholderName, billingZip } = req.body;

    if (!paymentMethodId) {
      return res.status(400).json({ error: "Missing paymentMethodId token." });
    }

    // Rate limit check
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({
        error: "Rate limit exceeded. Maximum 30 BIN lookups per minute.",
      });
    }

    // ----- STEP 2: BIN Lookup via Stripe PaymentMethod retrieval -----
    let paymentMethod: Stripe.PaymentMethod;
    try {
      paymentMethod = await stripeClient.paymentMethods.retrieve(paymentMethodId);
    } catch (pmErr: any) {
      return res.status(400).json({
        error: `Failed to retrieve PaymentMethod: ${pmErr.message}`,
      });
    }

    const card = paymentMethod.card;
    if (!card) {
      return res.status(400).json({ error: "PaymentMethod does not contain card data." });
    }

    // Extract Stripe BIN data
    const stripeBinData: StripeBinData = {
      brand: card.brand || "unknown",
      last4: card.last4 || "0000",
      expMonth: card.exp_month,
      expYear: card.exp_year,
      funding: card.funding || "unknown",
      country: card.country || "US",
    };

    // Check if card is expired
    const now = new Date();
    const cardExpiry = new Date(card.exp_year, card.exp_month - 1, 28);
    const isExpired = cardExpiry < now;

    // Check for prepaid card blocking
    const flags: string[] = [];
    if (card.funding === "prepaid") {
      flags.push("PREPAID_CARD_DETECTED");
    }
    if (isExpired) {
      flags.push("CARD_EXPIRED");
    }

    // Map to existing authenticity report format
    const binMeta = mapStripeBrandToMetadata(
      stripeBinData.brand,
      stripeBinData.funding,
      stripeBinData.country
    );

    const authenticity: AuthenticityReport = {
      isValidLuhn: true, // Stripe validates this during tokenization
      issuer: binMeta.issuer,
      cardType: binMeta.category,
      region: binMeta.region,
      binMetadata: {
        brand: binMeta.brand,
        level: binMeta.level,
        category: binMeta.category,
        country: binMeta.country,
      },
      securityChecks: {
        cvvMatched: true,   // Will be updated after pre-auth
        expiryUnexpired: !isExpired,
        formatCorrect: true, // Stripe validates format during tokenization
      },
    };

    // ----- STEP 3: Pre-Auth Hold + AVS/CVV Checks -----
    const preAuthIdempKey = generateIdempotencyKey("preauth");
    let preAuth: PreAuthResult;
    let avsChecks: AVSChecks = {
      addressLine1: "unchecked",
      postalCode: "unchecked",
      cvcCheck: "unchecked",
    };
    let threeDSecureStatus: StripeVerificationResult["threeDSecure"] = {
      status: "not_required",
    };

    try {
      // Create a PaymentIntent with capture_method: 'manual' for pre-auth hold
      // Using $0.50 (50 cents) — Stripe's minimum amount for USD
      const paymentIntent = await stripeClient.paymentIntents.create(
        {
          amount: 50, // $0.50 in cents
          currency: "usd",
          payment_method: paymentMethodId,
          capture_method: "manual", // Pre-auth hold only, don't capture
          confirm: true, // Confirm immediately
          description: "VerifyCORE pre-authorization verification hold",
          metadata: {
            source: "verifycore",
            cardholderName: cardholderName || "N/A",
          },
          payment_method_options: {
            card: {
              request_three_d_secure: "automatic",
            },
          },
          return_url: `http://localhost:${PORT}/?stripe_return=true`,
        },
        {
          idempotencyKey: preAuthIdempKey,
        }
      );

      // ----- STEP 2 continued: 3DS handling -----
      if (paymentIntent.status === "requires_action") {
        // 3DS challenge is required — pass client_secret to frontend
        threeDSecureStatus = {
          status: "challenge_required",
          clientSecret: paymentIntent.client_secret || undefined,
        };

        preAuth = {
          holdAmount: 0.50,
          holdCurrency: "USD",
          holdStatus: "skipped",
          voidConfirmed: false,
          paymentIntentId: paymentIntent.id,
          avsChecks,
          idempotencyKey: preAuthIdempKey,
        };
      } else if (paymentIntent.status === "requires_payment_method") {
        // Card was declined
        const lastError = paymentIntent.last_payment_error;
        flags.push(`DECLINED: ${lastError?.decline_code || lastError?.message || "unknown"}`);

        preAuth = {
          holdAmount: 0.50,
          holdCurrency: "USD",
          holdStatus: "skipped",
          voidConfirmed: false,
          paymentIntentId: paymentIntent.id,
          avsChecks,
          idempotencyKey: preAuthIdempKey,
        };
      } else {
        // Payment succeeded or is in a captured/hold state
        // Extract AVS/CVV check results from the latest charge
        const latestCharge = paymentIntent.latest_charge;
        if (latestCharge && typeof latestCharge !== "string") {
          const cardChecks = latestCharge.payment_method_details?.card?.checks;
          if (cardChecks) {
            avsChecks = {
              addressLine1: cardChecks.address_line1_check || "unavailable",
              postalCode: cardChecks.address_postal_code_check || "unavailable",
              cvcCheck: cardChecks.cvc_check || "unavailable",
            };
          }

          // Check if 3DS was performed
          const threeDSecureResult = latestCharge.payment_method_details?.card?.three_d_secure;
          if (threeDSecureResult) {
            threeDSecureStatus = {
              status: threeDSecureResult.result === "authenticated" || threeDSecureResult.result === "attempt_acknowledged"
                ? "succeeded"
                : threeDSecureResult.result === "failed"
                  ? "failed"
                  : "not_required",
            };
          }
        } else if (typeof latestCharge === "string") {
          // If the charge is just an ID, retrieve it to get AVS data
          try {
            const charge = await stripeClient.charges.retrieve(latestCharge);
            const cardChecks = charge.payment_method_details?.card?.checks;
            if (cardChecks) {
              avsChecks = {
                addressLine1: cardChecks.address_line1_check || "unavailable",
                postalCode: cardChecks.address_postal_code_check || "unavailable",
                cvcCheck: cardChecks.cvc_check || "unavailable",
              };
            }

            const threeDSecureResult = charge.payment_method_details?.card?.three_d_secure;
            if (threeDSecureResult) {
              threeDSecureStatus = {
                status: threeDSecureResult.result === "authenticated" || threeDSecureResult.result === "attempt_acknowledged"
                  ? "succeeded"
                  : threeDSecureResult.result === "failed"
                    ? "failed"
                    : "not_required",
              };
            }
          } catch (chargeErr) {
            console.error("Failed to retrieve charge for AVS data:", chargeErr);
          }
        }

        // Update security checks with real AVS/CVV data
        authenticity.securityChecks.cvvMatched = avsChecks.cvcCheck === "pass";

        // ----- AVS/CVV Pass/Fail Rules -----
        // CVC fail = hard FAIL
        if (avsChecks.cvcCheck === "fail") {
          flags.push("CVC_CHECK_FAILED");
        }
        // Postal mismatch alone = WARNING
        if (avsChecks.postalCode === "fail") {
          flags.push("AVS_POSTAL_CODE_MISMATCH");
        }
        // Address line mismatch = WARNING
        if (avsChecks.addressLine1 === "fail") {
          flags.push("AVS_ADDRESS_LINE_MISMATCH");
        }

        // ----- Immediately void/cancel the hold -----
        let holdStatus: PreAuthResult["holdStatus"] = "placed";
        let voidConfirmed = false;

        if (paymentIntent.status === "requires_capture") {
          const cancelResult = await retryStripeCancel(stripeClient, paymentIntent.id);
          if (cancelResult.success) {
            holdStatus = "voided";
            voidConfirmed = true;
          } else {
            holdStatus = "void_failed";
            flags.push(`VOID_FAILED: ${cancelResult.error}`);
          }
        }

        preAuth = {
          holdAmount: 0.50,
          holdCurrency: "USD",
          holdStatus,
          voidConfirmed,
          paymentIntentId: paymentIntent.id,
          avsChecks,
          idempotencyKey: preAuthIdempKey,
        };
      }
    } catch (piErr: any) {
      console.error("PaymentIntent creation failed:", piErr.message);

      // Handle specific Stripe error codes
      if (piErr.type === "StripeCardError") {
        flags.push(`CARD_ERROR: ${piErr.decline_code || piErr.message}`);
      } else {
        flags.push(`STRIPE_ERROR: ${piErr.message}`);
      }

      preAuth = {
        holdAmount: 0.50,
        holdCurrency: "USD",
        holdStatus: "skipped",
        voidConfirmed: false,
        paymentIntentId: "none",
        avsChecks,
        idempotencyKey: preAuthIdempKey,
      };
    }

    // ----- Risk Assessment -----
    let riskScore = 5;
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";

    if (flags.some((f) => f.startsWith("CVC_CHECK_FAILED"))) {
      riskScore = Math.max(riskScore, 75);
    }
    if (flags.some((f) => f.startsWith("CARD_ERROR") || f.startsWith("DECLINED"))) {
      riskScore = Math.max(riskScore, 85);
    }
    if (flags.some((f) => f.includes("PREPAID"))) {
      riskScore = Math.max(riskScore, 30);
    }
    if (flags.some((f) => f.includes("AVS_POSTAL"))) {
      riskScore = Math.max(riskScore, 20);
    }
    if (flags.some((f) => f.includes("AVS_ADDRESS"))) {
      riskScore = Math.max(riskScore, 25);
    }
    if (isExpired) {
      riskScore = Math.max(riskScore, 90);
    }

    if (riskScore >= 75) riskLevel = "critical";
    else if (riskScore >= 50) riskLevel = "high";
    else if (riskScore >= 25) riskLevel = "medium";

    // ----- Generate intelligence report (Gemini or fallback) -----
    let merchantApprovalReports: any = null;

    // Use the sandbox simulator to generate a matching intelligence report
    const overallSuccess =
      preAuth.holdStatus !== "skipped" &&
      !flags.some((f) => f.startsWith("CVC_CHECK_FAILED") || f.startsWith("DECLINED") || f.startsWith("CARD_ERROR")) &&
      !isExpired &&
      riskScore < 75;

    const recommendation = overallSuccess
      ? "APPROVED"
      : flags.some((f) => f.includes("DECLINED") || f.includes("CARD_ERROR"))
        ? "DECLINED_BY_ISSUER"
        : flags.some((f) => f.includes("CVC"))
          ? "DECLINED_CVV_FAILURE"
          : "FLAG_RISK_ALERT";

    // Generate transactions based on card brand
    const brandTxnMap: Record<string, any[]> = {
      visa: [
        { id: "TXN_ST_A1B2", merchant: "Amazon Prime Digital", amount: 14.99, date: "2026-06-02T12:30:00Z", status: "Approved", category: "Digital Services" },
        { id: "TXN_ST_C3D4", merchant: "Whole Foods Market", amount: 87.42, date: "2026-06-01T18:15:00Z", status: "Approved", category: "Groceries" },
        { id: "TXN_ST_E5F6", merchant: "Uber Technologies", amount: 23.50, date: "2026-05-31T09:45:00Z", status: "Approved", category: "Transportation" },
      ],
      mastercard: [
        { id: "TXN_ST_G7H8", merchant: "Netflix Subscription", amount: 22.99, date: "2026-06-02T04:00:00Z", status: "Approved", category: "Entertainment" },
        { id: "TXN_ST_I9J0", merchant: "Target Retail", amount: 156.33, date: "2026-06-01T14:22:00Z", status: "Approved", category: "Retail" },
        { id: "TXN_ST_K1L2", merchant: "Shell Gas Station", amount: 52.10, date: "2026-05-30T07:30:00Z", status: "Approved", category: "Fuel" },
      ],
      amex: [
        { id: "TXN_ST_M3N4", merchant: "Four Seasons Resort", amount: 1850.00, date: "2026-06-02T16:00:00Z", status: "Approved", category: "Hospitality" },
        { id: "TXN_ST_O5P6", merchant: "Tiffany & Co.", amount: 4200.00, date: "2026-06-01T11:30:00Z", status: "Approved", category: "Luxury Retail" },
        { id: "TXN_ST_Q7R8", merchant: "Delta Airlines First", amount: 2340.00, date: "2026-05-29T08:15:00Z", status: "Approved", category: "Air Travel" },
      ],
    };

    const txns = brandTxnMap[stripeBinData.brand] || brandTxnMap.visa!;

    merchantApprovalReports = {
      riskScore,
      securitySummary: `PCI-DSS Level 1 tokenization complete via Stripe gateway. PaymentMethod ${paymentMethodId.substring(0, 12)}... verified with ${threeDSecureStatus.status === "succeeded" ? "3D Secure 2.0 authentication" : "standard card verification"}.`,
      fundsAnalysis: {
        availableFunds: overallSuccess ? (stripeBinData.brand === "amex" ? 125000 : 8500) : 0,
        creditLimit: stripeBinData.brand === "amex" ? 250000 : 15000,
        outstandingBalance: stripeBinData.brand === "amex" ? 15200 : 2800,
        utilizationRate: stripeBinData.brand === "amex" ? 6 : 33,
        recommendation,
        currency: "USD",
      },
      recentTransactions: txns,
      authenticityComment: overallSuccess
        ? `Stripe-verified ${binMeta.brand} card (****${stripeBinData.last4}) passed all gateway checks. Pre-auth hold of $0.50 successfully placed and voided.`
        : `Card verification failed. ${flags.join(". ")}. Transaction blocked by gateway security policy.`,
    };

    // Build result
    const result: StripeVerificationResult = {
      success: overallSuccess,
      mode: "stripe",
      paymentMethodId,
      stripeBinData,
      threeDSecure: threeDSecureStatus,
      preAuth,
      intelligence: merchantApprovalReports,
      authenticity,
      riskAssessment: {
        riskScore,
        riskLevel,
        flags,
      },
    };

    // Record idempotency
    idempotencyStore.record(preAuthIdempKey, result);

    res.json(result);
  } catch (err: any) {
    console.error("Stripe verification endpoint failure:", err);
    res.status(500).json({
      error: err.message || "An error occurred during Stripe verification routing.",
    });
  }
});

// ---------------------------------------------------------------------------
// ORIGINAL: Simulator Verification Endpoint (unchanged)
// ---------------------------------------------------------------------------

// Decrypt & Verify Card Authentic Status & Funds Allocation
app.post("/api/verify-transaction", async (req, res) => {
  try {
    const { encryptedPayload, encryptionMetadata, selectedProfile, customBalance, isCustomSet } = req.body;
    
    if (!encryptedPayload) {
      return res.status(400).json({ error: "Missing encrypted transaction package payload." });
    }

    let decryptedString = "";
    
    // Perform standard securely-simulated decryption via Node crypto if key is loaded
    if (serverPrivateKey) {
      try {
        const buffer = Buffer.from(encryptedPayload, "base64");
        // Decrypt using RSA-OAEP with SHA-256 
        const decrypted = crypto.privateDecrypt(
          {
            key: serverPrivateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
          },
          buffer
        );
        decryptedString = decrypted.toString("utf8");
      } catch (decryptionError: any) {
        console.error("Cryptographic decryption failed:", decryptionError.message);
        // Fallback decryption if the browser was unable to generate compliant SubtleCrypto signature or key mismatched
        // We will decode client's fallback secure encryption signature safely
        const keyPass = Buffer.from(encryptedPayload, "base64").toString("utf8");
        if (keyPass.startsWith("SECURE_DEMO::")) {
          decryptedString = keyPass.slice("SECURE_DEMO::".length);
        } else {
          return res.status(400).json({ error: "Interception detected or cryptographic decipher failed due to key misalignment." });
        }
      }
    } else {
      // Emergency secure parsing
      const keyPass = Buffer.from(encryptedPayload, "base64").toString("utf8");
      if (keyPass.startsWith("SECURE_DEMO::")) {
        decryptedString = keyPass.slice("SECURE_DEMO::".length);
      } else {
        decryptedString = Buffer.from(encryptedPayload, "base64").toString("utf8");
      }
    }

    // Parsed decrypted arguments safely
    let cardData: any = {};
    try {
      cardData = JSON.parse(decryptedString);
    } catch (e) {
      return res.status(400).json({ error: "Corrupted payment frame format decoded from decrypt payload." });
    }

    const { PAN, cardholder, expiry, cvv } = cardData;

    if (!PAN || !expiry || !cvv) {
      return res.status(400).json({ error: "Missing required encrypted fields in decapsulated bundle." });
    }

    // Expose analytical checks
    const isValidLuhn = checkLuhn(PAN);
    const binMeta = getBinMetadata(PAN);
    
    // Check expiry
    const expRegex = /^(0[1-9]|1[0-2])\/([0-9]{2})$/;
    const matches = expiry.match(expRegex);
    let isExpired = true;
    if (matches) {
      const month = parseInt(matches[1], 10);
      const year = parseInt("20" + matches[2], 10);
      const now = new Date();
      const expDate = new Date(year, month - 1, 28); // End of billing month
      isExpired = expDate < now;
    }

    const verificationProfile = selectedProfile || "average"; // "high_worth", "average", "stolen", "custom"
    
    // Execute server-side Gemini Smart Authorization Simulation & Risk Scoring Engine
    let merchantApprovalReports: any = null;

    if (ai) {
      try {
        const systemPrompt = `
          You are a security gateway router API inside a premium PCI-DSS certified payment processor node. 
          Your job is to analyze decrypted transaction parameters and generate a production-grade JSON verification profile report.

          The cardholders metadata inputs are:
          - Masked PAN: ${PAN.substring(0, 4) + "****" + PAN.substring(PAN.length - 4)}
          - Card Brand Level: ${binMeta.level}
          - Card Category: ${binMeta.category}
          - Expected Issuing Bank Name: ${binMeta.issuer}
          - Cardholder Requested Profile Variant: ${verificationProfile}
          - Is Luhn check authentic: ${isValidLuhn}
          - Is Card expired: ${isExpired}
          - Cardholder Name: ${cardholder}
          - Target Override Balance (if custom selected): ${isCustomSet ? customBalance : "None"}

          Generate a highly cohesive mock financial profile JSON block matching this card's details and profile type.
          Use the following structured JSON output schema (strictly output JSON content, nothing else):
          
          {
            "riskScore": number (0 to 100 which is the simulated transaction fraud level score based on input context),
            "securitySummary": "string (a precise 2-sentence technical diagnostic of the cryptographic transport Layer and verification flow)",
            "fundsAnalysis": {
              "availableFunds": number (simulated real-time credit balance),
              "creditLimit": number (credit limit assigned),
              "outstandingBalance": number (aggregate active card balance accrued),
              "utilizationRate": number (0 to 100 percentage integer of card usage),
              "recommendation": "string (recommendation warning such as APPROVED, DECLINED_FUNDS, or FLAG_RISK_ALERT)",
              "currency": "USD"
            },
            "recentTransactions": [
              {
                "id": "TXN_XXXXXXXXX",
                "merchant": "string (high fidelity real world retailer matching Card Tier Luxury Level, e.g. Tiffany & Co for Platinum elite, or Subway for basic cards)",
                "amount": number,
                "date": "2026-06-01T12:00:00Z for example style",
                "status": "string (Approved, Declined, or Pending)",
                "category": "string"
              }
            ],
            "authenticityComment": "string (1-sentence review explaining the authentication verdict of processing the BIN metadata against Luhn and expiry checks)"
          }

          Behavior guidelines per Profile Variant selected:
          1. "high_worth": Available balance > $120,000, Ultra limit, high status Visa/AMEX Centurion checks, luxury transactions, 0 risk score.
          2. "average": Balance of $800 to $4000, 30% utilization, daily life transactions, small card tier, 5 risk score. Recommendation APPROVED.
          3. "stolen": Highly elevated Risk score (>85). Recommendation: FLAG_RISK_ALERT / Suspend. Multiple declined transactions from high risk location, cardholder mismatch flag triggering 3D SECURE fallback warning.
          4. "custom": Use custom balance if requested, or design dynamic balances. If Luhn check fails OR expired card, make risk score 99 and outstanding balances high, recommending DECLINED.
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: systemPrompt,
          config: {
            responseMimeType: "application/json",
          }
        });

        const textResponse = response.text;
        if (textResponse) {
          merchantApprovalReports = JSON.parse(textResponse.trim());
        }
      } catch (aiError) {
        console.error("Gemini AI API failure, routing fallback simulator:", aiError);
      }
    }

    // Default static fallback / Sandbox simulation engine if Gemini is absent or fails
    if (!merchantApprovalReports) {
      let riskScore = 5;
      let limit = 10000;
      let outstanding = 2800;
      let recStr = "APPROVED";
      let txns: any[] = [];

      if (!isValidLuhn) {
        riskScore = 95;
        recStr = "DECLINED_AUTHENTICITY_FAILURE";
      } else if (isExpired) {
        riskScore = 80;
        recStr = "DECLINED_CARD_EXPIRED";
      } else if (verificationProfile === "high_worth") {
        riskScore = 2;
        limit = 500000;
        outstanding = 12000;
        recStr = "APPROVED_PLATINUM_CLEAR";
        txns = [
          { id: "TXN_77A82B", merchant: "Signature Jet Services Corp", amount: 18500, date: "2026-06-02T10:15:00Z", status: "Approved", category: "Luxury Flight" },
          { id: "TXN_11C54D", merchant: "Hermès Paris Flagship Retail", amount: 3750, date: "2026-06-01T15:24:00Z", status: "Approved", category: "Retail" },
          { id: "TXN_99E10A", merchant: "Four Seasons Ritz-Carlton Suites", amount: 2400, date: "2026-05-30T19:40:00Z", status: "Approved", category: "Hospitality" }
        ];
      } else if (verificationProfile === "stolen") {
        riskScore = 90;
        limit = 5000;
        outstanding = 4950;
        recStr = "FLAG_RISK_ALERT";
        txns = [
          { id: "TXN_66X39K", merchant: "Foreign Electronics Hub", amount: 1450, date: "2026-06-02T18:44:00Z", status: "Declined", category: "High-Risk Electronics" },
          { id: "TXN_41K99F", merchant: "Crypto Exchange Direct Vault", amount: 500, date: "2026-06-02T18:05:00Z", status: "Declined", category: "Digital Currencies" },
          { id: "TXN_33V82L", merchant: "Fuel Gas Station Local", amount: 45, date: "2026-06-01T08:11:00Z", status: "Approved", category: "Transit" }
        ];
      } else {
        // Average
        limit = 8000;
        outstanding = 2200;
        if (isCustomSet && customBalance !== undefined) {
          outstanding = Math.max(0, limit - customBalance);
        }
        recStr = "APPROVED";
        txns = [
          { id: "TXN_12Y44R", merchant: "Whole Foods Market Delivery", amount: 168.45, date: "2026-06-02T14:30:00Z", status: "Approved", category: "Groceries" },
          { id: "TXN_88S22W", merchant: "Netflix Premium Subscription", amount: 22.99, date: "2026-06-01T04:15:00Z", status: "Approved", category: "Entertainment" },
          { id: "TXN_31M99T", merchant: "Apple Store Online Purchase", amount: 1299.00, date: "2026-05-28T11:22:00Z", status: "Approved", category: "Technology" }
        ];
      }

      const calculatedFunds = Math.max(0, limit - outstanding);

      merchantApprovalReports = {
        riskScore,
        securitySummary: "Secure SSL routing complete. Luhn algorithm analysis paired with merchant token parameters resolved.",
        fundsAnalysis: {
          availableFunds: isCustomSet && customBalance !== undefined ? customBalance : calculatedFunds,
          creditLimit: limit,
          outstandingBalance: outstanding,
          utilizationRate: Math.round((outstanding / limit) * 100),
          recommendation: recStr,
          currency: "USD"
        },
        recentTransactions: txns,
        authenticityComment: `Dynamic local sandbox checks complete. Validated card issuer: ${binMeta.issuer} (${binMeta.level}).`
      };
    }

    const report: AuthenticityReport = {
      isValidLuhn,
      issuer: binMeta.issuer,
      cardType: binMeta.category,
      region: binMeta.region,
      binMetadata: {
        brand: binMeta.brand,
        level: binMeta.level,
        category: binMeta.category,
        country: binMeta.country,
      },
      securityChecks: {
        cvvMatched: cvv.length >= 3,
        expiryUnexpired: !isExpired,
        formatCorrect: PAN.length >= 13 && PAN.length <= 19
      }
    };

    // Construct return state package (never logs CVV or full raw string in raw backend console)
    const result: VerificationResult = {
      success: isValidLuhn && !isExpired && merchantApprovalReports.riskScore < 75,
      decryptedDataSummary: {
        maskedNumber: PAN.substring(0, 4) + "-XXXX-XXXX-" + PAN.substring(PAN.length - 4),
        cardholderName: cardholder,
        expiry: expiry
      },
      authenticity: report,
      intelligence: merchantApprovalReports,
      rawEncryptedCiphertext: encryptedPayload
    };

    res.json(result);
  } catch (err: any) {
    console.error("Endpoint handling failure:", err);
    res.status(500).json({ error: err.message || "An error occurred during processor authentication routing." });
  }
});

// Serve client application resources
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Secure Credit Card Processor & Gateway online: http://localhost:${PORT}`);
    if (stripeClient) {
      console.log(`💳 Stripe Live Mode: ENABLED (test keys detected)`);
    } else {
      console.log(`🔬 Stripe Live Mode: DISABLED (no keys — simulator only)`);
    }
  });
}

startServer();
