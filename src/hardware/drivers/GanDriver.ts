/**
 * GAN Smart Cube Driver (V4 Protocol)
 * Based on cstimer's cstimerGan.js implementation
 */

import { SmartDevice } from '../SmartDevice';
import { ConnectionStatus, CubeMove } from '../types';
import { LogicalCube } from '../../engine/LogicalCube';
import LZString from 'lz-string';
// @ts-ignore
import * as aesjs from 'aes-js';
import mathlib from '../../lib/cstimer/mathlib';
import { GAN_KEYS, parseMacAddress, deriveKey } from '../encryptionKeys';
import { Logger } from '../../utils/Logger';

// V2 Service and Characteristic UUIDs
const SERVICE_UUID_V2DATA = '6e400001-b5a3-f393-e0a9-e50e24dc4179';
const CHRCT_UUID_V2READ = '28be4cb6-cd67-11e9-a32f-2a2ae2dbcce4';
const CHRCT_UUID_V2WRITE = '28be4a4a-cd67-11e9-a32f-2a2ae2dbcce4';

// V3 Service and Characteristic UUIDs
const SERVICE_UUID_V3DATA = '8653000a-43e6-47b7-9cb0-5fc21d4ae340';
const CHRCT_UUID_V3READ = '8653000b-43e6-47b7-9cb0-5fc21d4ae340';
const CHRCT_UUID_V3WRITE = '8653000c-43e6-47b7-9cb0-5fc21d4ae340';

// V4 Service and Characteristic UUIDs
const SERVICE_UUID_V4DATA = '00000010-0000-1000-8000-00805f9b34fb';
const CHRCT_UUID_V4READ = '0000fff6-0000-1000-8000-00805f9b34fb';
const CHRCT_UUID_V4WRITE = '0000fff5-0000-1000-8000-00805f9b34fb';

export class GanDriver extends SmartDevice {
  protected device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private readCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  // Encryption
  private encryptionKey: number[] = [];
  private encryptionIV: number[] = [];
  private aesDecryptor: any = null;

  // State
  public deviceName: string | null = null;
  public deviceMAC: string | null = null;
  private protocolVersion: 'V2' | 'V3' | 'V4' | null = null;
  private currentState: string = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  private internalState: string = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  private prevMoveCnt: number = -1;
  private isSynchronized: boolean = false;
  private hasAnchored: boolean = false;
  private moveBuffer: { move: string, moveCnt: number, timestamp: number }[] = [];
  private isProcessingBuffer = false;
  private commandQueue: (() => Promise<void>)[] = [];
  private isWriting = false;
  private isFetchingHistory = false;
  private moveHistory: { move: string, deviceTime: number, localTime: number }[] = [];

  constructor() {
    super();
    this.status = ConnectionStatus.DISCONNECTED;
  }



