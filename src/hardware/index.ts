/**
 * Hardware Abstraction Layer (HAL)
 * 
 * Provides a unified interface for communicating with smart cubes
 * from different manufacturers (GAN, GoCube, Moyu, QiYi).
 * 
 * @example
 * ```typescript
 * import { GanDriver, CubeMove } from '@/hardware';
 * 
 * const driver = new GanDriver();
 * 
 * driver.on('move', (move: CubeMove) => {
 *   console.log(`Move: ${move.move}, State: ${move.state}`);
 * });
 * 
 * const device = await navigator.bluetooth.requestDevice({
 *   filters: [{ namePrefix: 'GAN' }]
 * });
 * 
 * await driver.connect(device);
 * ```
 */

// Core types
export * from './types';

// Abstract base class
export { SmartDevice } from './SmartDevice';

// Encryption utilities
export * from './encryptionKeys';

// Concrete drivers
export { GanDriver } from './drivers/GanDriver';
