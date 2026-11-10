// ASTRO ACE No.1: a run-and-gun inside comic panels.
// Mode 0. BG0 = page frame (gutters, captions), BG1 = playfield, BG2/BG3 = parallax.
#include "gen/gfx.h"
typedef unsigned char u8; typedef unsigned short u16; typedef unsigned int u32;
typedef signed char s8; typedef signed short s16; typedef signed int s32;
#define REG16(a) (*(volatile u16*)(a))
#define DISPCNT  REG16(0x04000000)
#define DISPSTAT REG16(0x04000004)
#define BGCNT(n) REG16(0x04000008 + 2 * (n))
#define BGHOFS(n) REG16(0x04000010 + 4 * (n))
#define BGVOFS(n) REG16(0x04000012 + 4 * (n))
#define BLDCNT   REG16(0x04000050)
#define BLDY     REG16(0x04000054)
#define KEYS     REG16(0x04000130)
#define IE       REG16(0x04000200)
#define IME      REG16(0x04000208)
#define SB(n)    ((u16*)(0x06000000 + (n) * 0x800))
#define BGPAL    ((u16*)0x05000000)
#define OBJPAL   ((u16*)0x05000200)
#define OAM      ((u16*)0x07000000)
enum { K_A = 1, K_B = 2, K_SEL = 4, K_START = 8, K_RIGHT = 16, K_LEFT = 32, K_UP = 64, K_DOWN = 128, K_R = 256, K_L = 512 };
#define FX(v) ((v) << 8)
#define GRAV 0x38

static inline void vsync(void) { __asm__ volatile("swi 0x05" ::: "r0", "r1", "r2", "r3"); }
static void copy16(u16* d, const u16* s, int n) { while (n--) *d++ = *s++; }
static void copy32(u32* d, const u32* s, int n) { while (n--) *d++ = *s++; }
static u32 seed = 12345;
static int rnd(void) { seed = seed * 1664525u + 1013904223u; return (seed >> 16) & 0x7FFF; }
static int iabs(int v) { return v < 0 ? -v : v; }

// ---------------------------------------------------------------- sprites
// A drawn frame is a metasprite: a list of hardware OBJs pinned to an anchor
// pixel (cut by studio/cutter.py). Lower OAM index = drawn in front.
#define OBJ_TILE(n) ((u32*)(0x06010000 + (n) * 32))
static u16 oam[128 * 4];
static int oam_n;
// flip: bit0 horizontal, bit1 vertical (about the anchor pixel). prio 0 draws over the page frame.
static void ms_draw(const Ms* m, int x, int y, int flip, int pal, int prio, int base) {
	for (int i = 0; i < m->n; i++) {
		const MsObj* o = &m->o[i];
		int k = o->tk >> 12, w = k_w[k], hh = k_h[k];
		int ox = (flip & 1) ? x - o->dx - w + 1 : x + o->dx;
		int oy = (flip & 2) ? y - o->dy - hh + 1 : y + o->dy;
		if (oam_n >= 128) return;
		if (ox <= -w || ox >= 240 || oy <= -hh || oy >= 160) continue;
		u16* a = &oam[oam_n++ * 4];
		a[0] = (oy & 0xFF) | k_attr0[k];
		a[1] = (ox & 0x1FF) | k_attr1[k] | (flip << 12);
		a[2] = ((o->tk & 0x3FF) + base) | (prio << 10) | (pal << 12);
	}
}
#define SIN(a) (sin_lut[(a) & 255])
#define COS(a) (sin_lut[((a) + 64) & 255])
// One 64x32 OBJ turned by hardware about a pivot: (px,py) = pivot on screen,
// (cx,cy) = the OBJ centre relative to the pivot in the unrotated drawing.
static void obj_rot(int px, int py, int cx, int cy, int ang, int tile, int pal, int prio) {
	int c = COS(ang), sn = SIN(ang);
	int x = px + ((c * cx - sn * cy) >> 8) - 64, y = py + ((sn * cx + c * cy) >> 8) - 32;
	if (oam_n >= 128 || x <= -128 || x >= 240 || y <= -64 || y >= 160) return;
	u16* a = &oam[oam_n++ * 4];
	a[0] = (y & 0xFF) | 0x4000 | 0x0300;                     // wide, affine, double size
	a[1] = (x & 0x1FF) | 0xC000;                             // 64x32, matrix 0
	a[2] = tile | (prio << 10) | (pal << 12);
	oam[3] = c; oam[7] = sn; oam[11] = -sn; oam[15] = c;     // screen -> texture
}
// Streaming: the hero has far more frames than fit in OBJ VRAM, so only the
// frames on screen are loaded, into two fixed slots, during vertical blank.
static struct { const u32* src; u16 slot, n; } pend[4];
static int npend, cur_top = -1, cur_legs = -1;
static void stream(int* cur, int id, int slot, const Ms* m, const u32* blob) {
	if (*cur == id || npend >= 4) return;
	*cur = id;
	pend[npend].src = blob + m->toff * 8; pend[npend].slot = slot; pend[npend].n = m->ntiles * 8; npend++;
}
static void oam_flush(void) {
	for (int i = oam_n; i < 128; i++) oam[i * 4] = 0x0200;
	copy16(OAM, oam, 128 * 4);
	oam_n = 0;
	for (int i = 0; i < npend; i++) copy32(OBJ_TILE(pend[i].slot), pend[i].src, pend[i].n);
	npend = 0;
}

// ---------------------------------------------------------------- state
enum { W_PEA, W_SPREAD, W_MACHINE, W_LASER };
typedef struct { s32 x, y, vx, vy; int face, ground, tick, inv, cool, flash, aim, crouch, dead, dt, hide, mounted, run; } Hero;
typedef struct { s32 x, y, vx; int on, hp, face, cd; } Sled;
typedef struct { s32 x, y, vx, vy; u8 on, type; } Shot;
typedef struct { s32 x, y, vx, vy; u8 on, grav; } EBul;
typedef struct { u8 type, flash, st, arg; s8 dir; s16 hp, t, bx, by; s32 x, y, vx, vy; } Enemy;
typedef struct { s16 x, y, t; u8 on, type; } Fx;
#define NSHOT 14
#define NEBUL 16
#define NENEMY 20
#define NFX 12
static Hero h;
static Sled sled;
static Shot shots[NSHOT];
static EBul ebul[NEBUL];
static Enemy en[NENEMY];
static Fx fxs[NFX];
static const Room* rm;
static int room_id, cam, keys, prev, lives, weapon, fade, shake, boss_dead, spawn_t, frame;
static int peace, loadout = W_SPREAD, step_i, step_t, restart;
static s32 safe_x, safe_y;
static u32 spawned;

// The Guardian is a set of parts, each with its own hit points and state.
typedef struct { s16 hp; u8 flash, dead; } BPart;
enum { BP_CANNON, BP_RACK, BP_DISH, BP_PLATE, BP_CLAW_L, BP_CLAW_R, BP_N };
static struct { BPart p[BP_N]; int ang, recoil, eye, rack_open, tread, flash, ox, oy, dir; } B;

static int tile_at(int px, int py) {
	if (py < 0) return 0;
	int tx = px >> 3, ty = py >> 3;
	if (ty >= 20) return 0;
	if (tx < 0 || tx >= 64) return 1;
	return rm->solid[ty * 64 + tx];
}
static int hard(int px, int py) { int t = tile_at(px, py); return t == 1 || t == 4; }
static int floorish(int px, int py) { int t = tile_at(px, py); return t == 1 || t == 2 || t == 4; }

// Moves a body (x = centre, y = feet). Returns bit0 = on ground, bit1 = hit a wall.
static int move_body(s32* x, s32* y, s32* vx, s32* vy, int hw, int hh, int oneway) {
	int r = 0;
	s32 nx = *x + *vx;
	int py = *y >> 8, e = (nx >> 8) + (*vx > 0 ? hw : -hw);
	if (*vx && (hard(e, py - 1) || hard(e, py - (hh >> 1)) || hard(e, py - hh + 1))) { nx = *x; r |= 2; }
	*x = nx;
	*vy += GRAV;
	if (*vy > 0x600) *vy = 0x600;
	s32 ny = *y + *vy;
	int px = nx >> 8, oy = *y >> 8, npy = ny >> 8;
	if (*vy >= 0) {
		for (int ty = oy >> 3; ty <= (npy >> 3); ty++) {
			int a = tile_at(px - hw + 1, ty * 8), b = tile_at(px + hw - 1, ty * 8);
			int hd = a == 1 || b == 1 || a == 4 || b == 4;
			int soft = oneway && (a == 2 || b == 2) && oy <= ty * 8;
			if ((hd || soft) && npy >= ty * 8) { ny = FX(ty * 8); *vy = 0; r |= 1; break; }
		}
	} else if (hard(px - hw + 1, npy - hh) || hard(px + hw - 1, npy - hh)) {
		ny = *y; *vy = 0;
	}
	*y = ny;
	return r;
}

