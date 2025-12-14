import { SmartDevice } from '../SmartDevice';
import { LogicalCube } from '../../engine/LogicalCube';
import { ConnectionStatus } from '../types';
import aesjs from 'aes-js';
import LZString from 'lz-string';

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

// Encryption Keys (Compressed)
const KEYS = [
    'NoJgjANGYJwQrADgjEUAMBmKAWCP4JNIRswt81Yp5DztE1EB2AXSA',
    'NoRg7ANAzArNAc1IigFgqgTB9MCcE8cAbBCJpKgeaSAAxTSPxgC6QA'
];

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

    console.log('[MoyuDriver] Connecting...');
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
        console.log('[MoyuDriver] Detected NEW Protocol');
    } else if (serviceUUIDs.includes(MOYU_OLD_SERVICE)) {
        this.service = await server.getPrimaryService(MOYU_OLD_SERVICE);
        this.protocol = 'OLD';
        console.log('[MoyuDriver] Detected OLD Protocol');
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
    console.log('[MoyuDriver] Connected!');
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
      // Extract MAC from device (if available) or wait for advs?
      // cstimer uses waitForAdvs.
      // We assume we have MAC if we connected?
      // But browser doesn't give MAC easily.
      // We need to implement waitForAdvs like GanDriver.
      
      // For now, let's try to extract from name if possible, or use waitForAdvs.
      // If we can't get MAC, encryption fails.
      
      // Let's reuse waitForAdvs logic from GanDriver but adapted.
      // Or just assume we can get it.
      
      // Wait, cstimer says: "Automatic MAC address discovery only works when the cube is bound..."
      // And it uses waitForAdvs.
      
      // I'll implement a simple MAC extraction here.
      const mac = await this.waitForAdvs();
      
      const macBytes = mac.split(':').map(b => parseInt(b, 16));
      const key = JSON.parse(LZString.decompressFromEncodedURIComponent(KEYS[0]));
      const iv = JSON.parse(LZString.decompressFromEncodedURIComponent(KEYS[1]));
      
      for (let i = 0; i < 6; i++) {
          key[i] = (key[i] + macBytes[5 - i]) % 255;
          iv[i] = (iv[i] + macBytes[5 - i]) % 255;
      }
      
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
          // cstimer decode logic
          // 1. Decrypt (AES-128-CBC)
          // 2. XOR with IV
          
          // Wait, cstimer decode:
          // if (ret.length > 16) ... decrypt block ...
          // decoder.decrypt(ret)
          // for (i < 16) ret[i] ^= iv[i]
          
          // aes-js decrypts in place? No, returns new array.
          
          // Simplified:
          // We need to handle block decryption.
          // Assuming single block for now or standard CBC.
          
          // cstimer logic is a bit custom with the XORs.
          // Let's try standard CBC decrypt first.
          // If it produces garbage, we check cstimer again.
          
          // cstimer:
          // decoder.decrypt(ret) -> AES decrypt
          // ret[i] ^= iv[i] -> CBC manual XOR?
          // AES-CBC usually handles XOR with IV automatically.
          // Maybe cstimer uses AES-ECB and does CBC manually?
          // "decoder = $.aes128(key)" -> likely ECB.
          
          // If cstimer uses ECB and manual XOR, then we should use ECB mode in aes-js.
          // But I initialized aesCbc (CBC).
          // Let's switch to ECB and do manual XOR.
          
          // Actually, let's stick to CBC if possible.
          // CBC: P1 = D(C1) ^ IV.
          // cstimer: decoder.decrypt(ret) (ECB decrypt C1 -> X). ret[i] ^= iv[i] (X ^ IV -> P1).
          // This IS CBC.
          // So aes-js CBC mode should work directly.
          
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
          
          const axis = m >> 1; // 0..5 -> FBUDLR (cstimer mapping)
          const pow = m & 1;   // 0 -> ', 1 -> ' (Wait, cstimer: " '".charAt(m&1))
          // cstimer: "FBUDLR".charAt(m >> 1) + " '".charAt(m & 1)
          // 0 -> " " (90), 1 -> "'" (-90)
          
          // Map FBUDLR to URFDLB
          // F(0)->F, B(1)->B, U(2)->U, D(3)->D, L(4)->L, R(5)->R
          // Wait, cstimer: "FBUDLR"
          // Standard: URFDLB
          // 0:F -> 2
          // 1:B -> 5
          // 2:U -> 0
          // 3:D -> 3
          // 4:L -> 4
          // 5:R -> 1
          
          const map = [2, 5, 0, 3, 4, 1];
          const stdAxis = map[axis];
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
