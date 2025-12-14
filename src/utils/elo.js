/**
 * Standard K-factor for Elo calculations.
 * Represents the maximum possible rating adjustment per game.
 */
export const K_FACTOR = 32;

/**
 * Calculates the new Elo ratings for two players after a match.
 * 
 * The Elo rating system is a method for calculating the relative skill levels of players in zero-sum games.
 * The core formula is: R' = R + K * (S - E)
 * Where:
 * - R' is the new rating
 * - R is the old rating
 * - K is the K-factor (maximum possible adjustment per game). We use K=32.
 * - S is the actual score (1 for win, 0.5 for draw, 0 for loss)
 * - E is the expected score
 * 
 * The Expected Score (E) is calculated as:
 * E_A = 1 / (1 + 10 ^ ((R_B - R_A) / 400))
 * 
 * @param {number} playerARating - Current rating of Player A
 * @param {number} playerBRating - Current rating of Player B
 * @param {number} actualScorePlayerA - Score of Player A (1 = Win, 0.5 = Draw, 0 = Loss)
 * @returns {{newRatingA: number, newRatingB: number}} An object containing the new ratings for both players.
 */
export const calculateEloChange = (playerARating, playerBRating, actualScorePlayerA) => {
    // Calculate Expected Score for Player A and Player B
    // expectedScoreA + expectedScoreB = 1
    const expectedScoreA = 1 / (1 + Math.pow(10, (playerBRating - playerARating) / 400));
    const expectedScoreB = 1 / (1 + Math.pow(10, (playerARating - playerBRating) / 400));

    // Calculate Actual Score for Player B
    const actualScorePlayerB = 1 - actualScorePlayerA;

    // Calculate New Ratings
    let newRatingA = playerARating + K_FACTOR * (actualScorePlayerA - expectedScoreA);
    let newRatingB = playerBRating + K_FACTOR * (actualScorePlayerB - expectedScoreB);

    // Round to nearest integer (standard practice for Elo display)
    newRatingA = Math.round(newRatingA);
    newRatingB = Math.round(newRatingB);

    // Ensure rating never drops below 0
    return {
        newRatingA: Math.max(0, newRatingA),
        newRatingB: Math.max(0, newRatingB)
    };
};
