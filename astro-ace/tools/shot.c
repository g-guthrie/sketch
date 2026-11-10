// Headless mGBA runner: plays a ROM with scripted input and dumps frames.
// usage: shot rom.gba script.txt
// script lines:   run <frames> [KEYS]     e.g. "run 60 RIGHT+B"
//                 shot <file.ppm>
//                 rec <prefix> <frames> <every> [KEYS]   (dump every Nth frame)
#include <mgba/core/core.h>
#include <mgba/core/config.h>
#include <mgba/core/log.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void nolog(struct mLogger* l, int cat, enum mLogLevel lv, const char* f, va_list a) {
	(void) l; (void) cat; (void) lv; (void) f; (void) a;
}
static struct mLogger logger = { .log = nolog };

static unsigned keys(const char* s) {
	static const char* names[] = { "A", "B", "SELECT", "START", "RIGHT", "LEFT", "UP", "DOWN", "R", "L" };
	unsigned k = 0;
	char buf[128];
	strncpy(buf, s, 127);
	buf[127] = 0;
	for (char* t = strtok(buf, "+"); t; t = strtok(NULL, "+"))
		for (int i = 0; i < 10; i++)
			if (!strcmp(t, names[i])) k |= 1u << i;
	return k;
}

static void dump(const char* path, const uint32_t* px, unsigned w, unsigned h) {
	FILE* f = fopen(path, "wb");
	fprintf(f, "P6\n%u %u\n255\n", w, h);
	for (unsigned i = 0; i < w * h; i++) {
		unsigned char c[3] = { px[i] & 255, (px[i] >> 8) & 255, (px[i] >> 16) & 255 };
		fwrite(c, 1, 3, f);
	}
	fclose(f);
}

int main(int argc, char** argv) {
	if (argc < 3) return 1;
	mLogSetDefaultLogger(&logger);
	struct mCore* core = mCoreFind(argv[1]);
	if (!core) { fprintf(stderr, "no core\n"); return 1; }
	core->init(core);
	mCoreInitConfig(core, NULL);
	unsigned w, h;
	core->desiredVideoDimensions(core, &w, &h);
	uint32_t* px = calloc(w * h, 4);
	core->setVideoBuffer(core, (color_t*) px, w);
	if (!mCoreLoadFile(core, argv[1])) { fprintf(stderr, "load failed\n"); return 1; }
	core->reset(core);
	FILE* s = fopen(argv[2], "r");
	char line[256], a[128], b[128];
	while (fgets(line, sizeof line, s)) {
		int n = 0, every = 1;
		a[0] = b[0] = 0;
		if (sscanf(line, "run %d %127s", &n, a) >= 1) {
			core->setKeys(core, keys(a));
			for (int i = 0; i < n; i++) core->runFrame(core);
		} else if (sscanf(line, "rec %127s %d %d %127s", b, &n, &every, a) >= 3) {
			core->setKeys(core, keys(a));
			for (int i = 0; i < n; i++) {
				core->runFrame(core);
				if (i % every == 0) {
					char p[200];
					snprintf(p, sizeof p, "%s%04d.ppm", b, i / every);
					dump(p, px, w, h);
				}
			}
		} else if (sscanf(line, "shot %127s", a) == 1) {
			dump(a, px, w, h);
		}
	}
	return 0;
}
