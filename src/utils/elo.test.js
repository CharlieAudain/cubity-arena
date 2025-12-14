import { calculateEloChange } from './elo';

describe('calculateEloChange', () => {
    test('standard match (800 vs 800) - Player A wins', () => {
        const ratingA = 800;
        const ratingB = 800;
        const actualScoreA = 1; // Win

        const result = calculateEloChange(ratingA, ratingB, actualScoreA);

        // Expected Calculation:
        // Expected Score for A = 1 / (1 + 10^0) = 0.5
        // New Rating A = 800 + 32 * (1 - 0.5) = 800 + 16 = 816
        // New Rating B = 800 + 32 * (0 - 0.5) = 800 - 16 = 784

        expect(result.newRatingA).toBe(816);
        expect(result.newRatingB).toBe(784);
    });

    test('standard match (800 vs 800) - Draw', () => {
        const ratingA = 800;
        const ratingB = 800;
        const actualScoreA = 0.5; // Draw

        const result = calculateEloChange(ratingA, ratingB, actualScoreA);

        // Expected: No change
        expect(result.newRatingA).toBe(800);
        expect(result.newRatingB).toBe(800);
    });

    test('standard match (800 vs 800) - Player A loses', () => {
        const ratingA = 800;
        const ratingB = 800;
        const actualScoreA = 0; // Loss

        const result = calculateEloChange(ratingA, ratingB, actualScoreA);

        // Expected: A loses 16, B gains 16
        expect(result.newRatingA).toBe(784);
        expect(result.newRatingB).toBe(816);
    });

    test('ensure rating never drops below 0', () => {
        const ratingA = 10;
        const ratingB = 1000;
        const actualScoreA = 0; // Loss

        // Expected A = 10 + 32 * (0 - ~0.003) ~= 9.9 (rounds to 10? or drops?)
        // Let's use a case where it effectively drops below 0 if not clamped.
        // If A is 0 and loses.
        const result = calculateEloChange(0, 1000, 0);
        expect(result.newRatingA).toBe(0);
    });
});
