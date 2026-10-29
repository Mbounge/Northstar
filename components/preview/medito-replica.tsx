"use client";

import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Wifi, BatteryFull, TriangleAlert, Bell, Settings, Circle } from "lucide-react";
import localFont from "next/font/local";
import { validMeditoDemoEmail } from "@/lib/preview/medito-captures";
import { initialMeditoSimulation, meditoActiveSection, meditoSimulationReducer, meditoSimulationSections } from "@/lib/preview/medito-simulation";
import styles from "./medito-replica.module.css";

const art = "/medito-replica/art/";
const meditoFont = localFont({
  src: [
    { path: "../../public/medito-replica/fonts/GoogleSans-Regular.woff2", weight: "400" },
    { path: "../../public/medito-replica/fonts/GoogleSans-Medium.woff2", weight: "500 600" },
    { path: "../../public/medito-replica/fonts/GoogleSans-Bold.woff2", weight: "700 900" },
  ],
  variable: "--medito-sans", display: "swap",
});
function Icon({ name, size = 24 }: { name: string; size?: number }) {
  // Artwork assets only; text, controls and application layout are native components.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.icon} src={`${art}icons/${name}.svg`} alt="" width={size} height={size} draggable={false} />;
}
function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className={styles.logo}><img src={`${art}ic_logo.svg`} alt="" draggable={false} /></span>;
}
function HeaderArtwork({ name, className = "" }: { name: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`${styles.headerArtwork} ${className}`} src={`${art}${name}.png`} alt="" draggable={false} />;
}

