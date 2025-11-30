/**
 * Core type definitions for the Hardware Abstraction Layer (HAL).
 * These types standardize how smart cube data flows through the application.
 */

/**
 * Connection status of the smart device.
 */
export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
}

/**
 * Represents a single move detected by the smart cube.
 */
export interface CubeMove {
  /**
   * Standard cube notation (e.g., "R", "U'", "F2")
   */
  move: string;

  /**
   * Hardware timestamp from the device (milliseconds)
   */
  timestamp: number;

  /**
   * 54-character facelet string representing the cube state after this move.
   * Format: UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
   * Where each character represents a face color (U=Up, R=Right, F=Front, D=Down, L=Left, B=Back)
   */
  state: string;

  /**
   * Time elapsed since the previous move (milliseconds).
   * Used for TPS (Turns Per Second) calculations.
   */
  timeDelta: number;

  /**
   * Raw hardware timestamp (if available).
   * Useful for precise timing analysis and drift correction.
   */
  hardwareTime?: number;
}

/**
 * Information about the connected smart device.
 */
export interface DeviceInfo {
  /**
   * Device name (e.g., "GAN-12345", "GoCube-XYZ")
   */
  name: string;

  /**
   * Battery level (0-100)
   */
  batteryLevel: number;

  /**
   * Hardware version string (e.g., "1.2.3")
   */
  hardwareVersion: string;

  /**
   * MAC address of the device.
   * Required for Moyu/QiYi encryption key derivation.
   * Format: "AA:BB:CC:DD:EE:FF"
   */
  macAddress: string | null;
}