  /**
   * Connect using manual MAC address
   */
  async connectWithMac(macAddress: string): Promise<void> {
    try {
      Logger.log('GanDriver', 'Connecting with manual MAC:', macAddress);
      this.status = ConnectionStatus.CONNECTING;
      this.emit('status', this.status);

      // Request device with all possible GAN service UUIDs
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'GAN' }],
        optionalServices: [
          '0000fff0-0000-1000-8000-00805f9b34fb', // GAN V1/Common
          SERVICE_UUID_V2DATA,
          SERVICE_UUID_V3DATA,
          SERVICE_UUID_V4DATA,
          '00000010-0000-fff7-fff6-fff5fff4fff0'  // GAN V4 Variant
        ]
      });

      this.device = device;
      this.deviceName = device.name || 'GAN Cube';
      this.deviceMAC = macAddress;

      // Connect GATT
      const server = await device.gatt!.connect();
      this.server = server;

      // Detect protocol version by checking available services
      const services = await server.getPrimaryServices();
      const serviceUUIDs = services.map(s => s.uuid);
      Logger.log('GanDriver', 'Available services (UUIDs):', JSON.stringify(serviceUUIDs));
      
      // Check for V2
      let foundService = services.find(s => s.uuid === SERVICE_UUID_V2DATA);
      if (foundService) {
        Logger.log('GanDriver', 'Protocol: V2');
        this.service = foundService;
        await this.initV2Protocol(macAddress);
        return;
      }

      // Check for V3
      foundService = services.find(s => s.uuid === SERVICE_UUID_V3DATA);
      if (foundService) {
        Logger.log('GanDriver', 'Protocol: V3');
        this.service = foundService;
        await this.initV3Protocol(macAddress);
        return;
      }

      // Check for V4 (Standard)
      foundService = services.find(s => s.uuid === SERVICE_UUID_V4DATA);
      if (foundService) {
        Logger.log('GanDriver', 'Protocol: V4');
        this.service = foundService;
        await this.initV4Protocol(macAddress);
        return;
      }

      // Check for V4 (Detected Variant)
      // UUID: 00000010-0000-fff7-fff6-fff5fff4fff0
      foundService = services.find(s => s.uuid === '00000010-0000-fff7-fff6-fff5fff4fff0');
      if (foundService) {
        Logger.log('GanDriver', 'Protocol: V4 (Detected Variant)');
        this.service = foundService;
        await this.initV4Protocol(macAddress);
        return;
      }

      // Fallback: Check for 0000fff0 (Common GAN Service)
      foundService = services.find(s => s.uuid === '0000fff0-0000-1000-8000-00805f9b34fb');
      if (foundService) {
        Logger.log('GanDriver', 'Protocol: V4 (Detected via FFF0)');
        this.service = foundService;
        await this.initV4Protocol(macAddress);
        return;
      }

      throw new Error('No supported GAN protocol found on this device');
    } catch (error) {
      Logger.error('GanDriver', 'Connection failed:', error);
      this.status = ConnectionStatus.DISCONNECTED;
      this.emit('status', this.status);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Initialize V2/V3 protocol (both use same init)
   */
  private async initV2Protocol(macAddress: string): Promise<void> {
    this.protocolVersion = 'V2';
    this.initializeEncryption(macAddress);

    const chars = await this.service!.getCharacteristics();
    this.readCharacteristic = chars.find(c => c.uuid === CHRCT_UUID_V2READ) || null;
    this.writeCharacteristic = chars.find(c => c.uuid === CHRCT_UUID_V2WRITE) || null;

    if (!this.readCharacteristic || !this.writeCharacteristic) {
      throw new Error('Required V2 characteristics not found');
    }

    await this.readCharacteristic.startNotifications();
    this.readCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

    Logger.log('GanDriver', '🔥 Sending wake-up sequence...');
    await this.requestFaceletsV2();
    await this.requestBatteryV2();
    Logger.log('GanDriver', '✅ Wake-up complete');

    this.status = ConnectionStatus.CONNECTED;
    this.emit('status', this.status);
  }

  /**
   * Initialize V3 protocol
   */
  private async initV3Protocol(macAddress: string): Promise<void> {
    this.protocolVersion = 'V3';
    this.initializeEncryption(macAddress);

    const chars = await this.service!.getCharacteristics();
    this.readCharacteristic = chars.find(c => c.uuid === CHRCT_UUID_V3READ) || null;
    this.writeCharacteristic = chars.find(c => c.uuid === CHRCT_UUID_V3WRITE) || null;

    if (!this.readCharacteristic || !this.writeCharacteristic) {
      throw new Error('Required V3 characteristics not found');
    }

    await this.readCharacteristic.startNotifications();
    this.readCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

    Logger.log('GanDriver', '🔥 Sending wake-up sequence...');
    await this.requestFaceletsV3();
    await this.requestBatteryV3();
    Logger.log('GanDriver', '✅ Wake-up complete');

    this.status = ConnectionStatus.CONNECTED;
    this.emit('status', this.status);
  }

  /**
   * Initialize V4 protocol
   */
  private async initV4Protocol(macAddress: string): Promise<void> {
    this.protocolVersion = 'V4';
    this.initializeEncryption(macAddress);
    // ... (rest is same)

    const chars = await this.service!.getCharacteristics();
    const charUUIDs = chars.map(c => c.uuid);
    Logger.log('GanDriver', 'V4 Characteristics:', JSON.stringify(charUUIDs));

    this.readCharacteristic = chars.find(c => c.uuid === CHRCT_UUID_V4READ) || null;
    this.writeCharacteristic = chars.find(c => c.uuid === CHRCT_UUID_V4WRITE) || null;

    // Fallback: Try to find by short UUID if standard fails
    if (!this.readCharacteristic) {
      this.readCharacteristic = chars.find(c => c.uuid.includes('fff6')) || null;
      if (this.readCharacteristic) Logger.log('GanDriver', 'Found Read Char via partial match:', this.readCharacteristic.uuid);
    }
    if (!this.writeCharacteristic) {
      this.writeCharacteristic = chars.find(c => c.uuid.includes('fff5')) || null;
      if (this.writeCharacteristic) Logger.log('GanDriver', 'Found Write Char via partial match:', this.writeCharacteristic.uuid);
    }

    if (!this.readCharacteristic || !this.writeCharacteristic) {
      throw new Error('Required V4 characteristics not found');
    }

    await this.readCharacteristic.startNotifications();
    this.readCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

    Logger.log('GanDriver', '🔥 Sending wake-up sequence...');
    await this.requestHardwareInfo();
    await this.requestFacelets();
    await this.requestBattery();
    Logger.log('GanDriver', '✅ Wake-up complete');

    this.status = ConnectionStatus.CONNECTED;
    this.emit('status', this.status);
  }

  /**
   * Connect using an existing BluetoothDevice object
   */
  async connect(device: BluetoothDevice): Promise<void> {
    try {
      Logger.log('GanDriver', 'Connecting to device:', device.name);
      this.status = ConnectionStatus.CONNECTING;
      this.emit('status', this.status);

      this.device = device;
      this.deviceName = device.name || 'GAN Cube';

      // 1. Extract MAC from Manufacturer Data (BEFORE connecting)
      // Most devices stop advertising when connected, so we must do this first.
      let macAddress = this.deviceMAC || '';
      
      if (!macAddress) {
          try {
              macAddress = await this.waitForAdvs();
              this.deviceMAC = macAddress;
              Logger.log('GanDriver', 'Auto-detected MAC:', macAddress);
          } catch (err) {
              Logger.warn('GanDriver', 'Failed to auto-detect MAC:', err);
              // Fallback to manual prompt or empty
          }
      }

      // 2. Connect GATT
      Logger.log('GanDriver', 'Connecting GATT...');
      const server = await device.gatt!.connect();
      this.server = server;

      const services = await server.getPrimaryServices();
      const serviceUUIDs = services.map(s => s.uuid);
      Logger.log('GanDriver', 'Available services:', JSON.stringify(serviceUUIDs));

      // ... (Protocol matching logic)
      // We pass macAddress to init methods.

      let foundService = services.find(s => s.uuid === '6e400001-b5a3-f393-e0a9-e50e24dc4179');
      if (foundService) {
        this.service = foundService;
        await this.initV2Protocol(macAddress);
        return;
      }

      foundService = services.find(s => s.uuid === '8653000a-43e6-47b7-9cb0-5fc21d4ae340');
      if (foundService) {
        this.service = foundService;
        await this.initV3Protocol(macAddress);
        return;
      }

      foundService = services.find(s => s.uuid === SERVICE_UUID_V3DATA);
      if (foundService) {
        this.service = foundService;
        await this.initV3Protocol(this.deviceMAC || '');
        return;
      }

      foundService = services.find(s => s.uuid === SERVICE_UUID_V4DATA);
      if (foundService) {
        this.service = foundService;
        await this.initV4Protocol(this.deviceMAC || '');
        return;
      }
      
      // Variant
      foundService = services.find(s => s.uuid === '00000010-0000-fff7-fff6-fff5fff4fff0');
      if (foundService) {
        this.service = foundService;
        await this.initV4Protocol(this.deviceMAC || '');
        return;
      }

      // Fallback
      foundService = services.find(s => s.uuid === '0000fff0-0000-1000-8000-00805f9b34fb');
      if (foundService) {
        this.service = foundService;
        await this.initV4Protocol(this.deviceMAC || '');
        return;
      }

      throw new Error('No supported GAN protocol found');

    } catch (error) {
       Logger.error('GanDriver', 'Connection failed:', error);
       this.status = ConnectionStatus.DISCONNECTED;
       this.emit('status', this.status);
       throw error;
    }
  }

  /**
   * Disconnect from cube
   */
  disconnect(): void {
    if (this.readCharacteristic) {
      this.readCharacteristic.removeEventListener('characteristicvaluechanged', this.handleNotification.bind(this));
      this.readCharacteristic.stopNotifications().catch(() => {});
    }
    if (this.server) {
      this.server.disconnect();
    }
    this.device = null;
    this.server = null;
    this.service = null;
    this.readCharacteristic = null;
    this.writeCharacteristic = null;
    this.status = ConnectionStatus.DISCONNECTED;
    this.emit('status', this.status);
    Logger.log('GanDriver', 'Disconnected');
  }

  /**
   * Reset the cube's internal state
   */
  public async reset(): Promise<void> {
    this.moveHistory = [];
    this.moveBuffer = [];
    this.prevMoveCnt = -1;
    this.currentState = "";
    this.isSynchronized = false;
    this.hasAnchored = false;
    
    // Reset Logical Cube
    const cube = await LogicalCube.getInstance();
    cube.reset();
  }

  /**
   * Mark as solved (if supported)
   */
  public async markAsSolved(): Promise<void> {
      // GAN cubes don't have a direct "mark solved" command usually,
      // but we can reset internal state.
      // await this.reset();
      
      // Use LogicalCube recenter to fix desync
      const cube = await LogicalCube.getInstance();
      cube.recenter();
  }

  /**
   * Initialize encryption with MAC address
   */
  private initializeEncryption(macAddress: string): void {
    const macBytes = parseMacAddress(macAddress);
    
    // Decompress keys (V2/V3/V4 use indices 2 and 3)
    const keyCompressed = GAN_KEYS[2];
    const ivCompressed = GAN_KEYS[3];
    
    let key = JSON.parse(LZString.decompressFromEncodedURIComponent(keyCompressed));
    let iv = JSON.parse(LZString.decompressFromEncodedURIComponent(ivCompressed));
    
    // Derive keys using MAC (% 255, not 256!)
    const derived = deriveKey(key, iv, macBytes);
    this.encryptionKey = derived.key;
    this.encryptionIV = derived.iv;
    
    // Create AES decryptor (ECB mode)
    this.aesDecryptor = new aesjs.ModeOfOperation.ecb(new Uint8Array(this.encryptionKey));
    
    Logger.log('GanDriver', '🔐 Keys derived successfully for MAC:', macAddress);
  }

  /**
   * Decrypt data using cstimer's exact algorithm
   */
  private decode(value: DataView): Uint8Array {
    const ret = new Uint8Array(value.buffer);
    const iv = this.encryptionIV;

    // cstimer logic: decrypt last block first, XOR with IV
    if (ret.length > 16) {
      const offset = ret.length - 16;
      const block = this.aesDecryptor.decrypt(ret.slice(offset));
      for (let i = 0; i < 16; i++) {
        ret[i + offset] = block[i] ^ iv[i];
      }
    }

    // Decrypt first block, then XOR with IV
    const firstBlock = this.aesDecryptor.decrypt(ret.slice(0, 16));
    for (let i = 0; i < 16; i++) {
      ret[i] = firstBlock[i] ^ iv[i];
    }

    return ret;
  }

  /**
   * Encrypt data for sending
   */
  private encode(data: number[]): number[] {
    const ret = [...data];
    const iv = this.encryptionIV;

    // Encrypt first block: XOR with IV then encrypt
    for (let i = 0; i < 16; i++) {
      ret[i] ^= iv[i];
    }
    const encrypted = this.aesDecryptor.encrypt(new Uint8Array(ret.slice(0, 16)));
    for (let i = 0; i < 16; i++) {
      ret[i] = encrypted[i];
    }

    // Encrypt last block if length > 16: XOR with IV then encrypt
    if (ret.length > 16) {
      const offset = ret.length - 16;
      const block = ret.slice(offset);
      for (let i = 0; i < 16; i++) {
        block[i] ^= iv[i];
      }
      const encryptedBlock = this.aesDecryptor.encrypt(new Uint8Array(block));
      for (let i = 0; i < 16; i++) {
        ret[i + offset] = encryptedBlock[i];
      }
    }

    return ret;
  }

  /**
   * Handle incoming data notifications
   */
  private handleNotification(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;

    try {
      const decrypted = this.decode(value);
      
      if (this.protocolVersion === 'V4') {
        this.handleNotificationV4(decrypted);
      } else if (this.protocolVersion === 'V2') {
        this.handleNotificationV2(decrypted);
      } else if (this.protocolVersion === 'V3') {
        this.handleNotificationV3(decrypted);
      } else {
        Logger.warn('GanDriver', 'Unknown protocol version:', this.protocolVersion);
      }
    } catch (error) {
      Logger.error('GanDriver', 'Error handling notification:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleNotificationV4(decrypted: Uint8Array): void {
    const bits = this.toBitString(decrypted);
    const mode = parseInt(bits.slice(0, 8), 2);

    switch (mode) {
      case 0x01: // Move
        this.handleMovePacket(decrypted, bits);
        break;
      case 0xED: // Facelets
        this.handleFaceletsPacket(decrypted);
        break;
      case 0xD1: // Move History
        this.handleHistoryPacket(decrypted, bits);
        break;
      case 0xEC: // Gyro (Ignore)
        break;
      case 0x04: // Hardware Info (Response to 0xDD 0x04?)
        // This case seems to be for hardware info, but the provided snippet
        // contains battery level parsing. Assuming it's a new mode for battery or a typo.
        // If it's hardware info, this logic needs to be adjusted.
        // For now, keeping the battery logic as provided in the instruction.
        const len = parseInt(bits.slice(8, 16), 2);
        const level = parseInt(bits.slice(8 + len * 8, 16 + len * 8), 2);
        this.emit('battery', level);
        break;
      case 0xEF: // Battery packet (original V4 battery mode)
        // If 0x04 is the new battery mode, this case might become obsolete or handle a different battery format.
        // Keeping it for now, assuming 0x04 is a new type of packet that also contains battery info.
        const originalLen = parseInt(bits.slice(8, 16), 2);
        const originalLevel = parseInt(bits.slice(8 + originalLen * 8, 16 + originalLen * 8), 2);
        this.emit('battery', originalLevel);
        break;
      default:
        Logger.warn('GanDriver', 'V4 Unknown Packet:', Array.from(decrypted).map(b => b.toString(16).padStart(2, '0')).join(' '));
        break;
    }
  }

  private handleNotificationV2(decrypted: Uint8Array): void {
    // V2 Packet Structure
    const mode = decrypted[0];
    
    if (mode === 1) { // Move
      // V2 Move Packet might be similar to V4 but with different header
      // V4: Mode(1) | ...
      // Let's try to parse as move
      const bits = this.toBitString(decrypted);
      this.handleMovePacket(decrypted, bits);
    } else if (mode === 4) { // Facelets
      // Try to parse using V4 logic (compressed format)
      // V4 expects mode 0xED, but V2 sends mode 4.
      // We need to pass the data. parseFaceletsV4 uses bit string from the whole array.
      // If the data layout (after byte 0) is the same, it might work.
      try {
        const facelets = this.parseFaceletsV4(decrypted);
        if (facelets) {
          Logger.log('GanDriver', '✅ V2 Facelets parsed successfully!');
          this.handleFaceletsPacket(decrypted); // Reuse handler
        }
      } catch (e) {
        Logger.warn('GanDriver', 'V2 Facelet parse failed:', e);
        // Logger.log('GanDriver', 'V2 Raw:', Array.from(decrypted).map(b => b.toString(16).padStart(2, '0')).join(' '));
      }
    } else if (mode === 9) { // Battery
      const level = decrypted[1];
      this.emit('battery', level);
    } else {
      Logger.log('GanDriver', 'V2 Unknown Packet:', Array.from(decrypted).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  }

  private handleNotificationV3(decrypted: Uint8Array): void {
    // V3 Packet Structure (Likely very similar to V4)
    const bits = this.toBitString(decrypted);
    const mode = parseInt(bits.slice(0, 8), 2);

    if (mode === 1) { // Move
      this.handleMovePacket(decrypted, bits);
    } else if (mode === 2) { // Facelets (V3 uses opcode 2?)
      // Try parsing
      try {
        const facelets = this.parseFaceletsV4(decrypted);
        if (facelets) {
          Logger.log('GanDriver', '✅ V3 Facelets parsed successfully!');
          this.handleFaceletsPacket(decrypted);
        }
      } catch (e) {
        Logger.warn('GanDriver', 'V3 Facelet parse failed:', e);
      }
    } else if (mode === 9) { // Battery
       const level = decrypted[1];
       this.emit('battery', level);
    } else {
       Logger.log('GanDriver', 'V3 Unknown Packet:', Array.from(decrypted).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  }

  /**
   * Handle move packet (0x01)
   */
  private handleMovePacket(decrypted: Uint8Array, bits: string): void {
    const moveCnt = parseInt(bits.slice(56, 64) + bits.slice(48, 56), 2);
    
    // Attempt to extract hardware timestamp (Bytes 2-5, Little Endian?)
    // Bits 16-48
    const hwTime = parseInt(
      bits.slice(40, 48) + 
      bits.slice(32, 40) + 
      bits.slice(24, 32) + 
      bits.slice(16, 24), 
      2
    );

    if (moveCnt === this.prevMoveCnt || this.prevMoveCnt === -1) {
      // Even if moveCnt is same, we might want to update timestamp? 
      // But usually we ignore duplicates.
      if (this.prevMoveCnt === -1) this.prevMoveCnt = moveCnt;
      return;
    }
    const pow = parseInt(bits.slice(64, 66), 2);
    const axisVal = parseInt(bits.slice(66, 72), 2);
    const axis = [2, 32, 8, 1, 16, 4].indexOf(axisVal);
    
    if (axis === -1) {
      Logger.warn('GanDriver', 'Invalid axis:', axisVal);
      return;
    }

    let suffix = "";
    if (pow === 0) suffix = "";
    else if (pow === 1) suffix = "'";
    else if (pow === 2) suffix = "2";

    const move = "URFDLB".charAt(axis) + suffix;

    // Add to buffer and process
    this.moveBuffer.push({ move, moveCnt, timestamp: Date.now() });
    this.processMoveBuffer();
  }

  /**
   * Handle facelets packet (0xED)
   */
  private handleFaceletsPacket(decrypted: Uint8Array): void {
    const facelets = this.parseFaceletsV4(decrypted);
    if (!facelets) {
      Logger.warn('GanDriver', '⚠️ Facelet decode failed');
      return;
    }
    
    this.currentState = facelets;
    this.internalState = facelets;
    
    const moveCnt = (decrypted[3] << 8) | decrypted[2];
    
    if (!this.isSynchronized) {
      // Initial sync
      this.prevMoveCnt = moveCnt;
      this.isSynchronized = true;
      this.moveBuffer = [];
      Logger.log('GanDriver', `✅ Initial Sync! State: ${facelets.slice(0, 20)}...`);
      
      this.emit('reset', { state: facelets });
      LogicalCube.getInstance().then(cube => {
        cube.setHardwareState(facelets);
        Logger.log('GanDriver', '✅ LogicalCube synced to hardware state.');
      });
    } else {
      // Re-sync
      // Re-sync
      Logger.log('GanDriver', `🔄 Re-sync facelet packet received. MoveCnt: ${moveCnt}`);
      
      // Check for missed moves
      if (this.prevMoveCnt !== -1) {
        // Debounce: Only check for gaps if we haven't seen a move recently (200ms)
        // This prevents loops if the cube spams facelets while we are already fetching history.
        const lastMoveTime = this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1].localTime : 0;
        if (Date.now() - lastMoveTime > 200) {
            const diff = (moveCnt - this.prevMoveCnt) & 0xFF;
            if (diff > 0) {
               Logger.log('GanDriver', `⚠️ Detected gap in move count (Facelet): ${this.prevMoveCnt} -> ${moveCnt} (Diff: ${diff})`);
               if (moveCnt !== 0) { // Avoid 0-move bug
                 // Request history ending at moveCnt (inclusive).
                 // We request from moveCnt + 1 to cover moveCnt in the descending sequence.
                 const startMoveCnt = (moveCnt + 1) & 0xFF;
                 this.requestMoveHistory(startMoveCnt, diff + 1);
               }
            }
        } else {
            Logger.log('GanDriver', 'Ignoring facelet gap check (Debounced)');
        }
      }

      // Verify state matches (Optional, for debugging)
      // const currentFacelets = this.currentState;
      // if (currentFacelets && currentFacelets !== facelets) {
      //   console.warn('[GanDriver] State mismatch!', { current: currentFacelets, received: facelets });
      // }
      
      // Update move count if we are just syncing up (though history request should handle it)
      // this.prevMoveCnt = moveCnt; 
    }
  }

  /**
   * Request move history (V4)
   */
  private async requestMoveHistory(startMoveCnt: number, numberOfMoves: number): Promise<void> {
      if (!this.service) return;
      
      // Align to odd start number (cstimer logic)
      // If startMoveCnt is Even (e.g. 52), we want 52.
      // cstimer subtracts 1 -> 51.
      // Response (count 2): 51, 50.
      // We miss 52!
      
      // Wait, if we use cstimer logic, we MUST request FUTURE move (53) to get 52.
      // In handleFaceletsPacket, we now request moveCnt + 1.
      // In processMoveBuffer, we request nextMove.moveCnt.
      
      if (startMoveCnt % 2 === 0) {
          startMoveCnt = (startMoveCnt - 1) & 0xFF;
      }
      
      if (numberOfMoves % 2 === 1) numberOfMoves++;
      numberOfMoves = Math.min(numberOfMoves, startMoveCnt + 1);

      if (this.isFetchingHistory) {
          Logger.log('GanDriver', 'History request already in progress. Skipping.');
          return;
      }
      this.isFetchingHistory = true;

      Logger.log('GanDriver', `Requesting history: Start=${startMoveCnt}, Count=${numberOfMoves}`);

      const req = new Array(20).fill(0);
      req[0] = 0xD1;
      req[1] = 0x04;
      req[2] = startMoveCnt;
      req[4] = numberOfMoves;

      try {
          await this.sendRequest(req);
      } catch (e) {
          Logger.error('GanDriver', 'Failed to send history request:', e);
          this.isFetchingHistory = false; // Reset on error
      }
      // Note: isFetchingHistory remains true until we receive the packet or timeout
      // We should add a timeout to reset it.
      setTimeout(() => {
          if (this.isFetchingHistory) {
              Logger.warn('GanDriver', 'History request timed out. Resetting flag.');
              this.isFetchingHistory = false;
          }
      }, 1000);
  }

  /**
   * Handle move history packet (0xD1)
   */
  private handleHistoryPacket(decrypted: Uint8Array, bits: string): void {
      // 1. Decode all moves first
      const startMoveCnt = parseInt(bits.slice(16, 24), 2);
      const len = parseInt(bits.slice(8, 16), 2);
      const numberOfMoves = (len - 1) * 2;
      
      Logger.log('GanDriver', `Received history: Start=${startMoveCnt}, Count=${numberOfMoves}`);
      
      this.isFetchingHistory = false; // Request completed

      const allMoves: { move: string, moveCnt: number }[] = [];

      for (let i = 0; i < numberOfMoves; i++) {
          const axisVal = parseInt(bits.slice(24 + 4 * i, 27 + 4 * i), 2);
          const pow = parseInt(bits.slice(27 + 4 * i, 28 + 4 * i), 2);
          
          if (axisVal < 6) {
              const moveChar = "DUBFLR".charAt(axisVal);
              const suffix = pow === 1 ? "'" : ""; 
              const move = moveChar + suffix;
              // Note: startMoveCnt might be 0 (bugged). We calculate relative to it.
              const moveCnt = (startMoveCnt - i) & 0xFF;
              allMoves.push({ move, moveCnt });
          }
      }

      // 2. Process Moves
      if (allMoves.length > 0) {
          // Add all recovered moves to buffer
          for (const found of allMoves) {
              Logger.log('GanDriver', `Recovered move: ${found.move} (Cnt: ${found.moveCnt})`);
              this.moveBuffer.push({ move: found.move, moveCnt: found.moveCnt, timestamp: Date.now() });
          }
          
          // Process buffer (sort and apply)
          this.processMoveBuffer();
      } else {
          Logger.warn('GanDriver', 'History packet empty.');
      }
  }

  /**
   * Parse V4 facelet data (cstimer's exact algorithm)
   */
  private parseFaceletsV4(data: Uint8Array): string | null {
    const bitStr = this.toBitString(data);
    const cc = new mathlib.CubieCube();
    let cchk = 0xf00;
    let echk = 0;

    // Parse corners (split layout!)
    for (let i = 0; i < 7; i++) {
      const perm = parseInt(bitStr.slice(32 + i * 3, 35 + i * 3), 2);
      const ori = parseInt(bitStr.slice(53 + i * 2, 55 + i * 2), 2);
      cchk -= ori << 3;
      cchk ^= perm;
      cc.ca[i] = (ori << 3) | perm;
    }
    cc.ca[7] = (cchk & 0xff8) % 24 | (cchk & 0x7);

    // Parse edges
    for (let i = 0; i < 11; i++) {
      const perm = parseInt(bitStr.slice(69 + i * 4, 73 + i * 4), 2);
      const ori = parseInt(bitStr.slice(113 + i, 114 + i), 2);
      echk ^= (perm << 1) | ori;
      cc.ea[i] = (perm << 1) | ori;
    }
    cc.ea[11] = echk;

    // Verify
    if (cc.verify() !== 0) {
      Logger.warn('GanDriver', '❌ Decryption Verification Failed!');
      throw new Error('DECRYPTION_FAILED');
    }
    
    return cc.toFaceCube();
  }

  /**
   * Convert bytes to bit string
   */
  private toBitString(data: Uint8Array): string {
    let bitStr = "";
    for (let i = 0; i < data.length; i++) {
      bitStr += (data[i] + 256).toString(2).slice(1);
    }
    return bitStr;
  }

  /**
   * Send request to cube
   */
  private async sendRequest(req: number[]): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('Write characteristic not available');
    }
    
    // Add to queue
    return new Promise<void>((resolve, reject) => {
        this.commandQueue.push(async () => {
            try {
                const encoded = this.encode(req);
                await this.writeCharacteristic!.writeValue(new Uint8Array(encoded));
                resolve();
            } catch (e) {
                reject(e);
            }
        });
        
        this.processCommandQueue();
    });
  }

  private async processCommandQueue() {
      if (this.isWriting) return;
      this.isWriting = true;
      
      while (this.commandQueue.length > 0) {
          const cmd = this.commandQueue.shift();
          if (cmd) {
              try {
                  await cmd();
              } catch (e) {
                  Logger.error('GanDriver', 'Command failed:', e);
              }
              // Small delay between writes to be safe
              await new Promise(r => setTimeout(r, 20));
          }
      }
      
      this.isWriting = false;
  }

  /**
   * Request facelet state
   */
  private async requestFacelets(): Promise<void> {
    const req = new Array(20).fill(0);
    req[0] = 0xDD;
    req[1] = 0x04;
    req[3] = 0xED;
    await this.sendRequest(req);
  }

  /**
   * Request battery level
   */
  private async requestBattery(): Promise<void> {
    const req = new Array(20).fill(0);
    req[0] = 0xDD;
    req[1] = 0x04;
    req[3] = 0xEF;
    await this.sendRequest(req);
  }

  /**
   * Request hardware info (V4)
   */
  private async requestHardwareInfo(): Promise<void> {
    const req = new Array(20).fill(0);
    req[0] = 0xDF;
    req[1] = 0x03;
    await this.sendRequest(req);
  }

  /**
   * V2/V3 Request Methods
   */
  private async requestFaceletsV2(): Promise<void> {
    const req = new Array(20).fill(0);
    req[0] = 4; // Opcode for facelets
    await this.sendRequest(req);
  }

  private async requestBatteryV2(): Promise<void> {
    const req = new Array(20).fill(0);
    req[0] = 9; // Opcode for battery
    await this.sendRequest(req);
  }

  private async requestFaceletsV3(): Promise<void> {
    const req = new Array(16).fill(0);
    req[0] = 0x68;
    req[1] = 1; // Opcode for facelets
    await this.sendRequest(req);
  }

  private async requestBatteryV3(): Promise<void> {
    const req = new Array(16).fill(0);
    req[0] = 0x68;
    req[1] = 7; // Opcode for battery
    await this.sendRequest(req);
  }

  /**
   * Sync state (abstract method implementation)
   */
  async syncState(): Promise<void> {
    // Request fresh facelets from cube
    if (this.writeCharacteristic) {
      // Detect protocol and call appropriate method
      if (this.service?.uuid === SERVICE_UUID_V2DATA) {
        await this.requestFaceletsV2();
      } else if (this.service?.uuid === SERVICE_UUID_V3DATA) {
        await this.requestFaceletsV3();
      } else {
        await this.requestFacelets();
      }
    }
  }

  /**
   * Calculate linear regression for timestamp smoothing
   * Based on cstimer's tsLinearFit
   */
  private tsLinearFit(history: typeof this.moveHistory): { slope: number, intercept: number, r2: number } {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    let n = 0;

    for (const item of history) {
      const x = item.deviceTime;
      const y = item.localTime;
      if (isNaN(x) || isNaN(y)) continue;
      
      n++;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
    }

    if (n < 2) return { slope: 1, intercept: 0, r2: 1 };

    const varX = n * sumXX - sumX * sumX;
    const varY = n * sumYY - sumY * sumY;
    const covXY = n * sumXY - sumX * sumY;

    const slope = varX === 0 ? 1 : covXY / varX;
    const intercept = sumY / n - slope * sumX / n;
    const r2 = (varX === 0 || varY === 0) ? 1 : Math.pow(covXY, 2) / (varX * varY);

    return { slope, intercept, r2 };
  }

  /**
   * Process buffered moves in order
   */
  private async processMoveBuffer(): Promise<void> {
      if (this.isProcessingBuffer) return;
      this.isProcessingBuffer = true;

      try {
          const cube = await LogicalCube.getInstance();

          // Safety: If buffer gets too full (stuck), request manual reset
          // Safety: If buffer gets too full (stuck), request manual reset
          // Increased limit to 50 to handle bursts during history fetch
          if (this.moveBuffer.length > 50) {
              Logger.error('GanDriver', '🚨 Buffer stuck (len > 50). Clearing buffer and requesting facelets.');
              // Instead of fatal error, try to recover
              this.moveBuffer = []; 
              this.requestFacelets(); // Re-sync
              return;
          }

          // Filter out old moves (already processed)
          this.moveBuffer = this.moveBuffer.filter(m => {
              const diff = (m.moveCnt - this.prevMoveCnt) & 0xFF;
              return diff > 0 && diff < 100; // Keep only future moves
          });
          
          // Sort again to be safe
          this.moveBuffer.sort((a, b) => {
              const diffA = (a.moveCnt - this.prevMoveCnt) & 0xFF;
              const diffB = (b.moveCnt - this.prevMoveCnt) & 0xFF;
              return diffA - diffB;
          });

          // 2. Process moves
          while (this.moveBuffer.length > 0) {
              const nextMove = this.moveBuffer[0];
              const diff = (nextMove.moveCnt - this.prevMoveCnt) & 0xFF;
              
              if (diff === 0 || diff > 200) { // Duplicate or old move (wrap-around check)
                  this.moveBuffer.shift();
                  continue;
              }
              
              if (diff === 1) {
                  // Correct next move!
                  this.moveBuffer.shift();
                  this.prevMoveCnt = nextMove.moveCnt;
                  
                  Logger.log('GanDriver', `🟢 Applying Buffered Move: ${nextMove.move} (Cnt: ${nextMove.moveCnt})`);
                  
                  this.emit('move', { move: nextMove.move, timestamp: nextMove.timestamp, state: "", timeDelta: 0 });
                  cube.applyMove(nextMove.move, nextMove.timestamp);
              } else {
                  // Gap!
                  Logger.warn('GanDriver', `⚠️ Gap detected in buffer. Expected: ${this.prevMoveCnt + 1}, Got: ${nextMove.moveCnt} (Diff: ${diff})`);
                  
                  // Request history for the gap
                  const startMoveCnt = nextMove.moveCnt;
                  const count = diff - 1;
                  
                  this.requestMoveHistory(startMoveCnt, count);
                  
                  break; // Stop processing
              }
          }
      } finally {
          this.isProcessingBuffer = false;
      }
  }

  /**
   * Wait for advertisements to extract MAC address
   */
  private async waitForAdvs(): Promise<string> {
      if (!this.device || !this.device.watchAdvertisements) {
          throw new Error('Bluetooth Advertisements API not supported');
      }

      Logger.log('GanDriver', '⏳ Waiting for advertisements to extract MAC...');
      
      return new Promise((resolve, reject) => {
          const abortController = new AbortController();
          const signal = abortController.signal;

          const onAdvEvent = (event: any) => { // BluetoothAdvertisingEvent
              Logger.log('GanDriver', 'Advertisement received:', event);
              const mfData = event.manufacturerData;
              
              // GAN CICs are 0x0101, 0x0201, etc.
              // We check if any key in mfData matches.
              // mfData is a Map<number, DataView>
              
              for (const [id, dataView] of mfData.entries()) {
                  // Check if it looks like a GAN CIC (low byte 0x01?)
                  // cstimer checks against list.
                  // We'll just check if we can extract 6 bytes.
                  
                  if (dataView.byteLength >= 6) {
                      const mac: string[] = [];
                      // Extract last 6 bytes reversed
                      for (let i = 0; i < 6; i++) {
                          const byte = dataView.getUint8(dataView.byteLength - i - 1);
                          mac.push((byte + 0x100).toString(16).slice(1));
                      }
                      
                      const macStr = mac.join(':');
                      Logger.log('GanDriver', 'Found MAC in manufacturer data:', macStr);
                      
                      this.device!.removeEventListener('advertisementreceived', onAdvEvent);
                      abortController.abort();
                      resolve(macStr);
                      return;
                  }
              }
          };

          this.device!.addEventListener('advertisementreceived', onAdvEvent);
          this.device!.watchAdvertisements({ signal }).catch(err => {
              Logger.warn('GanDriver', 'Error watching advertisements:', err);
              // Don't reject immediately, maybe we already have data?
          });
          
          setTimeout(() => {
              this.device!.removeEventListener('advertisementreceived', onAdvEvent);
              abortController.abort();
              reject(new Error('Timeout waiting for advertisements'));
          }, 5000); // 5 seconds timeout
      });
  }
}
