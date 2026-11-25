/** Observe new portions of the media timeline while the player is visible. */
export class PlaybackClock {
    total = 0;
    private position: number | null = null;
    private elapsed = 0;
    private furthest = 0;

    interrupt() {
        this.position = null;
    }

    observe(positionMs: number, elapsedMs: number) {
        if (!Number.isFinite(positionMs) || !Number.isFinite(elapsedMs) || positionMs <= 0) {
            this.interrupt();
            return;
        }
        if (this.position === positionMs) return;
        if (this.position !== null) {
            const delta = positionMs - this.position,
                wall = elapsedMs - this.elapsed;
            if (wall > 0 && wall <= 3000 && delta > 0 && delta <= wall + 300) {
                this.total = Math.min(
                    1800000,
                    this.total +
                        Math.min(wall, Math.max(0, positionMs - Math.max(this.position, this.furthest))),
                );
            }
        }
        this.furthest = Math.max(this.furthest, positionMs);
        this.position = positionMs;
        this.elapsed = elapsedMs;
    }
}
