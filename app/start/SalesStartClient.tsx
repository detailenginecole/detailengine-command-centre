"use client";

import Image from "next/image";
import { parseContractTerms } from "../lib/contract-terms";
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
  entityType: string;
  jurisdiction: string;
  businessAddress: string;
  signerTitle: string;
  phone: string;
  opportunityGoal: string;
  dailyBudget: string;
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
  location: "", entityType: "", jurisdiction: "", businessAddress: "", signerTitle: "", phone: "", opportunityGoal: "", dailyBudget: "",
};

const previewCheckoutUrl =
  "https://checkout.stripe.com/c/pay/cs_live_detailengine_preview";
const defaultSetupFeeCad = 1000;

function formatSetupFee(amountCad: number) {
  return `$${amountCad.toLocaleString("en-CA")}`;
}

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
  const [setupFeeCad, setSetupFeeCad] = useState(defaultSetupFeeCad);
  const [feeDraft, setFeeDraft] = useState(String(defaultSetupFeeCad));
  const [editingFee, setEditingFee] = useState(false);
  const [retainer, setRetainer] = useState(2500);
  const [retainerDraft, setRetainerDraft] = useState("2500");
  const [error, setError] = useState("");
  const checkoutHost = useRef<HTMLDivElement>(null);
  const checkoutInstance = useRef<EmbeddedCheckout | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function openFeeEditor() {
    setFeeDraft(String(setupFeeCad));
    setRetainerDraft(String(retainer));
    setEditingFee(true);
    setError("");
  }

  function saveSetupFee() {
    const next = Number(feeDraft);
    if (!Number.isInteger(next) || next < 1 || next > 100000) {
      setError("Enter a whole-dollar setup fee between $1 and $100,000.");
      return;
    }
    const nextRetainer = Number(retainerDraft);
    if (!Number.isInteger(nextRetainer) || nextRetainer < 1 || nextRetainer > 100000) {
      setError("Enter a whole-dollar retainer between $1 and $100,000 USD."); return;
    }
    setRetainer(nextRetainer);
    setSetupFeeCad(next);
    setEditingFee(false);
    setError("");
  }

  function continueToPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { contractTerms(form); } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the contract details."); return;
    }
    setSubmitted({ ...form });
    setPaymentMode(null);
    setCheckout(null);
    setComplete(false);
    setError("");
  }

  function contractTerms(values: FormState) {
    return parseContractTerms({
      version: 1, currency: "USD", legal_name: values.businessName,
      entity_type: values.entityType, jurisdiction: values.jurisdiction,
      business_address: values.businessAddress, signer_name: values.fullName,
      signer_title: values.signerTitle, signer_email: values.email, phone: values.phone,
      setup_amount_minor: setupFeeCad * 100, retainer_amount_minor: retainer * 100,
      opportunity_goal: Number(values.opportunityGoal),
      daily_budget_minor: Math.round(Number(values.dailyBudget) * 100),
    }, setupFeeCad * 100);
  }

  async function choosePayment(mode: PaymentMode) {
    if (!submitted) return;

    setBusy(true);
    setPaymentMode(mode);
    setCheckout(null);
    setError("");
    setCopied(false);
    setShowHostedPreview(false);
    setEditingFee(false);

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
          setup_amount_minor: setupFeeCad * 100,
          contract_terms: contractTerms(submitted),
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
    setRetainer(2500);
    setRetainerDraft("2500");
    setSetupFeeCad(defaultSetupFeeCad);
    setFeeDraft(String(defaultSetupFeeCad));
    setEditingFee(false);
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
          `Hi ${paymentView.submitted.fullName},\n\nUse this secure Stripe link to pay the ${formatSetupFee(setupFeeCad)} DetailEngine setup fee:\n\n${paymentView.checkout.checkout_url}\n\nYour account setup will begin after payment is confirmed.`,
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
        <div className={styles.topbarActions}>
          <span className={styles.pageName}>New client setup</span>
          <button
            className={styles.settingsButton}
            type="button"
            aria-label="Settings"
            aria-expanded={editingFee}
            disabled={Boolean(checkout) || busy || complete}
            onClick={() => {
              if (editingFee) {
                setEditingFee(false);
                setError("");
              } else {
                openFeeEditor();
              }
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 8.75A3.25 3.25 0 1 0 12 15.25 3.25 3.25 0 0 0 12 8.75Z" />
              <path d="M19.1 13.1a7.5 7.5 0 0 0 0-2.2l1.55-1.2-1.75-3.03-1.83.74a7.8 7.8 0 0 0-1.9-1.1L14.9 4.35h-3.5l-.27 1.96a7.8 7.8 0 0 0-1.9 1.1L7.4 6.67 5.65 9.7l1.55 1.2a7.5 7.5 0 0 0 0 2.2l-1.55 1.2 1.75 3.03 1.83-.74a7.8 7.8 0 0 0 1.9 1.1l.27 1.96h3.5l.27-1.96a7.8 7.8 0 0 0 1.9-1.1l1.83.74 1.75-3.03-1.55-1.2Z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
        {editingFee && !checkout && !complete && (
          <div className={styles.settingsPanel} role="dialog" aria-label="Setup settings">
            <strong>Fees in USD</strong>
            <label><span>Retainer per cycle (USD)</span><input type="number" min={1} max={100000} step={1} value={retainerDraft} onChange={event => setRetainerDraft(event.target.value)} /></label>
            <FeeEditor
              value={feeDraft}
              onChange={setFeeDraft}
              onSave={saveSetupFee}
              onCancel={() => {
                setEditingFee(false);
                setError("");
              }}
            />
            {error && <div className={styles.error} role="alert">{error}</div>}
          </div>
        )}
      </header>

      <section className={styles.intro}>
        <h1>Let&apos;s get you started with DetailEngine.</h1>
      </section>

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

            <OrderSummary amountCad={setupFeeCad} />

            {paymentView.checkout.reused && (
              <div className={styles.notice}>
                The open payment session for this client was reused.
              </div>
            )}

            {previewMode ? (
              <PaymentFormPreview
                amountCad={setupFeeCad}
                note="Standard pathway — the client enters their card on this screen."
              />
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

            <OrderSummary amountCad={setupFeeCad} />

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
                    <h2>{formatSetupFee(setupFeeCad)}</h2>
                    <p>Setup &amp; implementation</p>
                  </div>
                  <PaymentFormPreview
                    amountCad={setupFeeCad}
                    note="Visual preview only — no payment is created."
                  />
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
                <p>{submitted.businessName} · {formatSetupFee(setupFeeCad)}</p>
              </div>
              <button className={styles.textButton} type="button" onClick={editDetails}>
                Edit details
              </button>
            </div>

            <OrderSummary amountCad={setupFeeCad} />

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
                <span>Legal business name</span>
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

              <div className={styles.row}>
                <label><span>Business entity type</span><input required maxLength={80} placeholder="LLC, corporation, sole proprietor" value={form.entityType} onChange={e => update("entityType", e.target.value)} /></label>
                <label><span>Formation state / jurisdiction</span><input required maxLength={120} value={form.jurisdiction} onChange={e => update("jurisdiction", e.target.value)} /></label>
              </div>
              <label><span>Client business address</span><input required maxLength={500} autoComplete="street-address" value={form.businessAddress} onChange={e => update("businessAddress", e.target.value)} /></label>
              <div className={styles.row}>
                <label><span>Authorized signer title</span><input required maxLength={120} value={form.signerTitle} onChange={e => update("signerTitle", e.target.value)} /></label>
                <label><span>Client telephone</span><input required type="tel" maxLength={40} value={form.phone} onChange={e => update("phone", e.target.value)} /></label>
              </div>
              <div className={styles.row}>
                <label><span>Transfer opportunity goal</span><input required type="number" min={1} max={1000000} step={1} inputMode="numeric" value={form.opportunityGoal} onChange={e => update("opportunityGoal", e.target.value)} /></label>
                <label><span>Daily advertising budget (USD)</span><input required type="number" min={0.01} max={100000} step={0.01} inputMode="decimal" value={form.dailyBudget} onChange={e => update("dailyBudget", e.target.value)} /></label>
              </div>
              <div className={styles.order}><span>Retainer per completed cycle</span><strong>{formatSetupFee(retainer)} USD</strong></div>
              <p>The retainer is not charged with setup. The client signs the agreement at the end of onboarding.</p>
              <OrderSummary amountCad={setupFeeCad} />

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

function OrderSummary({ amountCad }: { amountCad: number }) {
  return (
    <div className={styles.order}>
      <span>Setup &amp; implementation</span>
      <strong>{formatSetupFee(amountCad)}</strong>
    </div>
  );
}

function FeeEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.feeEditor}>
      <label>
        <span>Setup fee</span>
        <input
          type="number"
          min={1}
          max={100000}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button className={styles.textButton} type="button" onClick={onSave}>
        Done
      </button>
      <button className={styles.textButton} type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function PaymentFormPreview({
  amountCad,
  note,
}: {
  amountCad: number;
  note: string;
}) {
  return (
    <div className={styles.previewPayment} aria-label="Stripe payment form preview">
      <span>Card information</span>
      <div>1234 1234 1234 1234</div>
      <div className={styles.previewRow}><span>MM / YY</span><span>CVC</span></div>
      <span>Cardholder name</span>
      <div>Full name on card</div>
      <button type="button" disabled>Pay {formatSetupFee(amountCad)}</button>
      <small>{note}</small>
    </div>
  );
}
