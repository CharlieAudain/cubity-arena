import { SmartDevice } from '../SmartDevice';
import { LogicalCube } from '../../engine/LogicalCube';
import { ConnectionStatus } from '../types';
// @ts-ignore
import * as aesjs from 'aes-js';
import { QIYI_ENCRYPTION_KEYS } from '../encryptionKeys';

const UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';
const SERVICE_UUID = '0000fff0' + UUID_SUFFIX;
const CHRCT_UUID_CUBE = '0000fff6' + UUID_SUFFIX;


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


    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    const serviceUUIDs = services.map(s => s.uuid);
    
    await this.attach(device, server, serviceUUIDs);
  }

  async attach(device: BluetoothDevice, server: BluetoothRemoteGATTServer, serviceUUIDs: string[]): Promise<void> {
    this.device = device;
    
   
    this.service = await server.getPrimaryService(SERVICE_UUID);
    
   
    this.characteristic = await this.service.getCharacteristic(CHRCT_UUID_CUBE);

    // Setup Encryption
    const key = QIYI_ENCRYPTION_KEYS[0];
    this.aesEcb = new aesjs.ModeOfOperation.ecb(key);

    await this.characteristic.startNotifications();
    this.characteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

    // Send Hello
    const mac = await this.waitForAdvs();
    await this.sendHello(mac);

    this.deviceName = device.name || 'QiYi Cube';
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
      
      // Decrypt
      if (!this.aesEcb) return;

      const msg = new Uint8Array(value.length);
      for (let i = 0; i < value.length; i += 16) {
          const block = value.slice(i, i + 16);
          const decryptedBlock = this.aesEcb.decrypt(block);
          msg.set(decryptedBlock, i);
      }

      // Parse
      const len = msg[1];
      const validMsg = msg.slice(0, len);
      
      // CRC check
      if (this.crc16modbus(Array.from(validMsg)) !== 0) {
          console.warn('[QiYiDriver] CRC Error');
          return;
      }

      const opcode = validMsg[2];
      const ts = (validMsg[3] << 24 | validMsg[4] << 16 | validMsg[5] << 8 | validMsg[6]) >>> 0; // unsigned

      if (opcode === 0x02) { // Hello
          const battery = validMsg[35];
          this.emit('battery', battery);
          this.sendMessage(Array.from(validMsg.slice(2, 7))); // ACK
          
      } else if (opcode === 0x03) { // State Change
          this.sendMessage(Array.from(validMsg.slice(2, 7))); // ACK
          
          // Parse Moves
          // Taking the latest move from the packet.
          const latestMoveVal = validMsg[34];
          const axis = [4, 1, 3, 0, 2, 5][(latestMoveVal - 1) >> 1];
          const power = latestMoveVal & 1; // 0 or 1
          
          const suffix = power === 0 ? "" : "'";
          const move = "URFDLB".charAt(axis) + suffix;
          
          this.emit('move', { move, timestamp: Date.now(), state: "", timeDelta: 0 });
          LogicalCube.getInstance().then(cube => cube.applyMove(move));
          
          this.lastTs = ts;
      }
  }
}
