"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, BriefcaseBusiness, EllipsisVertical, Share, UserRoundPlus } from "lucide-react";
import styles from "./graet-replica.module.css";

export type StaffName = "Trevor Daly" | "Tim Tobin" | "Matt Overeem";
type StaffTab = "bio" | "wall";

export function StaffProfilePage({ name, asset, tab, scrollTop, headerCollapsed, followed, onBack, onFollow, onMessage, onTab, onOpening }: { name: StaffName; asset: string | null; tab: StaffTab; scrollTop: number; headerCollapsed: boolean; followed: boolean; onBack: () => void; onFollow: () => void; onMessage: () => void; onTab: (tab: StaffTab) => void; onOpening: () => void }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const portalRoot = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("main > div");
  const copyDetails = () => { void navigator.clipboard?.writeText(`${name} · GRAET`); setShared(true); setOptionsOpen(false); };
  const actions = <>
    {optionsOpen && portalRoot && createPortal(<div className={styles.staffOptionsLayer}><button type="button" className={styles.staffOptionsBackdrop} aria-label="Close profile options" onClick={() => setOptionsOpen(false)} /><div role="dialog" aria-label={`${name} profile options`}><button type="button" onClick={copyDetails}>Copy profile details</button><button type="button" onClick={() => { onFollow(); setOptionsOpen(false); }}>{followed ? "Unfollow" : "Follow"} {name}</button><button type="button" onClick={() => setOptionsOpen(false)}>Cancel</button></div></div>, portalRoot)}
    {shared && <span className={styles.staffCopied} role="status">Profile details copied</span>}
  </>;

  if (!asset) return <div className={styles.staffGeneric} data-staff-profile={name}>
    <div className={styles.staffGenericCover}>
      <button type="button" className={styles.staffGenericBack} aria-label="Back" onClick={onBack}><ArrowLeft size={23} /></button>
      <div className={styles.staffGenericTools}><button type="button" aria-label={`Share ${name} profile`} onClick={copyDetails}><Share size={22} /></button><button type="button" aria-label="More profile options" onClick={() => setOptionsOpen(true)}><EllipsisVertical size={22} /></button></div>
    </div>
    <div className={styles.staffGenericBody}>
      <div className={styles.staffGenericAvatar} aria-hidden="true" />
      <h1>{name}</h1>
      <div className={styles.staffGenericRole}><span><BriefcaseBusiness size={16} /></span><b>Agent</b></div>
      <div className={styles.staffGenericMeta}>🇨🇦 <span>Canada</span></div>
      <div className={styles.staffGenericCounts}><span><b>0</b> Views</span><span><b>0</b> Followers</span><span><b>0</b> Following</span></div>
      <div className={styles.staffGenericActions}><button type="button" onClick={onFollow}><UserRoundPlus size={19} />{followed ? "Following" : "Follow"}</button><button type="button" onClick={onMessage}>Message</button></div>
    </div>
    <nav className={styles.staffGenericTabs} aria-label="Profile sections"><button type="button" className={tab === "bio" ? styles.staffGenericSelected : ""} onClick={() => onTab("bio")}>Bio</button><button type="button" className={tab === "wall" ? styles.staffGenericSelected : ""} onClick={() => onTab("wall")}>Wall</button></nav>
    {tab === "bio" ? <><h2 className={styles.staffGenericSection}>Current roles</h2><div className={styles.staffGenericEmpty} /><h2 className={styles.staffGenericSection}>Intro</h2><div className={styles.staffGenericEmpty}>Agent</div></> : <div className={styles.staffGenericEmpty}>No posts yet</div>}
    {actions}
  </div>;

  return <div className={styles.coachCapture} data-staff-profile={name}>
    {scrollTop > 70 && !headerCollapsed && <div className={`${styles.coachCompactBar} ${scrollTop > 310 ? styles.coachCompactCover : ""}`} style={{ backgroundImage: `url('/graet-replica/captures/${asset}-lower.png')` }}><button type="button" aria-label="Back" onClick={onBack} /></div>}
    {headerCollapsed && <div className={styles.coachCollapsedHeader} style={{ backgroundImage: `url('/graet-replica/captures/${asset}-lower.png')` }}><button type="button" className={styles.coachCollapsedBackHit} aria-label="Back" onClick={onBack} /><button type="button" className={styles.coachCollapsedBioHit} aria-label="Bio tab" onClick={() => onTab("bio")}>Bio</button><button type="button" className={`${styles.coachCollapsedWallHit} ${styles.coachCollapsedActive}`} aria-label="Wall tab" onClick={() => onTab("wall")}>Wall</button></div>}
    <div className={styles.coachCaptureTop} style={{ backgroundImage: `url('/graet-replica/captures/${asset}-top.png')` }}>
      <button type="button" className={styles.coachBackHit} aria-label="Back" onClick={onBack} />
      <button type="button" className={styles.coachShareHit} aria-label={`Share ${name} profile`} onClick={copyDetails} />
      <button type="button" className={styles.coachMoreHit} aria-label="More profile options" onClick={() => setOptionsOpen(true)} />
      <button type="button" className={styles.coachFollowHit} aria-label={`${followed ? "Unfollow" : "Follow"} ${name}`} onClick={onFollow}>{followed && <span>Following</span>}</button>
      <button type="button" className={styles.coachMessageHit} aria-label={`Message ${name}`} onClick={onMessage} />
      <button type="button" className={styles.coachBioHit} aria-label="Bio tab" onClick={() => onTab("bio")} />
      <button type="button" className={styles.coachWallHit} aria-label="Wall tab" onClick={() => onTab("wall")} />
    </div>
    <div className={`${styles.coachCaptureLower} ${tab === "wall" ? styles.coachWallLower : ""} ${tab === "wall" && name === "Tim Tobin" ? styles.coachTimWallLower : ""}`} style={{ backgroundImage: `url('/graet-replica/captures/${asset}-lower.png')` }}>
      {name === "Tim Tobin" && tab === "wall" && <button type="button" className={styles.coachWallOpeningHit} aria-label="View Minnesota Blue Ox opening" onClick={onOpening} />}
    </div>
    {name === "Tim Tobin" && tab === "wall" && <div className={styles.coachTimWallPoster} aria-hidden="true" />}
    {tab === "wall" && <div className={`${styles.coachWallSpacer} ${name === "Tim Tobin" ? styles.coachTimWallSpacer : ""}`} />}
    {actions}
  </div>;
}
