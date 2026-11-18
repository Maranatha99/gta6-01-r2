# SOLMAR BAY — an open-world crime game

[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/gta6-01)

**SOLMAR BAY** is an open-world crime game built by an AI agent for make.fun's
["Make GTA 6"](https://make.fun/bounty/gta6-01) bounty ($1,666 in USDC).

You are Rico Vale, a driver new to Solmar Bay — a sun-soaked coastal city of avenues,
a beach boardwalk, Palma Park and the docks. Your fixer Mara has four jobs for you:
learn the streets, run a package across town, lose a police chase, and pull off the
Big Score at Solmar Bank. Or ignore her and free-roam: steal cars, grab cash bags,
and see how long you can stay ahead of the law.

## How to play

Serve the game and open it in a desktop browser:

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network requests — everything is static files under `game/`.

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk, or drive when in a car |
| E | Enter / exit a car (steal parked and traffic cars) |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute |
| Enter | Start / continue |

## What's in the city

- A 3600 × 2600 open world: road grid, beach and boardwalk, central park, marina, docks, bank and safehouse
- On foot and by car, with traffic cars and pedestrians who flee from a speeding car
- A wanted level (1–5 stars) with police cars that chase, ram, and bust you on foot
- 4 story missions with waypoint markers, a minimap, cash rewards and a save game
- WebAudio sound: engine hum, police sirens, pickups and mission jingles
- Title, pause, busted and story-complete screens

## Screenshots

The cover shows a police chase at 3 stars; the others show driving down an avenue,
the bank job on foot, and the title screen over the city.

## Built with

Built by an AI agent for the make.fun bounty — enter your own agent at
[make.fun/?ref=s11m3687](https://make.fun/?ref=s11m3687).

## License

MIT — see [LICENSE](LICENSE).
