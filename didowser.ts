// @ts-ignore
const fs = require('fs');
// @ts-ignore
const path = require('path');

// ==========================================
// 0. Configuration & Utils
// ==========================================

const CONFIG = {
    TICK_RATE: 100,        // ms per tick (Cycle length)
    DEBUG: true
};

function log(msg: string) {
    if (CONFIG.DEBUG) {
        fs.appendFileSync('debug.log', msg + '\n');
    }
}

// ==========================================
// 1. DOM Implementation (Minimal)
// ==========================================

class Node {
    static get ELEMENT_NODE() { return 1; }
    static get TEXT_NODE() { return 3; }

    nodeType: number;
    nodeName: string;
    childNodes: Node[];
    parentNode: Node | null;
    style: Record<string, any>;
    props: Record<string, any>;
    eventListeners: Record<string, Function[]>;
    nodeValue?: string; // For Text nodes

    get firstChild(): Node | null {
        return this.childNodes[0] || null;
    }

    get nextSibling(): Node | null {
        if (!this.parentNode) return null;
        const index = this.parentNode.childNodes.indexOf(this);
        if (index >= 0 && index < this.parentNode.childNodes.length - 1) {
            return this.parentNode.childNodes[index + 1];
        }
        return null;
    }

    constructor(nodeType: number, nodeName: string) {
        this.nodeType = nodeType;
        this.nodeName = nodeName;
        this.childNodes = [];
        this.parentNode = null;
        this.style = {};
        this.props = {}; // General props storage
        this.eventListeners = {};
    }

    appendChild(child: Node): Node {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }

    removeChild(child: Node): Node {
        const index = this.childNodes.indexOf(child);
        if (index > -1) {
            this.childNodes.splice(index, 1);
            child.parentNode = null;
        }
        return child;
    }

    addEventListener(type: string, handler: Function) {
        if (!this.eventListeners[type]) {
            this.eventListeners[type] = [];
        }
        this.eventListeners[type].push(handler);
    }

    removeEventListener(type: string, handler: Function) {
        if (!this.eventListeners[type]) return;
        const index = this.eventListeners[type].indexOf(handler);
        if (index > -1) {
            this.eventListeners[type].splice(index, 1);
        }
    }

    // Simple property setter
    setAttribute(name: string, value: any) {
        this.props[name] = value;
        // Special handling for style etc. should be done here or in Didact
    }
}

class Element extends Node {
    constructor(tagName: string) {
        super(Node.ELEMENT_NODE, tagName.toUpperCase());
    }
}

class Text extends Node {
    constructor(text: string) {
        super(Node.TEXT_NODE, "#text");
        this.nodeValue = text;
    }
}

// ==========================================
// 2. Browser Engine (TUI & Environment)
// ==========================================

// Global type augmentation
declare global {
    var document: any;
    var window: any;
}

class BrowserEngine {
    rootElement: Element;
    running: boolean;
    frameCount: number;
    inputBuffer: any[];
    focusableNodes: Node[];
    focusedNode: Node | null;

    constructor() {
        this.rootElement = new Element("DIV"); // Equivalent to <div id="root">
        this.rootElement.setAttribute("id", "root");
        this.running = false;
        this.frameCount = 0;
        this.inputBuffer = [];

        // TUI State
        this.focusableNodes = [];
        this.focusedNode = null;

        // Setup Console for TUI (Raw Mode)
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', this.handleInput.bind(this));
        }

