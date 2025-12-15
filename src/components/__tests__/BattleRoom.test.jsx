import React from 'react';
import { render, screen } from '@testing-library/react';
import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import BattleRoom from '../BattleRoom';

// Mocks
jest.mock('../TimerView', () => () => <div data-testid="timer-view">TimerView</div>);
jest.mock('../SmartCube3D', () => () => <div data-testid="smart-cube-3d">SmartCube3D</div>);
jest.mock('../../utils/cube', () => ({
    getSolvedState: () => [],
    applyMoveToFacelets: () => [],
    SOLVED_FACELETS: [],
}));
jest.mock('../../engine/LogicalCube', () => ({
    LogicalCube: class {
        static async getInstance() { return new this(); }
        constructor() {}
        reset() {}
        on() {}
        off() {}
        checkState() {}
    }
}));
jest.mock('../../hooks/useWebRTC', () => ({
    useWebRTC: () => ({
        localStream: null,
        remoteStream: null,
        connectionStatus: 'connected'
    })
}));
// useSocket is already mocked globally in jest.config.js via src/__mocks__/useSocket.js
// firebase/firestore is also mocked globally

// Lucide icons mock (optional, but good for cleanliness)
jest.mock('lucide-react', () => ({
    Swords: () => <svg />,
    Crown: () => <svg />,
    Frown: () => <svg />,
    Activity: () => <svg />,
    Clock: () => <svg />,
    Zap: () => <svg />,
    X: () => <svg />,
}));

describe('BattleRoom', () => {
    const mockUser = { uid: 'test-uid', displayName: 'Auth Name' };
    const mockUserData = { displayName: 'Dainz', elo: 1500 };
    const mockRoomData = {
        player1: { uid: 'test-uid' },
        player2: { uid: 'opponent-uid', displayName: 'Opponent' }
    };

    it('should display userData (profile) name and Elo', () => {
        render(
            <BattleRoom 
                user={mockUser}
                userData={mockUserData}
                roomData={mockRoomData}
                roomId="room-123"
                onExit={() => {}}
                smartCube={{}}
            />
        );

        // Should prefer userData.displayName ("Dainz") over user.displayName ("Auth Name")
        expect(screen.getByText('Dainz')).toBeTruthy();
        // Should display userData.elo (1500)
        expect(screen.getByText(/1500 ELO/)).toBeTruthy();
    });

    it('should fallback to auth name if userData is missing', () => {
        render(
            <BattleRoom 
                user={mockUser}
                userData={null}
                roomData={mockRoomData}
                roomId="room-123"
                onExit={() => {}}
                smartCube={{}}
            />
        );

        // Should use auth name "Auth Name"
        expect(screen.getByText('Auth Name')).toBeTruthy();
    });
});
