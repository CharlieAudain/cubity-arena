import { SmartDevice } from '../SmartDevice';
import { LogicalCube } from '../../engine/LogicalCube';
import { ConnectionStatus } from '../types';

import * as aesjs from 'aes-js';
import { MOYU_ENCRYPTION_KEYS, deriveKey, parseMacAddress } from '../encryptionKeys';

// Old Moyu
const MOYU_OLD_SERVICE = '00001000-0000-1000-8000-00805f9b34fb';
const MOYU_OLD_WRITE = '00001001-0000-1000-8000-00805f9b34fb';
const MOYU_OLD_READ = '00001002-0000-1000-8000-00805f9b34fb';
const MOYU_OLD_TURN = '00001003-0000-1000-8000-00805f9b34fb';
const MOYU_OLD_GYRO = '00001004-0000-1000-8000-00805f9b34fb';

// New Moyu (AI 2023)
const MOYU_NEW_SERVICE = '0783b03e-7735-b5a0-1760-a305d2795cb0';
const MOYU_NEW_READ = '0783b03e-7735-b5a0-1760-a305d2795cb1';
const MOYU_NEW_WRITE = '0783b03e-7735-b5a0-1760-a305d2795cb2';


export class MoyuDriver extends SmartDevice {
  private service: BluetoothRemoteGATTService | null = null;
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private readCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private turnCharacteristic: BluetoothRemoteGATTCharacteristic | null = null; // Old only
  
  private protocol: 'OLD' | 'NEW' = 'OLD';
  private aesCbc: aesjs.ModeOfOperation.ModeOfOperationCBC | null = null;
  private iv: Uint8Array | null = null;

  // State tracking for Old protocol
  private faceStatus = [0, 0, 0, 0, 0, 0];

  constructor() {
    super();
  }

  async connect(device: BluetoothDevice): Promise<void> {
    this.device = device;
    if (!device.gatt) throw new Error('No GATT server');

  
    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    const serviceUUIDs = services.map(s => s.uuid);
    
    await this.attach(device, server, serviceUUIDs);
  }

