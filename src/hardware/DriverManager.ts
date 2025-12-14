/**
 * DriverManager - Universal Device Factory
 * 
 * Responsibilities:
 * 1. Scan for all supported smart cubes (GAN, GoCube, Moyu, QiYi).
 * 2. Select and instantiate the correct driver based on device info.
 * 3. Maintain the active driver instance.
 */

import { SmartDevice } from './SmartDevice';
import { GanDriver } from './drivers/GanDriver';
import { GoCubeDriver } from './drivers/GoCubeDriver';
import { MoyuDriver } from './drivers/MoyuDriver';
import { QiYiDriver } from './drivers/QiYiDriver';
import { ConnectionStatus, CubeMove } from './types';
import { Logger } from '../utils/Logger';

// GAN Company Identifier Codes (0x0001 - 0xFF01)
const GAN_CICS = Array.from({ length: 256 }, (_, i) => (i << 8) | 0x01);

// Driver Registry Interface
interface DriverConfig {
    prefix: string;
    driver: new () => SmartDevice;
    filters: BluetoothLEScanFilter[];
    optionalServices: string[];
    optionalManufacturerData?: number[];
}

// Driver Registry
const DRIVERS: DriverConfig[] = [
    {
        prefix: 'GAN',
        driver: GanDriver,
        filters: [{ namePrefix: 'GAN' }, { namePrefix: 'MG' }, { namePrefix: 'AiCube' }],
        optionalServices: [
            '0000fff0-0000-1000-8000-00805f9b34fb', // GAN V1/Common
            '6e400001-b5a3-f393-e0a9-e50e24dc4179', // GAN V2
            '8653000a-43e6-47b7-9cb0-5fc21d4ae340', // GAN V3
            '00000010-0000-1000-8000-00805f9b34fb', // GAN V4
            '00000010-0000-fff7-fff6-fff5fff4fff0'  // GAN V4 Variant
        ],
        optionalManufacturerData: GAN_CICS
    },
    {
        prefix: 'GoCube',
        driver: GoCubeDriver,
        filters: [{ namePrefix: 'GoCube' }, { namePrefix: 'Rubiks' }],
        optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
    },
    {
        prefix: 'Moyu',
        driver: MoyuDriver,
        filters: [{ namePrefix: 'MHC' }, { namePrefix: 'WCU_MY3' }],
        optionalServices: [
            '00001000-0000-1000-8000-00805f9b34fb', // Old Moyu
            '0783b03e-7735-b5a0-1760-a305d2795cb0'  // New Moyu
        ]
    },
    {
        prefix: 'QiYi',
        driver: QiYiDriver,
        filters: [{ namePrefix: 'QY-QYSC' }, { namePrefix: 'XMD-TornadoV4-i' }],
        optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb']
    }
];

let activeDriver: SmartDevice | null = null;

/**
 * Get the active driver instance
 */
export function getDriver(): SmartDevice {
    if (!activeDriver) {
        // Default to GanDriver if none selected (fallback)
        // In a real scenario, we should wait for connection.
        activeDriver = new GanDriver(); 
    }
    return activeDriver;
}


/**
 * Scan and Connect to any supported device
 */