export function MeditoReplica({ screenshots, demoCode, embedded = false }: { screenshots: Record<number, string>; demoCode: string; embedded?: boolean }) {
  const [state, dispatch] = useReducer(meditoSimulationReducer, undefined, initialMeditoSimulation);
  const [note, setNote] = useState("");
  const [scale, setScale] = useState(embedded ? 1 : 280 / 360);
  const phoneRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { screen } = state;
  const send = (action: Parameters<typeof dispatch>[0]) => { setNote(""); dispatch(action); };
  const boundary = (feature: string) => setNote(`${feature} is beyond the recorded screens. This preview covers the captured onboarding and Home experience.`);
  useEffect(() => {
    const phone = phoneRef.current;
    if (!phone) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 360));
    observer.observe(phone);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const background = document.body.style.background;
    if (window.parent !== window) document.body.style.background = "transparent";
    const sync = (event: StorageEvent) => { if (event.key === "theme") document.documentElement.classList.toggle("dark", event.newValue === "dark"); };
    window.addEventListener("storage", sync);
    return () => { document.body.style.background = background; window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [screen]);
  useEffect(() => {
    if (screen !== "loading") return;
    const timeout = window.setTimeout(() => dispatch({ type: "loaded" }), 650);
    return () => window.clearTimeout(timeout);
  }, [screen]);
  useEffect(() => {
    if (!embedded || window.parent === window) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== "northstar:medito-preview-navigate") return;
      const destination = meditoSimulationSections.find(section => section.screen === event.data.section);
      if (destination) { setNote(""); dispatch({ type: "navigate", screen: destination.screen }); }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [embedded]);
  useEffect(() => {
    if (embedded && window.parent !== window) window.parent.postMessage({ type: "northstar:medito-preview-section", section: meditoActiveSection(screen) }, window.location.origin);
  }, [embedded, screen]);
  const nativeBack = <button type="button" className={styles.nativeBack} aria-label="Back" onClick={() => send({ type: "back" })}><Icon name="arrow-left" /></button>;
  const primary = (label: string, action: () => void, disabled = false) => <button type="button" className={styles.primary} disabled={disabled} onClick={action}>{label}</button>;
  const progress = (step: number) => <div className={styles.progress}><div><i style={{ width: `${step / 3 * 100}%` }} /></div><span>Step {step} of 3</span></div>;
  const footer = <div className={styles.legal}>By continuing, you agree to our <button type="button" onClick={() => boundary("Terms of Service")}>Terms of Service</button> and <button type="button" onClick={() => boundary("Privacy Policy")}>Privacy Policy</button></div>;
  const homeTiles = [["Your Daily", "sun-light"], ["Downloads", "arrow-down-circle"], ["Timer", "timer"], ["Sleep", "moon-sat"], ["Challenges", "medal"], ["Emergency", "pharmacy-cross-circle"], ["Favorites", "star"], ["Course", "brain"]];
  let body: ReactNode;

  switch (screen) {
    case "welcome": body = <div className={styles.welcome}>
      <div className={styles.wordmark}><Logo /><b>Medito</b></div>
      <h1>Meditation Made<br />Simple</h1><p>Free forever. No ads. Not-for-profit.</p>
      <div className={styles.welcomeActions}>{primary("Get started", () => send({ type: "navigate", screen: "experience" }))}<button className={styles.textButton} onClick={() => send({ type: "navigate", screen: "email" })}>Sign in or sign up</button></div>
      <HeaderArtwork name="welcome-landscape" className={styles.welcomeArtwork} />
    </div>; break;
    case "email": body = <div className={styles.account}>
      {nativeBack}<div className={styles.benefits}>• Track your mindfulness journey<br />• Never lose your meditation<br />&nbsp;&nbsp;progress<br />• Build a lasting meditation practice<br /><span>💜</span></div>
      <form className={styles.emailForm} onSubmit={(event) => { event.preventDefault(); send({ type: "submitEmail" }); }}>
        <p>We’ll send you a code by email to verify your account</p>
        <div className={styles.inputWrap}><input aria-label="Email" type="email" autoComplete="off" placeholder="Email" value={state.email} onChange={(event) => send({ type: "email", value: event.target.value })} /><button type="button" className={styles.clearField} hidden={!state.email} aria-label="Clear email" onClick={() => send({ type: "email", value: "" })}>×</button></div>
        <button className={styles.primary} type="submit" disabled={!validMeditoDemoEmail(state.email)}>Continue</button>{footer}
      </form>
    </div>; break;
    case "verify": body = <div className={styles.account}>
      {nativeBack}<form className={styles.codeForm} onSubmit={(event) => { event.preventDefault(); if (state.code !== demoCode) setNote("Use the demo code in the preview controls to continue. No real account verification takes place."); dispatch({ type: "submitCode", expected: demoCode }); }}>
        <h2>Enter the code we just sent to<strong>{state.email || "your email address"}</strong></h2>
        <div className={styles.inputWrap}><input aria-label="Verification code" inputMode="numeric" autoComplete="off" placeholder="Enter verification code" maxLength={6} value={state.code} onChange={(event) => send({ type: "code", value: event.target.value })} /></div>
        <span className={styles.codeCount}>{state.code.length}/6</span><button type="submit" className={styles.primary} disabled={state.code.length !== 6}>Continue</button>
        <button type="button" className={styles.resend} onClick={() => { dispatch({ type: "code", value: "" }); setNote("Demo code is ready in the preview controls. No email has been sent."); }}>Didn’t get the code? Resend it</button>
      </form>
    </div>; break;
    case "experience": body = <div className={styles.onboarding}>
      <HeaderArtwork name="open_awareness" />
      <section className={styles.experience}><h2>Have you meditated before?</h2><p>This helps us show you the right starting point.</p><div>{["I have a regular practice", "A little, here and there", "Never tried it"].map((choice) => <button className={styles.option} key={choice} aria-pressed={state.experience === choice} onClick={() => send({ type: "experience", value: choice })}>{choice}</button>)}</div></section>{progress(1)}
    </div>; break;
    case "reminders": body = <div className={styles.onboarding}>
      <HeaderArtwork name="palouse_mindfulness_small" className={styles.reminderArtwork} />
      <h2 className={styles.reminderTitle}>Stay on Track with<br />Meditation Reminders</h2>
      <div className={styles.notificationOutline} /><div className={styles.notificationExample}><span><Logo /></span><div><small>MEDITO <i>now</i></small><b>A quieter mind starts here</b><p>Your daily breath is waiting. Just tap to begin.</p></div></div>
      <div className={styles.reminderChoices}><p>When will you meditate?</p><div>{[["Morning", "7:00 AM", "sun-light"], ["Evening", "9:00 PM", "bell"], ["Night", "10:00 PM", "moon-sat"]].map(([label, time, icon]) => <button key={label} aria-pressed={state.reminder === time} onClick={() => send({ type: "reminder", value: time })}><Icon name={icon} size={20} /><span>{label}<br />{time}</span></button>)}</div><button className={styles.customTime} onClick={() => boundary("The custom reminder picker")}><Circle size={15} />Pick my own time</button></div>
      <button className={styles.skipReminder} onClick={() => send({ type: "skipReminder" })}>Skip for Now</button>{progress(2)}
    </div>; break;
    case "firstMeditation": body = <div className={styles.onboarding}>
      <HeaderArtwork name="palouse_mindfulness_small" /><section className={styles.firstMeditation}><h2>Your first moment of calm.</h2><div><h3>Your first meditation</h3><p><Circle size={12} />Just over 2 minutes</p><p>Nothing to get right. Just sit back and listen.</p>{primary("▶  Start", () => boundary("Meditation playback"))}</div><button className={styles.textButton} onClick={() => send({ type: "deferMeditation" })}>Maybe later</button></section>
    </div>; break;
    case "support": body = <div className={styles.onboarding}>
      <HeaderArtwork name="relationships" /><section className={styles.support}><h2>Millions find calm here for<br />free. Help keep it that way.</h2><p>Medito is run by a small nonprofit team — no ads, no investors, no paywalls. It stays free because people like you choose to support it.</p></section><div className={styles.supportAction}>{primary("See how to help", () => send({ type: "openSupport" }))}</div>{progress(3)}
    </div>; break;
    case "loading": body = <div className={styles.homeSkeleton} aria-label="Loading Home" role="status"><i /><div /><i /><section><b /><b /><b /><b /></section><div /></div>; break;
    case "donation": body = <div className={styles.donation}>
      <header><span><Logo />Medito Foundation</span><button type="button" aria-label="Close donation appeal" onClick={() => send({ type: "closeDonation" })}>×</button></header>
      <p className={styles.donationEyebrow}>HELP KEEP MEDITO FREE</p><h2>Keep meditation free<br /><em>for the next million</em></h2><p className={styles.donationIntro}>4.1 million people meditate with Medito for free. No ads, no paywalls — funded entirely by donors like you.</p>
      <div className={styles.billing}><button aria-pressed="true">Monthly</button><button aria-pressed="false" onClick={() => boundary("Yearly donation amounts")}>Yearly</button></div>
      <div className={styles.amounts}>{["2", "3", "5", "10"].map((value) => <button key={value} aria-pressed={state.donationAmount === value} onClick={() => send({ type: "donationAmount", value })}>{value === "10" && <small>Most popular</small>}${value}</button>)}</div>
      <p className={styles.donationSummary}>${Number(state.donationAmount) || 0}/month — that’s ${(Number(state.donationAmount) || 0) * 12}/year, or about ${((Number(state.donationAmount) || 0) / 30).toFixed(2)} a day. Less than a coffee a week.</p>
      <label className={styles.otherAmount}>$ <input aria-label="Other donation amount" inputMode="decimal" placeholder="Other amount (min $2)" value={["2", "3", "5", "10"].includes(state.donationAmount) ? "" : state.donationAmount} onChange={(event) => send({ type: "donationAmount", value: event.target.value })} /></label>
      <button className={styles.donateButton} disabled={!Number.isFinite(Number(state.donationAmount)) || Number(state.donationAmount) < 2} onClick={() => boundary("Donation checkout")}>Support Medito</button><div className={styles.paymentMarks}><img src="/medito-replica/art/payment-marks.png" alt="Google Pay, card and PayPal" /></div>{footer}
    </div>; break;
    case "home": body = <div className={styles.home}>
      <div className={styles.homeHero}>
        <div className={styles.homeArtwork} style={{ backgroundImage: `url("${screenshots[16]}")` }} aria-hidden="true" />
        <span className={styles.homeProgress}><Circle size={16} />0%</span><div className={styles.homeHeading}><small>START HERE · Getting started</small><h1>Welcome</h1><div><i /><span>0 of 4</span></div></div><button className={styles.playCourse} aria-label="Play Welcome course" onClick={() => boundary("Welcome course playback")}>▶</button>
      </div>
      <div className={styles.tiles}>{homeTiles.map(([label, icon]) => <button key={label} onClick={() => boundary(label)}><span><Icon name={icon} size={32} /></span><b>{label}</b></button>)}</div>
      <section className={styles.featured}><h2>Featured</h2><div>{[0, 1, 2].map((index) => <button key={index} aria-label={`Featured item ${index + 1}`} onClick={() => boundary("Featured content")} style={{ backgroundImage: `url("${screenshots[16]}")`, backgroundPosition: `${-index * 140 - 14}px -596px` }} />)}</div></section>
      {state.welcomeVisible && <div role="dialog" aria-label="Welcome to Medito" className={styles.homeWelcome}><span>📣</span><p>Welcome to Medito, a 100% free nonprofit meditation app! Start by exploring our course. Happy meditating! 🧘‍♂️</p><button onClick={() => send({ type: "dismissWelcome" })}>Dismiss</button></div>}
    </div>; break;
  }

  return <main data-medito-embedded={embedded ? "" : undefined} data-northstar-simulation-root={embedded ? "" : undefined} className={`${styles.stage} ${embedded ? styles.embedded : ""} ${meditoFont.variable}`}>
    <link rel="preload" as="image" href={screenshots[16]} />
    <aside className={styles.intro}><p className={styles.eyebrow}>Interactive preview</p><h1>Medito</h1><p>Try the recorded onboarding journey and explore its Home screen.</p><p className={styles.scope}>Simulated account entry. No real emails, payments or reminders are sent.</p></aside>
    <div className={styles.deviceColumn}><div ref={phoneRef} className={styles.phone}>
      <div data-northstar-simulation-viewport="" className={styles.viewport} style={{ zoom: scale } as CSSProperties} data-medito-screen={screen}>
        <div className={`${styles.statusBar} ${screen === "home" ? styles.homeStatus : ""} ${screen === "donation" || screen === "loading" ? styles.statusDark : ""}`} aria-hidden="true"><span>{screen === "welcome" || screen === "email" ? "9:48" : screen === "verify" ? "9:49" : screen === "home" || screen === "donation" || screen === "loading" ? "9:53" : "9:52"}<TriangleAlert size={12} fill="currentColor" /><Bell size={11} fill="currentColor" /><Settings size={12} /></span><span><Wifi size={15} fill="currentColor" /><i /><BatteryFull size={13} fill="currentColor" /></span></div>
        <div data-medito-scroll="" ref={scrollRef} className={styles.appScroll}>{body}</div>
        {screen === "home" && <nav className={styles.bottomNav} aria-label="Medito navigation">{[["Home", "home-simple-door"], ["Explore", "open-book"], ["Search", "search"], ["Settings", "settings"]].map(([label, icon]) => <button key={label} aria-current={label === "Home" ? "page" : undefined} onClick={() => label === "Home" ? scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }) : boundary(`${label} screens`)}><Icon name={icon} size={22} /><span>{label}</span></button>)}</nav>}
        {embedded && screen === "verify" && <button className={styles.embeddedCode} onClick={() => send({ type: "code", value: demoCode })}>Fill demo code {demoCode}</button>}
        {embedded && note && <div className={styles.embeddedNote} role="status">{note}<button aria-label="Dismiss preview note" onClick={() => setNote("")}>×</button></div>}
        <div className={`${styles.androidBar} ${screen === "donation" || screen === "loading" ? styles.androidDark : ""}`} aria-hidden="true" />
      </div>
    </div></div>
    <aside className={styles.navigation}><p className={styles.eyebrow}>Navigate the preview</p><nav aria-label="Medito preview sections">{meditoSimulationSections.map(({ screen: destination, label }) => <button key={destination} aria-current={meditoActiveSection(screen) === destination ? "page" : undefined} onClick={() => send({ type: "navigate", screen: destination })}>{label}<ArrowRight size={13} /></button>)}</nav>
      {screen === "verify" && <div className={styles.demoCode}><span>Demo code: <b>{demoCode}</b></span><button onClick={() => send({ type: "code", value: demoCode })}>Fill code</button></div>}
      <div className={styles.utilities}><button disabled={!state.history.length} onClick={() => send({ type: "back" })}><ArrowLeft size={13} />Back</button><button onClick={() => send({ type: "reset" })}><RotateCcw size={13} />Restart</button></div>
      <p className={styles.caption}>Recorded onboarding and Home only. The email capture remains in Flows as reference.</p>{note && <div className={styles.note} role="status">{note}<button aria-label="Dismiss preview note" onClick={() => setNote("")}>×</button></div>}
    </aside>
  </main>;
}
