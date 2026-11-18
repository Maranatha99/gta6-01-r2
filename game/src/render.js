// Everything the player sees: the city from above (water, sand, roads, buildings with long
// sunset shadows, trees and palms), the cars and people in it, the waypoint beacon, and the
// HUD — cash, wanted stars, mission objective, speed and a live minimap — plus the title,
// pause, busted and story-complete screens.
import { BEACH, FONT, PALETTE, ROAD_HALF, STREETS_X, STREETS_Y, WALK_HALF, WORLD } from './config.js';
import { PARK } from './city.js';
import { MISSION_NAMES } from './missions.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_BUSTED = 3;
export const SCREEN_DONE = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** One car, drawn top-down: body, roof, windshield, wheels, headlights and taillights. */
function drawCar(ctx, x, y, angle, colour, options) {
  const opts = options || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  roundRect(ctx, -26 + 4, -12 + 5, 52, 24, 7);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#16181d';
  ctx.fillRect(-19, -14, 11, 5);
  ctx.fillRect(-19, 9, 11, 5);
  ctx.fillRect(9, -14, 11, 5);
  ctx.fillRect(9, 9, 11, 5);
  // Body.
  ctx.fillStyle = colour;
  roundRect(ctx, -27, -13, 54, 26, 8);
  ctx.fill();
  // Roof and glass.
  ctx.fillStyle = 'rgba(20, 24, 34, 0.85)';
  roundRect(ctx, -8, -10, 18, 20, 4);
  ctx.fill();
  ctx.fillStyle = PALETTE.glass;
  ctx.fillRect(8, -9, 7, 18);
  ctx.fillRect(-20, -9, 5, 18);
  // Headlights and taillights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(25, -10, 3, 5);
  ctx.fillRect(25, 5, 3, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-28, -10, 3, 5);
  ctx.fillRect(-28, 5, 3, 5);
  if (opts.police) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
    const flash = Math.floor(opts.light * 2) % 2 === 0;
    ctx.fillStyle = flash ? PALETTE.copLightRed : PALETTE.copLightBlue;
    ctx.beginPath();
    ctx.arc(-2, -8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? PALETTE.copLightBlue : PALETTE.copLightRed;
    ctx.beginPath();
    ctx.arc(-2, 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.damaged) {
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, -12);
    ctx.lineTo(26, 0);
    ctx.lineTo(18, 12);
    ctx.stroke();
  }
  ctx.restore();
}

