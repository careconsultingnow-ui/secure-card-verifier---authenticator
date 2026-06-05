export interface EncryptedCardPayload {
  encryptedData: string; // Base64 simulated encrypted payload
  encryptionMetadata: {
    algorithm: string;
    keyId: string;
    timestamp: string;
  };
}

export interface CreditCardData {
  number: string;
  name: string;
  expiry: string;
  cvv: string;
  isCustomBalanceRequested?: boolean;
  simulatedStartingBalance?: number;
}

export interface MerchantTransaction {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  status: 'Approved' | 'Declined' | 'Pending';
  category: string;
}

export interface FundsAnalysis {
  availableFunds: number;
  creditLimit: number;
  outstandingBalance: number;
  utilizationRate: number;
  recommendation: string;
  currency: string;
}

export interface AuthenticityReport {
  isValidLuhn: boolean;
  issuer: string;
  cardType: string;
  region: string;
  binMetadata: {
    brand: string;
    level: string;
    category: string;
    country: string;
  };
  securityChecks: {
    cvvMatched: boolean;
    expiryUnexpired: boolean;
    formatCorrect: boolean;
  };
}

export interface GeminiResponse {
  riskScore: number; // 0 to 100
  securitySummary: string;
  fundsAnalysis: FundsAnalysis;
  recentTransactions: MerchantTransaction[];
  authenticityComment: string;
}

export interface VerificationResult {
  success: boolean;
  decryptedDataSummary: {
    maskedNumber: string;
    cardholderName: string;
    expiry: string;
  };
  authenticity: AuthenticityReport;
  intelligence: GeminiResponse;
  rawEncryptedCiphertext: string;
}

// ---------------------------------------------------------------------------
// Stripe PCI-DSS Integration Types
// ---------------------------------------------------------------------------

export type ThreeDSecureStatus = 'not_required' | 'succeeded' | 'failed' | 'processing' | 'challenge_required';

export interface AVSChecks {
  addressLine1: string; // 'pass' | 'fail' | 'unavailable' | 'unchecked'
  postalCode: string;   // 'pass' | 'fail' | 'unavailable' | 'unchecked'
  cvcCheck: string;     // 'pass' | 'fail' | 'unavailable' | 'unchecked'
}

export interface PreAuthResult {
  holdAmount: number;
  holdCurrency: string;
  holdStatus: 'placed' | 'voided' | 'void_failed' | 'skipped';
  voidConfirmed: boolean;
  paymentIntentId: string;
  avsChecks: AVSChecks;
  idempotencyKey: string;
}

export interface StripeBinData {
  brand: string;       // 'visa', 'mastercard', 'amex', etc.
  last4: string;
  expMonth: number;
  expYear: number;
  funding: string;     // 'credit', 'debit', 'prepaid', 'unknown'
  country: string;     // ISO 2-letter country code
  issuer?: string;
}

export interface StripeVerificationResult {
  success: boolean;
  mode: 'stripe';
  paymentMethodId: string;
  stripeBinData: StripeBinData;
  threeDSecure: {
    status: ThreeDSecureStatus;
    clientSecret?: string; // Only present when status is 'challenge_required'
  };
  preAuth: PreAuthResult;
  intelligence: GeminiResponse;     // Re-use existing Gemini/sandbox intelligence
  authenticity: AuthenticityReport; // Re-use existing authenticity report
  riskAssessment: {
    riskScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    flags: string[];
  };
}

// ---------------------------------------------------------------------------
// Payment Processing Types
// ---------------------------------------------------------------------------

export interface PaymentResult {
  chargeId: string;            // Stripe PaymentIntent ID
  amount: number;              // Amount in dollars (e.g. 5.00)
  currency: string;            // 'usd'
  status: 'succeeded' | 'declined' | 'requires_action' | 'refunded' | 'partially_refunded';
  receiptUrl: string | null;   // Stripe receipt URL
  description: string;
  cardBrand: string;
  last4: string;
  createdAt: string;           // ISO timestamp
}

export interface TransactionRecord extends PaymentResult {
  cardholderName: string;
  billingZip: string;
  receiptEmail?: string;
  refundedAt?: string;
  refundId?: string;
  refundAmount?: number;
  riskScore: number;
  verificationPassed: boolean;
}

export interface StripeChargeResult extends StripeVerificationResult {
  payment: PaymentResult;
}