// ---------------------------------------------------------------- captions
// A comic caption box drawn at runtime into reserved BG0 tiles, typed out
// letter by letter with a proportional font.
#define CAP_W 26
#define CAP_H 4
#define CAP_TILE 880
static int cap_on, cap_line, cap_pos, cap_x, cap_row = 2;
static const char* cap_lines[3];
static void cap_plot(int x, int y, int c) {
	u32* w = (u32*)(0x06000000 + (CAP_TILE + (y >> 3) * CAP_W + (x >> 3)) * 32 + (y & 7) * 4);
	int sh = (x & 7) * 4;
	*w = (*w & ~(15u << sh)) | ((u32)c << sh);
}
static void cap_open(const char* a, const char* b, const char* c) {
	int W = CAP_W * 8, H = CAP_H * 8;
	for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
		int col = 3;                                                   // caption yellow
		if (x >= W - 2 || y >= H - 2) col = (x < 2 || y < 2) ? 0 : 2;  // ink drop shadow
		else if (x == 0 || y == 0 || x == W - 3 || y == H - 3) col = 2;
		else if (y >= H - 5) col = 4;
		cap_plot(x, y, col);
	}
	cam &= ~7;
	int tx = (cam >> 3) + 2;
	for (int r = 0; r < CAP_H; r++) for (int i = 0; i < CAP_W; i++) {
		int col = (tx + i) & 63;
		SB(26 + (col >> 5))[(cap_row + r) * 32 + (col & 31)] = CAP_TILE + r * CAP_W + i;
	}
	cap_lines[0] = a; cap_lines[1] = b; cap_lines[2] = c;
	cap_line = 0; cap_pos = 0; cap_x = 6; cap_on = 1;
}
// types the next letter; returns 1 once everything is on the page
static int cap_step(void) {
	while (cap_line < 3 && (!cap_lines[cap_line] || !cap_lines[cap_line][cap_pos])) { cap_line++; cap_pos = 0; cap_x = 6; }
	if (cap_line >= 3) return 1;
	int ch = cap_lines[cap_line][cap_pos++] - 32;
	if (ch < 0 || ch > 63) ch = 0;
	for (int r = 0; r < 7; r++) {
		int bits = font_rows[ch * 7 + r];
		for (int i = 0; i < font_w[ch]; i++) if ((bits >> i) & 1) cap_plot(cap_x + i, 4 + cap_line * 8 + r, 2);
	}
	cap_x += font_w[ch] + 1;
	return 0;
}

// ---------------------------------------------------------------- effects
static void fx_add(int x, int y, int type) {
	for (int i = 0; i < NFX; i++) if (!fxs[i].on) { fxs[i].on = 1; fxs[i].x = x; fxs[i].y = y; fxs[i].t = 0; fxs[i].type = type; return; }
}
static void ebul_add(s32 x, s32 y, int vx, int vy, int grav) {
	for (int i = 0; i < NEBUL; i++) if (!ebul[i].on) {
		ebul[i].on = 1; ebul[i].x = x; ebul[i].y = y; ebul[i].vx = vx; ebul[i].vy = vy; ebul[i].grav = grav; return;
	}
}
// aimed enemy shot; rot = -1/0/+1 fans it by 20 degrees
static void eshoot(int x, int y, int tx, int ty, int speed, int rot) {
	int dx = tx - x, dy = ty - y, ax = iabs(dx), ay = iabs(dy);
	int len = ax > ay ? ax + (ay >> 1) : ay + (ax >> 1);
	if (!len) len = 1;
	int vx = dx * speed / len, vy = dy * speed / len;
	if (rot) { int c = 241, s = 88 * rot, nx = (vx * c - vy * s) >> 8; vy = (vx * s + vy * c) >> 8; vx = nx; }
	ebul_add(FX(x), FX(y), vx, vy, 0);
}
static Enemy* spawn(int type, int x, int y) {
	for (int i = 0; i < NENEMY; i++) if (!en[i].type) {
		Enemy* e = &en[i];
		e->type = type; e->x = FX(x); e->y = FX(y); e->bx = x; e->by = y; e->vx = e->vy = 0;
		e->t = 0; e->st = 0; e->flash = 0; e->dir = -1; e->arg = 0; e->hp = 1;
		return e;
	}
	return 0;
}

// ---------------------------------------------------------------- hero
static void hero_hit(void);
static void load_room(int id);
static void part_hit(int i, int dmg, int x, int y);
static void boss_hurt(Enemy* e, int dmg);

static void sled_break(void) {
	fx_add(sled.x >> 8, (sled.y >> 8) - 12, 2);
	shake = 14; sled.on = 0;
	if (h.mounted) { h.mounted = 0; h.vy = -0x480; h.ground = 0; h.inv = 110; }
}
static void hero_hit(void) {
	if (h.inv || h.dead || peace) return;
	if (h.mounted) {
		h.inv = 45;
		if (--sled.hp <= 0) sled_break(); else fx_add(sled.x >> 8, (sled.y >> 8) - 10, 1);
		return;
	}
	h.dead = 1; h.vy = -0x3A0; h.vx = -h.face * 0x130; h.ground = 0; h.hide = 0;
	fx_add(h.x >> 8, (h.y >> 8) - 20, 1);
}

static const s16 AX[5] = { 256, 181, 0, 181, 0 }, AY[5] = { 0, -181, -256, 181, 256 };
static int legs_frame(void) {
	if (h.crouch) return ACE_LEGS_CROUCH;
	if (h.vx) return ACE_LEGS_RUN0 + h.run / 3;
	return ACE_LEGS_IDLE;
}
// world position of the upper body's anchor: it rides the waist point of the
// legs frame (so the bob is whatever was drawn), or the sled's seat
static void top_anchor(int* ax, int* ay) {
	if (h.mounted) {
		*ax = (sled.x >> 8) + h.face * pt_sled_seat[0][0];
		*ay = (sled.y >> 8) - 1 + pt_sled_seat[0][1] + ((frame >> 3) & 1);
	} else {
		int lf = legs_frame();
		*ax = (h.x >> 8) + h.face * pt_ace_legs_waist[lf][0];
		*ay = (h.y >> 8) - 1 + pt_ace_legs_waist[lf][1];
	}
}
// bullets leave from the muzzle point marked on the drawn frame
static void muzzle(int* mx, int* my) {
	int dx = AX[h.aim] * h.face, dy = AY[h.aim];
	if (!h.ground && !h.mounted) { *mx = (h.x >> 8) + ((dx * 12) >> 8); *my = (h.y >> 8) - 17 + ((dy * 12) >> 8); return; }
	int ax, ay, f = (h.aim > 3 ? 0 : h.aim) * 2;
	top_anchor(&ax, &ay);
	*mx = ax + h.face * pt_ace_top_muzzle[f][0]; *my = ay + pt_ace_top_muzzle[f][1];
}

static int shot_add(s32 x, s32 y, int vx, int vy, int type) {
	for (int i = 0; i < NSHOT; i++) if (!shots[i].on) {
		shots[i].on = 1; shots[i].x = x; shots[i].y = y; shots[i].vx = vx; shots[i].vy = vy; shots[i].type = type; return 1;
	}
	return 0;
}
static void fire(void) {
	int dx = AX[h.aim] * h.face, dy = AY[h.aim], mx, my, n = 0;
	muzzle(&mx, &my);
	for (int i = 0; i < NSHOT; i++) n += shots[i].on;
	switch (weapon) {
	case W_PEA:
		if (n >= 4) return;
		shot_add(FX(mx), FX(my), dx * 6, dy * 6, 0); h.cool = 11; break;
	case W_MACHINE:
		if (n >= 7) return;
		shot_add(FX(mx), FX(my) + ((rnd() & 3) - 1) * 128, dx * 7, dy * 7, 0); h.cool = 5; break;
	case W_SPREAD: {
		if (n > NSHOT - 5) return;
		static const s16 C[5] = { 256, 247, 247, 222, 222 }, S[5] = { 0, 66, -66, 128, -128 };
		for (int i = 0; i < 5; i++)
			shot_add(FX(mx), FX(my), ((dx * C[i] - dy * S[i]) >> 8) * 5, ((dx * S[i] + dy * C[i]) >> 8) * 5, 1);
		h.cool = 17; break;
	}
	case W_LASER:
		if (n > NSHOT - 3) return;
		for (int i = 0; i < 3; i++) shot_add(FX(mx) - dx * 9 * i, FX(my) - dy * 9 * i, dx * 8, dy * 8, 2);
		h.cool = 20; break;
	}
	h.flash = 6;
}

