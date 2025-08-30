// p5.js — Track + Leaderboard + pure time gaps (formation visible, gaps after Green only at minisectors)
// + Gap mode toggle (Leader vs Ahead) + One Play/Pause button + Pit-entry overlay ("PIT")
// + DNF overlay + Finish freeze (🏁 chequered flag) at lap 72 with fixed leaderboard positions
// + Tyre icons per driver based on stints.csv (PNG only), rendered in a fixed Tyre column
// + Tyre toggle in header (Hide|Show), default OFF
// + Chart toggle: big button next to speed buttons on the track panel
// + Chart: Positions vs Lap with snap-to-lap hover + linked highlighting (board <-> chart)
// + F1 logo + Title + info row (Time | Speed | Lap X / FINAL)
// + Spacebar toggles play/pause
// + Leaderboard columns auto-size like Excel (each column starts after the longest value of the prior column)
// + Crossfade when switching TRACK <-> CHART
// + FIX: Clear highlight when leaving chart/board (no sticky hover)

// ========================== SECTIONS ==========================
// Global Config | Layout | Playback-Buttons | Smooth config
// Gate/Lap Config | Data + State | Helpers
// Gap computation (Leader & Ahead) | preload | setup | draw
// drawLeaderboard | drawPositionsChart | Interaction | Keyboard
// =============================================================

// #region Global Config
const DRIVER_NUMS = [1,2,3,4,10,11,14,16,18,20,22,23,24,27,31,44,55,63,77,81];

const DRIVER_INFO_PATH = 'source/drivers.csv';
const LOCATION_PATH = (n) => `source/location_driver_${n}.csv`;
const POSITION_PATH = 'source/position.csv';

// new
const STINTS_PATH = 'source/stints.csv';

const START_LINE_LEN = 10;
const START_LINE_STROKE = 1;
const START_LINE_ANGLE_DEG = 73;
const START_FINISH_TIMESTAMP = "2024-06-30T13:03:03.203000+00:00";

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

// Pit-entry gate (derived from Driver 16 around this timestamp)
// Detection stays active; line is not rendered.
const PIT_ENTRY_TIMESTAMP = "2024-06-30T13:04:15.823000+00:00";
const SHOW_PIT_ENTRY_LINE = false;

const INTRO_END_TIMESTAMP = "2024-06-30T13:01:57.963000+00:00";
const PIT_END_TIMESTAMP   = "2024-06-30T13:05:20+00:00";

// DNF exceptions (leaderboard overlay that persists after this time)
const DNF_EVENTS = [
  { dn: '4', timestamp: "2024-06-30T14:20:10.005000+00:00" },
];

// Final classification config
const FINAL_LAP = 72; // show chequered flag + freeze at or after this lap

// App title (renders in leaderboard header)
const TITLE_TEXT = 'Austrian Gran Prix 2024 - F1 Race';
// #endregion

// #region Layout (Leaderboard left, Track/Chart right)
const CANVAS_W = 1600, CANVAS_H = 900;
const BOARD_VP = { x: 20, y: 20, w: 500, h: 860 };
const TRACK_VP = { x: BOARD_VP.x + BOARD_VP.w + 20, y: 20, w: 1060, h: 860 };

const PADDING = 40;
const CAR_DIAM = 10;
const HOVER_RADIUS = 10;
const HOVER_RING_WEIGHT = 2;
const SELECTED_RING_WEIGHT = 3;
const HOVER_RING_GAP = 4;

const BOARD_ROW_H = 32;
const BOARD_FONT_SIZE = 14;
const BOARD_MAX_ROWS = 20;

// Badges / icons
const BADGE_TEXT_SIZE = 12;
const BADGE_W = 18, BADGE_H = 18;

const LOGO_SIZE = 18, DOT_SIZE = 24, ROW_PAD_Y = 4;

// Tyre icon size (PNG only)
const TYRE_ICON = 25;
// #endregion

// #region Playback-Buttons
let isPlaying = true;
let playbackSpeed = 5.0;
const SPEED_PRESETS = [1,5,10,20];
let speedIndex = SPEED_PRESETS.indexOf(5);

const BTN_H = 26, BTN_W = 56, PLAY_W = 112, GAP = 8;
const UI_BTN = {
  play: { x:0,y:0,w:PLAY_W,h:BTN_H,label:()=> "Play/Pause" }, // single button toggle
  s1:   { x:0,y:0,w:BTN_W, h:BTN_H,label:()=> "1x"  },
  s5:   { x:0,y:0,w:BTN_W, h:BTN_H,label:()=> "5x"  },
  s10:  { x:0,y:0,w:BTN_W, h:BTN_H,label:()=> "10x" },
  s20:  { x:0,y:0,w:BTN_W, h:BTN_H,label:()=> "20x" },
  gapL: { x:0,y:0,w:0,h:0,label:()=> "Leader" }, // set in drawLeaderboard
  gapA: { x:0,y:0,w:0,h:0,label:()=> "Ahead"  },
  // Tyre segmented pill (Hide | Show) — hitboxes set in drawLeaderboard
  tyreHide: { x:0,y:0,w:0,h:0,label:()=> "Hide"   },
  tyreShow: { x:0,y:0,w:0,h:0,label:()=> "Show"   },
  // Big Chart toggle sits on the track panel near the speed buttons
  chart:{ x:0,y:0,w:88,h:BTN_H,label:()=> "Chart"  },
};
function layoutButtonsTrack(){
  const pad = 16;
  let x = TRACK_VP.x + pad;
  const y = TRACK_VP.y + pad;
  UI_BTN.play.x=x; UI_BTN.play.y=y; x+=PLAY_W+GAP;
  UI_BTN.s1.x=x;   UI_BTN.s1.y=y;  x+=BTN_W+GAP;
  UI_BTN.s5.x=x;   UI_BTN.s5.y=y;  x+=BTN_W+GAP;
  UI_BTN.s10.x=x;  UI_BTN.s10.y=y; x+=BTN_W+GAP;
  UI_BTN.s20.x=x;  UI_BTN.s20.y=y; x+=BTN_W+GAP;
  UI_BTN.chart.x=x; UI_BTN.chart.y=y; UI_BTN.chart.w=88; UI_BTN.chart.h=BTN_H;
}
// #endregion

// #region Smooth config
const TIME_OFFSET_SECONDS = 0;
const ENABLE_SMOOTH = true;
// #endregion

// #region Gate / Lap Counter Config
const GATE_HALF_LEN = 24; // half-length in screen px
const MIN_CROSSING_INTERVAL_SEC = 4.0;
const LAP_COUNT_START_DELAY_SEC = 1.0;
const PIT_START_DRIVERS = new Set(['24']);
// #endregion

// #region Data + State
let driverInfo, locationTables = {};
let points = {}, timesByDriver = {};
let driverColors = {}, driverAcronym = {}, teamByDriver = {};

let posTable, timestamps = [], timeStampsInSeconds = [];
let lastPositions = {}, positionChanges = {}, driverY = {};

let minX=0, maxX=0, minY=0, maxY=0, s = 1;
let centerX = 0, centerY = 0;
let baseLayer, trackLayer;

let startFinishWorldPos = null;
let miniGates = [], K_MS = 0;
let pitEntryWorldPos = null, pitEntryAngleDeg = START_LINE_ANGLE_DEG;

let RACE_START_ABS_SEC = 0;

let raceTime = 0, boardStartSec = 0, carStartSec = 0, lastDt = 0;
let lastBoardAbsSec = 0;   // for consistent leader choice like board

let selectedDriver = null, hoveredDriver = null;
let hoveredDriverGlobal = null; // shared highlight (board <-> chart)
let hoveredOrigin = null;       // 'BOARD' | 'CHART' | null
let lastFrameScreenPos = {}, smoothWorldPos = {};

let teamLogos = {};
let flagImg = null; // chequered flag asset
// F1 logo
let f1LogoImg = null;
const F1_LOGO_PATH = 'source/F1tm/F1tm.png';
const F1_LOGO_H = 24;

let lapCounts = {}, lapTimes = {}, prevScreenPos = {}, lastCrossSec = {};

