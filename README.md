# 🏎️ F1 Race Replay  

Ever watched a Formula 1 race and wished you could replay the action, break down strategy, and study every gap and pit stop in detail?
With this project, you can.

The F1 Race Visualizer is an interactive tool built with p5.js that turns raw race data into an immersive experience. It features:

A track replay that shows cars battling in real time

A dynamic leaderboard with gaps, tyre data, and pit/retirement markers

A positions-over-time chart to explore how the race unfolded lap by lap

First created for the Austrian Grand Prix 2024, the visualizer works with any race—just supply the right CSV data.
---

## ✨ Features

### 🔄 Track Replay
- Animated cars using positional telemetry  
- Pit-entry detection with overlay  
- Smooth car motion and hover tooltips  

### 📊 Dynamic Leaderboard
- Excel-like auto-sized columns  
- Real-time gaps: *Leader* or *Ahead*  
- PIT and DNF overlays  
- Chequered flag freeze at final lap  
- Tyre column with icons + tyre age counter *(toggle Show / Hide)*  

### 🎮 Playback Controls
- Play / Pause (button or Spacebar)  
- Speed presets: **1x, 5x, 10x, 20x**  
- Gap mode toggle: *Leader ↔ Ahead*  

### 📈 Positions Chart
- Positions vs Lap graph with snap-to-lap hover  
- Linked highlighting between **Track ↔ Leaderboard ↔ Chart**  
- Smooth crossfade transition between views  

### 🎨 UI & Branding
- Title + F1 logo  
- Info row: *Time · Speed · Lap counter*  
- Team logos & colours  
- Tyre icons (Soft / Medium / Hard)  

---

## 📂 Data & Assets

The visualization requires the following files:  

- `source/drivers.csv` → driver metadata *(driver_number, team_name, team_colour, name_acronym)*  
- `source/location_driver_{n}.csv` → positional telemetry per driver  
- `source/position.csv` → absolute timestamp table  
- `source/stints.csv` → tyre stints *(driver_number, lap_start, lap_end, compound, tyre_age_at_start)*  
- `source/logo/{team}.png` → team logos *(recommended: white versions)*  
- `source/tyre/{soft_tyre|medium_tyre|hard_tyre}.png` → tyre icons  
- `source/F1tm/F1tm.png` → F1 logo  
- `source/chequered_flag.png` → chequered flag overlay  

---

## ⌨️ Controls
- **Play / Pause** → Button or Spacebar  
- **Speed presets** → 1x, 5x, 10x, 20x  
- **Gap mode** → Leader / Ahead *(toggle in leaderboard header)*  
- **Tyre display** → Hide / Show *(toggle in leaderboard header)*  
- **Switch view** → Chart button *(crossfade Track ↔ Chart)*  

---

## 🖱️ Click Interactions
- Car on track → Select driver  
- Row in leaderboard → Select driver  
- Point on chart → Select driver  

---

## 🏁 Race Logic
- Formation lap visible before Green flag  
- Gaps calculated only after Green *(at minisectors)*  
- Pit-entry detection via hidden gate *(overlay only)*  
- DNF drivers remain frozen in classification  
- **Lap 72 → leaderboard freezes with 🏁 chequered flag**  

---

## 📸 Preview

### Leaderboard
At the core is a dynamic leaderboard that updates lap by lap. Every pit stop, tyre change, and fight for position becomes immediately visible, making the strategic side of racing easy to follow and understand.

<img width="615" height="367" alt="Leaderboard" src="https://github.com/user-attachments/assets/66a4e650-549c-4075-81c9-f9bd5ef8c6d1" />

### Race Track
Complementing this is an animated track map that shows every car circulating the circuit, reconstructed from real GPS and timing data. Viewers can watch overtakes and pit lane entries unfold in real time, gaining an intuitive sense of how the race develops.

<img width="802" height="513" alt="Track" src="https://github.com/user-attachments/assets/0963238c-12fa-4a11-bb97-df3813fdee82" />

### Timeline
To capture the bigger picture, the system also creates a complete race timeline, tracking position changes across every lap. This history view allows the entire Grand Prix to be replayed and analyzed, highlighting decisive moments and turning points that shaped the final result.

<img width="557" height="437" alt="Timeline" src="https://github.com/user-attachments/assets/01e18a5f-ec7b-4538-bf17-829b54cf5235" />  

---

## 🛠️ Tech Stack
- **p5.js** → rendering & animation  
- **CSV data files** → driver info, positions, stints  
- **Vanilla JavaScript** → race logic & interactions  

---

## 🚀 Roadmap / Ideas
- Sector / lap time comparison table  
- Multi-race support *(select Grand Prix)*  
- Live data feed *(instead of static CSV)*  
- Mobile-friendly layout  

---

## 📜 License
Licensed under the **MIT License**.  
All F1 logos, trademarks, and brand assets belong to their respective owners.  