static void hero_spawn(int x, int y) {
	h.x = FX(x); h.y = FX(y); h.vx = h.vy = 0; h.face = 1; h.inv = 90; h.dead = 0; h.hide = 0; h.mounted = 0; h.aim = 0;
	safe_x = h.x; safe_y = h.y;
}

static void hero_update(void) {
	int press = keys & ~prev;
	h.tick++;
	if (h.inv) h.inv--;
	if (h.cool) h.cool--;
	if (h.flash) h.flash--;
	h.run = (h.ground && h.vx && !h.dead && !h.mounted) ? (h.run + 1) % 24 : 0;
	if (h.dead == 1) {
		int g = move_body(&h.x, &h.y, &h.vx, &h.vy, 4, 16, 1), py = h.y >> 8;
		if (tile_at(h.x >> 8, py - 1) == 3 || py > 176) { h.dead = 2; h.dt = 50; h.hide = 1; fx_add(h.x >> 8, py > 150 ? 140 : py - 10, 1); }
		else if (g & 1) { h.dead = 2; h.dt = 70; h.vx = 0; }
		return;
	}
	if (h.dead == 2) {
		if (--h.dt > 0) return;
		weapon = loadout;
		if (--lives < 0) { restart = 1; return; }
		h.x = safe_x; h.y = safe_y; h.vx = h.vy = 0; h.dead = 0; h.hide = 0; h.inv = 130;
		return;
	}
	int lr = (keys & K_RIGHT) ? 1 : (keys & K_LEFT) ? -1 : 0;
	if (lr) h.face = lr;
	if (h.mounted) {
		sled.vx += lr * 0x30;
		if (!lr) sled.vx -= sled.vx >> 3;
		if (sled.vx > 0x2E0) sled.vx = 0x2E0;
		if (sled.vx < -0x2E0) sled.vx = -0x2E0;
		s32 nx = sled.x + sled.vx;
		int e = (nx >> 8) + (sled.vx > 0 ? 28 : -28), sy = sled.y >> 8;
		if (hard(e, sy - 4) || hard(e, sy - 20) || (nx >> 8) < PANEL_L + 30 || (nx >> 8) > PANEL_R - 30) sled.vx = 0;
		else sled.x = nx;
		sled.face = h.face;
		h.x = sled.x; h.y = sled.y; h.vx = h.vy = 0; h.ground = 1; h.crouch = 0;
		h.aim = (keys & K_UP) ? (lr ? 1 : 2) : 0;
		if (press & K_A) { h.mounted = 0; h.vy = -0x4D0; h.ground = 0; sled.cd = 45; sled.vx = 0; }
	} else {
		h.crouch = 0;
		if (keys & K_UP) h.aim = lr ? 1 : 2;
		else if (keys & K_DOWN) {
			if (lr) h.aim = 3;
			else if (h.ground) { h.aim = 0; h.crouch = 1; }
			else h.aim = 4;
		} else h.aim = 0;
		h.vx = (((keys & K_R) && h.ground) || h.crouch) ? 0 : lr * 0x190;
		int px = h.x >> 8, py = h.y >> 8;
		if ((press & K_A) && h.ground) {
			if (h.crouch && tile_at(px, py) == 2 && !hard(px - 4, py) && !hard(px + 4, py)) h.y += FX(2);   // drop through
			else h.vy = -0x4D0;
			h.ground = 0;
		}
		if (!(keys & K_A) && h.vy < -0x180) h.vy = -0x180;
		int g = move_body(&h.x, &h.y, &h.vx, &h.vy, 5, 30, 1);
		h.ground = g & 1;
		if ((h.x >> 8) < PANEL_L + 7) h.x = FX(PANEL_L + 7);
		if ((h.x >> 8) > PANEL_R - 8) h.x = FX(PANEL_R - 8);
		px = h.x >> 8; py = h.y >> 8;
		if (h.ground) {
			int t = tile_at(px, py);
			if (t == 4) h.x -= 0xB0;
			if (t == 1 && tile_at(px - 6, py) == 1 && tile_at(px + 6, py) == 1) { safe_x = h.x; safe_y = h.y; }
		}
		if (tile_at(px, py - 1) == 3 || py > 176) {
			h.dead = 2; h.dt = 50; h.hide = 1; fx_add(px, py > 150 ? 140 : py - 10, 1);
			return;
		}
		if (sled.on && !sled.cd && h.vy >= 0 && iabs(px - (sled.x >> 8)) < 18 && py <= (sled.y >> 8) + 2 && py > (sled.y >> 8) - 26) {
			h.mounted = 1; sled.vx = 0;
		}
	}
	if ((keys & K_B) && !h.cool) fire();
}

