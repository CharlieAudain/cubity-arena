export class Logger {
    private static isDebugMode = false;

    // Check LocalStorage on load so debug persists across reloads
    static init() {
        if (typeof window !== 'undefined') {
            this.isDebugMode = localStorage.getItem('CUBITY_DEBUG') === 'true';
            if (this.isDebugMode) {
                console.log('[Logger] 🟢 Debug Mode Restored from LocalStorage');
            }
        }
    }

    static enable() {
        this.isDebugMode = true;
        localStorage.setItem('CUBITY_DEBUG', 'true');
        console.log('[Logger] 🟢 Debug Mode Enabled');
    }

    static disable() {
        this.isDebugMode = false;
        localStorage.removeItem('CUBITY_DEBUG');
        console.log('[Logger] 🔴 Debug Mode Disabled');
    }

    static log(tag: string, message: string, ...args: any[]) {
        if (this.isDebugMode) {
            console.log(`%c[${tag}]`, 'color: #00ff00; font-weight: bold;', message, ...args);
        }
    }

    static warn(tag: string, message: string, ...args: any[]) {
        if (this.isDebugMode) {
            console.warn(`[${tag}]`, message, ...args);
        }
    }

    static error(tag: string, message: string, error?: any) {
        // Errors are always shown, but formatted nicely
        console.error(`%c[${tag}] 🚨`, 'color: #ff0000; font-weight: bold;', message, error || '');
    }
}

// Initialize immediately
Logger.init();
// Expose to window for manual activation
if (typeof window !== 'undefined') {
    (window as any).CubityLogger = Logger;
}
