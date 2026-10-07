"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, BatteryFull, ChevronRight, EllipsisVertical, Heart, Home, List, MapPin, MessageCircle, MessageSquare, Plus, Search, Share, SlidersHorizontal, Sparkles, Star, ThumbsUp, UserRound, UserRoundPlus, Wifi } from "lucide-react";
import styles from "./graet-replica.module.css";
import { capturedGameLeagues, type CapturedLeague, type CapturedMatch } from "./graet-game-data";
import { capturedOpenings, type OpeningRecord } from "./graet-opening-data";
import { PlayerProfilePage, type ProfileFacts } from "./graet-player-profile";
import { StaffProfilePage, type StaffName } from "./graet-staff-profile";
import { capturedColleges, collegeCardSlices, type CollegeRecord } from "./graet-college-data";

type Screen = "welcome" | "email" | "verify" | "role" | "name" | "birthday" | "nationality" | "photo" | "interests" | "searchPreferences" | "leagues" | "trial" | "premiumDetail" | "premiumFeature" | "featureTour" | "notifications" | "notificationsCenter" | "career" | "gameTracker" | "colleges" | "collegeDetail" | "collegeFilters" | "support" | "feed" | "coachProfile" | "games" | "gameList" | "gameLeague" | "gameMatch" | "players" | "playerSearch" | "playerFilters" | "playerProfile" | "profile" | "openings" | "opening" | "apply" | "applications" | "ai" | "chat";
type Tab = "home" | "explore" | "ai" | "chat" | "profile";
const flow: Screen[] = ["welcome", "email", "verify", "role", "name", "birthday", "nationality", "photo", "interests", "searchPreferences", "leagues", "trial", "notifications", "career"];
const interestChoices = ["Open to opportunities for 2026–27", "Open to opportunities for 2027–28", "Looking for an agent / advisor", "More scout & coach exposure"];
const onboardingCaptureFiles: Record<number, string> = {
  2: "s0002_onboarding_email_form_empty", 3: "s0003_onboarding_email_form_entered", 4: "s0004_onboarding_check_your_email",
  6: "s0006_onboarding_name_form_empty", 7: "s0007_onboarding_name_form_entered", 8: "s0008_onboarding_birthday_form",
  9: "s0009_onboarding_nationality_selection", 10: "s0010_onboarding_nationality_picker", 11: "s0011_onboarding_profile_picture_step",
  12: "s0012_onboarding_what_are_you_looking_for", 13: "s0013_onboarding_team_search_preferences", 14: "s0014_onboarding_playing_area_choice",
  15: "s0015_onboarding_preferred_regions", 16: "s0016_onboarding_priority_leagues",
};
const capturedStatus: Partial<Record<Screen, string>> = { welcome: "welcome", role: "role", trial: "trial-top", premiumDetail: "premium-detail", notifications: "notifications", notificationsCenter: "notifications-empty", career: "career-top", gameTracker: "game-tracker", colleges: "college-73", collegeDetail: "college-78", collegeFilters: "college-85", support: "support", games: "nav-home", gameList: "games-list", gameLeague: "games-czechia-selected", gameMatch: "games-match-details-top", chat: "chat-all", ai: "ai-top", opening: "opening-detail-top", apply: "s0048_explore_openings_apply_to_opening_unsent", applications: "s0045_explore_openings_my_applications_empty" };
const calendarDates = Array.from({ length: 181 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 8, 28 - 90 + index));
  return {
    key: date.toISOString().slice(0, 10),
    day: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    label: `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
  };
});
const fallbackBack: Partial<Record<Screen, Screen>> = { premiumDetail: "career", premiumFeature: "career", featureTour: "career", notificationsCenter: "career", gameTracker: "career", colleges: "career", collegeDetail: "colleges", collegeFilters: "colleges", support: "career", coachProfile: "feed", gameList: "games", gameLeague: "gameList", gameMatch: "gameLeague", playerSearch: "players", playerFilters: "playerSearch", playerProfile: "players", profile: "career", opening: "openings", apply: "opening", applications: "openings" };
const capturedPlayers = [
  { name: "Boston Tait", image: "players-top", y: 239 }, { name: "Jake Bullen", image: "players-top", y: 239 },
  { name: "Patrick Mongst", image: "players-top", y: 473 }, { name: "Tarik Borhot", image: "players-top", y: 473 },
  { name: "Louis Oscar Holowaychuk", image: "players-more", y: 228 }, { name: "Ewan Sim", image: "players-more", y: 228 },
  { name: "Finn Murphy", image: "players-more", y: 463 }, { name: "Zachary Botelho", image: "players-more", y: 463 },
  { name: "Jacob Drori", image: "players-later", y: 296 }, { name: "Brendan Smith", image: "players-later", y: 296 },
  { name: "Adam Grenier", image: "players-later-ii", y: 383 }, { name: "Jaren Bellini", image: "players-later-ii", y: 383 },
  { name: "Thomas Balogh", image: "players-new", y: 239 }, { name: "Carley Blomberg", image: "players-new", y: 239 },
  { name: "Sawyer Gedanitz", image: "players-new", y: 473 }, { name: "Taqhaa Lone", image: "players-new", y: 473 },
];
const highResPlayerCaptures: Record<string, string> = {
  "players-top": "s0032_explore_players_player_grid_top",
  "players-more": "s0033_explore_players_player_grid_more_players",
  "players-later": "s0034_explore_players_player_grid_later_cards",
  "players-later-ii": "s0035_explore_players_player_grid_later_cards_ii",
  "player-search-top": "s0040_explore_player_search_browse_all_players_top",
  "player-search-middle": "s0041_explore_player_search_browse_all_players_middle",
  "player-search-lower": "s0042_explore_player_search_browse_all_players_lower",
};
const playerCaptureUrl = (name: string) => highResPlayerCaptures[name]
  ? `/graet-replica/tenant-source/${highResPlayerCaptures[name]}.png`
  : `/graet-replica/captures/${name}.png`;
const capturedGridFacts: Record<string, { position?: string; year?: string; views?: string; followers?: string }> = {
  "Tobin Schaefer": { position: "LW", year: "2009" },
  "Ragnar Gillis": { position: "C", year: "2008" },
  "Derek Lacroix": { position: "C", year: "2012" },
  "Simon Delarosbil": { position: "C", year: "2011" },
  "Olivier Lavigne": { position: "C", year: "2012" },
  "Boston Tait": { position: "D", year: "2009", views: "25", followers: "4" },
  "Jake Bullen": { year: "1991", views: "1017", followers: "82" },
  "Patrick Mongst": { views: "5", followers: "2" },
  "Tarik Borhot": { year: "2004", views: "250", followers: "24" },
  "Louis Oscar Holowaychuk": { position: "C", year: "2010", views: "33", followers: "6" },
  "Ewan Sim": { position: "C", year: "2010", views: "269", followers: "24" },
  "Finn Murphy": { year: "2004", views: "29", followers: "3" },
  "Zachary Botelho": { position: "G", year: "2010", views: "658", followers: "43" },
};
const capturedSearchPlayers = [
  ...["Elias Valtiner", "Simon Cseh", "Till Schulz", "Martin Tomasik", "David Jasik", "Tim Colin Dietzinger", "Dimico Manzolillo", "Benjamin Simon", "Mason Garner", "Jordan Veilleux"].map((name, index) => ({ name, image: "player-search-top", y: 110 + index * 60 })),
  ...["Benedikt Nutz", "Adam Lorenc", "Lexy Patry-clavette", "Brody Morbillo", "Dashiell Geisler", "Aleksander Shkreli", "Trym Navarsete", "Matyas Hynek", "Marks Neverzevskis"].map((name, index) => ({ name, image: "player-search-middle", y: 156 + index * 60 })),
  ...["Anthony Janz", "Nicholas Seroukas", "Parker Ross", "Troy Keller", "Adam Pasov", "Mason Miller", "Maksymilian Rosenberg", "Niilo Paksuniemi", "George Grayson", "Samuel Foltany"].map((name, index) => ({ name, image: "player-search-lower", y: 121 + index * 60 })),
].map((item, index) => ({ ...item, ...[
  ["2011", "Defenseman", "AUT"], ["2008", "Center", "AUT"], ["2009", "Left winger", "GER"], ["2009", "Center", "SVK"], ["2011", "Center", "SVK"],
  ["2010", "Left winger", "GER"], ["2009", "Right winger", "USA"], ["2010", "Center", "CAN"], ["2010", "Defenseman", "USA"], ["2009", "Right winger", "USA"],
  ["2011", "Left winger", "AUT"], ["2009", "Right winger", "CZE"], ["2011", "Center", "CAN"], ["2011", "Goalie", "USA"], ["2010", "Right winger", "USA"],
  ["2011", "Right winger", "USA"], ["2009", "Defenseman", "NOR"], ["2011", "Defenseman", "CZE"], ["2012", "Defenseman", "LAT"],
  ["2011", "Defenseman", "USA"], ["2009", "Center", "CAN"], ["2011", "Goalie", "USA"], ["2009", "Defenseman", "USA"], ["2010", "Defenseman", "CZE"],
  ["2008", "Defenseman", "CAN"], ["2009", "Left winger", "USA"], ["2012", "Goalie", "FIN"], ["2008", "Left winger", "USA"], ["2011", "Right winger", "SVK"],
][index].reduce((details, value, detailIndex) => ({ ...details, [detailIndex === 0 ? "year" : detailIndex === 1 ? "position" : "country"]: value }), {} as Record<"year" | "position" | "country", string>) }));

function profileFactsFor(name: string): ProfileFacts {
  if (name === "Thomas Balogh") return { name, position: "Center", year: "2012", country: "CAN", views: "118", followers: "8" };
  const gridIndex = capturedPlayers.findIndex((item) => item.name === name);
  const grid = capturedPlayers[gridIndex];
  const search = capturedSearchPlayers.find((item) => item.name === name);
  const facts = capturedGridFacts[name];
  return {
    name, position: search?.position ?? facts?.position, year: search?.year ?? facts?.year,
    country: search?.country ?? "CAN", views: facts?.views, followers: facts?.followers,
    avatar: grid && name !== "Boston Tait" && !["Louis Oscar Holowaychuk"].includes(name) ? { image: playerCaptureUrl(grid.image), x: -(gridIndex % 2) * 375, y: -grid.y * 2 } : undefined,
  };
}

function FeedFollowGlyph({ followed }: { followed: boolean }) {
  return <span>{followed ? "✓" : <UserRoundPlus size={20} strokeWidth={2.2} />}</span>;
}

type GameHit = { top: number; height: number; league: string; match?: number };
const gameListHits: GameHit[][] = [
  [
    { top: 0, height: 59, league: "usphl" },
    { top: 59, height: 73, league: "usphl", match: 0 }, { top: 132, height: 72, league: "usphl", match: 1 },
    { top: 204, height: 74, league: "usphl", match: 2 }, { top: 278, height: 60, league: "usphl", match: 3 },
    { top: 338, height: 61, league: "czechia2" },
    { top: 399, height: 72, league: "czechia2", match: 0 }, { top: 471, height: 73, league: "czechia2", match: 1 },
  ],
  [
    { top: 0, height: 73, league: "czechia2", match: 2 }, { top: 73, height: 72, league: "czechia2", match: 3 },
    { top: 145, height: 74, league: "czechia2", match: 4 }, { top: 219, height: 72, league: "czechia2", match: 5 },
    { top: 291, height: 74, league: "czechia2", match: 6 }, { top: 365, height: 60, league: "ahl" },
    { top: 425, height: 72, league: "ahl", match: 0 }, { top: 497, height: 60, league: "allsvenskan" },
  ],
  [
    { top: 0, height: 60, league: "czechiau20" }, { top: 60, height: 72, league: "czechiau20", match: 0 },
    { top: 132, height: 73, league: "czechiau20", match: 1 }, { top: 205, height: 73, league: "czechiau20", match: 2 },
    { top: 278, height: 61, league: "university" }, { top: 339, height: 71, league: "university", match: 0 },
    { top: 410, height: 73, league: "university", match: 1 }, { top: 483, height: 60, league: "extraliga" },
    { top: 543, height: 29, league: "extraliga", match: 0 },
  ],
];

function GameTeamLogo({ leagueId, matchIndex, away = false, large = false }: { leagueId: string; matchIndex: number; away?: boolean; large?: boolean }) {
  const sliceIndex = gameListHits.findIndex((hits) => hits.some((hit) => hit.league === leagueId && hit.match === matchIndex));
  if (sliceIndex < 0) {
    const league = capturedGameLeagues.find((item) => item.id === leagueId);
    const name = away ? league?.matches[matchIndex]?.away : league?.matches[matchIndex]?.home;
    return <i className={`${styles.gameDataLogo} ${styles.gameDataLogoFallback} ${large ? styles.gameDataLogoLarge : ""}`}>{name?.split(" ").map((word) => word[0]).slice(0, 2).join("")}</i>;
  }
  const hit = gameListHits[sliceIndex]?.find((item) => item.league === leagueId && item.match === matchIndex);
  const file = ["games-list", "games-list-more", "games-all-lower"][sliceIndex] ?? "games-list";
  // The shorter scheduled row has tighter logo spacing; keep each team inside its own crop.
  const shortRow = (hit?.height ?? 73) < 65;
  const imageY = (sliceIndex === 0 ? 142 : 157) + (hit?.top ?? 0) + (away ? (large && shortRow ? 35 : 40) : (large ? (shortRow ? 9 : 14) : 12)) - (large ? 1 : 0);
  const zoom = large ? 3 : 1;
  return <i className={`${styles.gameDataLogo} ${large ? styles.gameDataLogoLarge : ""}`} style={{ backgroundImage: `url('/graet-replica/captures/${file}.png')`, backgroundSize: `${375 * zoom}px ${812 * zoom}px`, backgroundPosition: `${-15 * zoom}px ${-imageY * zoom}px` }} />;
}
function GameLeagueLogo({ leagueId }: { leagueId: string }) {
  const sliceIndex = gameListHits.findIndex((hits) => hits.some((hit) => hit.league === leagueId && hit.match === undefined));
  const hit = gameListHits[sliceIndex]?.find((item) => item.league === leagueId && item.match === undefined);
  const file = ["games-list", "games-list-more", "games-all-lower"][sliceIndex] ?? "games-list";
  const imageY = (sliceIndex === 0 ? 142 : 157) + (hit?.top ?? 0) + 11;
  return <i className={styles.gameDataLeagueMark} style={{ backgroundImage: `url('/graet-replica/captures/${file}.png')`, backgroundSize: "375px 812px", backgroundPosition: `-17px -${imageY}px` }} />;
}
function GameRow({ match, leagueId, matchIndex, onClick }: { match: CapturedMatch; leagueId: string; matchIndex: number; onClick: () => void }) {
  const rowState = match.time ? styles.gameDataRowScheduled : match.homeScore === match.awayScore ? styles.gameDataRowTied : (match.homeScore ?? 0) > (match.awayScore ?? 0) ? styles.gameDataRowHomeLead : styles.gameDataRowAwayLead;
  return <button type="button" className={`${styles.gameDataRow} ${rowState}`} onClick={onClick} aria-label={`${match.home} versus ${match.away}`}>
    <span className={styles.gameDataTeams}><span><GameTeamLogo leagueId={leagueId} matchIndex={matchIndex} /><b>{match.home}</b></span><span><GameTeamLogo leagueId={leagueId} matchIndex={matchIndex} away /><b>{match.away}</b></span></span>
    <span className={styles.gameDataScores}>{match.time ? <em>{match.time}</em> : <><b>{match.homeScore}</b><b>{match.awayScore}</b></>}</span>
  </button>;
}

function GameLeagueSection({ league, favorite, onLeague, onFavorite, onMatch }: { league: CapturedLeague; favorite: boolean; onLeague: () => void; onFavorite: () => void; onMatch: (index: number) => void }) {
  const listedMatches = league.listMatches === false ? [] : league.matches;
  return <section className={styles.gameDataSection} aria-label={league.name}><div className={styles.gameDataSectionHeader}><button type="button" className={styles.gameDataSectionOpen} aria-label={`View ${league.name}`} onClick={onLeague}><GameLeagueLogo leagueId={league.id} /><span><b>{league.name} <small>{league.flag}</small></b><em>{league.subtitle}</em></span></button><button type="button" className={styles.gameDataSectionAction} aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${league.name}`} onClick={onFavorite}><Star size={22} fill={favorite ? "#003ce5" : "none"} color={favorite ? "#003ce5" : "#59616d"} /></button><button type="button" className={styles.gameDataSectionAction} aria-label={`Open ${league.name} list`} onClick={onLeague}><List size={23} /></button></div>{listedMatches.map((match, index) => <GameRow key={`${match.home}-${match.away}`} match={match} leagueId={league.id} matchIndex={index} onClick={() => onMatch(index)} />)}</section>;
}

