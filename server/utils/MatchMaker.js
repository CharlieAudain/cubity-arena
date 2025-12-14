const WAIT_THRESHOLD_SMALL = 5;
const WAIT_THRESHOLD_LARGE = 10;
const ELO_RANGE_SMALL = 100;
const ELO_RANGE_MEDIUM = 300;
const ELO_RANGE_LARGE = Infinity;

/**
 * Matchmaking Queue using Ripple Search Algorithm.
 */
export class MatchQueue {
    constructor() {
        this.queue = [];
    }

    /**
     * Adds a player to the matchmaking queue.
     * @param {Object} player - The player object.
     * @param {string} player.socketId - The player's socket ID.
     * @param {number} player.elo - The player's Elo rating.
     */
    addPlayer(player) {
        // Avoid duplicates
        if (this.queue.find(p => p.socketId === player.socketId)) {
            return;
        }

        this.queue.push({
            socketId: player.socketId,
            elo: player.elo,
            joinTime: Date.now()
        });
    }

    /**
     * Removes a player from the queue.
     * @param {string} socketId - The socket ID to remove.
     */
    removePlayer(socketId) {
        this.queue = this.queue.filter(p => p.socketId !== socketId);
    }

    /**
     * Attempts to find a match for players in the queue.
     * Uses a "Ripple Search" which expands the Elo range over time.
     * 
     * - < 5s: +/- 100 Elo
     * - 5-10s: +/- 300 Elo
     * - > 10s: Any Elo
     * 
     * @returns {{player1: Object, player2: Object} | null} The matched pair or null.
     */
    findMatch() {
        const now = Date.now();

        // Sort by joinTime? Or just iterate? 
        // Iterating in order ensures FIFO priority for the "searching" player.
        // But usually we want to match the oldest waiter first.
        // Let's assume queue order is roughly insertion order (FIFO).

        for (let i = 0; i < this.queue.length; i++) {
            const p1 = this.queue[i];
            const waitTime = (now - p1.joinTime) / 1000; // in seconds

            let range = ELO_RANGE_SMALL;
            if (waitTime > WAIT_THRESHOLD_LARGE) {
                range = ELO_RANGE_LARGE;
            } else if (waitTime >= WAIT_THRESHOLD_SMALL) {
                range = ELO_RANGE_MEDIUM;
            }

            // Look for an opponent
            for (let j = i + 1; j < this.queue.length; j++) {
                const p2 = this.queue[j];

                // Check Elo difference
                const diff = Math.abs(p1.elo - p2.elo);

                if (diff <= range) {
                    // Match Found!
                    // Remove both from queue
                    this.removePlayer(p1.socketId);
                    this.removePlayer(p2.socketId);

                    return { player1: p1, player2: p2 };
                }
            }
        }

        return null;
    }
}