let miniCounts = {}, lastMiniCrossSec = {};
let lastMiniCrossSecByGate = {};
let miniLapTimesByGate = {}; // gaps base only after green

// Pit-entry overlay state
let pitOverlayActive = {};
let lastPitEntryCrossSec = {};

// DNF overlay state
let dnfOverlayActive = {};
let dnfTimesAbsSec = {};

// Finish freeze state
let frozenDrivers = new Set();
let freezePos = {};
let freezePending = {};
let raceFinishTriggered = false;
let finishLeaderDn = null;
let awaitingFlag = {};

// Reveal / order
let revealedDrivers = new Set(), revealAlpha = {};
const REVEAL_FADE_DURATION_SEC = 0.4;

let baselineMiniAtGreen = {}, baselinedAtGreen = false;

// Gaps
let gapsToLeader = {};
let gapsToAhead  = {};
let currentLeader = null;

// Sequenced minisector times since green
let miniSeqTimes = {};
let lastStableGaps = {};
let lastStableGapsAhead = {};

// Board display mode
let gapMode = 'LEADER';
let gapAnim = 0;
let tyreAnim = 0; // smooth thumb for Tyre toggle

// Tyre visibility toggle (default OFF)
let showTyre = false;

// stints and tyre images
let stintsTable = null;
let stintsByDriver = {}; // dn -> [{lap_start, lap_end, compound, age}]
let tyreImgs = { SOFT:null, MEDIUM:null, HARD:null };

// View mode and Position history for Chart
let viewMode = 'TRACK'; // 'TRACK' or 'CHART'
let positionsByLap = {};     // positionsByLap[lap] = { dn: positionNumber }
let lastRecordedLap = 0;

// chart hover state
let chartHover = null; // { dn, lap, pos, x, y, d2 }

// Smooth view switch (fade)
let viewSwitch = { active:false, from:'TRACK', to:'CHART', t:0, dur:0.45, switched:false };
// #endregion