// ---------------------------------------------------------------- enemies
static void kill_enemy(Enemy* e) {
	int x = e->x >> 8, y = e->y >> 8, type = e->type;
	e->type = 0;
	if (type == O_POD) {
		e->type = O_PICKUP; e->vy = -0x260; e->vx = 0; e->t = 0;
		fx_add(x, y - 8, 1);
		return;
	}
	if (type == O_DRUM) {
		fx_add(x, y - 10, 2); shake = 12;
		for (int i = 0; i < NENEMY; i++) {
			Enemy* o = &en[i];
			if (o->type == O_BOSS && o->st != 2 && o->arg != 2 && x > (o->x >> 8) + GT_TREADS_L - 44 && iabs((o->y >> 8) - y) < 70) {
				if (!B.p[BP_PLATE].dead) part_hit(BP_PLATE, 6, (o->x >> 8) + GT_PLATE_X, (o->y >> 8) + GT_PLATE_Y);
				else boss_hurt(o, 6);
			}
			if (!o->type || o->type == O_PICKUP || o->type == O_FIRE || o->type == O_BOSS) continue;
			if (iabs((o->x >> 8) - x) < 48 && iabs((o->y >> 8) - y) < 44) kill_enemy(o);
		}
		if (iabs((h.x >> 8) - x) < 30 && iabs((h.y >> 8) - y) < 34) hero_hit();
		return;
	}
	fx_add(x, y - (type == O_SAUCER ? 8 : 18), 0);
}
static void hurt_enemy(Enemy* e, int dmg) {
	e->flash = 4;
	e->hp -= dmg;
	if (e->hp <= 0) kill_enemy(e);
}
// ---------------------------------------------------------------- the Guardian
// Tank form (stages 1 and 2): tracked hull carrying a head with an eye, a
// cannon arm, a missile rack, a radar dish and a furnace core behind an armour
// plate. Pod form (stage 3): the head flies on a thruster pod with two chain
// arms. Part positions come from art/guardian.py via the exported GT_/GP_ names,
// all relative to the assembly's root anchor (B.ox, B.oy).
#define NLINK 4
static int hitp(int x, int y, int l, int t, int r, int b) {
	int rx = (x - B.ox) * B.dir, ry = y - B.oy;
	return rx >= l - 1 && rx <= r && ry >= t - 1 && ry <= b;
}
#define HIT(P) hitp(x, y, P##_L, P##_T, P##_R, P##_B)
static void chain_pos(int side, int i, int* x, int* y) {
	int ax = side ? GP_POD_ARM_R_X : GP_POD_ARM_L_X, ay = side ? GP_POD_ARM_R_Y : GP_POD_ARM_L_Y;
	*x = B.ox + B.dir * ax + ((SIN(frame * 3 + side * 96 + i * 22) * (i + 1)) >> 7);
	*y = B.oy + ay + 3 + i * 7;
}
static void boss_hurt(Enemy* e, int dmg) {
	B.flash = 4; e->hp -= dmg;
	if (e->hp <= 0 && e->st != 2) { e->st = 2; e->t = 0; }
}
static void part_hit(int i, int dmg, int x, int y) {
	BPart* p = &B.p[i];
	p->flash = 4; p->hp -= dmg;
	if (p->hp <= 0) { p->dead = 1; fx_add(x, y, 2); shake = 14; }
}
static void boss_init(Enemy* e) {
	static const u8 HP[BP_N] = { G_CANNON_HP, G_RACK_HP, G_DISH_HP, G_PLATE_HP, 8, 8 };
	int form = e->arg;
	for (int i = 0; i < BP_N; i++) {
		B.p[i].hp = HP[i] + (form == 1 ? HP[i] >> 1 : 0); B.p[i].flash = 0; B.p[i].dead = 0;
	}
	B.ang = 0; B.recoil = 0; B.eye = 0; B.rack_open = 0; B.tread = 0; B.flash = 0; B.dir = 1;
	e->hp = form == 0 ? 30 : form == 1 ? 38 : 28;
#ifdef QUICK
	e->hp = 4;
	for (int i = 0; i < BP_N; i++) B.p[i].hp = 2;
#endif
	e->bx = e->hp;                                        // remember full health for the damage scars
	if (form != 2 && !peace) e->x = FX(PANEL_R + 70);
	B.ox = e->x >> 8; B.oy = (e->y >> 8) - (form == 2 ? 0 : 1);
}
// a hero shot at world (x,y): returns 1 if the Guardian stopped it
static int boss_shot(Enemy* e, int x, int y, int dmg) {
	if (e->st == 2) return 0;
	if (e->arg == 2) {
		if (B.eye == 2 && HIT(GP_EYE)) { boss_hurt(e, dmg); return 1; }
		for (int i = 0; i < 2; i++) {
			int cx, cy;
			if (B.p[BP_CLAW_L + i].dead) continue;
			chain_pos(i, NLINK, &cx, &cy);
			if (iabs(x - cx) < 9 && y > cy - 4 && y < cy + 14) { part_hit(BP_CLAW_L + i, dmg, cx, cy + 6); return 1; }
		}
		if (!B.p[BP_DISH].dead && HIT(GP_DISH)) { part_hit(BP_DISH, dmg, x, y); return 1; }
		if (HIT(GP_HEAD) || HIT(GP_POD)) { if ((frame & 3) == 0) fx_add(x, y, 3); return 1; }
		return 0;
	}
	if (B.eye == 2 && HIT(GT_EYE)) { boss_hurt(e, dmg); return 1; }
	if (B.p[BP_PLATE].dead && HIT(GT_CORE)) { boss_hurt(e, dmg); return 1; }
	if (!B.p[BP_CANNON].dead) {                           // the barrel is a turning segment, not a box
		int rx = x - (B.ox + GT_CANNON_X), ry = y - (B.oy + GT_CANNON_Y);
		int dx = -COS(B.ang), dy = -SIN(B.ang);
		int along = (rx * dx + ry * dy) >> 8, perp = (rx * dy - ry * dx) >> 8;
		if (along > -8 && along < G_CANNON_LEN + 2 && iabs(perp) < 10) { part_hit(BP_CANNON, dmg, x, y); return 1; }
	}
	if (!B.p[BP_RACK].dead && HIT(GT_RACK)) { part_hit(BP_RACK, dmg, x, y); return 1; }
	if (!B.p[BP_DISH].dead && HIT(GT_DISH)) { part_hit(BP_DISH, dmg, x, y); return 1; }
	if (!B.p[BP_PLATE].dead && HIT(GT_PLATE)) { part_hit(BP_PLATE, dmg, x, y); return 1; }
	if (HIT(GT_HULL) || HIT(GT_HEAD) || HIT(GT_TREADS)) { if ((frame & 3) == 0) fx_add(x, y, 3); return 1; }
	return 0;
}
static void boss_pod(Enemy* e, int hx, int hy, int htop) {
	int t = e->t, p = t & 511, q = t % 300;
	e->x = FX(96 + (p < 256 ? p : 511 - p));              // sweeps the panel
	B.eye = q < 130 ? 0 : q < 142 ? 1 : q < 270 ? 2 : q < 284 ? 1 : 0;
	e->y += (FX(B.eye == 2 ? 72 : 52) - e->y) >> 5;       // swoops while the eye is open
	int ox = e->x >> 8, oy = e->y >> 8;
	B.ox = ox; B.oy = oy;
	B.dir = hx > ox ? -1 : 1;                             // the art faces left
	if (B.eye == 0 && (q == 40 || q == 90)) ebul_add(FX(ox + B.dir * GP_POD_GUN_X), FX(oy + GP_POD_GUN_Y), 0, 0x40, 1);
	if (B.eye == 2 && (q == 165 || q == 205 || q == 245))
		for (int k = -1; k <= 1; k++) eshoot(ox + B.dir * GP_EYE_X, oy + GP_EYE_Y, hx, hy - 16, 0x1C0, k);
	for (int i = 0; i < 2; i++) if (!B.p[BP_CLAW_L + i].dead && (t % 140) == 30 + i * 70) {
		int cx, cy;
		chain_pos(i, NLINK, &cx, &cy);
		eshoot(cx, cy + 10, hx, hy - 16, 0x170, 0);
	}
	if (!B.p[BP_DISH].dead && q == 5 && e->hp < 20) {     // the dish calls saucers
		int n = 0;
		for (int j = 0; j < NENEMY; j++) n += en[j].type == O_SAUCER;
		if (!n) { Enemy* m = spawn(O_SAUCER, cam + 236, 34); if (m) m->hp = 2; }
	}
	if (!h.dead && iabs(hx - ox) < 26 && hy > oy + GP_HEAD_T && htop < oy + GP_POD_B - 2) hero_hit();
}
static void boss_update(Enemy* e, int hx, int hy, int htop) {
	int form = e->arg, pod = form == 2, fast = form == 1;
	for (int i = 0; i < BP_N; i++) if (B.p[i].flash) B.p[i].flash--;
	if (B.flash) B.flash--;
	if (B.recoil) B.recoil--;
	B.ox = e->x >> 8; B.oy = (e->y >> 8) - (pod ? 0 : 1);
	int ox = B.ox, oy = B.oy;
	if (e->st == 2) {                                     // coming apart, part by part
		if (e->t == 1) {
			for (int j = 0; j < NEBUL; j++) ebul[j].on = 0;
			for (int j = 0; j < NENEMY; j++)
				if (en[j].type == O_RUNNER || en[j].type == O_SAUCER || en[j].type == O_TURRET) kill_enemy(&en[j]);
			B.eye = 3;
		}
		if (pod) {
			if ((e->y >> 8) < 96) e->y += 0x90;
			if (e->t == 30) B.p[BP_CLAW_L].dead = 1;
			if (e->t == 60) B.p[BP_CLAW_R].dead = 1;
			if (e->t == 90) B.p[BP_DISH].dead = 1;
		} else {
			if (e->t == 30) B.p[BP_DISH].dead = 1;
			if (e->t == 55) B.p[BP_CANNON].dead = 1;
			if (e->t == 80) B.p[BP_RACK].dead = 1;
			if (e->t == 105) B.p[BP_PLATE].dead = 1;
		}
		if ((e->t & 7) == 0) {
			fx_add(ox - 50 + (rnd() % 100), pod ? oy - 36 + (rnd() % 70) : oy - 4 - (rnd() % 96), (e->t & 8) ? 0 : 1);
			shake = 8;
		}
		if (e->t > 140) {
			int cy = pod ? oy : oy - 44;
			fx_add(ox, cy, 2); fx_add(ox - 34, cy - 18, 2); fx_add(ox + 30, cy + 16, 2);
			shake = 26; e->type = 0; boss_dead = 1;
		}
		return;
	}
	if (peace) { B.eye = 0; return; }
	if (e->t > 26000) e->t = 0;
	if (pod) { boss_pod(e, hx, hy, htop); return; }

	s32 oldx = e->x;
	int tri = (e->t >> 2) & 31, t = e->t;                 // rolls in, then rocks back and forth
	s32 tx = FX(e->by + (tri < 16 ? tri - 8 : 24 - tri));
	if (e->x > tx + 0x180) { e->x -= 0x120; e->st = 0; e->t = 0; }
	else { e->x = tx; e->st = 1; }
	B.tread += iabs(e->x - oldx);
	if ((frame % 44) == 0) fx_add(ox + (((frame / 44) & 1) ? GT_STACK_A_X : GT_STACK_B_X), oy + GT_STACK_A_T - 4, 4);
	if (e->st == 1) {
		if (!B.p[BP_CANNON].dead) {                       // cannon: tracks the hero, fires three-round bursts
			int px = ox + GT_CANNON_X, py = oy + GT_CANNON_Y, c = t % (fast ? 96 : 128);
			int ux = hx - px, uy = (hy - 18) - py;
			for (int k = 0; k <= fast; k++) {
				int cr = -COS(B.ang) * uy + SIN(B.ang) * ux;
				if (cr > 0 && B.ang < 46) B.ang++; else if (cr < 0 && B.ang > -18) B.ang--;
			}
			if (c == 60 || c == 70 || c == 80) {
				int dx = -COS(B.ang), dy = -SIN(B.ang);
				ebul_add(FX(px) + dx * G_CANNON_LEN, FX(py) + dy * G_CANNON_LEN, (dx * 0x1C0) >> 8, (dy * 0x1C0) >> 8, 0);
				B.recoil = 6;
			}
		}
		if (!B.p[BP_RACK].dead) {                         // missile rack: lid opens, three shells lobbed
			int r = t % (fast ? 250 : 320);
			B.rack_open = r >= 180 && r < 250;
			if (r == 196 || r == 214 || r == 232) {
				int lx = ox + GT_RACK_LAUNCH_X, ly = oy + GT_RACK_LAUNCH_Y;
				ebul_add(FX(lx), FX(ly), (hx + (r - 214) * 2 - lx) * 256 / 84, -0x3A0, 2);
				fx_add(lx, ly - 4, 3);
			}
		} else {
			B.rack_open = 0;
			if ((frame & 31) == 0) fx_add(ox + GT_RACK_X, oy + GT_RACK_T + 6, 4);
		}
		{                                                 // eye: the weak point opens to fire a fan
			int enr = B.p[BP_CANNON].dead && B.p[BP_RACK].dead, per = enr ? 200 : 290, sh = enr ? 60 : 150, q = t % per;
			B.eye = q < sh ? 0 : q < sh + 14 ? 1 : q < per - 26 ? 2 : q < per - 12 ? 1 : 0;
			if (B.eye == 2 && (q - sh == 34 || q - sh == 62 || q - sh == 90))
				for (int k = -1; k <= 1; k++) eshoot(ox + GT_EYE_X, oy + GT_EYE_Y, hx, hy - 16, 0x1B0, k);
		}
		if (fast && (t % 150 == 20 || t % 150 == 34)) ebul_add(FX(ox + GT_TREADS_L + 4), FX(oy - 6), -0x2A0, 0, 0);   // floor skimmers
	}
	if (!h.dead && hx > ox + GT_TREADS_L - 2 && hx < ox + GT_TREADS_R && hy > oy + GT_HEAD_T && htop < oy) hero_hit();
}
static void boss_draw(Enemy* e) {
	int form = e->arg, sx = B.ox - cam, oy = B.oy, fl = form == 2 ? B.dir : 1;
	int base = form == 1 ? 6 : 4, dying = e->st == 2;
	int shk = (dying && (e->t & 2)) ? 1 : 0;
	int bp = (B.flash || (dying && (e->t & 4))) ? 5 : base;
#define PART(sheet, fr, P, pal) ms_draw(&ms_##sheet[fr], sx + fl * P##_X + shk, oy + P##_Y, fl < 0, pal, 1, 0)
#define PP(i) (B.p[i].flash ? 5 : base)
	if (form == 2) {
		PART(g_eye, B.eye, GP_EYE, bp);
		PART(g_dish, B.p[BP_DISH].dead ? G_DISH_WRECK : G_DISH_SPIN0 + ((frame >> 3) & 3), GP_DISH, PP(BP_DISH));
		PART(g_head, 0, GP_HEAD, bp);
		PART(g_pod, (frame >> 2) & 1, GP_POD, bp);
		for (int i = 0; i < 2; i++) {
			int x, y;
			if (B.p[BP_CLAW_L + i].dead) continue;
			chain_pos(i, NLINK, &x, &y);
			ms_draw(&ms_g_claw[0], x - cam, y, 0, PP(BP_CLAW_L + i), 1, 0);
			for (int k = NLINK - 1; k >= 0; k--) { chain_pos(i, k, &x, &y); ms_draw(&ms_g_link[0], x - cam, y, 0, base, 1, 0); }
		}
		return;
	}
	PART(g_shoulder, B.p[BP_CANNON].dead ? G_SHOULDER_STUMP : G_SHOULDER_JOINT, GT_SHOULDER, PP(BP_CANNON));
	if (!B.p[BP_CANNON].dead)
		obj_rot(sx + GT_CANNON_X + shk, oy + GT_CANNON_Y, G_CANNON_CX, G_CANNON_CY, B.ang,
			ms_g_cannon[B.recoil > 2 ? G_CANNON_FIRE : G_CANNON_CANNON].o[0].tk & 0x3FF, PP(BP_CANNON), 1);
	PART(g_dish, B.p[BP_DISH].dead ? G_DISH_WRECK : G_DISH_SPIN0 + ((frame >> 3) & 3), GT_DISH, PP(BP_DISH));
	PART(g_eye, B.eye, GT_EYE, bp);
	PART(g_head, 0, GT_HEAD, bp);
	PART(g_plate, B.p[BP_PLATE].dead ? G_PLATE_BROKEN : B.p[BP_PLATE].hp <= G_PLATE_HP / 2 ? G_PLATE_CRACKED : G_PLATE_INTACT, GT_PLATE, PP(BP_PLATE));
	PART(g_core, dying ? G_CORE_DEAD : G_CORE_GLOW0 + ((frame >> (B.p[BP_PLATE].dead ? 2 : 4)) % 3), GT_CORE, bp);
	if (e->hp * 3 <= e->bx * 2) ms_draw(&ms_g_scar[0], sx + GT_SCAR0_X + shk, oy + GT_SCAR0_Y, 0, base, 1, 0);
	if (e->hp * 3 <= e->bx) ms_draw(&ms_g_scar[1], sx + GT_SCAR1_X + shk, oy + GT_SCAR1_Y, 0, base, 1, 0);
	if (e->hp * 6 <= e->bx || dying) ms_draw(&ms_g_scar[2], sx + GT_SCAR2_X + shk, oy + GT_SCAR2_Y, 0, base, 1, 0);
	PART(g_hull, 0, GT_HULL, bp);
	PART(g_treads, (B.tread >> 9) % 3, GT_TREADS, base);
	PART(g_rack, B.p[BP_RACK].dead ? G_RACK_WRECK : B.rack_open ? G_RACK_OPEN : G_RACK_CLOSED, GT_RACK, PP(BP_RACK));
	PART(g_stack, 0, GT_STACK_A, base);
	PART(g_stack, 0, GT_STACK_B, base);
}

