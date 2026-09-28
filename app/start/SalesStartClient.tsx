"use client";

import Image from "next/image";
import Script from "next/script";
import { type FormEvent, useEffect, useRef, useState } from "react";
import styles from "./start.module.css";

type CheckoutResult = {
  checkout_client_secret: string;
  setup_intent_id: string;
  reused?: boolean;
};

type FormState = {
  businessName: string;
  fullName: string;
  email: string;
  location: string;
};

type EmbeddedCheckout = {
  mount: (target: HTMLElement) => void;
  destroy: () => void;
};

type StripeInstance = {
  initEmbeddedCheckout: (options: {
    clientSecret: string;
    onComplete?: () => void;
  }) => Promise<EmbeddedCheckout>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

const initialForm: FormState = {
  businessName: "",
  fullName: "",
  email: "",
  location: "",
};

export function SalesStartClient({
  staffName,
  staffEmail,
  stripePublishableKey = "",
  previewMode = false,
}: {
  staffName: string;
  staffEmail: string;
  stripePublishableKey?: string;
  previewMode?: boolean;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitted, setSubmitted] = useState<FormState | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const checkoutHost = useRef<HTMLDivElement>(null);
  const checkoutInstance = useRef<EmbeddedCheckout | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function continueToPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setComplete(false);
    setSubmitted({ ...form });

    if (previewMode) {
      setCheckout({
        checkout_client_secret: "preview",
        setup_intent_id: "preview",
      });
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/start-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: form.businessName,
          full_name: form.fullName,
          email: form.email,
          niche: "Auto detailing",
          general_location: form.location,
          timezone: "America/New_York",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.checkout_client_secret) {
        throw new Error(payload?.error || "Could not start the payment.");
      }
      setCheckout(payload);
    } catch (caught) {
      setSubmitted(null);
      setError(
        caught instanceof Error ? caught.message : "Could not start the payment.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (
      previewMode ||
      !checkout?.checkout_client_secret ||
      !stripeReady ||
      !stripePublishableKey ||
      !checkoutHost.current
    ) {
      return;
    }

    let cancelled = false;

    async function mountCheckout() {
      try {
        const stripe = window.Stripe?.(stripePublishableKey);
        if (!stripe) throw new Error("Stripe could not be loaded.");

        const instance = await stripe.initEmbeddedCheckout({
          clientSecret: checkout!.checkout_client_secret,
          onComplete: () => {
            checkoutInstance.current?.destroy();
            checkoutInstance.current = null;
            setComplete(true);
          },
        });

        if (cancelled || !checkoutHost.current) {
          instance.destroy();
          return;
        }

        checkoutInstance.current = instance;
        instance.mount(checkoutHost.current);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not load the payment form.",
        );
      }
    }

    void mountCheckout();

    return () => {
      cancelled = true;
      checkoutInstance.current?.destroy();
      checkoutInstance.current = null;
    };
  }, [checkout, previewMode, stripePublishableKey, stripeReady]);

  function editDetails() {
    checkoutInstance.current?.destroy();
    checkoutInstance.current = null;
    setCheckout(null);
    setSubmitted(null);
    setComplete(false);
    setError("");
  }

  function startAnother() {
    editDetails();
    setForm(initialForm);
  }

  const paymentView = checkout && submitted ? { checkout, submitted } : null;

  return (
    <main className={styles.page}>
      <Script
        src="https://js.stripe.com/v3/"
        strategy="afterInteractive"
        onLoad={() => setStripeReady(true)}
        onReady={() => setStripeReady(true)}
      />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Image src="/detailengine-mark.png" alt="" width={34} height={34} priority />
          <span>DETAILENGINE</span>
        </div>
        <span className={styles.pageName}>New client setup</span>
      </header>

      <section className={styles.card}>
        {complete ? (
          <div className={styles.complete}>
            <div className={styles.check}>✓</div>
            <h1>Payment received</h1>
            <p>
              We are creating {submitted?.businessName || "the client"} and sending
              the setup invitation to {submitted?.email}.
            </p>
            <button className={styles.secondary} type="button" onClick={startAnother}>
              Start another client
            </button>
          </div>
        ) : paymentView ? (
          <div className={styles.payment}>
            <div className={styles.sectionHeading}>
              <div>
                <h1>Payment</h1>
                <p>{paymentView.submitted.businessName} · {paymentView.submitted.email}</p>
              </div>
              <button className={styles.textButton} type="button" onClick={editDetails}>
                Edit details
              </button>
            </div>

            <div className={styles.order}>
              <span>Setup &amp; implementation</span>
              <strong>$1,000 CAD</strong>
            </div>

            {paymentView.checkout.reused && (
              <div className={styles.notice}>
                The open payment session for this client was reused.
              </div>
            )}

            {previewMode ? (
              <div className={styles.previewPayment} aria-label="Stripe payment form preview">
                <span>Card information</span>
                <div>1234 1234 1234 1234</div>
                <div className={styles.previewRow}><span>MM / YY</span><span>CVC</span></div>
                <span>Cardholder name</span>
                <div>Full name on card</div>
                <button type="button" disabled>Pay $1,000 CAD</button>
                <small>Visual preview only — no payment is created.</small>
              </div>
            ) : (
              <>
                {!stripePublishableKey && (
                  <div className={styles.error} role="alert">
                    Stripe is not configured for this environment.
                  </div>
                )}
                <div ref={checkoutHost} className={styles.checkoutHost} />
              </>
            )}

            {error && <div className={styles.error} role="alert">{error}</div>}
            <p className={styles.secure}>Secure payment form provided by Stripe.</p>
          </div>
        ) : (
          <>
            <div className={styles.sectionHeading}>
              <div>
                <h1>Client details</h1>
                <p>Enter the information for the new client.</p>
              </div>
            </div>

            <form onSubmit={continueToPayment} className={styles.form}>
              <label>
                <span>Business name</span>
                <input
                  autoFocus
                  required
                  maxLength={160}
                  autoComplete="organization"
                  value={form.businessName}
                  onChange={(event) => update("businessName", event.target.value)}
                />
              </label>

              <div className={styles.row}>
                <label>
                  <span>Client full name</span>
                  <input
                    required
                    maxLength={120}
                    autoComplete="name"
                    value={form.fullName}
                    onChange={(event) => update("fullName", event.target.value)}
                  />
                </label>
                <label>
                  <span>Client email</span>
                  <input
                    required
                    maxLength={254}
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                  />
                </label>
              </div>

              <label>
                <span>Primary market</span>
                <input
                  required
                  maxLength={160}
                  autoComplete="address-level2"
                  placeholder="Tampa, Florida"
                  value={form.location}
                  onChange={(event) => update("location", event.target.value)}
                />
              </label>

              <div className={styles.order}>
                <span>Setup &amp; implementation</span>
                <strong>$1,000 CAD</strong>
              </div>

              {error && <div className={styles.error} role="alert">{error}</div>}

              <button className={styles.primary} disabled={busy}>
                {busy ? "Loading payment…" : "Continue to payment"}
              </button>
            </form>
          </>
        )}
      </section>

      <span className={styles.signedIn}>
        Signed in as {staffEmail || staffName}
      </span>
    </main>
  );
}