// #region Helpers
function hexToP5ColorMaybe(hexStr, fallback){
  if(!hexStr) return fallback;
  const clean = hexStr.trim().replace(/^#/, '');
  if(!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return color('#'+clean);
}
function parseIsoToSecOfDay(isoStr){
  const t = (isoStr.split('T')[1] || '00:00:00');
  const parts = t.split(':');
  const hh = int(parts[0]||'0');
  const mm = int(parts[1]||'0');
  const ss = float(parts[2]||'0');
  return hh*3600 + mm*60 + ss;
}
function timeToSeconds(t){
  const p=t.split(':'), h=int(p[0]), m=int(p[1]);
  const s = p[2].includes('.')? float(p[2]) : int(p[2]);
  return h*3600 + m*60 + s;
}
function secondsToTime(sec){
  const h=floor(sec/3600), m=floor((sec%3600)/60), s=floor(sec%60);
  return nf(h,2)+':'+nf(m,2)+':'+nf(s,2);
}
function formatGap(sec){
  if (sec == null || !isFinite(sec)) return '';
  if (sec < 60) return `+${sec.toFixed(3)}s`;
  const m = Math.floor(sec / 60);
  const s = (sec - m*60);
  return `+${m}:${s.toFixed(3).padStart(6,'0')}`;
}
function mapToScreen(pos){
  return createVector((pos.x-centerX)*s + TRACK_VP.w/2, -(pos.y-centerY)*s + TRACK_VP.h/2);
}
function drawCarDot(x,y,d,col,a=255){
  push(); noStroke(); const c=color(col); c.setAlpha(a); fill(c); ellipse(x,y,d,d); pop();
}
function drawTooltip(x,y,str){
  textSize(14); textAlign(LEFT,TOP);
  const pad=6, tw=textWidth(str), th=16;
  let bx=x+12, by=y-th-12;
  if (bx+tw+pad*2 > TRACK_VP.x+TRACK_VP.w) bx = TRACK_VP.x+TRACK_VP.w - (tw+pad*2) - 4;
  if (by < TRACK_VP.y) by = y + 12;
  push(); noStroke(); fill(0,180); rect(bx,by,tw+pad*2,th+pad*2,6); fill(255); text(str,bx+pad,by+pad); pop();
}
// Truncate single-line text to a max width with ellipsis
function drawTruncatedText(txt, x, baselineY, maxW){
  if (maxW <= 0){ return; }
  let s = txt;
  if (textWidth(s) <= maxW){ text(s, x, baselineY); return; }
  const ell = '…';
  let lo = 0, hi = s.length;
  while (lo < hi){
    const mid = Math.floor((lo+hi+1)/2);
    const part = s.slice(0, mid) + ell;
    if (textWidth(part) <= maxW) lo = mid; else hi = mid-1;
  }
  const out = s.slice(0, lo) + ell;
  text(out, x, baselineY);
}
function indexLE(arr,t){ let lo=0,hi=arr.length-1,ans=0; while(lo<=hi){const mid=(lo+hi)>>1; if(arr[mid]<=t){ans=mid; lo=mid+1;} else hi=mid-1;} return ans; }
function pointInRect(px,py,r){ return px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h; }

function numericLap(c,pitStart){ return pitStart ? ((c===0)?1:(c+1)) : ((c===0)?1:c); }
function lapHeaderNumeric(){
  let mx=1; for(const k in lapCounts){ const c=lapCounts[k]||0; const pit=PIT_START_DRIVERS.has(k);
    const ln=numericLap(c,pit); if(ln>mx) mx=ln; } return mx;
}
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

// get current compound for a driver and a given lap
function currentCompoundForDriver(dn, lapNum){
  const arr = stintsByDriver[dn];
  if(!arr || !arr.length) return null;
  for(let i=0;i<arr.length;i++){
    const s = arr[i];
    if(lapNum>=s.lap_start && lapNum<=s.lap_end) return s.compound;
  }
  // fallback to last stint that started before this lap
  let best=null;
  for(let i=0;i<arr.length;i++){
    const s=arr[i];
    if(s.lap_start<=lapNum) best=s;
  }
  return best ? best.compound : null;
}

// compute current tyre age (laps on this set)
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
  // fallback: most recent stint before this lap
  let best=null;
  for(let i=0;i<arr.length;i++){
    const s = arr[i];
    if(s.lap_start<=lapNum) best=s;
  }
  if(best){
    const baseAge = isNaN(best.age) ? (best.tyre_age_at_start||0) : best.age;
    return (lapNum - best.lap_start) + (baseAge || 0);
  }
  return null;
}
// #endregion

// #region Gap computation — Leader & Ahead
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

  cand.sort((a,b)=>{ if (b.rawMini !== a.rawMini) return b.rawMini - a.rawMini; return (b.timeSince - a.timeSince); });
  const order = cand.map(c=>c.dn);
  currentLeader = order[0];

  const newLeader = {}; const newAhead = {};
  const leaderSeq = miniSeqTimes[currentLeader] || [];

  for (let i=0;i<order.length;i++){
    const dn = order[i]; const seq = miniSeqTimes[dn] || [];
    if (dn === currentLeader){ newLeader[dn] = { type:'leader' }; }
    else if (seq.length === 0){ const fb = lastStableGaps[dn]; newLeader[dn] = (!fb||fb.type==='leader')?{type:'na'}:fb; }
    else {
      const idx=seq.length-1, tD=seq[idx], tL=(leaderSeq.length>idx)?leaderSeq[idx]:null;
      if(tL!==null){ newLeader[dn]={type:'time', gapSec:Math.max(0,tD-tL)}; }
      else { const fb=lastStableGaps[dn]; newLeader[dn]=(!fb||fb.type==='leader')?{type:'na'}:fb; }
    }
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

  gapsToLeader = newLeader; gapsToAhead  = newAhead;
  for (const dn in newLeader){ const g=newLeader[dn]; lastStableGaps[dn]=(g&&g.type==='leader')?{type:'time',gapSec:0}:g; }
  for (const dn in newAhead){ const g=newAhead[dn]; lastStableGapsAhead[dn]=(g&&g.type==='leader')?{type:'na'}:g; }
}
// #endregion

// #region preload
function preload(){
  driverInfo = loadTable(DRIVER_INFO_PATH, 'csv', 'header');
  DRIVER_NUMS.forEach(n=>{ locationTables[n]=loadTable(LOCATION_PATH(n),'csv','header'); });
  posTable = loadTable(POSITION_PATH,'csv','header');

  // stints table
  stintsTable = loadTable(STINTS_PATH, 'csv', 'header');

  const ok=()=>{}, fail=(k)=>()=>{teamLogos[k]=null;};
  teamLogos['McLaren']         = loadImage('source/logo/2025mclarenlogowhite.png',  ok, fail('McLaren'));
  teamLogos['Aston Martin']    = loadImage('source/logo/2025astonmartinlogowhite.png', ok, fail('Aston Martin'));
  teamLogos['Williams']        = loadImage('source/logo/2025williamslogowhite.png', ok, fail('Williams'));
  teamLogos['Mercedes']        = loadImage('source/logo/2025mercedeslogowhite.png', ok, fail('Mercedes'));
  teamLogos['Alpine']          = loadImage('source/logo/2025alpinelogowhite.png',   ok, fail('Alpine'));
  teamLogos['Haas F1 Team']    = loadImage('source/logo/2025haaslogowhite.png',     ok, fail('Haas F1 Team'));
  teamLogos['RB']              = loadImage('source/logo/2025racingbullslogowhite.png', ok, fail('RB'));
  teamLogos['Kick Sauber']     = loadImage('source/logo/2025kicksauberlogowhite.png', ok, fail('Kick Sauber'));
  teamLogos['Red Bull Racing'] = loadImage('source/logo/2025redbullracinglogowhite.png', ok, fail('Red Bull Racing'));
  teamLogos['Ferrari']         = loadImage('source/logo/2025ferrarilogowhite.png',  ok, fail('Ferrari'));

  // chequered flag (only per driver when frozen)
  flagImg = loadImage('source/chequered_flag.png');

  // F1 logo (optional)
  f1LogoImg = loadImage(F1_LOGO_PATH);

  // tyre images — PNG only
  const loadTyrePng = (key, base) => {
    tyreImgs[key] = null;
    tyreImgs[key] = loadImage(
      `source/tyre/${base}.png`,
      img => { tyreImgs[key] = img; },
      () => { tyreImgs[key] = null; }
    );
  };
  loadTyrePng('SOFT',   'soft_tyre');
  loadTyrePng('MEDIUM', 'medium_tyre');
  loadTyrePng('HARD',   'hard_tyre');
}
// #endregion

// #region setup
function setup(){
  createCanvas(CANVAS_W, CANVAS_H);
  frameRate(60); pixelDensity(2);

  baseLayer=createGraphics(TRACK_VP.w,TRACK_VP.h);
  trackLayer=createGraphics(TRACK_VP.w,TRACK_VP.h);
  baseLayer.clear(); trackLayer.clear();

  layoutButtonsTrack();

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

    // init states
    lapCounts[numStr]=0; lapTimes[numStr]=[];
    prevScreenPos[numStr]=null; lastCrossSec[numStr]=-Infinity;

    lastMiniCrossSecByGate[numStr]={};
    miniLapTimesByGate[numStr]={};
    miniCounts[numStr]=0; lastMiniCrossSec[numStr]=-Infinity;

    pitOverlayActive[numStr]=false; lastPitEntryCrossSec[numStr]=-Infinity;
    dnfOverlayActive[numStr]=false;
    awaitingFlag[numStr]=false;

    revealAlpha[numStr]=0;

    miniSeqTimes[numStr]=[]; lastStableGaps[numStr]={type:'na'}; lastStableGapsAhead[numStr]={type:'na'};
  }
  DRIVER_NUMS.forEach((n,i)=>{ const k=String(n); if(!driverColors[k]) driverColors[k]=fallback(i); if(!driverAcronym[k]) driverAcronym[k]=k; });

  // parse stints
  if(stintsTable){
    for(let r=0;r<stintsTable.getRowCount();r++){
      const dn  = String(stintsTable.getString(r,'driver_number')||'').trim();
      if(!dn) continue;
      const ls  = int(stintsTable.getString(r,'lap_start')||'1');
      const le  = int(stintsTable.getString(r,'lap_end')||'1');
      const comp= String(stintsTable.getString(r,'compound')||'').trim().toUpperCase();
      const age = int(stintsTable.getString(r,'tyre_age_at_start')||'0');
      if(!stintsByDriver[dn]) stintsByDriver[dn] = [];
      stintsByDriver[dn].push({ lap_start:ls, lap_end:le, compound:comp, age });
    }
    // sort per driver
    for(const dn in stintsByDriver){
      stintsByDriver[dn].sort((a,b)=> a.lap_start - b.lap_start);
    }
  }

  // load points
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

  carStartSec = allTimes.length ? allTimes.reduce((m,v)=>Math.min(m,v), Infinity) : 0;

  if(allPos.length>0){
    minX=allPos.reduce((m,p)=>Math.min(m,p.x),Infinity);
    maxX=allPos.reduce((m,p)=>Math.max(m,p.x),-Infinity);
    minY=allPos.reduce((m,p)=>Math.min(m,p.y),Infinity);
    maxY=allPos.reduce((m,p)=>Math.max(m,p.y),-Infinity);
  }

  // S/F + race start abs
  const p1 = points[1]||[];
  for(let i=0;i<p1.length;i++) if(p1[i].date===START_FINISH_TIMESTAMP){ startFinishWorldPos=p1[i].pos.copy(); break; }
  RACE_START_ABS_SEC = parseIsoToSecOfDay(START_FINISH_TIMESTAMP);

  // Precompute absolute times for DNF events
  DNF_EVENTS.forEach(ev=>{ dnfTimesAbsSec[ev.dn] = parseIsoToSecOfDay(ev.timestamp); });

  // Minisector gates from Driver 1
  miniGates=[]; MINISECTOR_TS.forEach((ts,idx)=>{
    const g=gateFromTimestamp(p1,ts,START_LINE_ANGLE_DEG);
    if(g) miniGates.push({name:`M${idx+1}`, worldPos:g.worldPos, angleDeg:g.angleDeg});
  });
  K_MS = miniGates.length;

  // Pit-entry gate from Driver 16 (hidden line; detection only)
  {
    const p16all = points[16] || [];
    const g = gateFromTimestampFuzzy(p16all, PIT_ENTRY_TIMESTAMP, START_LINE_ANGLE_DEG, 3.0);
    if (g) { pitEntryWorldPos = g.worldPos; pitEntryAngleDeg = g.angleDeg; }
  }

  // prerender: pitlane
  const pitSeg16=[]; const p16=points[16]||[];
  for(let i=0;i<p16.length;i++){ const d=p16[i].date; if(d>INTRO_END_TIMESTAMP && d<=PIT_END_TIMESTAMP) pitSeg16.push(p16[i].pos); }

  const dataW=Math.max(1,maxX-minX), dataH=Math.max(1,maxY-minY);
  const scaleX=(TRACK_VP.w-PADDING*2)/dataW, scaleY=(TRACK_VP.h-PADDING*2)/dataH;
  s=Math.min(scaleX,scaleY); centerX=(minX+maxX)/2; centerY=(minY+maxY)/2;

  baseLayer.push();
  baseLayer.translate(TRACK_VP.w/2,TRACK_VP.h/2); baseLayer.scale(s,-s); baseLayer.translate(-centerX,-centerY);
  baseLayer.stroke(180,180,180,200); baseLayer.strokeWeight(2/s); baseLayer.noFill();
  baseLayer.beginShape(); for(let i=0;i<pitSeg16.length;i++) baseLayer.vertex(pitSeg16[i].x,pitSeg16[i].y); baseLayer.endShape();
  baseLayer.pop();

  trackLayer.push();
  trackLayer.translate(TRACK_VP.w/2,TRACK_VP.h/2); trackLayer.scale(s,-s); trackLayer.translate(-centerX,-centerY);
  trackLayer.stroke(180,180,180,200); trackLayer.strokeWeight(4/s); trackLayer.noFill();
  trackLayer.beginShape(); for(let i=0;i<introLap1.length;i++) trackLayer.vertex(introLap1[i].x,introLap1[i].y); trackLayer.endShape();
  trackLayer.pop();

  // board time base
  for(let r=0;r<posTable.getRowCount();r++){ const ts=posTable.getRow(r).get('timestamp'); if(!timestamps.includes(ts)) timestamps.push(ts); }
  timestamps.sort(); boardStartSec = timestamps.length ? timeToSeconds(timestamps[0]) : 0;
  timeStampsInSeconds = timestamps.map(timeToSeconds);
}
// #endregion

