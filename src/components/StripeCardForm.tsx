import React, { useState } from 'react';
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import {
  Lock,
  CreditCard,
  Shield,
  RefreshCw,
  ArrowRight,
  Cpu,
  Zap,
} from 'lucide-react';

// Stripe Elements styling to match the VerifyCORE dark theme
const ELEMENT_STYLE = {
  base: {
    color: '#e2e8f0',
    fontFamily: '"JetBrains Mono", "Plus Jakarta Sans", monospace',
    fontSize: '16px',
    fontWeight: '400',
    letterSpacing: '0.05em',
    '::placeholder': {
      color: '#475569',
    },
    iconColor: '#10b981',
  },
  invalid: {
    color: '#ef4444',
    iconColor: '#ef4444',
  },
  complete: {
    color: '#10b981',
    iconColor: '#10b981',
  },
};

const ELEMENT_OPTIONS = {
  style: ELEMENT_STYLE,
};

interface StripeCardFormProps {
  onTokenized: (paymentMethodId: string) => void;
  onError: (error: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  addLog: (message: string) => void;
  cardholderName: string;
  onCardholderNameChange: (name: string) => void;
  billingZip: string;
  onBillingZipChange: (zip: string) => void;
}

export default function StripeCardForm({
  onTokenized,
  onError,
  isLoading,
  setIsLoading,
  addLog,
  cardholderName,
  onCardholderNameChange,
  billingZip,
  onBillingZipChange,
}: StripeCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [cardComplete, setCardComplete] = useState({
    cardNumber: false,
    cardExpiry: false,
    cardCvc: false,
  });

  const [fieldErrors, setFieldErrors] = useState<{
    cardNumber?: string;
    cardExpiry?: string;
    cardCvc?: string;
  }>({});

  const allFieldsComplete =
    cardComplete.cardNumber &&
    cardComplete.cardExpiry &&
    cardComplete.cardCvc &&
    cardholderName.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      onError('Stripe.js has not loaded yet. Please wait and try again.');
      return;
    }

    if (!allFieldsComplete) {
      onError('Please complete all card fields before submitting.');
      return;
    }

    setIsLoading(true);
    addLog('🔒 Initiating PCI-DSS Stripe Tokenization Flow...');

