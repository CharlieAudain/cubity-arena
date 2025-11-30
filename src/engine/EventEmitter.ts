type Listener = (...args: any[]) => void;

export class EventEmitter {
    private events: { [key: string]: Listener[] } = {};

    on(event: string, listener: Listener): this {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        return this;
    }

    off(event: string, listener: Listener): this {
        if (!this.events[event]) return this;
        this.events[event] = this.events[event].filter(l => l !== listener);
        return this;
    }

    emit(event: string, ...args: any[]): boolean {
        if (!this.events[event]) return false;
        this.events[event].forEach(listener => listener(...args));
        return true;
    }

    removeAllListeners(event?: string): this {
        if (event) {
            delete this.events[event];
        } else {
            this.events = {};
        }
        return this;
    }
}