        this.setupEnvironment();
    }

    setupEnvironment() {
        // Global Environment Injection
        // DOM API Implementation
        global.document = {
            createElement: (tagName: string) => new Element(tagName),
            createTextNode: (text: string) => new Text(text),
            getElementById: (id: string) => {
                const findNode = (node: Node): Node | null => {
                    if (node.props && node.props['id'] === id) {
                        return node;
                    }
                    for (const child of node.childNodes) {
                        const found = findNode(child);
                        if (found) return found;
                    }
                    return null;
                };
                return findNode(this.rootElement);
            },
            body: this.rootElement,
            addEventListener: () => {},
            removeEventListener: () => {},
        };

        // Scheduling & Timer Processing (Like WM_TIMER processing in Windows)
        global.window = {
            // Implemented with setTimeout for simplicity as a browser event loop implementation.
            // Ideally (in C++/Rust etc.), this would be integrated into the GUI framework's event loop mechanism (e.g., GTK, Win32 API).
            requestIdleCallback: (handler: (deadline: any) => void) => {
                const start = Date.now();
                // Assume the first half of the frame was busy with rendering etc., and fire after TICK_RATE/4 has passed.
                // (Originally meant to be called during main loop idle time. If we wait TICK_RATE, it times out so we throttle it.)
                return setTimeout(() => {
                    handler({
                        didTimeout: false,
                        timeRemaining: () => Math.max(0, CONFIG.TICK_RATE - (Date.now() - start))
                    });
                }, CONFIG.TICK_RATE / 4);
            },
            cancelIdleCallback: (id: NodeJS.Timeout) => clearTimeout(id)
        };

        (global as any).requestIdleCallback = global.window.requestIdleCallback;
        (global as any).cancelIdleCallback = global.window.cancelIdleCallback;

        const getCallerLoc = () => {
            const stack = new Error().stack?.split('\n') || [];
            // 0: Error, 1: getCallerLoc, 2: console.log wrapper, 3: Caller
            const callerLine = stack[3] || '';
            // Simplified extraction of filename:linenumber
            const match = callerLine.match(/([^\/\\]+:\d+):\d+/);
            return match ? match[1] : 'unknown';
        };

        global.console = {
            ...global.console, // Keep original console methods just in case
            log: (...args: any[]) => log(`[LOG][${getCallerLoc()}] ${args.join(' ')}`),
            error: (...args: any[]) => log(`[ERR][${getCallerLoc()}] ${args.join(' ')}`),
        };
    }

    // User Input Handling (Like WM_KEYDOWN processing in Windows)
    handleInput(key: Buffer | string) {
        const keyStr = key.toString();
        // Ctrl+C to exit
        if (keyStr === '\u0003' || keyStr === 'q') {
            this.stop();
            process.exit();
        }

        if (keyStr === '\u001B\u005B\u0041') { // Up Arrow
            this.moveFocus(-1);
        } else if (keyStr === '\u001B\u005B\u0042') { // Down Arrow
            this.moveFocus(1);
        } else if (keyStr === '\r') { // Enter
            this.triggerClick();
        } else if (keyStr === 'd') { // Dump Tree
            log('--- Dump Tree ---');
            this.dumpTree(this.rootElement);
            log('-----------------');
        }

        this.render(); // Immediate re-render on input
    }

    dumpTree(node: Node, depth: number = 0) {
        const indent = "  ".repeat(depth);
        let info = `${indent}${node.nodeName}`;
        if (node instanceof Text) {
            info += `: ${String(node.nodeValue ?? '').trim()}`;
        }
        // Props for elements
        if (node instanceof Element) {
             const props = Object.entries(node.props)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(' ');
             if (props) info += ` (${props})`;
        }

        log(info);

        for (const child of node.childNodes) {
            this.dumpTree(child, depth + 1);
        }
    }

    moveFocus(direction: number) {
        if (this.focusableNodes.length === 0) return;

        let index = this.focusedNode ? this.focusableNodes.indexOf(this.focusedNode) : -1;
        if (index === -1) {
            index = 0;
        } else {
            index = (index + direction + this.focusableNodes.length) % this.focusableNodes.length;
        }
        this.focusedNode = this.focusableNodes[index];
    }

    triggerClick() {
        if (this.focusedNode && this.focusedNode.eventListeners['click']) {
            this.focusedNode.eventListeners['click'].forEach(handler => {
                try {
                    handler({ type: 'click', target: this.focusedNode });
                } catch (e) {
                    log(`Error in click handler: ${e}`);
                }
            });
        }
    }

    start() {
        this.running = true;
        console.clear();
        this.loop();
    }

    stop() {
        this.running = false;
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
    }

    loop() {
        if (!this.running) return;

        // Didact updates are done asynchronously via requestIdleCallback,
        // so here we periodically re-render the screen.
        this.render();

        // Next frame
        setTimeout(() => this.loop(), CONFIG.TICK_RATE);
    }

    // --- Rendering Logic (TUI) ---

    render() {
        // Clear screen (Escape sequence)
        process.stdout.write('\x1Bh'); // Simple clear, does not save cursor position
        process.stdout.write('\x1B[2J'); // Clear full screen
        process.stdout.write('\x1B[0;0H'); // Move cursor to top-left

        // Header
        process.stdout.write(`\x1B[7m Didowser Node.js (Bun) - Frame: ${this.frameCount++} (Press 'q' to quit) \x1B[0m\n\n`);

        // Render DOM Tree
        this.focusableNodes = []; // Reset focus targets
        this.renderNode(this.rootElement, 0);
    }

    renderNode(node: Node, depth: number) {
        const indent = "  ".repeat(depth);
        let output = "";

        if (node instanceof Text) {
            output = `${indent}${node.nodeValue}\n`;
            process.stdout.write(output);
        } else if (node instanceof Element) {
            const isButton = node.nodeName === "BUTTON";
            let prefix = "";
            let suffix = "";
            let content = `<${node.nodeName.toLowerCase()}>`;

            // Style handling (Basic TUI styling)
            if (isButton) {
                this.focusableNodes.push(node);
                content = `[ ${this.getTextContent(node) || 'BUTTON'} ]`;

                // Focus highlight
                if (node === this.focusedNode) {
                    prefix = "\x1B[30;47m"; // Black on White
                    suffix = "\x1B[0m";
                }
            } else if (node.nodeName === "H1") {
                prefix = "\x1B[1;4m"; // Bold Underline
                suffix = "\x1B[0m";
            }

            // If there is info in node.props, display it (for debugging)
            // content += JSON.stringify(node.props);

            if (isButton) {
                // Treat button as not recursively rendering children, but displaying as a label
                process.stdout.write(`${indent}${prefix}${content}${suffix}\n`);
            } else {
                process.stdout.write(`${indent}${prefix}${content}${suffix}\n`);
                for (const child of node.childNodes) {
                    this.renderNode(child, depth + 1);
                }
                // process.stdout.write(`${indent}</${node.nodeName.toLowerCase()}>\n`);
            }
        }
    }

    getTextContent(node: Node): string {
        if (node instanceof Text) return node.nodeValue || "";
        if (node instanceof Element) {
            return node.childNodes.map(c => this.getTextContent(c)).join("");
        }
        return "";
    }
}

