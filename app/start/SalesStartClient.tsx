"use client";

import Image from "next/image";
import { type FormEvent, useMemo, useState } from "react";
import styles from "./start.module.css";

type CheckoutResult = {
  checkout_url: string;
  setup_intent_id: string;
  reused?: boolean;
};

type FormState = {
  businessName: string;
  fullName: string;
  email: string;
  location: string;
};

const initialForm: FormState = {
  businessName: "",
  fullName: "",
  email: "",
  location: "",
};

export function SalesStartClient({
  staffName,
  staffEmail,
}: {
  staffName: string;
  staffEmail: string;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const firstName = useMemo(
    () => staffName.trim().split(/\s+/)[0] || "there",
    [staffName],
  );

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setCheckout(null);
  }

  async function createCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCheckout(null);

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
      if (!response.ok || !payload?.checkout_url) {
        throw new Error(payload?.error || "Could not create the payment link.");
      }
      setCheckout(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create the payment link.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!checkout?.checkout_url) return;
    await navigator.clipboard.writeText(checkout.checkout_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function startAnother() {
    setForm(initialForm);
    setCheckout(null);
    setError("");
    setCopied(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a href="/" className={styles.brand} aria-label="DetailEngine Command Centre">
          <Image src="/detailengine-mark.png" alt="" width={38} height={38} priority />
          <span>DETAILENGINE</span>
        </a>
        <div className={styles.staff}>
          <span>Signed in as</span>
          <strong>{staffEmail || staffName}</strong>
        </div>
      </header>

      <div className={styles.shell}>
        <section className={styles.intro}>
          <span className={styles.eyebrow}>CLIENT START</span>
          <h1>Turn the yes into a started client.</h1>
          <p>
            Enter the client’s details once. We’ll create their secure
            $1,000 CAD setup checkout. After Stripe confirms payment,
            DetailEngine creates the business, gives the owner portal access,
            and sends their setup invitation.
          </p>

          <ol className={styles.steps}>
            <li><b>1</b><span><strong>Create checkout</strong><small>Confirm the buyer and business details.</small></span></li>
            <li><b>2</b><span><strong>Client pays Stripe</strong><small>Open the secure page or send its link.</small></span></li>
            <li><b>3</b><span><strong>Onboarding begins</strong><small>Account, access, and invitation are created automatically.</small></span></li>
          </ol>

          <div className={styles.security}>
            <span>SECURE HANDOFF</span>
            <p>Card details are entered only on Stripe Checkout—not in this tool.</p>
          </div>
        </section>

        <section className={styles.card}>
          {!checkout ? (
            <>
              <div className={styles.cardHeading}>
                <span>Welcome, {firstName}</span>
                <h2>Start a new client</h2>
                <p>Use the buyer’s real email. It becomes the initial portal owner.</p>
              </div>

              <form onSubmit={createCheckout} className={styles.form}>
                <label>
                  <span>Business name</span>
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    autoComplete="organization"
                    placeholder="Example Auto Spa"
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
                      placeholder="Jordan Smith"
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
                      placeholder="jordan@business.com"
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
                  <small>Florida clients use Eastern Time by default.</small>
                </label>

                <div className={styles.order}>
                  <div>
                    <span>DetailEngine Setup &amp; Implementation</span>
                    <small>One-time setup fee · charged by Stripe</small>
                  </div>
                  <strong>$1,000 CAD</strong>
                </div>

                {error && <div className={styles.error} role="alert">{error}</div>}

                <button className={styles.primary} disabled={busy}>
                  {busy ? <><i className={styles.spinner} /> Creating secure checkout…</> : <>Create secure checkout <span>→</span></>}
                </button>
              </form>
            </>
          ) : (
            <div className={styles.success}>
              <div className={styles.check}>✓</div>
              <span className={styles.eyebrow}>PAYMENT LINK READY</span>
              <h2>{form.businessName}</h2>
              <p>
                This checkout is tied to <strong>{form.email}</strong>. Payment
                will trigger account creation and the owner invitation.
              </p>

              {checkout.reused && (
                <div className={styles.notice}>An existing open checkout was reused so the client cannot be charged twice.</div>
              )}

              <a
                className={styles.primary}
                href={checkout.checkout_url}
                target="_blank"
                rel="noreferrer"
              >
                Open secure payment <span>↗</span>
              </a>
              <button className={styles.secondary} type="button" onClick={copyLink}>
                {copied ? "Payment link copied" : "Copy payment link"}
              </button>

              <div className={styles.afterPayment}>
                <strong>After payment</strong>
                <p>Stripe confirms the charge, then Supabase creates the client in onboarding and sends “Get started with DetailEngine.”</p>
              </div>

              <button className={styles.textButton} type="button" onClick={startAnother}>
                Start another client
              </button>
            </div>
          )}
        </section>
      </div>

      {busy && (
        <div className={styles.working} role="status" aria-live="polite">
          <i className={styles.spinner} />
          <span>Creating a secure Stripe checkout…</span>
        </div>
      )}
    </main>
  );
}
