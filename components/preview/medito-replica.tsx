"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { meditoCaptures, meditoSections, meditoSectionForStep, validMeditoDemoEmail } from "@/lib/preview/medito-captures";
import styles from "./medito-replica.module.css";

function bounds(x: number, y: number, width: number, height: number): CSSProperties {
  return { left: `${x / 10.8}%`, top: `${y / 24}%`, width: `${width / 10.8}%`, height: `${height / 24}%` };
}

export function MeditoReplica({ screenshots }: { screenshots: Record<number, string> }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [note, setNote] = useState("");
  const [showTargets, setShowTargets] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const current = meditoCaptures[step - 1];
  const section = meditoSectionForStep(step);
  const emailScreen = step >= 2 && step <= 4;
  const codeScreen = [5, 6, 8].includes(step);
  const emailValid = validMeditoDemoEmail(email);
  const codeValid = /^\d{6}$/.test(code);

  const go = (next: number) => {
    if (next === step) return;
    setHistory((previous) => [...previous, step]);
    setStep(next); setNote(""); setImageReady(false); setImageFailed(false);
  };
  const back = () => {
    const previous = history.at(-1);
    if (previous === undefined) return;
    setHistory((items) => items.slice(0, -1));
    setStep(previous); setNote(""); setImageReady(false); setImageFailed(false);
  };
  const unavailable = (name: string) => setNote(`${name} wasn’t captured. The preview stays on the recorded screen.`);
  const reset = () => {
    if (step !== 1) setImageReady(false);
    setStep(1); setHistory([]); setEmail(""); setCode(""); setEditingEmail(false); setEditingCode(false); setNote(""); setImageFailed(false);
  };
  useEffect(() => {
    const background = document.body.style.background;
    document.body.style.background = "transparent";
    const syncTheme = (event: StorageEvent) => {
      if (event.key === "theme") document.documentElement.classList.toggle("dark", event.newValue === "dark");
    };
    window.addEventListener("storage", syncTheme);
    return () => { document.body.style.background = background; window.removeEventListener("storage", syncTheme); };
  }, []);
  useEffect(() => {
    // Warm just the next recorded image; preserve the original capture bytes and aspect ratio.
    if (screenshots[step + 1]) { const image = new Image(); image.src = screenshots[step + 1]; }
  }, [step, screenshots]);

  const hit = (label: string, x: number, y: number, width: number, height: number, action: () => void) => (
    <button key={label} type="button" className={styles.hit} style={bounds(x, y, width, height)} aria-label={label} title={label} onClick={action} disabled={!imageReady} />
  );
  const capturedButton = (label: string, x: number, y: number, width: number, height: number, disabled: boolean, action: () => void) => (
    <button type="button" className={styles.formContinue} style={bounds(x, y, width, height)} disabled={disabled || !imageReady} onClick={action}>{label}</button>
  );

  return <main className={styles.stage}>
    <aside className={styles.intro}>
      <p className={styles.eyebrow}>Captured preview</p>
      <h1>Medito</h1>
      <p>Explore the captured onboarding and home experience, at your own pace.</p>
      <p className={styles.scope}>Original screen captures with simulated controls. No emails, accounts, reminders or payments are created.</p>
    </aside>

    <div className={styles.deviceColumn}>
      <div className={`${styles.phone} ${showTargets ? styles.showTargets : ""}`} aria-label={`Medito screen ${step}: ${current.label}`}>
        {/* Source pixels are retained so illustrations, typography, spacing and Android chrome match the capture. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={`${step}-${imageAttempt}`} src={screenshots[step]} alt={`Captured Medito screen: ${current.label}`} draggable={false} onLoad={() => setImageReady(true)} onError={() => setImageFailed(true)} />
        {!imageReady && <div className={styles.loading} role="status">{imageFailed ? <><span>Capture couldn’t load.</span><button onClick={() => { setImageFailed(false); setImageAttempt((value) => value + 1); }}>Retry</button></> : "Loading capture…"}</div>}

        {step === 1 && <>
          {hit("Get started", 84, 1458, 912, 142, () => go(9))}
          {hit("Sign in or sign up", 190, 1620, 700, 115, () => go(2))}
        </>}
        {(emailScreen || codeScreen) && hit("Back", 20, 140, 130, 140, back)}
        {emailScreen && <>
          <input ref={emailRef} className={`${styles.field} ${editingEmail ? styles.editing : styles.capturedField}`} style={bounds(88, 1280, 904, 126)} type="email" aria-label="Email" autoComplete="off" placeholder="Email" value={email}
            onFocus={() => setEditingEmail(true)} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && emailValid) { setEditingCode(true); go(5); } }} disabled={!imageReady} />
          {editingEmail ? capturedButton("Continue", 84, 1452, 912, 126, !emailValid, () => { setEditingCode(true); go(5); }) : hit("Continue", 84, 1452, 912, 126, () => { if (step > 2) go(5); else emailRef.current?.focus(); })}
          {hit("Terms of Service", 625, 1625, 290, 50, () => unavailable("Terms of Service"))}
          {hit("Privacy Policy", 390, 1676, 300, 50, () => unavailable("Privacy Policy"))}
        </>}
        {codeScreen && <>
          {editingCode && email && <div className={styles.verificationCopy} style={bounds(84, 886, 912, 195)}>Enter the code we just sent to<strong>{email}</strong></div>}
          <input ref={codeRef} className={`${styles.field} ${editingCode ? styles.editing : styles.capturedField}`} style={bounds(88, 1174, 904, 130)} inputMode="numeric" maxLength={6} aria-label="Verification code" autoComplete="off" placeholder="Enter verification code" value={code}
            onFocus={() => setEditingCode(true)} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => { if (event.key === "Enter" && codeValid) go(9); }} disabled={!imageReady} />
          {editingCode && <span className={styles.counter} style={bounds(880, 1330, 90, 45)}>{code.length}/6</span>}
          {editingCode ? capturedButton("Continue", 84, 1410, 912, 126, !codeValid, () => go(9)) : hit("Continue", 84, 1410, 912, 126, () => step === 8 ? go(9) : codeRef.current?.focus())}
          {hit("Resend code", 150, 1580, 780, 100, () => setNote("Demo only. No email was sent. You can enter any six digits to explore the next captured screen."))}
        </>}
        {step === 7 && <>
          {hit("Back to verification", 20, 140, 130, 140, () => go(6))}
          {hit("Copy captured code", 70, 700, 320, 105, () => { setCode("983037"); setEditingCode(true); go(8); setNote("Captured demo code filled locally. This does not verify an account."); })}
        </>}
        {step === 9 && ["I have a regular practice", "A little, here and there", "Never tried it"].map((label, index) => hit(label, 64, 970 + index * 185, 952, 154, () => go(10)))}
        {step === 10 && <>
          {["Morning, 7:00 AM", "Evening, 9:00 PM", "Night, 10:00 PM"].map((label, index) => hit(label, 84 + index * 314, 1410, 288, 238, () => { go(11); setNote("Reminder choice simulated locally. No notification is scheduled."); }))}
          {hit("Pick my own time", 84, 1670, 912, 110, () => unavailable("The custom reminder time picker"))}
          {hit("Skip for Now", 270, 1910, 540, 155, () => go(11))}
        </>}
        {step === 11 && <>
          {hit("Start first meditation", 105, 1235, 870, 155, () => unavailable("Meditation playback"))}
          {hit("Maybe later", 230, 1490, 620, 145, () => go(12))}
        </>}
        {step === 12 && hit("See how to help", 84, 1980, 912, 145, () => go(14))}
        {step === 13 && hit("View captured home", 0, 0, 1080, 2400, () => go(15))}
        {step === 14 && <>
          {hit("Close donation appeal", 925, 150, 135, 130, () => go(15))}
          {["Monthly", "Yearly"].map((label, i) => hit(label, 65 + i * 475, 1050, 470, 130, () => i === 0 ? setNote("The captured donation screen shows monthly amounts.") : unavailable("Yearly donation amounts")))}
          {["$2", "$3", "$5", "$10"].map((label, i) => hit(label, 65 + (i % 2) * 475, 1260 + Math.floor(i / 2) * 170, 460, 140, () => label === "$10" ? setNote("The capture has $10 selected. No payment is made in this preview.") : unavailable(`The ${label} selected donation state`)))}
          {hit("Support Medito", 65, 1925, 950, 155, () => unavailable("Donation checkout"))}
          {hit("Other donation amount", 65, 1740, 950, 140, () => unavailable("Custom donation amount entry"))}
        </>}
        {step === 15 && hit("Dismiss welcome message", 720, 650, 270, 140, () => go(16))}
        {(step === 15 || step === 16) && <>
          {step === 16 && <>
            {hit("Play Welcome course", 910, 1015, 140, 170, () => unavailable("Welcome course playback"))}
            {["Your Daily", "Downloads", "Timer", "Sleep", "Challenges", "Emergency", "Favorites", "Course"].map((label, i) => hit(label, 40 + i % 4 * 265, 1250 + Math.floor(i / 4) * 330, 240, 305, () => unavailable(label)))}
            {hit("Featured content", 40, 1920, 1010, 280, () => unavailable("Featured content details"))}
          </>}
          {["Home", "Explore", "Search", "Settings"].map((label, i) => hit(label, i * 270, 2200, 270, 150, () => i === 0 ? go(16) : unavailable(`${label} screens`)))}
        </>}
      </div>
      <div className={styles.transport} aria-label="Captured screen navigation">
        <button aria-label="Previous captured screen" disabled={step === 1} onClick={() => go(step - 1)}><ArrowLeft size={15} /></button>
        <span>{String(step).padStart(2, "0")} / 16 <b>{current.label}</b></span>
        <button aria-label="Next captured screen" disabled={step === 16} onClick={() => go(step + 1)}><ArrowRight size={15} /></button>
      </div>
    </div>

    <aside className={styles.navigation}>
      <p className={styles.eyebrow}>Explore the capture</p>
      <nav aria-label="Medito preview sections">
        {meditoSections.map((item) => <button key={item.step} aria-current={section === item.step ? "page" : undefined} onClick={() => go(item.step)}>{item.label}<ArrowRight size={13} /></button>)}
      </nav>
      <div className={styles.utilities}>
        <button onClick={reset}><RotateCcw size={13} />Restart</button>
        <button aria-pressed={showTargets} onClick={() => setShowTargets((shown) => !shown)}>Show tap targets</button>
      </div>
      <p className={styles.caption}>Use the arrows to inspect all 16 original captures, including the email detour and loading state.</p>
      {note && <div className={styles.note} role="status">{note}<button aria-label="Dismiss preview note" onClick={() => setNote("")}>×</button></div>}
    </aside>
  </main>;
}
