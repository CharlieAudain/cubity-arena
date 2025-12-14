import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MatchQueue } from './MatchMaker.js';

describe('MatchQueue Ripple Search', () => {
    let matchQueue;

    beforeEach(() => {
        // Reset queue before each test
        matchQueue = new MatchQueue();
        // Mock Date.now to allow time manipulation
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should match 1200 ELO vs 2000 ELO after 11 seconds (Range Expansion)', () => {
        // Player A: 1200 ELO (Joins at T=0)
        const playerA = { socketId: 'socket_A', elo: 1200 };
        matchQueue.addPlayer(playerA);

        // Player B: 2000 ELO (Joins at T=0)
        const playerB = { socketId: 'socket_B', elo: 2000 };
        matchQueue.addPlayer(playerB);

        // Initial check at T=0 (Diff = 800)
        // Rule: < 5s -> +/- 100. Should NOT match.
        let match = matchQueue.findMatch();
        expect(match).toBeNull();

        // Advance time by 4 seconds (T=4s)
        jest.advanceTimersByTime(4000);
        match = matchQueue.findMatch();
        expect(match).toBeNull();

        // Advance time to T=6s
        // Rule: 5-10s -> +/- 300. Diff is 800. Should NOT match.
        jest.advanceTimersByTime(2000); 
        match = matchQueue.findMatch();
        expect(match).toBeNull();

        // Advance time to T=11s (Total 11s passed)
        // Rule: > 10s -> Any ELO. Should MATCH.
        jest.advanceTimersByTime(5000); 
        match = matchQueue.findMatch();

        expect(match).toBeDefined();
        // Sort specifically to handle return order agnostic check
        const playerIds = [match.player1.socketId, match.player2.socketId].sort();
        expect(playerIds).toEqual(['socket_A', 'socket_B']);
        
        // Verify queue is empty after match
        expect(matchQueue.queue.length).toBe(0);
    });
});
