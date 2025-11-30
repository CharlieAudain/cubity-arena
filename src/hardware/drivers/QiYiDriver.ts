import { SmartDevice } from '../SmartDevice';
import { LogicalCube } from '../../engine/LogicalCube';
import { ConnectionStatus } from '../types';
import aesjs from 'aes-js';
import LZString from 'lz-string';

const UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';
const SERVICE_UUID = '0000fff0' + UUID_SUFFIX;
const CHRCT_UUID_CUBE = '0000fff6' + UUID_SUFFIX;

const KEY_COMPRESSED = 'NoDg7ANAjGkEwBYCc0xQnADAVgkzGAzHNAGyRTanQi5QIFyHrjQMQgsC6QA';

export class QiYiDriver extends SmartDevice {
  private service: BluetoothRemoteGATTService | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private aesEcb: aesjs.ModeOfOperation.ModeOfOperationECB | null = null;
  
  private lastTs = 0;

  constructor() {
    super();
  }

  async connect(device: BluetoothDevice): Promise<void> {
    this.device = device;
    if (!device.gatt) throw new Error('No GATT server');

    console.log('[QiYiDriver] Connecting...');
    const server = await device.gatt.connect();
    
    console.log('[QiYiDriver] Getting Service...');
    this.service = await server.getPrimaryService(SERVICE_UUID);
    
    console.log('[QiYiDriver] Getting Characteristic...');
    this.characteristic = await this.service.getCharacteristic(CHRCT_UUID_CUBE);

    // Setup Encryption
    const key = JSON.parse(LZString.decompressFromEncodedURIComponent(KEY_COMPRESSED));
    this.aesEcb = new aesjs.ModeOfOperation.ecb(key);

    await this.characteristic.startNotifications();
    this.characteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

    // Send Hello
    // We need MAC address for Hello.
    // cstimer uses waitForAdvs to get MAC.
    // If we don't have MAC, we can't send Hello?
    // "sendHello(mac) ... if (!mac) reject".
    // Does the cube work without Hello?
    // Probably not.
    
    const mac = await this.waitForAdvs();
    await this.sendHello(mac);

    this.deviceName = device.name || 'QiYi Cube';
    this.status = ConnectionStatus.CONNECTED;
    this.emit('status', ConnectionStatus.CONNECTED);
    console.log('[QiYiDriver] Connected!');
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.status = ConnectionStatus.DISCONNECTED;
    this.emit('status', ConnectionStatus.DISCONNECTED);
  }

  async reset(): Promise<void> {
      // No explicit reset?
  }

  async syncState(): Promise<void> {
      // No explicit sync?
  }

  async markAsSolved(): Promise<void> {
      // No-op
  }