// #region draw
function draw(){
  background(12);
  const dt=(deltaTime||16.67)/1000; lastDt=dt;

  playbackSpeed = constrain(playbackSpeed, 1, 20);
  if(isPlaying) raceTime += dt*playbackSpeed;

  const boardAbsSec = boardStartSec + raceTime; lastBoardAbsSec = boardAbsSec;
  const carAbsSec   = (carStartSec + raceTime) + TIME_OFFSET_SECONDS;
  const afterGreen  = (carAbsSec >= RACE_START_ABS_SEC);
  const raceStarted = (boardAbsSec >= RACE_START_ABS_SEC);

  // DNF overlays
  for (const dn in dnfTimesAbsSec){ if (boardAbsSec >= dnfTimesAbsSec[dn]) dnfOverlayActive[dn] = true; }

  // On green: reset minisector buffers and baselines
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

  // Right panel pre-pass: draw TRACK background; defer CHART until after leaderboard
  imageMode(CORNER);
  push();
  translate(TRACK_VP.x,TRACK_VP.y);
  if (viewMode === 'TRACK') {
    image(baseLayer,0,0); image(trackLayer,0,0);
  }
  pop();

  // Build gate bases in screen space
  const miniBases = miniGates.map(g=>{
    const p=mapToScreen(g.worldPos); const px=TRACK_VP.x+p.x, py=TRACK_VP.y+p.y;
    const th=radians(g.angleDeg), tx=Math.cos(th), ty=Math.sin(th);
    const nx=-Math.sin(th), ny=Math.cos(th);
    return {px,py,tx,ty,nx,ny};
  });

  let sfBase=null; if(startFinishWorldPos){
    const p=mapToScreen(startFinishWorldPos); const px=TRACK_VP.x+p.x, py=TRACK_VP.y+p.y;
    const th=radians(START_LINE_ANGLE_DEG), tx=Math.cos(th), ty=Math.sin(th);
    const nx=-Math.sin(th), ny=Math.cos(th);
    sfBase={px,py,tx,ty,nx,ny};
  }

  let pitBase=null; if(pitEntryWorldPos){
    const p=mapToScreen(pitEntryWorldPos); const px=TRACK_VP.x+p.x, py=TRACK_VP.y+p.y;
    const th=radians(pitEntryAngleDeg), tx=Math.cos(th), ty=Math.sin(th);
    const nx=-Math.sin(th), ny=Math.cos(th);
    pitBase={px,py,tx,ty,nx,ny};
  }

  // Cars + detection
  let hoverHit=null, minDist=Infinity, selectedViz=null;
  lastFrameScreenPos = {};

  DRIVER_NUMS.forEach(n=>{
    const arr=points[n], times=timesByDriver[n]; if(!arr||arr.length===0) return;

    let k=0;
    if(times && times.length>0){
      if(carAbsSec<=times[0]) k=0; else if(carAbsSec>=times[times.length-1]) k=times.length-1; else k=indexLE(times,carAbsSec);
    }

    let posWorld;
    if(k < arr.length-1){
      const t0=arr[k].tSec, t1=arr[k+1].tSec, p0=arr[k].pos, p1=arr[k+1].pos;
      const span=Math.max(1e-6,t1-t0), f=constrain((carAbsSec-t0)/span,0,1);
      posWorld={ x:p0.x+(p1.x-p0.x)*f, y:p0.y+(p1.y-p0.y)*f };
    } else { posWorld={ x:arr[k].pos.x, y:arr[k].pos.y }; }

    const spRaw=mapToScreen(posWorld); const currX=TRACK_VP.x+spRaw.x, currY=TRACK_VP.y+spRaw.y;

    let posDraw=posWorld;
    if(ENABLE_SMOOTH){
      const prevSm = smoothWorldPos[n];
      const tau = 0.12;
      let alpha = 1 - Math.exp(- (dt * playbackSpeed) / tau);
      alpha = constrain(alpha, 0.18, 0.9);
      if(prevSm){
        posDraw = {
          x: prevSm.x + (posWorld.x - prevSm.x) * alpha,
          y: prevSm.y + (posWorld.y - prevSm.y) * alpha,
        };
      }
      smoothWorldPos[n]=posDraw;
    }
    const sp=mapToScreen(posDraw); const cx=TRACK_VP.x+sp.x, cy=TRACK_VP.y+sp.y;
    lastFrameScreenPos[String(n)]={x:cx,y:cy};

    const key=String(n), col=driverColors[key]||color(200);

    if (viewMode === 'TRACK'){
      drawCarDot(cx,cy,CAR_DIAM,col,255);
      if(selectedDriver!==null && n===selectedDriver) selectedViz={x:cx,y:cy,diam:CAR_DIAM,color:col};
    }

    const prev=prevScreenPos[key];
    const allowDetection = (carAbsSec - carStartSec) >= LAP_COUNT_START_DELAY_SEC;

    if(allowDetection && prev && playbackSpeed>0){
      // Pit-entry detection
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

      // Minisectors
      const allowMiniForOrder = true;
      const allowMiniForGaps  = afterGreen;

      if (allowMiniForOrder || allowMiniForGaps) {
        for (let gi = 0; gi < miniBases.length; gi++) {
          const gb = miniBases[gi];
          const d0 = (prev.x - gb.px) * gb.nx + (prev.y - gb.py) * gb.ny;
          const d1 = (currX - gb.px) * gb.nx + (currY - gb.py) * gb.ny;
          if (d0 < 0 && d1 >= 0) {
            const r = d0 / (d0 - d1);
            const ix = prev.x + (currX - prev.x) * r;
            const iy = prev.y + (currY - prev.y) * r;
            const u  = (ix - gb.px) * gb.tx + (iy - gb.py) * gb.ty;
            if (Math.abs(u) <= GATE_HALF_LEN) {
              const lastByGate = (lastMiniCrossSecByGate[key][gi] || -Infinity);
              if ((carAbsSec - lastByGate) >= MIN_CROSSING_INTERVAL_SEC) {
                if (allowMiniForOrder) {
                  miniCounts[key] = (miniCounts[key] || 0) + 1;
                  lastMiniCrossSec[key] = carAbsSec;
                  if (!revealedDrivers.has(key)) { revealedDrivers.add(key); revealAlpha[key] = 0; }
                  if (pitOverlayActive[key]) pitOverlayActive[key] = false;
                }
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

      // Start Finish lap count
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

    prevScreenPos[key]={x:currX,y:currY};

    // Hover from track (only when track is visible)
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

  // Selected and hover visuals (only on track)
  if(viewMode==='TRACK'){
    if(selectedViz){
      push(); noFill(); stroke(selectedViz.color); strokeWeight(SELECTED_RING_WEIGHT);
      ellipse(selectedViz.x,selectedViz.y, selectedViz.diam+HOVER_RING_GAP*2, selectedViz.diam+HOVER_RING_GAP*2); pop();
    }
    if(hoverHit){
      push(); noFill(); stroke(0,180); strokeWeight(HOVER_RING_WEIGHT+2);
      ellipse(hoverHit.x,hoverHit.y, CAR_DIAM+HOVER_RING_GAP*2, CAR_DIAM+HOVER_RING_GAP*2);
      stroke(hoverHit.color); strokeWeight(HOVER_RING_WEIGHT);
      ellipse(hoverHit.x,hoverHit.y, CAR_DIAM+HOVER_RING_GAP*2, CAR_DIAM+HOVER_RING_GAP*2); pop();
      drawTooltip(hoverHit.x,hoverHit.y, hoverHit.acronym);
    }
  }

  // Markers
  if(viewMode==='TRACK' && startFinishWorldPos){
    const p=mapToScreen(startFinishWorldPos); const px=TRACK_VP.x+p.x, py=TRACK_VP.y+p.y;
    push(); stroke(255); strokeWeight(START_LINE_STROKE); translate(px,py); rotate(radians(START_LINE_ANGLE_DEG));
    line(-START_LINE_LEN/2,0, START_LINE_LEN/2,0); pop();
  }
  // Pit-entry line intentionally NOT drawn when SHOW_PIT_ENTRY_LINE === false

  drawLeaderboard(boardAbsSec, raceStarted);

  // Render CHART after leaderboard so it can read hoveredDriverGlobal from board hover
  if (viewMode === 'CHART') {
    push();
    translate(TRACK_VP.x, TRACK_VP.y);
    noStroke(); fill(12); rect(0,0,TRACK_VP.w,TRACK_VP.h);
    drawPositionsChart();
    pop();
  }

  // Draw track controls group last so it's above chart
  layoutButtonsTrack();
  (function(){
    function drawBtn(btn,active=false){
      const hovered=pointInRect(mouseX,mouseY,btn);
      const base=active?255:220, bg=active?28:22;
      push(); fill(bg+(hovered?8:0)); noStroke(); rect(btn.x,btn.y,btn.w,btn.h,6);
      fill(base); textAlign(CENTER,CENTER); textSize(12); text(btn.label(), btn.x+btn.w/2, btn.y+btn.h/2+1);
      pop();
    }
    const currentSpd = SPEED_PRESETS[speedIndex];
    const groupX = UI_BTN.play.x - 8;
    const groupY = UI_BTN.play.y - 8;
    const groupW = (UI_BTN.chart.x + UI_BTN.chart.w) - UI_BTN.play.x + 16;
    const groupH = BTN_H + 16;
    push(); noStroke(); fill(0,120); rect(groupX,groupY,groupW,groupH,8); pop();

    drawBtn(UI_BTN.play, isPlaying);
    drawBtn(UI_BTN.s1, currentSpd===1);
    drawBtn(UI_BTN.s5, currentSpd===5);
    drawBtn(UI_BTN.s10, currentSpd===10);
    drawBtn(UI_BTN.s20, currentSpd===20);
    drawBtn(UI_BTN.chart, viewMode==='CHART');
  })();

  // --- Crossfade overlay for switching TRACK <-> CHART ---
  if (viewSwitch.active) {
    // advance timer
    viewSwitch.t += lastDt;
    const half = viewSwitch.dur * 0.5;

    // switch the actual mode at mid-fade
    if (!viewSwitch.switched && viewSwitch.t >= half) {
      viewMode = viewSwitch.to;
      viewSwitch.switched = true;
    }
    // finish
    if (viewSwitch.t >= viewSwitch.dur) {
      viewSwitch.active = false;
    }

    // overlay alpha: ramp up to mid, then ramp down
    const p = constrain(viewSwitch.t / viewSwitch.dur, 0, 1);
    let ovAlpha;
    if (p <= 0.5) {
      ovAlpha = map(p, 0, 0.5, 0, 220, true);   // fade out
    } else {
      ovAlpha = map(p, 0.5, 1, 220, 0, true);   // fade in
    }

    // draw overlay on the right panel only (keep buttons visible)
    push();
    noStroke();
    fill(0, ovAlpha);
    rect(TRACK_VP.x, TRACK_VP.y, TRACK_VP.w, TRACK_VP.h);
    pop();
  }

  cursor(viewMode==='TRACK' && hoverHit? HAND : ARROW);
}
// #endregion

// #region drawLeaderboard  (Excel-like auto columns, non-sticky hover)
function drawLeaderboard(boardAbsSec, raceStarted){
  // panel
  push(); noStroke(); fill(18); rect(BOARD_VP.x,BOARD_VP.y,BOARD_VP.w,BOARD_VP.h,10); pop();

  // Title + F1 logo
  const titleX0 = BOARD_VP.x + 16;
  const titleY0 = BOARD_VP.y + 8;
  let logoW = 0, logoH = 0;
  if (f1LogoImg) {
    logoH = F1_LOGO_H;
    logoW = f1LogoImg.width && f1LogoImg.height ? (f1LogoImg.width * (logoH / f1LogoImg.height)) : 0;
    push(); imageMode(CORNER); tint(255); image(f1LogoImg, titleX0, titleY0, logoW, logoH); noTint(); pop();
  }
  const titleGapX = logoW > 0 ? 8 : 0;

  push();
  if (typeof f1FontBold !== 'undefined' && f1FontBold) textFont(f1FontBold);
  else if (typeof f1Font !== 'undefined' && f1Font) textFont(f1Font);
  fill(235); textSize(18); textAlign(LEFT, TOP);
  text(TITLE_TEXT, titleX0 + logoW + titleGapX, titleY0);
  pop();

  // info line arranged under title/logo (Time | Speed | Lap X / FINAL)
  textSize(12); fill(200); textAlign(LEFT,TOP);
  const baseX = BOARD_VP.x + 16;
  const titleTop = BOARD_VP.y + 8;
  const headerRowH = Math.max(F1_LOGO_H, 24);
  const infoY = titleTop + headerRowH + 8;
  const lapNow = lapHeaderNumeric();
  const lapHeader = raceStarted ? `Lap: ${lapNow} / ${FINAL_LAP}` : 'Formation Lap';
  const infoStr = `Time: ${secondsToTime(boardAbsSec)}   |   Speed: ${SPEED_PRESETS[speedIndex]}x   |   ${lapHeader}`;
  text(infoStr, baseX, infoY);

  // --- Controls row (below info) ---
  const controlsY = infoY + 18;
  const pillH = 20, pillR = 10, segW = 64, gapBetween = 12;

  // Label + Gaps: [Leader | Ahead]
  const gapsLabel = 'Gaps:';
  textSize(12); fill(200); textAlign(LEFT, TOP);
  let ctrlX = baseX;
  text(gapsLabel, ctrlX, controlsY - 1);
  const gapsPillX = ctrlX + textWidth(gapsLabel) + 6;
  push(); noStroke(); fill(22); rect(gapsPillX, controlsY, segW*2, pillH, pillR); pop();
  push(); stroke(40); line(gapsPillX+segW, controlsY+2, gapsPillX+segW, controlsY+pillH-2); pop();
  const gapTarget = (gapMode==='LEADER') ? 0 : 1; gapAnim = lerp(gapAnim, gapTarget, 0.25);
  const gapThumbX = gapsPillX + gapAnim * segW;
  push(); noStroke(); fill(28); rect(gapThumbX, controlsY, segW, pillH, pillR); pop();
  push(); textAlign(CENTER, CENTER); textSize(12);
  fill(gapMode==='LEADER'?255:200); text('Leader', gapsPillX + segW/2, controlsY + pillH/2 + 1);
  fill(gapMode==='AHEAD'?255:200);  text('Ahead',  gapsPillX + segW + segW/2, controlsY + pillH/2 + 1);
  pop();
  UI_BTN.gapL = { x: gapsPillX, y: controlsY, w: segW, h: pillH };
  UI_BTN.gapA = { x: gapsPillX+segW, y: controlsY, w: segW, h: pillH };

  ctrlX = gapsPillX + segW*2 + gapBetween;

  // Tyre: [Hide | Show] (left=Hide, right=Show)
  const tyreLabel = 'Tyre:';
  textSize(12); fill(200); textAlign(LEFT, TOP);
  text(tyreLabel, ctrlX, controlsY - 1);
  const tyrePillX = ctrlX + textWidth(tyreLabel) + 6;
  push(); noStroke(); fill(22); rect(tyrePillX, controlsY, segW*2, pillH, pillR); pop();
  push(); stroke(40); line(tyrePillX+segW, controlsY+2, tyrePillX+segW, controlsY+pillH-2); pop();
  const tyreTarget = showTyre ? 1 : 0; // right when showing
  tyreAnim = lerp(tyreAnim, tyreTarget, 0.25);
  const tyreThumbX = tyrePillX + tyreAnim * segW;
  push(); noStroke(); fill(28); rect(tyreThumbX, controlsY, segW, pillH, pillR); pop();
  push(); textAlign(CENTER, CENTER); textSize(12);
  fill(!showTyre?255:200); text('Hide', tyrePillX + segW/2, controlsY + pillH/2 + 1);
  fill(showTyre?255:200);  text('Show', tyrePillX + segW + segW/2, controlsY + pillH/2 + 1);
  pop();
  UI_BTN.tyreHide = { x: tyrePillX, y: controlsY, w: segW, h: pillH };
  UI_BTN.tyreShow = { x: tyrePillX+segW, y: controlsY, w: segW, h: pillH };

  // Columns header row below controls:
  const columnsY = controlsY + pillH + 12;

  // ===== Build rows (order + data) for measurement =====
  const rows=[]; const rowByDn={};
  for(let r=0;r<driverInfo.getRowCount();r++){
    const dn=driverInfo.getString(r,'driver_number');
    if(!revealedDrivers.has(dn)) continue;

    const acr=driverInfo.getString(r,'name_acronym')||'';
    let col=driverInfo.getString(r,'team_colour')||'';
    const team=driverInfo.getString(r,'team_name')||'';
    if(col && !col.startsWith('#')) col='#'+col;

    const base = baselinedAtGreen ? (baselineMiniAtGreen[dn]||0) : 0;
    const raw  = Math.max(0,(miniCounts[dn]||0)-base);
    const last=lastMiniCrossSec[dn];
    const timeSince = (isFinite(last)? (lastBoardAbsSec-last) : -1e99);

    const row = { driver_number:dn, name_acronym:acr, team_colour:col||'#FFFFFF', team_name:team, rawMini:raw, timeSinceLastMini:timeSince };
    rows.push(row); rowByDn[dn]=row;
  }
  if (rows.length === 0) { return; }
  rows.sort((a,b)=>{ if(b.rawMini!==a.rawMini) return b.rawMini-a.rawMini; return (b.timeSinceLastMini - a.timeSinceLastMini); });
  rows.forEach((d,i)=> d.position=i+1);

  // ===== Freeze commits based on ordered rows (before measuring visible rows) =====
  for (let i=0;i<rows.length;i++){
    const d = rows[i]; const dn = d.driver_number; const lapNum = numericLap((lapCounts[dn]||0), PIT_START_DRIVERS.has(dn));
    if (lapNum >= FINAL_LAP && !frozenDrivers.has(dn)) freezePending[dn] = true;
    if (dn==='4' && dnfOverlayActive['4'] && d.position===20 && !frozenDrivers.has('4')) freezePending['4'] = true;
  }
  for (const dn in freezePending) {
    if (freezePending[dn] && !frozenDrivers.has(dn)) {
      frozenDrivers.add(dn);
      const r = rowByDn[dn];
      if (r) freezePos[dn] = r.position;
      pitOverlayActive[dn] = false;
    }
  }

  // Final order with frozen pinned
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

  // Visible window for measurement
  const visCount = Math.min(BOARD_MAX_ROWS, finalRows.length);
  const visible = finalRows.slice(0, visCount);

  // ===== Measure columns like Excel =====
  textSize(BOARD_FONT_SIZE);
  const SP = 8; // spacing between columns
  const PAD_L = 12, PAD_R = 10;
  const DELTA_W = Math.max(textWidth('Δ'), BADGE_W) + 8;          // change badge
  let posW = textWidth('Pos');
  for (let i=0;i<visCount;i++) posW = Math.max(posW, textWidth(String(i+1)));
  posW += 8;

  const teamW = Math.max(textWidth('Team'), DOT_SIZE) + 8;        // dot+logo area

  // Driver col: longest acronym in visible rows
  let driverW = textWidth('Driver');
  for (let i=0;i<visCount;i++) driverW = Math.max(driverW, textWidth(visible[i].name_acronym||''));
  driverW += 12;

  // Gap col: max gap string
  const gapStrOf = (dn) => {
    const infoMap = (gapMode==='LEADER')?gapsToLeader:gapsToAhead;
    const g = infoMap[dn];
    if (dnfOverlayActive[dn]) return 'DNF';
    if (pitOverlayActive[dn]) return 'PIT';
    if (g){
      if (g.type==='leader') return 'Leader';
      if (g.type==='time')   return formatGap(g.gapSec);
    }
    return '';
  };
  let gapW = textWidth('Gap');
  for (let i=0;i<visCount;i++) gapW = Math.max(gapW, textWidth(gapStrOf(visible[i].driver_number)));
  gapW += 10;
  const GAP_MIN = 60;

  // Tyre col (optional): icon + max age text
  let tyreW = 0;
  let ageMaxW = 0;
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

  const flagW = 22; // flag icon cell

  // Total width and fit adjustments
  const totalCols = showTyre ? 7 : 6; // Δ, Pos, Team, Driver, Gap, [Tyre], Flag
  let totalW = DELTA_W + posW + teamW + driverW + gapW + (showTyre?tyreW:0) + flagW + SP*(totalCols-1);
  const avail = BOARD_VP.w - PAD_L - PAD_R;

  // Shrink if necessary: Driver -> Gap -> Tyre
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
    const tyreMin = TYRE_ICON + 4; // icon only
    const shrinkTyre = Math.min(need, Math.max(0, tyreW - tyreMin));
    tyreW -= shrinkTyre; totalW -= shrinkTyre;
  }

  // ===== Compute anchors left→right =====
  const tableLeft = BOARD_VP.x + PAD_L;
  const deltaX   = tableLeft;
  const posX     = deltaX + DELTA_W + SP;
  const teamX    = posX   + posW    + SP;
  const driverX  = teamX  + teamW   + SP;
  const gapX     = driverX+ driverW + SP;
  const tyreX    = gapX   + gapW    + SP;
  // place flag at the far right (use avail to keep compact table)
  const flagX    = tableLeft + avail - flagW;

  // headers
  fill(200); textSize(12); textAlign(LEFT, TOP);
  text('Δ',    deltaX, columnsY );
  text('Pos',  posX,   columnsY );
  text('Team', teamX,  columnsY );
  text('Driver', driverX, columnsY );
  text('Gap',  gapX,   columnsY );
  if (showTyre) text('Tyre', tyreX, columnsY );

  // Pixel perfect row metrics
  textSize(BOARD_FONT_SIZE);
  const asc = textAscent(), des = textDescent();
  const baselineFromCenter = Math.round((asc - des) / 2);

  const baseY = columnsY + 24;
  const rowH  = BOARD_ROW_H;
  const halfH = Math.floor(rowH / 2);

  const inBoard = mouseX>=BOARD_VP.x && mouseX<=BOARD_VP.x+BOARD_VP.w && mouseY>=BOARD_VP.y && mouseY<=BOARD_VP.y+BOARD_VP.h;
  let boardHoverKey = null;

  for(let i=0;i<visCount; i++){
    const d=visible[i]; const driverKey=String(d.driver_number);

    let a=revealAlpha[driverKey]; if(a===undefined) a=255;
    if(a<255){ a=Math.min(255, a+255*(lastDt/REVEAL_FADE_DURATION_SEC)); revealAlpha[driverKey]=a; }

    const rowTop   = baseY + i*rowH;
    const targetCenterY = rowTop + halfH;

    if(!(driverKey in driverY)) driverY[driverKey]=targetCenterY;
    driverY[driverKey]=lerp(driverY[driverKey], targetCenterY, 0.25);

    const rowCenter = Math.round(driverY[driverKey]);
    const baselineY = rowCenter + baselineFromCenter;

    const rowLeft  = BOARD_VP.x+8;
    const rowRight = BOARD_VP.x+BOARD_VP.w-8;
    const rowTopPx = rowCenter - halfH;
    const rowBotPx = rowCenter + halfH;

    // Hover/select highlight
    const mouseOverRow = inBoard && mouseX>=rowLeft && mouseX<=rowRight && mouseY>=rowTopPx && mouseY<=rowBotPx;
    if (mouseOverRow) boardHoverKey = driverKey;

    const isSelected=(selectedDriver!==null && String(selectedDriver)===driverKey);
    const isHovered = mouseOverRow || (hoveredDriver!==null && String(hoveredDriver)===driverKey);
    if(isHovered || isSelected){
      const baseAlpha=isSelected?20:12; const aRow=baseAlpha * ( (revealAlpha[driverKey]!==undefined?revealAlpha[driverKey]:255) /255 );
      push(); rectMode(CORNERS); noStroke(); fill(255,255,255,aRow); rect(rowLeft,rowTopPx,rowRight,rowBotPx,6); pop();
    }

    // Δ (badge)
    if(positionChanges[driverKey]){
      const info=positionChanges[driverKey];
      const badgeAlpha=(info.alpha*(a/255));
      const symbol = info.delta>0?'▲':(info.delta<0?'▼':'');
      const boxFill = info.delta>0? color(0,255,0,badgeAlpha*0.28) : color(255,0,0,badgeAlpha*0.28);
      const textFill= info.delta>0? color(0,255,0,badgeAlpha)     : color(255,80,80,badgeAlpha);
      push(); rectMode(CENTER); noStroke(); fill(boxFill);
      const cx=deltaX + BADGE_W/2 + 4; rect(cx,rowCenter,BADGE_W,BADGE_H,4);
      fill(textFill); textAlign(CENTER,CENTER); textSize(BADGE_TEXT_SIZE); text(symbol,cx,rowCenter); pop();
      info.alpha-=2.5; info.framesLeft--; if(info.framesLeft<=0 || info.alpha<=0) delete positionChanges[driverKey];
    }

    // Pos
    push(); fill(220,a); textAlign(LEFT,BASELINE); text((i+1).toString(), posX, baselineY); pop();

    // Team dot + logo
    const dotCx = teamX + DOT_SIZE/2;
    push(); noStroke(); const c=color(d.team_colour || '#FFFFFF'); c.setAlpha(a); fill(c);
    ellipse(dotCx,rowCenter, DOT_SIZE, DOT_SIZE); pop();
    const logoImg=teamLogos[d.team_name];
    if(logoImg){ push(); imageMode(CENTER); tint(255,a); image(logoImg, dotCx, rowCenter, LOGO_SIZE, LOGO_SIZE); noTint(); pop(); }

    // Driver (truncate to fit)
    const nameText = `${d.name_acronym}`;
    push(); textAlign(LEFT, BASELINE); textSize(BOARD_FONT_SIZE);
    let nameCol = color(d.team_colour || '#FFFFFF');
    nameCol.setAlpha(isSelected ? a : (isHovered ? Math.min(255, a + 40) : a));
    fill(nameCol); drawTruncatedText(nameText, driverX, baselineY, driverW); pop();

    // Gap (right-aligned inside its column)
    const gapStr = gapStrOf(driverKey);
    push(); textAlign(RIGHT, BASELINE); textSize(BOARD_FONT_SIZE); fill(255, a);
    text(gapStr, gapX + gapW, baselineY);
    pop();

    // Tyre
    if (showTyre) {
      const lapNum = numericLap((lapCounts[driverKey]||0), PIT_START_DRIVERS.has(driverKey));
      const comp = currentCompoundForDriver(driverKey, lapNum);
      const age = currentTyreAgeForDriver(driverKey, lapNum);
      const iconCx = tyreX + TYRE_ICON/2;
      if (comp){
        const img = tyreImgs[comp] || null;
        if(img){
          push(); imageMode(CENTER); image(img, iconCx, rowCenter, TYRE_ICON, TYRE_ICON); pop();
        } else {
          const letter = comp[0] || '?';
          push(); rectMode(CENTER); noStroke(); fill(255,255,255,20);
          rect(iconCx, rowCenter, TYRE_ICON, TYRE_ICON, 3);
          fill(255, a); textAlign(CENTER, CENTER); textSize(12);
          text(letter, iconCx, rowCenter+1);
          pop();
        }
        if(age != null){
          push(); textAlign(LEFT, CENTER); textSize(12); fill(200, a);
          const ageX = tyreX + TYRE_ICON + 6;
          drawTruncatedText(String(int(age)), ageX, rowCenter+1, Math.max(0, tyreW - (TYRE_ICON + 6)));
          pop();
        }
      }
    }

    // Flag (right)
    if (frozenDrivers.has(driverKey) && flagImg) {
      push(); imageMode(CORNER); tint(255, a);
      const fw = 18, fh = 18;
      image(flagImg, flagX + (flagW - fw)/2, rowCenter - fh/2, fw, fh);
      noTint(); pop();
    }

    // track change of positions for badge
    const newPos=i+1;
    if(lastPositions[driverKey]!==undefined){
      const delta = lastPositions[driverKey] - newPos;
      if(delta!==0) positionChanges[driverKey]={delta,alpha:255,framesLeft:90};
    }
    lastPositions[driverKey]=newPos;
  }

  // Hover link to track + set/clear global hover for chart (non-sticky)
  if (inBoard) {
    if (boardHoverKey) {
      hoveredDriverGlobal = boardHoverKey;
      hoveredOrigin = 'BOARD';
    } else if (hoveredOrigin === 'BOARD') {
      // cursor inside board but not on any row => clear board-origin highlight
      hoveredDriverGlobal = null;
      hoveredOrigin = null;
    }

    if (boardHoverKey && viewMode === 'TRACK') {
      const sp = lastFrameScreenPos[boardHoverKey];
      if (sp) {
        const col = driverColors[boardHoverKey] || color(255);
        push(); noFill(); stroke(0,180); strokeWeight(HOVER_RING_WEIGHT+2);
        ellipse(sp.x, sp.y, CAR_DIAM+HOVER_RING_GAP*2, CAR_DIAM+HOVER_RING_GAP*2);
        stroke(col); strokeWeight(HOVER_RING_WEIGHT);
        ellipse(sp.x, sp.y, CAR_DIAM+HOVER_RING_GAP*2, CAR_DIAM+HOVER_RING_GAP*2); pop();
        const acr = driverAcronym[boardHoverKey]||boardHoverKey; drawTooltip(sp.x, sp.y, acr);
      }
    }
  } else if (hoveredOrigin === 'BOARD') {
    // cursor left the board entirely => clear board-origin highlight
    hoveredDriverGlobal = null;
    hoveredOrigin = null;
  }

  // Snapshot positions once per leader lap for chart
  let leaderDn = null;
  for (let i = 0; i < rows.length; i++){
    const dn = rows[i].driver_number;
    if (dn){ leaderDn = dn; break; }
  }
  if (leaderDn){
    const leaderLap = numericLap((lapCounts[leaderDn]||0), PIT_START_DRIVERS.has(leaderDn));
    if (baselinedAtGreen && leaderLap > 0 && leaderLap !== lastRecordedLap){
      const snap = {};
      for (let i = 0; i < rows.length; i++){
        const dn = rows[i].driver_number;
        snap[dn] = i + 1; // 1..N
      }
      positionsByLap[leaderLap] = snap;
      lastRecordedLap = leaderLap;
    }
  }
}
// #endregion

// #region drawPositionsChart (with snap-to-lap + non-sticky highlight)
function drawPositionsChart(){
  chartHover = null; // reset each frame

  // Margins and plot rect (top margin leaves space for speed controls)
  const M = { left: 50, right: 120, top: 110, bottom: 40 };
  const px0 = 0 + M.left, px1 = TRACK_VP.w - M.right;
  const py0 = 0 + M.top,  py1 = TRACK_VP.h - M.bottom;

  // Determine lap domain
  const laps = Object.keys(positionsByLap).map(n=>int(n)).sort((a,b)=>a-b);
  const maxLapRecorded = laps.length ? laps[laps.length-1] : 0;
  const maxLap = Math.max(1, maxLapRecorded);
  const xForLap = (lap) => map(lap, 1, Math.max(1,maxLap), px0, px1);

  // Determine y (positions 1..N). Invert so 1 is at the top.
  const driverCount = Math.max(1, (revealedDrivers.size || DRIVER_NUMS.length));
  const yForPos = (pos) => map(pos, 1, driverCount, py0, py1);

  // Axes
  push();
  stroke(180); strokeWeight(1);
  line(px0, py1, px1, py1); // x-axis
  line(px0, py0, px0, py1); // y-axis

  // x ticks
  textSize(11); fill(200); noStroke();
  const step = (maxLap >= 50) ? 10 : (maxLap >= 25 ? 5 : 1);
  for (let l = 1; l <= maxLap; l += step){
    const x = xForLap(l);
    stroke(60); line(x, py1, x, py1+6);
    noStroke(); textAlign(CENTER, TOP); text(l, x, py1+8);
  }
  // y ticks
  const yStep = (driverCount > 12) ? 2 : 1;
  for (let p = 1; p <= driverCount; p += yStep){
    const y = yForPos(p);
    stroke(40); line(px0-6, y, px0, y);
    noStroke(); textAlign(RIGHT, CENTER); text(p, px0-8, y);
  }
  pop();

  // Grid
  push(); stroke(30);
  for (let p = 1; p <= driverCount; p += yStep){
    const y = yForPos(p);
    line(px0, y, px1, y);
  }
  pop();

  // Driver set
  const drivers = DRIVER_NUMS.map(n=>String(n)).filter(dn => revealedDrivers.has(dn));

  // Hover / Snap
  const mx = mouseX - TRACK_VP.x;
  const my = mouseY - TRACK_VP.y;
  const withinPlot = (mx >= px0 && mx <= px1 && my >= py0 && my <= py1);
  const POINT_R = 14;
  const SNAP_Y_TOL = 16;

  let best = { d2: 1e12, dn: null, lap: null, pos: null, x: 0, y: 0 };
  let snapLap = null, snapX = null;

  if (withinPlot) {
    // direct hit
    const lapsSorted = laps;
    for (let li = 0; li < lapsSorted.length; li++){
      const lap = lapsSorted[li];
      const snap = positionsByLap[lap];
      if (!snap) continue;
      const x = xForLap(lap);
      for (let di = 0; di < drivers.length; di++){
        const dn = drivers[di];
        const pos = snap[dn];
        if (!pos) continue;
        const y = yForPos(pos);
        const dx = mx - x, dy = my - y;
        const d2 = dx*dx + dy*dy;
        if (d2 < best.d2 && d2 <= POINT_R*POINT_R){
          best = { d2, dn, lap, pos, x, y };
        }
      }
    }
    // snap to nearest lap if none
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

  // Non-sticky highlight logic
  if (withinPlot) {
    if (best.dn) {
      chartHover = best;
      hoveredDriverGlobal = chartHover.dn;
      hoveredOrigin = 'CHART';
    } else {
      chartHover = null;
      if (hoveredOrigin === 'CHART') {
        hoveredDriverGlobal = null;
        hoveredOrigin = null;
      }
    }
  } else {
    chartHover = null;
    if (hoveredOrigin === 'CHART') {
      hoveredDriverGlobal = null;
      hoveredOrigin = null;
    }
  }

  const isSel = (dn) => (selectedDriver !== null && String(selectedDriver) === dn);
  const strong = (dn) => (hoveredDriverGlobal && String(hoveredDriverGlobal)===dn) || isSel(dn);
  const lineAlpha = (dn) => strong(dn) ? 255 : 130;
  const lineThick = (dn) => strong(dn) ? 3 : 1.5;

  const lastPointPos = {};

  drivers.forEach(dn=>{
    const col = driverColors[dn] || color(180);
    const pts = [];
    for (let li = 0; li < laps.length; li++){
      const lap = laps[li];
      const snap = positionsByLap[lap];
      if (!snap) continue;
      const pos = snap[dn];
      if (pos){
        pts.push({ x: xForLap(lap), y: yForPos(pos) });
      }
    }
    if (pts.length < 2) return;

    push();
    noFill(); const c = color(col); c.setAlpha(lineAlpha(dn));
    stroke(c); strokeWeight(lineThick(dn));
    beginShape(); pts.forEach(p=>vertex(p.x,p.y)); endShape();
    pop();

    lastPointPos[dn] = pts[pts.length-1];
  });

  // labels
  drivers.forEach(dn=>{
    const lp = lastPointPos[dn];
    if(!lp) return;
    const acr = driverAcronym[dn] || dn;
    const col = driverColors[dn] || color(220);
    const a = strong(dn) ? 255 : 180;
    push(); const c = color(col); c.setAlpha(a);
    fill(c); noStroke(); textSize(12); textAlign(LEFT, CENTER); text(acr, lp.x + 6, lp.y); pop();
  });

  // Title
  push(); fill(220); textSize(16); textAlign(LEFT,TOP);
  text('Position Changes by Lap', px0, py0 - 28); pop();

  // hover overlay
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
    push(); stroke(60); strokeWeight(1); line(snapX, py0, snapX, py1); pop();
  }
}
// #endregion

// #region Interaction
function mousePressed(){
  // Track controls
  if(pointInRect(mouseX,mouseY,UI_BTN.play)) { isPlaying = !isPlaying; return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.s1))  { playbackSpeed=1;  speedIndex=SPEED_PRESETS.indexOf(1);  return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.s5))  { playbackSpeed=5;  speedIndex=SPEED_PRESETS.indexOf(5);  return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.s10)) { playbackSpeed=10; speedIndex=SPEED_PRESETS.indexOf(10); return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.s20)) { playbackSpeed=20; speedIndex=SPEED_PRESETS.indexOf(20); return; }

  // Chart toggle with crossfade
  if (pointInRect(mouseX, mouseY, UI_BTN.chart)) {
    if (!viewSwitch.active) {
      viewSwitch = {
        active: true,
        from: viewMode,
        to: (viewMode === 'CHART' ? 'TRACK' : 'CHART'),
        t: 0,
        dur: 0.45,      // seconds; tweak for faster/slower fade
        switched: false
      };
    }
    return;
  }

  // Header toggles in leaderboard
  if(pointInRect(mouseX,mouseY,UI_BTN.gapL))  { gapMode='LEADER'; return; }
  if(pointInRect(mouseX,mouseY,UI_BTN.gapA))  { gapMode='AHEAD';  return; }
  if(UI_BTN.tyreHide && pointInRect(mouseX,mouseY,UI_BTN.tyreHide)) { showTyre = false; return; }
  if(UI_BTN.tyreShow && pointInRect(mouseX,mouseY,UI_BTN.tyreShow)) { showTyre = true;  return; }

  // Click on chart point selects driver
  if (viewMode === 'CHART' && chartHover && chartHover.dn) {
    selectedDriver = int(chartHover.dn);
    return;
  }

  // Click car on track
  if (viewMode==='TRACK'){
    let best=null, bestDist=Infinity;
    Object.keys(lastFrameScreenPos).forEach(k=>{
      const sp=lastFrameScreenPos[k]; const d=dist(mouseX,mouseY,sp.x,sp.y);
      if(d<=HOVER_RADIUS && d<bestDist){ bestDist=d; best=int(k); }
    });
    if(best!==null){ selectedDriver=best; return; }
  }

  // Click row in board
  const inBoard = mouseX>=BOARD_VP.x && mouseX<=BOARD_VP.x+BOARD_VP.w && mouseY>=BOARD_VP.y && mouseY<=BOARD_VP.h;
  if(inBoard){
    let bestDriver=null, bestDY=Infinity;
    Object.keys(driverY).forEach(k=>{
      const centerY = driverY[k];
      const top = centerY - BOARD_ROW_H/2;
      const bottom = centerY + BOARD_ROW_H/2;
      const dy=(mouseY<top)?(top-mouseY):(mouseY>bottom)?(mouseY-bottom):0;
      if(dy<bestDY && dy<BOARD_ROW_H*0.75){ bestDY=dy; bestDriver=int(k); }
    });
    if(bestDriver!==null){ selectedDriver=bestDriver; return; }
  }

  selectedDriver=null;
}
// #endregion

// #region Keyboard Shortcuts
function keyPressed(){
  if (keyCode === 32) { // Space
    isPlaying = !isPlaying;
    return false; // prevent browser scroll
  }
}
// #endregion
