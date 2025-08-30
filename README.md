🏎️ F1 Race Visualizer — Track + Leaderboard + Position Chart

An interactive p5.js visualization of Formula 1 race data with live leaderboard, gap calculations, tyre usage, and track replay.
Designed for the Austrian Grand Prix 2024, but reusable for any race with suitable CSV input.

✨ Features

Track replay

Cars animated around the circuit using positional telemetry

Pit-entry detection (with overlay)

Smooth car motion and hover tooltips

Dynamic Leaderboard

Excel-like auto-sized columns

Real-time positions with gap calculation (Leader vs Ahead)

PIT and DNF overlays

Chequered flag freeze at final lap

Tyre column with icons + age counter (toggle Show/Hide)

Race Playback Controls

Play / Pause (button or Spacebar)

Speed presets: 1x, 5x, 10x, 20x

Gap mode toggle: Leader / Ahead

Positions Chart

Positions vs Lap graph with snap-to-lap hover

Linked highlighting between track ↔ leaderboard ↔ chart

Smooth crossfade transition between Track and Chart

UI/Branding

Title + F1 logo

Info row with Time, Speed, Lap counter

Team logos & colours

Tyre icons (Soft / Medium / Hard)

📂 Data & Assets

The visualization reads data from CSV files and images:

source/drivers.csv — driver metadata (driver_number, team_name, team_colour, name_acronym)

source/location_driver_{n}.csv — positional telemetry per driver

source/position.csv — timing table for absolute timestamps

source/stints.csv — stint data (driver_number, lap_start, lap_end, compound, tyre_age_at_start)

source/logo/{team}.png — team logos (white versions recommended)

source/tyre/{soft_tyre|medium_tyre|hard_tyre}.png — tyre icons

source/F1tm/F1tm.png — F1 logo

source/chequered_flag.png — chequered flag overlay

▶️ How to Run

Clone this repository:

git clone https://github.com/yourusername/f1-race-visualizer.git
cd f1-race-visualizer


Serve the project locally (p5.js needs a local server):

npx http-server .


or open with VS Code Live Server.

Open in your browser:

http://localhost:8080

⌨️ Controls

Play / Pause → Button or Spacebar

Speed presets → 1x, 5x, 10x, 20x

Toggle gap mode → Leader / Ahead (in leaderboard header)

Toggle tyre display → Hide / Show (in leaderboard header)

Switch Track ↔ Chart → Chart button (crossfade animation)

Click interactions:

Car on track → Select driver

Row in leaderboard → Select driver

Point on chart → Select driver

🏁 Race Logic

Formation lap visible before Green flag

Gaps calculated only after Green (at minisectors)

Pit-entry detection via hidden gate (overlay only, no line)

Drivers marked DNF remain frozen on the board

At Lap 72 → positions freeze with 🏁 flag

📸 Preview

(Add a screenshot or GIF here — leaderboard + track + chart)

🛠️ Tech Stack

p5.js
 — rendering + animation

CSV data files for driver, position, stints

Custom rendering + interaction logic in pure JavaScript

🚀 Roadmap / Ideas

 Add sector/lap time comparison table

 Support multiple races (select GP)

 Live data feed instead of static CSV

 Mobile-friendly layout

📜 License

This project is licensed under the MIT License.
Logos, F1 trademarks, and brand assets belong to their respective owners.