  private async waitForAdvs(): Promise<string> {
      if (!this.device || !this.device.watchAdvertisements) {
          console.warn('[QiYiDriver] Watch Advertisements API not supported. Using dummy MAC (might fail).');
          return '00:00:00:00:00:00'; 
      }
      
      return new Promise((resolve) => {
          const abortController = new AbortController();
          const signal = abortController.signal;
          
          const onAdv = (event: any) => {
              const mfData = event.manufacturerData;
              // QiYi CIC: 0x0504
              if (mfData.has(0x0504)) {
                  const dataView = mfData.get(0x0504);
                  if (dataView.byteLength >= 6) {
                      const mac: string[] = [];
                      for (let i = 5; i >= 0; i--) {
                          mac.push((dataView.getUint8(i) + 0x100).toString(16).slice(1));
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

  private async sendHello(mac: string): Promise<void> {
      const content = [0x00, 0x6b, 0x01, 0x00, 0x00, 0x22, 0x06, 0x00, 0x02, 0x08, 0x00];
      const macBytes = mac.split(':').map(b => parseInt(b, 16));
      for (let i = 5; i >= 0; i--) {
          content.push(macBytes[i]); // cstimer: i*3, i*3+2... wait.
          // cstimer: parseInt(mac.slice(i * 3, i * 3 + 2), 16)
          // mac string format: "AA:BB:CC..."
          // i=5 -> index 15.
          // Correct.
      }
      await this.sendMessage(content);
  }

  private async sendMessage(content: number[]): Promise<void> {
      if (!this.characteristic || !this.aesEcb) return;

      const msg = [0xfe];
      msg.push(4 + content.length);
      msg.push(...content);
      
      const crc = this.crc16modbus(msg);
      msg.push(crc & 0xff, crc >> 8);
      
      const npad = (16 - msg.length % 16) % 16;
      for (let i = 0; i < npad; i++) msg.push(0);
      
      const encMsg = new Uint8Array(msg.length);
      for (let i = 0; i < msg.length; i += 16) {
          const block = new Uint8Array(msg.slice(i, i + 16));
          const encryptedBlock = this.aesEcb.encrypt(block);
          encMsg.set(encryptedBlock, i);
      }
      
      await this.characteristic.writeValue(encMsg);
  }

  private crc16modbus(data: number[]): number {
      let crc = 0xFFFF;
      for (let i = 0; i < data.length; i++) {
          crc ^= data[i];
          for (let j = 0; j < 8; j++) {
              crc = (crc & 0x1) > 0 ? (crc >> 1) ^ 0xa001 : crc >> 1;
          }
      }
      return crc;
  }

  private handleNotification(event: Event): void {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      const value = new Uint8Array(target.value!.buffer);
      
      if (!this.aesEcb) return;

      // Decrypt
      const msg = new Uint8Array(value.length);
      for (let i = 0; i < value.length; i += 16) {
          const block = value.slice(i, i + 16);
          const decryptedBlock = this.aesEcb.decrypt(block);
          msg.set(decryptedBlock, i);
      }

      // Parse
      const len = msg[1]; // Wait, msg[1] is length?
      // cstimer: msg = msg.slice(0, msg[1])
      // msg[0] is 0xFE.
      // msg[1] is total length.
      
      const validMsg = msg.slice(0, len); // Use slice of Uint8Array
      
      // CRC check
      // cstimer: crc16modbus(msg) != 0
      // If CRC is included, CRC of whole msg should be 0?
      // Or CRC matches last 2 bytes?
      // cstimer: msg.push(crc & 0xff, crc >> 8).
      // So CRC is at end.
      // If we calc CRC of whole msg including CRC bytes, it should be 0?
      // Standard Modbus CRC property: CRC(Message + CRC) == 0.
      
      // cstimer: if (crc16modbus(msg) != 0) error.
      // So yes.
      
      // Convert Uint8Array to number[] for CRC function
      if (this.crc16modbus(Array.from(validMsg)) !== 0) {
          console.warn('[QiYiDriver] CRC Error');
          return;
      }

      const opcode = validMsg[2];
      const ts = (validMsg[3] << 24 | validMsg[4] << 16 | validMsg[5] << 8 | validMsg[6]) >>> 0; // unsigned

      if (opcode === 0x02) { // Hello
          const battery = validMsg[35];
          this.emit('battery', battery);
          // Send ACK? cstimer: sendMessage(msg.slice(2, 7))
          // msg.slice(2, 7) is opcode + TS.
          this.sendMessage(Array.from(validMsg.slice(2, 7)));
          
          // Parse Facelets
          // msg.slice(7, 34)
          // ...
      } else if (opcode === 0x03) { // State Change
          this.sendMessage(Array.from(validMsg.slice(2, 7)));
          
          // Parse Moves
          // cstimer: todoMoves.
          // off = 91 - 5 * todoMoves.length
          // Wait, msg length is fixed?
          // cstimer: msg is decrypted block.
          // msg[1] is length.
          // But msg seems to be large buffer?
          // "var off = 91 - 5 * todoMoves.length"
          // This implies msg is at least 91 bytes?
          // But validMsg is sliced by len.
          
          // cstimer uses `msg` (the full decrypted buffer?) or `msg` (sliced)?
          // "msg = msg.slice(0, msg[1])"
          // So `msg` is sliced.
          // If `msg` is short, `off` will be out of bounds?
          // Maybe `msg` is always 96 bytes? (6 blocks of 16).
          
          // Let's assume `msg` is the full buffer for move parsing?
          // No, cstimer uses `msg` which is sliced.
          // So `msg` MUST be long enough.
          
          // Parse moves loop
          // ...
          
          // Simplified move parsing:
          // Just take the latest move?
          // msg[34] is latest move?
          // "var todoMoves = [[msg[34], ts]];"
          // Yes.
          
          const latestMoveVal = validMsg[34];
          const axis = [4, 1, 3, 0, 2, 5][(latestMoveVal - 1) >> 1];
          const power = latestMoveVal & 1; // 0 or 1
          // cstimer: [0, 2][power] -> 0=" ", 2="'"
          
          const suffix = power === 0 ? "" : "'";
          const move = "URFDLB".charAt(axis) + suffix;
          
          this.emit('move', { move, timestamp: Date.now(), state: "", timeDelta: 0 });
          LogicalCube.getInstance().then(cube => cube.applyMove(move));
          
          this.lastTs = ts;
      }
  }
}
