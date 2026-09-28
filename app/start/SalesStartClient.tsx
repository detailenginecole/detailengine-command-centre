"use client";

import Image from "next/image";
import Script from "next/script";
import { type FormEvent, useEffect, useRef, useState } from "react";
import styles from "./start.module.css";

type PaymentMode = "embedded" | "hosted";

type CheckoutResult = {
  checkout_client_secret?: string;
  checkout_url?: string;
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

const previewCheckoutUrl =
  "https://checkout.stripe.com/c/pay/cs_live_detailengine_preview";

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
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHostedPreview, setShowHostedPreview] = useState(false);
  const [error, setError] = useState("");
  const checkoutHost = useRef<HTMLDivElement>(null);
  const checkoutInstance = useRef<EmbeddedCheckout | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function continueToPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted({ ...form });
    setPaymentMode(null);
    setCheckout(null);
    setComplete(false);
    setError("");
  }

  async function choosePayment(mode: PaymentMode) {
    if (!submitted) return;

    setBusy(true);
    setPaymentMode(mode);
    setCheckout(null);
    setError("");
    setCopied(false);
    setShowHostedPreview(false);

    if (previewMode) {
      setCheckout(
        mode === "embedded"
          ? {
              checkout_client_secret: "preview",
              setup_intent_id: "preview",
            }
          : {
              checkout_url: previewCheckoutUrl,
              setup_intent_id: "preview",
            },
      );
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/start-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: submitted.businessName,
          full_name: submitted.fullName,
          email: submitted.email,
          niche: "Auto detailing",
          general_location: submitted.location,
          timezone: "America/New_York",
          checkout_mode: mode,
        }),
      });
      const payload = await response.json();
      const expectedResult =
        mode === "embedded"
          ? payload?.checkout_client_secret
          : payload?.checkout_url;

      if (!response.ok || !expectedResult) {
        throw new Error(payload?.error || "Could not start the payment.");
      }
      setCheckout(payload);
    } catch (caught) {
      setPaymentMode(null);
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
      paymentMode !== "embedded" ||
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
          clientSecret: checkout!.checkout_client_secret!,
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
  }, [
    checkout,
    paymentMode,
    previewMode,
    stripePublishableKey,
    stripeReady,
  ]);

  function changeMethod() {
    checkoutInstance.current?.destroy();
    checkoutInstance.current = null;
    setPaymentMode(null);
    setCheckout(null);
    setComplete(false);
    setCopied(false);
    setShowHostedPreview(false);
    setError("");
  }

  function editDetails() {
    changeMethod();
    setSubmitted(null);
  }

  function startAnother() {
    editDetails();
    setForm(initialForm);
  }

  async function copyPaymentLink() {
    if (!checkout?.checkout_url) return;
    await navigator.clipboard.writeText(checkout.checkout_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const paymentView =
    checkout && submitted && paymentMode
      ? { checkout, submitted, paymentMode }
      : null;
  const emailPaymentHref =
    paymentView?.paymentMode === "hosted" && paymentView.checkout.checkout_url
      ? `mailto:${encodeURIComponent(paymentView.submitted.email)}?subject=${encodeURIComponent(
          "DetailEngine setup payment",
        )}&body=${encodeURIComponent(
          `Hi ${paymentView.submitted.fullName},\n\nUse this secure Stripe link to pay the $1,000 CAD DetailEngine setup fee:\n\n${paymentView.checkout.checkout_url}\n\nYour account setup will begin after payment is confirmed.`,
        )}`
      : "";

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
        ) : paymentView?.paymentMode === "embedded" ? (
          <div className={styles.payment}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.stepLabel}>ENTER CARD HERE</span>
                <h1>Payment</h1>
                <p>{paymentView.submitted.businessName} · {paymentView.submitted.email}</p>
              </div>
              <button className={styles.textButton} type="button" onClick={changeMethod}>
                Change method
              </button>
            </div>

            <OrderSummary />

            {paymentView.checkout.reused && (
              <div className={styles.notice}>
                The open payment session for this client was reused.
              </div>
            )}

            {previewMode ? (
              <PaymentFormPreview note="Standard pathway — the client enters their card on this screen." />
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
        ) : paymentView?.paymentMode === "hosted" ? (
          <div className={styles.payment}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.stepLabel}>SEND PAYMENT LINK</span>
                <h1>Secure payment link</h1>
                <p>Send this link to {paymentView.submitted.email}.</p>
              </div>
              <button className={styles.textButton} type="button" onClick={changeMethod}>
                Change method
              </button>
            </div>

            <OrderSummary />

            {paymentView.checkout.reused && (
              <div className={styles.notice}>
                The open payment session for this client was reused.
              </div>
            )}

            <div className={styles.linkBox}>
              <span>Stripe Checkout link</span>
              <code>{paymentView.checkout.checkout_url}</code>
            </div>

            <div className={styles.linkActions}>
              <button className={styles.primary} type="button" onClick={copyPaymentLink}>
                {copied ? "Link copied" : "Copy payment link"}
              </button>
              <a className={styles.secondary} href={emailPaymentHref}>
                Email payment link
              </a>
            </div>

            {previewMode ? (
              <button
                className={styles.outlineButton}
                type="button"
                onClick={() => setShowHostedPreview((current) => !current)}
              >
                {showHostedPreview ? "Hide client view" : "Preview what the client sees"}
              </button>
            ) : (
              <a
                className={styles.outlineButton}
                href={paymentView.checkout.checkout_url}
                target="_blank"
                rel="noreferrer"
              >
                Open secure payment page
              </a>
            )}

            {showHostedPreview && (
              <div className={styles.hostedPreview}>
                <div className={styles.hostedBar}>
                  <span>Client view</span>
                  <strong>checkout.stripe.com</strong>
                </div>
                <div className={styles.hostedBody}>
                  <div className={styles.hostedSummary}>
                    <span>DetailEngine</span>
                    <h2>$1,000 CAD</h2>
                    <p>Setup &amp; implementation</p>
                  </div>
                  <PaymentFormPreview note="Visual preview only — no payment is created." />
                </div>
              </div>
            )}

            <p className={styles.secure}>
              The client enters payment details directly on Stripe. The same
              verified-payment workflow creates their account and invitation.
            </p>
          </div>
        ) : submitted ? (
          <div className={styles.payment}>
            <div className={styles.sectionHeading}>
              <div>
                <h1>How will they pay?</h1>
                <p>{submitted.businessName} · $1,000 CAD</p>
              </div>
              <button className={styles.textButton} type="button" onClick={editDetails}>
                Edit details
              </button>
            </div>

            <div className={styles.choices}>
              <button
                className={styles.choice}
                type="button"
                disabled={busy}
                onClick={() => void choosePayment("embedded")}
              >
                <strong>Enter card here</strong>
                <span>Use Stripe’s secure payment form on this screen.</span>
              </button>
              <button
                className={styles.choice}
                type="button"
                disabled={busy}
                onClick={() => void choosePayment("hosted")}
              >
                <strong>Send secure payment link</strong>
                <span>Let the client pay privately on checkout.stripe.com.</span>
              </button>
            </div>

            {busy && <div className={styles.notice}>Creating the secure payment…</div>}
            {error && <div className={styles.error} role="alert">{error}</div>}
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

              <OrderSummary />

              {error && <div className={styles.error} role="alert">{error}</div>}

              <button className={styles.primary}>Continue to payment</button>
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

function OrderSummary() {
  return (
    <div className={styles.order}>
      <span>Setup &amp; implementation</span>
      <strong>$1,000 CAD</strong>
    </div>
  );
}

function PaymentFormPreview({ note }: { note: string }) {
  return (
    <div className={styles.previewPayment} aria-label="Stripe payment form preview">
      <span>Card information</span>
      <div>1234 1234 1234 1234</div>
      <div className={styles.previewRow}><span>MM / YY</span><span>CVC</span></div>
      <span>Cardholder name</span>
      <div>Full name on card</div>
      <button type="button" disabled>Pay $1,000 CAD</button>
      <small>{note}</small>
    </div>
  );
}