  async attach(device: BluetoothDevice, server: BluetoothRemoteGATTServer, serviceUUIDs: string[]): Promise<void> {
    this.device = device;
    this.deviceName = device.name || 'Moyu Cube';
    
    // Detect Protocol
    if (serviceUUIDs.includes(MOYU_NEW_SERVICE)) {
        this.service = await server.getPrimaryService(MOYU_NEW_SERVICE);
        this.protocol = 'NEW';
        
    } else if (serviceUUIDs.includes(MOYU_OLD_SERVICE)) {
        this.service = await server.getPrimaryService(MOYU_OLD_SERVICE);
        this.protocol = 'OLD';
        
    } else {
        throw new Error('No supported Moyu protocol found');
    }

    if (this.protocol === 'NEW') {
        this.readCharacteristic = await this.service.getCharacteristic(MOYU_NEW_READ);
        this.writeCharacteristic = await this.service.getCharacteristic(MOYU_NEW_WRITE);
        
        // Setup Encryption
        await this.setupEncryption(device);
        
        await this.readCharacteristic.startNotifications();
        this.readCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotificationNew.bind(this));
        
        // Init requests
        await this.sendRequestNew(161); // Info
        await this.sendRequestNew(163); // Status
        await this.sendRequestNew(164); // Power
        
    } else {
        this.writeCharacteristic = await this.service.getCharacteristic(MOYU_OLD_WRITE);
        this.readCharacteristic = await this.service.getCharacteristic(MOYU_OLD_READ);
        this.turnCharacteristic = await this.service.getCharacteristic(MOYU_OLD_TURN);
        
        await this.readCharacteristic.startNotifications();
        await this.turnCharacteristic.startNotifications();
        
        this.readCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotificationOldRead.bind(this));
        this.turnCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotificationOldTurn.bind(this));
    }

    this.status = ConnectionStatus.CONNECTED;
    this.emit('status', ConnectionStatus.CONNECTED);
    
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.status = ConnectionStatus.DISCONNECTED;
    this.emit('status', ConnectionStatus.DISCONNECTED);
  }

  async reset(): Promise<void> {
      if (this.protocol === 'NEW') {
          await this.sendRequestNew(163);
      }
  }

  async syncState(): Promise<void> {
      if (this.protocol === 'NEW') {
          await this.sendRequestNew(163);
      }
  }

  async markAsSolved(): Promise<void> {
      // No-op
  }

  // --- NEW Protocol Handling ---

  private async setupEncryption(device: BluetoothDevice): Promise<void> {
      // Extract MAC address from advertisement data to derive session keys.
      // This requires the device to be broadcasting manufacturer data.
      // Falls back to a default MAC if unavailable, which may cause encryption failure.
      const mac = await this.waitForAdvs();
      
      const macBytes = parseMacAddress(mac);
      const { key, iv } = deriveKey(MOYU_ENCRYPTION_KEYS[0], MOYU_ENCRYPTION_KEYS[1], macBytes);
      
      this.aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
      this.iv = new Uint8Array(iv);
  }

  private async waitForAdvs(): Promise<string> {
      if (!this.device || !this.device.watchAdvertisements) {
          console.warn('[MoyuDriver] Watch Advertisements API not supported. Encryption might fail.');
          return '00:00:00:00:00:00'; // Fallback?
      }
      
      return new Promise((resolve) => {
          const abortController = new AbortController();
          const signal = abortController.signal;
          
          const onAdv = (event: any) => {
              const mfData = event.manufacturerData;
              // Moyu CICs? cstimer checks 0x0100 to 0xFF00.
              for (const [id, dataView] of mfData.entries()) {
                  if (dataView.byteLength >= 6) {
                      const mac: string[] = [];
                      for (let i = 0; i < 6; i++) {
                          const byte = dataView.getUint8(dataView.byteLength - i - 1);
                          mac.push((byte + 0x100).toString(16).slice(1));
                      }
                      this.device!.removeEventListener('advertisementreceived', onAdv);
                      abortController.abort();
                      resolve(mac.join(':'));
                      return;
                  }
              }
          };
          
          this.device!.addEventListener('advertisementreceived', onAdv);
          this.device!.watchAdvertisements({ signal }).catch(console.warn);
      });
  }

  private handleNotificationNew(event: Event): void {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      let value = new Uint8Array(target.value!.buffer);
      
      // Decrypt

      if (this.aesCbc && this.iv) {
          // Decrypt using AES-CBC. The library handles standard CBC decryption.
          value = this.aesCbc.decrypt(value);
      }
      
      // Parse
      // Convert to bit string
      let bitStr = "";
      for (let i = 0; i < value.length; i++) {
          bitStr += (value[i] + 256).toString(2).slice(1);
      }
      
      const msgType = parseInt(bitStr.slice(0, 8), 2);
      
      if (msgType === 165) { // Move
          this.handleMoveNew(bitStr);
      } else if (msgType === 163) { // State
          this.handleStateNew(bitStr);
      } else if (msgType === 164) { // Battery
          const level = parseInt(bitStr.slice(8, 16), 2);
          this.emit('battery', level);
      }
  }

  private handleMoveNew(bitStr: string): void {
      // 5 moves per packet
      for (let i = 0; i < 5; i++) {
          const m = parseInt(bitStr.slice(96 + i * 5, 101 + i * 5), 2);
          if (m >= 12) continue; // Invalid/Padding
          
          const axisVal = m >> 1; // 0..5 -> FBUDLR
          const pow = m & 1;   // 0 -> 90 deg, 1 -> -90 deg
          
          // Map FBUDLR to Standard URFDLB
          // F(0)->2, B(1)->5, U(2)->0, D(3)->3, L(4)->4, R(5)->1
          const map = [2, 5, 0, 3, 4, 1];
          const stdAxis = map[axisVal];
          const suffix = pow === 0 ? "" : "'";
          
          const move = "URFDLB".charAt(stdAxis) + suffix;
          
          this.emit('move', { move, timestamp: Date.now(), state: "", timeDelta: 0 });
          LogicalCube.getInstance().then(cube => cube.applyMove(move));
      }
  }
  
  private handleStateNew(bitStr: string): void {
      // Parse facelets
      // cstimer parseFacelet
      // ...
      // For now, ignore state updates or implement later.
  }

  private async sendRequestNew(opcode: number): Promise<void> {
      if (!this.writeCharacteristic || !this.aesCbc) return;
      
      const req = new Uint8Array(20);
      req[0] = opcode;
      
      // Encrypt
      const encrypted = this.aesCbc.encrypt(req);
      await this.writeCharacteristic.writeValue(new Uint8Array(encrypted));
  }

  // --- OLD Protocol Handling ---

  private handleNotificationOldRead(event: Event): void {
      // Log?
  }

  private handleNotificationOldTurn(event: Event): void {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      const data = target.value!;
      
      if (data.byteLength < 1) return;
      const n_moves = data.getUint8(0);
      
      for (let i = 0; i < n_moves; i++) {
          const offset = 1 + i * 6;
          const face = data.getUint8(offset + 4);
          const dir = Math.round(data.getUint8(offset + 5) / 36);
          
          const prevRot = this.faceStatus[face];
          const curRot = this.faceStatus[face] + dir;
          this.faceStatus[face] = (curRot + 9) % 9;
          
          // Map face to axis
          // cstimer: [3, 4, 5, 1, 2, 0][face] -> URFDLB
          // 0->3(D), 1->4(L), 2->5(B), 3->1(R), 4->2(F), 5->0(U)
          const axis = [3, 4, 5, 1, 2, 0][face];
          
          let pow = 0; // 1 (90)
          if (prevRot >= 5 && curRot <= 4) pow = 2; // -90
          else if (prevRot <= 4 && curRot >= 5) pow = 0; // 90
          else continue;
          
          const suffix = pow === 2 ? "'" : ""; // cstimer: " 2'".charAt(pow) -> 0=" ", 2="'"
          const move = "URFDLB".charAt(axis) + suffix;
          
          this.emit('move', { move, timestamp: Date.now(), state: "", timeDelta: 0 });
          LogicalCube.getInstance().then(cube => cube.applyMove(move));
      }
  }
}
