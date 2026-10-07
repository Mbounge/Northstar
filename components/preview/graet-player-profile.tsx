"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, ChevronRight, EllipsisVertical, HelpCircle, Instagram, MessageCircle, Share, ThumbsUp, UserRoundPlus, X } from "lucide-react";
import styles from "./graet-player-profile.module.css";

export type ProfileTab = "wall" | "stats" | "bio";
export type ProfileFacts = { name: string; position?: string; year?: string; country?: string; views?: string; followers?: string; avatar?: { image: string; x: number; y: number } };
type SeasonRow = { season: string; team: string; gp: number; g: number; a: number; tp: number };

const thomasSeasons: SeasonRow[] = [
  { season: "26/27", team: "Laurentides Conquérants M15 AAAE", gp: 5, g: 4, a: 4, tp: 8 },
  { season: "25/26", team: "Laurentides Conquérants M15 AAA", gp: 29, g: 27, a: 15, tp: 42 },
  { season: "25/26", team: "Laurentides Conquérants M15 AAAE", gp: 2, g: 0, a: 0, tp: 0 },
];
const thomasTournaments: SeasonRow[] = [{ season: "24/25", team: "Blainville-Boisbriand Jr. Armada", gp: 5, g: 5, a: 3, tp: 8 }];
const thomasClips = [
  { image: "s0100_player_profiles_wall_clips_and_posts", y: -400, scale: 1, age: "9mo ago", likes: 0 },
  { image: "s0102_player_profiles_wall_further_clips", y: -298, scale: 1.56, age: "11mo ago", likes: 1 },
  { image: "s0103_player_profiles_wall_further_posts", y: -144, scale: 1.56, age: "11mo ago", likes: 2 },
  { image: "s0103_player_profiles_wall_further_posts", y: -493, scale: 1.56, age: "1y ago", likes: 3 },
];
function clipPosterStyle(clip: (typeof thomasClips)[number]): CSSProperties {
  const width = 375 * clip.scale;
  return {
    backgroundImage: `url('/graet-replica/tenant-source/${clip.image}.png')`,
    backgroundSize: `${width}px ${812 * clip.scale}px`,
    backgroundPosition: `${-(width - 375) / 2}px ${clip.y * clip.scale}px`,
  };
}

function positionCode(position?: string) {
  return ({ Center: "C", Defenseman: "D", Goalie: "G", "Left winger": "LW", "Right winger": "RW" } as Record<string, string>)[position ?? ""] ?? position ?? "";
}
function countryFlag(country?: string) {
  return ({ CAN: "🇨🇦", USA: "🇺🇸", AUT: "🇦🇹", GER: "🇩🇪", CZE: "🇨🇿", SVK: "🇸🇰", NOR: "🇳🇴", FIN: "🇫🇮", LAT: "🇱🇻" } as Record<string, string>)[country ?? "CAN"] ?? "🇨🇦";
}
function displayCountry(country?: string) {
  return ({ CAN: "Canada", USA: "United States", AUT: "Austria", GER: "Germany", CZE: "Czechia", SVK: "Slovakia", NOR: "Norway", FIN: "Finland", LAT: "Latvia" } as Record<string, string>)[country ?? "CAN"] ?? "Canada";
}

