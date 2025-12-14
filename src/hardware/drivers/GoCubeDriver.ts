import { SmartDevice } from '../SmartDevice';
import { LogicalCube } from '../../engine/LogicalCube';
import { ConnectionStatus } from '../types';

const UUID_SUFFIX = '-b5a3-f393-e0a9-e50e24dcca9e';
const SERVICE_UUID = '6e400001' + UUID_SUFFIX;
const CHRCT_UUID_WRITE = '6e400002' + UUID_SUFFIX;
const CHRCT_UUID_READ = '6e400003' + UUID_SUFFIX;

const WRITE_BATTERY = 50;
const WRITE_STATE = 51;

// Axis mapping from cstimer
// axisPerm = [5, 2, 0, 3, 1, 4] -> indices into URFDLB
// 0: U, 1: R, 2: F, 3: D, 4: L, 5: B
// cstimer: "URFDLB".charAt(axis)
const AXIS_PERM = [5, 2, 0, 3, 1, 4];

export class GoCubeDriver extends SmartDevice {
  private service: BluetoothRemoteGATTService | null = null;
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private readCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  constructor() {
    super();
  }

  async connect(device: BluetoothDevice): Promise<void> {
    this.device = device;
    
    if (!device.gatt) {
      throw new Error('Device has no GATT server');
    }

    console.log('[GoCubeDriver] Connecting...');
    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    const serviceUUIDs = services.map(s => s.uuid);
    
    await this.attach(device, server, serviceUUIDs);
  }

  async attach(device: BluetoothDevice, server: BluetoothRemoteGATTServer, serviceUUIDs: string[]): Promise<void> {
    this.device = device;
    
    console.log('[GoCubeDriver] Getting Service...');
    this.service = await server.getPrimaryService(SERVICE_UUID);
    
    console.log('[GoCubeDriver] Getting Characteristics...');
    this.writeCharacteristic = await this.service.getCharacteristic(CHRCT_UUID_WRITE);
    this.readCharacteristic = await this.service.getCharacteristic(CHRCT_UUID_READ);

    await this.readCharacteristic.startNotifications();
    this.readCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

    // Request initial state
    await this.writeCharacteristic.writeValue(new Uint8Array([WRITE_STATE]));

    this.deviceName = device.name || 'GoCube';
    this.status = ConnectionStatus.CONNECTED;
    this.emit('status', ConnectionStatus.CONNECTED);
    console.log('[GoCubeDriver] Connected!');
  }

  async disconnect(): Promise<void> {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.status = ConnectionStatus.DISCONNECTED;
    this.emit('status', ConnectionStatus.DISCONNECTED);
  }

  async reset(): Promise<void> {
      // GoCube doesn't have a specific reset command exposed in cstimer,
      // but we can request state.
      if (this.writeCharacteristic) {
          await this.writeCharacteristic.writeValue(new Uint8Array([WRITE_STATE]));
      }
  }

  async syncState(): Promise<void> {
      if (this.writeCharacteristic) {
          await this.writeCharacteristic.writeValue(new Uint8Array([WRITE_STATE]));
      }
  }

  async markAsSolved(): Promise<void> {
      // No-op for GoCube
  }

  private handleNotification(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;

    // Validate header/footer
    if (value.byteLength < 4) return;
    if (value.getUint8(0) !== 0x2a ||
        value.getUint8(value.byteLength - 2) !== 0x0d ||
        value.getUint8(value.byteLength - 1) !== 0x0a) {
        return;
    }

    const msgType = value.getUint8(2);
    const msgLen = value.byteLength - 6;

    switch (msgType) {
        case 1: // Move
            this.handleMove(value, msgLen);
            break;
        case 2: // Cube State (Facelets)
            this.handleFacelets(value);
            break;
        case 5: // Battery
            const level = value.getUint8(3);
            this.emit('battery', level);
            break;
        default:
            // Ignore others (gyro, etc.)
            break;
    }
  }

  private handleMove(value: DataView, msgLen: number): void {
      for (let i = 0; i < msgLen; i += 2) {
          const axisIndex = value.getUint8(3 + i) >> 1;
          if (axisIndex >= AXIS_PERM.length) continue;
          
          const axis = AXIS_PERM[axisIndex];
          const powerVal = value.getUint8(3 + i) & 1;
          const suffix = powerVal === 0 ? "" : "'";
          const move = "URFDLB".charAt(axis) + suffix;

          this.emit('move', {
              move,
              timestamp: Date.now(),
              state: "", // We don't track full state here yet, relying on LogicalCube
              timeDelta: 0
          });
          
          LogicalCube.getInstance().then(cube => cube.applyMove(move));
      }
  }

  private handleFacelets(value: DataView): void {
      // cstimer parsing logic
      // msgType == 2
      const faceOffset = [0, 0, 6, 2, 0, 0];
      const facePerm = [0, 1, 2, 5, 8, 7, 6, 3];
      
      const facelet = new Array(54);
      
      for (let a = 0; a < 6; a++) {
          const axis = AXIS_PERM[a] * 9;
          const aoff = faceOffset[a];
          // Center
          facelet[axis + 4] = "BFUDRL".charAt(value.getUint8(3 + a * 9));
          // Surrounding stickers
          for (let i = 0; i < 8; i++) {
              facelet[axis + facePerm[(i + aoff) % 8]] = "BFUDRL".charAt(value.getUint8(3 + a * 9 + i + 1));
          }
      }
      
      const faceletStr = facelet.join('');
      this.emit('reset', { state: faceletStr });
      LogicalCube.getInstance().then(cube => cube.setHardwareState(faceletStr));
  }
}
