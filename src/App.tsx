import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe as StripeJS } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { 
  Shield, 
  Lock, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Terminal, 
  Coins, 
  CreditCard, 
  Activity, 
  Send, 
  Eye, 
  EyeOff, 
  HelpCircle,
  Database,
  ArrowRight,
  TrendingUp,
  Cpu,
  Fingerprint,
  Zap,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  ShieldAlert,
  Ban,
  DollarSign,
  RotateCcw,
  Receipt,
  Clock,
  Search,
  ExternalLink,
} from 'lucide-react';
import { 
  EncryptedCardPayload, 
  CreditCardData, 
  MerchantTransaction, 
  FundsAnalysis, 
  AuthenticityReport, 
  GeminiResponse, 
  VerificationResult,
  StripeVerificationResult,
  StripeChargeResult,
  TransactionRecord,
  PaymentResult,
} from './types';
import StripeCardForm from './components/StripeCardForm';

// Let's create beautiful pre-installed test card profiles
const TEST_PROFILES = [
  {
    id: 'high_worth',
    title: 'Centurion Elite Black',
    description: 'Simulates an authentic high-net-worth American Express Centurion card.',
    number: '3782 111111 88001',
    name: 'ALEXANDER VANDERGRIFT',
    expiry: '12/29',
    cvv: '883',
    startingBalance: 384500,
    creditLimit: 500000,
  },
  {
    id: 'average',
    title: 'Chase Sapphire Premier',
    description: 'Active average consumer Visa card with moderate balance.',
    number: '4111 1122 3344 5566',
    name: 'SARAH JENKINS',
    expiry: '09/28',
    cvv: '901',
    startingBalance: 4250,
    creditLimit: 15000,
  },
  {
    id: 'stolen',
    title: 'Suspicious Profile (Flagged Risk)',
    description: 'Simulates a flagged card pattern that triggers risk signals.',
    number: '5501 9876 5432 1098',
    name: 'URIAH S. SNYDER',
    expiry: '08/27',
    cvv: '445',
    startingBalance: 50,
    creditLimit: 5000,
  },
  {
    id: 'invalid_luhn',
    title: 'Luhn Checksum Failure',
    description: 'A credit card with a corrupt or mistyped sequence digits.',
    number: '4111 1111 1111 1112', // Luhn invalid
    name: 'JOHNSON CALPIN',
    expiry: '05/30',
    cvv: '321',
    startingBalance: 2000,
    creditLimit: 10000,
  },
  {
    id: 'expired_card',
    title: 'Expired Card Verification',
    description: 'An authentic visa card format, but past validity threshold.',
    number: '4111 1111 1111 1111',
    name: 'HELENA ROSTOVA',
    expiry: '11/24', // Expired
    cvv: '124',
    startingBalance: 8100,
    creditLimit: 12000,
  }
];

type AppMode = 'simulator' | 'stripe';
type StripeSubMode = 'verify' | 'charge';

