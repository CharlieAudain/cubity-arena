import { renderHook, act } from '@testing-library/react';
import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { useMatchmaking } from '../useMatchmaking';
import { mockEmit } from '../useSocket'; // Import the mock directly

// Mock Firebase Auth
jest.mock('../../lib/firebase', () => ({
    auth: {
        currentUser: { uid: 'test-uid' }
    }
}));

jest.mock('firebase/auth', () => ({
    signOut: jest.fn(),
    getAuth: jest.fn(),
}));

describe('useMatchmaking', () => {
    beforeEach(() => {
        mockEmit.mockClear();
    });

    it('should prioritize userData (profile) over user (auth) for matchmaking', () => {
        const mockUser = { uid: '123', displayName: 'Auth Name', elo: null };
        const mockUserData = { displayName: 'Pro Gamer', elo: 1500 };

        const { result } = renderHook(() => useMatchmaking(mockUser, mockUserData));

        act(() => {
            result.current.findMatch('3x3');
        });

        expect(mockEmit).toHaveBeenCalledWith('join_queue', expect.objectContaining({
            user: expect.objectContaining({
                displayName: 'Pro Gamer',
                elo: 1500
            })
        }));
    });

    it('should fallback to user (auth) if userData is missing', () => {
        const mockUser = { uid: '123', displayName: 'Auth Name', elo: null }; // user.elo doesn't exist on Auth object usually

        const { result } = renderHook(() => useMatchmaking(mockUser, null));

        act(() => {
            result.current.findMatch('3x3');
        });

        expect(mockEmit).toHaveBeenCalledWith('join_queue', expect.objectContaining({
            user: expect.objectContaining({
                displayName: 'Auth Name',
                elo: 800 // Default fallback
            })
        }));
    });
});
