# 🏁 F1 Race Replay


Ever watched a Formula 1 race and wished you could **replay the action, break down strategy, and study every gap and pit stop in detail**?  
With this project, you can.  

The **F1 Race Visualizer** is an interactive tool built with **p5.js** that turns raw race data into an immersive experience. It features:  

- 🏎️ **Track replay** that shows cars battling in real time  
- 📊 **Dynamic leaderboard** with gaps, tyre data, and pit/retirement markers  
- ⏱️ **Positions-over-time chart** to explore how the race unfolded lap by lap  

Created for the **Austrian Grand Prix 2024**


## 📖 README Structure

## 📖 README Structure

- ✨ Features  
- 📂 Source  
- 📑 Data format  
- 🛠️ Installation & Start  
- 🎮 Controls  
- 📌 Roadmap  
- ⚠️ Limitations  
- 📸 Screenshots  
- 🙏 Credits / Acknowledgments  



<br><br>


## ✨ Features

- 🏆 **Dynamic leaderboard**
  - 📋 Live positions  
  - ↕️ Position-change with smooth animations  
  - ⏱️ Gap display (to **Leader** or **Car Ahead**)  
  - 🛞 Tyre info: compound (🔴 Soft / 🟡 Medium / ⚪ Hard) and tyre age  
  - 🅿️ Pit stop (PIT) and 💥 DNF indicators  
  - 🏁 Freeze final order at race end  

- 🔀 **Dual views**
  - 🏎️ **Track View**: Cars battling on the circuit in real time  
  - 📊 **Chart View**: Position changes over the race lap by lap  

- 🎨 **Visual polish**
  - 🎨 Team colors & logos  
  - 🖱️ Hover tooltips and 👆 click-to-select drivers, synced across all views  
  - 🔤 Official F1-style fonts & themed backgrounds
 
- 🎬 **Interactive playback**
  - ▶️ / ⏸️ Play & Pause toggle  
  - ⏩ Speed presets: 1x, 2x, 5x, 10x, 20x  


<br><br>


## 📂 Source