static const u8 E_HW[] = { 0, 9, 9, 12, 14, 6, 8, 0, 0, 0, 0 }, E_HH[] = { 0, 34, 34, 24, 14, 15, 14, 0, 0, 0, 0 };

static void enemies_update(void) {
	int hx = h.x >> 8, hy = h.y >> 8;
	int htop = hy - (h.mounted ? 40 : !h.ground ? 22 : h.crouch ? 28 : 38);
	for (int i = 0; i < NENEMY; i++) {
		Enemy* e = &en[i];
		if (!e->type) continue;
		if (e->flash) e->flash--;
		e->t++;
		int px = e->x >> 8, py = e->y >> 8, touch_w = 0, touch_h = 0;
		switch (e->type) {
		case O_RUNNER: {
			e->vx = e->dir * 0x158;
			int g = move_body(&e->x, &e->y, &e->vx, &e->vy, 5, 28, 1);
			px = e->x >> 8; py = e->y >> 8;
			if ((g & 1) && ((g & 2) || !floorish(px + e->dir * 10, py + 4))) e->vy = -0x460;
			if (py > 176 || px < cam - 48 || px > cam + 288 || tile_at(px, py - 1) == 3 || px < PANEL_L + 4 || px > PANEL_R - 4) { e->type = 0; continue; }
			touch_w = 8; touch_h = 32;
			break;
		}
		case O_SNIPER:
			e->dir = hx < px ? -1 : 1;
			if (e->st) e->st--;
			if ((e->t % 110) == 60 && iabs(hx - px) < 190 && px > cam - 10 && px < cam + 250) {
				eshoot(px + e->dir * pt_trooper_muzzle[TROOPER_AIM][0], py - 1 + pt_trooper_muzzle[TROOPER_AIM][1], hx, hy - 18, 0x1A0, 0);
				e->st = 8;
			}
			touch_w = 8; touch_h = 32;
			break;
		case O_TURRET: {
			int dx = hx - px, dy = (hy - 16) - (py - 12);
			e->dir = dx < 0 ? -1 : 1;
			if (dy < -12) e->st = (iabs(dx) * 2 < -dy) ? 2 : 1;
			else e->st = dy > 14 ? 3 : 0;
			if ((e->t % 80) == 40 && px > cam - 10 && px < cam + 250) {
				static const s16 TX[4] = { 256, 181, 0, 222 }, TY[4] = { 0, -181, -256, 128 };
				int vx = TX[e->st] * e->dir, vy = TY[e->st];
				ebul_add(FX(px + e->dir * pt_turret_muzzle[e->st][0]), FX(py - 1 + pt_turret_muzzle[e->st][1]), (vx * 0x1B0) >> 8, (vy * 0x1B0) >> 8, 0);
			}
			touch_w = 10; touch_h = 20;
			break;
		}
		case O_SAUCER: {
			int ph = e->t & 63, off = ph < 32 ? ph - 16 : 48 - ph;
			e->x += e->dir * 0x130;
			e->y = FX(e->by + (off >> 1));
			px = e->x >> 8;
			if (px < cam + 14 || px < PANEL_L + 16) e->dir = 1;
			if (px > cam + 226 || px > PANEL_R - 16) e->dir = -1;
			if ((e->t % 64) == 32) ebul_add(e->x, e->y, 0, 0x60, 1);
			touch_w = 12; touch_h = 12;
			break;
		}
		case O_DRUM:
			break;
		case O_POD: {
			int ph = e->t & 63, off = ph < 32 ? ph - 16 : 48 - ph;
			e->x -= 0x90;
			e->y = FX(e->by + (off >> 1));
			if (px < cam - 24 || px < PANEL_L) e->type = 0;
			break;
		}
		case O_PICKUP: {
			e->vx = 0;
			move_body(&e->x, &e->y, &e->vx, &e->vy, 5, 12, 1);
			if (py > 176 || e->t > 900 || tile_at(px, py - 1) == 3) { e->type = 0; continue; }
			if (!h.dead && iabs(hx - px) < 14 && py > htop - 4 && py - 14 < hy) {
				weapon = e->arg + 1; e->type = 0; fx_add(px, py - 8, 3);
			}
			break;
		}
		case O_FIRE:
			if (!e->st) {
				if (e->t >= 150) { e->st = 1; e->vy = -0x560; e->y = FX(e->by); }
			} else {
				e->vy += 0x1C; e->y += e->vy;
				if ((e->y >> 8) > e->by) { e->st = 0; e->t = 0; }
				touch_w = 6; touch_h = 14;
			}
			break;
		case O_BOSS:
			boss_update(e, hx, hy, htop);
			break;
		}
		if (touch_w && !h.dead && iabs(hx - px) < touch_w + 3 && hy > py - touch_h && htop < py) hero_hit();
	}
}