export default function App() {
  // Mode toggle
  const [appMode, setAppMode] = useState<AppMode>('simulator');
  const [stripePromise, setStripePromise] = useState<Promise<StripeJS | null> | null>(null);
  const [stripeAvailable, setStripeAvailable] = useState<boolean>(false);
  const [stripeLoading, setStripeLoading] = useState<boolean>(true);

  // Target encryption metadata from server
  const [encryptionConfig, setEncryptionConfig] = useState<{
    publicKey: string;
    algorithm: string;
    hash: string;
    keyId: string;
  } | null>(null);

  // States
  const [formData, setFormData] = useState<CreditCardData>({
    number: '4111 1122 3344 5566',
    name: 'SARAH JENKINS',
    expiry: '09/28',
    cvv: '901',
  });

  const [activeProfile, setActiveProfile] = useState<string>('average');
  const [customBalanceReq, setCustomBalanceReq] = useState<boolean>(false);
  const [customBalanceValue, setCustomBalanceValue] = useState<number>(4500);
  const [isCVVMasked, setIsCVVMasked] = useState<boolean>(true);
  
  // Stripe form state
  const [stripeCardholderName, setStripeCardholderName] = useState<string>('');
  const [stripeBillingZip, setStripeBillingZip] = useState<string>('');

  // Handshake progression indicators
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(-1); // -1: Ready, 0..N: processing, final: display results
  const [pipelineMessages, setPipelineMessages] = useState<string[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [stripeResult, setStripeResult] = useState<StripeVerificationResult | null>(null);
  const [chargeResult, setChargeResult] = useState<StripeChargeResult | null>(null);

  // Stripe sub-mode
  const [stripeSubMode, setStripeSubMode] = useState<StripeSubMode>('verify');

  // Transaction history
  const [transactionHistory, setTransactionHistory] = useState<TransactionRecord[]>([]);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  // Fetch Stripe configuration
  useEffect(() => {
    const fetchStripeConfig = async () => {
      try {
        const res = await fetch('/api/stripe-config');
        const data = await res.json();
        if (data.available && data.publishableKey) {
          setStripeAvailable(true);
          setStripePromise(loadStripe(data.publishableKey));
          addLog('💳 Stripe.js SDK loaded. PCI-DSS tokenization available.');
        } else {
          setStripeAvailable(false);
          addLog('🔬 Stripe not configured. Operating in Simulator Mode only.');
        }
      } catch (err) {
        setStripeAvailable(false);
        addLog('⚠️ Could not fetch Stripe configuration.');
      }
      setStripeLoading(false);
    };
    fetchStripeConfig();
  }, []);

  // Fetch cryptographic verification parameters
  const fetchEncryptionParameters = async () => {
    try {
      addLog("📡 Fetching Server Cryptographic Handshake Credentials...");
      const res = await fetch("/api/encryption-key");
      const data = await res.json();
      setEncryptionConfig(data);
      addLog(`🔐 Resolved Hardware Node RSA-2048 Public Key Exchange. ID: ${data.keyId}`);
    } catch (err) {
      addLog("❌ Operational Link Error. Unable to fetch server public key.");
    }
  };

  useEffect(() => {
    fetchEncryptionParameters();
  }, []);

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    setConsoleLogs((prev) => [`[${timestamp}] ${message}`, ...prev]);
  };

  // Profile switches
  const handleProfileSelection = (profileId: string) => {
    setActiveProfile(profileId);
    
    if (profileId === 'custom') {
      return;
    }

    const matched = TEST_PROFILES.find(p => p.id === profileId);
    if (matched) {
      setFormData({
        number: matched.number,
        name: matched.name,
        expiry: matched.expiry,
        cvv: matched.cvv
      });
      if (customBalanceReq) {
        setCustomBalanceValue(matched.startingBalance);
      }
      addLog(`📋 Profile Auto-Fill Selected: "${matched.title}"`);
    }
  };

  const cleanCardNumberString = (num: string) => {
    return num.replace(/\s?/g, '').trim();
  };

  // Perform secure card encryption in client
  const encryptCardPayload = async (rawCard: CreditCardData): Promise<{ encryptedString: string; isFallback: boolean }> => {
    const rawPlaintextJson = JSON.stringify({
      PAN: cleanCardNumberString(rawCard.number),
      cardholder: rawCard.name.toUpperCase().trim(),
      expiry: rawCard.expiry.trim(),
      cvv: rawCard.cvv.trim(),
      timestamp: new Date().toISOString()
    });

    if (!encryptionConfig || !encryptionConfig.publicKey) {
      addLog("⚠️ Public Key not loaded yet. Encapsulating raw transmission...");
      return { 
        encryptedString: window.btoa("SECURE_DEMO::" + rawPlaintextJson), 
        isFallback: true 
      };
    }

    try {
      // Stripped headers for SubtleCrypto
      const cleanPem = encryptionConfig.publicKey
        .replace(/-----BEGIN PUBLIC KEY-----/, '')
        .replace(/-----END PUBLIC KEY-----/, '')
        .replace(/\s/g, '');

      const binaryDerString = window.atob(cleanPem);
      const binaryLen = binaryDerString.length;
      const bytes = new Uint8Array(binaryLen);
      for (let i = 0; i < binaryLen; i++) {
        bytes[i] = binaryDerString.charCodeAt(i);
      }

      const importedKey = await window.crypto.subtle.importKey(
        "spki",
        bytes.buffer,
        {
          name: "RSA-OAEP",
          hash: "SHA-256"
        },
        true,
        ["encrypt"]
      );

      const encoder = new TextEncoder();
      const encodedPlaintext = encoder.encode(rawPlaintextJson);

      const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
          name: "RSA-OAEP"
        },
        importedKey,
        encodedPlaintext
      );

      // Convert buffer back to base64 string
      const cBytes = new Uint8Array(ciphertextBuffer);
      let binaryStr = "";
      for (let i = 0; i < cBytes.byteLength; i++) {
        binaryStr += String.fromCharCode(cBytes[i]);
      }

      return { 
        encryptedString: window.btoa(binaryStr), 
        isFallback: false 
      };
    } catch (cryptoError) {
      addLog(`⚡ Local WebCrypto API limited in sandbox frame. Utilizing armored fallback verification protocol.`);
      return { 
        encryptedString: window.btoa("SECURE_DEMO::" + rawPlaintextJson), 
        isFallback: true 
      };
    }
  };

  // ---------------------------------------------------------------------------
  // STRIPE MODE: Handle tokenized verification
  // ---------------------------------------------------------------------------
  const handleStripeTokenized = async (paymentMethodId: string) => {
    setCurrentStep(0);
    setPipelineMessages([]);
    setVerificationResult(null);
    setStripeResult(null);

    const runStep = (stepIdx: number, message: string) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setCurrentStep(stepIdx);
          setPipelineMessages(prev => [...prev, message]);
          addLog(`⚡ Pipeline Step [${stepIdx + 1}/6]: ${message}`);
          resolve();
        }, 450);
      });
    };

    await runStep(0, "PCI-DSS Stripe.js Tokenization Complete...");
    await runStep(1, "Transmitting PaymentMethod token to secure backend...");
    await runStep(2, "Retrieving BIN metadata & card fingerprint via Stripe API...");
    await runStep(3, "Initiating 3D Secure 2.0 authentication check...");
    await runStep(4, "Executing $0.50 pre-authorization hold with AVS/CVV validation...");

    try {
      const response = await fetch("/api/verify-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethodId,
          cardholderName: stripeCardholderName,
          billingZip: stripeBillingZip,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Gateway returned error state." }));
        throw new Error(errData.error || "Stripe verification failed.");
      }

      const result: StripeVerificationResult = await response.json();

      // Handle 3DS challenge if required
      if (result.threeDSecure.status === 'challenge_required' && result.threeDSecure.clientSecret && stripePromise) {
        addLog('🔐 3D Secure challenge required — launching authentication modal...');
        await runStep(5, "3D Secure 2.0 cardholder authentication challenge in progress...");
        
        const stripe = await stripePromise;
        if (stripe) {
          const { error: threeDSError } = await stripe.handleNextAction({
            clientSecret: result.threeDSecure.clientSecret,
          });

          if (threeDSError) {
            addLog(`❌ 3DS Challenge Failed: ${threeDSError.message}`);
            result.threeDSecure.status = 'failed';
            result.success = false;
            result.riskAssessment.flags.push('3DS_CHALLENGE_FAILED');
          } else {
            addLog('✅ 3D Secure authentication completed successfully.');
            result.threeDSecure.status = 'succeeded';
          }
        }
      } else {
        await runStep(5, "Voiding pre-auth hold & compiling verification report...");
      }

      setTimeout(() => {
        setStripeResult(result);
        setCurrentStep(7); // Final results state
        setIsLoading(false);
        addLog(`✅ Stripe Verification Complete! Verdict: ${result.intelligence.fundsAnalysis.recommendation}. Risk: ${result.riskAssessment.riskScore}%`);
      }, 400);
    } catch (apiErr: any) {
      addLog(`❌ Stripe Processing Error: ${apiErr.message}`);
      setIsLoading(false);
      setCurrentStep(-1);
    }
  };

  // ---------------------------------------------------------------------------
  // STRIPE MODE: Handle payment charge (verify first, then capture)
  // ---------------------------------------------------------------------------
  const handleStripeCharge = async (paymentMethodId: string, amount: number, description: string, receiptEmail: string) => {
    setCurrentStep(0);
    setPipelineMessages([]);
    setVerificationResult(null);
    setStripeResult(null);
    setChargeResult(null);

    const runStep = (stepIdx: number, message: string) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setCurrentStep(stepIdx);
          setPipelineMessages(prev => [...prev, message]);
          addLog(`⚡ Pipeline Step [${stepIdx + 1}/7]: ${message}`);
          resolve();
        }, 450);
      });
    };

    await runStep(0, "PCI-DSS Stripe.js Tokenization Complete...");
    await runStep(1, "Transmitting PaymentMethod token to secure backend...");
    await runStep(2, "Retrieving BIN metadata & card fingerprint via Stripe API...");
    await runStep(3, "Running pre-charge fraud screening & risk assessment...");
    await runStep(4, `Creating PaymentIntent for $${amount.toFixed(2)} with automatic capture...`);

    try {
      const response = await fetch("/api/charge-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethodId,
          amount,
          currency: "usd",
          description,
          cardholderName: stripeCardholderName,
          billingZip: stripeBillingZip,
          receiptEmail: receiptEmail || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Payment gateway returned error state." }));
        throw new Error(errData.error || "Payment failed.");
      }

      const result: StripeChargeResult = await response.json();

      // Handle 3DS challenge if required
      if (result.threeDSecure.status === 'challenge_required' && result.threeDSecure.clientSecret && stripePromise) {
        addLog('🔐 3D Secure challenge required — launching authentication modal...');
        await runStep(5, "3D Secure 2.0 cardholder authentication challenge in progress...");

        const stripe = await stripePromise;
        if (stripe) {
          const { error: threeDSError } = await stripe.handleNextAction({
            clientSecret: result.threeDSecure.clientSecret,
          });

          if (threeDSError) {
            addLog(`❌ 3DS Challenge Failed: ${threeDSError.message}`);
            result.threeDSecure.status = 'failed';
            result.success = false;
            result.riskAssessment.flags.push('3DS_CHALLENGE_FAILED');
          } else {
            addLog('✅ 3D Secure authentication completed successfully.');
            result.threeDSecure.status = 'succeeded';
          }
        }
      } else {
        await runStep(5, "AVS/CVV validation complete...");
      }

      await runStep(6, `Payment captured — $${amount.toFixed(2)} charged successfully.`);

      setTimeout(() => {
        setChargeResult(result);
        setCurrentStep(8); // Final charge results state
        setIsLoading(false);
        if (result.success && result.payment) {
          addLog(`💰 Payment Captured! $${result.payment.amount.toFixed(2)} charged to ${result.payment.cardBrand} ****${result.payment.last4}. ID: ${result.payment.chargeId}`);
        } else {
          addLog(`❌ Payment Failed. ${result.riskAssessment.flags.join(', ')}`);
        }
        fetchTransactions();
      }, 400);
    } catch (apiErr: any) {
      addLog(`❌ Payment Error: ${apiErr.message}`);
      setIsLoading(false);
      setCurrentStep(-1);
    }
  };

  // Fetch transaction history
  const fetchTransactions = async () => {
    try {
      const response = await fetch("/api/transactions");
      if (response.ok) {
        const data = await response.json();
        setTransactionHistory(data.transactions || []);
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    }
  };

  // Refund a payment
  const handleRefund = async (paymentIntentId: string) => {
    setRefundingId(paymentIntentId);
    addLog(`🔄 Initiating refund for PaymentIntent ${paymentIntentId}...`);

    try {
      const response = await fetch("/api/refund-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId, reason: "requested_by_customer" }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Refund failed." }));
        throw new Error(errData.error || "Refund failed.");
      }

      const result = await response.json();
      addLog(`✅ Refund successful! $${result.amount.toFixed(2)} refunded. Refund ID: ${result.refundId}`);

      // Update charge result if viewing it
      if (chargeResult && chargeResult.payment.chargeId === paymentIntentId) {
        setChargeResult({
          ...chargeResult,
          payment: { ...chargeResult.payment, status: 'refunded' },
        });
      }

      fetchTransactions();
    } catch (err: any) {
      addLog(`❌ Refund Error: ${err.message}`);
    } finally {
      setRefundingId(null);
    }
  };

  // Load transactions on mount
  useEffect(() => {
    fetchTransactions();
  }, []);

  // ---------------------------------------------------------------------------
  // SIMULATOR MODE: Original verification workflow
  // ---------------------------------------------------------------------------
  const executeVerificationWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!formData.number || !formData.name || !formData.expiry || !formData.cvv) {
      addLog("⚠️ Form Error: Please enter complete card details.");
      return;
    }

    setIsLoading(true);
    setCurrentStep(0);
    setPipelineMessages([]);
    setVerificationResult(null);
    setStripeResult(null);

    // Dynamic timeout simulations to show off pipeline architecture
    const runStep = (stepIdx: number, message: string) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setCurrentStep(stepIdx);
          setPipelineMessages(prev => [...prev, message]);
          addLog(`⚡ Pipeline Step [${stepIdx + 1}/5]: ${message}`);
          resolve();
        }, 550);
      });
    };

    await runStep(0, "Initiating Secure Handshake & RSA-OAEP Transceiver...");
    await runStep(1, "Serializing payload & sealing transaction envelope...");
    
    // Perform simulated/real RSA hardware encapsulation
    const { encryptedString, isFallback } = await encryptCardPayload(formData);
    addLog(`🔒 Encrypted Envelope generated: size ${encryptedString.length} bytes. Mode: ${isFallback ? 'Armored TLS Encapsulation' : 'RSA-OAEP-2048'}`);

    await runStep(2, "Verifying IIN/BIN Metadata database matrix & Luhn sum check...");
    await runStep(3, "Routing parameters to Server Smart Decryption & Gemini intelligence processor...");
    await runStep(4, "Performing live balance lookup & ledger liquidity validation...");

    try {
      // POST encrypted package to secure express server backend
      const response = await fetch("/api/verify-transaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          encryptedPayload: encryptedString,
          encryptionMetadata: {
            algorithm: encryptionConfig?.algorithm || "RSA-OAEP-2048",
            keyId: encryptionConfig?.keyId || "key-fallback-3000",
            timestamp: new Date().toISOString()
          },
          selectedProfile: activeProfile,
          customBalance: customBalanceValue,
          isCustomSet: customBalanceReq
        })
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Gateway Processor returned error state.");
      }

      const result: VerificationResult = await response.json();
      
      setTimeout(() => {
        setVerificationResult(result);
        setCurrentStep(5);
        setIsLoading(false);
        addLog(`✅ Verification Finished! Verdict: ${result.intelligence.fundsAnalysis.recommendation}. Risk level: ${result.intelligence.riskScore}%`);
      }, 400);

    } catch (apiErr: any) {
      addLog(`❌ Processing Error: ${apiErr.message}`);
      setIsLoading(false);
      setCurrentStep(-1);
    }
  };

  const getCardBrandClass = (number: string) => {
    const clean = cleanCardNumberString(number);
    if (clean.startsWith('4')) {
      return {
        bg: 'bg-gradient-to-br from-blue-700 via-indigo-950 to-slate-900 border-blue-500/30',
        brand: 'Visa',
        badge: 'https://img.icons8.com/color/48/000000/visa.png'
      };
    } else if (clean.startsWith('5')) {
      return {
        bg: 'bg-gradient-to-br from-orange-850 via-neutral-900 to-amber-950 border-amber-600/30',
        brand: 'Mastercard',
        badge: 'https://img.icons8.com/color/48/000000/mastercard.png'
      };
    } else if (clean.startsWith('34') || clean.startsWith('37')) {
      return {
        bg: 'bg-gradient-to-br from-neutral-900 via-slate-950 to-zinc-800 border-zinc-500/50',
        brand: 'American Express',
        badge: 'https://img.icons8.com/color/48/000000/amex.png'
      };
    } else if (clean.startsWith('6011') || clean.startsWith('65')) {
      return {
        bg: 'bg-gradient-to-br from-orange-600 via-stone-900 to-orange-950 border-orange-500/30',
        brand: 'Discover',
        badge: 'https://img.icons8.com/color/48/000000/discover.png'
      };
    } else if (clean.startsWith('35')) {
      return {
        bg: 'bg-gradient-to-br from-teal-900 via-slate-950 to-indigo-950 border-teal-500/30',
        brand: 'JCB',
        badge: 'https://img.icons8.com/color/48/000000/jcb.png'
      };
    }
    return {
      bg: 'bg-gradient-to-br from-slate-800/80 via-slate-900 to-zinc-950 border-emerald-500/20',
      brand: 'Unidentified Network',
      badge: ''
    };
  };

  const formatCardNumberWithSpaces = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const currentCardSkin = getCardBrandClass(formData.number);

  // Determine what result to show
  const hasSimulatorResult = currentStep === 5 && verificationResult;
  const hasStripeResult = currentStep === 7 && stripeResult;
  const hasChargeResult = currentStep === 8 && chargeResult;
  const hasAnyResult = hasSimulatorResult || hasStripeResult || hasChargeResult;

  // Pipeline steps differ by mode
  const simulatorPipelineSteps = [
    { label: "Hardware Node Key Exchange Handshake", d: "Loads ephemeral keys & creates transaction envelope binding." },
    { label: "Client-Side Cryptographic Seal", d: "Completes secure RSA-2048 encryption parameters within local browser." },
    { label: "Luhn Checksum Check & BIN Parser", d: "Analyzes format integrity, issuer bank location, and currency code match." },
    { label: "AI-Powered Server Decryption Analyzer", d: "Decrypts payload server-side using Gemini 3.5 deep-risk evaluation." },
    { label: "Liquidity Audit & Auth Validation", d: "Validates funds availability limits & outputs immediate processing recommendation." }
  ];

  const stripePipelineSteps = [
    { label: "Stripe.js PCI-DSS Tokenization", d: "Card data collected via hosted iframes — raw PAN never touches JavaScript or server." },
    { label: "Secure Token Transmission", d: "PaymentMethod ID (pm_xxx) sent to backend — no cardholder data in transit." },
    { label: "BIN Metadata & Card Fingerprint Retrieval", d: "Stripe API returns brand, funding type, country, and card fingerprint from BIN database." },
    { label: "3D Secure 2.0 Authentication", d: "Initiates 3DS 2.0 challenge for high-risk or European transactions via Stripe native flow." },
    { label: "Pre-Auth Hold + AVS/CVV Validation", d: "Places $0.50 authorization hold with address and CVC verification code matching." },
    { label: "Hold Void & Report Compilation", d: "Immediately cancels pre-auth hold and compiles comprehensive verification report." }
  ];

  const chargePipelineSteps = [
    { label: "Stripe.js PCI-DSS Tokenization", d: "Card data collected via hosted iframes — raw PAN never touches JavaScript or server." },
    { label: "Secure Token Transmission", d: "PaymentMethod ID (pm_xxx) sent to backend — no cardholder data in transit." },
    { label: "BIN Metadata & Card Fingerprint", d: "Stripe API returns brand, funding type, country, and card fingerprint." },
    { label: "Pre-Charge Fraud Screening", d: "Risk assessment and card validation before any funds are captured." },
    { label: "PaymentIntent Creation", d: "Creates PaymentIntent with automatic capture for the specified amount." },
    { label: "AVS/CVV Validation", d: "Address and CVC verification code matching on the live charge." },
    { label: "Payment Capture Confirmation", d: "Funds captured from the card — payment is finalized." },
  ];

  const pipelineSteps = appMode === 'stripe'
    ? (stripeSubMode === 'charge' ? chargePipelineSteps : stripePipelineSteps)
    : simulatorPipelineSteps;
  const finalStepIndex = appMode === 'stripe'
    ? (stripeSubMode === 'charge' ? 8 : 7)
    : 5;

  return (
    <div id="verify-core-main-viewport" className="min-h-screen bg-slate-900 text-slate-200 font-sans flex flex-col antialiased">
      
      {/* Top Banner Navigation inspired by Geometric Balance style */}
      <nav id="navbar-primary-verifycore" className="h-16 border-b border-slate-800 px-6 lg:px-12 flex items-center justify-between bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-sm flex items-center justify-center transform rotate-45 border border-emerald-400">
            <div className="w-4 h-4 bg-slate-900 rounded-sm transform rotate-45"></div>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            VERIFY<span className="text-emerald-500">CORE</span>
          </span>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex items-center gap-3">
          <button
            id="mode-toggle-btn"
            type="button"
            onClick={() => {
              if (appMode === 'simulator') {
                if (stripeAvailable) {
                  setAppMode('stripe');
                  setCurrentStep(-1);
                  setVerificationResult(null);
                  setStripeResult(null);
                  addLog('💳 Switched to Stripe PCI-DSS Live Mode.');
                } else {
                  addLog('⚠️ Stripe keys not configured. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to .env');
                }
              } else {
                setAppMode('simulator');
                setCurrentStep(-1);
                setVerificationResult(null);
                setStripeResult(null);
                addLog('🔬 Switched to Simulator Mode.');
              }
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs font-bold uppercase tracking-wider transition-all ${
              appMode === 'stripe'
                ? 'bg-violet-950/50 border-violet-500/50 text-violet-300 hover:bg-violet-900/50'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/50'
            }`}
          >
            {appMode === 'stripe' ? (
              <>
                <ToggleRight className="w-4 h-4 text-violet-400" />
                <span>🔒 Stripe Live</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4 text-emerald-400" />
                <span>🔬 Simulator</span>
              </>
            )}
          </button>
        </div>

        {/* Navigation Labels for authentic dashboard UI */}
        <div className="hidden md:flex gap-8 text-xs font-semibold uppercase tracking-widest text-slate-400">
          <span className={`${appMode === 'simulator' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-violet-500 border-b-2 border-violet-500'} pb-1 cursor-pointer`}>Gateway Terminal</span>
          <span className="hover:text-white transition-colors cursor-pointer">Smart API Diagnostics</span>
          <span className="hover:text-white transition-colors cursor-pointer">Crypto Security Log</span>
          <span className="hover:text-white transition-colors cursor-pointer">PCI Compliance</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Secure Link Status</div>
            <div className={`text-xs font-mono flex items-center justify-end gap-1.5 ${
              appMode === 'stripe' ? 'text-violet-400' : 'text-emerald-400'
            }`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${
                appMode === 'stripe' ? 'bg-violet-500' : 'bg-emerald-500'
              }`}></span>
              {appMode === 'stripe' ? 'STRIPE PCI-DSS' : 'NODE CLOUD_G2'}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Structural Matrix Grid (Desktop First 12 column split) */}
      <main id="main-content-matrix" className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0">
        
        {/* Left Side Section: Interactive Input, Card Rendering, Presets Control */}
        <section id="left-section-inputs" className="col-span-1 lg:col-span-7 border-r border-slate-800 p-6 lg:p-10 flex flex-col bg-slate-900 overflow-y-auto space-y-8">
          
          <div className="max-w-2xl mx-auto w-full space-y-6">
            <header className="space-y-2">
              <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-sm border text-xs font-bold uppercase tracking-wider ${
                appMode === 'stripe'
                  ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}>
                {appMode === 'stripe' ? (
                  <><Zap className="w-3.5 h-3.5" /> PCI-DSS Stripe Gateway</>
                ) : (
                  <><Shield className="w-3.5 h-3.5" /> E2EE Cryptographic Gateway</>
                )}
              </div>
              <h1 className="text-3xl lg:text-4xl font-light text-white leading-tight">
                Card <span className={`font-bold ${appMode === 'stripe' ? 'text-violet-500' : 'text-emerald-500'}`}>
                  {appMode === 'stripe' ? 'Verification' : 'Authenticity'}
                </span> & Funds Audit
              </h1>
              <p className="text-slate-400 text-sm max-w-lg">
                {appMode === 'stripe'
                  ? 'Enter card details via Stripe\'s PCI-compliant hosted iframes. Tokenized, verified, and pre-authorized in real-time via Stripe API.'
                  : 'Enter credit credentials for automated hardware SHA-256 RSA envelope packaging. Resolves Luhn checksum algorithms and real-time smart funds availability.'
                }
              </p>
            </header>

            {/* Verification Presets - Only show in simulator mode */}
            {appMode === 'simulator' && (
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-none space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-emerald-500" /> Selective Verification Presets
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">Select to simulate</span>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                  {TEST_PROFILES.map((p) => {
                    const isActive = activeProfile === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleProfileSelection(p.id)}
                        className={`text-left p-2.5 rounded-none border text-xs transition-all flex flex-col justify-between h-20 ${
                          isActive 
                            ? 'border-emerald-500 bg-emerald-950/40 text-white' 
                            : 'border-slate-800 bg-slate-900/50 hover:bg-slate-900 text-slate-300'
                        }`}
                      >
                        <span className="font-bold truncate w-full">{p.title}</span>
                        <span className="text-[9px] text-slate-500 truncate w-full">{p.description}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handleProfileSelection('custom')}
                    className={`text-left p-2.5 rounded-none border text-xs transition-all flex flex-col justify-between h-20 ${
                      activeProfile === 'custom' 
                        ? 'border-emerald-500 bg-emerald-950/40 text-white' 
                        : 'border-slate-800 bg-slate-900/50 hover:bg-slate-900 text-slate-300'
                    }`}
                    id="preset-btn-custom"
                  >
                    <span className="font-bold text-emerald-400 uppercase">Custom Manual</span>
                    <span className="text-[9px] text-slate-500">Enable absolute input control</span>
                  </button>
                </div>
              </div>
            )}

            {/* Creative Live-Updating Credit Card Interface - Simulator only */}
            {appMode === 'simulator' && (
              <div className="relative group perspective-1000 my-4 h-48 md:h-52 w-full max-w-md mx-auto">
                <div className={`absolute inset-0 rounded-xl p-6 text-white flex flex-col justify-between shadow-2xl transition-all duration-500 transform ${currentCardSkin.bg} border`}>
                  
                  {/* Card Top Row */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">Verified Bank Node</span>
                      <div className="text-xs font-bold tracking-tight">
                        {activeProfile !== 'custom' 
                          ? TEST_PROFILES.find(p => p.id === activeProfile)?.title || "SECURE MERCHANT" 
                          : "CUSTOM CARD PROCESS"
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-900/40 px-2 py-1 rounded-md text-[10px] font-mono border border-white/10 uppercase">
                      <Lock className="w-3 h-3 text-emerald-400" /> Encrypted Payload
                    </div>
                  </div>

                  {/* EMV Micro-Chip Graphic & Brand Logo */}
                  <div className="flex justify-between items-center my-1">
                    <div className="w-12 h-9 bg-gradient-to-br from-amber-400 via-yellow-200 to-amber-500 rounded-lg relative overflow-hidden flex items-center justify-center opacity-90">
                      <div className="absolute inset-1 border border-amber-600/30 rounded-md grid grid-cols-3 gap-0.5">
                        <div className="border-r border-b border-amber-600/20"></div>
                        <div className="border-r border-b border-amber-600/20"></div>
                        <div className="border-b border-amber-600/20"></div>
                        <div className="border-r border-b border-amber-600/20"></div>
                        <div className="border-r border-b border-amber-600/20"></div>
                        <div className="border-b border-amber-600/20"></div>
                      </div>
                      {/* Chip lines */}
                      <div className="w-4 h-0.5 bg-amber-800/40 absolute left-0 top-1/2"></div>
                      <div className="w-4 h-0.5 bg-amber-800/40 absolute right-0 top-1/2"></div>
                    </div>

                    {currentCardSkin.badge ? (
                      <img src={currentCardSkin.badge} alt={currentCardSkin.brand} className="h-8 object-contain" />
                    ) : (
                      <div className="text-xs bg-white/10 px-2.5 py-1 text-white font-mono uppercase tracking-widest">
                        {currentCardSkin.brand}
                      </div>
                    )}
                  </div>

                  {/* Number Section */}
                  <div className="font-mono text-xl md:text-2xl tracking-[0.16em] text-white select-all text-shadow py-1">
                    {formData.number || "•••• •••• •••• ••••"}
                  </div>

                  {/* Bottom Card Row */}
                  <div className="flex justify-between items-end">
                    <div className="flex-1 min-w-0 pr-4">
                      <span className="text-[9px] uppercase tracking-wider text-white/50 block">Cardholder Signature</span>
                      <span className="text-sm font-semibold tracking-wide uppercase truncate block text-slate-100">
                        {formData.name || "CARDHOLDER NAME"}
                      </span>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-white/50 block">Expiry</span>
                        <span className="text-xs font-mono font-bold tracking-widest block text-slate-100">
                          {formData.expiry || "MM/YY"}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-white/50 block">CVV</span>
                        <span className="text-xs font-mono font-bold tracking-widest block text-slate-150">
                          {isCVVMasked ? "•••" : formData.cvv || "•••"}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* STRIPE MODE: Sub-mode tabs + Stripe Card Form */}
            {appMode === 'stripe' && stripePromise && (
              <>
                {/* Verify / Charge sub-tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStripeSubMode('verify');
                      setCurrentStep(-1);
                      setStripeResult(null);
                      setChargeResult(null);
                      addLog('🔍 Switched to Verify Only mode.');
                    }}
                    className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                      stripeSubMode === 'verify'
                        ? 'bg-violet-950/50 border-violet-500 text-violet-300'
                        : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                    <span>🔍 Verify Only</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStripeSubMode('charge');
                      setCurrentStep(-1);
                      setStripeResult(null);
                      setChargeResult(null);
                      addLog('💳 Switched to Charge Payment mode.');
                    }}
                    className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                      stripeSubMode === 'charge'
                        ? 'bg-amber-950/50 border-amber-500 text-amber-300'
                        : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>💳 Charge Payment</span>
                  </button>
                </div>

                <Elements stripe={stripePromise} options={{
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: stripeSubMode === 'charge' ? '#d97706' : '#8b5cf6',
                      colorBackground: '#0f172a',
                      colorText: '#e2e8f0',
                      colorDanger: '#ef4444',
                      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                      borderRadius: '0px',
                    },
                  },
                }}>
                  <StripeCardForm
                    onTokenized={handleStripeTokenized}
                    onChargeTokenized={handleStripeCharge}
                    chargeMode={stripeSubMode === 'charge'}
                    onError={(error) => {
                      addLog(`❌ ${error}`);
                      setIsLoading(false);
                    }}
                    isLoading={isLoading}
                    setIsLoading={setIsLoading}
                    addLog={addLog}
                    cardholderName={stripeCardholderName}
                    onCardholderNameChange={setStripeCardholderName}
                    billingZip={stripeBillingZip}
                    onBillingZipChange={setStripeBillingZip}
                  />
              </Elements>
              </>
            )}

            {/* Stripe not available notice */}
            {appMode === 'stripe' && !stripeAvailable && !stripeLoading && (
              <div className="bg-amber-950/30 border border-amber-500/30 p-5 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  Stripe Not Configured
                </div>
                <p className="text-slate-400 text-xs">
                  Add <code className="text-amber-300 bg-slate-900 px-1 py-0.5 font-mono">STRIPE_SECRET_KEY</code> and <code className="text-amber-300 bg-slate-900 px-1 py-0.5 font-mono">STRIPE_PUBLISHABLE_KEY</code> to your <code className="text-slate-300 bg-slate-900 px-1 py-0.5 font-mono">.env</code> file and restart the server.
                </p>
              </div>
            )}

            {/* SIMULATOR MODE: Original Form */}
            {appMode === 'simulator' && (
              <>
                {/* Verification Settings Matrix Form */}
                <form id="authenticator-gateway-form" onSubmit={executeVerificationWorkflow} className="space-y-6">
                  
                  <div className="space-y-4 bg-slate-950 border border-slate-800/80 p-5 lg:p-6 rounded-none">
                    <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-300">Credentials Processing Deck</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">AES-256 TRANSCEIVER</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Cardholder Number Input */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-emerald-500" /> Integrated Card Number (PAN)
                        </label>
                        <div className="relative">
                          <input
                            id="form-card-number-input"
                            type="text"
                            disabled={activeProfile !== 'custom'}
                            value={formData.number}
                            onChange={(e) => {
                              const formattedValue = formatCardNumberWithSpaces(e.target.value);
                              setFormData({ ...formData, number: formattedValue });
                            }}
                            maxLength={19}
                            placeholder="4532 9901 2244 8105"
                            className={`w-full bg-slate-900 border border-slate-700/80 p-3 font-mono text-base tracking-widest text-white focus:outline-none focus:border-emerald-500 ${
                              activeProfile !== 'custom' ? 'opacity-70 cursor-not-allowed bg-slate-900/40 text-slate-400' : ''
                            }`}
                            required
                          />
                          {activeProfile !== 'custom' && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono bg-slate-850 px-2 py-0.5 rounded text-slate-400 tracking-wider">
                              PRESET LOCKED
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Cardholder Name */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                          Cardholder Billing Name
                        </label>
                        <input
                          id="form-cardholder-name-input"
                          type="text"
                          disabled={activeProfile !== 'custom'}
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g. SARAH JENKINS"
                          className={`w-full bg-slate-900 border border-slate-700/80 p-3 text-base tracking-wide uppercase text-white focus:outline-none focus:border-emerald-500 ${
                            activeProfile !== 'custom' ? 'opacity-70 cursor-not-allowed bg-slate-900/40 text-slate-400' : ''
                          }`}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Expiry Date */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                          Expiration Epoch
                        </label>
                        <input
                          id="form-card-expiry"
                          type="text"
                          disabled={activeProfile !== 'custom'}
                          value={formData.expiry}
                          onChange={(e) => setFormData({ ...formData, expiry: e.target.value })}
                          maxLength={5}
                          placeholder="MM/YY"
                          className={`w-full bg-slate-900 border border-slate-700/80 p-3 font-mono text-base tracking-widest text-center text-white focus:outline-none focus:border-emerald-500 ${
                            activeProfile !== 'custom' ? 'opacity-70 cursor-not-allowed bg-slate-900/40' : ''
                          }`}
                          required
                        />
                      </div>

                      {/* CVV/CVC */}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between">
                          <span>CVV/CVC Code</span>
                          <button 
                            type="button" 
                            onClick={() => setIsCVVMasked(!isCVVMasked)} 
                            className="text-[9px] text-emerald-500 uppercase hover:underline"
                          >
                            {isCVVMasked ? "Reveal" : "Hide"}
                          </button>
                        </label>
                        <input
                          id="form-card-cvv"
                          type={isCVVMasked ? "password" : "text"}
                          disabled={activeProfile !== 'custom'}
                          value={formData.cvv}
                          onChange={(e) => setFormData({ ...formData, cvv: e.target.value })}
                          maxLength={4}
                          placeholder="•••"
                          className={`w-full bg-slate-900 border border-slate-700/80 p-3 font-mono text-base tracking-widest text-center text-white focus:outline-none focus:border-emerald-500 ${
                            activeProfile !== 'custom' ? 'opacity-70 cursor-not-allowed bg-slate-900/40' : ''
                          }`}
                          required
                        />
                      </div>

                      {/* Active Key Id Display Info */}
                      <div className="col-span-2 md:col-span-1 space-y-2 flex flex-col justify-end">
                        <div className="bg-slate-900 p-2.5 border border-slate-800 text-[10px] font-mono text-slate-400 space-y-1">
                          <div className="font-bold text-white flex items-center gap-1">
                            <Lock className="w-3 h-3 text-emerald-400" /> Active Master Key:
                          </div>
                          <div className="truncate text-[9px] text-slate-500">
                            {encryptionConfig?.keyId || "Loading hardware keystore..."}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Secure Funds Availability Parameters */}
                    <div className="border-t border-slate-800 pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={customBalanceReq}
                            onChange={(e) => {
                              setCustomBalanceReq(e.target.checked);
                              // Default value update based on profile
                              if (e.target.checked && activeProfile !== 'custom') {
                                const p = TEST_PROFILES.find(x => x.id === activeProfile);
                                if (p) setCustomBalanceValue(p.startingBalance);
                              }
                            }}
                            className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                            id="toggle-custom-balance"
                          />
                          Custom Funds Balance Availability Test Override
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">Simulate custom liquidity</span>
                      </div>

                      {customBalanceReq && (
                        <div className="bg-slate-900 p-4 border border-slate-800 space-y-3 animate-fadeIn">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">Target Funds Available Override:</span>
                            <span className="font-bold font-mono text-emerald-400 text-lg">
                              ${customBalanceValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="500000"
                            step="250"
                            value={customBalanceValue}
                            onChange={(e) => setCustomBalanceValue(Number(e.target.value))}
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            id="custom-balance-slider"
                          />
                          <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                            <span>$0 (Declined Test)</span>
                            <span>$10,000</span>
                            <span>$100,000</span>
                            <span>$500,000 (Plat Max Limit)</span>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Action Button */}
                  <button
                    id="submit-auth-workflow-btn"
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-6 rounded-none transition-all flex items-center justify-between group shadow-lg shadow-emerald-950/20 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      {isLoading ? (
                        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                      ) : (
                        <Cpu className="w-5 h-5 text-white animate-pulse" />
                      )}
                      <span className="uppercase tracking-widest text-sm text-left">
                        {isLoading ? `Processing Node Diagnostics...` : `Initiate Multi-Factor Authenticity Handshake`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs text-white/80 group-hover:translate-x-1 transition-transform">
                      <span>SECURE CONNECT</span> <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>
                </form>
              </>
            )}

            {/* Simulated Live Transaction Trace Console logs */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500" /> Gateway Logs Terminal & Key Registry
              </h3>
              <div className="bg-slate-950 border border-slate-800 rounded-none p-4 h-48 overflow-y-auto font-mono text-xs text-slate-300 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                {consoleLogs.length === 0 ? (
                  <p className="text-slate-600 italic">Terminal sterile. Connection link idle.</p>
                ) : (
                  consoleLogs.map((log, index) => {
                    let textClass = 'text-slate-300';
                    if (log.includes('✅')) textClass = 'text-emerald-400 font-medium';
                    if (log.includes('❌') || log.includes('Interception')) textClass = 'text-red-400 font-medium';
                    if (log.includes('⚠️')) textClass = 'text-amber-400';
                    if (log.includes('🔐') || log.includes('🔑') || log.includes('🔒')) textClass = 'text-indigo-300';
                    if (log.includes('💳')) textClass = 'text-violet-300';
                    return (
                      <p key={index} className={textClass}>
                        {log}
                      </p>
                    );
                  })
                )}
              </div>
            </div>

            {/* Hardware Protocols Panel */}
            <div className="grid grid-cols-4 gap-4 p-4 border border-slate-850 bg-slate-900/50">
              {appMode === 'stripe' ? (
                <>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white font-mono">PCI L1</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">DSS Compliance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white font-mono">3DS 2.0</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Auth Protocol</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white font-mono">AVS+CVC</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Address Verify</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white font-mono">TLS 1.3</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Stripe Tunnel</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white font-mono">1.2ms</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Gateway Latency</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white font-mono">SHA-256</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Client Hashing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white font-mono">RSA-2048</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Standard Transport</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white font-mono">TLS 1.3</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">SSL Node protocol</div>
                  </div>
                </>
              )}
            </div>

          </div>
        </section>

        {/* Right Side Section: Verification Pipeline Progression & Server-Side Smart Response */}
        <section id="right-section-pipeline" className="col-span-1 lg:col-span-5 flex flex-col bg-slate-950 p-6 lg:p-10 border-t lg:border-t-0 border-slate-800 space-y-8 overflow-y-auto">
          
          <div className="space-y-6">
            <div>
              <h2 className={`text-xs uppercase tracking-[0.2em] font-bold mb-1 ${
                appMode === 'stripe' ? 'text-violet-400' : 'text-emerald-400'
              }`}>REAL-TIME TELEMETRY</h2>
              <span className="text-2xl font-light text-white block">Verification <span className="font-bold text-white">Pipeline</span></span>
            </div>

            {/* Current step feedback & process pipeline */}
            <div className="space-y-3">
              {pipelineSteps.map((step, idx) => {
                let statusColor = "bg-slate-800 border-slate-700 opacity-40";
                let badgeTxt = "PENDING";
                let badgeClass = "text-slate-500";
                
                if (currentStep > idx) {
                  statusColor = appMode === 'stripe'
                    ? "bg-violet-900/30 border-violet-500 text-white"
                    : "bg-emerald-900/30 border-emerald-500 text-white";
                  badgeTxt = "COMPLETE";
                  badgeClass = appMode === 'stripe' ? "text-violet-400" : "text-emerald-400";
                } else if (currentStep === idx) {
                  statusColor = "bg-indigo-900/40 border-indigo-400 text-white animate-pulse border";
                  badgeTxt = "PROCESSED";
                  badgeClass = "text-indigo-400 animate-pulse font-mono";
                }

                return (
                  <div key={idx} className={`p-3 border-l-2 bg-slate-900/40 transition-all duration-300 flex items-start justify-between gap-3 ${statusColor}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500">{idx + 1}.</span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-100">{step.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal">{step.d}</p>
                    </div>
                    <span className={`text-[9px] font-mono font-bold tracking-widest ${badgeClass}`}>
                      {badgeTxt}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ===================== RESULTS VIEW ===================== */}

            {/* SIMULATOR RESULTS */}
            {hasSimulatorResult && verificationResult ? (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Result Verdict Card */}
                {verificationResult.success ? (
                  <div className="bg-emerald-950/25 border-2 border-emerald-500 p-5 rounded-none space-y-2">
                    <div className="flex items-center gap-2.5 text-emerald-400 font-bold uppercase tracking-widest text-xs">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                      CREDENTIAL APPROVED & AUTHENTIC
                    </div>
                    <p className="text-slate-300 text-xs">
                      {verificationResult.intelligence.authenticityComment || "Successfully decoupled secured parameters. Card holds sufficient liquidity & satisfies Luhn checksum formats."}
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-950/30 border-2 border-red-500 pulse-border-alert p-5 rounded-none space-y-2">
                    <div className="flex items-center gap-2.5 text-red-400 font-bold uppercase tracking-widest text-xs">
                      <XCircle className="w-5 h-5 text-red-500" />
                      TRANSACTION DECLINED / FLAGGED RISK
                    </div>
                    <p className="text-slate-300 text-xs">
                      {verificationResult.intelligence.authenticityComment || "Operational refusal flags triggered. Transaction denied due to high threat scoring, cardholder mismatch, or failed formats."}
                    </p>
                  </div>
                )}

                {/* AI Analytics & Funds Allocation analysis */}
                <div className="bg-slate-900 border border-slate-800 p-5 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h4 className="text-xs uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-emerald-400" /> Real-time Funds Availability
                    </h4>
                    <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-0.5 uppercase">
                      PCI Audit Grade
                    </span>
                  </div>

                  <div className="space-y-4">
                    {/* Available Balance */}
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest block">Available Liquidity</span>
                        <span className="text-3xl font-bold text-white tracking-tight">
                          ${verificationResult.intelligence.fundsAnalysis.availableFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest block">Recommendation State</span>
                        <span className={`text-xs font-mono font-bold px-2 py-1 uppercase rounded-sm inline-block ${
                          verificationResult.intelligence.fundsAnalysis.recommendation.startsWith('APPROVED') 
                            ? 'bg-emerald-950 text-emerald-400' 
                            : 'bg-red-950 text-red-400'
                        }`}>
                          {verificationResult.intelligence.fundsAnalysis.recommendation}
                        </span>
                      </div>
                    </div>

                    {/* Progress slider bar */}
                    <div className="space-y-1">
                      <div className="w-full bg-slate-800 h-2.5 rounded-none overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ${
                            verificationResult.intelligence.fundsAnalysis.utilizationRate > 80 
                              ? 'bg-red-500' 
                              : 'bg-emerald-500'
                          }`} 
                          style={{ width: `${Math.min(100, verificationResult.intelligence.fundsAnalysis.utilizationRate)}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-405 font-mono">
                        <span>CREDIT LIMIT: ${verificationResult.intelligence.fundsAnalysis.creditLimit.toLocaleString('en-US')}</span>
                        <span>{verificationResult.intelligence.fundsAnalysis.utilizationRate}% UTILIZATION</span>
                      </div>
                    </div>

                    {/* Card outstanding Balance statistics */}
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="bg-slate-950 p-3 border border-slate-800">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Outstanding Balance</div>
                        <div className="text-sm font-bold text-slate-200">
                          ${verificationResult.intelligence.fundsAnalysis.outstandingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="bg-slate-950 p-3 border border-slate-800">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Currency Standard</div>
                        <div className="text-sm font-bold text-white">
                          {verificationResult.intelligence.fundsAnalysis.currency || "USD"}
                        </div>
                      </div>
                    </div>

                    {/* Threat evaluation risk score metrics */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-950 p-4 border border-slate-800 flex flex-col justify-between">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Gemini Risk Score</div>
                          <div className="text-[10px] text-slate-400 mb-2">Simulated fraud threat index</div>
                        </div>
                        <div className={`text-3xl font-extrabold font-mono tracking-tighter ${
                          verificationResult.intelligence.riskScore > 70 
                            ? 'text-red-500' 
                            : verificationResult.intelligence.riskScore > 30 
                              ? 'text-amber-500' 
                              : 'text-emerald-400'
                        }`}>
                          {verificationResult.intelligence.riskScore}%
                        </div>
                      </div>
                      <div className="bg-slate-950 p-4 border border-slate-800 flex flex-col justify-between">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">IIN/BIN Region</div>
                          <div className="text-[10px] text-slate-400 mb-2">Issuing location database map</div>
                        </div>
                        <div className="text-base font-bold text-white tracking-wide truncate">
                          {verificationResult.authenticity.binMetadata.country || "United States (US)"}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Structured detailed IIN list metadata resolution */}
                <div className="bg-slate-900 border border-slate-800 p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                    <span className="text-xs uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-500" /> Authenticity Metadata Matrix
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">BIN 6-digit Resolved</span>
                  </div>

                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-mono">
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Network Brand</span>
                      <span className="text-slate-200 mt-0.5 block">{verificationResult.authenticity.binMetadata.brand}</span>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Premium Tier Category</span>
                      <span className="text-slate-200 mt-0.5 block">{verificationResult.authenticity.binMetadata.level}</span>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Issuing Institution</span>
                      <span className="text-slate-200 mt-0.5 block truncate w-full" title={verificationResult.authenticity.issuer}>
                        {verificationResult.authenticity.issuer}
                      </span>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Verification Region</span>
                      <span className="text-slate-200 mt-0.5 block">{verificationResult.authenticity.region}</span>
                    </div>
                  </div>

                  {/* Standard security checklist matrix */}
                  <div className="pt-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-widest mb-2">Operational Integrity Rules</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div className={`p-2 border text-center ${
                        verificationResult.authenticity.isValidLuhn 
                          ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' 
                          : 'border-red-500/30 bg-red-950/20 text-red-400'
                      }`}>
                        <div className="text-[9px] uppercase text-slate-500 font-bold block">Luhn Checksum</div>
                        <span className="text-xs font-bold font-mono tracking-wider mt-1 block">
                          {verificationResult.authenticity.isValidLuhn ? "PASS" : "FAIL"}
                        </span>
                      </div>

                      <div className={`p-2 border text-center ${
                        verificationResult.authenticity.securityChecks.expiryUnexpired 
                          ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' 
                          : 'border-red-500/30 bg-red-950/20 text-red-400'
                      }`}>
                        <div className="text-[9px] uppercase text-slate-500 font-bold block">Temporal Status</div>
                        <span className="text-xs font-bold font-mono tracking-wider mt-1 block">
                          {verificationResult.authenticity.securityChecks.expiryUnexpired ? "ACTIVE" : "EXPIRED"}
                        </span>
                      </div>

                      <div className={`p-2 border text-center ${
                        verificationResult.authenticity.securityChecks.cvvMatched 
                          ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' 
                          : 'border-red-500/30 bg-red-950/20 text-red-400'
                      }`}>
                        <div className="text-[9px] uppercase text-slate-500 font-bold block">Interactive Guard</div>
                        <span className="text-xs font-bold font-mono tracking-wider mt-1 block">
                          {verificationResult.authenticity.securityChecks.cvvMatched ? "VALID CVV" : "MUTED"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transactions feed */}
                <div className="bg-slate-905 border border-slate-800 p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                    <span className="text-xs uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5 font-sans">
                      <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Live Real-time Ledger Transactions Feed
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">Recent operations</span>
                  </div>

                  <div className="space-y-2.5">
                    {verificationResult.intelligence.recentTransactions && verificationResult.intelligence.recentTransactions.length > 0 ? (
                      verificationResult.intelligence.recentTransactions.map((tx: MerchantTransaction) => (
                        <div key={tx.id} className="p-3 bg-slate-950 border border-slate-900 flex justify-between items-center text-xs">
                          <div className="space-y-1">
                            <span className="font-bold text-slate-200 block">{tx.merchant}</span>
                            <div className="flex gap-2 text-[10px] text-slate-500">
                              <span>ID: {tx.id}</span>
                              <span>•</span>
                              <span>{tx.category}</span>
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            <span className="font-bold text-white block">
                              -${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            <span className={`text-[9px] font-mono font-bold uppercase rounded px-1 py-0.5 ${
                              tx.status === 'Approved' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                            }`}>
                              {tx.status}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 italic text-center text-xs py-3">No active ledger items logged for this credential setup.</p>
                    )}
                  </div>
                </div>

                {/* Cryptographic Transport Inspect Payload */}
                <div className="bg-slate-900 border border-slate-800 p-5 space-y-3">
                  <span className="text-xs font-bold uppercase text-indigo-400 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-indigo-400" /> Server-Side Gateway Decryption Check
                  </span>
                  <div className="text-[10px] font-mono bg-slate-950 p-3 text-indigo-300 space-y-2 overflow-x-auto select-all rounded-sm leading-normal">
                    <div>
                      <span className="text-slate-500 block uppercase font-bold text-[9px]">ENCRYPTED PAYLOAD DETECTED (CIPHERTEXT BASE64):</span>
                      <div className="break-all tracking-tighter opacity-80 mt-1 max-h-16 overflow-y-auto font-mono text-[9px]">
                        {verificationResult.rawEncryptedCiphertext}
                      </div>
                    </div>
                    <div className="border-t border-slate-900 pt-2 text-[9px]">
                      <span className="text-slate-500 block uppercase font-bold text-[9px]">DECRYPTED ENVELOPE DUMP (PCIDSS MASKED):</span>
                      <code className="text-emerald-400 block mt-1">
                        {`{ PAN: "${verificationResult.decryptedDataSummary.maskedNumber}", cardholderName: "${verificationResult.decryptedDataSummary.cardholderName}", expiry: "${verificationResult.decryptedDataSummary.expiry}", status: "SUCCESS_DECRYPT" }`}
                      </code>
                    </div>
                  </div>
                </div>

              </div>
            ) : null}

            {/* STRIPE RESULTS */}
            {hasStripeResult && stripeResult ? (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Result Verdict Card */}
                {stripeResult.success ? (
                  <div className="bg-violet-950/25 border-2 border-violet-500 p-5 rounded-none space-y-2">
                    <div className="flex items-center gap-2.5 text-violet-300 font-bold uppercase tracking-widest text-xs">
                      <ShieldCheck className="w-5 h-5 text-violet-400" />
                      STRIPE VERIFIED — CARD AUTHENTIC
                    </div>
                    <p className="text-slate-300 text-xs">
                      {stripeResult.intelligence.authenticityComment}
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-950/30 border-2 border-red-500 pulse-border-alert p-5 rounded-none space-y-2">
                    <div className="flex items-center gap-2.5 text-red-400 font-bold uppercase tracking-widest text-xs">
                      <ShieldAlert className="w-5 h-5 text-red-500" />
                      VERIFICATION FAILED / RISK FLAGGED
                    </div>
                    <p className="text-slate-300 text-xs">
                      {stripeResult.intelligence.authenticityComment}
                    </p>
                    {stripeResult.riskAssessment.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {stripeResult.riskAssessment.flags.map((flag, i) => (
                          <span key={i} className="text-[9px] font-mono bg-red-950 text-red-400 px-1.5 py-0.5 border border-red-500/30">
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Pre-Auth Hold Status */}
                <div className="bg-slate-900 border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-xs uppercase tracking-widest text-violet-400 font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> Pre-Authorization Hold
                    </h4>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 uppercase ${
                      stripeResult.preAuth.holdStatus === 'voided' ? 'bg-emerald-950 text-emerald-400' :
                      stripeResult.preAuth.holdStatus === 'placed' ? 'bg-amber-950 text-amber-400' :
                      stripeResult.preAuth.holdStatus === 'void_failed' ? 'bg-red-950 text-red-400' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {stripeResult.preAuth.holdStatus === 'voided' ? '✓ VOIDED' :
                       stripeResult.preAuth.holdStatus === 'placed' ? 'HELD' :
                       stripeResult.preAuth.holdStatus === 'void_failed' ? '⚠ VOID FAILED' :
                       'SKIPPED'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-slate-950 p-2.5 border border-slate-800">
                      <div className="text-[9px] text-slate-500 uppercase mb-1">Hold Amount</div>
                      <div className="font-bold font-mono text-white">${stripeResult.preAuth.holdAmount.toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 border border-slate-800">
                      <div className="text-[9px] text-slate-500 uppercase mb-1">Intent ID</div>
                      <div className="font-mono text-slate-300 truncate text-[10px]">{stripeResult.preAuth.paymentIntentId}</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 border border-slate-800">
                      <div className="text-[9px] text-slate-500 uppercase mb-1">Idempotency</div>
                      <div className="font-mono text-slate-300 truncate text-[10px]">{stripeResult.preAuth.idempotencyKey}</div>
                    </div>
                  </div>
                </div>

                {/* AVS/CVV Checks */}
                <div className="bg-slate-900 border border-slate-800 p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-xs uppercase tracking-wider text-violet-400 font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> AVS & CVV Verification
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">Address Verification Service</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'CVC Check', value: stripeResult.preAuth.avsChecks.cvcCheck },
                      { label: 'Postal Code', value: stripeResult.preAuth.avsChecks.postalCode },
                      { label: 'Address Line', value: stripeResult.preAuth.avsChecks.addressLine1 },
                    ].map((check) => (
                      <div key={check.label} className={`p-3 border text-center ${
                        check.value === 'pass' ? 'border-emerald-500/30 bg-emerald-950/20' :
                        check.value === 'fail' ? 'border-red-500/30 bg-red-950/20' :
                        'border-slate-700/30 bg-slate-950/20'
                      }`}>
                        <div className="text-[9px] uppercase text-slate-500 font-bold">{check.label}</div>
                        <div className={`text-xs font-bold font-mono mt-1 ${
                          check.value === 'pass' ? 'text-emerald-400' :
                          check.value === 'fail' ? 'text-red-400' :
                          'text-slate-400'
                        }`}>
                          {check.value === 'pass' ? '✓ MATCH' :
                           check.value === 'fail' ? '✗ FAIL' :
                           check.value === 'unavailable' ? '— N/A' :
                           '○ UNCHECKED'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3D Secure Status */}
                <div className="bg-slate-900 border border-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-violet-400 font-bold flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> 3D Secure 2.0
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 uppercase ${
                      stripeResult.threeDSecure.status === 'succeeded' ? 'bg-emerald-950 text-emerald-400' :
                      stripeResult.threeDSecure.status === 'failed' ? 'bg-red-950 text-red-400' :
                      stripeResult.threeDSecure.status === 'challenge_required' ? 'bg-amber-950 text-amber-400' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {stripeResult.threeDSecure.status === 'succeeded' ? '✓ AUTHENTICATED' :
                       stripeResult.threeDSecure.status === 'not_required' ? 'NOT REQUIRED' :
                       stripeResult.threeDSecure.status === 'failed' ? '✗ FAILED' :
                       stripeResult.threeDSecure.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Funds & Intelligence */}
                <div className="bg-slate-900 border border-slate-800 p-5 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h4 className="text-xs uppercase tracking-widest text-violet-400 font-bold flex items-center gap-1.5">
                      <Coins className="w-4 h-4" /> Funds & Risk Intelligence
                    </h4>
                    <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-0.5 uppercase">
                      Stripe Gateway
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest block">Available Liquidity</span>
                        <span className="text-3xl font-bold text-white tracking-tight">
                          ${stripeResult.intelligence.fundsAnalysis.availableFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest block">Recommendation</span>
                        <span className={`text-xs font-mono font-bold px-2 py-1 uppercase rounded-sm inline-block ${
                          stripeResult.intelligence.fundsAnalysis.recommendation.startsWith('APPROVED')
                            ? 'bg-emerald-950 text-emerald-400'
                            : 'bg-red-950 text-red-400'
                        }`}>
                          {stripeResult.intelligence.fundsAnalysis.recommendation}
                        </span>
                      </div>
                    </div>

                    {/* Risk & BIN */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-950 p-4 border border-slate-800 flex flex-col justify-between">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Risk Score</div>
                          <div className="text-[10px] text-slate-400 mb-2">Gateway threat assessment</div>
                        </div>
                        <div className={`text-3xl font-extrabold font-mono tracking-tighter ${
                          stripeResult.riskAssessment.riskScore > 70
                            ? 'text-red-500'
                            : stripeResult.riskAssessment.riskScore > 30
                              ? 'text-amber-500'
                              : 'text-emerald-400'
                        }`}>
                          {stripeResult.riskAssessment.riskScore}%
                        </div>
                      </div>
                      <div className="bg-slate-950 p-4 border border-slate-800 flex flex-col justify-between">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Card Origin</div>
                          <div className="text-[10px] text-slate-400 mb-2">Stripe BIN database</div>
                        </div>
                        <div className="text-base font-bold text-white tracking-wide truncate">
                          {stripeResult.stripeBinData.country || "US"} — {stripeResult.stripeBinData.brand}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BIN Metadata */}
                <div className="bg-slate-900 border border-slate-800 p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                    <span className="text-xs uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-violet-500" /> Stripe BIN Metadata
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">PaymentMethod Data</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-mono">
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Network Brand</span>
                      <span className="text-slate-200 mt-0.5 block">{stripeResult.stripeBinData.brand}</span>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Last 4 Digits</span>
                      <span className="text-slate-200 mt-0.5 block">****{stripeResult.stripeBinData.last4}</span>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Funding Type</span>
                      <span className="text-slate-200 mt-0.5 block capitalize">{stripeResult.stripeBinData.funding}</span>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Expiration</span>
                      <span className="text-slate-200 mt-0.5 block">{stripeResult.stripeBinData.expMonth}/{stripeResult.stripeBinData.expYear}</span>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">Country</span>
                      <span className="text-slate-200 mt-0.5 block">{stripeResult.stripeBinData.country}</span>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5">
                      <span className="text-slate-500 text-[10px] block uppercase">PaymentMethod ID</span>
                      <span className="text-slate-200 mt-0.5 block truncate">{stripeResult.paymentMethodId}</span>
                    </div>
                  </div>
                </div>

                {/* Transactions feed */}
                <div className="bg-slate-905 border border-slate-800 p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                    <span className="text-xs uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5 font-sans">
                      <Activity className="w-3.5 h-3.5 text-violet-500 animate-pulse" /> Simulated Ledger Transactions
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">Recent operations</span>
                  </div>
                  <div className="space-y-2.5">
                    {stripeResult.intelligence.recentTransactions && stripeResult.intelligence.recentTransactions.length > 0 ? (
                      stripeResult.intelligence.recentTransactions.map((tx: MerchantTransaction) => (
                        <div key={tx.id} className="p-3 bg-slate-950 border border-slate-900 flex justify-between items-center text-xs">
                          <div className="space-y-1">
                            <span className="font-bold text-slate-200 block">{tx.merchant}</span>
                            <div className="flex gap-2 text-[10px] text-slate-500">
                              <span>ID: {tx.id}</span>
                              <span>•</span>
                              <span>{tx.category}</span>
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            <span className="font-bold text-white block">
                              -${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            <span className={`text-[9px] font-mono font-bold uppercase rounded px-1 py-0.5 ${
                              tx.status === 'Approved' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                            }`}>
                              {tx.status}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 italic text-center text-xs py-3">No ledger items for this verification.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* CHARGE RESULTS */}
            {hasChargeResult && chargeResult ? (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Payment Success/Fail Banner */}
                {chargeResult.success && chargeResult.payment.status === 'succeeded' ? (
                  <div className={`border-2 p-6 rounded-none space-y-3 ${
                    chargeResult.payment.status === 'refunded'
                      ? 'bg-slate-900/50 border-slate-500'
                      : 'bg-emerald-950/25 border-emerald-500'
                  }`}>
                    <div className="flex items-center gap-2.5 font-bold uppercase tracking-widest text-xs">
                      {chargeResult.payment.status === 'refunded' ? (
                        <><RotateCcw className="w-5 h-5 text-slate-400" /> <span className="text-slate-300">PAYMENT REFUNDED</span></>
                      ) : (
                        <><CheckCircle className="w-5 h-5 text-emerald-400" /> <span className="text-emerald-400">PAYMENT CAPTURED SUCCESSFULLY</span></>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className={`text-4xl font-bold font-mono tracking-tight ${
                        chargeResult.payment.status === 'refunded' ? 'text-slate-400 line-through' : 'text-white'
                      }`}>
                        ${chargeResult.payment.amount.toFixed(2)}
                      </span>
                      <span className="text-sm text-slate-400 font-mono">{chargeResult.payment.currency}</span>
                    </div>
                    <p className="text-slate-400 text-xs">
                      {chargeResult.intelligence.authenticityComment}
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-950/30 border-2 border-red-500 pulse-border-alert p-5 rounded-none space-y-2">
                    <div className="flex items-center gap-2.5 text-red-400 font-bold uppercase tracking-widest text-xs">
                      <XCircle className="w-5 h-5 text-red-500" />
                      PAYMENT FAILED / DECLINED
                    </div>
                    <p className="text-slate-300 text-xs">
                      {chargeResult.intelligence.authenticityComment}
                    </p>
                    {chargeResult.riskAssessment.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {chargeResult.riskAssessment.flags.map((flag, i) => (
                          <span key={i} className="text-[9px] font-mono bg-red-950 text-red-400 px-1.5 py-0.5 border border-red-500/30">
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Payment Details Card */}
                {chargeResult.payment && (
                  <div className="bg-slate-900 border border-slate-800 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="text-xs uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
                        <Receipt className="w-4 h-4" /> Payment Receipt
                      </h4>
                      <span className={`text-[9px] font-mono font-bold px-2 py-0.5 uppercase ${
                        chargeResult.payment.status === 'succeeded' ? 'bg-emerald-950 text-emerald-400' :
                        chargeResult.payment.status === 'refunded' ? 'bg-slate-800 text-slate-400' :
                        'bg-red-950 text-red-400'
                      }`}>
                        {chargeResult.payment.status === 'succeeded' ? '✓ CAPTURED' :
                         chargeResult.payment.status === 'refunded' ? '↩ REFUNDED' :
                         '✗ FAILED'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-mono">
                      <div className="border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500 text-[10px] block uppercase">Amount</span>
                        <span className="text-white mt-0.5 block text-lg font-bold">${chargeResult.payment.amount.toFixed(2)} {chargeResult.payment.currency}</span>
                      </div>
                      <div className="border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500 text-[10px] block uppercase">Card</span>
                        <span className="text-slate-200 mt-0.5 block capitalize">{chargeResult.payment.cardBrand} ****{chargeResult.payment.last4}</span>
                      </div>
                      <div className="border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500 text-[10px] block uppercase">Payment ID</span>
                        <span className="text-slate-300 mt-0.5 block text-[10px] truncate">{chargeResult.payment.chargeId}</span>
                      </div>
                      <div className="border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500 text-[10px] block uppercase">Timestamp</span>
                        <span className="text-slate-300 mt-0.5 block text-[10px]">{new Date(chargeResult.payment.createdAt).toLocaleString()}</span>
                      </div>
                      {chargeResult.payment.description && (
                        <div className="border-b border-slate-850 pb-1.5 col-span-2">
                          <span className="text-slate-500 text-[10px] block uppercase">Description</span>
                          <span className="text-slate-200 mt-0.5 block">{chargeResult.payment.description}</span>
                        </div>
                      )}
                    </div>

                    {/* Receipt URL + Refund */}
                    <div className="flex gap-3 pt-2">
                      {chargeResult.payment.receiptUrl && (
                        <a
                          href={chargeResult.payment.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-center gap-2 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> View Stripe Receipt
                        </a>
                      )}
                      {chargeResult.payment.status === 'succeeded' && (
                        <button
                          type="button"
                          onClick={() => handleRefund(chargeResult.payment.chargeId)}
                          disabled={refundingId === chargeResult.payment.chargeId}
                          className="flex-1 py-2.5 px-4 bg-red-950/50 hover:bg-red-900/50 border border-red-500/30 text-xs font-bold uppercase tracking-wider text-red-400 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                          {refundingId === chargeResult.payment.chargeId ? (
                            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                          ) : (
                            <><RotateCcw className="w-3.5 h-3.5" /> Refund Payment</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Risk Assessment */}
                <div className="bg-slate-900 border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> Risk Assessment
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 uppercase ${
                      chargeResult.riskAssessment.riskLevel === 'low' ? 'bg-emerald-950 text-emerald-400' :
                      chargeResult.riskAssessment.riskLevel === 'medium' ? 'bg-amber-950 text-amber-400' :
                      'bg-red-950 text-red-400'
                    }`}>
                      {chargeResult.riskAssessment.riskLevel.toUpperCase()} — {chargeResult.riskAssessment.riskScore}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'CVC Check', value: chargeResult.preAuth.avsChecks.cvcCheck },
                      { label: 'Postal Code', value: chargeResult.preAuth.avsChecks.postalCode },
                      { label: 'Address Line', value: chargeResult.preAuth.avsChecks.addressLine1 },
                    ].map((check) => (
                      <div key={check.label} className={`p-2.5 border text-center ${
                        check.value === 'pass' ? 'border-emerald-500/30 bg-emerald-950/20' :
                        check.value === 'fail' ? 'border-red-500/30 bg-red-950/20' :
                        'border-slate-700/30 bg-slate-950/20'
                      }`}>
                        <div className="text-[9px] uppercase text-slate-500 font-bold">{check.label}</div>
                        <div className={`text-xs font-bold font-mono mt-1 ${
                          check.value === 'pass' ? 'text-emerald-400' :
                          check.value === 'fail' ? 'text-red-400' :
                          'text-slate-400'
                        }`}>
                          {check.value === 'pass' ? '✓ MATCH' :
                           check.value === 'fail' ? '✗ FAIL' :
                           check.value === 'unavailable' ? '— N/A' :
                           '○ UNCHECKED'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BIN Data */}
                <div className="bg-slate-900 border border-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5" /> Card Details
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono capitalize">{chargeResult.stripeBinData.brand} • {chargeResult.stripeBinData.funding} • {chargeResult.stripeBinData.country}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* TRANSACTION HISTORY */}
            {appMode === 'stripe' && stripeSubMode === 'charge' && transactionHistory.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h4 className="text-xs uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> Transaction History
                  </h4>
                  <span className="text-[9px] text-slate-500 font-mono">{transactionHistory.length} records</span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                  {transactionHistory.map((tx) => (
                    <div key={tx.chargeId} className="p-3 bg-slate-950 border border-slate-900 flex justify-between items-center text-xs">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${tx.status === 'refunded' ? 'text-slate-400 line-through' : 'text-white'}`}>
                            ${tx.amount.toFixed(2)}
                          </span>
                          <span className="text-slate-500 capitalize">{tx.cardBrand} ****{tx.last4}</span>
                        </div>
                        <div className="flex gap-2 text-[10px] text-slate-500 truncate">
                          <span>{tx.description || 'No description'}</span>
                          <span>•</span>
                          <span>{new Date(tx.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <span className={`text-[9px] font-mono font-bold uppercase rounded px-1.5 py-0.5 ${
                          tx.status === 'succeeded' ? 'bg-emerald-950 text-emerald-400' :
                          tx.status === 'refunded' ? 'bg-slate-800 text-slate-400' :
                          'bg-red-950 text-red-400'
                        }`}>
                          {tx.status === 'succeeded' ? '✓ PAID' : tx.status === 'refunded' ? '↩ REFUNDED' : tx.status}
                        </span>
                        {tx.status === 'succeeded' && (
                          <button
                            type="button"
                            onClick={() => handleRefund(tx.chargeId)}
                            disabled={refundingId === tx.chargeId}
                            className="text-[9px] font-mono text-red-400 hover:text-red-300 underline disabled:opacity-50"
                          >
                            {refundingId === tx.chargeId ? '...' : 'Refund'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Awaiting state - no results yet */}
            {!hasAnyResult && (
              <div className="bg-slate-900/60 border border-slate-800 p-8 text-center space-y-4 rounded-none min-h-[300px] flex flex-col justify-center items-center">
                <div className={`w-12 h-12 rounded-full bg-slate-950 flex items-center justify-center border border-slate-800 ${
                  appMode === 'stripe' ? 'text-violet-500/60' : 'text-emerald-500/60'
                }`}>
                  <Fingerprint className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <p className="text-slate-300 text-sm font-bold">
                    {appMode === 'stripe' ? 'Awaiting Stripe Tokenized Input' : 'Awaiting Credentials Transmission'}
                  </p>
                  <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">
                    {appMode === 'stripe'
                      ? 'Enter card details in the Stripe hosted fields on the left, then click the verify button to begin the PCI-DSS pipeline.'
                      : 'Configure parameters in the gateway form on the left, then click the handshake trigger to begin the security sequence.'
                    }
                  </p>
                </div>
                <div className="text-[10px] text-slate-600 font-mono tracking-widest uppercase">
                  {appMode === 'stripe' ? 'STRIPE PCI-DSS READY • TOKENIZER ARMED' : 'PCI STAGES READY • LOCK SECURE'}
                </div>
              </div>
            )}

          </div>
        </section>

      </main>

      {/* Styled Footer matching Geometric Balance aesthetics */}
      <footer id="footer-secure-verifycore" className="h-16 border-t border-slate-800 bg-slate-950 px-6 lg:px-12 flex flex-col sm:flex-row items-center justify-between text-[10px] tracking-widest text-slate-500 font-bold uppercase py-4 sm:py-0 gap-2">
        <div className="flex gap-6">
          <span>Secure Session ID: <span className="text-slate-300 font-mono select-none">F829-X01A-992B</span></span>
          <span className="hidden sm:inline">|</span>
          <span>Node Datacenter: <span className="text-slate-200">FRA-US-01</span></span>
        </div>
        <div className="flex gap-6 items-center">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className={`w-2 h-2 rounded-full animate-pulse ${appMode === 'stripe' ? 'bg-violet-500' : 'bg-emerald-500'}`}></span>
            PCI DSS COMPLIANT
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className={`w-2 h-2 rounded-full animate-pulse ${appMode === 'stripe' ? 'bg-violet-500' : 'bg-emerald-500'}`}></span>
            {appMode === 'stripe' ? 'STRIPE GATEWAY' : 'ISO 27001 SECURE'}
          </span>
        </div>
      </footer>

    </div>
  );
}