🌐 **Data source:** [openf1.org](https://openf1.org/)  

OpenF1 is an open-source API that provides both **real-time** and **historical Formula 1 data**.  

- 📂 Historical data is freely accessible and requires **no authentication**.  
- ⚡ Real-time data requires a **paid account** (apply via form on the website).  

For this project, the CSV files were generated using the notebook `f1_api.ipynb`, which connects to the OpenF1 API and exports the relevant race data step by step into CSV format.  
👉 OpenF1 also provides many more endpoints with great potential (e.g. **car data**, **weather**, **team radio**) that are not used in this project.  

All required data and assets are stored in the `source/` folder:

- 🏎️ **Drivers**
  - `drivers.csv` → driver number, team, colors, acronym
    
  - - ⏱️ **Race data**
  - `stints.csv` → tyre stints per driver (lap start, lap end, compound, tyre age)  
  - `location_driver_{n}.csv` → x/y coordinates for each driver on track
 
 - 🖼️ **Assets**
  - `logo/` → team logos  
  - `tyre/` → tyre icons
  - `background/` → track background images  
  - `fonts/` → F1-style fonts  
  - `f1tm/` → official F1 logo


<br><br>


## 📑 Data format


### 🏎️ `drivers.csv`
Basic driver and team information.  

| driver_number | team_name | team_colour | name_acronym |
|---------------|-----------|-------------|--------------|
| 1             | Red Bull  | #3671C6     | VER          |
| 16            | Ferrari   | #E8002D     | LEC          |


### 📍 `location_driver_{n}.csv`
One file per driver (`n` = driver number).  
Contains the car’s position on track over time.  

| date                | x     | y     |
|---------------------|-------|-------|
| 2024-06-30 14:01:23 | 123.4 | 567.8 |
| 2024-06-30 14:01:25 | 125.1 | 564.2 |


### ⏱️ `stints.csv`
Tyre stints per driver.  

| driver_number | lap_start | lap_end | compound | tyre_age_at_start |
|---------------|-----------|---------|----------|-------------------|
| 1             | 1         | 18      | SOFT     | 0                 |
| 1             | 19        | 42      | HARD     | 0                 |


<br><br>


## 🛠️ Installation & Start

### 📥 **Clone or download** this repository

### 📂 Check data & assets
Make sure the source/ folder contains all required CSV files and assets (see Source).

### 🔗 Use for direct watch
statics.teams.cdn.office.net/evergreen-assets/safelinks/2/atp-safelinks.html


<br><br>


## 🎮 Controls

### ⌨️ Keyboard
- **Spacebar** → ▶️ / ⏸️ Play & Pause  

### 🖱️ Mouse
- **Hover** over car or leaderboard entry → highlight driver across all views  
- **Click** on car or leaderboard entry → select driver (keeps highlight)  

### 🔘 UI Buttons
- ▶️ / ⏸️ Play & Pause toggle  
- ⏩ Speed presets: 1x · 2x · 5x · 10x · 20x  
- 🔀 Switch between **Track View** and **Chart View**  
- ⏱️ Toggle gap display (Leader vs Car Ahead)  
- 🛞 Show / hide tyre info  


<br><br>


## 📌 Roadmap

- 🖥️ **Fullscreen & responsive design** → optimized for all devices  
- 📜 **Timeline slider** → scrollable lap navigation (forward & backward)  
- 🏁 **Start grid presentation** → with driver images  
- 🏆 **Race result presentation** → with driver images  
- ⏱️ **Lap timing charts** → compare drivers by fastest laps and sector times  
- 🏎️ **Driver details** → car telemetry such as throttle, speed, gear, brake usage  
- 🚩 **Race control hints** → blue flag, yellow flag, red flag events  
- 🌦️ **Weather integration** → show track conditions (rain, temperature, wind)  
- 📻 **Team radio** → display or play selected radio messages  
- 🖼️ **Enhanced visuals** → dynamic camera angles, maybe even 3D  
- 🗂️ **Multiple race support** → see chapter limitaions


<br><br>


## ⚠️ Limitations

Currently, the visualizer is tailored to the **Austrian Grand Prix 2024**.  
Several parts of the code contain hardcoded values and workarounds that prevent simply switching to another race:

🏁 **Race start & finish hardcoded**
```
const START_FINISH_TIMESTAMP = "2024-06-30T13:03:03.203000+00:00";
const FINAL_LAP = 72;
```
→ Start time and final lap count are fixed for Austria 2024.

⏱️ **Minisectors with static timestamps**
```
const MINISECTOR_TS = [
  "2024-06-30T13:00:15.684000+00:00",
  ...
];
```
→ Detection gates are specific to Austrian Grand Prix and not calculated dynamically.

🛑 **Pit entry workaround**
```
const PIT_ENTRY_TIMESTAMP = "2024-06-30T13:04:15.823000+00:00";
const PIT_END_TIMESTAMP   = "2024-06-30T13:05:20+00:00";
```
→ Pit detection relies on manual timestamps (based on driver 16).

💥 **DNF events hardcoded**
```
const DNF_EVENTS = [{ dn: '4', timestamp: "2024-06-30T14:20:10.005000+00:00" }];
```
→ Retirements must be entered manually.

🎨 **Title locked**
```
const TITLE_TEXT = 'Austrian Grand Prix 2024';
```
→ Needs to be updated manually for each race.


<br><br>


## 📸 Screenshots 


### 🏎️ Track replay

<img width="246" height="640" alt="leaderboard_no_bg (3)" src="https://github.com/user-attachments/assets/0eb29502-217d-4a3c-a9ba-e1b640fe66c2" />

<br><br>

### 📊 Dynamic leaderboard

<img width="992" height="637" alt="track_no_background" src="https://github.com/user-attachments/assets/26125640-9afc-47f6-a961-c164924fac0c" />

<br><br>


### ⏱️ Positions-over-time chart

<img width="901" height="702" alt="93ecbf7e-b92a-466a-9a13-8639cfa99758_transparent" src="https://github.com/user-attachments/assets/784faef7-156b-4388-afeb-5c324bcb4103" />

<br><br>



<br><br>


## 🙏 Credits

- 🌐 Thanks to [OpenF1](https://openf1.org/) for providing the API and making real Formula 1 data accessible.  
- 🖼️ Team logos, fonts, and the official F1™ logo are used for illustrative purposes only.  

⚠️ **Disclaimer:**  
This project is a fan-made visualization. It is **not affiliated with, endorsed by, or associated with Formula 1**, the FIA, or any related organizations.  
All trademarks, logos, and brand names are the property of their respective owners.



