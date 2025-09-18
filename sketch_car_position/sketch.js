// ============================================================================
// Overview — F1 Race Playback (p5.js)
// ============================================================================
// What this is
// ------------
// An interactive visualization of the 2024 Austrian Grand Prix timing data.
// It replays cars moving around the track, renders a live leaderboard with
// gap/tyre info, and offers a chart view of position-by-lap — all synced to a
// controllable playback clock (play/pause + speed).
//
// Data inputs
// -----------
// • drivers.csv             → driver meta (number, acronym, team, colors)
// • location_driver_#.csv   → per-driver samples: timestamped (x,y) around track
// • stints.csv              → tyre stints (compound + lap ranges + age info)
// • images/fonts            → team logos, tyre icons, F1 logo, optional background
//
// Main features
// -------------
// • TRACK view: cars drawn as dots on a scaled track; hover/select highlights.
// • Leaderboard: fixed-row table with Δ-badges, gaps (Leader/Ahead), team dots,
//   team logos, optional tyre icons+age, DNF/PIT overlays, and lap pop animation.
// • CHART view: position-by-lap polylines with hover tooltips and snap-to-lap.
// • Playback: play/pause, 1x–20x speeds, optional car-motion smoothing.
// • Finish logic: freeze positions at FINAL_LAP with chequered handling.
// • Minisector timing: computes robust gaps from per-gate timestamps.
// • Responsive layout: board left, track/chart right, automatic row sizing.
// • Cross-panel hover: board ↔ track ↔ chart highlights stay in sync.
// • Subtle UI styling: “liquid glass” panels, segmented pills, crossfade switches.
//
// Architecture at a glance
// ------------------------
// 1) Global Config: constants for files, timings (green flag, minisectors, pit),
//    layout sizes, fonts/images, and UI labels.
// 2) Layout: compute BOARD_VP/TRACK_VP rectangles; unify pill sizing.
// 3) UI Buttons: interactive hitboxes, segmented pills, speed buttons, animations.
// 4) Data+State: parsed tables → points/times; per-driver state (laps, gaps, stints,
//    overlays), caches for smoothing, hover/selection, reveal fades, finish flags.
// 5) preload(): load CSVs and assets; prepare logos/tyre icons safely.
// 6) setup(): initialize state, transform CSVs → arrays, find gates, build layers.
// 7) draw():
//    - advance time; baseline minisectors at green; update DNF/pit/finish states
//    - render track layers/cars; detect gate crossings (minisectors & start/finish)
//    - recompute gaps; draw leaderboard; draw chart (if active); draw controls.
// 8) drawLeaderboard(): fixed sizing, headers, rows, gaps/tyres, hover sync, snapshots.
// 9) drawPositionsChart(): axes/grid, polylines, labels, hover tooltips, snap line.
// 10) Interaction: mouse/keyboard handlers (pills, speeds, row/car selection).
// 11) Resize: rebuild responsive layout and offscreen layers.
//
// Key constants to tweak
// ----------------------
// • FINAL_LAP, START_FINISH_TIMESTAMP, MINISECTOR_TS, PIT_* timestamps
// • BOARD_MAX_ROWS, CAR_DIAM, DOT_SIZE, TYRE_ICON
// • SPEED_PRESETS, ENABLE_SMOOTH, MIN_CROSSING_INTERVAL_SEC
// • TITLE_TEXT / TITLE_FONT_SIZE, logos/asset paths
//
// Notes
// -----
// • All timing comparisons use seconds-since-midnight parsed from ISO strings.
// • Minisector-based gaps reduce flicker by comparing like-for-like gate times.
// • Tyre age can come from 'age' or 'tyre_age_at_start' — both are supported.
// • The code keeps behavior unchanged if assets are missing (fails gracefully).
// ============================================================================


// #region Global Config

// List of driver numbers used across the sketch (e.g., for loading per-driver files,
// mapping positions, colors, badges). Keep in sync with your CSVs.
const DRIVER_NUMS = [1,2,3,4,10,11,14,16,18,20,22,23,24,27,31,44,55,63,77,81];

// CSV paths and helpers for data ingestion.
// DRIVER_INFO_PATH: static driver meta (name, team, color, etc.).
// LOCATION_PATH(n): per-driver time-stamped XY coordinates around the circuit.
// STINTS_PATH: tyre stints (compound, lap ranges, ages) for tyre icons/logic.
const DRIVER_INFO_PATH = 'source/data/drivers/drivers.csv';
const LOCATION_PATH = (n) => `source/data/location/location_driver_${n}.csv`;
const STINTS_PATH = 'source/data/stints/stints.csv';

// Visual parameters for the start/finish line rendering.
const START_LINE_LEN = 10;          // length of short tick marks composing the line
const START_LINE_STROKE = 1;        // stroke weight for the ticks
const START_LINE_ANGLE_DEG = 73;    // angle in degrees for the hatch pattern
// Absolute timestamp for when the leader crosses start/finish at the reference moment.
// Used to align motion vs. “race time” and to drive overlays (intro/pit window, etc.).
const START_FINISH_TIMESTAMP = "2024-06-30T13:03:03.203000+00:00";

// Timestamps of minisectors for sampling “pure time gaps” only at consistent points.
// These should be monotonically increasing and within the same lap time basis.
const MINISECTOR_TS = [
  "2024-06-30T13:00:15.684000+00:00",
  "2024-06-30T13:00:24.503000+00:00",
  "2024-06-30T13:00:33.363000+00:00",
  "2024-06-30T13:00:42.644000+00:00",
  "2024-06-30T13:00:50.383000+00:00",
  "2024-06-30T13:01:01.724000+00:00",
  "2024-06-30T13:01:12.603000+00:00",
  "2024-06-30T13:01:26.043000+00:00",
  "2024-06-30T13:01:35.424000+00:00",
];

// Pit-entry overlay control:
// PIT_ENTRY_TIMESTAMP: when pit entry becomes “live” for the overlay.
// SHOW_PIT_ENTRY_LINE: toggle rendering of a vertical marker/line at pit entry.
const PIT_ENTRY_TIMESTAMP = "2024-06-30T13:04:15.823000+00:00";
const SHOW_PIT_ENTRY_LINE = false;

// Window guards for UI overlays and logic gating.
// INTRO_END_TIMESTAMP: hide intro/banner elements after this moment.
// PIT_END_TIMESTAMP: stop showing pit-window cues after this moment.
const INTRO_END_TIMESTAMP = "2024-06-30T13:01:57.963000+00:00";
const PIT_END_TIMESTAMP   = "2024-06-30T13:05:20+00:00";

// DNF (did not finish) events injected by timestamp. Each object must include:
// - dn: driver number (string to match CSVs if they store as text)
// - timestamp: when the car should stop moving / be flagged as DNF.
const DNF_EVENTS = [{ dn: '4', timestamp: "2024-06-30T14:20:10.005000+00:00" }];

// Race summary metadata.
// FINAL_LAP: lap at which the sim freezes positions and shows the chequered flag.
// TITLE_*: heading text and sizing for the top bar / layout.
const FINAL_LAP = 72;
const TITLE_TEXT = 'Austrian Grand Prix 2024';
const TITLE_FONT_SIZE = 24;
// #endregion

// #region Layout (Responsive fullscreen)

// Viewport rectangles (in pixels) for the leaderboard (BOARD_VP) and track (TRACK_VP).
// Populated by computeLayout() on setup/resize.
let BOARD_VP, TRACK_VP;

// Common layout constants across board and track panels.
const PADDING = 40;                 // inner padding around panels (use sparingly)
const CAR_DIAM = 10;                // drawn car diameter on the track canvas
const HOVER_RADIUS_BASE = 14;       // base radius for easier car hover target
const HOVER_RING_WEIGHT = 2;        // hover ring stroke weight around a car
const SELECTED_RING_WEIGHT = 3;     // selected ring stroke weight (thicker than hover)
const HOVER_RING_GAP = 4;           // gap between car dot and the ring

// Leaderboard sizing.
const BOARD_MAX_ROWS = 20;          // hard cap for visible rows (full grid)
const BADGE_TEXT_SIZE = 12;         // number/text inside small badges
const BADGE_W = 18, BADGE_H = 18;   // badge box size next to names/positions

// Asset/icon sizes for header and tyre indicators.
const LOGO_SIZE = 18, DOT_SIZE = 24;
const TYRE_ICON = 25;

// Calculates responsive viewport rectangles so the board sits on the left and the
// track fills the remaining space on the right, with a fixed inter-panel gap.
// Also flags rowSizingDirty so the board can recompute row height on the next draw.
//
// Expects p5 globals: width, height, max(), constrain(), round(), etc.
// Uses a conservative minimum of 380px and max of 560px for the board width to
// keep the leaderboard readable on very wide or narrow screens.
function computeLayout(){
  const M = 20;           // outer margin around the entire canvas
  const GAP = 100;        // fixed spacing between board and track
  const h = max(1, height - M*2);  // usable height inside margins

  const boardW = Math.round(constrain(width * 0.28, 380, 560)); // 28% width, clamped
  const xBoard = M, yBoard = M;
  const xTrack = xBoard + boardW + GAP, yTrack = M;
  const trackW = max(1, width - xTrack - M);
  const trackH = h;

  BOARD_VP = { x:xBoard, y:yBoard, w:boardW, h:h };
  TRACK_VP = { x:xTrack, y:yTrack, w:trackW, h:trackH };

  // rowSizingDirty is a global flag toggled here and consumed elsewhere
  // (e.g., in the board renderer) to recompute fixed row height after layout changes.
  rowSizingDirty = true; // recompute fixed row height next draw
}
// #endregion

// #region Unified Big UI sizes (match across top + leaderboard)

// Dimensions for the “pill” controls (play/pause, speed, view mode) shared between
// the top control row and leaderboard header. Keeping them unified avoids jitter.
const BTN_H = 34;             // pill height
const BTN_W = 64;             // rectangular speed buttons width (non-pill style)
const BTN_LABEL_SIZE = 14;    // font size for text inside buttons/pills
const PILL_PAD_X = 12;        // horizontal inner padding (per segment) for width calc

const CONTROL_TEXT_SIZE = 14;         // font size for small control labels
const CONTROL_ROW_TOP_OFFSET = 40;    // y-offset from top for placing control row
const CONTROL_ROW_HEIGHT = BTN_H + 4; // overall row height to align with pill height
const PILL_H = BTN_H;                  // pill height mirrors BTN_H for consistency
const PILL_R = 12;                     // pill corner radius

// Computed segment width that all pill segments must share so labels never clip
// (e.g., “Leader”, “Ahead”, “Hide”, “Show”, and dynamic labels from UI_BTN getters).
let UNIFIED_PILL_SEG_W = 0;

// Measure the longest label among all segments and set UNIFIED_PILL_SEG_W accordingly.
// Using push()/pop() to contain textSize changes to this measurement scope.
// Note: UI_BTN.*.label() are assumed to be functions returning current captions.
// If localization or dynamic text changes, call this again after updates.
function computeUnifiedPillSegW(){
  const labels = [
    UI_BTN.bgL.label(), UI_BTN.bgR.label(),
    UI_BTN.viewL.label(), UI_BTN.viewR.label(),
    UI_BTN.playL.label(), UI_BTN.playR.label(),
    'Leader','Ahead','Hide','Show'
  ];
  let w = 0;
  push();
  textSize(BTN_LABEL_SIZE);
  labels.forEach(l => { w = Math.max(w, textWidth(l) + PILL_PAD_X*2); });
  pop();
  UNIFIED_PILL_SEG_W = Math.ceil(w);
}
// #endregion

// #region Playback-Buttons (+ segmented pills)

// Master playback flag. When false, the simulation time is frozen.
let isPlaying = true;

// Discrete speed multipliers for time progression.
// Used by the rectangular speed buttons (1x, 2x, 5x, 10x, 20x).
const SPEED_PRESETS = [1,2,5,10,20];

// Current playback speed (multiplier). Defaults to 5x to move things along quickly.
let playbackSpeed = 5.0;

// Index into SPEED_PRESETS that matches the initial speed (5x).
let speedIndex = SPEED_PRESETS.indexOf(5);

// Horizontal gap in pixels between adjacent UI controls.
const GAP_BTN = 8;

// UI hitboxes
// Central registry of interactive rects (x,y,w,h) and display labels for all
// top-row controls. These are positioned in layoutButtonsTrack() and then used
// both for rendering and for pointer hit-testing in mouse handlers.
// Pills are modeled as two adjacent segments: Left (L) and Right (R).
const UI_BTN = {
  // Background visibility pill: Off vs On
  bgL:{x:0,y:0,w:0,h:BTN_H,label:()=> "BG Off"},
  bgR:{x:0,y:0,w:0,h:BTN_H,label:()=> "BG On"},

  // View-mode pill: Track (map view) vs Chart (position-by-lap chart)
  viewL:{x:0,y:0,w:0,h:BTN_H,label:()=> "Track"},
  viewR:{x:0,y:0,w:0,h:BTN_H,label:()=> "Chart"},

  // Playback pill: Play vs Pause
  playL:{x:0,y:0,w:0,h:BTN_H,label:()=> "Play"},
  playR:{x:0,y:0,w:0,h:BTN_H,label:()=> "Pause"},

  // Discrete speed buttons (fixed width), arranged left→right
  s1:{x:0,y:0,w:BTN_W,h:BTN_H,label:()=> "1x"},
  s2:{x:0,y:0,w:BTN_W,h:BTN_H,label:()=> "2x"},
  s5:{x:0,y:0,w:BTN_W,h:BTN_H,label:()=> "5x"},
  s10:{x:0,y:0,w:BTN_W,h:BTN_H,label:()=> "10x"},
  s20:{x:0,y:0,w:BTN_W,h:BTN_H,label:()=> "20x"},

  // Bounding box that encloses the entire button group for a tidy card background.
  group:{x:0,y:0,w:0,h:0},

  // leaderboard header pills filled in drawLeaderboard
  // Gap mode switch (Leader vs Ahead) and tyre icon visibility (Hide/Show)
  gapL:{x:0,y:0,w:0,h:0,label:()=> "Leader"},
  gapA:{x:0,y:0,w:0,h:0,label:()=> "Ahead"},
  tyreHide:{x:0,y:0,w:0,h:0,label:()=> "Hide"},
  tyreShow:{x:0,y:0,w:0,h:0,label:()=> "Show"},
};

