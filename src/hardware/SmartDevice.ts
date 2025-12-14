/**
 * Abstract base class for all smart cube drivers.
 * Implements the Hardware Abstraction Layer (HAL) contract.
 * 
 * All concrete drivers (GanDriver, GoCubeDriver, MoyuDriver) must extend this class
 * and implement the abstract methods.
 */

import { ConnectionStatus, CubeMove, DeviceInfo } from './types';

/**
 * Event types emitted by SmartDevice
 */
type SmartDeviceEvents = {
  move: CubeMove;
  status: ConnectionStatus;
  battery: number;
  facelets: string;
  reset: { state: string };
  error: Error;
};

/**
 * Event listener callback type
 */
type EventListener<T> = (data: T) => void;

/**
 * Abstract base class implementing the Hardware Abstraction Layer.
 * Uses a lightweight observer pattern for event handling.
 */
export abstract class SmartDevice {
  /**
   * The connected Bluetooth device (null if not connected)
   */
  protected device: BluetoothDevice | null = null;

  /**
   * Current connection status
   */
  /**
   * Current connection status
   */
  public status: ConnectionStatus = ConnectionStatus.DISCONNECTED;

  /**
   * Device Name
   */
  public deviceName: string | null = null;

  /**
   * Device MAC Address
   */
  public deviceMAC: string | null = null;

  /**
   * Device information (populated after successful connection)
   */
  protected deviceInfo: DeviceInfo | null = null;

  /**
   * Event listeners registry
   */
  private listeners: {
    move: Set<EventListener<CubeMove>>;
    status: Set<EventListener<ConnectionStatus>>;
    battery: Set<EventListener<number>>;
    facelets: Set<EventListener<string>>;
    reset: Set<EventListener<{ state: string }>>;
    error: Set<EventListener<Error>>;
  } = {
    move: new Set(),
    status: new Set(),
    battery: new Set(),
    facelets: new Set(),
    reset: new Set(),
    error: new Set(),
  };

  // ==================== Abstract Methods (Contract) ====================

  /**
   * Connect to the smart cube device.
   * Implementations must:
   * 1. Establish GATT connection
   * 2. Discover services and characteristics
   * 3. Perform encryption handshake (if required)
   * 4. Subscribe to notifications
   * 5. Emit 'status' events during connection process
   * 
   * @param device - The Bluetooth device to connect to
   * @throws Error if connection fails
   */
  /**
   * Connect to the smart cube device.
   * Implementations must:
   * 1. Establish GATT connection
   * 2. Discover services and characteristics
   * 3. Perform encryption handshake (if required)
   * 4. Subscribe to notifications
   * 5. Emit 'status' events during connection process
   * 
   * @param device - The Bluetooth device to connect to
   * @throws Error if connection fails
   */
  abstract connect(device: BluetoothDevice): Promise<void>;

  /**
   * Attach to an already connected device.
   * Used when the DriverManager handles the connection to inspect services.
   * 
   * @param device - The Bluetooth device
   * @param server - The connected GATT server
   * @param serviceUUIDs - List of available service UUIDs
   */
  abstract attach(device: BluetoothDevice, server: BluetoothRemoteGATTServer, serviceUUIDs: string[]): Promise<void>;

  /**
   * Disconnect from the smart cube device.
   * Implementations must:
   * 1. Stop characteristic notifications
   * 2. Disconnect GATT server
   * 3. Clean up internal state
   * 4. Emit 'status' event with DISCONNECTED
   */
  abstract disconnect(): void;

  /**
   * Reset the internal state and move history.
   * This does NOT reset the physical cube, only the driver's internal state.
   * 
   * Implementations should:
   * 1. Clear move history
   * Reset the cube's internal state (e.g., set to solved)
   */
  abstract reset(): Promise<void>;

  /**
   * Request synchronization with the hardware state (e.g. fetch facelets).
   */
  abstract syncState(): Promise<void>;

  /**
   * Mark the cube as solved (if supported by hardware)
   */
  abstract markAsSolved(): Promise<void>;

  // ==================== Event Emitter (Observer Pattern) ====================

  /**
   * Register an event listener.
   * 
   * @param event - Event type to listen for
   * @param callback - Function to call when event is emitted
   * 
   * @example
   * ```typescript
   * driver.on('move', (move) => {
   *   console.log(`Move detected: ${move.move}`);
   * });
   * ```
   */
  on<K extends keyof SmartDeviceEvents>(
    event: K,
    callback: EventListener<SmartDeviceEvents[K]>
  ): void {
    this.listeners[event].add(callback as any);
  }

  /**
   * Unregister an event listener.
   * 
   * @param event - Event type to stop listening for
   * @param callback - The callback function to remove
   */
  off<K extends keyof SmartDeviceEvents>(
    event: K,
    callback: EventListener<SmartDeviceEvents[K]>
  ): void {
    this.listeners[event].delete(callback as any);
  }

  /**
   * Emit an event to all registered listeners.
   * Protected - only subclasses can emit events.
   * 
   * @param event - Event type to emit
   * @param data - Data to pass to listeners
   */
  protected emit<K extends keyof SmartDeviceEvents>(
    event: K,
    data: SmartDeviceEvents[K]
  ): void {
    this.listeners[event].forEach((callback) => {
      try {
        (callback as any)(data);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    });
  }

  // ==================== Getters ====================

  /**
   * Get the current connection status.
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get device information (null if not connected).
   */
  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  /**
   * Get the connected Bluetooth device (null if not connected).
   */
  getDevice(): BluetoothDevice | null {
    return this.device;
  }

  /**
   * Check if the device is currently connected.
   */
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED;
  }
}