export function PlayerProfilePage({ facts, tab, followed, owner = false, scrollTop = 0, onBack, onTab, onFollow, onMessage, onRelated, onEditName }: { facts: ProfileFacts; tab: ProfileTab; followed: boolean; owner?: boolean; scrollTop?: number; onBack: () => void; onTab: (next: ProfileTab) => void; onFollow: () => void; onMessage: () => void; onRelated: (name: string) => void; onEditName?: (first: string, last: string) => void }) {
  const [moreOpen, setMoreOpen] = useState<"profile" | "clip" | null>(null);
  const [clipOptionsIndex, setClipOptionsIndex] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draftFirst, setDraftFirst] = useState(facts.name.split(" ")[0] ?? "");
  const [draftLast, setDraftLast] = useState(facts.name.split(" ").slice(1).join(" "));
  const [season, setSeason] = useState<"26/27" | "Career">("26/27");
  const [postType, setPostType] = useState<"Clips" | "Other posts">("Clips");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [clipOpen, setClipOpen] = useState<number | null>(null);
  const [liked, setLiked] = useState<number[]>([]);
  const portalRoot = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("main > div");
  const overlay = (content: ReactNode) => portalRoot ? createPortal(content, portalRoot) : null;
  const thomas = facts.name === "Thomas Balogh";
  const [first, ...rest] = facts.name.split(" ");
  const pos = positionCode(facts.position ?? (thomas ? "Center" : undefined));
  const year = facts.year ?? (thomas ? "2012" : "");
  const country = facts.country ?? "CAN";
  const current = thomas ? { ppg: "1.60", gp: 5, g: 4, a: 4, tp: 8 } : { ppg: "0.00", gp: 0, g: 0, a: 0, tp: 0 };
  const career = thomas ? { ppg: "1.25", gp: 36, g: 31, a: 19, tp: 50 } : current;
  const stats = season === "26/27" ? current : career;
  const seasons = thomas ? thomasSeasons : [{ season: "26/27", team: "Team not captured", gp: 0, g: 0, a: 0, tp: 0 }];
  const heroPhoto = thomas ? { backgroundImage: "url('/graet-replica/tenant-source/s0099_player_profiles_thomas_balogh_profile_wall_top.png')", backgroundSize: "375px 812px", backgroundPosition: "0 0" } : facts.avatar ? { backgroundImage: `url('${facts.avatar.image}')`, backgroundSize: "750px 1624px", backgroundPosition: `${facts.avatar.x}px ${facts.avatar.y}px` } : undefined;
  const toggleRow = (key: string) => setExpanded((previous) => previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key]);
  const copyProfile = () => { void navigator.clipboard?.writeText(`${facts.name} · GRAET`); setMoreOpen(null); };
  const copyClip = (index: number) => { void navigator.clipboard?.writeText(`${facts.name} · clip ${index + 1} · GRAET`); setMoreOpen(null); };
  const table = (rows: SeasonRow[]) => <div className={styles.table}>
    <div className={styles.tableHead}><span>Season</span><span>Team</span><span>GP</span><span>G</span><span>A</span><span>TP</span><span /></div>
    {rows.map((row, index) => { const key = `${row.season}-${row.team}-${index}`; return <div key={key}><button type="button" className={styles.tableRow} aria-expanded={expanded.includes(key)} onClick={() => toggleRow(key)}><span>{row.season}</span><strong className={row.team.includes("Armada") ? styles.armadaTeam : styles.conquerantsTeam}>{row.team}</strong><span>{row.gp}</span><span>{row.g}</span><span>{row.a}</span><span>{row.tp}</span><ChevronDown size={17} className={expanded.includes(key) ? styles.chevronOpen : ""} /></button>{expanded.includes(key) && <div className={styles.rowDetail}><span>Games played <b>{row.gp}</b></span><span>Goals <b>{row.g}</b></span><span>Assists <b>{row.a}</b></span><span>Total points <b>{row.tp}</b></span></div>}</div>; })}
  </div>;
  return <div className={`${styles.page} ${thomas ? styles.thomasProfile : ""} ${thomas && scrollTop > 70 ? styles.bakedControlsCleared : ""} ${scrollTop > 440 ? styles.scrolled : ""}`} data-player-profile={facts.name} data-profile-scrolled={scrollTop > 440} data-baked-status-cleared={thomas && scrollTop > 35 && scrollTop <= 440} data-profile-faded={thomas && scrollTop > 250 && scrollTop <= 440}>
    <div className={styles.stickyTools}><button type="button" className={styles.back} aria-label="Back" onClick={onBack}><ArrowLeft size={24} /></button><div className={styles.heroTools}><button type="button" aria-label={`Share ${facts.name} profile`} onClick={copyProfile}><Share size={22} /></button><button type="button" aria-label="More profile options" onClick={() => setMoreOpen("profile")}><EllipsisVertical size={23} /></button></div></div>
    <section className={`${styles.hero} ${thomas ? styles.thomasHero : ""}`} data-followed={followed}>
      {heroPhoto && <div className={styles.heroPhoto} style={heroPhoto} />}
      {!heroPhoto && <div className={styles.silhouette}><i /><b /></div>}
      <div className={styles.heroInfo}><h1><span>{first}</span><strong>{rest.join(" ")}</strong></h1><div className={styles.meta}><span>{countryFlag(country)}　{pos}{year ? ` · ${year}` : ""}</span><span>{thomas ? "Seen over 2w ago" : ""}</span></div><div className={styles.counts}><span><b>{facts.views ?? (thomas ? "118" : "0")}</b> Views</span><span><b>{facts.followers ?? (thomas ? "8" : "0")}</b> Followers</span><span><b>{thomas ? "1" : "0"}</b> Following</span></div><div className={styles.actions}>{owner ? <><button type="button" onClick={copyProfile}><Share size={20} />Share</button><button type="button" onClick={() => setEditOpen(true)}>Edit profile</button></> : <><button type="button" onClick={onFollow}><UserRoundPlus size={20} />{followed ? "Following" : "Follow"}</button><button type="button" onClick={onMessage}>Message</button></>}</div></div>
    </section>
    <nav className={styles.tabs} aria-label="Profile sections">{(["wall", "stats", "bio"] as const).map((item) => <button type="button" key={item} className={tab === item ? styles.activeTab : ""} aria-current={tab === item ? "page" : undefined} onClick={() => onTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
    {tab === "wall" && <div className={styles.wall}>
      <div className={styles.wallHeading}><h2>Stats</h2><div className={styles.chips}><button type="button" className={season === "26/27" ? styles.selectedChip : ""} onClick={() => setSeason("26/27")}>26/27</button><button type="button" className={season === "Career" ? styles.selectedChip : ""} onClick={() => setSeason("Career")}>Career</button></div></div>
      <div className={styles.tiles}>{[["PPG", stats.ppg], ["GP", stats.gp], ["G", stats.g], ["A", stats.a], ["TP", stats.tp]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className={styles.postsHeading}><h2>Latest posts</h2><div className={styles.chips}><button type="button" className={postType === "Clips" ? styles.selectedChip : ""} onClick={() => setPostType("Clips")}>Clips</button><button type="button" className={postType === "Other posts" ? styles.selectedChip : ""} onClick={() => setPostType("Other posts")}>Other posts</button></div></div>
      {thomas ? postType === "Clips" ? thomasClips.map((clip, index) => <ProfileVideoPost key={index} author={facts} clip={clip} index={index} liked={liked.includes(index)} onOpen={() => setClipOpen(index)} onLike={() => setLiked((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} onComment={onMessage} onShare={() => copyClip(index)} onMore={() => { setClipOptionsIndex(index); setMoreOpen("clip"); }} />) : <div className={styles.emptyPosts}>No other posts captured</div> : <div className={styles.emptyPosts}>No {postType.toLowerCase()} yet</div>}
      <RelatedPlayers onRelated={onRelated} />
    </div>}
    {tab === "stats" && <div className={styles.statsPage}>{table(seasons)}<h2>Tournaments</h2>{thomas ? table(thomasTournaments) : <div className={styles.emptyStats}>No tournament stats captured</div>}<RelatedPlayers onRelated={onRelated} /></div>}
    {tab === "bio" && <div className={styles.bioPage}><div className={styles.bioTop}><div><h2>{facts.position ?? (thomas ? "Center" : "Hockey player")}</h2><span>Player type</span><strong>{thomas ? "Playmaker" : "—"} <HelpCircle size={17} /></strong><span>Shoots</span><strong>{thomas ? "Left" : "—"}</strong></div><div className={styles.rink}><i /><b /><em /></div></div><dl>{[["Height", thomas ? "170cm" : "—"], ["Weight", thomas ? "57kg" : "—"], ["Nationality", displayCountry(country)], ["Date of birth", thomas ? "February 23, 2012" : year || "—"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h2>Academic details</h2><dl><div><dt>Institution</dt><dd>{thomas ? "Collège Esther Blondin" : "—"}</dd></div><div><dt>Graduation</dt><dd>{thomas ? "2029" : "—"}</dd></div></dl><h2>Social media</h2>{thomas && <div className={styles.socials}><div><Instagram size={22} /><strong>@balogh_thomas99_hky</strong><ChevronRight size={20} /></div><div><b>𝕏</b><strong>@ThomasBalogh</strong><ChevronRight size={20} /></div></div>}<h2>GRAET</h2><dl><div><dt>Joined</dt><dd>{thomas ? "September 21, 2025" : "—"}</dd></div></dl><RelatedPlayers onRelated={onRelated} /></div>}
    {moreOpen && overlay(<div className={styles.sheet}><button type="button" className={styles.sheetBackdrop} aria-label="Close options" onClick={() => setMoreOpen(null)} /><div role="dialog" aria-label={moreOpen === "clip" ? "Clip options" : "Profile options"}><button type="button" onClick={moreOpen === "clip" ? () => copyClip(clipOptionsIndex ?? 0) : copyProfile}>{moreOpen === "clip" ? "Copy clip details" : "Copy profile"}</button>{moreOpen === "profile" && (owner ? <button type="button" onClick={() => { setMoreOpen(null); setEditOpen(true); }}>Edit profile</button> : <button type="button" onClick={() => { onFollow(); setMoreOpen(null); }}>{followed ? "Unfollow" : "Follow"} {facts.name}</button>)}<button type="button" onClick={() => setMoreOpen(null)}>Cancel</button></div></div>)}
    {editOpen && overlay(<div className={styles.sheet}><button type="button" className={styles.sheetBackdrop} aria-label="Close edit profile" onClick={() => setEditOpen(false)} /><div role="dialog" aria-label="Edit profile"><label>First name<input value={draftFirst} onChange={(event) => setDraftFirst(event.target.value)} /></label><label>Last name<input value={draftLast} onChange={(event) => setDraftLast(event.target.value)} /></label><button type="button" onClick={() => { onEditName?.(draftFirst.trim(), draftLast.trim()); setEditOpen(false); }}>Save</button><button type="button" onClick={() => setEditOpen(false)}>Cancel</button></div></div>)}
    {clipOpen !== null && overlay(<div className={styles.clipViewer} role="dialog" aria-label="Thomas Balogh clip"><button type="button" aria-label="Close clip" onClick={() => setClipOpen(null)}><X size={25} /></button><div className={styles.clipViewerImage} style={clipPosterStyle(thomasClips[clipOpen])} /></div>)}
  </div>;
}

function ProfileVideoPost({ author, clip, index, liked, onOpen, onLike, onComment, onShare, onMore }: { author: ProfileFacts; clip: (typeof thomasClips)[number]; index: number; liked: boolean; onOpen: () => void; onLike: () => void; onComment: () => void; onShare: () => void; onMore: () => void }) {
  return <article className={styles.post}>
    <div className={styles.postAuthor}><span className={styles.postAvatar} style={author.name === "Thomas Balogh" ? undefined : { backgroundImage: "none", backgroundColor: "#e5e8f0" }} /> <span><strong>{author.name} {countryFlag(author.country)}</strong><small>{author.year} · {positionCode(author.position)}</small></span></div>
    <button type="button" className={styles.clip} style={clipPosterStyle(clip)} aria-label={`Open ${author.name} clip ${index + 1}`} onClick={onOpen} />
    <div className={styles.postActions}><span>{clip.age}</span><button type="button" aria-label={`Like clip ${index + 1}`} onClick={onLike}><b>{clip.likes + (liked ? 1 : 0)}</b><ThumbsUp size={23} fill={liked ? "currentColor" : "none"} /></button><button type="button" aria-label={`Comment on clip ${index + 1}`} onClick={onComment}><MessageCircle size={23} /></button><button type="button" aria-label={`Share clip ${index + 1}`} onClick={onShare}><Share size={23} /></button><button type="button" aria-label={`More clip ${index + 1} options`} onClick={onMore}><EllipsisVertical size={23} /></button></div>
  </article>;
}

function RelatedPlayers({ onRelated }: { onRelated: (name: string) => void }) {
  const players = [
    { name: "Derek Lacroix", year: "2012", image: "s0104_player_profiles_wall_more_players", y: -423, lowerImage: "s0105_player_profiles_related_player_cards", lowerY: -260 },
    { name: "Simon Delarosbil", year: "2011", image: "s0105_player_profiles_related_player_cards", y: -352, lowerImage: "s0106_player_profiles_related_player_cards_lower", lowerY: -254 },
    { name: "Olivier Lavigne", year: "2012", image: "s0106_player_profiles_related_player_cards_lower", y: -345 },
  ];
  return <section className={styles.related}><h2>More players</h2>{players.map((player) => <button type="button" key={player.name} className={styles.relatedCard} aria-label={`View ${player.name}`} onClick={() => onRelated(player.name)}><span className={styles.relatedArt} style={{ backgroundImage: `url('/graet-replica/tenant-source/${player.image}.png')`, backgroundPosition: `-20px ${player.y}px` }} />{"lowerImage" in player && <span className={styles.relatedArtLower} style={{ backgroundImage: `url('/graet-replica/tenant-source/${player.lowerImage}.png')`, backgroundPosition: `-20px ${player.lowerY}px` }} />}<span className={styles.srOnly}>{player.name} · Center · {player.year}</span></button>)}</section>;
}