// pill animation states
// These hold normalized 0→1 states for smooth animated transitions of pill toggles.
// They can be lerped per frame to achieve a sliding highlight or cross-fade.
let bgAnim = 0;   // 0=Off 1=On (background visibility)
let playAnim = 0; // 0=Play 1=Pause (playback state)
let viewAnim = 0; // 0=Track 1=Chart (view mode)

// The actual boolean state for BG visibility; bgAnim animates toward this.
let bgVisible = true; // actual state

// Compute and assign absolute positions for all top-row controls relative to TRACK_VP.
// Uses UNIFIED_PILL_SEG_W so the two-segment pills never clip labels.
// Also computes a "group" rect with padding to draw a nice container behind the row.
function layoutButtonsTrack(){
  computeUnifiedPillSegW();

  const pad = 16;
  let x = TRACK_VP.x + pad;
  const y = TRACK_VP.y + pad;

  // BG pill
  UI_BTN.bgL = { ...UI_BTN.bgL, x, y, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  UI_BTN.bgR = { ...UI_BTN.bgR, x: x + UNIFIED_PILL_SEG_W, y, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  x += UNIFIED_PILL_SEG_W*2 + GAP_BTN;

  // View pill
  UI_BTN.viewL = { ...UI_BTN.viewL, x, y, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  UI_BTN.viewR = { ...UI_BTN.viewR, x: x + UNIFIED_PILL_SEG_W, y, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  x += UNIFIED_PILL_SEG_W*2 + GAP_BTN;

  // Play/Pause pill
  UI_BTN.playL = { ...UI_BTN.playL, x, y, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  UI_BTN.playR = { ...UI_BTN.playR, x: x + UNIFIED_PILL_SEG_W, y, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  x += UNIFIED_PILL_SEG_W*2 + GAP_BTN;

  // Speed buttons (fixed width)
  UI_BTN.s1.x=x;  UI_BTN.s1.y=y;  x+=BTN_W+GAP_BTN;
  UI_BTN.s2.x=x;  UI_BTN.s2.y=y;  x+=BTN_W+GAP_BTN;
  UI_BTN.s5.x=x;  UI_BTN.s5.y=y;  x+=BTN_W+GAP_BTN;
  UI_BTN.s10.x=x; UI_BTN.s10.y=y; x+=BTN_W+GAP_BTN;
  UI_BTN.s20.x=x; UI_BTN.s20.y=y; x+=BTN_W+GAP_BTN;

  // Group background rect with a small padding halo around the controls.
  const groupX = (UI_BTN.bgL.x - 8), groupY = y - 8;
  const groupW = (x - UI_BTN.bgL.x) + 16;
  const groupH = BTN_H + 16;
  UI_BTN.group = { x: groupX, y: groupY, w: groupW, h: groupH };
}
// #endregion

// #region Smooth config
// Global time offset (seconds) applied to all time-based reads. Keep zero unless
// aligning to an external clock or doing “jump to moment” features.
const TIME_OFFSET_SECONDS = 0;

// Toggle for positional smoothing (e.g., exponential smoothing of world→screen).
// When false, cars jump directly to the raw sampled location each frame.
const ENABLE_SMOOTH = true;
// #endregion

// #region Gate / Lap Counter Config
// Half-length of the virtual start/finish gate (pixels in world space after scaling).
// The gate is used to detect lap crossings when a car passes through its segment.
const GATE_HALF_LEN = 24;

// Debounce time (seconds) between successive gate crossings for the same car,
// preventing double-counting due to jitter or path noise.
const MIN_CROSSING_INTERVAL_SEC = 4.0;

// Delay (seconds) before we begin counting laps after green—avoids counting the
// pre-start formation movement or intro animation wiggles as a lap.
const LAP_COUNT_START_DELAY_SEC = 1.0;

// Drivers that should initially be considered in the pit state at race start.
// Useful for overlays or skipping early crossings through pit entry.
const PIT_START_DRIVERS = new Set(['24']);
// #endregion

// #region Data + State
// Data tables (csvs loaded via p5.Table) and derived per-driver structures.
let driverInfo, locationTables = {};
let points = {}, timesByDriver = {};
let driverColors = {}, driverAcronym = {}, teamByDriver = {};

// Leaderboard rendering helpers: last known positions, delta since previous frame,
// and Y-coordinate mapping per driver for stable row layout.
let lastPositions = {}, positionChanges = {}, driverY = {};

// Track world bounds and scale/center for fitting to viewport.
let minX=0, maxX=0, minY=0, maxY=0, s = 1;
let centerX = 0, centerY = 0;

// Offscreen buffers: baseLayer for static art (track, background), trackLayer for cars.
let baseLayer, trackLayer;

// Background image and path (e.g., stylized rubber marbling underlay).
const BG_PATH = 'source/images/background/fluid_tyre_bg.png';
let bgImg = null;

// World-space references for start/finish and minisector gates, plus cached slope (K_MS)
// for projecting timestamps to minisector indices. pitEntry* stores pit entry geometry.
let startFinishWorldPos = null;
let miniGates = [], K_MS = 0;
let pitEntryWorldPos = null, pitEntryAngleDeg = START_LINE_ANGLE_DEG;

// Absolute epoch (seconds) for the race start (derived from START_FINISH_TIMESTAMP).
let RACE_START_ABS_SEC = 0;

// Runtime clocking for the sim and board animations.
// - raceTime: current race-relative seconds
// - boardStartSec/carStartSec: anchors for syncing board/car animations after pauses
// - lastDt: delta time between frames
// - lastBoardAbsSec: absolute wall-clock sec at last board tick (for smoothing)
let raceTime = 0, boardStartSec = 0, carStartSec = 0, lastDt = 0;
let lastBoardAbsSec = 0;

// Interaction state for hover/selection across track and board UIs.
let selectedDriver = null, hoveredDriver = null;
let hoveredDriverGlobal = null;
let hoveredOrigin = null; // which panel produced the hover (for coordinated highlight)
let lastFrameScreenPos = {}, smoothWorldPos = {};

// Typography and branding assets.
let titleFont;

let teamLogos = {};
let flagImg = null;
let f1LogoImg = null;
const F1_LOGO_PATH = 'source/images/F1tm/F1.png';
const F1_LOGO_H = 80;

// Lap timing storage per driver: lapCounts, per-lap times, and previous screen pos
// for direction checks across the gate; lastCrossSec debounces gate hits.
let lapCounts = {}, lapTimes = {}, prevScreenPos = {}, lastCrossSec = {};

// Minisector timing accumulators for more stable gap calculation.
// lastMiniCrossSecByGate tracks per-gate last hit times to avoid double counting.
let miniCounts = {}, lastMiniCrossSec = {};
let lastMiniCrossSecByGate = {};
let miniLapTimesByGate = {};

// Pit overlay state: per-driver active flags and last time they crossed pit entry.
let pitOverlayActive = {};
let lastPitEntryCrossSec = {};

// DNF overlay state and absolute times when DNFs were triggered.
let dnfOverlayActive = {};
let dnfTimesAbsSec = {};

// Finish logic: set of frozen drivers, their frozen positions, and flags to ensure
// we only freeze once and display the chequered sequence correctly.
let frozenDrivers = new Set();
let freezePos = {};
let freezePending = {};
let raceFinishTriggered = false;
let finishLeaderDn = null;
let awaitingFlag = {};

// Intro “reveal” animation for driver rows/cars (fade-in per driver).
let revealedDrivers = new Set(), revealAlpha = {};
const REVEAL_FADE_DURATION_SEC = 0.4;

// Baseline mini-sector references captured exactly at green so “pure time gaps”
// are measured at matching spatial samples thereafter.
let baselineMiniAtGreen = {}, baselinedAtGreen = false;

// Gap caches relative to leader and to the car ahead, plus currently identified leader.
let gapsToLeader = {};
let gapsToAhead  = {};
let currentLeader = null;

// Rolling mini-sector sequence times and last “stable” gaps (for the board to show
// steady values instead of flickering frame-by-frame deltas).
let miniSeqTimes = {};
let lastStableGaps = {};
let lastStableGapsAhead = {};

// Leaderboard gap display mode and small UI animation values (0→1).
let gapMode = 'LEADER';
let gapAnim = 0;
let tyreAnim = 0;

// Toggle to show/hide tyre icons on the leaderboard.
let showTyre = false;

// Tyre stint data (table + grouped by driver) and preloaded tyre images.
let stintsTable = null;
let stintsByDriver = {};
let tyreImgs = { SOFT:null, MEDIUM:null, HARD:null };

// Global view mode (TRACK map vs CHART positions-over-laps).
let viewMode = 'TRACK'; // 'TRACK' or 'CHART'

// For chart mode: per-lap position history, last recorded lap to limit writes,
// and hover state for interactive tooltip/vertical tracker.
let positionsByLap = {};
let lastRecordedLap = 0;
let chartHover = null;

// Cross-fade transition state between TRACK and CHART views.
// t ∈ [0, dur]; 'switched' guards one-time actions upon passing the midpoint.
let viewSwitch = { active:false, from:'TRACK', to:'CHART', t:0, dur:0.45, switched:false };
// #endregion

// #region FIXED leaderboard sizing state
// Flag to recompute row height/fonts when layout changes (e.g., window resize).
let rowSizingDirty = true;

// Baseline row height for leaderboard entries; recalculated to fit viewport.
let FIXED_ROW_H = 44;         // recomputed per layout

// Font sizes (px) locked to layout so board + header text remain consistent.
let FIXED_ROW_FONT = 20;
let FIXED_HEADER_FONT = 18;

// Cached “current” row height actually used by the board renderer this frame.
let BOARD_ROW_H_CURR = FIXED_ROW_H;
// #endregion

// #region Lap "pop" animation state
// The most recent lap number shown (used to trigger a pop when it changes).
let lastLapDisplayed = 0;

// Simple pop animation controller: active flag, elapsed time t, and duration dur.
// When active, UI elements (e.g., lap number) can scale/fade for dur seconds.
let lapPop = { active:false, t:0, dur:0.40 }; // 0.40s pop
// #endregion

// #region Helpers

// Convert a hex string (e.g., "#AABBCC" or "AABBCC") to a p5.Color.
// Returns the provided fallback if input is falsy or invalid.
function hexToP5ColorMaybe(hexStr, fallback){
  if(!hexStr) return fallback;
  const clean = hexStr.trim().replace(/^#/, '');
  if(!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return color('#'+clean);
}

// NEW: safer table get + tyre compound normalizer

// Safe p5.Table string getter: returns '' on out-of-bounds/undefined/null.
function safeGet(table, r, col){
  try { const v = table.getString(r, col); return (v===undefined || v===null) ? '' : v; }
  catch(e){ return ''; }
}

// Normalize tyre compound codes to canonical values: SOFT, MEDIUM, HARD.
// Accepts 'S'/'M'/'H' or words starting with 'SOFT'/'MED'/'HARD'.
function normalizeCompound(comp){
  if(!comp) return null;
  const c = comp.trim().toUpperCase();
  if (c==='S') return 'SOFT';
  if (c==='M') return 'MEDIUM';
  if (c==='H') return 'HARD';
  if (c.startsWith('SOFT')) return 'SOFT';
  if (c.startsWith('MED'))  return 'MEDIUM';
  if (c.startsWith('HARD')) return 'HARD';
  // assume already SOFT/MEDIUM/HARD (or unknown)
  return c;
}

// Glassy panel style: subtle fill, inner glow, and hairline stroke.
// Useful as a backdrop for control groups or the leaderboard container.
function drawLiquidGlassPanel(x, y, w, h) {
  push();
  fill(80, 80, 80, 20); noStroke(); rect(x, y, w, h, 12);
  drawingContext.shadowBlur = 25;
  drawingContext.shadowColor = color(200, 200, 200, 30);
  fill(100, 100, 100, 12); rect(x, y, w, h, 12);
  stroke(220, 220, 220, 70); strokeWeight(1); noFill(); rect(x, y, w, h, 12);
  drawingContext.shadowBlur = 0;
  pop();
}

// Parse an ISO 8601 string and return seconds since midnight (local parsing).
// Example: "2024-06-30T13:03:03.203Z" → 13*3600 + 3*60 + 3.203
function parseIsoToSecOfDay(isoStr){
  const t = (isoStr.split('T')[1] || '00:00:00');
  const parts = t.split(':');
  const hh = int(parts[0]||'0');
  const mm = int(parts[1]||'0');
  const ss = parts[2] ? float(parts[2]) : 0;
  return hh*3600 + mm*60 + ss;
}

// Convert "HH:MM:SS(.mmm)" to total seconds (float).
function timeToSeconds(t){
  const p=t.split(':'), h=int(p[0]), m=int(p[1]);
  const s = p[2].includes('.')? float(p[2]) : int(p[2]);
  return h*3600 + m*60 + s;
}

// Convert seconds → "HH:MM:SS" (floors to whole seconds).
function secondsToTime(sec){
  const h=floor(sec/3600), m=floor((sec%3600)/60), s=floor(sec%60);
  return nf(h,2)+':'+nf(m,2)+':'+nf(s,2);
}

// Format a positive time gap with sign, showing ms when < 60s.
// Examples: 0.532 → "+0.532s"; 75.123 → "+1:15.123"
function formatGap(sec){
  if (sec == null || !isFinite(sec)) return '';
  if (sec < 60) return `+${sec.toFixed(3)}s`;
  const m = Math.floor(sec / 60);
  const s = (sec - m*60);
  return `+${m}:${s.toFixed(3).padStart(6,'0')}`;
}

// World→screen transform using center (centerX, centerY) and scale s.
// Y is flipped so increasing world Y appears upward on screen.
function mapToScreen(pos){
  return createVector((pos.x-centerX)*s + TRACK_VP.w/2, -(pos.y-centerY)*s + TRACK_VP.h/2);
}

// Draw a solid circular “car” dot with optional alpha.
function drawCarDot(x,y,d,col,a=255){
  push(); noStroke(); const c=color(col); c.setAlpha(a); fill(c); ellipse(x,y,d,d); pop();
}

// Tooltip with basic bounds avoidance: tries to stay inside TRACK_VP.
function drawTooltip(x,y,str){
  textSize(14); textAlign(LEFT,TOP);
  const pad=6, tw=textWidth(str), th=16;
  let bx=x+12, by=y-th-12;
  if (bx+tw+pad*2 > TRACK_VP.x+TRACK_VP.w) bx = TRACK_VP.x+TRACK_VP.w - (tw+pad*2) - 4;
  if (by < TRACK_VP.y) by = y + 12;
  push(); noStroke(); fill(0,180); rect(bx,by,tw+pad*2,th+pad*2,6); fill(255); text(str,bx+pad,by+pad); pop();
}

// Draw text truncated to maxW with an ellipsis. Uses binary search to find fit.
function drawTruncatedText(txt, x, baselineY, maxW){
  if (maxW <= 0) return;
  if (textWidth(txt) <= maxW){ text(txt, x, baselineY); return; }
  const ell = '…';
  let lo = 0, hi = txt.length;
  while (lo < hi){
    const mid = Math.floor((lo+hi+1)/2);
    const part = txt.slice(0, mid) + ell;
    if (textWidth(part) <= maxW) lo = mid; else hi = mid-1;
  }
  text(txt.slice(0, lo) + ell, x, baselineY);
}

// Return the greatest index i where arr[i] <= t (array assumed ascending).
function indexLE(arr,t){ let lo=0,hi=arr.length-1,ans=0; while(lo<=hi){const mid=(lo+hi)>>1; if(arr[mid]<=t){ans=mid; lo=mid+1;} else hi=mid-1;} return ans; }

// Axis-aligned rectangle hit test.
function pointInRect(px,py,r){ return px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h; }

// 🔸 Single source of truth for the on-track hover ring + tooltip
// Draws a two-ring highlight around a car (soft dark halo + colored inner ring),
// then places a tooltip with the provided label near the cursor/car.
function drawHoverRingAndTooltip(cx, cy, ringColor, label){
  push();
  noFill();
  // soft outer dark halo
  stroke(0,180); strokeWeight(HOVER_RING_WEIGHT+2);
  ellipse(cx, cy, CAR_DIAM + HOVER_RING_GAP*2, CAR_DIAM + HOVER_RING_GAP*2);
  // colored inner ring
  stroke(ringColor); strokeWeight(HOVER_RING_WEIGHT);
  ellipse(cx, cy, CAR_DIAM + HOVER_RING_GAP*2, CAR_DIAM + HOVER_RING_GAP*2);
  pop();
  drawTooltip(cx, cy, label);
}

// Compute the lap number shown in the header for a driver, accounting for
// drivers who are flagged as starting in the pit (PIT_START_DRIVERS).
function numericLap(c,pitStart){ return pitStart ? ((c===0)?1:(c+1)) : ((c===0)?1:c); }

// Find the maximum lap number (for header display) across all drivers.
function lapHeaderNumeric(){
  let mx=1; for(const k in lapCounts){ const c=lapCounts[k]||0; const pit=PIT_START_DRIVERS.has(k);
    const ln=numericLap(c,pit); if(ln>mx) mx=ln; } return mx;
}

// Construct a gate (position + angle) from an exact timestamp match in an array of
// samples ({date, pos}). If neighbors exist, infer angle from the local direction.
function gateFromTimestamp(arr, ts, defaultAngleDeg=START_LINE_ANGLE_DEG){
  let idx=-1; for(let i=0;i<arr.length;i++) if(arr[i].date===ts){idx=i;break;}
  if(idx<0) return null;
  const pos=arr[idx].pos.copy();
  let pA=null,pB=null;
  if(idx>0 && idx<arr.length-1){pA=arr[idx-1].pos; pB=arr[idx+1].pos;}
  else if(idx<arr.length-1){pA=arr[idx].pos; pB=arr[idx+1].pos;}
  else if(idx>0){pA=arr[idx-1].pos; pB=arr[idx].pos;}
  let angleDeg=defaultAngleDeg;
  if(pA&&pB){ const dx=pB.x-pA.x, dy=pB.y-pA.y; if(Math.abs(dx)+Math.abs(dy)>1e-6) angleDeg=degrees(Math.atan2(dy,dx)); }
  return { worldPos: pos, angleDeg };
}

// Fuzzy variant: if no exact timestamp match, select the nearest by seconds-of-day
// within toleranceSec. Returns null if none within tolerance.
function gateFromTimestampFuzzy(arr, ts, defaultAngleDeg=START_LINE_ANGLE_DEG, toleranceSec=3.0){
  if(!arr || !arr.length) return null;
  for(let i=0;i<arr.length;i++) if(arr[i].date===ts){ return gateFromTimestamp(arr, ts, defaultAngleDeg); }
  const target = parseIsoToSecOfDay(ts);
  let bestIdx = -1, bestDiff = Infinity;
  for(let i=0;i<arr.length;i++){
    const d = Math.abs(arr[i].tSec - target);
    if(d < bestDiff){ bestDiff = d; bestIdx = i; }
  }
  if(bestIdx<0 || bestDiff>toleranceSec) return null;
  const pos=arr[bestIdx].pos.copy();
  let pA=null,pB=null;
  if(bestIdx>0 && bestIdx<arr.length-1){pA=arr[bestIdx-1].pos; pB=arr[bestIdx+1].pos;}
  else if(bestIdx<arr.length-1){pA=arr[bestIdx].pos; pB=arr[bestIdx+1].pos;}
  else if(bestIdx>0){pA=arr[bestIdx-1].pos; pB=arr[bestIdx].pos;}
  let angleDeg=defaultAngleDeg;
  if(pA&&pB){ const dx=pB.x-pA.x, dy=pB.y-pA.y; if(Math.abs(dx)+Math.abs(dy)>1e-6) angleDeg=degrees(Math.atan2(dy,dx)); }
  return { worldPos: pos, angleDeg };
}

// Return the current tyre compound for a driver at a given lap.
// Falls back to the last stint that started before lapNum if no inclusive match.
function currentCompoundForDriver(dn, lapNum){
  const arr = stintsByDriver[dn];
  if(!arr || !arr.length) return null;
  for(let i=0;i<arr.length;i++){
    const s = arr[i];
    if(lapNum>=s.lap_start && lapNum<=s.lap_end) return s.compound;
  }
  let best=null;
  for(let i=0;i<arr.length;i++){ const s=arr[i]; if(s.lap_start<=lapNum) best=s; }
  return best ? best.compound : null;
}

// Estimate tyre age (in laps) for a driver at lapNum, combining the stint-relative
// progression with any provided starting age (age or tyre_age_at_start).
function currentTyreAgeForDriver(dn, lapNum){
  const arr = stintsByDriver[dn];
  if(!arr || !arr.length) return null;
  for(let i=0;i<arr.length;i++){
    const s = arr[i];
    if(lapNum>=s.lap_start && lapNum<=s.lap_end){
      const baseAge = isNaN(s.age) ? (s.tyre_age_at_start||0) : s.age;
      return (lapNum - s.lap_start) + (baseAge || 0);
    }
  }
  let best=null;
  for(let i=0;i<arr.length;i++){ const s=arr[i]; if(s.lap_start<=lapNum) best=s; }
  if(best){
    const baseAge = isNaN(best.age) ? (best.tyre_age_at_start||0) : best.age;
    return (lapNum - best.lap_start) + (baseAge || 0);
  }
  return null;
}

// Draw an image scaled to cover an area (like CSS object-fit: cover):
// preserves aspect ratio, fills the box, and centers with cropping if needed.
function drawImageCover(img, x, y, w, h){
  const iw = (img && img.width) ? img.width : 1;
  const ih = (img && img.height) ? img.height : 1;
  const scale = Math.max(w/iw, h/ih);
  const nw = iw * scale, nh = ih * scale;
  const ox = x + (w - nw)/2;
  const oy = y + (h - nh)/2;
  image(img, ox, oy, nw, nh);
}
// #endregion

// #region Gaps recompute
// Recompute time gaps using minisector events.
// Logic:
// 1) Build candidate list of drivers that are currently "revealed" with their
//    raw minisector counts (minus the baseline captured at green) and the time
//    since they last crossed any minisector.
// 2) If no candidates, fall back to last stable gaps and clear leader.
// 3) Otherwise, order by progress (rawMini desc), then recency (timeSince desc).
//    The first in order is the currentLeader.
// 4) For each driver, compute:
//    - gap to leader: compare last timestamp at the same minisector index
//    - gap to ahead:  compare vs. the driver directly ahead in the order
//    If data is missing, fall back to last stable value to avoid flicker.
// 5) Store new gaps and update "lastStable" caches. Leaders get special tags.
function recomputeGapsSFandMinisectors(){
  const cand = [];
  for (const dn in lapCounts){
    if (!revealedDrivers.has(dn)) continue;
    const base   = baselinedAtGreen ? (baselineMiniAtGreen[dn] || 0) : 0;
    const raw    = Math.max(0, (miniCounts[dn] || 0) - base);
    const last   = lastMiniCrossSec[dn];
    const since  = isFinite(last) ? (lastBoardAbsSec - last) : -1e99;
    cand.push({ dn, rawMini: raw, timeSince: since });
  }

  // No data yet: degrade gracefully by using the last stable values,
  // but null out any previous "leader" tags since we cannot determine one.
  if (cand.length === 0){
    const newLeader = {}; const newAhead  = {};
    for (const dn in lapCounts){
      const gL = lastStableGaps[dn] || { type:'na' };
      const gA = lastStableGapsAhead[dn] || { type:'na' };
      newLeader[dn] = (gL.type==='leader') ? { type:'na' } : gL;
      newAhead[dn]  = (gA.type==='leader') ? { type:'na' } : gA;
    }
    gapsToLeader = newLeader; gapsToAhead  = newAhead; currentLeader = null; return;
  }

  // Sort: more minisectors completed first; tie-break by most recent activity.
  cand.sort((a,b)=>{ if (b.rawMini !== a.rawMini) return b.rawMini - a.rawMini; return (b.timeSince - a.timeSince); });
  const order = cand.map(c=>c.dn);
  currentLeader = order[0];

  const newLeader = {}; const newAhead = {};
  const leaderSeq = miniSeqTimes[currentLeader] || [];

  // Compute new gap objects for each driver.
  for (let i=0;i<order.length;i++){
    const dn = order[i]; const seq = miniSeqTimes[dn] || [];

    // Gap to leader
    if (dn === currentLeader){ newLeader[dn] = { type:'leader' }; }
    else if (seq.length === 0){ const fb = lastStableGaps[dn]; newLeader[dn] = (!fb||fb.type==='leader')?{type:'na'}:fb; }
    else {
      const idx=seq.length-1, tD=seq[idx], tL=(leaderSeq.length>idx)?leaderSeq[idx]:null;
      if(tL!==null){ newLeader[dn]={type:'time', gapSec:Math.max(0,tD-tL)}; }
      else { const fb=lastStableGaps[dn]; newLeader[dn]=(!fb||fb.type==='leader')?{type:'na'}:fb; }
    }

    // Gap to car ahead in current minisector order
    if (i===0){ newAhead[dn] = { type:'leader' }; }
    else {
      const aheadDn = order[i-1]; const seqAhead = miniSeqTimes[aheadDn] || [];
      if (seq.length === 0){ const fbA=lastStableGapsAhead[dn]; newAhead[dn]=(!fbA||fbA.type==='leader')?{type:'na'}:fbA; }
      else {
        const idx=seq.length-1, tD=seq[idx], tA=(seqAhead.length>idx)?seqAhead[idx]:null;
        if (tA!==null){ newAhead[dn]={type:'time', gapSec:Math.max(0,tD-tA)}; }
        else { const fbA=lastStableGapsAhead[dn]; newAhead[dn]=(!fbA||fbA.type==='leader')?{type:'na'}:fbA; }
      }
    }
  }

  // Commit and refresh stability caches (leaders get normalized to time 0).
  gapsToLeader = newLeader; gapsToAhead  = newAhead;
  for (const dn in newLeader){ const g=newLeader[dn]; lastStableGaps[dn]=(g&&g.type==='leader')?{type:'time',gapSec:0}:g; }
  for (const dn in newAhead){ const g=newAhead[dn]; lastStableGapsAhead[dn]=(g&&g.type==='leader')?{type:'na'}:g; }
}
// #endregion

// #region preload
// Load all static resources and CSV tables before setup() runs.
// Includes: driver info, per-driver location traces, stints, team logos,
// fonts, flag, F1 logo, tyre icons, and optional background image.
function preload(){
  // Tabular data
  driverInfo = loadTable(DRIVER_INFO_PATH, 'csv', 'header');
  DRIVER_NUMS.forEach(n=>{ locationTables[n]=loadTable(LOCATION_PATH(n),'csv','header'); });
  stintsTable = loadTable(STINTS_PATH, 'csv', 'header');

  // Team logos: each has a success and failure callback to fill teamLogos map.
  const ok=()=>{}, fail=(k)=>()=>{teamLogos[k]=null;};
  teamLogos['McLaren']         = loadImage('source/images/teams/2025mclarenlogowhite.png',    ok, fail('McLaren'));
  teamLogos['Aston Martin']    = loadImage('source/images/teams/2025astonmartinlogowhite.png', ok, fail('Aston Martin'));
  teamLogos['Williams']        = loadImage('source/images/teams/2025williamslogowhite.png',    ok, fail('Williams'));
  teamLogos['Mercedes']        = loadImage('source/images/teams/2025mercedeslogowhite.png',    ok, fail('Mercedes'));
  teamLogos['Alpine']          = loadImage('source/images/teams/2025alpinelogowhite.png',      ok, fail('Alpine'));
  teamLogos['Haas F1 Team']    = loadImage('source/images/teams/2025haaslogowhite.png',        ok, fail('Haas F1 Team'));
  teamLogos['RB']              = loadImage('source/images/teams/2025racingbullslogowhite.png', ok, fail('RB'));
  teamLogos['Kick Sauber']     = loadImage('source/images/teams/2025kicksauberlogowhite.png',  ok, fail('Kick Sauber'));
  teamLogos['Red Bull Racing'] = loadImage('source/images/teams/2025redbullracinglogowhite.png', ok, fail('Red Bull Racing'));
  teamLogos['Ferrari']         = loadImage('source/images/teams/2025ferrarilogowhite.png',     ok, fail('Ferrari'));

  // Fonts and icons
  titleFont = loadFont('source/fonts/Formula1-Bold.ttf');
  flagImg = loadImage('source/images/F1tm/chequered_flag.png');
  f1LogoImg = loadImage(F1_LOGO_PATH);

  // Tyre icons with simple success/fail handling.
  const loadTyrePng = (key, base) => {
    tyreImgs[key] = null;
    tyreImgs[key] = loadImage(
      `source/images/tyres/${base}.png`,
      img => { tyreImgs[key] = img; },
      () => { tyreImgs[key] = null; }
    );
  };
  loadTyrePng('SOFT',   'soft_tyre');
  loadTyrePng('MEDIUM', 'medium_tyre');
  loadTyrePng('HARD',   'hard_tyre');

  // Optional background art
  bgImg = loadImage(BG_PATH, img => { bgImg = img; }, () => { bgImg = null; });
}
// #endregion

// #region setup + viewport rebuild
// Initialize canvas, load data into structures, compute world bounds, gates,
// pit entry geometry, and build offscreen layers. Also initializes per-driver
// state (colors, acronyms, counters) and UI layout.
function setup(){
  createCanvas(windowWidth, windowHeight);
  pixelDensity(2);
  frameRate(60);

  computeLayout();

  // Build driver meta and initialize per-driver state.
  const fallback = (i)=>color((i*47)%255,(i*91)%255,(i*139)%255);
  for(let r=0;r<driverInfo.getRowCount();r++){
    const numStr = driverInfo.getString(r,'driver_number');
    const hex    = driverInfo.getString(r,'team_colour');
    const acr    = driverInfo.getString(r,'name_acronym')||'';
    const team   = driverInfo.getString(r,'team_name')||'';
    const i = DRIVER_NUMS.indexOf(int(numStr));
    const fb = fallback(i<0? r : i);

    driverColors[numStr]  = hexToP5ColorMaybe(hex, fb);
    driverAcronym[numStr] = acr.trim();
    teamByDriver[numStr]  = team.trim();

    // Lap and minisector counters and debounce tracking
    lapCounts[numStr]=0; lapTimes[numStr]=[];
    prevScreenPos[numStr]=null; lastCrossSec[numStr]=-Infinity;

    lastMiniCrossSecByGate[numStr]={};
    miniLapTimesByGate[numStr]={};
    miniCounts[numStr]=0; lastMiniCrossSec[numStr]=-Infinity;

    // Pit/DNF/reveal states
    pitOverlayActive[numStr]=false; lastPitEntryCrossSec[numStr]=-Infinity;
    dnfOverlayActive[numStr]=false;
    awaitingFlag[numStr]=false;

    revealAlpha[numStr]=0;

    // Gaps/minisector sequences
    miniSeqTimes[numStr]=[]; lastStableGaps[numStr]={type:'na'}; lastStableGapsAhead[numStr]={type:'na'};
  }
  // Ensure every driver in DRIVER_NUMS has at least fallback color/acronym.
  DRIVER_NUMS.forEach((n,i)=>{ const k=String(n); if(!driverColors[k]) driverColors[k]=fallback(i); if(!driverAcronym[k]) driverAcronym[k]=k; });

  // ---------- Build stintsByDriver from stints.csv (NEW) ----------
  stintsByDriver = {};
  if (stintsTable){
    for (let r = 0; r < stintsTable.getRowCount(); r++){
      const dn  = safeGet(stintsTable, r, 'driver_number').trim();
      if (!dn) continue;

      const lap_start = int(safeGet(stintsTable, r, 'lap_start') || '0');
      const lap_end   = int(safeGet(stintsTable, r, 'lap_end')   || '0');
      const compound  = normalizeCompound(safeGet(stintsTable, r, 'compound'));

      // both fields supported; 'age' optional, TAS optional
      const ageStr = safeGet(stintsTable, r, 'age');
      const tasStr = safeGet(stintsTable, r, 'tyre_age_at_start');

      const age = (ageStr !== '') ? int(ageStr) : NaN;
      const tyre_age_at_start = (tasStr !== '') ? int(tasStr) : 0;

      (stintsByDriver[dn] ??= []).push({ lap_start, lap_end, compound, age, tyre_age_at_start });
    }
    // Keep stints in chronological order for search functions.
    for (const dn in stintsByDriver){
      stintsByDriver[dn].sort((a,b) => a.lap_start - b.lap_start);
    }
  }
  // ---------------------------------------------------------------

  // Parse location samples into arrays and collect bounds/times.
  let introLap1=[], allPos=[], allTimes=[];
  DRIVER_NUMS.forEach(n=>{
    const t=locationTables[n]; const arr=[], times=[];
    for(let r=0;r<t.getRowCount();r++){
      const x=float(t.getString(r,'x')), y=float(t.getString(r,'y'));
      const date=t.getString(r,'date'); if(isNaN(x)||isNaN(y)) continue;
      const pos=createVector(x,y); const tt=parseIsoToSecOfDay(date);
      arr.push({pos,date,tSec:tt}); times.push(tt); allPos.push(pos); allTimes.push(tt);
      if(n===1 && date<=INTRO_END_TIMESTAMP) introLap1.push(pos);
    }
    points[n]=arr; timesByDriver[n]=times;
  });

  // Earliest absolute time among all samples (used to sync animations).
  carStartSec = allTimes.length ? allTimes.reduce((m,v)=>Math.min(m,v), Infinity) : 0;

  // Compute world bounds if any positions exist.
  if(allPos.length>0){
    minX=allPos.reduce((m,p)=>Math.min(m,p.x),Infinity);
    maxX=allPos.reduce((m,p)=>Math.max(m,p.x),-Infinity);
    minY=allPos.reduce((m,p)=>Math.min(m,p.y),Infinity);
    maxY=allPos.reduce((m,p)=>Math.max(m,p.y),-Infinity);
  }

  // Start/finish world reference and base "race start" absolute seconds.
  const p1 = points[1]||[];
  for(let i=0;i<p1.length;i++) if(p1[i].date===START_FINISH_TIMESTAMP){ startFinishWorldPos=p1[i].pos.copy(); break; }
  RACE_START_ABS_SEC = parseIsoToSecOfDay(START_FINISH_TIMESTAMP);

  // Precompute DNF absolute seconds by driver
  DNF_EVENTS.forEach(ev=>{ dnfTimesAbsSec[ev.dn] = parseIsoToSecOfDay(ev.timestamp); });

  // Build minisector gates from car #1 path using configured timestamps.
  miniGates=[]; MINISECTOR_TS.forEach((ts,idx)=>{
    const g=gateFromTimestamp(p1,ts,START_LINE_ANGLE_DEG);
    if(g) miniGates.push({name:`M${idx+1}`, worldPos:g.worldPos, angleDeg:g.angleDeg});
  });

  // Pit entry location/angle: infer from car #16 path using fuzzy timestamp match.
  { const p16all = points[16] || [];
    const g = gateFromTimestampFuzzy(p16all, PIT_ENTRY_TIMESTAMP, START_LINE_ANGLE_DEG, 3.0);
    if (g) { pitEntryWorldPos = g.worldPos; pitEntryAngleDeg = g.angleDeg; }
  }

  // Record a rough polyline for pit entry segment (for the static base layer).
  const pitSeg16=[]; const p16=points[16]||[];
  for(let i=0;i<p16.length;i++){ const d=p16[i].date; if(d>INTRO_END_TIMESTAMP && d<=PIT_END_TIMESTAMP) pitSeg16.push(p16[i].pos); }

  // Build layers and fit viewport to world.
  rebuildViewportAndLayers(introLap1, pitSeg16);

  // Initialize board clock anchor and lay out the top control row.
  boardStartSec = carStartSec;

  layoutButtonsTrack();
}

// Recompute fit-to-screen parameters and rebuild offscreen layers
// for the intro lap path and pit segment overlay.
function rebuildViewportAndLayers(introLap1, pitSeg16){
  const dataW=Math.max(1,maxX-minX), dataH=Math.max(1,maxY-minY);
  const scaleX=(TRACK_VP.w-PADDING*2)/dataW, scaleY=(TRACK_VP.h-PADDING*2)/dataH;
  s=Math.min(scaleX,scaleY); centerX=(minX+maxX)/2; centerY=(minY+maxY)/2;

  baseLayer=createGraphics(TRACK_VP.w,TRACK_VP.h);
  trackLayer=createGraphics(TRACK_VP.w,TRACK_VP.h);
  baseLayer.clear(); trackLayer.clear();

  // Base layer: pit segment line (thin stroke) in world coordinates.
  baseLayer.push();
  baseLayer.translate(TRACK_VP.w/2,TRACK_VP.h/2); baseLayer.scale(s,-s); baseLayer.translate(-centerX,-centerY);
  baseLayer.stroke(180,180,180,200); baseLayer.strokeWeight(2/s); baseLayer.noFill();
  if (pitSeg16 && pitSeg16.length){
    baseLayer.beginShape(); for(let i=0;i<pitSeg16.length;i++) baseLayer.vertex(pitSeg16[i].x,pitSeg16[i].y); baseLayer.endShape();
  }
  baseLayer.pop();

  // Track layer: intro lap (thicker stroke) to show layout at start.
  trackLayer.push();
  trackLayer.translate(TRACK_VP.w/2,TRACK_VP.h/2); trackLayer.scale(s,-s); trackLayer.translate(-centerX,-centerY);
  trackLayer.stroke(180,180,180,200); trackLayer.strokeWeight(4/s); trackLayer.noFill();
  if (introLap1 && introLap1.length){
    trackLayer.beginShape(); for(let i=0;i<introLap1.length;i++) trackLayer.vertex(introLap1[i].x,introLap1[i].y); trackLayer.endShape();
  }
  trackLayer.pop();
}
// #endregion

// #region segmented pill renderer
// Draw a two segment pill control at (x,y) with width segW per segment and height h.
// - labelL/labelR: strings rendered centered in each half.
// - activeIdx: which segment is logically active (0 left, 1 right) to tint text.
// - animVal: 0..1 controlling the thumb's horizontal position for smooth toggle.
function drawTwoSegPill(x, y, segW, h, labelL, labelR, activeIdx, animVal){
  push();
  noStroke(); fill(22); rect(x, y, segW*2, h, PILL_R);   // base
  stroke(40); line(x+segW, y+2, x+segW, y+h-2);          // divider
  const thumbX = x + animVal * segW;                     // thumb
  noStroke(); fill(28); rect(thumbX, y, segW, h, PILL_R);
  textAlign(CENTER, CENTER); textSize(BTN_LABEL_SIZE);    // labels
  fill(activeIdx===0?255:200); text(labelL, x + segW/2, y + h/2 + 1);
  fill(activeIdx===1?255:200); text(labelR, x + segW + segW/2, y + h/2 + 1);
  pop();
}
// #endregion

// #region draw
function draw(){
  // Background layer: show tinted background image if enabled; otherwise a solid fill.
  if (bgVisible && bgImg){
    push(); imageMode(CORNER); tint(255, 180); drawImageCover(bgImg, 0, 0, width, height); noTint(); pop();
  } else { background(12); }

  // ----- Time + playback -----
  // dt in seconds (falls back to ~16.67ms/frame).
  const dt=(deltaTime||16.67)/1000; lastDt=dt;
  // Clamp playback speed to safety bounds.
  playbackSpeed = constrain(playbackSpeed, 1, 20);
  // Advance race clock only while playing.
  if(isPlaying) raceTime += dt*playbackSpeed;

  // Absolute clocks for board and cars (may differ via TIME_OFFSET_SECONDS).
  const boardAbsSec = boardStartSec + raceTime; lastBoardAbsSec = boardAbsSec;
  const carAbsSec   = (carStartSec + raceTime) + TIME_OFFSET_SECONDS;
  const afterGreen  = (carAbsSec >= RACE_START_ABS_SEC);
  const raceStarted = (boardAbsSec >= RACE_START_ABS_SEC);

  // ----- DNF activation -----
  // Flip on DNF overlays once the per-driver DNF absolute time is passed.
  for (const dn in dnfTimesAbsSec){ if (boardAbsSec >= dnfTimesAbsSec[dn]) dnfOverlayActive[dn] = true; }

  // ----- Baseline minisectors at "green" -----
  // On the first frame after race start, capture baseline counts and reset
  // per-gate/per-driver accumulators so gaps start cleanly from zero.
  if(raceStarted && !baselinedAtGreen){
    for(let r=0;r<driverInfo.getRowCount();r++){
      const dn=driverInfo.getString(r,'driver_number');
      baselineMiniAtGreen[dn]=miniCounts[dn]||0;
    }
    for(let r=0;r<driverInfo.getRowCount();r++){
      const dn=driverInfo.getString(r,'driver_number');
      miniLapTimesByGate[dn] = {}; lastMiniCrossSecByGate[dn] = {};
      miniSeqTimes[dn] = []; lastStableGaps[dn] = { type:'na' }; lastStableGapsAhead[dn] = { type:'na' };
      pitOverlayActive[dn] = false; lastPitEntryCrossSec[dn] = -Infinity;
    }
    baselinedAtGreen=true;
    recomputeGapsSFandMinisectors();
  }

  // ----- Static track layers (only when in TRACK view) -----
  push(); translate(TRACK_VP.x,TRACK_VP.y);
  if (viewMode === 'TRACK') { image(baseLayer,0,0); image(trackLayer,0,0); }
  pop();

  // ----- Precompute gate bases in screen space -----
  // Each gate base gives tangent (tx,ty) and normal (nx,ny) for crossing tests.
  const miniBases = miniGates.map(g=>{
    const p=mapToScreen(g.worldPos); const px=TRACK_VP.x+p.x, py=TRACK_VP.y+p.y;
    const th=radians(g.angleDeg), tx=Math.cos(th), ty=Math.sin(th);
    const nx=-Math.sin(th), ny=Math.cos(th);
    return {px,py,tx,ty,nx,ny};
  });

  // Start/finish base line in screen space.
  let sfBase=null; if(startFinishWorldPos){
    const p=mapToScreen(startFinishWorldPos); const px=TRACK_VP.x+p.x, py=TRACK_VP.y+p.y;
    const th=radians(START_LINE_ANGLE_DEG), tx=Math.cos(th), ty=Math.sin(th);
    const nx=-Math.sin(th), ny=Math.cos(th);
    sfBase={px,py,tx,ty,nx,ny};
  }
  // Pit-entry base line in screen space (if detected).
  let pitBase=null; if(pitEntryWorldPos){
    const p=mapToScreen(pitEntryWorldPos); const px=TRACK_VP.x+p.x, py=TRACK_VP.y+p.y;
    const th=radians(pitEntryAngleDeg), tx=Math.cos(th), ty=Math.sin(th);
    const nx=-Math.sin(th), ny=Math.cos(th);
    pitBase={px,py,tx,ty,nx,ny};
  }

  // ----- Cars + detection -----
  let hoverHit=null, minDist=Infinity, selectedViz=null;
  lastFrameScreenPos = {};
  const HOVER_RADIUS = Math.max(HOVER_RADIUS_BASE, CAR_DIAM + 6);

  DRIVER_NUMS.forEach(n=>{
    const arr=points[n], times=timesByDriver[n]; if(!arr||arr.length===0) return;

    // Find active segment index k for carAbsSec (binary-search helper used).
    let k=0;
    if(times && times.length>0){
      if(carAbsSec<=times[0]) k=0; else if(carAbsSec>=times[times.length-1]) k=times.length-1; else k=indexLE(times,carAbsSec);
    }

    // Interpolate world position between samples (or clamp to last).
    let posWorld;
    if(k < arr.length-1){
      const t0=arr[k].tSec, t1=arr[k+1].tSec, p0=arr[k].pos, p1=arr[k+1].pos;
      const span=Math.max(1e-6,t1-t0), f=constrain((carAbsSec-t0)/span,0,1);
      posWorld={ x:p0.x+(p1.x-p0.x)*f, y:p0.y+(p1.y-p0.y)*f };
    } else { posWorld={ x:arr[k].pos.x, y:arr[k].pos.y }; }

    // Screen position for raw and smoothed world positions.
    const spRaw=mapToScreen(posWorld); const currX=TRACK_VP.x+spRaw.x, currY=TRACK_VP.y+spRaw.y;

    // Optional exponential smoothing to reduce jitter at high playback speeds.
    let posDraw=posWorld;
    if(ENABLE_SMOOTH){
      const prevSm = smoothWorldPos[n];
      const tau = 0.12; // time constant (sec) — larger => more smoothing.
      let alpha = 1 - Math.exp(- (dt * playbackSpeed) / tau);
      alpha = constrain(alpha, 0.18, 0.9);
      if(prevSm){
        posDraw = { x: prevSm.x + (posWorld.x - prevSm.x) * alpha, y: prevSm.y + (posWorld.y - prevSm.y) * alpha };
      }
      smoothWorldPos[n]=posDraw;
    }
    const sp=mapToScreen(posDraw); const cx=TRACK_VP.x+sp.x, cy=TRACK_VP.y+sp.y;
    lastFrameScreenPos[String(n)]={x:cx,y:cy};

    const key=String(n), col=driverColors[key]||color(200);

    // Draw car dot in TRACK view. Also record selection ring target if selected.
    if (viewMode === 'TRACK'){
      drawCarDot(cx,cy,CAR_DIAM,col,255);
      if(selectedDriver!==null && n===selectedDriver) selectedViz={x:cx,y:cy,diam:CAR_DIAM,color:col};
    }

    // Previous screen position (for crossing tests).
    const prev=prevScreenPos[key];
    const allowDetection = (carAbsSec - carStartSec) >= LAP_COUNT_START_DELAY_SEC;

    if(allowDetection && prev && playbackSpeed>0){
      // ---- Pit-entry crossing detection ----
      // Compute signed distances to the pit line's normal; detect sign change,
      // then check tangential coordinate u against half-length to confirm hit.
      if (pitBase && !frozenDrivers.has(key)) {
        const d0p=(prev.x-pitBase.px)*pitBase.nx + (prev.y-pitBase.py)*pitBase.ny;
        const d1p=(currX -pitBase.px)*pitBase.nx + (currY -pitBase.py)*pitBase.ny;
        const crosses = (d0p<0 && d1p>=0) || (d0p>0 && d1p<=0);
        if(crosses){
          const denom = (d0p - d1p);
          const r = Math.abs(denom) > 1e-6 ? (d0p/denom) : 0.5;
          const ixp=prev.x+(currX-prev.x)*r, iyp=prev.y+(currY-prev.y)*r;
          const up=(ixp-pitBase.px)*pitBase.tx + (iyp-pitBase.py)*pitBase.ty;
          if(Math.abs(up)<=GATE_HALF_LEN){
            const lastPit=(lastPitEntryCrossSec[key]||-Infinity);
            if((carAbsSec-lastPit)>=MIN_CROSSING_INTERVAL_SEC){
              pitOverlayActive[key]=true; lastPitEntryCrossSec[key]=carAbsSec;
            }
          }
        }
      }

      // ---- Minisector + start/finish detection ----
      // Minisectors control “order” (count) and “gaps” (timing). We can allow
      // counting before green for reveal/order, but only compute gap deltas after green.
      const allowMiniForOrder = true;
      const allowMiniForGaps  = afterGreen;

      if (allowMiniForOrder || allowMiniForGaps) {
        for (let gi = 0; gi < miniBases.length; gi++) {
          const gb = miniBases[gi];
          const d0 = (prev.x - gb.px) * gb.nx + (prev.y - gb.py) * gb.ny;
          const d1 = (currX - gb.px) * gb.nx + (currY - gb.py) * gb.ny;
          if (d0 < 0 && d1 >= 0) {
            // Intersection param r along prev→curr; compute local tangential coordinate u.
            const r = d0 / (d0 - d1);
            const ix = prev.x + (currX - prev.x) * r;
            const iy = prev.y + (currY - prev.y) * r;
            const u  = (ix - gb.px) * gb.tx + (iy - gb.py) * gb.ty;
            if (Math.abs(u) <= GATE_HALF_LEN) {
              const lastByGate = (lastMiniCrossSecByGate[key][gi] || -Infinity);
              if ((carAbsSec - lastByGate) >= MIN_CROSSING_INTERVAL_SEC) {
                // Count minisector progress and reveal driver when they first cross.
                if (allowMiniForOrder) {
                  miniCounts[key] = (miniCounts[key] || 0) + 1;
                  lastMiniCrossSec[key] = carAbsSec;
                  if (!revealedDrivers.has(key)) { revealedDrivers.add(key); revealAlpha[key] = 0; }
                  if (pitOverlayActive[key]) pitOverlayActive[key] = false;
                }
                // Gap timing only after green; push times to both per-gate and sequence arrays.
                if (allowMiniForGaps) {
                  if (!miniLapTimesByGate[key][gi]) miniLapTimesByGate[key][gi] = [];
                  miniLapTimesByGate[key][gi].push(carAbsSec);
                  if (!miniSeqTimes[key]) miniSeqTimes[key] = [];
                  miniSeqTimes[key].push(carAbsSec);
                  recomputeGapsSFandMinisectors();
                }
                lastMiniCrossSecByGate[key][gi] = carAbsSec;
              }
            }
          }
        }
      }

      // Start/finish crossing: increment laps, set finish freeze flags at FINAL_LAP.
      if (afterGreen && sfBase) {
        const d0 = (prev.x - sfBase.px) * sfBase.nx + (prev.y - sfBase.py) * sfBase.ny;
        const d1 = (currX - sfBase.px) * sfBase.nx + (currY - sfBase.py) * sfBase.ny;
        if (d0 < 0 && d1 >= 0) {
          const r  = d0 / (d0 - d1);
          const ix = prev.x + (currX - prev.x) * r;
          const iy = prev.y + (currY - prev.y) * r;
          const u  = (ix - sfBase.px) * sfBase.tx + (iy - sfBase.py) * sfBase.ty;
          if (Math.abs(u) <= GATE_HALF_LEN) {
            const lastSF = (lastCrossSec[key] || -Infinity);
            if ((carAbsSec - lastSF) >= MIN_CROSSING_INTERVAL_SEC) {
              lapCounts[key] = (lapCounts[key] || 0) + 1;
              lapTimes[key].push(carAbsSec);
              lastCrossSec[key] = carAbsSec;

              // Finish logic: first car to reach FINAL_LAP triggers finish sequence.
              const lapNum = numericLap(lapCounts[key], PIT_START_DRIVERS.has(key));
              if (raceFinishTriggered && awaitingFlag[key] && !frozenDrivers.has(key)) {
                freezePending[key] = true;
                awaitingFlag[key] = false;
              }
              if (lapNum >= FINAL_LAP && !frozenDrivers.has(key)) {
                freezePending[key] = true;
              }
              if (!raceFinishTriggered && lapNum >= FINAL_LAP) {
                raceFinishTriggered = true;
                finishLeaderDn = key;
                for (const k2 in lapCounts) {
                  if (k2 === key) continue;
                  if (!frozenDrivers.has(k2)) awaitingFlag[k2] = true;
                }
              }
            }
          }
        }
      }
    }

    // Persist last screen position for next-frame crossing tests.
    prevScreenPos[key]={x:currX,y:currY};

    // ----- Hover handling on TRACK view -----
    // Track-side hover detection with radius-based nearest match.
    if(viewMode==='TRACK'){
      if(mouseX>=TRACK_VP.x && mouseX<=TRACK_VP.x+TRACK_VP.w && mouseY>=TRACK_VP.y && mouseY<=TRACK_VP.y+TRACK_VP.h){
        const d=dist(mouseX,mouseY,cx,cy);
        if(d<=HOVER_RADIUS && d<minDist){
          minDist=d; hoverHit={ n, x:cx, y:cy, acronym:driverAcronym[key]||key, color:col, diam:CAR_DIAM };
        }
      }
    }
  });

  hoveredDriver = hoverHit ? hoverHit.n : null;

  // ----- Selected + hover visuals -----
  if(viewMode==='TRACK'){
    // Selected car ring (persistent).
    if(selectedViz){
      push(); noFill(); stroke(selectedViz.color); strokeWeight(SELECTED_RING_WEIGHT);
      ellipse(selectedViz.x,selectedViz.y, selectedViz.diam+HOVER_RING_GAP*2, selectedViz.diam+HOVER_RING_GAP*2); pop();
    }
    // Hover ring + tooltip (syncs global hover state for the leaderboard).
    if(hoverHit){
      // Sync global hover + draw ring exactly like leaderboard
      hoveredDriverGlobal = String(hoverHit.n);
      hoveredOrigin = 'TRACK_HOVER';
      drawHoverRingAndTooltip(hoverHit.x, hoverHit.y, hoverHit.color, hoverHit.acronym);
    } else if (hoveredOrigin === 'TRACK_HOVER') {
      hoveredDriverGlobal = null;
      hoveredOrigin = null;
    }
  }

  // ----- Start/finish marker tick -----
  if(viewMode==='TRACK' && startFinishWorldPos){
    const p=mapToScreen(startFinishWorldPos); const px=TRACK_VP.x+p.x, py=TRACK_VP.y+p.y;
    push(); stroke(255); strokeWeight(START_LINE_STROKE); translate(px,py); rotate(radians(START_LINE_ANGLE_DEG));
    line(-START_LINE_LEN/2,0, START_LINE_LEN/2,0); pop();
  }

  // ----- Leaderboard -----
  drawLeaderboard(boardAbsSec, raceStarted);

  // ----- Chart view -----
  if (viewMode === 'CHART') {
    push();
    translate(TRACK_VP.x, TRACK_VP.y);
    drawLiquidGlassPanel(0, 0, TRACK_VP.w, TRACK_VP.h);
    drawPositionsChart();
    pop();
  }

  // ----- Controls group (layout + draw) -----
  layoutButtonsTrack();
  drawLiquidGlassPanel(UI_BTN.group.x, UI_BTN.group.y, UI_BTN.group.w, UI_BTN.group.h);

  // BG pill (animate towards target state).
  const bgTarget = bgVisible ? 1 : 0;
  bgAnim = lerp(bgAnim, bgTarget, 0.25);
  drawTwoSegPill(UI_BTN.bgL.x, UI_BTN.bgL.y, UNIFIED_PILL_SEG_W, BTN_H, UI_BTN.bgL.label(), UI_BTN.bgR.label(), bgTarget, bgAnim);

  // View pill (TRACK ↔ CHART).
  const viewTarget = (viewMode === 'TRACK') ? 0 : 1;
  viewAnim = lerp(viewAnim, viewTarget, 0.25);
  drawTwoSegPill(UI_BTN.viewL.x, UI_BTN.viewL.y, UNIFIED_PILL_SEG_W, BTN_H, UI_BTN.viewL.label(), UI_BTN.viewR.label(), viewTarget, viewAnim);

  // Play/Pause pill.
  const playTarget = isPlaying ? 0 : 1;
  playAnim = lerp(playAnim, playTarget, 0.25);
  drawTwoSegPill(UI_BTN.playL.x, UI_BTN.playL.y, UNIFIED_PILL_SEG_W, BTN_H, UI_BTN.playL.label(), UI_BTN.playR.label(), playTarget, playAnim);

  // Speed buttons (rectangular, with hover + active tint).
  function drawRectBtn(btn, active=false){
    const hovered = pointInRect(mouseX, mouseY, btn);
    drawLiquidGlassPanel(btn.x, btn.y, btn.w, btn.h);
    if (active || hovered) { push(); fill(255, active ? 35 : 20); noStroke(); rect(btn.x, btn.y, btn.w, btn.h, 12); pop(); }
    push(); fill(active ? 255 : 230); textAlign(CENTER, CENTER); textSize(BTN_LABEL_SIZE);
    text(btn.label(), btn.x + btn.w/2, btn.y + btn.h/2 + 1); pop();
  }
  drawRectBtn(UI_BTN.s1,  SPEED_PRESETS[speedIndex]===1);
  drawRectBtn(UI_BTN.s2,  SPEED_PRESETS[speedIndex]===2);
  drawRectBtn(UI_BTN.s5,  SPEED_PRESETS[speedIndex]===5);
  drawRectBtn(UI_BTN.s10, SPEED_PRESETS[speedIndex]===10);
  drawRectBtn(UI_BTN.s20, SPEED_PRESETS[speedIndex]===20);

  // ----- Crossfade overlay during view switch -----
  // Darkens then lightens over TRACK_VP while switching modes for a smoother feel.
  if (viewSwitch.active) {
    viewSwitch.t += lastDt;
    const half = viewSwitch.dur * 0.5;
    if (!viewSwitch.switched && viewSwitch.t >= half) { viewMode = viewSwitch.to; viewSwitch.switched = true; }
    if (viewSwitch.t >= viewSwitch.dur) { viewSwitch.active = false; }
    const p = constrain(viewSwitch.t / viewSwitch.dur, 0, 1);
    const ovAlpha = (p <= 0.5) ? map(p, 0, 0.5, 0, 220, true) : map(p, 0.5, 1, 220, 0, true);
    push(); noStroke(); fill(0, ovAlpha); rect(TRACK_VP.x, TRACK_VP.y, TRACK_VP.w, TRACK_VP.h); pop();
  }

  // Cursor feedback: pointer when hovering a car, otherwise default arrow.
  cursor(viewMode==='TRACK' && hoverHit? HAND : ARROW);
}
// #endregion

// #region drawLeaderboard (fixed row size + header + lap pop)
function drawLeaderboard(boardAbsSec, raceStarted){
  // Glass backdrop for the whole leaderboard panel.
  drawLiquidGlassPanel(BOARD_VP.x, BOARD_VP.y, BOARD_VP.w, BOARD_VP.h);

  // Title + F1 logo
  const titleX0 = BOARD_VP.x + 16;
  const titleY0 = BOARD_VP.y + 8;
  let logoW = 0, logoH = 0;
  if (f1LogoImg) {
    // Keep logo aspect ratio when scaling to a fixed height.
    logoH = F1_LOGO_H;
    logoW = f1LogoImg.width && f1LogoImg.height ? (f1LogoImg.width * (logoH / f1LogoImg.height)) : 0;
    push(); imageMode(CORNER); tint(255); image(f1LogoImg, titleX0, titleY0, logoW, logoH); noTint(); pop();
  }
  const titleGapX = logoW > 0 ? 8 : 0;

  // Title text
  push();
  if (titleFont) textFont(titleFont);
  fill(235); textSize(TITLE_FONT_SIZE); textAlign(LEFT, TOP);
  // Vertically center the text relative to the logo block.
  const titleTextY = titleY0 + (F1_LOGO_H - TITLE_FONT_SIZE) / 2;
  text(TITLE_TEXT, titleX0 + logoW + titleGapX, titleTextY);
  pop();

  // info line (Lap part pops)
  const baseX = BOARD_VP.x + 16;
  const titleTop = BOARD_VP.y + 8;
  const headerRowH = Math.max(F1_LOGO_H, 24);
  const infoY = titleTop + headerRowH + 8;

  // Prefix shows wall-clock (sim) time and current speed multiplier.
  textSize(18); fill(200); textAlign(LEFT,TOP);
  const prefix = `Time: ${secondsToTime(boardAbsSec)}   |   Speed: ${SPEED_PRESETS[speedIndex]}x   |   `;
  const lapNow = lapHeaderNumeric();
  const lapText = raceStarted ? `Lap: ${lapNow} / ${FINAL_LAP}` : 'Formation Lap';

  // Trigger the "pop" animation whenever the header lap number increases.
  if (raceStarted && lapNow > lastLapDisplayed){
    lastLapDisplayed = lapNow; lapPop.active = true; lapPop.t = 0;
  }
  text(prefix, baseX, infoY);
  const prefixW = textWidth(prefix);

  // Pop scale (ease out) for the lap text.
  let scaleK = 1;
  if (lapPop.active){
    lapPop.t += lastDt;
    const p = constrain(lapPop.t / lapPop.dur, 0, 1);
    scaleK = 1 + 0.25 * (1 - p) * (1 - p);
    if (p >= 1) { lapPop.active = false; }
  }
  push();
  translate(baseX + prefixW, infoY);
  scale(scaleK);
  fill(235);
  text(lapText, 0, 0);
  pop();

  // Controls row (big pills)
  const controlRowTop   = infoY + CONTROL_ROW_TOP_OFFSET;
  const controlCenterY  = controlRowTop + CONTROL_ROW_HEIGHT * 0.5;
  const pillTop         = controlCenterY - BTN_H * 0.5;

  // Gaps
  // "Leader" vs "Ahead" pill for choosing gap mode. Positions UI_BTN hitboxes.
  let ctrlX = baseX;
  textSize(CONTROL_TEXT_SIZE); fill(200); textAlign(LEFT, CENTER);
  const gapsLabel = 'Gaps:'; text(gapsLabel, ctrlX, controlCenterY);
  const gapsPillX = ctrlX + textWidth(gapsLabel) + 6;
  UI_BTN.gapL = { x: gapsPillX, y: pillTop, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  UI_BTN.gapA = { x: gapsPillX + UNIFIED_PILL_SEG_W, y: pillTop, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  const gapTarget = (gapMode==='LEADER') ? 0 : 1; gapAnim = lerp(gapAnim, gapTarget, 0.25);
  drawTwoSegPill(gapsPillX, pillTop, UNIFIED_PILL_SEG_W, BTN_H, 'Leader', 'Ahead', gapTarget, gapAnim);

  // Tyre
  // "Hide/Show" tyre pill, with hitboxes set for mouse handlers.
  ctrlX = gapsPillX + UNIFIED_PILL_SEG_W*2 + 12 + 16;
  const tyreLabel = 'Tyre:'; textSize(CONTROL_TEXT_SIZE); fill(200); textAlign(LEFT, CENTER);
  text(tyreLabel, ctrlX, controlCenterY);
  const tyrePillX = ctrlX + textWidth(tyreLabel) + 6;
  UI_BTN.tyreHide = { x: tyrePillX, y: pillTop, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  UI_BTN.tyreShow = { x: tyrePillX + UNIFIED_PILL_SEG_W, y: pillTop, w: UNIFIED_PILL_SEG_W, h: BTN_H };
  const tyreTarget = showTyre ? 1 : 0; tyreAnim = lerp(tyreAnim, tyreTarget, 0.25);
  drawTwoSegPill(tyrePillX, pillTop, UNIFIED_PILL_SEG_W, BTN_H, 'Hide', 'Show', tyreTarget, tyreAnim);

  // ---------- Fixed sizing compute ----------
  // Compute fixed row height and fonts once after layout changes.
  const columnsTopStart = controlRowTop + CONTROL_ROW_HEIGHT + 12;
  const baseYStart = columnsTopStart + 24;
  const bottomPad = 12;
  if (rowSizingDirty) {
    const availableRowsH = Math.max(60, BOARD_VP.h - baseYStart - bottomPad);
    FIXED_ROW_H = constrain(Math.floor(availableRowsH / BOARD_MAX_ROWS), 22, 64);
    FIXED_ROW_FONT = Math.max(12, Math.floor(FIXED_ROW_H * 0.5));
    FIXED_HEADER_FONT = Math.max(12, Math.floor(FIXED_ROW_H * 0.48));
    BOARD_ROW_H_CURR = FIXED_ROW_H;
    rowSizingDirty = false;
  }

  // ---------- Table headers + rows ----------
  // Build a live "rows" array from revealed drivers, with minisector progress and recency.
  const rows=[]; const rowByDn={};
  for(let r=0;r<driverInfo.getRowCount();r++){
    const dn=driverInfo.getString(r,'driver_number');
    if(!revealedDrivers.has(dn)) continue;

    const acr=driverInfo.getString(r,'name_acronym')||'';
    let col=driverInfo.getString(r,'team_colour')||'';
    const team=driverInfo.getString(r,'team_name')||'';
    if(col && !col.startsWith('#')) col='#'+col;

    // rawMini is minisectors since baseline; timeSince is recency for tie-breaks.
    const base = baselinedAtGreen ? (baselineMiniAtGreen[dn]||0) : 0;
    const raw  = Math.max(0,(miniCounts[dn]||0)-base);
    const last=lastMiniCrossSec[dn];
    const timeSince = (isFinite(last)? (lastBoardAbsSec-last) : -1e99);

    const row = { driver_number:dn, name_acronym:acr, team_colour:col||'#FFFFFF', team_name:team, rawMini:raw, timeSinceLastMini:timeSince };
    rows.push(row); rowByDn[dn]=row;
  }
  // Nothing to draw yet: exit early.
  if (rows.length === 0) { return; }
  // Sort by minisector progress (desc), then by most recent crossing (desc).
  rows.sort((a,b)=>{ if(b.rawMini!==a.rawMini) return b.rawMini-a.rawMini; return (b.timeSinceLastMini - a.timeSinceLastMini); });
  rows.forEach((d,i)=> d.position=i+1);

  // Freeze commits
  // Mark rows that should freeze (finish reached or DNF rules), then commit freezes.
  for (let i=0;i<rows.length;i++){
    const d = rows[i]; const dn = d.driver_number; const lapNum = numericLap((lapCounts[dn]||0), PIT_START_DRIVERS.has(dn));
    if (lapNum >= FINAL_LAP && !frozenDrivers.has(dn)) freezePending[dn] = true;
    // Special-case: car '4' DNF and currently last → freeze immediately.
    if (dn==='4' && dnfOverlayActive['4'] && d.position===20 && !frozenDrivers.has('4')) freezePending['4'] = true;
  }
  for (const dn in freezePending) {
    if (freezePending[dn] && !frozenDrivers.has(dn)) {
      frozenDrivers.add(dn); const r = rowByDn[dn]; if (r) freezePos[dn] = r.position; pitOverlayActive[dn] = false;
    }
  }

  // Build the final visible order by injecting frozen rows into their frozen slots,
  // then fill remaining holes with active (non-frozen) rows in current order.
  const total = rows.length; const finalRows = new Array(total).fill(null);
  Array.from(frozenDrivers).forEach(dn=>{
    const r = rowByDn[dn]; if(!r) return;
    let pos = freezePos[dn] || r.position; pos = constrain(pos,1,total);
    let idx = pos-1; while(idx<total && finalRows[idx]!==null) idx++;
    if(idx>=total){ idx=pos-2; while(idx>=0 && finalRows[idx]!==null) idx--; }
    if(idx>=0 && idx<total) finalRows[idx]=r;
  });
  const active = rows.filter(r=>!frozenDrivers.has(r.driver_number));
  let fillIdx=0; for(let i=0;i<total;i++){ if(finalRows[i]===null){ finalRows[i]=active[fillIdx++]; } }

  // Only display up to BOARD_MAX_ROWS rows.
  const visCount = Math.min(BOARD_MAX_ROWS, finalRows.length);
  const visible = finalRows.slice(0, visCount);

  // Column measures (fixed fonts)
  textSize(FIXED_ROW_FONT);
  const SP = 8;
  const PAD_L = 12, PAD_R = 10;
  const DELTA_W = Math.max(textWidth('Δ'), BADGE_W) + 8;

  // Compute minimum widths from headers and sample values for current visible set.
  let posW = textWidth('Pos'); for (let i=0;i<visCount;i++) posW = Math.max(posW, textWidth(String(i+1))); posW += 8;
  const teamW = Math.max(textWidth('Team'), DOT_SIZE) + 8;

  let driverW = textWidth('Driver');
  for (let i=0;i<visCount;i++) driverW = Math.max(driverW, textWidth(visible[i].name_acronym||'')); driverW += 12;

  // Gap string provider (respects gap mode, pit, and DNF).
  const gapStrOf = (dn) => {
    const infoMap = (gapMode==='LEADER')?gapsToLeader:gapsToAhead;
    const g = infoMap[dn];
    if (dnfOverlayActive[dn]) return 'DNF';
    if (pitOverlayActive[dn]) return 'PIT';
    if (g){ if (g.type==='leader') return 'Leader'; if (g.type==='time') return formatGap(g.gapSec); }
    return '';
  };
  let gapW = textWidth('Gap');
  for (let i=0;i<visCount;i++) gapW = Math.max(gapW, textWidth(gapStrOf(visible[i].driver_number))); gapW += 10;
  const GAP_MIN = 60;

  // Optional tyre column: width from icon + age text.
  let tyreW = 0, ageMaxW = 0;
  if (showTyre){
    ageMaxW = textWidth('0');
    for (let i=0;i<visCount;i++){
      const dn = visible[i].driver_number;
      const lapNum = numericLap((lapCounts[dn]||0), PIT_START_DRIVERS.has(dn));
      const age = currentTyreAgeForDriver(dn, lapNum);
      const s = (age==null)? '' : String(int(age));
      ageMaxW = Math.max(ageMaxW, textWidth(s));
    }
    tyreW = Math.max(textWidth('Tyre'), TYRE_ICON + 6 + ageMaxW) + 6;
  }

  const flagW = 22;

  // Total width budget and responsive shrinking for overflows (Driver → Gap → Tyre).
  const totalCols = showTyre ? 7 : 6;
  let totalW = DELTA_W + posW + teamW + driverW + gapW + (showTyre?tyreW:0) + flagW + SP*(totalCols-1);
  const avail = BOARD_VP.w - PAD_L - PAD_R;

  const DRIVER_MIN = 40;
  if (totalW > avail){
    const need = totalW - avail;
    const shrinkDriver = Math.min(need, Math.max(0, driverW - DRIVER_MIN));
    driverW -= shrinkDriver; totalW -= shrinkDriver;
  }
  if (totalW > avail){
    const need = totalW - avail;
    const shrinkGap = Math.min(need, Math.max(0, gapW - GAP_MIN));
    gapW -= shrinkGap; totalW -= shrinkGap;
  }
  if (totalW > avail && showTyre){
    const need = totalW - avail;
    const tyreMin = TYRE_ICON + 4;
    const shrinkTyre = Math.min(need, Math.max(0, tyreW - tyreMin));
    tyreW -= shrinkTyre; totalW -= shrinkTyre;
  }

  // anchors
  // Compute left anchors for each column using running sums.
  const tableLeft = BOARD_VP.x + PAD_L;
  const deltaX   = tableLeft;
  const posX     = deltaX + DELTA_W + SP;
  const teamX    = posX   + posW    + SP;
  const driverX  = teamX  + teamW   + SP;
  const gapX     = driverX+ driverW + SP;
  const tyreX    = gapX   + gapW    + SP;

  // Header (fixed header font)
  const columnsY = columnsTopStart;
  fill(200); textSize(FIXED_HEADER_FONT); textAlign(LEFT, TOP);
  text('Δ',      deltaX, columnsY );
  text('Pos',    posX,   columnsY );
  text('Team',   teamX,  columnsY );
  text('Driver', driverX,columnsY );
  text('Gap',    gapX,   columnsY );
  if (showTyre) text('Tyre',  tyreX, columnsY );

  // rows
  const rowH  = FIXED_ROW_H;
  const halfH = Math.floor(rowH / 2);
  textSize(FIXED_ROW_FONT);
  const asc = textAscent(), des = textDescent();
  const baselineFromCenter = Math.round((asc - des) / 2);
  const baseY = baseYStart;

  // Track board hover region once for all rows, store hovered driver key if any.
  const inBoard = mouseX>=BOARD_VP.x && mouseX<=BOARD_VP.x+BOARD_VP.w && mouseY>=BOARD_VP.y && mouseY<=BOARD_VP.y+BOARD_VP.h;
  let boardHoverKey = null;

  for(let i=0;i<visCount; i++){
    const d=visible[i]; const driverKey=String(d.driver_number);

    // Per-driver reveal fade on first appearance.
    let a=revealAlpha[driverKey]; if(a===undefined) a=255;
    if(a<255){ a=Math.min(255, a+255*(lastDt/REVEAL_FADE_DURATION_SEC)); revealAlpha[driverKey]=a; }

    const rowTop   = baseY + i*rowH;
    const targetCenterY = rowTop + halfH;

    // Smooth row y for animated reordering.
    if(!(driverKey in driverY)) driverY[driverKey]=targetCenterY;
    driverY[driverKey]=lerp(driverY[driverKey], targetCenterY, 0.25);

    const rowCenter = Math.round(driverY[driverKey]);
    const baselineY = rowCenter + baselineFromCenter;

    const rowLeft  = BOARD_VP.x+8;
    const rowRight = BOARD_VP.x+BOARD_VP.w-8;
    const rowTopPx = rowCenter - halfH;
    const rowBotPx = rowCenter + halfH;

    // Hover detection for this row.
    const mouseOverRow = inBoard && mouseX>=rowLeft && mouseX<=rowRight && mouseY>=rowTopPx && mouseY<=rowBotPx;
    if (mouseOverRow) boardHoverKey = driverKey;

    // Row highlight for hover/selection (with reveal-alpha applied).
    const isSelected=(selectedDriver!==null && String(selectedDriver)===driverKey);
    const isHovered = mouseOverRow || (hoveredDriver!==null && String(hoveredDriver)===driverKey);
    if(isHovered || isSelected){
      const baseAlpha=isSelected?20:12; const aRow=baseAlpha * ( (revealAlpha[driverKey]!==undefined?revealAlpha[driverKey]:255) /255 );
      push(); rectMode(CORNERS); noStroke(); fill(255,255,255,aRow); rect(rowLeft,rowTopPx,rowRight,rowBotPx,6); pop();
    }

    // Δ badge
    // Small up/down indicator with a fade, created when position changes.
    if(positionChanges[driverKey]){
      const info=positionChanges[driverKey];
      const badgeAlpha=(info.alpha*(a/255));
      const symbol = info.delta>0?'▲':(info.delta<0?'▼':'');
      const boxFill = info.delta>0? color(0,255,0,badgeAlpha*0.28) : color(255,0,0,badgeAlpha*0.28);
      const textFill= info.delta>0? color(0,255,0,badgeAlpha)     : color(255,80,80,badgeAlpha);
      push(); rectMode(CENTER); noStroke(); fill(boxFill);
      const cx=deltaX + BADGE_W/2 + 4; rect(cx,rowCenter,BADGE_W,BADGE_H,4);
      fill(textFill); textAlign(CENTER,CENTER); textSize(Math.max(11, FIXED_ROW_FONT-2)); text(symbol,cx,rowCenter); pop();
      info.alpha-=2.5; info.framesLeft--; if(info.framesLeft<=0 || info.alpha<=0) delete positionChanges[driverKey];
    }

    // Pos
    push(); fill(220,a); textAlign(LEFT,BASELINE); text(String(i+1), posX, baselineY); pop();

    // Team dot + logo
    const dotCx = teamX + DOT_SIZE/2;
    push(); noStroke(); const c=color(d.team_colour || '#FFFFFF'); c.setAlpha(a); fill(c);
    ellipse(dotCx,rowCenter, DOT_SIZE, DOT_SIZE); pop();
    const logoImg=teamLogos[d.team_name];
    if(logoImg){ push(); imageMode(CENTER); tint(255,a); image(logoImg, dotCx, rowCenter, LOGO_SIZE, LOGO_SIZE); noTint(); pop(); }

    // Driver acronym
    const nameText = `${d.name_acronym}`;
    push(); textAlign(LEFT, BASELINE);
    let nameCol = color(d.team_colour || '#FFFFFF');
    nameCol.setAlpha(isSelected ? a : (isHovered ? Math.min(255, a + 40) : a));
    fill(nameCol); drawTruncatedText(nameText, driverX, baselineY, driverW); pop();

    // Gap (right-aligned)
    const gapStr = gapStrOf(driverKey);
    push(); textAlign(RIGHT, BASELINE); fill(255, a);
    text(gapStr, gapX + gapW, baselineY);
    pop();

    // Tyre
    // If enabled, show compound icon (or fallback letter) and numeric age.
    if (showTyre) {
      const lapNum = numericLap((lapCounts[driverKey]||0), PIT_START_DRIVERS.has(driverKey));
      const comp = currentCompoundForDriver(driverKey, lapNum);
      const age = currentTyreAgeForDriver(driverKey, lapNum);
      const iconCx = tyreX + TYRE_ICON/2;
      if (comp){
        const img = tyreImgs[comp] || null;
        if(img){ push(); imageMode(CENTER); image(img, iconCx, rowCenter, TYRE_ICON, TYRE_ICON); pop(); }
        else {
          const letter = comp[0] || '?';
          push(); rectMode(CENTER); noStroke(); fill(255,255,255,20);
          rect(iconCx, rowCenter, TYRE_ICON, TYRE_ICON, 3);
          fill(255, a); textAlign(CENTER, CENTER); textSize(Math.max(11, FIXED_ROW_FONT-2));
          text(letter, iconCx, rowCenter+1); pop();
        }
        if(age != null){
          push(); textAlign(LEFT, CENTER); textSize(Math.max(11, FIXED_ROW_FONT-2)); fill(200, a);
          const ageX = tyreX + TYRE_ICON + 6;
          drawTruncatedText(String(int(age)), ageX, rowCenter+1, Math.max(0, tyreW - (TYRE_ICON + 6)));
          pop();
        }
      }
    }

    // position-change tracking
    // Update positionChanges to animate ▲/▼ when a driver's row index changes.
    const newPos=i+1;
    if(lastPositions[driverKey]!==undefined){
      const delta = lastPositions[driverKey] - newPos;
      if(delta!==0) positionChanges[driverKey]={delta,alpha:255,framesLeft:90};
    }
    lastPositions[driverKey]=newPos;
  }

  // Hover link to track + draw on-track ring using the SAME helper
  // Sync board hover with track hover ring (and tooltip) if TRACK view is active.
  if (inBoard) {
    if (boardHoverKey) { hoveredDriverGlobal = boardHoverKey; hoveredOrigin = 'BOARD'; }
    else if (hoveredOrigin === 'BOARD') { hoveredDriverGlobal = null; hoveredOrigin = null; }

    if (boardHoverKey && viewMode === 'TRACK') {
      const sp = lastFrameScreenPos[boardHoverKey];
      if (sp) {
        const col = driverColors[boardHoverKey] || color(255);
        const acr = driverAcronym[boardHoverKey]||boardHoverKey;
        drawHoverRingAndTooltip(sp.x, sp.y, col, acr); // 🔸 same function as track-hover
      }
    }
  } else if (hoveredOrigin === 'BOARD') { hoveredDriverGlobal = null; hoveredOrigin = null; }

  // Snapshot positions once per leader lap for chart
  // Capture the full order whenever the leader completes a new lap; used by CHART.
  let leaderDn = null;
  for (let i = 0; i < rows.length; i++){ const dn = rows[i].driver_number; if (dn){ leaderDn = dn; break; } }
  if (leaderDn){
    const leaderLap = numericLap((lapCounts[leaderDn]||0), PIT_START_DRIVERS.has(leaderDn));
    if (baselinedAtGreen && leaderLap > 0 && leaderLap !== lastRecordedLap){
      const snap = {}; for (let i = 0; i < rows.length; i++){ const dn = rows[i].driver_number; snap[dn] = i + 1; }
      positionsByLap[leaderLap] = snap; lastRecordedLap = leaderLap;
    }
  }
}
// #endregion

// #region drawPositionsChart
function drawPositionsChart(){
  chartHover = null;

  // Plot margins and derived plot area (px0..px1, py0..py1)
  const M = { left: 50, right: 120, top: 110, bottom: 40 };
  const px0 = 0 + M.left, px1 = TRACK_VP.w - M.right;
  const py0 = 0 + M.top,  py1 = TRACK_VP.h - M.bottom;

  // Laps domain + x-mapping (1..maxLap → px0..px1)
  const laps = Object.keys(positionsByLap).map(n=>int(n)).sort((a,b)=>a-b);
  const maxLapRecorded = laps.length ? laps[laps.length-1] : 0;
  const maxLap = Math.max(1, maxLapRecorded);
  const xForLap = (lap) => map(lap, 1, Math.max(1,maxLap), px0, px1);

  // Y-axis domain uses current driver count (revealed so far) to keep spacing stable
  const driverCount = Math.max(1, (revealedDrivers.size || DRIVER_NUMS.length));
  const yForPos = (pos) => map(pos, 1, driverCount, py0, py1);

  // ----- Axes and tick labels -----
  push();
  stroke(180); strokeWeight(1);
  // X-axis (bottom) and Y-axis (left)
  line(px0, py1, px1, py1);
  line(px0, py0, px0, py1);

  textSize(11); fill(200); noStroke();
  // X ticks: adapt tick step to lap count for legibility
  const step = (maxLap >= 50) ? 10 : (maxLap >= 25 ? 5 : 1);
  for (let l = 1; l <= maxLap; l += step){
    const x = xForLap(l);
    stroke(60); line(x, py1, x, py1+6);
    noStroke(); textAlign(CENTER, TOP); text(l, x, py1+8);
  }
  // Y ticks: positions; coarser step for large grids
  const yStep = (driverCount > 12) ? 2 : 1;
  for (let p = 1; p <= driverCount; p += yStep){
    const y = yForPos(p);
    stroke(40); line(px0-6, y, px0, y);
    noStroke(); textAlign(RIGHT, CENTER); text(p, px0-8, y);
  }
  pop();

  // ----- Grid lines -----
  push(); stroke(30);
  const yStep2 = (driverCount > 12) ? 2 : 1;
  for (let p = 1; p <= driverCount; p += yStep2){ const y = yForPos(p); line(px0, y, px1, y); }
  pop();

  // Consider only drivers that are revealed (present in the board)
  const drivers = DRIVER_NUMS.map(n=>String(n)).filter(dn => revealedDrivers.has(dn));

  // Mouse coordinates in plot space and hover constants
  const mx = mouseX - TRACK_VP.x;
  const my = mouseY - TRACK_VP.y;
  const withinPlot = (mx >= px0 && mx <= px1 && my >= py0 && my <= py1);
  const POINT_R = 14;       // pick radius for point-hover (in px)
  const SNAP_Y_TOL = 16;    // vertical snapping tolerance when no exact point is near

  // Best hover candidate: stores nearest (within POINT_R) (driver,lap,pos)
  let best = { d2: 1e12, dn: null, lap: null, pos: null, x: 0, y: 0 };
  // Snap line (vertical) when inside plot: nearest lap by x
  let snapLap = null, snapX = null;

  // ----- Hover detection -----
  if (withinPlot) {
    // 1) Try finding a literal point within POINT_R
    const lapsSorted = laps;
    for (let li = 0; li < lapsSorted.length; li++){
      const lap = lapsSorted[li];
      const snap = positionsByLap[lap]; if (!snap) continue;
      const x = xForLap(lap);
      for (let di = 0; di < drivers.length; di++){
        const dn = drivers[di];
        const pos = snap[dn]; if (!pos) continue;
        const y = yForPos(pos);
        const dx = mx - x, dy = my - y;
        const d2 = dx*dx + dy*dy;
        if (d2 < best.d2 && d2 <= POINT_R*POINT_R){
          best = { d2, dn, lap, pos, x, y };
        }
      }
    }
    // 2) If no literal point, snap to nearest integer lap at current x,
    //    then pick the nearest driver's y on that lap (within SNAP_Y_TOL)
    const lapF = map(mx, px0, px1, 1, Math.max(1,maxLap));
    const lap = constrain(Math.round(lapF), 1, Math.max(1,maxLap));
    snapLap = lap; snapX = xForLap(lap);
    if (!best.dn) {
      const snap = positionsByLap[lap];
      if (snap) {
        let bestDY = 1e9, bestDn = null, bestPos = null, bestY = null;
        drivers.forEach(dn => {
          const pos = snap[dn];
          if (!pos) return;
          const y = yForPos(pos);
          const dy = Math.abs(my - y);
          if (dy < bestDY) { bestDY = dy; bestDn = dn; bestPos = pos; bestY = y; }
        });
        if (bestDn && bestDY <= SNAP_Y_TOL) {
          best = { d2: bestDY*bestDY, dn: bestDn, lap: lap, pos: bestPos, x: snapX, y: bestY };
        }
      }
    }
  }

  // Update global hover state for cross-panel coordination
  if (withinPlot) {
    if (best.dn) { chartHover = best; hoveredDriverGlobal = chartHover.dn; hoveredOrigin = 'CHART'; }
    else { chartHover = null; if (hoveredOrigin === 'CHART') { hoveredDriverGlobal = null; hoveredOrigin = null; } }
  } else {
    chartHover = null; if (hoveredOrigin === 'CHART') { hoveredDriverGlobal = null; hoveredOrigin = null; }
  }

  // Styling helpers for lines: emphasize hovered/selected driver's line
  const isSel = (dn) => (selectedDriver !== null && String(selectedDriver) === dn);
  const strong = (dn) => (hoveredDriverGlobal && String(hoveredDriverGlobal)===dn) || isSel(dn);
  const lineAlpha = (dn) => strong(dn) ? 255 : 130;
  const lineThick = (dn) => strong(dn) ? 3 : 1.5;

  const lastPointPos = {}; // store last (x,y) per driver to place labels

  // ----- Draw polylines per driver -----
  drivers.forEach(dn=>{
    const col = driverColors[dn] || color(180);
    const pts = [];
    for (let li = 0; li < laps.length; li++){
      const lap = laps[li];
      const snap = positionsByLap[lap];
      if (!snap) continue;
      const pos = snap[dn];
      if (pos){ pts.push({ x: xForLap(lap), y: yForPos(pos) }); }
    }
    if (pts.length < 2) return;

    push(); noFill(); const c = color(col); c.setAlpha(lineAlpha(dn)); stroke(c); strokeWeight(lineThick(dn));
    beginShape(); pts.forEach(p=>vertex(p.x,p.y)); endShape(); pop();

    lastPointPos[dn] = pts[pts.length-1];
  });

  // ----- Driver labels at the right-most point for each driver -----
  drivers.forEach(dn=>{
    const lp = lastPointPos[dn]; if(!lp) return;
    const acr = driverAcronym[dn] || dn;
    const col = driverColors[dn] || color(220);
    const a = strong(dn) ? 255 : 180;
    push(); const c = color(col); c.setAlpha(a); fill(c); noStroke(); textSize(12); textAlign(LEFT, CENTER); text(acr, lp.x + 6, lp.y); pop();
  });

  // Title
  push(); fill(220); textSize(16); textAlign(LEFT,TOP);
  text('Position Changes by Lap', px0, py0 - 28); pop();

  // ----- Hover overlay (cursor line + point + tooltip) -----
  if (chartHover){
    const { x, y, dn, lap, pos } = chartHover;
    push(); stroke(80); strokeWeight(1); line(x, py0, x, py1); pop();
    push(); noStroke(); fill(255); ellipse(x, y, 6, 6); pop();
    const acr = driverAcronym[dn] || dn;
    const label = `${acr}: P${pos} at Lap ${lap}`;
    textSize(12); const pad = 6; const tw = textWidth(label), th = 16;
    let bx = x + 10, by = y - th - 10;
    if (bx + tw + pad*2 > px1) bx = px1 - (tw + pad*2);
    if (by < py0) by = y + 10;
    push(); noStroke(); fill(0, 200); rect(bx, by, tw + pad*2, th + pad*2, 6);
    fill(255); textAlign(LEFT, TOP); text(label, bx + pad, by + pad); pop();
  } else if (withinPlot && snapX !== null) {
    // When inside the plot but not over a point, show a subtle snap line at nearest lap
    push(); stroke(60); strokeWeight(1); line(snapX, py0, snapX, py1); pop();
  }
}
// #endregion

// #region Interaction
function mousePressed(){
  // BG pill
  if (pointInRect(mouseX,mouseY,UI_BTN.bgL)) { bgVisible = false; return; }
  if (pointInRect(mouseX,mouseY,UI_BTN.bgR)) { bgVisible = true;  return; }

  // View pill
  if (pointInRect(mouseX,mouseY,UI_BTN.viewL) && viewMode!=='TRACK') {
    // Start crossfade to TRACK view if not already switching
    if (!viewSwitch.active) viewSwitch = { active:true, from:viewMode, to:'TRACK', t:0, dur:0.45, switched:false };
    return;
  }
  if (pointInRect(mouseX,mouseY,UI_BTN.viewR) && viewMode!=='CHART') {
    // Start crossfade to CHART view if not already switching
    if (!viewSwitch.active) viewSwitch = { active:true, from:viewMode, to:'CHART', t:0, dur:0.45, switched:false };
    return;
  }

  // Play/Pause pill
  if(pointInRect(mouseX,mouseY,UI_BTN.playL)) { isPlaying = true;  return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.playR)) { isPlaying = false; return; }

  // speed
  if(pointInRect(mouseX,mouseY,UI_BTN.s1))  { playbackSpeed=1;  speedIndex=SPEED_PRESETS.indexOf(1);  return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.s2))  { playbackSpeed=2;  speedIndex=SPEED_PRESETS.indexOf(2);  return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.s5))  { playbackSpeed=5;  speedIndex=SPEED_PRESETS.indexOf(5);  return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.s10)) { playbackSpeed=10; speedIndex=SPEED_PRESETS.indexOf(10); return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.s20)) { playbackSpeed=20; speedIndex=SPEED_PRESETS.indexOf(20); return; }

  // leaderboard header toggles
  if(pointInRect(mouseX,mouseY,UI_BTN.gapL))  { gapMode='LEADER'; return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.gapA))  { gapMode='AHEAD';  return; }
  if(UI_BTN.tyreHide && pointInRect(mouseX,mouseY,UI_BTN.tyreHide)) { showTyre = false; return; }
  if(UI_BTN.tyreShow && pointInRect(mouseX,mouseY,UI_BTN.tyreShow)) { showTyre = true;  return; }

  // chart select (pick a driver by clicking a hovered point/label context)
  if (viewMode === 'CHART' && chartHover && chartHover.dn) { selectedDriver = int(chartHover.dn); return; }

  // click car on track
  if (viewMode==='TRACK'){
    // Select the nearest car under the hover radius at click time
    let best=null, bestDist=Infinity;
    Object.keys(lastFrameScreenPos).forEach(k=>{
      const sp=lastFrameScreenPos[k]; const d=dist(mouseX,mouseY,sp.x,sp.y);
      if(d<=Math.max(HOVER_RADIUS_BASE, CAR_DIAM+6) && d<bestDist){ bestDist=d; best=int(k); }
    });
    if(best!==null){ selectedDriver=best; return; }
  }

  // click row in board
  const inBoard = mouseX>=BOARD_VP.x && mouseX<=BOARD_VP.x+BOARD_VP.w && mouseY>=BOARD_VP.y && mouseY<=BOARD_VP.y+BOARD_VP.h;
  if(inBoard){
    // Pick the row whose vertical band is closest to the click (with tolerance)
    let bestDriver=null, bestDY=Infinity;
    Object.keys(driverY).forEach(k=>{
      const centerY = driverY[k];
      const top = centerY - BOARD_ROW_H_CURR/2;
      const bottom = centerY + BOARD_ROW_H_CURR/2;
      const dy=(mouseY<top)?(top-mouseY):(mouseY>bottom)?(mouseY-bottom):0;
      if(dy<bestDY && dy<BOARD_ROW_H_CURR*0.75){ bestDY=dy; bestDriver=int(k); }
    });
    if(bestDriver!==null){ selectedDriver=bestDriver; return; }
  }

  // If nothing matched, clear selection
  selectedDriver=null;
}

function keyPressed(){
  // Space toggles playback; return false to prevent page scroll in browsers.
  if (keyCode === 32) { isPlaying = !isPlaying; return false; } // space
}
// #endregion

// #region Resize
function windowResized(){
  // Rebuild canvas and recompute responsive layout on resize.
  resizeCanvas(windowWidth, windowHeight);
  computeLayout();

  // Re-sample the intro lap (car #1) and pit segment (car #16) for base layers.
  const introLap1 = (()=>{ const out=[]; const p1=points[1]||[]; for(let i=0;i<p1.length;i++){ const d=p1[i].date; if(d<=INTRO_END_TIMESTAMP) out.push(p1[i].pos); } return out; })();
  const pitSeg16 = (()=>{ const out=[]; const p16=points[16]||[]; for(let i=0;i<p16.length;i++){ const d=p16[i].date; if(d>INTRO_END_TIMESTAMP && d<=PIT_END_TIMESTAMP) out.push(p16[i].pos); } return out; })();

  rebuildViewportAndLayers(introLap1, pitSeg16);
  layoutButtonsTrack();
}
// #endregion