static void shots_update(void) {
	for (int i = 0; i < NSHOT; i++) {
		Shot* s = &shots[i];
		if (!s->on) continue;
		s->x += s->vx; s->y += s->vy;
		int x = s->x >> 8, y = s->y >> 8;
		if (x < cam - 12 || x > cam + 252 || y < PANEL_L || y > 152 || x < PANEL_L || x > PANEL_R || hard(x, y)) { s->on = 0; continue; }
		int dmg = s->type == 2 ? 2 : 1;
		for (int j = 0; j < NENEMY; j++) {
			Enemy* e = &en[j];
			int ex = e->x >> 8, ey = e->y >> 8;
			if (e->type == O_BOSS) {
				if (boss_shot(e, x, y, dmg)) { s->on = 0; break; }
				continue;
			}
			if (!E_HW[e->type]) continue;
			if (iabs(x - ex) <= E_HW[e->type] && y <= ey && y >= ey - E_HH[e->type]) {
				hurt_enemy(e, dmg);
				if (s->type != 2) s->on = 0;
				break;
			}
		}
	}
	int hx = h.x >> 8, hy = h.y >> 8;
	int htop = hy - (h.mounted ? 40 : !h.ground ? 22 : h.crouch ? 28 : 38);
	for (int i = 0; i < NEBUL; i++) {
		EBul* b = &ebul[i];
		if (!b->on) continue;
		if (b->grav) b->vy += 0x18;
		b->x += b->vx; b->y += b->vy;
		int x = b->x >> 8, y = b->y >> 8;
		if (x < cam - 12 || x > cam + 252 || y > 156 || x < PANEL_L || x > PANEL_R || (y > 0 && hard(x, y)) || tile_at(x, y) == 3) {
			if (b->grav && y > 0) fx_add(x, y - 4, 1);
			b->on = 0; continue;
		}
		if (!h.dead && iabs(x - hx) < 6 && y > htop && y < hy) { b->on = 0; hero_hit(); }
	}
	for (int i = 0; i < NFX; i++)
		if (fxs[i].on && ++fxs[i].t > (fxs[i].type == 1 ? 14 : fxs[i].type == 3 ? 5 : fxs[i].type == 4 ? 22 : 40)) fxs[i].on = 0;
}

static void spawner(void) {
	// placed objects wake up as the camera reaches them
	for (int i = 0; i < rm->nobj; i++) {
		const s16* o = &rm->objs[i * 4];
		if ((spawned >> i) & 1 || (o[0] != O_BOSS && o[1] > cam + 252)) continue;
		if (peace && !(o[0] == O_FIRE || o[0] == O_DRUM || o[0] == O_SLED || (o[0] == O_BOSS && room_id == 1))) continue;
		spawned |= 1u << i;
		if (o[0] == O_SLED) { sled.on = 1; sled.x = FX(o[1]); sled.y = FX(o[2]); sled.hp = 3; sled.face = 1; sled.vx = 0; sled.cd = 0; continue; }
		Enemy* e = spawn(o[0], o[1], o[2]);
		if (!e) continue;
		e->arg = o[3];
		switch (o[0]) {
		case O_SNIPER: e->hp = 3; break;
		case O_TURRET: e->hp = 8; break;
		case O_SAUCER: e->hp = 2; e->x = FX(cam + 236); break;
		case O_DRUM: e->hp = 2; break;
		case O_FIRE: e->t = o[3]; break;
		case O_BOSS: e->by = o[1]; boss_init(e); break;
		}
	}
	// round one: the Guardian's troopers keep pouring in behind you
	// (they stop coming once its radar dish is shot off)
	if (peace || room_id != 0 || boss_dead || B.p[BP_DISH].dead) return;
	if (--spawn_t > 0) return;
	spawn_t = 150 + (rnd() & 63);
	int n = 0;
	for (int i = 0; i < NENEMY; i++) n += en[i].type == O_RUNNER;
	if (n >= 2) return;
	int x = cam - 6;
	if (x < PANEL_L + 12) return;
	for (int ty = 3; ty < 20; ty++) {
		int t = tile_at(x, ty * 8);
		if (t == 3) return;
		if ((t == 1 || t == 2 || t == 4) && tile_at(x, ty * 8 - 8) == 0) {
			Enemy* e = spawn(O_RUNNER, x, ty * 8);
			if (e) e->dir = 1;
			return;
		}
	}
}

// ---------------------------------------------------------------- drawing
static void hero_draw(int prio) {
	int hx = (h.x >> 8) - cam, hy = h.y >> 8, fl = h.face < 0;
	if (h.hide || (h.inv & 2)) return;
	if (h.dead == 2) {                                     // laid out
		if (h.dt <= 20 && !(h.dt & 2)) return;
		const Ms* m = &ms_ace_air[ACE_AIR_DOWN];
		stream(&cur_top, 0x100 | ACE_AIR_DOWN, ACE_AIR_SLOT, m, tl_ace_air);
		ms_draw(m, hx, hy - 1, fl, 0, prio, ACE_AIR_SLOT);
	} else if (h.dead == 1) {                              // blown off his feet
		const Ms* m = &ms_ace_air[ACE_AIR_HIT];
		stream(&cur_top, 0x100 | ACE_AIR_HIT, ACE_AIR_SLOT, m, tl_ace_air);
		ms_draw(m, hx, hy - 17, fl, 0, prio, ACE_AIR_SLOT);
	} else if (!h.ground && !h.mounted) {                  // somersault: four drawn angles, mirrored for the other four
		int p = (h.tick >> 2) & 7, f = ACE_AIR_TUCK0 + (p & 3);
		const Ms* m = &ms_ace_air[f];
		stream(&cur_top, 0x100 | f, ACE_AIR_SLOT, m, tl_ace_air);
		ms_draw(m, hx, hy - 17, (p & 4) ? ((fl ^ 1) | 2) : fl, 0, prio, ACE_AIR_SLOT);
	} else {                                               // upper body on the legs' waist point (or the sled's seat)
		int ax, ay, f = (h.aim > 3 ? 0 : h.aim) * 2 + (h.flash > 2);
		const Ms* m = &ms_ace_top[f];
		top_anchor(&ax, &ay);
		stream(&cur_top, f, ACE_TOP_SLOT, m, tl_ace_top);
		ms_draw(m, ax - cam, ay, fl, 0, prio, ACE_TOP_SLOT);
		if (!h.mounted) {
			int lf = legs_frame();
			m = &ms_ace_legs[lf];
			stream(&cur_legs, lf, ACE_LEGS_SLOT, m, tl_ace_legs);
			ms_draw(m, hx, hy - 1, fl, 0, prio, ACE_LEGS_SLOT);
		}
	}
}

