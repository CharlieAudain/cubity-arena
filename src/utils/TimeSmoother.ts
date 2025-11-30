/**
 * TimeSmoother
 * 
 * A pure math utility to smooth out jittery hardware timestamps using Linear Regression.
 * Ported from cstimer's `giiker.js` (tsLinearFix/tsLinearFit).
 * 
 * Logic:
 * Maintains a rolling buffer of (HardwareTime, LocalTime) pairs.
 * Calculates the best-fit line (Slope & Intercept) to predict LocalTime from HardwareTime.
 * Handles hardware timestamp wrapping (integer overflow).
 */
export class TimeSmoother {
    private buffer: { h: number; l: number }[] = [];
    private readonly MAX_BUFFER_SIZE = 20;
    
    // Wrap handling
    private lastRawHardwareTime: number = -1;
    private hardwareOffset: number = 0;
    private readonly WRAP_THRESHOLD = 30000; // Assume 16-bit wrap if drop > 30000 (typical for 65536)
    private readonly WRAP_VALUE = 65536; // 16-bit wrap value

    /**
     * Add a data point to the smoother.
     * @param hardwareTime Raw hardware timestamp (can wrap).
     * @param localTime Local system timestamp (Date.now()).
     */
    public add(hardwareTime: number, localTime: number): void {
        // Handle wrapping
        if (this.lastRawHardwareTime !== -1) {
            if (this.lastRawHardwareTime - hardwareTime > this.WRAP_THRESHOLD) {
                // Wrapped forward (e.g. 65530 -> 10)
                this.hardwareOffset += this.WRAP_VALUE;
            } else if (hardwareTime - this.lastRawHardwareTime > this.WRAP_THRESHOLD) {
                // Wrapped backward? (Unlikely, but possible if packets arrive out of order significantly, 
                // but we assume monotonic stream. If out of order, this might be a bug, but we'll ignore for now)
                // Or maybe reset?
            }
        }
        this.lastRawHardwareTime = hardwareTime;

        const linearHardwareTime = hardwareTime + this.hardwareOffset;

        this.buffer.push({ h: linearHardwareTime, l: localTime });

        // Keep buffer size fixed
        if (this.buffer.length > this.MAX_BUFFER_SIZE) {
            this.buffer.shift();
        }
    }

    /**
     * Get the predicted local time for a given hardware timestamp.
     * @param hardwareTime Raw hardware timestamp.
     * @returns Predicted local timestamp.
     */
    public getAdjustedTime(hardwareTime: number): number {
        // Apply current offset (assuming hardwareTime is close to recent adds)
        // If hardwareTime is "future" relative to last add, it might have wrapped?
        // We assume hardwareTime passed here is consistent with the stream.
        
        // If we just wrapped in `add`, we should use that offset.
        // But if `getAdjustedTime` is called with a new time BEFORE `add` is called, we might miss the wrap.
        // Usually `add` is called, then we might query.
        // Or we query for the *current* point.
        
        // For safety, we re-check wrap relative to lastRaw? 
        // No, `getAdjustedTime` is usually called for the *same* point we just added, or for a point we are about to process.
        // Let's assume the offset is valid for the vicinity of the last added point.
        
        // However, if we are predicting for a NEW point that hasn't been added yet:
        let offset = this.hardwareOffset;
        if (this.lastRawHardwareTime !== -1 && (this.lastRawHardwareTime - hardwareTime > this.WRAP_THRESHOLD)) {
             // It looks like it wrapped compared to our last known state
             offset += this.WRAP_VALUE;
        }

        const linearH = hardwareTime + offset;

        // If not enough data, return simple offset based on last point
        if (this.buffer.length < 2) {
            if (this.buffer.length === 1) {
                const last = this.buffer[0];
                return linearH - last.h + last.l;
            }
            return Date.now(); // Fallback
        }

        // Linear Regression
        const { slope, intercept } = this.calculateRegression();
        return slope * linearH + intercept;
    }

    /**
     * Reset the smoother state.
     */
    public reset(): void {
        this.buffer = [];
        this.lastRawHardwareTime = -1;
        this.hardwareOffset = 0;
    }

    /**
     * Calculate Slope and Intercept using Least Squares.
     */
    private calculateRegression(): { slope: number; intercept: number } {
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        const n = this.buffer.length;

        for (const point of this.buffer) {
            sumX += point.h;
            sumY += point.l;
            sumXY += point.h * point.l;
            sumXX += point.h * point.h;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }
}
