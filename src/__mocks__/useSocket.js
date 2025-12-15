import { jest } from '@jest/globals';

export const mockEmit = jest.fn();

export const useSocket = () => ({
    emit: mockEmit,
    on: jest.fn(),
    off: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
});
export const socket = {}; 