static void draw(void) {
	// HUD lives in the top-right corner of the panel
	if (!peace) {
		for (int i = 0; i < lives && i < 5; i++) ms_draw(&ms_hud[HUD_LIFE], 221 - i * 9, 11, 0, 0, 0, 0);
		if (weapon) ms_draw(&ms_items[ITEMS_BADGE_S + weapon - 1], 184, 24, 0, 2, 0, 0);
	}
	for (int i = 0; i < NFX; i++) {
		Fx* f = &fxs[i];
		if (!f->on) continue;
		int x = f->x - cam, y = f->y, t = f->t;
		switch (f->type) {
		case 3: ms_draw(&ms_shots[SHOTS_SPARK], x, y, 0, 2, 1, 0); break;
		case 4: ms_draw(&ms_boom[t < 11 ? BOOM_BOOM3 : BOOM_BOOM4], x, y - (t >> 1), 0, 2, 1, 0); break;      // smoke puff
		case 1: ms_draw(&ms_boom[t / 3 > 4 ? 4 : t / 3], x, y, 0, 2, 1, 0); break;                            // quick burst
		default:                                                                                              // explosion with lettering
			if (t >= 4) ms_draw(&ms_sfx[f->type == 2 ? SFX_BOOM : SFX_POW], x, y - 20 - (t >> 2), 0, 2, 1, 0);
			if (t < 25) ms_draw(&ms_boom[t / 5], x, y, 0, 2, 1, 0);
			if (f->type == 2 && t >= 4 && t < 29) {
				ms_draw(&ms_boom[(t - 4) / 5], x - 18, y - 8, 1, 2, 1, 0);
				ms_draw(&ms_boom[(t - 4) / 5], x + 16, y + 6, 2, 2, 1, 0);
			}
		}
	}
	if (h.flash > 3 && !h.dead) {
		int mx, my;
		muzzle(&mx, &my);
		ms_draw(&ms_shots[SHOTS_FLASH], mx - cam + ((AX[h.aim] * h.face * 3) >> 8), my + ((AY[h.aim] * 3) >> 8), 0, 2, 1, 0);
	}
	for (int i = 0; i < NSHOT; i++) {
		Shot* s = &shots[i];
		if (!s->on) continue;
		int x = (s->x >> 8) - cam, y = s->y >> 8;
		if (s->type == 0) ms_draw(&ms_shots[SHOTS_PEA0 + ((frame >> 1) & 1)], x, y, s->vx < 0, 2, 1, 0);
		else if (s->type == 1) ms_draw(&ms_shots[SHOTS_PELLET], x, y, 0, 2, 1, 0);
		else if (!s->vy) ms_draw(&ms_shots[SHOTS_LASER_H], x, y, 0, 2, 1, 0);
		else if (!s->vx) ms_draw(&ms_shots[SHOTS_LASER_V], x, y, 0, 2, 1, 0);
		else ms_draw(&ms_shots[SHOTS_LASER_D], x, y, (s->vx > 0) == (s->vy > 0), 2, 1, 0);
	}
	for (int i = 0; i < NEBUL; i++) if (ebul[i].on)
		ms_draw(&ms_shots[SHOTS_EBUL0 + ((frame >> 2) & 1)], (ebul[i].x >> 8) - cam, ebul[i].y >> 8, 0, 2, 1, 0);
	// hero: the one character allowed to cross panel borders (prio 0)
	int hx = (h.x >> 8) - cam;
	hero_draw((hx < PANEL_L - cam + 12 || hx > PANEL_R - cam - 14) ? 0 : 1);
	if (sled.on) {
		int pal = (h.mounted && h.inv > 30 && (frame & 2)) ? 5 : 0;
		ms_draw(&ms_sled[(frame >> 2) & 1], (sled.x >> 8) - cam, (sled.y >> 8) - 1 + ((frame >> 3) & 1), sled.face < 0, pal, 1, 0);
	}
	for (int i = 0; i < NENEMY; i++) {
		Enemy* e = &en[i];
		if (!e->type) continue;
		int x = (e->x >> 8) - cam, y = (e->y >> 8) - 1, f = e->dir < 0, wp = e->flash ? 5 : -1;
		switch (e->type) {
		case O_RUNNER: ms_draw(&ms_trooper[TROOPER_RUN0 + (e->t / 5) % 6], x, y, f, wp < 0 ? 1 : wp, 1, 0); break;
		case O_SNIPER: ms_draw(&ms_trooper[e->st ? TROOPER_AIM_FIRE : TROOPER_AIM], x, y, f, wp < 0 ? 3 : wp, 1, 0); break;
		case O_TURRET: ms_draw(&ms_turret[e->st], x, y, f, wp < 0 ? 1 : wp, 1, 0); break;
		case O_SAUCER: ms_draw(&ms_saucer[(e->t >> 3) & 1], x, y, 0, wp < 0 ? 1 : wp, 1, 0); break;
		case O_DRUM: ms_draw(&ms_items[ITEMS_DRUM], x, y, 0, wp < 0 ? 2 : wp, 1, 0); break;
		case O_POD: ms_draw(&ms_pod[(e->t >> 3) & 1], x, y, 0, 1, 1, 0); break;
		case O_PICKUP: if (e->t < 700 || (e->t & 4)) ms_draw(&ms_items[ITEMS_BADGE_S + e->arg], x, y, 0, 2, 1, 0); break;
		case O_FIRE:
			if (e->st) ms_draw(&ms_items[ITEMS_FIRE0 + ((e->t >> 2) & 1)], x, e->vy > 0 ? y - 15 : y, e->vy > 0 ? 2 : 0, 2, 1, 0);
			break;
		case O_BOSS: boss_draw(e); break;
		}
	}
}

// ---------------------------------------------------------------- rooms
static void load_room(int id) {
	for (int i = 0; i <= 16; i += 2) { vsync(); BLDCNT = 0x00BF; BLDY = i; }   // page turns to white
	oam_n = 0; oam_flush();
	room_id = id; rm = &rooms[id];
	copy16(BGPAL, rm->pal, 64);
	copy32((u32*)0x06000000, rm->ta, rm->ta_len);
	copy32((u32*)0x06008000, rm->tb, rm->tb_len);
	for (int r = 0; r < 32; r++) for (int c = 0; c < 64; c++) {
		SB(26 + (c >> 5))[r * 32 + (c & 31)] = r < 20 ? rm->mf[r * 64 + c] : 0;
		SB(28 + (c >> 5))[r * 32 + (c & 31)] = r < 20 ? rm->mp[r * 64 + c] : 0;
	}
	for (int r = 0; r < 32; r++) for (int c = 0; c < 32; c++) {
		SB(30)[r * 32 + c] = r < 20 ? rm->mm[r * 32 + c] : 0;
		SB(31)[r * 32 + c] = r < 20 ? rm->mr[r * 32 + c] : 0;
	}
	if (rm->stage == 1) copy32(OBJ_TILE(OBJ_STAGE_BASE), objbank_tank, objbank_tank_len);
	if (rm->stage == 2) copy32(OBJ_TILE(OBJ_STAGE_BASE), objbank_pod, objbank_pod_len);
	cur_top = cur_legs = -1; npend = 0;
	for (int i = 0; i < BP_N; i++) B.p[i].dead = 0;
	for (int i = 0; i < NENEMY; i++) en[i].type = 0;
	for (int i = 0; i < NSHOT; i++) shots[i].on = 0;
	for (int i = 0; i < NEBUL; i++) ebul[i].on = 0;
	for (int i = 0; i < NFX; i++) fxs[i].on = 0;
	cap_on = 0; spawned = 0; cam = 0; sled.on = 0; boss_dead = 0; shake = 0; spawn_t = 120;
	hero_spawn(rm->sx, rm->sy);
	fade = 32;
}