/** The player on foot: a little figure with a red shirt, seen from above. */
function drawPlayer(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  ctx.fillStyle = '#2b2f3a';
  ctx.fillRect(-6, -8, 12, 4);
  ctx.fillRect(-6, 4, 12, 4);
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c98a';
  ctx.beginPath();
  ctx.arc(4, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.down > 0) {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function drawGround(view) {
    const { x0, y0, x1, y1 } = view;
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Mow stripes for a little texture.
    ctx.fillStyle = PALETTE.grassDark;
    for (let y = Math.floor(y0 / 120) * 120; y < y1; y += 240) {
      ctx.fillRect(x0, y, x1 - x0, 120);
    }
    // Sea and sand on the west edge.
    if (x0 < BEACH.sandX) {
      const deepW = Math.max(0, Math.min(BEACH.waterX, x1) - x0);
      ctx.fillStyle = PALETTE.waterDeep;
      ctx.fillRect(x0, y0, deepW, y1 - y0);
      const shoreX = Math.max(x0, BEACH.waterX - 26);
      const shoreW = Math.max(0, Math.min(BEACH.waterX, x1) - shoreX);
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(shoreX, y0, shoreW, y1 - y0);
      const sandX = Math.max(x0, BEACH.waterX);
      const sandW = Math.max(0, Math.min(BEACH.sandX, x1) - sandX);
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(sandX, y0, sandW, y1 - y0);
      ctx.fillStyle = PALETTE.sandWet;
      ctx.fillRect(sandX, y0, Math.min(14, sandW), y1 - y0);
    }
    // Park.
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
    ctx.fillStyle = PALETTE.parkPath;
    ctx.fillRect(PARK.x + PARK.w / 2 - 10, PARK.y, 20, PARK.h);
    ctx.fillRect(PARK.x, PARK.y + PARK.h / 2 - 10, PARK.w, 20);
  }

  function drawRoads(view) {
    const { x0, y0, x1, y1 } = view;
    // Sidewalks first, asphalt on top, so every road has a pale border.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const sx of STREETS_X) ctx.fillRect(sx - WALK_HALF, Math.max(y0, 0), WALK_HALF * 2, Math.min(y1, WORLD.height) - Math.max(y0, 0));
    for (const sy of STREETS_Y) ctx.fillRect(Math.max(x0, 0), sy - WALK_HALF, Math.min(x1, WORLD.width) - Math.max(x0, 0), WALK_HALF * 2);
    ctx.fillStyle = PALETTE.road;
    for (const sx of STREETS_X) ctx.fillRect(sx - ROAD_HALF, Math.max(y0, 0), ROAD_HALF * 2, Math.min(y1, WORLD.height) - Math.max(y0, 0));
    for (const sy of STREETS_Y) ctx.fillRect(Math.max(x0, 0), sy - ROAD_HALF, Math.min(x1, WORLD.width) - Math.max(x0, 0), ROAD_HALF * 2);
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (const sx of STREETS_X) {
      if (sx < x0 - 10 || sx > x1 + 10) continue;
      for (let y = Math.floor(Math.max(y0, 0) / 56) * 56; y < Math.min(y1, WORLD.height); y += 56) {
        ctx.fillRect(sx - 2, y, 4, 28);
      }
    }
    for (const sy of STREETS_Y) {
      if (sy < y0 - 10 || sy > y1 + 10) continue;
      for (let x = Math.floor(Math.max(x0, 0) / 56) * 56; x < Math.min(x1, WORLD.width); x += 56) {
        ctx.fillRect(x, sy - 2, 28, 4);
      }
    }
  }

  function drawBuildings(view) {
    const { x0, y0, x1, y1 } = view;
    for (const b of view.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      // Long sunset shadow to the north-east.
      ctx.fillStyle = 'rgba(30, 20, 10, 0.28)';
      ctx.fillRect(b.x + b.height, b.y + b.height, b.w, b.h);
      ctx.fillStyle = PALETTE.buildingWall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.colour;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      // Roof details: a skylight and a vent.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(b.x + 12, b.y + 12, Math.min(26, b.w - 24), 10);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(b.x + b.w - 26, b.y + b.h - 22, 14, 14);
      if (b.label) {
        ctx.fillStyle = 'rgba(12, 16, 28, 0.75)';
        ctx.font = 'bold 13px ' + FONT;
        ctx.textAlign = 'center';
        const tw = ctx.measureText(b.label).width + 16;
        ctx.fillRect(b.x + b.w / 2 - tw / 2, b.y + b.h / 2 - 12, tw, 24);
        ctx.fillStyle = '#f5efe0';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5);
      }
    }
  }

  function drawNature(view) {
    const { x0, y0, x1, y1 } = view;
    for (const t of view.trees) {
      if (t.x < x0 - 30 || t.x > x1 + 30 || t.y < y0 - 30 || t.y > y1 + 30) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.beginPath();
      ctx.ellipse(t.x + 5, t.y + 6, t.r, t.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f7d33';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5da244';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of view.palms) {
      if (p.x < x0 - 30 || p.x > x1 + 30 || p.y < y0 - 30 || p.y > y1 + 30) continue;
      ctx.strokeStyle = '#8a6b45';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 4, p.y - 12);
      ctx.stroke();
      ctx.fillStyle = '#4d8a3f';
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(p.x + 4 + Math.cos(a) * 10, p.y - 12 + Math.sin(a) * 8, 10, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawWaypoint(state, now) {
    const obj = state.missions.current();
    if (!obj) return;
    const pulse = 1 + Math.sin(now / 240) * 0.12;
    // Beacon column.
    const grad = ctx.createLinearGradient(0, obj.y - 190, 0, obj.y);
    grad.addColorStop(0, 'rgba(255, 210, 63, 0)');
    grad.addColorStop(1, 'rgba(255, 210, 63, 0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(obj.x - 16, obj.y - 190, 32, 190);
    // Ring on the ground.
    const colour = obj.kind === 'escape' ? PALETTE.markerGreen : PALETTE.marker;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.radius * 0.55 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = obj.kind === 'escape' ? 'rgba(61, 220, 132, 0.25)' : 'rgba(255, 210, 63, 0.25)';
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.radius * 0.55 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Diamond marker floating above the point.
    const bob = Math.sin(now / 300) * 6;
    ctx.fillStyle = colour;
    ctx.save();
    ctx.translate(obj.x, obj.y - 52 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
  }

  function drawMinimap(state, vw) {
    const mw = 208;
    const mh = 150;
    const mx = vw - mw - 14;
    const my = 14;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.save();
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 239, 224, 0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 10);
    ctx.stroke();
    ctx.beginPath();
    roundRect(ctx, mx, my, mw, mh, 6);
    ctx.clip();
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(mx, my, BEACH.waterX * sx, mh);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(mx + BEACH.waterX * sx, my, (BEACH.sandX - BEACH.waterX) * sx, mh);
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(mx + PARK.x * sx, my + PARK.y * sy, PARK.w * sx, PARK.h * sy);
    ctx.strokeStyle = '#e8e4da';
    ctx.lineWidth = 2;
    for (const s of STREETS_X) {
      ctx.beginPath();
      ctx.moveTo(mx + s * sx, my);
      ctx.lineTo(mx + s * sx, my + mh);
      ctx.stroke();
    }
    for (const s of STREETS_Y) {
      ctx.beginPath();
      ctx.moveTo(mx, my + s * sy);
      ctx.lineTo(mx + mw, my + s * sy);
      ctx.stroke();
    }
    const obj = state.missions.current();
    if (obj) {
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(mx + obj.x * sx, my + obj.y * sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5c00';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const cop of state.entities.police) {
      if (!cop.active) continue;
      ctx.fillStyle = Math.floor(cop.light) % 2 === 0 ? PALETTE.copLightRed : PALETTE.copLightBlue;
      ctx.beginPath();
      ctx.arc(mx + cop.x * sx, my + cop.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(mx + state.player.x * sx, my + state.player.y * sy);
    ctx.rotate(state.player.angle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawHud(state, vw, vh) {
    // Cash, top left.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, 14, 14, 210, 64, 10);
    ctx.fill();
    ctx.fillStyle = '#3ddc84';
    ctx.font = 'bold 24px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('$' + state.money.toLocaleString('en-US'), 28, 44);
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.font = '13px ' + FONT;
    ctx.fillText('SOLMAR BAY', 28, 64);
    // Wanted stars, under the minimap.
    const mw = 208;
    const starY = 14 + 150 + 22;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, vw - mw - 20, starY, mw + 12, 40, 10);
    ctx.fill();
    ctx.font = '22px ' + FONT;
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < state.wanted ? PALETTE.star : PALETTE.starEmpty;
      ctx.fillText('★', vw - mw - 20 + 24 + i * 40, starY + 29);
    }
    ctx.textAlign = 'left';
    // Objective banner, top centre.
    const obj = state.missions.current();
    const missionLabel = state.missions.done
      ? 'FREE ROAM — Solmar Bay is yours'
      : 'MISSION ' + (state.missions.index + 1) + ' / ' + MISSION_NAMES.length + ' — ' + MISSION_NAMES[state.missions.index];
    const objText = obj ? obj.text : 'Explore the city. Grab cash bags, steal cars, dodge the law.';
    ctx.font = 'bold 15px ' + FONT;
    const bw = Math.min(vw - 480, Math.max(420, ctx.measureText(objText).width + 60));
    const bx = (vw - bw) / 2;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, bx, 14, bw, 58, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.marker;
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(missionLabel, bx + 16, 34);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '14px ' + FONT;
    ctx.fillText(objText, bx + 16, 56);
    // Brief / toast, centre.
    if (state.brief) {
      ctx.font = 'italic 15px ' + FONT;
      const tw = Math.min(vw - 120, ctx.measureText(state.brief.text).width + 40);
      ctx.fillStyle = 'rgba(12, 16, 28, 0.8)';
      roundRect(ctx, (vw - tw) / 2, vh - 150, tw, 40, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.hudText;
      ctx.textAlign = 'center';
      ctx.fillText(state.brief.text, vw / 2, vh - 124);
      ctx.textAlign = 'left';
    }
    if (state.toast) {
      ctx.font = 'bold 16px ' + FONT;
      const tw = ctx.measureText(state.toast.text).width + 40;
      ctx.fillStyle = 'rgba(12, 16, 28, 0.85)';
      roundRect(ctx, (vw - tw) / 2, 92, tw, 40, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.textAlign = 'center';
      ctx.fillText(state.toast.text, vw / 2, 118);
      ctx.textAlign = 'left';
    }
    // Speed and car health, bottom right — or the on-foot health bar.
    if (state.player.inCar) {
      const kmh = Math.round(Math.abs(state.car.speed) * 0.36);
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(ctx, vw - 170, vh - 84, 156, 70, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 30px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText(String(kmh), vw - 66, vh - 40);
      ctx.font = '13px ' + FONT;
      ctx.fillStyle = PALETTE.hudMuted;
      ctx.fillText('km/h', vw - 28, vh - 40);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(vw - 156, vh - 30, 128, 8);
      ctx.fillStyle = state.car.health > 35 ? '#3ddc84' : '#ff5a4e';
      ctx.fillRect(vw - 156, vh - 30, 128 * Math.max(0, state.car.health / 100), 8);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(ctx, 14, vh - 54, 210, 40, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.hudMuted;
      ctx.font = '12px ' + FONT;
      ctx.fillText('HEALTH', 28, vh - 32);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(28, vh - 26, 182, 8);
      ctx.fillStyle = state.player.health > 35 ? '#3ddc84' : '#ff5a4e';
      ctx.fillRect(28, vh - 26, 182 * Math.max(0, state.player.health / 100), 8);
    }
    // Controls hint, bottom left (fades after the first 20 seconds of play). On foot it
    // starts past the health panel so the two never overlap.
    if (state.time < 20) {
      ctx.fillStyle = 'rgba(12, 16, 28, 0.6)';
      ctx.font = '13px ' + FONT;
      ctx.fillText('WASD drive / walk   •   E enter & exit car   •   Space handbrake   •   P pause   •   M mute', state.player.inCar ? 16 : 240, vh - 14);
    }
    // Bust warning: a cop is on top of you on foot.
    if (state.bustTimer > 0.15) {
      ctx.fillStyle = 'rgba(255, 46, 46, ' + Math.min(0.5, state.bustTimer * 0.4) + ')';
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('THE COPS HAVE YOU — RUN!', vw / 2, vh / 2 - 120);
      ctx.textAlign = 'left';
    }
  }

  function drawWorld(state, now) {
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const camX = clamp(state.camera.x - vw / 2, 0, Math.max(0, WORLD.width - vw));
    const camY = clamp(state.camera.y - vh / 2, 0, Math.max(0, WORLD.height - vh));
    const view = {
      x0: camX - 60, y0: camY - 60, x1: camX + vw + 60, y1: camY + vh + 60,
      buildings: state.city.buildings, trees: state.city.trees, palms: state.city.palms,
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(-camX, -camY);
    drawGround(view);
    drawRoads(view);
    drawBuildings(view);
    drawNature(view);
    // Cash bags.
    for (const bag of state.cashBags) {
      if (bag.taken) continue;
      if (bag.x < view.x0 || bag.x > view.x1 || bag.y < view.y0 || bag.y > view.y1) continue;
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath();
      ctx.arc(bag.x, bag.y, 11 + Math.sin(now / 300) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c2b18';
      ctx.font = 'bold 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('$', bag.x, bag.y + 4);
      ctx.textAlign = 'left';
    }
    drawWaypoint(state, now);
    for (const p of state.parked) {
      if (!p.active) continue;
      drawCar(ctx, p.x, p.y, p.angle, p.colour, {});
    }
    for (const t of state.entities.traffic) {
      if (!t.active) continue;
      drawCar(ctx, t.x, t.y, t.angle, t.colour, {});
    }
    for (const cop of state.entities.police) {
      if (!cop.active) continue;
      drawCar(ctx, cop.x, cop.y, cop.angle, '#e8e4da', { police: true, light: cop.light });
    }
    if (state.car.active) {
      drawCar(ctx, state.car.x, state.car.y, state.car.angle, state.car.colour, { damaged: state.car.health < 60 });
    }
    for (const ped of state.entities.peds) {
      if (!ped.active) continue;
      drawPed(ctx, ped);
    }
    if (!state.player.inCar) drawPlayer(ctx, state.player.x, state.player.y, state.player.angle);
    // Particles.
    for (const p of state.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Off-screen waypoint arrow.
    const obj = state.missions.current();
    if (obj) {
      const sx = obj.x - camX;
      const sy = obj.y - camY;
      if (sx < 0 || sx > vw || sy < 0 || sy > vh) {
        const cx = clamp(sx, 40, vw - 40);
        const cy = clamp(sy, 90, vh - 40);
        const a = Math.atan2(sy - vh / 2, sx - vw / 2);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = PALETTE.marker;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = PALETTE.hudText;
        ctx.font = 'bold 12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(Math.hypot(obj.x - state.player.x, obj.y - state.player.y)) + 'm', cx, cy + 26);
        ctx.textAlign = 'left';
      }
    }
    drawMinimap(state, vw);
    drawHud(state, vw, vh);
  }

  function panel(title, lines, hint) {
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(10, 12, 22, 0.82)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 54px ' + FONT;
    ctx.fillText(title, vw / 2, vh / 2 - 110);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '17px ' + FONT;
    lines.forEach((line, i) => ctx.fillText(line, vw / 2, vh / 2 - 60 + i * 28));
    ctx.fillStyle = PALETTE.marker;
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillText(hint, vw / 2, vh / 2 + 60);
    ctx.textAlign = 'left';
  }

  function draw(state, screen, save) {
    const now = performance.now();
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_BUSTED || screen === SCREEN_DONE) {
      drawWorld(state, now);
    }
    if (screen === SCREEN_TITLE) {
      drawWorld(state, now);
      const vw = canvas.clientWidth;
      const vh = canvas.clientHeight;
      ctx.fillStyle = 'rgba(10, 12, 22, 0.55)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 64px ' + FONT;
      ctx.fillText('SOLMAR BAY', vw / 2, vh / 2 - 120);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '20px ' + FONT;
      ctx.fillText('An open-world crime story — drive, steal, run, and pull off the Big Score.', vw / 2, vh / 2 - 80);
      ctx.font = '16px ' + FONT;
      ctx.fillStyle = PALETTE.hudMuted;
      ctx.fillText('WASD move & drive  •  E enter / exit car  •  Space handbrake  •  P pause  •  M mute', vw / 2, vh / 2 - 40);
      ctx.fillText('Steal cars, dodge the police, finish all 4 missions. Cash bags hide around the city.', vw / 2, vh / 2 - 12);
      if (save && (save.money > 0 || save.missionIndex > 0 || save.done)) {
        ctx.fillStyle = PALETTE.marker;
        ctx.font = 'bold 17px ' + FONT;
        ctx.fillText('Saved game: $' + save.money.toLocaleString('en-US') + '  •  Mission ' + (save.done ? 'complete' : save.missionIndex + 1 + ' / 4'), vw / 2, vh / 2 + 30);
        ctx.fillStyle = PALETTE.hudText;
        ctx.font = 'bold 18px ' + FONT;
        ctx.fillText('Press ENTER to continue — or C for a new game', vw / 2, vh / 2 + 66);
      } else {
        ctx.fillStyle = PALETTE.marker;
        ctx.font = 'bold 18px ' + FONT;
        ctx.fillText('Press ENTER to start', vw / 2, vh / 2 + 66);
      }
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_PAUSED) {
      panel('PAUSED', ['Take a breath, Rico. The city waits.'], 'Press P or ENTER to keep playing');
    } else if (screen === SCREEN_BUSTED) {
      panel('BUSTED', ['The Solmar Bay police caught up with you.', 'Your mission restarts at the Safehouse — the cash stays yours.'], 'Press ENTER to try the mission again');
    } else if (screen === SCREEN_DONE) {
      panel('THE BIG SCORE', ['You did it, Rico. The bank, the chase, the getaway — all yours.', 'Solmar Bay is yours now. Keep driving, keep the cash coming.'], 'Press ENTER for free roam');
    }
  }

  return { draw, resize };
}