    try {
      addLog('📡 Exchanging card data for single-use PaymentMethod token via Stripe.js...');

      const { error, paymentMethod } = await stripe.createPaymentMethod({
        elements,
        params: {
          type: 'card',
          billing_details: {
            name: cardholderName.toUpperCase().trim(),
            address: {
              postal_code: billingZip.trim() || undefined,
            },
          },
        },
      });

      if (error) {
        addLog(`❌ Stripe Tokenization Failed: ${error.message}`);
        onError(error.message || 'Tokenization failed.');
        setIsLoading(false);
        return;
      }

      if (paymentMethod) {
        addLog(
          `✅ PaymentMethod tokenized: ${paymentMethod.id} (${paymentMethod.card?.brand} ****${paymentMethod.card?.last4})`
        );
        addLog(
          `🔐 Raw card data NEVER touched your server — PCI-DSS Level 1 compliant.`
        );
        onTokenized(paymentMethod.id);
      }
    } catch (err: any) {
      addLog(`❌ Tokenization Error: ${err.message}`);
      onError(err.message || 'An unexpected error occurred.');
      setIsLoading(false);
    }
  };

  const handleElementChange = (
    field: 'cardNumber' | 'cardExpiry' | 'cardCvc',
    event: any
  ) => {
    setCardComplete((prev) => ({ ...prev, [field]: event.complete }));
    setFieldErrors((prev) => ({
      ...prev,
      [field]: event.error?.message || undefined,
    }));
  };

  return (
    <form id="stripe-authenticator-form" onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4 bg-slate-950 border border-slate-800/80 p-5 lg:p-6 rounded-none">
        <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            PCI-DSS Tokenized Input
          </span>
          <span className="text-[10px] text-violet-400 font-mono font-semibold flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            STRIPE HOSTED FIELDS
          </span>
        </div>

        {/* Stripe info banner */}
        <div className="bg-violet-950/30 border border-violet-500/20 p-3 flex items-start gap-3">
          <Lock className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-violet-300 leading-relaxed">
            <span className="font-bold text-violet-200 block mb-0.5">Hosted Secure Iframes Active</span>
            Card data is collected inside Stripe's PCI-compliant hosted iframes.
            Raw card numbers never touch your server or JavaScript scope.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Number - Stripe Element */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-violet-500" /> Card Number (Hosted)
            </label>
            <div className="w-full bg-slate-900 border border-slate-700/80 p-3 rounded-none focus-within:border-violet-500 transition-colors">
              <CardNumberElement
                options={ELEMENT_OPTIONS}
                onChange={(e) => handleElementChange('cardNumber', e)}
              />
            </div>
            {fieldErrors.cardNumber && (
              <p className="text-[10px] text-red-400 font-mono">{fieldErrors.cardNumber}</p>
            )}
          </div>

          {/* Cardholder Name */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              Cardholder Billing Name
            </label>
            <input
              id="stripe-cardholder-name"
              type="text"
              value={cardholderName}
              onChange={(e) => onCardholderNameChange(e.target.value)}
              placeholder="e.g. SARAH JENKINS"
              className="w-full bg-slate-900 border border-slate-700/80 p-3 text-base tracking-wide uppercase text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Expiry - Stripe Element */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              Expiration Date (Hosted)
            </label>
            <div className="w-full bg-slate-900 border border-slate-700/80 p-3 rounded-none focus-within:border-violet-500 transition-colors">
              <CardExpiryElement
                options={ELEMENT_OPTIONS}
                onChange={(e) => handleElementChange('cardExpiry', e)}
              />
            </div>
            {fieldErrors.cardExpiry && (
              <p className="text-[10px] text-red-400 font-mono">{fieldErrors.cardExpiry}</p>
            )}
          </div>

          {/* CVC - Stripe Element */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              CVC / Security Code (Hosted)
            </label>
            <div className="w-full bg-slate-900 border border-slate-700/80 p-3 rounded-none focus-within:border-violet-500 transition-colors">
              <CardCvcElement
                options={ELEMENT_OPTIONS}
                onChange={(e) => handleElementChange('cardCvc', e)}
              />
            </div>
            {fieldErrors.cardCvc && (
              <p className="text-[10px] text-red-400 font-mono">{fieldErrors.cardCvc}</p>
            )}
          </div>

          {/* Billing ZIP for AVS */}
          <div className="space-y-2 col-span-2 md:col-span-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              Billing ZIP (AVS Check)
            </label>
            <input
              id="stripe-billing-zip"
              type="text"
              value={billingZip}
              onChange={(e) => onBillingZipChange(e.target.value)}
              placeholder="e.g. 10001"
              maxLength={10}
              className="w-full bg-slate-900 border border-slate-700/80 p-3 font-mono text-base tracking-widest text-center text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* Stripe test cards info */}
        <div className="border-t border-slate-800 pt-3">
          <details className="group">
            <summary className="text-[10px] text-slate-500 uppercase tracking-wider font-bold cursor-pointer hover:text-slate-300 transition-colors select-none flex items-center gap-1.5">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              Stripe Test Card Numbers
            </summary>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-500">
              <div className="bg-slate-900/50 p-2 border border-slate-800/50">
                <span className="text-emerald-400">4242 4242 4242 4242</span> — Success
              </div>
              <div className="bg-slate-900/50 p-2 border border-slate-800/50">
                <span className="text-amber-400">4000 0025 0000 3155</span> — Requires 3DS
              </div>
              <div className="bg-slate-900/50 p-2 border border-slate-800/50">
                <span className="text-red-400">4000 0000 0000 9995</span> — Insufficient Funds
              </div>
              <div className="bg-slate-900/50 p-2 border border-slate-800/50">
                <span className="text-red-400">4000 0000 0000 0127</span> — CVC Fail
              </div>
              <div className="bg-slate-900/50 p-2 border border-slate-800/50">
                <span className="text-slate-400">Any future date</span> — Expiry
              </div>
              <div className="bg-slate-900/50 p-2 border border-slate-800/50">
                <span className="text-slate-400">Any 3 digits</span> — CVC
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* Submit Button */}
      <button
        id="stripe-submit-btn"
        type="submit"
        disabled={isLoading || !stripe || !allFieldsComplete}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-4 px-6 rounded-none transition-all flex items-center justify-between group shadow-lg shadow-violet-950/20 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-3">
          {isLoading ? (
            <RefreshCw className="w-5 h-5 animate-spin text-violet-400" />
          ) : (
            <Cpu className="w-5 h-5 text-white animate-pulse" />
          )}
          <span className="uppercase tracking-widest text-sm text-left">
            {isLoading
              ? 'Processing Stripe Verification...'
              : 'Tokenize & Verify via Stripe Gateway'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs text-white/80 group-hover:translate-x-1 transition-transform">
          <span>PCI-DSS</span> <ArrowRight className="w-4 h-4" />
        </div>
      </button>
    </form>
  );
}