function GameStatRow({ label, home, away }: { label: string; home: number | string; away: number | string }) {
  const homeValue = typeof home === "number" ? home : Number.parseInt(home, 10) || 0;
  const awayValue = typeof away === "number" ? away : Number.parseInt(away, 10) || 0;
  const share = homeValue + awayValue ? homeValue / (homeValue + awayValue) : 0.5;
  const showPercent = label === "Faceoffs won" || label === "Power Play Goals (PPG)";
  return <div className={styles.gameDataStatRow}><div><strong>{home}{showPercent && <em> {Math.round(share * 100)}%</em>}</strong><span>{label}</span><strong>{showPercent && <em>{Math.round((1 - share) * 100)}% </em>}{away}</strong></div><div className={styles.gameDataStatTrack}>{homeValue + awayValue > 0 && <><i style={{ width: `${Math.round(share * 50)}%` }} /><b style={{ width: `${Math.round((1 - share) * 50)}%` }} /></>}</div></div>;
}

function GameMatchMock({ league, match, matchIndex, tab, side, onBack, onTab, onSide, onShare, onMore }: { league: CapturedLeague; match: CapturedMatch; matchIndex: number; tab: "details" | "stats" | "lineups"; side: "home" | "away"; onBack: () => void; onTab: (tab: "details" | "stats" | "lineups") => void; onSide: (side: "home" | "away") => void; onShare: () => void; onMore: () => void }) {
  const home = match.homeScore ?? 0;
  const away = match.awayScore ?? 0;
  const scheduled = match.homeScore === undefined || match.awayScore === undefined;
  const shotHome = home * 3 + 16;
  const shotAway = away * 3 + 16;
  const totalGoals = home + away;
  let homeRunning = 0;
  let awayRunning = 0;
  const goals = Array.from({ length: totalGoals }, (_, index) => {
    const remainingHome = home - homeRunning;
    const remainingAway = away - awayRunning;
    const goalSide = remainingHome && (!remainingAway || index % 3 !== 1) ? "home" : "away";
    if (goalSide === "home") homeRunning += 1;
    else awayRunning += 1;
    const minute = 3 + Math.floor(index * 54 / Math.max(1, totalGoals));
    return { side: goalSide, period: Math.min(2, Math.floor(minute / 20)), score: `${homeRunning}:${awayRunning}`, time: `${String(minute).padStart(2, "0")}:${String((index * 13 + 17) % 60).padStart(2, "0")}` };
  });
  const homeNames = ["M. Novak", "T. Miller", "J. Smith", "A. Brown", "D. Wilson", "R. Johnson", "L. Martin", "P. Davis", "K. Anderson", "S. Thompson", "C. White", "B. Clark", "N. Lewis", "E. Walker", "O. Young", "F. Allen", "G. Hall", "V. King"];
  const awayNames = ["J. Carter", "M. Cooper", "D. Green", "P. Baker", "T. Wright", "R. Hill", "S. Scott", "A. Adams", "L. Nelson", "B. Mitchell", "C. Roberts", "N. Turner", "E. Phillips", "O. Campbell", "F. Parker", "G. Evans", "V. Edwards", "K. Collins"];
  const mockNames = side === "home" ? homeNames : awayNames;
  return <div className={styles.gameDataMatch}>
    <div className={styles.gameDataMatchHero}>
      <div className={styles.gameDataMatchTop}><button type="button" aria-label={`Back to ${league.name}`} onClick={onBack}><ArrowLeft size={23} /></button><span className={styles.gameDataMatchTopIcons}><button type="button" aria-label="Share match" onClick={onShare}><Share size={23} /></button><button type="button" aria-label="More match options" onClick={onMore}><EllipsisVertical size={23} /></button></span></div>
      <div className={styles.gameDataMatchLeague}>{league.flag} &nbsp;{league.name}</div>
      <div className={styles.gameDataMatchDate}>Mon, 28 September 2026{match.time ? `, ${match.time}` : ""}</div>
      <div className={styles.gameDataMatchScore}><GameTeamLogo leagueId={league.id} matchIndex={matchIndex} large /><strong>{match.homeScore ?? "–"}<small> - </small>{match.awayScore ?? "–"}</strong><GameTeamLogo leagueId={league.id} matchIndex={matchIndex} away large /></div>
      <div className={styles.gameDataMatchNames}><span>{match.home}</span><span>{match.away}</span></div>
    </div>
    <div className={styles.gameDataMatchTabs}>{(["details", "stats", "lineups"] as const).map((item) => <button type="button" key={item} className={tab === item ? styles.gameDataMatchTabActive : ""} onClick={() => onTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {scheduled && tab !== "lineups" ? <div className={styles.gameDataScheduled}><b>Scheduled</b><span>Game starts at {match.time}.</span></div> : tab === "details" ? <>
      <div className={styles.gameDataPeriod}><span /> <span>T</span></div>
      <div className={styles.gameDataPeriodScore}><GameTeamLogo leagueId={league.id} matchIndex={matchIndex} /><span>{home > 2 ? 2 : home}</span><span>{home > 4 ? 2 : Math.max(0, home - 2)}</span><span>{Math.max(0, home - 4)}</span><b>{match.homeScore ?? "–"}</b></div>
      <div className={styles.gameDataPeriodScore}><GameTeamLogo leagueId={league.id} matchIndex={matchIndex} away /><span>{away > 1 ? 1 : away}</span><span>{away > 2 ? 1 : Math.max(0, away - 1)}</span><span>{Math.max(0, away - 2)}</span><b>{match.awayScore ?? "–"}</b></div>
      <div className={styles.gameDataGoalieStrip}><GameTeamLogo leagueId={league.id} matchIndex={matchIndex} /><span>Goalkeeper <b>.923</b></span><GameTeamLogo leagueId={league.id} matchIndex={matchIndex} away /><span>Goalkeeper <b>.917</b></span></div>
      {([0, 1, 2] as const).map((period) => <div key={period}><div className={styles.gameDataPeriod}>{period + 1}{period === 0 ? "st" : period === 1 ? "nd" : "rd"} period</div>{goals.filter((goal) => goal.period === period).map((goal, index) => <div key={`${goal.time}-${index}`} className={`${styles.gameDataEvent} ${goal.side === "away" ? styles.gameDataEventAway : ""}`}><time>{goal.time}</time><span className={styles.gameDataEventBadge}>{goal.score}</span><span><b>{goal.side === "home" ? homeNames[index % homeNames.length] : awayNames[index % awayNames.length]}</b><small>Goal</small></span></div>)}</div>)}
    </> : tab === "stats" ? <div className={styles.gameDataStats}>
      <GameStatRow label="Shots on Goal" home={shotHome} away={shotAway} />
      <GameStatRow label="Blocked Shots" home={11 + home} away={11 + away} />
      <GameStatRow label="Faceoffs won" home={24 + home} away={24 + away} />
      <GameStatRow label="Power Play Goals (PPG)" home={home > 2 ? 1 : 0} away={away > 2 ? 1 : 0} />
      <GameStatRow label="Short Handed Goals (SHG)" home={0} away={0} />
      <GameStatRow label="Penalties" home={3} away={2} />
      <GameStatRow label="Major Penalties" home={0} away={0} />
      <GameStatRow label="Penalty Minutes (PIM)" home={6} away={4} />
      <GameStatRow label="Goalie Saves" home={Math.max(0, shotAway - away)} away={Math.max(0, shotHome - home)} />
    </div> : <>
      <div className={styles.gameDataMatchSides}><button type="button" className={side === "home" ? styles.gameDataMatchSideActive : ""} onClick={() => onSide("home")}>{match.home}</button><button type="button" className={side === "away" ? styles.gameDataMatchSideActive : ""} onClick={() => onSide("away")}>{match.away}</button></div>
      {[["Forwards", 0, 10], ["Defensemen", 10, 16], ["Goalkeepers", 16, 18]] .map(([label, from, to]) => <div key={label as string}><div className={styles.gameDataLineupHeading}><b>{label}</b><span>G</span><span>A</span><span>TP</span></div>{mockNames.slice(from as number, to as number).map((name, index) => <div className={styles.gameDataLineupRow} key={name}><span>{(from as number) + index + 5}</span><b>{name}</b><i>{league.flag}</i><span>0</span><span>0</span><span>0</span></div>)}</div>)}
    </>}
  </div>;
}

function GameMatchMockSticky({ match, tab, onBack, onTab, onShare, onMore }: { match: CapturedMatch; tab: "details" | "stats" | "lineups"; onBack: () => void; onTab: (tab: "details" | "stats" | "lineups") => void; onShare: () => void; onMore: () => void }) {
  return <div className={styles.gameDataSticky}><div className={styles.gameDataStickyTop}><button type="button" aria-label="Back to league" onClick={onBack}><ArrowLeft size={23} /></button><strong>{match.homeScore === undefined ? match.time : `Final ${match.homeScore} - ${match.awayScore}`}</strong><div className={styles.gameDataStickyActions}><button type="button" aria-label="Share match" onClick={onShare}><Share size={20} /></button><button type="button" aria-label="More match options" onClick={onMore}><EllipsisVertical size={21} /></button></div></div><div className={styles.gameDataStickyTabs}>{(["details", "stats", "lineups"] as const).map((item) => <button type="button" key={item} className={tab === item ? styles.gameDataMatchTabActive : ""} onClick={() => onTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>;
}

function GameMatchPage({ exact, league, match, matchIndex, tab, side, onBack, onTab, onSide, onShare, onMore }: { exact: boolean; league: CapturedLeague; match: CapturedMatch; matchIndex: number; tab: "details" | "stats" | "lineups"; side: "home" | "away"; onBack: () => void; onTab: (tab: "details" | "stats" | "lineups") => void; onSide: (side: "home" | "away") => void; onShare: () => void; onMore: () => void }) {
  if (!exact) return <GameMatchMock league={league} match={match} matchIndex={matchIndex} tab={tab} side={side} onBack={onBack} onTab={onTab} onSide={onSide} onShare={onShare} onMore={onMore} />;
  return <div className={styles.gameMatchCapture}>
    {tab === "details" ? <><div className={styles.gameMatchInitial} /><div className={styles.gameMatchEvents} /></> : tab === "stats" ? <><div className={styles.gameMatchStatsHero} /><div className={styles.gameMatchStats} /></> : <><div className={`${styles.gameLineupTop} ${side === "away" ? styles.gameLineupAwayTop : ""}`}><button type="button" className={styles.gameLineupHomeHit} aria-label="Home lineup" onClick={() => onSide("home")} /><button type="button" className={styles.gameLineupAwayHit} aria-label="Away lineup" onClick={() => onSide("away")} /></div><div className={`${styles.gameLineupMid} ${side === "away" ? styles.gameLineupAwayMid : ""}`} /><div className={`${styles.gameLineupEnd} ${side === "away" ? styles.gameLineupAwayEnd : ""}`} /></>}
    <div className={styles.gameMatchControls}><button type="button" className={styles.gameMatchBack} aria-label="Back to Czechia Extraliga" onClick={onBack} /><button type="button" className={styles.gameMatchShareHit} aria-label="Share match" onClick={onShare} /><button type="button" className={styles.gameMatchMoreHit} aria-label="More match options" onClick={onMore} /><button type="button" className={styles.gameMatchDetailsHit} aria-label="Details tab" onClick={() => onTab("details")} /><button type="button" className={styles.gameMatchStatsHit} aria-label="Stats tab" onClick={() => onTab("stats")} /><button type="button" className={styles.gameMatchLineupsHit} aria-label="Lineups tab" onClick={() => onTab("lineups")} /></div>
  </div>;
}

function OpeningLogo({ opening, large = false }: { opening: OpeningRecord; large?: boolean }) {
  const zoom = large ? 1.5 : 1;
  return <i className={`${styles.openingDataLogo} ${large ? styles.openingDataLogoLarge : ""}`} aria-hidden="true" style={{ backgroundImage: `url('/graet-replica/captures/${opening.image}.png')`, backgroundSize: `${375 * zoom}px ${812 * zoom}px`, backgroundPosition: `${-35 * zoom}px ${-(opening.y + 18) * zoom}px` }} />;
}

function OpeningCard({ opening, onClick }: { opening: OpeningRecord; onClick: () => void }) {
  return <button type="button" className={`${styles.openingDataCard} ${opening.positions.length > 3 ? styles.openingDataCardLong : ""}`} aria-label={`Open ${opening.team} opening`} onClick={onClick}>
    <span className={styles.openingDataCardTop}><OpeningLogo opening={opening} /><span className={styles.openingDataIdentity}><strong>{opening.team}</strong><small>2026–2027 · {opening.country}</small></span><span className={styles.openingDataMatch}>● Low</span></span>
    <span className={styles.openingDataPositions}>{opening.positions.map((item) => `${item.spots}× ${item.name}`).join(" · ")}</span>
    <span className={styles.openingDataMeta}><b>{opening.tier}</b><span>{opening.nextStep}</span>{opening.applied && <em>· {opening.applied} applied</em>}</span>
  </button>;
}

function OpeningDetailPage({ opening, onBack }: { opening: OpeningRecord; onBack: () => void }) {
  return <div className={styles.openingDataDetail}>
    <div className={styles.openingDataHeader}><button type="button" aria-label="Back" onClick={onBack}><ArrowLeft size={24} /></button><strong>Opening</strong></div>
    <div className={styles.openingDataDetailTitle}><OpeningLogo opening={opening} large /><span><h1>{opening.team}</h1><p>2026–2027 · {opening.country} · {opening.tier}</p></span></div>
    <div className={styles.openingDataMatchBox}>Low match</div>
    <section><h2>Open positions</h2>{opening.positions.map((item) => <div className={styles.openingDataPosition} key={item.name}><strong>{item.name}</strong><b>{item.spots} {item.spots === 1 ? "spot" : "spots"}</b></div>)}</section>
    <section><h2>Details</h2><dl><dt>Next step</dt><dd>{opening.nextStep}</dd><dt>Location</dt><dd>{opening.location ?? opening.country}</dd></dl></section>
    <section><h2>Description</h2><p className={styles.openingDataDescription}>{opening.description ?? `${opening.team} is recruiting for the 2026–2027 season.`}</p><div className={styles.openingDataPoster}><OpeningLogo opening={opening} /><span><strong>{opening.postedBy ?? opening.team}</strong><small>Posted by</small></span></div></section>
  </div>;
}

function OpeningApplyPage({ opening, position, message, availability, onBack, onPosition, onMessage, onAvailability, onSubmit }: { opening: OpeningRecord; position: string; message: string; availability: string; onBack: () => void; onPosition: (value: string) => void; onMessage: (value: string) => void; onAvailability: (value: string) => void; onSubmit: () => void }) {
  return <div className={styles.openingApplyPage}>
    <div className={styles.openingDataHeader}><button type="button" aria-label="Back to opening" onClick={onBack}><ArrowLeft size={24} /></button><strong>Apply</strong></div>
    <div className={styles.openingApplyTeam}><OpeningLogo opening={opening} large /><span><strong>{opening.team}</strong><small>2026–2027 · {opening.tier} · {opening.country}</small></span></div>
    <label className={styles.openingApplyLabel}>Position</label><div className={styles.openingApplyPositions}>{["Forward", "Defenseman", "Goalie"].map((choice) => <button type="button" key={choice} className={position === choice ? styles.openingApplyPositionActive : ""} onClick={() => onPosition(choice)}>{choice}</button>)}</div>
    <label className={styles.openingApplyLabel} htmlFor="graet-apply-message">Message <span>· optional</span></label><textarea id="graet-apply-message" placeholder="Tell the coach why you're a great fit..." value={message} onChange={(event) => onMessage(event.target.value)} />
    <label className={styles.openingApplyLabel} htmlFor="graet-apply-availability">Availability <span>· optional</span></label><input id="graet-apply-availability" placeholder="e.g. Available for tryout in July" value={availability} onChange={(event) => onAvailability(event.target.value)} />
    <div className={styles.openingApplyFooter}><button type="button" onClick={onSubmit}>Submit application</button></div>
  </div>;
}

function CaptureSlice({ file, from, height, children }: { file: string; from: number; height: number; children?: React.ReactNode }) { return <div className={styles.captureSlice} style={{ height, backgroundImage: `url('/graet-replica/captures/${file}.png')`, backgroundPosition: `0 -${from}px` }}>{children}</div>; }
function OnboardingCapture({ step, children }: { step: number; children?: React.ReactNode }) { return <div className={styles.onboardingCapture} style={{ backgroundImage: `url('/graet-replica/tenant-source/${onboardingCaptureFiles[step]}.png')` }}>{children}</div>; }

function CollegeCardHits({ name, top, favorite, onOpen, onFavorite, onFit }: { name: string; top: number; favorite: boolean; onOpen: () => void; onFavorite: () => void; onFit: () => void }) {
  return <>
    <button type="button" className={styles.collegeCardOpenHit} style={{ top }} aria-label={`View ${name}`} onClick={onOpen} />
    <button type="button" className={`${styles.collegeCardFavoriteHit} ${favorite ? styles.collegeCardSaved : ""}`} style={{ top: top + 109 }} aria-label={favorite ? `Remove ${name} from favorites` : `Save ${name} to favorites`} onClick={onFavorite}>{favorite && <Heart size={23} fill="currentColor" />}</button>
    <button type="button" className={styles.collegeCardFitHit} style={{ top: top + 109 }} aria-label={`Unlock ${name} fit`} onClick={onFit} />
  </>;
}

function MockCollegeDetail({ college, tab, favorite, notes, scrolled, onBack, onTab, onFavorite, onNotes, onFit }: { college: CollegeRecord; tab: "overview" | "academics"; favorite: boolean; notes: string; scrolled: boolean; onBack: () => void; onTab: (tab: "overview" | "academics") => void; onFavorite: () => void; onNotes: () => void; onFit: () => void }) {
  const satLow = college.sat ? college.sat - 100 : null;
  const satHigh = college.sat ? college.sat + 100 : null;
  return <div className={styles.mockCollegeDetail}>
    <div className={styles.mockCollegeHero}>
      <button type="button" className={styles.mockCollegeBack} aria-label="Back to colleges" onClick={onBack}><ArrowLeft size={27} /></button>
      <div className={styles.mockCollegeIdentity}><div className={styles.mockCollegeMonogram} aria-hidden="true">{college.name.slice(0, 1)}</div><div><span className={styles.mockCollegeLeague}>{college.league}</span><h1>{college.name}</h1><p><MapPin size={17} />{college.city}, {college.stateCode}</p></div><button type="button" className={styles.mockCollegeFavorite} aria-label={favorite ? `Remove ${college.name} from favorites` : `Save ${college.name} to favorites`} onClick={onFavorite}><Heart size={28} fill={favorite ? "currentColor" : "none"} /></button></div>
      <div className={styles.mockCollegeMetrics}><div><strong>{college.tuition ?? "—"}</strong><span>Tuition/yr</span></div><div><strong>{satLow ? `${satLow}–${satHigh}` : "—"}</strong><span>SAT range</span></div><div><strong>{college.students ?? "—"}</strong><span>Students</span></div></div>
    </div>
    <div className={styles.mockCollegeTabs}>{scrolled && <div className={styles.mockCollegeScrolledTitle}><button type="button" aria-label="Back to colleges" onClick={onBack}><ArrowLeft size={24} /></button><strong>{college.name}</strong></div>}<div className={styles.mockCollegeTabChoices}><button type="button" className={tab === "overview" ? styles.mockCollegeTabActive : ""} onClick={() => onTab("overview")}>Overview</button><button type="button" className={tab === "academics" ? styles.mockCollegeTabActive : ""} onClick={() => onTab("academics")}>Academics</button></div></div>
    {tab === "overview" ? <div className={styles.mockCollegeContent}>
      <section className={styles.mockCollegeNotes}><h2>My Notes</h2><button type="button" onClick={onNotes}>{notes || "+ Add notes"}</button></section>
      <section className={styles.mockCollegeFit}><div className={styles.mockCollegeFitTitle}><h2>Your fit</h2><strong>Unlock</strong></div><div className={styles.mockCollegeFitRow}><span>Academics</span><i /></div><div className={styles.mockCollegeFitRow}><span>Athletics</span><i /></div><div className={styles.mockCollegeFitRow}><span>Location</span><i /></div><button type="button" onClick={onFit}>Unlock college fit</button></section>
      <section className={styles.mockCollegeOverview}><h2>Overview</h2><div><span>Location</span><strong>{college.city}, {college.stateCode}</strong></div><div><span>School size</span><strong>{college.size?.split(" (")[0] ?? "—"}</strong></div><div><span>Avg. cost after aid</span><strong>{college.tuition ?? "—"} avg. per year after aid</strong></div><div><span>SAT range</span><strong>{satLow ? `SAT ${satLow} – ${satHigh}` : "—"}</strong></div><div><span>Hockey league</span><strong>{college.league}</strong></div></section>
      <section className={styles.mockCollegePaths}><h2>Post-college paths</h2><p>Where alumni players ended up after college.</p>{[["NHL", "0.0%"], ["AHL", "0.0%"], ["Europe pro", "0.0%"], ["Left hockey", "60.5%"]].map(([label, percent]) => <div key={label}><span>{label}</span><strong>{percent}</strong><i style={{ ['--fill' as string]: percent }} /></div>)}</section>
      <section className={styles.mockCollegeFinancials}><h2>Financials</h2><p>Average net price by household income</p>{[["<$30k", "$10,969 per year"], ["$30–48k", "$14,672 per year"], ["$48–75k", "$19,579 per year"], ["$75–110k", "No data"], ["$110k+", "$41,860 per year"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}<p>Tuition</p><div><span>In state</span><strong>{college.tuition ?? "—"} per year</strong></div><div><span>Out of state</span><strong>{college.tuition ?? "—"} per year</strong></div></section>
    </div> : <div className={styles.mockCollegeContent}>
      <section className={styles.mockCollegeAdmissions}><h2>Admissions &amp; graduation</h2><p>How competitive admission is, and how many students successfully graduate.</p><div><span>Acceptance rate</span><strong>57%</strong><i style={{ ['--fill' as string]: "57%" }} /></div><div><span>Graduation rate</span><strong>73%</strong><i style={{ ['--fill' as string]: "73%" }} /></div></section>
      <section className={styles.mockCollegeAcademicScores}><h2>GPA &amp; SAT</h2><p>These ranges reflect what most admitted students scored.</p>{[["3.75 – 4.00", "41%"], ["3.50 – 3.74", "26%"], ["3.25 – 3.49", "15%"], ["3.00 – 3.24", "10%"], ["Below 3.00", "9%"]].map(([label, percent]) => <div key={label}><span>{label}</span><i style={{ ['--fill' as string]: percent }} /><strong>{percent}</strong></div>)}<div><span>Total SAT</span><strong>{satLow ? `${satLow} – ${satHigh}` : "—"}</strong></div><div><span>Reading</span><strong>{satLow !== null && satHigh !== null ? `${Math.round(satLow / 2)} – ${Math.round(satHigh / 2)}` : "—"}</strong></div><div><span>Math</span><strong>{satLow !== null && satHigh !== null ? `${Math.round(satLow / 2)} – ${Math.round(satHigh / 2)}` : "—"}</strong></div></section>
      <section className={styles.mockCollegeAdditional}><h2>Additional stats</h2><div><span>Student-to-faculty ratio</span><strong>10</strong></div><div><span>Total undergrads</span><strong>{college.students ?? "—"}</strong></div></section>
    </div>}
  </div>;
}

const collegeStates = "Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada New_Hampshire New_Jersey New_Mexico New_York North_Carolina North_Dakota Ohio Oklahoma Oregon Pennsylvania Rhode_Island South_Carolina South_Dakota Tennessee Texas Utah Vermont Virginia Washington West_Virginia Wisconsin Wyoming".split(" ").map((name) => name.replaceAll("_", " "));
const collegeStateRows = [
  ["Alabama", "Alaska", "Arizona", "Arkansas"], ["California", "Colorado", "Connecticut"],
  ["Delaware", "Florida", "Georgia", "Hawaii"], ["Idaho", "Illinois", "Indiana", "Iowa"],
  ["Kansas", "Kentucky", "Louisiana", "Maine"], ["Maryland", "Massachusetts", "Michigan"],
  ["Minnesota", "Mississippi", "Missouri"], ["Montana", "Nebraska", "Nevada"],
  ["New Hampshire", "New Jersey", "New Mexico"], ["New York", "North Carolina", "North Dakota"],
  ["Ohio", "Oklahoma", "Oregon"], ["Pennsylvania", "Rhode Island"],
  ["South Carolina", "South Dakota", "Tennessee"], ["Texas", "Utah", "Vermont", "Virginia"],
  ["Washington", "West Virginia", "Wisconsin"], ["Wyoming"],
];
export function GraetReplica() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [history, setHistory] = useState<{ screen: Screen; scrollTop: number }[]>([]);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [nationalityQuery, setNationalityQuery] = useState("");
  const [code, setCode] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [nationality, setNationality] = useState("Canada");
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [searchStatus, setSearchStatus] = useState("Yes, actively looking");
  const [playingArea, setPlayingArea] = useState("Open to everything");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("Forward");
  const [message, setMessage] = useState("");
  const [availability, setAvailability] = useState("");
  const [selectedOpening, setSelectedOpening] = useState("Minnesota Blue Ox");
  const [submittedApplications, setSubmittedApplications] = useState<string[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("Thomas Balogh");
  const [relatedPlayerHistory, setRelatedPlayerHistory] = useState<{ name: string; tab: "wall" | "stats" | "bio"; scrollTop: number }[]>([]);
  const [profileTab, setProfileTab] = useState<"wall" | "stats" | "bio">("wall");
  const [profileScrollTop, setProfileScrollTop] = useState(0);
  const [filterSelections, setFilterSelections] = useState<string[]>([]);
  const [filterSectionsEnabled, setFilterSectionsEnabled] = useState<Record<string, boolean>>({ Position: true, "Year of birth": true, Gender: true, Nationality: true });
  const [appliedFilters, setAppliedFilters] = useState<string[]>([]);
  const [showAllNationalities, setShowAllNationalities] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
  const [trialBilling, setTrialBilling] = useState<"yearly" | "monthly">("yearly");
  const [trialActive, setTrialActive] = useState(false);
  const [premiumFeature, setPremiumFeature] = useState("Activity");
  const [premiumFeatureParent, setPremiumFeatureParent] = useState<string | null>(null);
  const [premiumGoal, setPremiumGoal] = useState("");
  const [premiumGoals, setPremiumGoals] = useState<Record<string, string>>({});
  const [aiCoachDraft, setAiCoachDraft] = useState("");
  const [aiCoachMessages, setAiCoachMessages] = useState<{ role: "you" | "coach"; text: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [supportResolved, setSupportResolved] = useState(false);
  const [supportComposerOpen, setSupportComposerOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportRequests, setSupportRequests] = useState<{ subject: string; message: string }[]>([]);
  const [featureTourStep, setFeatureTourStep] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [feedScrollTop, setFeedScrollTop] = useState(0);
  const [feedLiked, setFeedLiked] = useState(false);
  const [feedPremiumLiked, setFeedPremiumLiked] = useState(false);
  const [feedCoachLiked, setFeedCoachLiked] = useState(false);
  const [feedShaneLiked, setFeedShaneLiked] = useState(false);
  const [feedBradleyLiked, setFeedBradleyLiked] = useState(false);
  const [feedFollowing, setFeedFollowing] = useState<string[]>([]);
  const [feedAddOpen, setFeedAddOpen] = useState(false);
  const [feedPostAction, setFeedPostAction] = useState<{ kind: "comments" | "share" | "options"; post: string } | null>(null);
  const [feedCommentDraft, setFeedCommentDraft] = useState("");
  const [feedComments, setFeedComments] = useState<Record<string, string[]>>({});
  const [feedLinkCopied, setFeedLinkCopied] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<StaffName>("Trevor Daly");
  const [coachTab, setCoachTab] = useState<"bio" | "wall">("bio");
  const [coachScrollTop, setCoachScrollTop] = useState(0);
  const [matchScrollTop, setMatchScrollTop] = useState(0);
  const [matchTab, setMatchTab] = useState<"details" | "stats" | "lineups">("details");
  const [matchSide, setMatchSide] = useState<"home" | "away">("home");
  const [selectedGameDate, setSelectedGameDate] = useState("2026-09-28");
  const [selectedGameLeague, setSelectedGameLeague] = useState("extraliga");
  const [selectedGameMatch, setSelectedGameMatch] = useState(0);
  const [favoriteGameLeagues, setFavoriteGameLeagues] = useState<string[]>([]);
  const [gameAction, setGameAction] = useState<"share" | "more" | null>(null);
  const [collegeTab, setCollegeTab] = useState<"overview" | "academics">("overview");
  const [selectedCollege, setSelectedCollege] = useState("Hobart William Smith Colleges");
  const [collegeFavorites, setCollegeFavorites] = useState<string[]>([]);
  const [collegeScrollTop, setCollegeScrollTop] = useState(0);
  const [collegeQuery, setCollegeQuery] = useState("");
  const [collegeStateQuery, setCollegeStateQuery] = useState("");
  const [collegeSelections, setCollegeSelections] = useState<string[]>([]);
  const [collegeApplied, setCollegeApplied] = useState<string[]>([]);
  const [collegeZip, setCollegeZip] = useState("");
  const [collegeMinSat, setCollegeMinSat] = useState("");
  const [collegeMaxSat, setCollegeMaxSat] = useState("");
  const [collegeHasNotes, setCollegeHasNotes] = useState(false);
  const [collegeSort, setCollegeSort] = useState("Default Ranking");
  const [collegeDraftZip, setCollegeDraftZip] = useState("");
  const [collegeDraftMinSat, setCollegeDraftMinSat] = useState("");
  const [collegeDraftMaxSat, setCollegeDraftMaxSat] = useState("");
  const [collegeDraftHasNotes, setCollegeDraftHasNotes] = useState(false);
  const [collegeDraftSort, setCollegeDraftSort] = useState("Default Ranking");
  const [collegeNotesByName, setCollegeNotesByName] = useState<Record<string, string>>({});
  const [collegeNotesDraft, setCollegeNotesDraft] = useState("");
  const [collegeEditingNotes, setCollegeEditingNotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gameCalendarRef = useRef<HTMLDivElement>(null);
  const lastCalendarScreenRef = useRef<Screen | null>(null);
  const restoreScrollRef = useRef<number | null>(null);

  useEffect(() => {
    const tourFrames = [1, 2, 3].map((step) => {
      const image = new Image();
      image.src = `/graet-replica/captures/feature-tour-${step}.png`;
      return image;
    });
    return () => { tourFrames.forEach((image) => { image.src = ""; }); };
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("screen");
    if (requested && [...flow, "premiumDetail", "premiumFeature", "featureTour", "notificationsCenter", "gameTracker", "colleges", "collegeDetail", "collegeFilters", "support", "feed", "coachProfile", "games", "gameList", "gameLeague", "gameMatch", "players", "playerSearch", "playerFilters", "playerProfile", "profile", "openings", "opening", "apply", "applications", "ai", "chat"].includes(requested)) setScreen(requested as Screen);
  }, []);

  const go = useCallback((next: Screen) => {
    const currentScroll = scrollRef.current?.scrollTop ?? 0;
    setHistory((current) => [...current, { screen, scrollTop: currentScroll }]);
    restoreScrollRef.current = 0;
    setScreen(next);
  }, [screen]);
  const jump = useCallback((next: Screen) => {
    setHistory([]);
    restoreScrollRef.current = 0;
    setScreen(next);
  }, []);
  const back = useCallback(() => {
    const previous = history.at(-1);
    if (previous) {
      setHistory(history.slice(0, -1));
      restoreScrollRef.current = previous.scrollTop;
      setScreen(previous.screen);
    } else {
      restoreScrollRef.current = 0;
      setScreen(fallbackBack[screen] ?? (flow.includes(screen) ? flow[Math.max(0, flow.indexOf(screen) - 1)] : "career"));
    }
  }, [history, screen]);
  const backFromPlayer = () => {
    if (relatedPlayerHistory.length) {
      const previous = relatedPlayerHistory.at(-1)!;
      setSelectedPlayer(previous.name);
      setRelatedPlayerHistory(relatedPlayerHistory.slice(0, -1));
      setProfileTab(previous.tab);
      setProfileScrollTop(previous.scrollTop);
      restoreScrollRef.current = previous.scrollTop;
    } else back();
  };
  useLayoutEffect(() => {
    if (restoreScrollRef.current === null || !scrollRef.current) return;
    const target = restoreScrollRef.current;
    scrollRef.current.scrollTop = target;
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = target; });
    restoreScrollRef.current = null;
  }, [screen, selectedPlayer]);
  useLayoutEffect(() => {
    if (screen === "trial" && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [screen, trialBilling]);
  useLayoutEffect(() => {
    if (screen !== "gameList" && screen !== "gameLeague") { lastCalendarScreenRef.current = null; return; }
    const calendar = gameCalendarRef.current;
    const selected = calendar?.querySelector<HTMLElement>(`[data-captured-date="${selectedGameDate}"]`);
    if (calendar && selected) {
      const left = selected.offsetLeft - (calendar.clientWidth - selected.clientWidth) / 2;
      if (lastCalendarScreenRef.current === screen) calendar.scrollTo({ left, behavior: "smooth" });
      else calendar.scrollLeft = left;
    }
    lastCalendarScreenRef.current = screen;
  }, [screen, selectedGameDate]);
  const nextOnboarding = () => go(flow[Math.min(flow.indexOf(screen) + 1, flow.length - 1)]);
  const startMockTrial = () => {
    setTrialActive(true);
    if (history.at(-1)?.screen === "leagues") { nextOnboarding(); return; }
    const origin = history.at(-2) ?? { screen: "career" as Screen, scrollTop: 0 };
    setHistory([...history.slice(0, -2), origin]);
    setPremiumFeature("Trial active");
    setPremiumFeatureParent(null);
    restoreScrollRef.current = 0;
    setScreen("premiumFeature");
  };
  const openPremiumFeature = (feature: string) => {
    if (trialActive && screen === "premiumFeature") {
      setPremiumFeatureParent(premiumFeature);
      setPremiumFeature(feature);
      setPremiumGoal(premiumGoals[feature] ?? "");
      return;
    }
    setPremiumFeatureParent(null);
    setPremiumFeature(feature);
    setPremiumGoal(premiumGoals[feature] ?? "");
    go(trialActive ? "premiumFeature" : "premiumDetail");
  };
  const openCollegeFit = (name: string) => {
    setSelectedCollege(name);
    openPremiumFeature("College fit");
  };
  const openFeedPostAction = (kind: "comments" | "share" | "options", post: string) => {
    setFeedLinkCopied(false);
    setFeedCommentDraft("");
    setFeedPostAction({ kind, post });
  };
  const copyFeedPostLink = (post: string) => {
    void navigator.clipboard?.writeText(`${window.location.origin}/preview-lab/replica/graet?screen=feed&post=${encodeURIComponent(post)}`);
    setFeedLinkCopied(true);
  };
  const closePremiumFeature = () => {
    if (premiumFeatureParent) { setPremiumFeature(premiumFeatureParent); setPremiumFeatureParent(null); }
    else back();
  };
  const changeMatchTab = (next: "details" | "stats" | "lineups") => { setMatchTab(next); setMatchScrollTop(0); scrollRef.current?.scrollTo(0, 0); };
  const gameCalendar = (league = false) => <div ref={gameCalendarRef} className={`${styles.gameCalendar} ${league ? styles.gameCalendarLeague : ""}`} aria-label="Games calendar">{calendarDates.map((date) => <button type="button" key={date.key} data-captured-date={date.key} className={date.key === selectedGameDate ? styles.gameCalendarToday : ""} aria-current={date.key === selectedGameDate ? "date" : undefined} onClick={() => { setSelectedGameDate(date.key); scrollRef.current?.scrollTo({ top: 0 }); }}><span>{date.key === "2026-09-28" ? "Today" : date.day}</span><small>{date.label}</small></button>)}</div>;
  const uncapturedGames = <div className={styles.gameUncaptured} role="status"><strong>{new Date(`${selectedGameDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</strong><span>No games</span></div>;
  const selectedLeague = capturedGameLeagues.find((league) => league.id === selectedGameLeague) ?? capturedGameLeagues[0];
  const selectedMatch = selectedLeague.matches[selectedGameMatch];
  const exactSpartaMatch = selectedGameLeague === "extraliga" && selectedGameMatch === 0;
  const openGameLeague = (leagueId: string) => { setSelectedGameLeague(leagueId); go("gameLeague"); };
  const openGameMatch = (leagueId: string, matchIndex: number) => { setSelectedGameLeague(leagueId); setSelectedGameMatch(matchIndex); setMatchTab("details"); setMatchSide("home"); setMatchScrollTop(0); go("gameMatch"); };
  const toggle = (value: string, selected: string[], setSelected: (next: string[]) => void) => setSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  const filteredSearchPlayers = capturedSearchPlayers.filter((item) => {
    const positions = appliedFilters.filter((value) => ["Center", "Left winger", "Right winger", "Defenseman", "Goalie"].includes(value));
    const years = appliedFilters.filter((value) => /^20\d\d\+?$/.test(value));
    const countries = appliedFilters.filter((value) => /\b[A-Z]{3}$/.test(value));
    const genders = appliedFilters.filter((value) => ["Men", "Women", "Not stated"].includes(value));
    return (!positions.length || positions.includes(item.position)) && (!years.length || years.includes(item.year) || (years.includes("2006+") && Number(item.year) <= 2006)) && (!countries.length || countries.some((value) => value.endsWith(item.country))) && (!genders.length || genders.includes("Men"));
  });
  const collegeFilterActive = Boolean(collegeQuery || collegeApplied.length || collegeZip || collegeMinSat || collegeMaxSat || collegeHasNotes || collegeSort !== "Default Ranking");
  const selectedOpeningRecord = capturedOpenings.find((item) => item.team === selectedOpening) ?? capturedOpenings[0];
  const matchesCollegeGroup = (choices: string[], match: string) => {
    const selected = collegeApplied.filter((choice) => choices.includes(choice));
    return selected.length === 0 || selected.includes(match);
  };
  const collegeResults = capturedColleges.filter((college) => (!collegeQuery || [college.name, college.city, college.state, college.league].some((value) => value.toLowerCase().includes(collegeQuery.trim().toLowerCase())))
    && matchesCollegeGroup(collegeStates, college.state)
    && (!collegeApplied.some((choice) => ["Small (<3k)", "Medium (3-9k)", "Large (9-15k)", "Very Large (>15k)"].includes(choice)) || Boolean(college.size && matchesCollegeGroup(["Small (<3k)", "Medium (3-9k)", "Large (9-15k)", "Very Large (>15k)"], college.size)))
    && (!collegeApplied.some((choice) => ["City", "Suburban", "Rural"].includes(choice)) || Boolean(college.urbanicity && matchesCollegeGroup(["City", "Suburban", "Rural"], college.urbanicity)))
    && (!collegeZip || college.zip === collegeZip)
    && (!collegeMinSat || Boolean(college.sat && college.sat >= Number(collegeMinSat)))
    && (!collegeMaxSat || Boolean(college.sat && college.sat <= Number(collegeMaxSat)))
    && (!collegeHasNotes || Boolean(collegeNotesByName[college.name]?.trim())));
  if (collegeSort === "Alphabetical") collegeResults.sort((a, b) => a.name.localeCompare(b.name));
  if (collegeSort === "SAT Ascending") collegeResults.sort((a, b) => (a.sat ?? Infinity) - (b.sat ?? Infinity));
  if (collegeSort === "SAT Descending") collegeResults.sort((a, b) => (b.sat ?? -Infinity) - (a.sat ?? -Infinity));
  const selectedCollegeRecord = capturedColleges.find((college) => college.name === selectedCollege) ?? capturedColleges[0];
  const collegeFavorite = collegeFavorites.includes(selectedCollege);
  const collegeNotes = collegeNotesByName[selectedCollege] ?? "";
  const setCollegeFavorite = (favorite: boolean) => setCollegeFavorites((current) => favorite ? [...new Set([...current, selectedCollege])] : current.filter((name) => name !== selectedCollege));
  const openCollege = (name: string) => { setSelectedCollege(name); setCollegeTab("overview"); setCollegeScrollTop(0); go("collegeDetail"); };
  const openCollegeFilters = () => {
    setCollegeSelections(collegeApplied);
    setCollegeDraftZip(collegeZip);
    setCollegeDraftMinSat(collegeMinSat);
    setCollegeDraftMaxSat(collegeMaxSat);
    setCollegeDraftHasNotes(collegeHasNotes);
    setCollegeDraftSort(collegeSort);
    setCollegeStateQuery("");
    go("collegeFilters");
  };
  const editCollegeNotes = () => { setCollegeNotesDraft(collegeNotes); setCollegeEditingNotes(true); };
  const dark = screen === "welcome" || screen === "role";
  const browsing = !flow.slice(0, -1).includes(screen);
  const playerOrigin = history.findLast((item) => item.screen !== "playerProfile")?.screen;
  const tab: Tab = screen === "premiumFeature" && premiumFeature === "AI Coach" ? "ai" : screen === "playerProfile" ? playerOrigin === "feed" || playerOrigin === "coachProfile" ? "home" : playerOrigin === "profile" ? "profile" : "explore" : ["career", "premiumDetail", "premiumFeature", "notificationsCenter", "gameTracker", "colleges", "collegeDetail", "collegeFilters", "feed", "coachProfile", "games", "gameList", "gameLeague", "gameMatch"].includes(screen) ? "home" : screen === "profile" ? "profile" : ["players", "playerSearch", "playerFilters", "openings", "opening", "apply", "applications"].includes(screen) ? "explore" : screen === "ai" ? "ai" : "chat";
  const coachAsset = selectedCoach === "Matt Overeem" ? null : `coach-${selectedCoach === "Tim Tobin" ? "tim" : "trevor"}-${coachTab}`;
  const coachHeaderCollapsed = coachTab === "wall" && coachScrollTop > 355;
  const onboardingStatus = screen === "email" ? onboardingCaptureFiles[2] : screen === "verify" ? onboardingCaptureFiles[4] : screen === "name" ? onboardingCaptureFiles[6] : screen === "nationality" ? onboardingCaptureFiles[9] : screen === "photo" ? onboardingCaptureFiles[11] : screen === "interests" ? onboardingCaptureFiles[12] : screen === "leagues" ? onboardingCaptureFiles[16] : undefined;
  const statusImage = onboardingStatus ?? (screen === "playerProfile" && selectedPlayer === "Thomas Balogh" ? (profileScrollTop > 440 ? "profile-100" : `profile-${profileTab === "wall" ? 99 : profileTab === "stats" ? 107 : 112}`) : screen === "coachProfile" ? coachAsset ? `${coachAsset}-${coachScrollTop > 70 ? "lower" : "top"}` : "coach-tim-bio-top" : screen === "feed" ? "feed-top" : screen === "gameMatch" && matchTab === "lineups" && matchSide === "away" ? "games-lineup-away-top" : screen === "collegeDetail" ? `college-${collegeTab === "overview" ? (collegeScrollTop > 240 ? 79 : 78) : (collegeScrollTop > 240 ? 83 : 82)}` : capturedStatus[screen]);
  const statusUrl = statusImage ? `/graet-replica/${statusImage.startsWith("s0") ? "tenant-source" : "captures"}/${statusImage}.png` : undefined;
  const phoneRoot = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("main > div");
  const openCoach = (name: StaffName) => { setSelectedCoach(name); setCoachTab("bio"); setCoachScrollTop(0); go("coachProfile"); };
  const openPlayer = (name: string) => { setSelectedPlayer(name); setRelatedPlayerHistory([]); setProfileTab("wall"); setProfileScrollTop(0); go("playerProfile"); };

  const primary = (label: string, onClick: () => void, disabled = false) => <button className={styles.primary} type="button" onClick={onClick} disabled={disabled}>{label}</button>;
  const top = (title?: string, dots?: number) => <div className={styles.topRow}><button className={styles.back} type="button" aria-label="Back" onClick={back}><ArrowLeft size={23} /></button>{title && <strong>{title}</strong>}{dots && <div className={styles.dots}>{[0, 1, 2, 3, 4].map((index) => <i key={index} className={index === dots - 1 ? styles.dotCurrent : ""} />)}</div>}</div>;
  const bottomAction = (content: React.ReactNode) => <div className={styles.bottomAction}>{content}</div>;
  const onboardingPage = (title: string, subtitle: string | null, content: React.ReactNode, action?: React.ReactNode, dots?: number) => <div className={styles.onboardingPage}>{top(undefined, dots)}<h1>{title}</h1>{subtitle && <p className={styles.intro}>{subtitle}</p>}<div className={styles.onboardingContent}>{content}</div>{action && bottomAction(action)}</div>;

  let body: React.ReactNode;
  switch (screen) {
    case "welcome": body = <div className={styles.welcomeCapture}><button type="button" aria-label="Get started" onClick={nextOnboarding} /></div>; break;
    case "email": body = <OnboardingCapture step={2}>
      <button className={styles.onboardingBackHit} type="button" aria-label="Back" onClick={back} />
      <label className={styles.emailCaptureField} aria-label="Email">
        <input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailError(false); }} />
      </label>
      {emailError && <span className={styles.emailCaptureError} role="alert">Enter a valid email address.</span>}
      <button className={styles.onboardingContinueHit} style={{ top: 665 }} type="button" aria-label="Continue" onClick={() => { if (/^\S+@\S+\.\S+$/.test(email)) nextOnboarding(); else setEmailError(true); }} />
    </OnboardingCapture>; break;
    case "verify": body = <OnboardingCapture step={4}>
      <button className={styles.onboardingBackHit} type="button" aria-label="Back" onClick={back} />
      {email && email !== "mndlovu76@yahoo.com" && <span className={styles.verifyEmailValue}>{email}</span>}
      <button className={styles.verifyResendHit} type="button" aria-label="Haven't received email?" onClick={() => setShowCodeInput(true)} />
      {!showCodeInput ? <button className={styles.verifyCodeHit} type="button" aria-label="Enter code" onClick={() => setShowCodeInput(true)} /> : <div className={styles.verifyCodePanel}><label>Verification code<input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoFocus /></label><button type="button" disabled={code.length !== 6} onClick={nextOnboarding}>Verify code</button></div>}
    </OnboardingCapture>; break;
    case "role": body = <div className={styles.roleCapture}>{["Hockey player", "Sport professional", "Parent of hockey player", "Fan / None of the above"].map((label, index) => <button key={label} type="button" aria-label={label} className={styles.roleChoiceHit} style={{ top: `${[295, 397, 519, 621][index]}px` }} onClick={nextOnboarding} />)}</div>; break;
    case "name": body = <OnboardingCapture step={6}>
      <button className={styles.onboardingBackHit} type="button" aria-label="Back" onClick={back} />
      <label className={`${styles.nameCaptureField} ${styles.nameCaptureFirst}`} aria-label="First name"><input type="text" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
      <label className={`${styles.nameCaptureField} ${styles.nameCaptureLast}`} aria-label="Last name"><input type="text" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
      <button className={styles.onboardingContinueHit} style={{ top: 665 }} type="button" aria-label="Continue" onClick={() => { if (firstName.trim() && lastName.trim()) nextOnboarding(); }} />
    </OnboardingCapture>; break;
    case "birthday": body = onboardingPage("When’s your birthday?", null, <div className={styles.birthFields}>{[["DD", birthDay, setBirthDay, 2], ["MM", birthMonth, setBirthMonth, 2], ["YYYY", birthYear, setBirthYear, 4]].map(([label, value, setter, max]) => <label key={label as string}><span>{label as string}</span><input inputMode="numeric" pattern="[0-9]*" maxLength={max as number} aria-label={label as string} value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value.replace(/\D/g, ""))} /></label>)}</div>, primary("Continue", nextOnboarding, birthDay.length !== 2 || birthMonth.length !== 2 || birthYear.length !== 4), 2); break;
    case "nationality": body = <OnboardingCapture step={9}>
      <button className={styles.onboardingBackHit} type="button" aria-label="Back" onClick={back} />
      {nationality !== "Canada" && <span className={styles.nationalityCaptureValue}>{nationality}</span>}
      <button className={styles.nationalityCaptureOpen} type="button" aria-label="Select nationality" onClick={() => setNationalityOpen(true)} />
      <button className={styles.onboardingContinueHit} style={{ top: 665 }} type="button" aria-label="Continue" onClick={nextOnboarding} />
      {nationalityOpen && <div className={styles.nationalitySheet} role="dialog" aria-label="Select nationality"><div className={styles.nationalitySheetHeader}><b>Select nationality</b><button type="button" aria-label="Close" onClick={() => setNationalityOpen(false)}>×</button></div><input autoFocus type="search" aria-label="Search nationalities" placeholder="Search" value={nationalityQuery} onChange={(event) => setNationalityQuery(event.target.value)} /><div className={styles.nationalitySheetList}>{["American Samoa", "Antarctica", "British Indian Ocean Territory", "Cambodia", "Cameroon", "Canada", "Czech Republic", "Denmark", "Finland", "France", "Germany", "Netherlands", "Norway", "Slovakia", "Sweden", "Switzerland", "United States"].filter((country) => country.toLowerCase().includes(nationalityQuery.toLowerCase())).map((country) => <button type="button" key={country} onClick={() => { setNationality(country); setNationalityOpen(false); }}>{country}</button>)}</div></div>}
    </OnboardingCapture>; break;
    case "photo": body = <OnboardingCapture step={11}>
      <button className={styles.onboardingBackHit} type="button" aria-label="Back" onClick={back} />
      <label className={styles.photoCapturePicker} aria-label="Upload profile picture">{selectedPhoto && <span style={{ backgroundImage: `url(${selectedPhoto})` }} />}<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setSelectedPhoto(typeof reader.result === "string" ? reader.result : null); reader.readAsDataURL(file); }} /></label>
      {selectedPhoto && <button className={styles.photoCaptureSave} type="button" onClick={nextOnboarding}>Save</button>}
      <button className={styles.photoCaptureSkip} type="button" aria-label="Skip" onClick={nextOnboarding} />
    </OnboardingCapture>; break;
    case "interests": body = <OnboardingCapture step={12}>
      <button className={styles.onboardingBackHit} type="button" aria-label="Back" onClick={back} />
      {interestChoices.map((choice, index) => <button type="button" key={choice} className={`${styles.onboardingChoiceHit} ${selectedInterests.includes(choice) ? styles.onboardingChoiceSelected : ""}`} style={{ left: 20, top: 181 + index * 94, width: 335, height: 83 }} aria-label={choice} aria-pressed={selectedInterests.includes(choice)} onClick={() => toggle(choice, selectedInterests, setSelectedInterests)} />)}
      {selectedInterests.length > 0 && <button className={styles.onboardingActiveContinue} type="button" onClick={nextOnboarding}>Continue</button>}
    </OnboardingCapture>; break;
    case "searchPreferences": body = onboardingPage("Tell us about your search", "A few details help coaches and openings match you for 2027–28.", <div className={styles.searchPreferences}><h2>Are you open to a new team?</h2><div className={styles.choiceList}>{["Yes, actively looking", "Open to the right opportunity", "Not looking"].map((choice) => <button key={choice} type="button" className={`${styles.choice} ${searchStatus === choice ? styles.selected : ""}`} onClick={() => setSearchStatus(choice)}>{choice}{searchStatus === choice && <span className={styles.radioCheck}>✓</span>}</button>)}</div><h2>Where would you play?</h2><div className={styles.choiceList}>{["Open to everything", "North America", "Europe", "North America + Europe", "Local opportunities"].map((choice) => <button key={choice} type="button" className={`${styles.choice} ${playingArea === choice ? styles.selected : ""}`} onClick={() => setPlayingArea(choice)}>{choice}{playingArea === choice && <span className={styles.radioCheck}>✓</span>}</button>)}</div><h2>Preferred regions</h2><div className={styles.regionChips}>{["USA", "Canada", "Sweden", "Finland", "Czech Republic", "Slovakia", "Germany", "Austria", "Switzerland", "France", "Denmark", "Norway", "Latvia", "Hungary", "Slovenia", "Netherlands"].map((choice) => <button key={choice} type="button" className={selectedRegions.includes(choice) ? styles.selected : ""} onClick={() => toggle(choice, selectedRegions, setSelectedRegions)}>{choice}</button>)}</div><div className={styles.infoCard}><b>Coach visibility</b><p>Coaches can filter for players open to this region and season. Your private contact details stay protected.</p></div></div>, primary("Continue", nextOnboarding), 5); break;
    case "leagues": body = <OnboardingCapture step={16}>
      <button className={styles.onboardingBackHit} type="button" aria-label="Back" onClick={back} />
      {["NCAA", "CHL", "USHL", "NAHL", "NCDC", "AAA", "Prep School", "Canada Junior A", "Sweden", "Finland", "Any good fit"].map((choice, index) => <button key={choice} type="button" className={`${styles.onboardingChoiceHit} ${selectedLeagues.includes(choice) ? styles.onboardingChoiceSelected : ""}`} style={{ left: index === 10 ? 20 : index % 2 === 0 ? 20 : 193, top: index === 10 ? 550 : 181 + Math.floor(index / 2) * 72, width: index === 10 ? 335 : 162, height: 60 }} aria-label={choice} aria-pressed={selectedLeagues.includes(choice)} onClick={() => toggle(choice, selectedLeagues, setSelectedLeagues)} />)}
      {selectedLeagues.length > 0 && <button className={styles.onboardingActiveContinue} type="button" onClick={nextOnboarding}>Continue</button>}
    </OnboardingCapture>; break;
    case "trial": body = <div className={styles.trialCapture}><div className={styles.trialTopFrame}><button type="button" className={styles.trialYearHit} aria-label="Billed yearly" onClick={() => setTrialBilling("yearly")} /><button type="button" className={styles.trialMonthHit} aria-label="Billed monthly" onClick={() => setTrialBilling("monthly")} />{trialBilling === "monthly" && <div className={styles.trialMonthlySelection}><div><b>Billed yearly</b><strong>$129.99</strong><span>$10.83 / month</span><p>Free for 1 week, then $129.99/year</p></div><div><b>Billed monthly</b><strong>$24.99</strong><p>Free for 1 week, then $24.99/month</p></div></div>}</div><div className={styles.trialLowerFrame} /><div className={styles.trialSticky}><button type="button" className={styles.trialStartHit} aria-label="Start Free Trial" onClick={startMockTrial} /><button type="button" className={styles.trialLaterHit} aria-label="Maybe later" onClick={history.at(-1)?.screen === "leagues" ? nextOnboarding : back} /></div></div>; break;
    case "featureTour": body = null; break;
    case "premiumDetail": body = <div className={styles.premiumDetailCapture}><button type="button" className={styles.premiumCloseHit} aria-label="Close Premium details" onClick={back} /><button type="button" className={styles.premiumStartHit} aria-label="Start 1 week free trial" onClick={() => go("trial")} /><button type="button" className={styles.premiumLaterHit} aria-label="Not now" onClick={back} /></div>; break;
    case "premiumFeature": body = <div className={styles.premiumWorkspace}>
      <header><button type="button" aria-label="Back" onClick={closePremiumFeature}><ArrowLeft size={26} /></button><span>GRAET Premium</span></header>
      <h1>{premiumFeature}</h1>
      {premiumFeature === "Trial active" ? <section className={styles.premiumWorkspaceCard}><h2>Premium is unlocked</h2><p>Your Premium features are ready. Explore your goals, activity, contacts, and academics.</p><button type="button" onClick={() => openPremiumFeature("My Path")}>Explore Premium <ChevronRight size={20} /></button><button type="button" onClick={back}>Continue</button></section>
      : premiumFeature === "Season goal" || premiumFeature === "Academic goal" ? <section className={styles.premiumWorkspaceCard}><h2>{premiumFeature === "Season goal" ? "Set your season goal" : "Set your academic goal"}</h2><p>Keep your target in one place and update it as you progress.</p><label htmlFor="premium-goal">Your goal</label><textarea id="premium-goal" value={premiumGoal} onChange={(event) => setPremiumGoal(event.target.value)} placeholder={premiumFeature === "Season goal" ? "e.g. Improve my faceoff percentage" : "e.g. Reach a 3.5 GPA"} /><button type="button" disabled={!premiumGoal.trim()} onClick={() => { setPremiumGoals((current) => ({ ...current, [premiumFeature]: premiumGoal.trim() })); closePremiumFeature(); }}>Save goal</button></section>
      : premiumFeature === "Activity" ? <section className={styles.premiumWorkspaceCard}><h2>Recent activity</h2>{submittedApplications.length || feedFollowing.length ? <>{submittedApplications.map((team) => <p key={team}>Application sent to {team}</p>)}{feedFollowing.map((name) => <p key={name}>Following {name}</p>)}</> : <p>Your recent actions will appear here.</p>}</section>
      : premiumFeature === "My Path" ? <section className={styles.premiumWorkspaceCard}><h2>Your path</h2><p>Set goals and track your next steps.</p><button type="button" onClick={() => openPremiumFeature("Season goal")}>Season goal <ChevronRight size={20} /></button><button type="button" onClick={() => openPremiumFeature("Academic goal")}>Academic goal <ChevronRight size={20} /></button></section>
      : premiumFeature === "Contacts" ? <section className={styles.premiumWorkspaceCard}><h2>Your contacts</h2><p>Keep the coaches, scouts, and players you follow in one place.</p>{feedFollowing.length ? feedFollowing.map((name) => <p key={name}>{name}</p>) : <p>No contacts yet. Follow someone to add them here.</p>}</section>
      : premiumFeature === "College fit" ? <section className={styles.premiumWorkspaceCard}><h2>{selectedCollegeRecord.name}</h2><p>Compare your preferences with this school.</p><p>Location: {selectedCollegeRecord.city}, {selectedCollegeRecord.stateCode}</p><p>League: {selectedCollegeRecord.league}</p><p>Your fit score will update as you add academic and hockey goals.</p><button type="button" onClick={() => openPremiumFeature("Academic goal")}>Add academic goal <ChevronRight size={20} /></button></section>
      : premiumFeature === "AI Coach" ? <section className={styles.premiumWorkspaceCard}><h2>Ask your AI Coach</h2><p>Get help planning your next step.</p><div className={styles.premiumCoachMessages}>{aiCoachMessages.map((item, index) => <p key={index} className={item.role === "you" ? styles.premiumCoachOwn : ""}>{item.text}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); const question = aiCoachDraft.trim(); if (!question) return; setAiCoachMessages((current) => [...current, { role: "you", text: question }, { role: "coach", text: `Start with your season goal${premiumGoals["Season goal"] ? `: ${premiumGoals["Season goal"]}` : ""}. Track your games and shortlist teams that fit your priorities.` }]); setAiCoachDraft(""); }}><input aria-label="Ask AI Coach" value={aiCoachDraft} onChange={(event) => setAiCoachDraft(event.target.value)} placeholder="Ask about your next step" /><button type="submit" disabled={!aiCoachDraft.trim()}>Send</button></form></section>
      : <section className={styles.premiumWorkspaceCard}><h2>Academics</h2><p>{premiumGoals["Academic goal"] || "Track your academic goals alongside your hockey plans."}</p><button type="button" onClick={() => openPremiumFeature("Academic goal")}>Add academic goal <ChevronRight size={20} /></button></section>}
    </div>; break;
    case "notifications": body = <div className={styles.notificationsCapture}><button type="button" className={styles.notificationsGetHit} aria-label="Get notified" onClick={nextOnboarding} /><button type="button" className={styles.notificationsSkipHit} aria-label="Skip" onClick={nextOnboarding} /></div>; break;
    case "career": body = <div className={styles.careerCapture}>
      <div className={styles.careerCaptureHeader}>
        <button type="button" aria-label="Menu" className={styles.careerMenuHit} onClick={() => setMenuOpen(true)} />
        <button type="button" aria-label="Career" className={styles.careerTabHit} onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
        <button type="button" aria-label="Your Feed" className={styles.careerFeedHit} onClick={() => go("feed")} />
        <button type="button" aria-label="Games" className={styles.careerGamesHit} onClick={() => go("games")} />
        <button type="button" aria-label="Notifications" className={styles.careerNotificationsHit} onClick={() => go("notificationsCenter")} />
      </div>
      <div className={styles.careerCaptureInitial}>
        {firstName.trim() && <div className={styles.careerIdentityName}>Hey, {firstName.trim()}</div>}
        {birthYear && <div className={styles.careerIdentityYear}>{birthYear}</div>}
        <button type="button" aria-label={trialActive ? "Trial status" : "Start Premium trial"} className={styles.careerTrialHit} onClick={() => trialActive ? openPremiumFeature("Trial active") : go("premiumDetail")} />
        <button type="button" aria-label="Log a game" className={styles.careerLogHit} onClick={() => go("gameTracker")} />
        <button type="button" aria-label="Add season goal" className={styles.careerSeasonHit} onClick={() => openPremiumFeature("Season goal")} />
        <button type="button" aria-label="Add academic goal" className={styles.careerAcademicHit} onClick={() => openPremiumFeature("Academic goal")} />
        {premiumGoals["Season goal"] && <span className={`${styles.careerSavedGoal} ${styles.careerSavedSeason}`}>{premiumGoals["Season goal"]}</span>}
        {premiumGoals["Academic goal"] && <span className={`${styles.careerSavedGoal} ${styles.careerSavedAcademic}`}>{premiumGoals["Academic goal"]}</span>}
      </div>
      <div className={styles.careerCaptureLower}>
        <button type="button" aria-label="Activity" className={styles.careerActivityHit} onClick={() => openPremiumFeature("Activity")} />
        <button type="button" aria-label="My Path" className={styles.careerPathHit} onClick={() => openPremiumFeature("My Path")} />
        <button type="button" aria-label="Game Tracker" className={styles.careerTrackerHit} onClick={() => go("gameTracker")} />
      </div>
      <div className={styles.careerCaptureTools}>
        <button type="button" aria-label="Colleges" className={styles.careerCollegesHit} onClick={() => go("colleges")} />
        <button type="button" aria-label="Contacts" className={styles.careerContactsHit} onClick={() => openPremiumFeature("Contacts")} />
        <button type="button" aria-label="Academics" className={styles.careerAcademicsHit} onClick={() => openPremiumFeature("Academics")} />
        <button type="button" aria-label="Unlock AI assistant" className={styles.careerAssistantHit} onClick={() => trialActive ? openPremiumFeature("AI Coach") : go("ai")} />
      </div>
    </div>; break;
    case "gameTracker": body = <div className={styles.captureViewport} style={{ backgroundImage: "url('/graet-replica/captures/game-tracker.png')" }}><button type="button" className={styles.gamesCareerHit} aria-label="Career" onClick={back} /><button type="button" className={styles.gamesFeedHit} aria-label="Your Feed" onClick={() => go("feed")} /><button type="button" className={styles.gamesListHit} aria-label="Games" onClick={() => go("games")} /><button type="button" className={styles.trackerLogHit} aria-label="Log your first game" onClick={() => go("games")} /></div>; break;
    case "colleges": body = <div className={styles.collegeListCapture}>
      <div className={styles.collegeListHeader}>
        <button type="button" aria-label="Open menu" className={styles.collegeMenuHit} onClick={() => setMenuOpen(true)} />
        <button type="button" aria-label="Career" className={styles.collegeCareerHit} onClick={back} />
        <button type="button" aria-label="Your Feed" className={styles.collegeFeedHit} onClick={() => go("feed")} />
        <button type="button" aria-label="Games" className={styles.collegeGamesHit} onClick={() => go("games")} />
      </div>
      <CaptureSlice file="college-73" from={92} height={collegeFilterActive ? 488 : 609}>
        <button type="button" className={styles.collegeFitHit} aria-label="Unlock college fit" onClick={() => openPremiumFeature("College fit")} />
        <input className={styles.collegeSearchHit} aria-label="Search colleges" placeholder="" value={collegeQuery} onChange={(event) => setCollegeQuery(event.target.value)} />
        <button type="button" className={styles.collegeFilterHit} aria-label="Filter colleges" onClick={openCollegeFilters} />
        {collegeFilterActive && <span className={styles.collegeResultCount}>{collegeResults.length} {collegeResults.length === 1 ? "result" : "results"}</span>}
        {!collegeFilterActive && <button type="button" className={styles.collegeFirstCardHit} aria-label="View Hobart William Smith Colleges" onClick={() => openCollege("Hobart William Smith Colleges")} />}
      </CaptureSlice>
      {!collegeFilterActive && <>
        <CaptureSlice file="college-74" from={139} height={590}>
          <button type="button" className={styles.collegeHobartTailHit} aria-label="View Hobart William Smith Colleges" onClick={() => openCollege("Hobart William Smith Colleges")} />
          <button type="button" className={styles.collegeHobartFavoriteHit} aria-label={collegeFavorites.includes("Hobart William Smith Colleges") ? "Remove Hobart from favorites" : "Save Hobart to favorites"} onClick={() => toggle("Hobart William Smith Colleges", collegeFavorites, setCollegeFavorites)}>{collegeFavorites.includes("Hobart William Smith Colleges") && <span><Heart size={23} fill="currentColor" strokeWidth={2.2} /></span>}</button>
          <button type="button" className={styles.collegeHobartFitHit} aria-label="Unlock Hobart fit" onClick={() => openPremiumFeature("College fit")} />
          {collegeCardSlices["college-74"].map(({ name, top }) => <CollegeCardHits key={name} name={name} top={top} favorite={collegeFavorites.includes(name)} onOpen={() => openCollege(name)} onFavorite={() => toggle(name, collegeFavorites, setCollegeFavorites)} onFit={() => openCollegeFit(name)} />)}
        </CaptureSlice>
        {([ ["college-75", 157, 533], ["college-76", 92, 558], ["college-77", 100, 629] ] as const).map(([file, from, height]) => <CaptureSlice key={file} file={file} from={from} height={height}>{collegeCardSlices[file].map(({ name, top }) => <CollegeCardHits key={`${file}-${name}`} name={name} top={top} favorite={collegeFavorites.includes(name)} onOpen={() => openCollege(name)} onFavorite={() => toggle(name, collegeFavorites, setCollegeFavorites)} onFit={() => openCollegeFit(name)} />)}</CaptureSlice>)}
      </>}
      {collegeFilterActive && <div className={styles.collegeFilteredResult}>{collegeResults.length ? collegeResults.map((college) => <article className={styles.collegeResultCard} key={college.name}><button type="button" className={styles.collegeResultMain} aria-label={`View ${college.name}`} onClick={() => openCollege(college.name)}><span className={styles.collegeResultMonogram}>{college.name[0]}</span><span><strong>{college.name}</strong><em>{college.league}</em><small>{college.city}, {college.stateCode}</small></span></button><div><button type="button" aria-label={collegeFavorites.includes(college.name) ? `Remove ${college.name} from favorites` : `Save ${college.name} to favorites`} onClick={() => toggle(college.name, collegeFavorites, setCollegeFavorites)}><Heart size={23} fill={collegeFavorites.includes(college.name) ? "currentColor" : "none"} /></button><button type="button" onClick={() => openCollegeFit(college.name)}>♙ Fit</button></div></article>) : <p>No colleges match these filters.</p>}</div>}
    </div>; break;
    case "collegeDetail": body = <div className={styles.collegeDetailCapture}>
      {selectedCollege !== "Hobart William Smith Colleges" ? <MockCollegeDetail college={selectedCollegeRecord} tab={collegeTab} favorite={collegeFavorite} notes={collegeNotes} scrolled={collegeScrollTop > 240} onBack={back} onTab={(next) => { setCollegeTab(next); scrollRef.current?.scrollTo(0, 0); }} onFavorite={() => setCollegeFavorite(!collegeFavorite)} onNotes={editCollegeNotes} onFit={() => openPremiumFeature("College fit")} /> : collegeTab === "overview" ? <><CaptureSlice file="college-78" from={35} height={694}><button type="button" className={styles.collegeDetailBackHit} aria-label="Back to colleges" onClick={back} /><button type="button" className={styles.collegeFavoriteHit} aria-label={collegeFavorite ? "Remove Hobart from favorites" : "Save Hobart to favorites"} onClick={() => setCollegeFavorite(!collegeFavorite)}>{collegeFavorite && <span><Heart size={23} fill="currentColor" strokeWidth={2.2} /></span>}</button><button type="button" className={styles.collegeOverviewHit} aria-label="Overview tab" onClick={() => { setCollegeTab("overview"); scrollRef.current?.scrollTo(0, 0); }} /><button type="button" className={styles.collegeAcademicsHit} aria-label="Academics tab" onClick={() => { setCollegeTab("academics"); scrollRef.current?.scrollTo(0, 0); }} /><button type="button" className={styles.collegeNotesHit} style={collegeNotes.trim() ? { width: 316 } : undefined} aria-label={collegeNotes.trim() ? "Edit Hobart notes" : "Add notes"} onClick={editCollegeNotes} /></CaptureSlice><CaptureSlice file="college-79" from={327} height={340} /><CaptureSlice file="college-80" from={138} height={399}><a className={styles.collegeWebsiteHit} href="https://www.hws.edu/" target="_blank" rel="noopener noreferrer" aria-label="Open Hobart and William Smith Colleges website" /></CaptureSlice><CaptureSlice file="college-81" from={218} height={511} /></> : <><CaptureSlice file="college-82" from={35} height={694}><button type="button" className={styles.collegeDetailBackHit} aria-label="Back to colleges" onClick={back} /><button type="button" className={styles.collegeFavoriteHit} aria-label={collegeFavorite ? "Remove Hobart from favorites" : "Save Hobart to favorites"} onClick={() => setCollegeFavorite(!collegeFavorite)}>{collegeFavorite && <span><Heart size={23} fill="currentColor" strokeWidth={2.2} /></span>}</button><button type="button" className={styles.collegeOverviewHit} aria-label="Overview tab" onClick={() => { setCollegeTab("overview"); scrollRef.current?.scrollTo(0, 0); }} /><button type="button" className={styles.collegeAcademicsHit} aria-label="Academics tab" onClick={() => { setCollegeTab("academics"); scrollRef.current?.scrollTo(0, 0); }} /></CaptureSlice><CaptureSlice file="college-83" from={335} height={347} /><CaptureSlice file="college-84" from={505} height={224} /></>}
      {selectedCollege === "Hobart William Smith Colleges" && collegeTab === "overview" && collegeNotes.trim() && <span className={styles.collegeSavedNote}>{collegeNotes}</span>}
      {collegeEditingNotes && <div className={styles.collegeNotesModal} role="dialog" aria-label="College notes"><div><h2>My Notes</h2><textarea aria-label={`Notes for ${selectedCollege}`} value={collegeNotesDraft} onChange={(event) => setCollegeNotesDraft(event.target.value)} placeholder="Add notes" /><button type="button" onClick={() => { setCollegeNotesByName((current) => ({ ...current, [selectedCollege]: collegeNotesDraft })); setCollegeEditingNotes(false); }}>Save notes</button><button type="button" onClick={() => setCollegeEditingNotes(false)}>Cancel</button></div></div>}
    </div>; break;
    case "collegeFilters": body = <div className={styles.collegeFiltersCapture}><div className={styles.collegeFiltersHeader}><button type="button" aria-label="Close filters" onClick={back}>×</button><strong>Filters</strong></div><div className={styles.collegeFiltersContent}>
      <section><h2>Location (State)</h2><div className={styles.collegeStateSearch}><Search size={22} strokeWidth={2.3} /><input aria-label="Search states" placeholder="Search states..." value={collegeStateQuery} onChange={(event) => setCollegeStateQuery(event.target.value)} /></div>{collegeStateQuery ? <div className={styles.collegeFilterChips}>{collegeStates.filter((name) => name.toLowerCase().includes(collegeStateQuery.toLowerCase())).map((name) => <button type="button" key={name} className={collegeSelections.includes(name) ? styles.collegeSelected : ""} onClick={() => toggle(name, collegeSelections, setCollegeSelections)}>{name}</button>)}</div> : <div className={styles.collegeStateRows}>{collegeStateRows.map((row, index) => <div className={styles.collegeStateRow} key={index}>{row.map((name) => <button type="button" key={name} className={collegeSelections.includes(name) ? styles.collegeSelected : ""} onClick={() => toggle(name, collegeSelections, setCollegeSelections)}>{name}</button>)}</div>)}</div>}</section>
      <section><h2>Zip Code Proximity</h2><input className={styles.collegeZipInput} aria-label="Zip code" inputMode="numeric" maxLength={5} placeholder="Enter zip code" value={collegeDraftZip} onChange={(event) => setCollegeDraftZip(event.target.value.replace(/\D/g, ""))} /></section>
      <section><h2>Size</h2><div className={styles.collegeFilterChips}>{["Small (<3k)", "Medium (3-9k)", "Large (9-15k)", "Very Large (>15k)"].map((name) => <button type="button" key={name} className={collegeSelections.includes(name) ? styles.collegeSelected : ""} onClick={() => toggle(name, collegeSelections, setCollegeSelections)}>{name}</button>)}</div></section>
      <section><h2>Urbanicity</h2><div className={styles.collegeFilterChips}>{["City", "Suburban", "Rural"].map((name) => <button type="button" key={name} className={collegeSelections.includes(name) ? styles.collegeSelected : ""} onClick={() => toggle(name, collegeSelections, setCollegeSelections)}>{name}</button>)}</div></section>
      <section><h2>SAT Range</h2><div className={styles.collegeSatRange}><input aria-label="Minimum SAT" inputMode="numeric" placeholder="Min (800)" value={collegeDraftMinSat} onChange={(event) => setCollegeDraftMinSat(event.target.value.replace(/\D/g, ""))} /><span>–</span><input aria-label="Maximum SAT" inputMode="numeric" placeholder="Max (1600)" value={collegeDraftMaxSat} onChange={(event) => setCollegeDraftMaxSat(event.target.value.replace(/\D/g, ""))} /></div></section>
      <section className={styles.collegeNotesToggle}><h2>Has Notes</h2><button type="button" role="switch" aria-checked={collegeDraftHasNotes} aria-label="Has Notes" onClick={() => setCollegeDraftHasNotes(!collegeDraftHasNotes)} className={collegeDraftHasNotes ? styles.collegeSwitchOn : ""}><span /></button></section>
      <section><h2>Sort by</h2><div className={styles.collegeFilterChips}>{["Default Ranking", "Alphabetical", "SAT Ascending", "SAT Descending"].map((name) => <button type="button" key={name} className={collegeDraftSort === name && collegeDraftSort !== "Default Ranking" ? styles.collegeSelected : ""} onClick={() => setCollegeDraftSort(name)}>{name}</button>)}</div></section>
    </div></div>; break;
    case "notificationsCenter": body = <div className={styles.captureViewport} style={{ backgroundImage: "url('/graet-replica/captures/notifications-empty.png')" }}><button type="button" className={styles.notificationsBackHit} aria-label="Back" onClick={back} /><button type="button" className={styles.notificationsPremiumHit} aria-label="Learn more about Premium" onClick={() => openPremiumFeature("Trial active")} /><button type="button" className={styles.notificationsEnableHit} aria-label="Enable notifications" onClick={() => setNotificationsEnabled(true)} />{notificationsEnabled && <div className={styles.notificationsEnabled}>Notifications enabled</div>}</div>; break;
    case "support": body = <div className={styles.supportCapture}>
      <button type="button" className={styles.supportBackHit} aria-label="Back" onClick={back} />
      {supportResolved ? <div className={styles.supportTabsOverride}><button type="button" aria-label="Open requests" aria-pressed={false} onClick={() => setSupportResolved(false)}>Open</button><button type="button" className={styles.supportTabSelected} aria-label="Resolved requests" aria-pressed={true}>Resolved</button></div> : <><button type="button" className={styles.supportOpenHit} aria-label="Open requests" aria-pressed={true} /><button type="button" className={styles.supportResolvedHit} aria-label="Resolved requests" aria-pressed={false} onClick={() => setSupportResolved(true)} /></>}
      {!supportResolved && supportRequests.length > 0 && <div className={styles.supportRequestList}>{supportRequests.map((request, index) => <article key={`${request.subject}-${index}`}><strong>{request.subject}</strong><span>Open · Just now</span><p>{request.message}</p></article>)}</div>}
      <button type="button" className={styles.supportNewHit} aria-label="New support request" onClick={() => setSupportComposerOpen(true)} />
      {supportComposerOpen && <div className={styles.supportComposer} role="dialog" aria-label="New support request"><header><button type="button" aria-label="Cancel support request" onClick={() => setSupportComposerOpen(false)}>Cancel</button><h2>New request</h2><button type="button" disabled={!supportSubject.trim() || !supportMessage.trim()} onClick={() => { setSupportRequests((current) => [{ subject: supportSubject.trim(), message: supportMessage.trim() }, ...current]); setSupportSubject(""); setSupportMessage(""); setSupportResolved(false); setSupportComposerOpen(false); }}>Send</button></header><div><label>Subject<input aria-label="Support request subject" value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} placeholder="What do you need help with?" /></label><label>Message<textarea aria-label="Support request message" value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} placeholder="Describe the issue" rows={7} /></label></div></div>}
    </div>; break;
    case "feed": body = <><div className={styles.feedCapture}>
      <div className={styles.feedCaptureInitial}>
        <button type="button" className={styles.feedCareerHit} aria-label="Career" onClick={() => go("career")} />
        <button type="button" className={styles.feedGamesHit} aria-label="Games" onClick={() => go("games")} />
        <button type="button" className={styles.feedNotificationsHit} aria-label="Notifications" onClick={() => go("notificationsCenter")} />
        <button type="button" className={styles.feedWhatsNewHit} aria-label="Openings, Prospects and Shortlists" onClick={() => { setFeatureTourStep(0); go("featureTour"); }} />
        <button type="button" className={styles.feedAuthorProfileHit} aria-label="View Trevor Daly profile" onClick={() => openCoach("Trevor Daly")} />
        <button type="button" className={styles.feedAuthorFollowHit} aria-label={feedFollowing.includes("Trevor Daly") ? "Unfollow Trevor Daly" : "Follow Trevor Daly"} onClick={() => toggle("Trevor Daly", feedFollowing, setFeedFollowing)}><FeedFollowGlyph followed={feedFollowing.includes("Trevor Daly")} /></button>
        <button type="button" className={styles.feedLikeHit} aria-label={feedLiked ? "Unlike Kinni Spirit post" : "Like Kinni Spirit post"} onClick={() => setFeedLiked(!feedLiked)}>{feedLiked && <span><ThumbsUp size={19} fill="currentColor" /></span>}</button>
        <button type="button" className={styles.feedFirstCommentHit} aria-label="Comment on Kinni Spirit post" onClick={() => openFeedPostAction("comments", "Kinni Spirit")} />
        <button type="button" className={styles.feedFirstShareHit} aria-label="Share Kinni Spirit post" onClick={() => openFeedPostAction("share", "Kinni Spirit")}><Share size={20} strokeWidth={2.3} /></button>
        <button type="button" className={styles.feedFirstMoreHit} aria-label="More Kinni Spirit post options" onClick={() => openFeedPostAction("options", "Kinni Spirit")}><EllipsisVertical size={21} strokeWidth={2.3} /></button>
      </div>
      <div className={styles.feedCapturePremium}>
        <button type="button" className={styles.feedTrialHit} aria-label="Try GRAET Premium free for one week" onClick={() => openPremiumFeature("Trial active")} />
        <button type="button" className={styles.feedPremiumLikeHit} aria-label={feedPremiumLiked ? "Unlike GRAET Premium post" : "Like GRAET Premium post"} onClick={() => setFeedPremiumLiked(!feedPremiumLiked)}>{feedPremiumLiked && <span><ThumbsUp size={19} fill="currentColor" /></span>}</button>
        <button type="button" className={styles.feedPremiumCommentHit} aria-label="Comment on GRAET Premium post" onClick={() => openFeedPostAction("comments", "GRAET Premium")} />
        <button type="button" className={styles.feedPremiumShareHit} aria-label="Share GRAET Premium post" onClick={() => openFeedPostAction("share", "GRAET Premium")} />
        <button type="button" className={styles.feedPremiumMoreHit} aria-label="More GRAET Premium post options" onClick={() => openFeedPostAction("options", "GRAET Premium")} />
      </div>
      <div className={styles.feedSuggestionList}>
        {([ ["Tobin Schaefer", "2009 · LW", "🇨🇦"], ["Matt Overeem", "Agent", "🇨🇦"], ["Ragnar Gillis", "2008 · C", "🇨🇦"] ] as const).map(([name, detail, flag], index) => <div className={styles.feedSuggestionRow} key={name}>
          <button type="button" className={styles.feedSuggestionProfile} aria-label={`View ${name} profile`} onClick={() => name === "Matt Overeem" ? openCoach(name) : openPlayer(name)}>
            <span className={`${styles.feedSuggestionAvatar} ${index === 2 ? styles.feedSuggestionAvatarBlank : ""}`} style={index < 2 ? { backgroundPosition: `-20px -${577 + index * 60}px` } : undefined}>{index === 2 ? <UserRound size={25} strokeWidth={1.4} /> : null}</span>
            <span className={styles.feedSuggestionInfo}><b>{name} <span>{flag}</span></b><small>{detail}</small></span>
          </button>
          <button type="button" className={styles.feedSuggestionFollow} aria-label={`${feedFollowing.includes(name) ? "Unfollow" : "Follow"} ${name}`} onClick={() => toggle(name, feedFollowing, setFeedFollowing)}><FeedFollowGlyph followed={feedFollowing.includes(name)} /></button>
        </div>)}
      </div>
      <div className={styles.feedCaptureCoach}>
        <button type="button" className={styles.feedCoachProfileHit} aria-label="View Tim Tobin profile" onClick={() => openCoach("Tim Tobin")} />
        <button type="button" className={styles.feedCoachFollowHit} aria-label={feedFollowing.includes("Tim Tobin") ? "Unfollow Tim Tobin" : "Follow Tim Tobin"} onClick={() => toggle("Tim Tobin", feedFollowing, setFeedFollowing)}><FeedFollowGlyph followed={feedFollowing.includes("Tim Tobin")} /></button>
        <button type="button" className={styles.feedCoachOpeningHit} aria-label="View Minnesota Blue Ox opening" onClick={() => { setSelectedOpening("Minnesota Blue Ox"); go("opening"); }} />
        <button type="button" className={styles.feedCoachLikeHit} aria-label={feedCoachLiked ? "Unlike Tim Tobin post" : "Like Tim Tobin post"} onClick={() => setFeedCoachLiked(!feedCoachLiked)}>{feedCoachLiked && <span><ThumbsUp size={19} fill="currentColor" /></span>}</button>
        <button type="button" className={styles.feedCoachCommentHit} aria-label="Comment on Tim Tobin post" onClick={() => openFeedPostAction("comments", "Tim Tobin")} />
        <button type="button" className={styles.feedCoachShareHit} aria-label="Share Tim Tobin post" onClick={() => openFeedPostAction("share", "Tim Tobin")} />
        <button type="button" className={styles.feedCoachMoreHit} aria-label="More Tim Tobin post options" onClick={() => openFeedPostAction("options", "Tim Tobin")} />
        <button type="button" className={styles.feedShaneFollowHit} aria-label={feedFollowing.includes("Shane Lynch") ? "Unfollow Shane Lynch" : "Follow Shane Lynch"} onClick={() => toggle("Shane Lynch", feedFollowing, setFeedFollowing)}><FeedFollowGlyph followed={feedFollowing.includes("Shane Lynch")} /></button>
      </div>
      <div className={styles.feedShaneCopy}>Looking to add 2 forwards/2defence to round out the roster if interested please send me a message open to 2008-2011 birth years</div>
      <div className={styles.feedBradley}>
        <button type="button" className={styles.feedShaneLikeHit} aria-label={feedShaneLiked ? "Unlike Shane Lynch post" : "Like Shane Lynch post"} onClick={() => setFeedShaneLiked(!feedShaneLiked)}>{feedShaneLiked && <span><ThumbsUp size={19} fill="currentColor" /></span>}</button>
        <button type="button" className={styles.feedShaneCommentHit} aria-label="Comment on Shane Lynch post" onClick={() => openFeedPostAction("comments", "Shane Lynch")} />
        <button type="button" className={styles.feedShaneShareHit} aria-label="Share Shane Lynch post" onClick={() => openFeedPostAction("share", "Shane Lynch")} />
        <button type="button" className={styles.feedShaneMoreHit} aria-label="More Shane Lynch post options" onClick={() => openFeedPostAction("options", "Shane Lynch")} />
        <button type="button" className={styles.feedBradleyFollowHit} aria-label={feedFollowing.includes("Bradley Boomer") ? "Unfollow Bradley Boomer" : "Follow Bradley Boomer"} onClick={() => toggle("Bradley Boomer", feedFollowing, setFeedFollowing)}><FeedFollowGlyph followed={feedFollowing.includes("Bradley Boomer")} /></button>
      </div>
      <div className={styles.feedBradleyActions}><small>3d ago</small><button type="button" aria-label={feedBradleyLiked ? "Unlike Bradley Boomer post" : "Like Bradley Boomer post"} onClick={() => setFeedBradleyLiked(!feedBradleyLiked)}><ThumbsUp size={23} fill={feedBradleyLiked ? "currentColor" : "none"} /></button><button type="button" aria-label="Comment on Bradley Boomer post" onClick={() => openFeedPostAction("comments", "Bradley Boomer")}><MessageCircle size={22} /></button><button type="button" aria-label="Share Bradley Boomer post" onClick={() => openFeedPostAction("share", "Bradley Boomer")}><Share size={21} /></button><button type="button" aria-label="More Bradley Boomer post options" onClick={() => openFeedPostAction("options", "Bradley Boomer")}><EllipsisVertical size={22} /></button></div>
    </div>{phoneRoot && createPortal(<>
      <button type="button" className={styles.feedFab} aria-label="Add" onClick={() => setFeedAddOpen(true)}><Plus size={29} /></button>
      {feedAddOpen && <div className={styles.feedAddLayer}><button type="button" className={styles.feedAddBackdrop} aria-label="Close Add" onClick={() => setFeedAddOpen(false)} /><div role="dialog" aria-label="Add"><h2>Add</h2><p>Create a performance clip</p><button type="button" onClick={() => setFeedAddOpen(false)}>Close</button></div></div>}
      {feedPostAction && <div className={styles.feedAddLayer}>
        <button type="button" className={styles.feedAddBackdrop} aria-label="Close post actions" onClick={() => setFeedPostAction(null)} />
        <div role="dialog" aria-label={`${feedPostAction.kind === "comments" ? "Comments" : feedPostAction.kind === "share" ? "Share post" : "Post options"} for ${feedPostAction.post}`}>
          <h2>{feedPostAction.kind === "comments" ? "Comments" : feedPostAction.kind === "share" ? "Share post" : "Post options"}</h2>
          <p>{feedPostAction.post}</p>
          {feedPostAction.kind === "comments" ? <>
            <div className={styles.feedCommentList}>{(feedComments[feedPostAction.post] ?? []).length ? feedComments[feedPostAction.post].map((comment, index) => <p key={`${comment}-${index}`}><b>You</b>{comment}</p>) : <p>No comments yet</p>}</div>
            <form className={styles.feedCommentForm} onSubmit={(event) => { event.preventDefault(); const comment = feedCommentDraft.trim(); if (!comment) return; setFeedComments((current) => ({ ...current, [feedPostAction.post]: [...(current[feedPostAction.post] ?? []), comment] })); setFeedCommentDraft(""); }}><input aria-label="Write a comment" placeholder="Write a comment" value={feedCommentDraft} onChange={(event) => setFeedCommentDraft(event.target.value)} /><button type="submit" disabled={!feedCommentDraft.trim()}>Post</button></form>
          </> : <>
            {feedPostAction.kind === "options" && <button type="button" onClick={() => { setFeedPostAction({ kind: "share", post: feedPostAction.post }); setFeedLinkCopied(false); }}>Share post</button>}
            <button type="button" onClick={() => copyFeedPostLink(feedPostAction.post)}>{feedLinkCopied ? "Link copied" : "Copy post link"}</button>
          </>}
          <button type="button" onClick={() => setFeedPostAction(null)}>Close</button>
        </div>
      </div>}
    </>, phoneRoot)}</>; break;
    case "coachProfile": body = <StaffProfilePage name={selectedCoach} asset={coachAsset} tab={coachTab} scrollTop={coachScrollTop} headerCollapsed={coachHeaderCollapsed} followed={feedFollowing.includes(selectedCoach)} onBack={back} onFollow={() => toggle(selectedCoach, feedFollowing, setFeedFollowing)} onMessage={() => go("chat")} onTab={(next) => { setCoachTab(next); setCoachScrollTop(0); scrollRef.current?.scrollTo(0, 0); }} onOpening={() => { setSelectedOpening("Minnesota Blue Ox"); go("opening"); }} />; break;
    case "games": body = <div className={styles.captureViewport} style={{ backgroundImage: "url('/graet-replica/captures/nav-home.png')" }}><button type="button" className={styles.gamesCareerHit} aria-label="Career" onClick={() => go("career")} /><button type="button" className={styles.gamesFeedHit} aria-label="Your Feed" onClick={() => go("feed")} /><button type="button" className={styles.gamesListHit} aria-label="All games" onClick={() => go("gameList")} /></div>; break;
    case "gameList": body = <div className={styles.gameListCapture}><div className={styles.gameListHeader}><button type="button" aria-label="Back to games" onClick={back} />{gameCalendar()}</div>{selectedGameDate === "2026-09-28" ? capturedGameLeagues.map((league) => <GameLeagueSection key={league.id} league={league} favorite={favoriteGameLeagues.includes(league.id)} onLeague={() => openGameLeague(league.id)} onFavorite={() => toggle(league.id, favoriteGameLeagues, setFavoriteGameLeagues)} onMatch={(index) => openGameMatch(league.id, index)} />) : uncapturedGames}</div>; break;
    case "gameLeague": body = selectedGameLeague === "extraliga" ? <div className={styles.gameLeagueCapture}><button type="button" className={styles.gameLeagueBack} aria-label="Back to all games" onClick={back} />{gameCalendar(true)}{selectedGameDate === "2026-09-28" ? <button type="button" className={styles.gameLeagueMatch} aria-label="HC Sparta Praha versus HC Energie Karlovy Vary" onClick={() => openGameMatch("extraliga", 0)} /> : <div className={styles.gameLeagueUncaptured}>{uncapturedGames}</div>}</div> : <div className={styles.gameDataLeague}><div className={styles.gameDataTop}><button type="button" aria-label="Back to all games" onClick={back}><ArrowLeft size={23} /></button></div>{gameCalendar(true)}{selectedGameDate === "2026-09-28" ? <><div className={styles.gameDataLeagueTitle}><GameLeagueLogo leagueId={selectedLeague.id} /><span><b>{selectedLeague.name}</b><small>{selectedLeague.subtitle}</small></span><button type="button" aria-label={`${favoriteGameLeagues.includes(selectedLeague.id) ? "Unfavorite" : "Favorite"} ${selectedLeague.name}`} onClick={() => toggle(selectedLeague.id, favoriteGameLeagues, setFavoriteGameLeagues)}><Star size={22} fill={favoriteGameLeagues.includes(selectedLeague.id) ? "#003ce5" : "none"} /></button><button type="button" aria-label="Back to all games" onClick={back}><List size={23} /></button></div>{selectedLeague.matches.map((match, index) => <GameRow key={`${match.home}-${match.away}`} match={match} leagueId={selectedLeague.id} matchIndex={index} onClick={() => openGameMatch(selectedLeague.id, index)} />)}</> : uncapturedGames}</div>; break;
    case "gameMatch": body = selectedMatch ? <GameMatchPage exact={exactSpartaMatch} league={selectedLeague} match={selectedMatch} matchIndex={selectedGameMatch} tab={matchTab} side={matchSide} onBack={back} onTab={changeMatchTab} onSide={(next) => { setMatchSide(next); scrollRef.current?.scrollTo(0, 0); }} onShare={() => setGameAction("share")} onMore={() => setGameAction("more")} /> : null; break;
    case "players":
    case "openings": body = <>
      <div className={styles.exploreHeader}>
        <label className={styles.search}><Search size={22} /><input placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className={styles.exploreTabs}>
          <button type="button" className={screen === "players" ? styles.active : ""} onClick={() => jump("players")}>Players</button>
          <button type="button" className={screen === "openings" ? styles.active : ""} onClick={() => jump("openings")}>Openings</button>
        </div>
      </div>
      {screen === "openings" ? <div className={styles.openingsContent}>
        <div className={styles.sectionHeading}><h1>Team openings</h1><button type="button" onClick={() => go("applications")}>My applications</button></div>
        {capturedOpenings.filter((item) => item.team.toLowerCase().includes(search.toLowerCase())).map((item) => <OpeningCard key={item.team} opening={item} onClick={() => { setSelectedOpening(item.team); setPosition(item.positions[0]?.name ?? "Forward"); setMessage(""); setAvailability(""); go("opening"); }} />)}
      </div> : <div className={styles.playersContent}>
        <button className={styles.browseAllPlayers} type="button" onClick={() => go("playerSearch")}><Search size={24} /><span><b>Browse all players</b><small>34,543 active players</small></span><ChevronRight size={24} /></button>
        <div className={styles.playersGrid}>{capturedPlayers.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).map((item) => <div
          className={styles.playerCaptureCard} key={item.name}
          style={{ backgroundImage: `url('${playerCaptureUrl(item.image)}')`, backgroundPosition: `${capturedPlayers.indexOf(item) % 2 === 0 ? 0 : -188}px -${item.y}px` }}>
          <button type="button" className={styles.playerOpenHotspot} aria-label={`View ${item.name}`} onClick={() => openPlayer(item.name)} />
          <button type="button" className={styles.playerFollowHotspot} aria-label={`${feedFollowing.includes(item.name) ? "Unfollow" : "Follow"} ${item.name}`} onClick={() => toggle(item.name, feedFollowing, setFeedFollowing)}>{feedFollowing.includes(item.name) && <span>Following</span>}</button>
        </div>)}</div>
      </div>}
    </>; break;
    case "playerSearch": body = <><div className={styles.playerSearchHeader}><button type="button" aria-label="Back to Explore" onClick={back}><ArrowLeft size={23} /></button><button type="button" onClick={() => go("playerFilters")}><SlidersHorizontal size={22} />Filter · {appliedFilters.length ? "Filtered" : "34,543"} players</button></div><div className={styles.playerSearchList}>{filteredSearchPlayers.map((item) => <button type="button" className={styles.playerSearchRow} key={item.name} aria-label={`View ${item.name}`} style={{ backgroundImage: `url('${playerCaptureUrl(item.image)}')`, backgroundPosition: `0 -${item.y}px` }} onClick={() => openPlayer(item.name)} />)}</div></>; break;
    case "playerFilters": body = <div className={styles.playerFilters}><div className={styles.playerFiltersHeader}><button type="button" aria-label="Close filters" onClick={back}>×</button><h1>Filters</h1></div><div className={styles.playerFiltersContent}>{[["Position", ["Center", "Left winger", "Right winger", "Defenseman", "Goalie"]], ["Year of birth", ["2006+", "2007", "2008", "2009", "2010", "2011", "2012", "2013"]], ["Gender", ["Men", "Women", "Not stated"]], ["Nationality", ["🇺🇸 USA", "🇨🇦 CAN", "🇸🇪 SWE", "🇫🇮 FIN", "🇨🇿 CZE", "🇸🇰 SVK", "🇨🇭 SUI", "🇩🇪 GER", ...(showAllNationalities ? ["🇦🇹 AUT", "🇳🇴 NOR", "🇩🇰 DEN", "🇫🇷 FRA"] : [])]]].map(([title, choices]) => <section key={title as string}><div className={styles.filterSectionHead}><h2>{title as string}</h2><button type="button" className={`${styles.filterToggle} ${filterSectionsEnabled[title as string] ? "" : styles.filterToggleOff}`} role="switch" aria-label={`${title} filter`} aria-checked={filterSectionsEnabled[title as string]} onClick={() => { const section = title as string; const enabled = !filterSectionsEnabled[section]; setFilterSectionsEnabled((current) => ({ ...current, [section]: enabled })); if (!enabled) setFilterSelections((current) => current.filter((choice) => !(choices as string[]).includes(choice))); }} /></div><div className={`${styles.filterChoices} ${filterSectionsEnabled[title as string] ? "" : styles.filterChoicesOff}`}>{(choices as string[]).map((choice) => <button type="button" key={choice} disabled={!filterSectionsEnabled[title as string]} className={filterSelections.includes(choice) ? styles.selected : ""} onClick={() => toggle(choice, filterSelections, setFilterSelections)}>{choice}</button>)}</div>{title === "Nationality" && <button className={styles.showNationalities} type="button" onClick={() => setShowAllNationalities(!showAllNationalities)}>{showAllNationalities ? "Show fewer nationalities" : "Show all nationalities"} ﹀</button>}</section>)}</div><div className={styles.filterFooter}><button type="button" onClick={() => { setFilterSelections([]); setAppliedFilters([]); }}>Clear all</button><button type="button" onClick={() => { setAppliedFilters(filterSelections); back(); }}>Apply</button></div></div>; break;
    case "profile": body = <PlayerProfilePage key="own-profile" facts={{ name: [firstName, lastName].filter(Boolean).join(" ") || "Your Profile", position: "Hockey player", country: "CAN", views: "0", followers: "0" }} owner tab={profileTab} followed={false} scrollTop={profileScrollTop} onBack={back} onTab={(next) => { setProfileTab(next); setProfileScrollTop(0); scrollRef.current?.scrollTo(0, 0); }} onFollow={() => {}} onMessage={() => {}} onRelated={(name) => { setSelectedPlayer(name); setRelatedPlayerHistory([]); setProfileTab("wall"); go("playerProfile"); }} onEditName={(nextFirst, nextLast) => { setFirstName(nextFirst); setLastName(nextLast); }} />; break;
    case "playerProfile": body = <PlayerProfilePage key={selectedPlayer} facts={profileFactsFor(selectedPlayer)} tab={profileTab} followed={feedFollowing.includes(selectedPlayer)} scrollTop={profileScrollTop} onBack={backFromPlayer} onTab={(next) => { setProfileTab(next); setProfileScrollTop(0); scrollRef.current?.scrollTo(0, 0); }} onFollow={() => toggle(selectedPlayer, feedFollowing, setFeedFollowing)} onMessage={() => go("chat")} onRelated={(name) => { const previousScroll = scrollRef.current?.scrollTop ?? 0; setRelatedPlayerHistory((current) => [...current, { name: selectedPlayer, tab: profileTab, scrollTop: previousScroll }]); restoreScrollRef.current = 0; setSelectedPlayer(name); setProfileTab("wall"); setProfileScrollTop(0); scrollRef.current?.scrollTo(0, 0); }} />; break;
    case "opening": body = <OpeningDetailPage opening={selectedOpeningRecord} onBack={back} />; break;
    case "apply": body = <OpeningApplyPage opening={selectedOpeningRecord} position={position} message={message} availability={availability} onBack={back} onPosition={setPosition} onMessage={setMessage} onAvailability={setAvailability} onSubmit={() => { setSubmittedApplications((current) => current.includes(selectedOpening) ? current : [...current, selectedOpening]); go("applications"); }} />; break;
    case "applications": body = submittedApplications.length ? <div className={styles.openingApplicationsPage}><div className={styles.openingDataHeader}><button type="button" aria-label="Back" onClick={back}><ArrowLeft size={24} /></button><strong>My applications</strong></div><div className={styles.openingApplicationsList}>{submittedApplications.map((team) => { const opening = capturedOpenings.find((item) => item.team === team) ?? capturedOpenings[0]; return <button type="button" className={styles.openingApplicationCard} key={team} onClick={() => { setSelectedOpening(team); go("opening"); }}><OpeningLogo opening={opening} large /><span><strong>{team}</strong><small>2026–2027 · {opening.tier} · {opening.country}</small><b>Submitted</b></span><ChevronRight size={20} /></button>; })}</div></div> : <div className={styles.captureViewport} style={{ backgroundImage: "url('/graet-replica/tenant-source/s0045_explore_openings_my_applications_empty.png')" }}><button type="button" className={styles.applicationsBackHit} aria-label="Back" onClick={back} /><button type="button" className={styles.applicationsBrowseHit} aria-label="Browse openings" onClick={() => go("openings")} /></div>; break;
    case "ai": body = <div className={styles.aiCapture}><div className={styles.aiFrameTop} /><div className={styles.aiFrameMiddle} /><section className={styles.aiSimilar}><div className={styles.aiSimilarIntro}><h2>Similar searches</h2><p>See which coaches and scouts are looking for players like you.</p></div><div className={styles.aiSimilarPeople}><div><span className={styles.aiScoutAvatar} /><span><i />Scout · USHL</span></div><div><span className={styles.aiCoachAvatar} /><span><i />Head coach · NAHL</span></div></div></section><div className={styles.aiFrameLower} /><div className={styles.aiStickyCTA}><button type="button" aria-label="Start free trial" onClick={() => openPremiumFeature("AI Coach")} /></div></div>; break;
    case "chat": body = <div className={styles.captureViewport} style={{ backgroundImage: `url('/graet-replica/captures/chat-${chatUnread ? "unread" : "all"}.png')` }}><button type="button" className={styles.chatAllHit} aria-label="All chats" onClick={() => setChatUnread(false)} /><button type="button" className={styles.chatUnreadHit} aria-label="Unread chats" onClick={() => setChatUnread(true)} /><button type="button" className={styles.chatPremiumHit} aria-label="Learn more about Premium" onClick={() => openPremiumFeature("Trial active")} /></div>; break;
  }

  return <main className={styles.stage}><div className={`${styles.phone} ${dark ? styles.phoneDark : ""} ${screen === "feed" && feedScrollTop > 80 && feedScrollTop < 900 ? styles.phoneFeedScrolled : ""}`}><div className={`${styles.statusBar} ${statusImage ? styles.capturedStatus : ""}`} style={statusUrl ? { backgroundImage: `url('${statusUrl}')`, backgroundPosition: screen === "playerProfile" && selectedPlayer === "Thomas Balogh" && profileScrollTop <= 440 ? `0 -${profileScrollTop}px` : undefined } : undefined}><span>{screen === "welcome" || screen === "email" ? "3:23" : screen === "verify" ? "3:24" : screen === "role" ? "3:26" : screen === "name" ? "3:28" : ["birthday", "nationality", "photo", "interests"].includes(screen) ? "3:29" : screen === "career" ? "3:33" : screen === "feed" ? "3:34" : screen === "playerProfile" && selectedPlayer === "Thomas Balogh" ? (profileTab === "wall" ? "5:46" : profileTab === "stats" ? "5:47" : "5:48") : browsing ? "5:16" : "3:30"}</span><span className={styles.statusIcons}>SOS <Wifi size={16} strokeWidth={2.5} /><BatteryFull size={21} strokeWidth={2} /></span></div><div ref={scrollRef} onScroll={(event) => { if (screen === "feed") setFeedScrollTop(event.currentTarget.scrollTop); if (screen === "coachProfile") setCoachScrollTop(event.currentTarget.scrollTop); if (screen === "gameMatch") setMatchScrollTop(event.currentTarget.scrollTop); if (screen === "collegeDetail") setCollegeScrollTop(event.currentTarget.scrollTop); if (screen === "playerProfile" || screen === "profile") setProfileScrollTop(event.currentTarget.scrollTop); }} className={`${styles.phoneScroll} ${browsing && screen !== "playerFilters" && screen !== "support" && screen !== "premiumDetail" ? styles.browsingScroll : ""}`}>{body}</div>{screen === "collegeDetail" && selectedCollege === "Hobart William Smith Colleges" && collegeScrollTop > 240 && <div className={styles.collegeDetailSticky} style={{ backgroundImage: `url('/graet-replica/captures/college-${collegeTab === "overview" ? 79 : 83}.png')` }}><button type="button" className={styles.collegeStickyBackHit} aria-label="Back to colleges" onClick={back} /><button type="button" className={styles.collegeStickyOverviewHit} aria-label="Overview tab" onClick={() => { setCollegeTab("overview"); setCollegeScrollTop(0); scrollRef.current?.scrollTo(0, 0); }} /><button type="button" className={styles.collegeStickyAcademicsHit} aria-label="Academics tab" onClick={() => { setCollegeTab("academics"); setCollegeScrollTop(0); scrollRef.current?.scrollTo(0, 0); }} /></div>}{screen === "collegeFilters" && <div className={styles.collegeFiltersFooter}><button type="button" onClick={() => { setCollegeSelections([]); setCollegeStateQuery(""); setCollegeDraftZip(""); setCollegeDraftMinSat(""); setCollegeDraftMaxSat(""); setCollegeDraftHasNotes(false); setCollegeDraftSort("Default Ranking"); }}>Clear all</button><button type="button" onClick={() => { setCollegeApplied(collegeSelections); setCollegeZip(collegeDraftZip); setCollegeMinSat(collegeDraftMinSat); setCollegeMaxSat(collegeDraftMaxSat); setCollegeHasNotes(collegeDraftHasNotes); setCollegeSort(collegeDraftSort); back(); }}>Apply</button></div>}{screen === "gameMatch" && exactSpartaMatch && matchScrollTop > (matchTab === "stats" ? 100 : 210) && <div className={`${styles.gameMatchSticky} ${matchTab === "stats" ? styles.gameMatchStickyStats : matchTab === "lineups" ? (matchSide === "away" ? styles.gameMatchStickyAway : styles.gameMatchStickyHome) : ""}`}><button type="button" className={styles.gameMatchStickyBack} aria-label="Back to Czechia Extraliga" onClick={back} /><button type="button" className={styles.gameMatchStickyDetailsHit} aria-label="Details tab" onClick={() => changeMatchTab("details")} /><button type="button" className={styles.gameMatchStickyStatsHit} aria-label="Stats tab" onClick={() => changeMatchTab("stats")} /><button type="button" className={styles.gameMatchStickyLineupsHit} aria-label="Lineups tab" onClick={() => changeMatchTab("lineups")} /></div>}{screen === "gameMatch" && !exactSpartaMatch && selectedMatch && matchScrollTop > 275 && <GameMatchMockSticky match={selectedMatch} tab={matchTab} onBack={back} onTab={changeMatchTab} onShare={() => setGameAction("share")} onMore={() => setGameAction("more")} />}{screen === "opening" && <div className={styles.openingDataSticky}><button type="button" aria-label={submittedApplications.includes(selectedOpening) ? "View application" : "Apply now"} onClick={() => go(submittedApplications.includes(selectedOpening) ? "applications" : "apply")}>{submittedApplications.includes(selectedOpening) ? "Applied" : "Apply now"}</button></div>}{browsing && screen !== "playerFilters" && screen !== "support" && screen !== "premiumDetail" && <nav className={`${styles.bottomNav} ${styles[`nav${tab[0].toUpperCase()}${tab.slice(1)}`]}`} aria-label="GRAET navigation">{[["home", "Home", Home, "career"], ["explore", "Explore", Search, "players"], ["ai", "AI", Sparkles, "ai"], ["chat", "Chat", MessageSquare, "chat"], ["profile", "Profile", UserRound, "profile"]].map(([key, label, Icon, target]) => { const IconComponent = Icon as typeof Home; return <button type="button" key={key as string} className={tab === key ? styles.active : ""} onClick={(event) => { event.currentTarget.blur(); if (key === "profile") setProfileTab("wall"); if (key === "ai" && trialActive) { setPremiumFeature("AI Coach"); jump("premiumFeature"); } else jump(target as Screen); }}><IconComponent size={24} strokeWidth={2.5} /><span>{label as string}</span></button>; })}</nav>}<div className={styles.homeIndicator} />{menuOpen && <div className={styles.menuCapture} role="dialog" aria-label="GRAET menu"><button type="button" className={styles.menuBackdropHit} aria-label="Close menu" onClick={() => setMenuOpen(false)} />{[["Dashboard", "career", 127], ["Activity", "premiumDetail", 173], ["My Path", "premiumDetail", 220], ["Game Tracker", "gameTracker", 266], ["Colleges", "colleges", 312], ["Contacts", "premiumDetail", 358], ["Academics", "premiumDetail", 404], ["Subscription", "premiumDetail", 623], ["Support", "support", 665]].map(([label, target, top]) => <button type="button" key={label} className={styles.menuRowHit} style={{ top: `${top}px` }} aria-label={label as string} onClick={() => { setMenuOpen(false); if (["Activity", "My Path", "Contacts", "Academics"].includes(label as string)) openPremiumFeature(label as string); else if (label === "Subscription" && trialActive) openPremiumFeature("Trial active"); else go(target as Screen); }} />)}{[["Home", "career"], ["Explore", "players"], ["AI", "ai"], ["Chat", "chat"], ["Profile", "profile"]].map(([label, target], index) => <button type="button" key={label} className={styles.menuNavHit} style={{ left: `${index * 20}%` }} aria-label={label} onClick={() => { setMenuOpen(false); if (label === "Profile") setProfileTab("wall"); if (label === "AI" && trialActive) { setPremiumFeature("AI Coach"); jump("premiumFeature"); } else jump(target as Screen); }} />)}</div>}{screen === "gameMatch" && gameAction && <div className={styles.gameActionLayer}><button type="button" className={styles.gameActionBackdrop} aria-label="Close match actions" onClick={() => setGameAction(null)} /><div className={styles.gameActionSheet} role="dialog" aria-label={gameAction === "share" ? "Share match" : "Match options"}><h3>{gameAction === "share" ? "Share match" : "Match options"}</h3><button type="button" onClick={() => { if (gameAction === "share") { void navigator.clipboard?.writeText(`${selectedLeague.name}: ${selectedMatch?.home} ${selectedMatch?.homeScore ?? "-"} - ${selectedMatch?.awayScore ?? "-"} ${selectedMatch?.away}`); } else go("gameLeague"); setGameAction(null); }}>{gameAction === "share" ? "Copy match details" : `View ${selectedLeague.name}`}</button><button type="button" onClick={() => setGameAction(null)}>Cancel</button></div></div>}{screen === "featureTour" && <div className={styles.featureTourCapture} style={{ backgroundImage: `url('/graet-replica/captures/feature-tour-${featureTourStep + 1}.png')` }}><button type="button" className={`${styles.featureTourNextHit} ${featureTourStep === 2 ? styles.featureTourLastHit : ""}`} aria-label={featureTourStep === 2 ? "Got it" : "Next"} onClick={() => { if (featureTourStep < 2) setFeatureTourStep(featureTourStep + 1); else back(); }} />{featureTourStep < 2 && <button type="button" className={styles.featureTourCloseHit} aria-label="Close feature tour" onClick={back} />}{featureTourStep === 1 && <button type="button" className={styles.featureTourBrowseHit} aria-label="Browse openings" onClick={() => go("openings")} />}</div>}</div></main>;
}