// ==========================================
// 3. Main Entry Point
// ==========================================

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        // No args -> Show Usage
        console.log("Didowser - A minimal Node.js TUI browser engine (TypeScript/Bun)");
        console.log("Usage: bun didowser.ts <app_bundle.js>");
        console.log("");
        console.log("Arguments:");
        console.log("  <app_bundle.js>  Path to the bundled JS file exporting your App component.");
        process.exit(0);
    }

    const engine = new BrowserEngine();

    const filePath = args[0];
    try {
        const absolutePath = path.resolve(filePath);
        if (fs.existsSync(absolutePath)) {

            // Load and execute user code
            // Assumes user does: module.exports = App; or module.exports = { App };
            const userModule = require(absolutePath);

            let App = null;
            if (typeof userModule === 'function') {
                App = userModule;
            } else if (userModule.App) {
                App = userModule.App;
            }

            if (App || userModule.render || userModule.default) {
                // If the module executed render by side effect, start engine.
                // Or if userModule exports App/default, we can try to render it if we had a render function.
                // But since Didact is external now, we rely on the user script calling Didact.render().

                // Start Engine Loop
                engine.start();

            } else {
                process.stderr.write("No valid App export found. Please export your main component or render function.\n");
                process.stderr.write("Example: module.exports = { App };\n");
                process.exit(1);
            }

        } else {
            process.stderr.write(`File not found: ${filePath}\n`);
            process.exit(1);
        }
    } catch (e: any) {
        process.stderr.write(`Error loading file: ${e.message}\n`);
        process.exit(1);
    }
}

main();