export async function scanAndConnect(): Promise<void> {
    try {
       
        
        // Aggregate filters and services
        const filters = DRIVERS.flatMap(d => d.filters);
        const optionalServices = Array.from(new Set(DRIVERS.flatMap(d => d.optionalServices)));
        const optionalManufacturerData = Array.from(new Set(DRIVERS.flatMap(d => d.optionalManufacturerData || [])));

        const device = await navigator.bluetooth.requestDevice({
            filters: filters,
            optionalServices: optionalServices,
            optionalManufacturerData: optionalManufacturerData
        });

        
        const server = await device.gatt!.connect();
        const services = await server.getPrimaryServices();
        const serviceUUIDs = services.map(s => s.uuid);
        
      

        // Factory Logic: Select Driver based on Services
        let DriverClass: (new () => SmartDevice) | null = null;
        
        // 1. Check for GAN
        // GAN V2/V3/V4/Common
        if (serviceUUIDs.some(uuid => 
            uuid === '6e400001-b5a3-f393-e0a9-e50e24dc4179' || // V2
            uuid === '8653000a-43e6-47b7-9cb0-5fc21d4ae340' || // V3
            uuid === '00000010-0000-1000-8000-00805f9b34fb' || // V4
            uuid === '00000010-0000-fff7-fff6-fff5fff4fff0' || // V4 Variant
            uuid === '0000fff0-0000-1000-8000-00805f9b34fb'    // Common/V1
        )) {
           
            DriverClass = GanDriver;
        }
        
        // 2. Check for GoCube
        else if (serviceUUIDs.some(uuid => uuid.startsWith('6e400001-b5a3-f393-e0a9-e50e24dcca9e'))) {
          
            DriverClass = GoCubeDriver;
        }
        
        // 3. Check for Moyu
        else if (serviceUUIDs.some(uuid => 
            uuid === '00001000-0000-1000-8000-00805f9b34fb' || // Old
            uuid === '0783b03e-7735-b5a0-1760-a305d2795cb0'    // New
        )) {
            
            DriverClass = MoyuDriver;
        }
        
        // 4. Check for QiYi
        else if (serviceUUIDs.some(uuid => uuid.startsWith('0000fff0-0000-1000-8000-00805f9b34fb'))) {
             // Secondary Identification Strategy: Filter by name since FFF0 is common
            if (device.name && (device.name.startsWith('QY') || device.name.startsWith('XMD'))) {
               
                DriverClass = QiYiDriver;
            } 
        }

        // Refined Selection Logic
        if (!DriverClass) {
            // Fallback to Name-based matching if Service-based failed (unlikely if filters worked)
            for (const d of DRIVERS) {
                if (device.name && (device.name.startsWith(d.prefix) || d.filters.some(f => device.name!.startsWith(f.namePrefix!)))) {
                    DriverClass = d.driver;
                    break;
                }
            }
        }
        
        if (!DriverClass) {
             // Special handling for QiYi vs GAN V1 (both FFF0)
             if (serviceUUIDs.includes('0000fff0-0000-1000-8000-00805f9b34fb')) {
                 if (device.name && (device.name.startsWith('QY') || device.name.startsWith('XMD'))) {
                     DriverClass = QiYiDriver;
                 } else {
                     DriverClass = GanDriver;
                 }
             }
        }

        if (!DriverClass) {
            throw new Error('Could not identify driver for device: ' + device.name);
        }

        // Instantiate
        if (activeDriver) {
            activeDriver.disconnect();
        }
        activeDriver = new DriverClass();
        setupEventForwarding(activeDriver!);
        
        // Attach
        await activeDriver!.attach(device, server, serviceUUIDs);

    } catch (error) {
        Logger.error('DriverManager', 'Connection failed:', error);
        throw error;
    }
}

/**
 * Connect using manual MAC (Legacy/GAN specific)
 */
export async function connectWithMac(macAddress: string): Promise<void> {
    // This is specific to GanDriver for now
    if (activeDriver) activeDriver.disconnect();
    activeDriver = new GanDriver();
    setupEventForwarding(activeDriver);
    // Cast to GanDriver to access connectWithMac
    if (activeDriver instanceof GanDriver) {
        await activeDriver.connectWithMac(macAddress);
    }
}

export function disconnect(): void {
    if (activeDriver) activeDriver.disconnect();
}

export function reset(): void {
    if (activeDriver) activeDriver.reset();
}

export function markAsSolved(): void {
    if (activeDriver) activeDriver.markAsSolved();
}

export function getStatus(): ConnectionStatus {
    return activeDriver ? activeDriver.status : ConnectionStatus.DISCONNECTED;
}

export function getDeviceInfo() {
    if (!activeDriver) return { name: 'None', macAddress: '', batteryLevel: 0 };
    return {
        name: activeDriver.deviceName || 'Unknown',
        macAddress: activeDriver.deviceMAC || '',
        batteryLevel: 0 // TODO: Expose battery
    };
}



// Event Emitter for DriverManager (Singleton)
type Listener = (data: any) => void;
const listeners: Record<string, Set<Listener>> = {
    move: new Set(),
    status: new Set(),
    battery: new Set(),
    facelets: new Set(),
    error: new Set()
};

function emit(event: string, data: any) {
    if (listeners[event]) {
        listeners[event].forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                Logger.error('DriverManager', `Error in ${event} listener:`, e);
            }
        });
    }
}

function on(event: string, callback: Listener) {
    if (!listeners[event]) listeners[event] = new Set();
    listeners[event].add(callback);
}

function off(event: string, callback: Listener) {
    if (listeners[event]) {
        listeners[event].delete(callback);
    }
}

// Forward events from driver to eventBus
function setupEventForwarding(driver: SmartDevice) {
    driver.on('move', (data) => emit('move', data));
    driver.on('status', (data) => emit('status', data));
    driver.on('battery', (data) => emit('battery', data));
    driver.on('facelets', (data) => emit('facelets', data));
    driver.on('error', (data) => emit('error', data));
}

export function onMove(callback: (move: CubeMove) => void): () => void {
    on('move', callback);
    return () => off('move', callback);
}

export function onStatus(callback: (status: ConnectionStatus) => void): () => void {
    on('status', callback as Listener);
    return () => off('status', callback as Listener);
}

export function onBattery(callback: (level: number) => void): () => void {
    on('battery', callback as Listener);
    return () => off('battery', callback as Listener);
}

export function onFacelets(callback: (facelets: string) => void): () => void {
    on('facelets', callback as Listener);
    return () => off('facelets', callback as Listener);
}

export function onError(callback: (err: Error) => void): () => void {
    on('error', callback as Listener);
    return () => off('error', callback as Listener);
}