// ---------------------------------------------------------------- the issue's script
enum { S_TITLE, S_STORY, S_AFTER, S_LOADOUT, S_FIGHT, S_END };
typedef struct { u8 kind, room; s16 a, b; const char *l1, *l2, *l3; } Step;
static const Step script[] = {
	{ S_TITLE, 2, 0, 0, 0, 0, 0 },
	{ S_STORY, 0, 0, 56, "ACE DARING, EARTH'S LAST ROCKET", "PILOT, CHASED A DISTRESS CALL", "TO THE ROBOT MOON ZORB-9." },
	{ S_STORY, 1, 0, 208, "THE CALL WAS BAIT. IN HIS FOUNDRY", "THE BRAIN EMPEROR HAD FORGED", "A HUNTER OF HEROES..." },
	{ S_STORY, 3, 0, 0, "\"GUARDIAN! FETCH ME THAT", "EARTHLING'S HELMET!\"", 0 },
	{ S_LOADOUT, 2, 0, 0, 0, 0, 0 },
	{ S_FIGHT, 0, 0, 0, 0, 0, 0 },
	{ S_AFTER, 0, 0, 0, "THE GUARDIAN REELED! BUT ITS", "MASTER'S FURNACES COULD FORGE", "IT ANEW, HOTTER THAN EVER..." },
	{ S_FIGHT, 1, 0, 0, 0, 0, 0 },
	{ S_AFTER, 1, 0, 0, "ITS BODY WAS SCRAP. BUT THE", "BRAIN-POD TORE ITSELF FREE", "AND FLED FOR THE SURFACE!" },
	{ S_FIGHT, 4, 0, 0, 0, 0, 0 },
	{ S_AFTER, 4, 0, 0, "THE POD FELL BURNING FROM THE", "SKY. ACE HAD WON THE DAY...", 0 },
	{ S_STORY, 3, 0, 0, "\"YOU WRECKED MY GUARDIAN!", "NEXT TIME, EARTHLING,", "YOU FACE ME!\"" },
	{ S_END, 3, 0, 0, "TO BE CONTINUED IN", "ASTRO ACE NO.2!", "PRESS START" },
};
static const char* const W_NAME[3] = { "< SPREAD >   FIVE-WAY FAN", "< MACHINE >   RAPID FIRE", "< LASER >   PIERCING BEAM" };

static void step_begin(int i) {
	const Step* s = &script[i];
	step_i = i; step_t = 0; restart = 0; cap_row = 2;
	peace = s->kind != S_FIGHT;
	switch (s->kind) {
	case S_TITLE: load_room(2); h.hide = 1; break;
	case S_STORY:
		load_room(s->room); cam = s->a; h.hide = s->room != 0;
		if (s->room == 0) { h.x = FX(46); safe_x = h.x; }
		break;
	case S_AFTER:
		for (int j = 0; j < NENEMY; j++) if (en[j].type != O_FIRE && en[j].type != O_DRUM) en[j].type = 0;
		for (int j = 0; j < NEBUL; j++) ebul[j].on = 0;
		for (int j = 0; j < NSHOT; j++) shots[j].on = 0;
		h.inv = 0;
		cap_open(s->l1, s->l2, s->l3);
		break;
	case S_LOADOUT:
		load_room(2); h.hide = 1; cap_row = 15;
		cap_open("CHOOSE YOUR BLASTER, ACE!", W_NAME[loadout - 1], "LEFT/RIGHT: PICK      A: FIGHT!");
		while (!cap_step()) {}
		break;
	case S_FIGHT: lives = 3; weapon = loadout; load_room(s->room); break;
	case S_END: cap_open(s->l1, s->l2, s->l3); break;
	}
}

int main(void) {
	copy16(OBJPAL, obj_pal, obj_pal_len);
	copy32(OBJ_TILE(OBJ_COMMON_BASE), objbank_common, objbank_common_len);
	BGCNT(0) = 0 | (0 << 2) | (26 << 8) | (1 << 14);
	BGCNT(1) = 1 | (0 << 2) | (28 << 8) | (1 << 14);
	BGCNT(2) = 2 | (2 << 2) | (30 << 8);
	BGCNT(3) = 3 | (2 << 2) | (31 << 8);
	BLDCNT = 0x00BF; BLDY = 16;
	DISPSTAT = 0x0008; IE = 1; IME = 1;
	DISPCNT = 0x1F40;                            // mode 0, BG0-3, OBJ, 1D obj mapping
#ifdef START_STEP
	step_begin(START_STEP);
#else
	step_begin(0);
#endif
	int rprev = 0;
	for (;;) {
		vsync();
		oam_flush();
		int sh = shake ? ((frame & 2) ? 2 : -2) : 0;
		if (shake) shake--;
		BGHOFS(0) = cam; BGHOFS(1) = cam; BGHOFS(2) = cam >> 1; BGHOFS(3) = cam >> 2;
		BGVOFS(1) = sh; BGVOFS(2) = sh; BGVOFS(3) = sh;
		if (fade) { fade--; BLDY = fade >> 1; if (!fade) BLDCNT = 0; }
		if (rm->cycle && (frame & 15) == 0) { u16 t = BGPAL[16 + CYC_A]; BGPAL[16 + CYC_A] = BGPAL[16 + CYC_B]; BGPAL[16 + CYC_B] = t; }
		frame++;
		int real = ~KEYS & 0x3FF, rpress = real & ~rprev, go = rpress & (K_A | K_START);
		rprev = real;
		const Step* s = &script[step_i];
		step_t++;
		switch (s->kind) {
		case S_TITLE:
			seed += frame;
			if (rpress & K_START) step_begin(1);
			continue;
		case S_END:
			if (cap_on && (frame & 1)) cap_step();
			if (rpress & K_START) step_begin(0);
			continue;
		case S_LOADOUT: {
			int d = (rpress & K_RIGHT) ? 1 : (rpress & K_LEFT) ? 2 : 0;
			if (d) {
				loadout = 1 + (loadout - 1 + d) % 3;
				cap_open("CHOOSE YOUR BLASTER, ACE!", W_NAME[loadout - 1], "LEFT/RIGHT: PICK      A: FIGHT!");
				while (!cap_step()) {}
			}
			for (int i = 0; i < 3; i++)
				ms_draw(&ms_items[ITEMS_BADGE_S + i], 96 + i * 24, 113 - (i == loadout - 1 ? 6 + ((frame >> 3) & 1) : 0), 0, 2, 0, 0);
			if (go) step_begin(step_i + 1);
			continue;
		}
		case S_STORY:
		case S_AFTER: {
			prev = keys;
			keys = (s->kind == S_STORY && s->room == 0 && step_t < 46) ? K_RIGHT : 0;
			if (s->kind == S_AFTER || s->room == 0) hero_update();
			else h.hide = 1;
			enemies_update();
			shots_update();
			spawner();
			if (s->kind == S_STORY && cam != s->b && !cap_on) {
				cam += s->room == 1 ? 2 : 1;
				if (cam > s->b || go) cam = s->b;
			} else if (!cap_on) {
				if (step_t > 20) cap_open(s->l1, s->l2, s->l3);
			} else {
				int done = (frame & 1) ? cap_step() : 0;
				if (go) {
					if (cap_line < 3) { while (!cap_step()) {} }
					else { step_begin(step_i + 1); continue; }
				}
				(void) done;
			}
			draw();
			continue;
		}
		case S_FIGHT:
			prev = keys; keys = real;
#ifdef QUICK
			h.inv = 2;
#endif
			hero_update();
			if (restart) { step_begin(step_i); continue; }
			if (sled.cd) sled.cd--;
			enemies_update();
			shots_update();
			spawner();
			{
				int target = (h.x >> 8) - 120 + h.face * 24;
				if (target < 0) target = 0;
				if (target > ROOM_W - 240) target = ROOM_W - 240;
				cam += (target - cam + (target > cam ? 7 : 0)) >> 3;
			}
			draw();
			if (boss_dead && !h.dead && ++boss_dead > 80) step_begin(step_i + 1);
			continue;
		}
	}
}
