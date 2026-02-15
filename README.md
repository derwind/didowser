# Didowser

A minimal, text-based browser engine implementation running on [Bun](https://bun.com/), designed specifically to experiment with [didact](https://github.com/pomber/didact) and understand React's internal architecture (Fiber, Reconciliation, Concurrent Mode) in a CLI environment.

## Features

- **Minimal DOM Implementation**: Custom `Node`, `Element`, and `Text` classes to simulate the browser DOM purely in TypeScript.
- **TUI Rendering**: Renders the DOM tree directly to the terminal using ANSI escape codes.
- **Event Loop Simulation**: Polyfills `window.requestIdleCallback` to simulate the browser's main thread and task scheduling, mimicking native GUI event loops (like Win32 message loop).
- **Interactive**: Supports basic keyboard navigation (Focus management) and events (Click).

## Requirements

- [Bun](https://bun.com/) (Runtime & Package Manager)

## Usage

### 1. Install Dependencies

```sh
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install project dependencies
bun install
```

### 2. Run the Application

Run the browser engine with your application entry point (e.g., `app.jsx`).

```sh
bun didowser.ts app.jsx
```

### 3. Creating Your Own App

Create a file (e.g., `my-app.jsx`) that exports your main component. The engine expects `module.exports = { App };`.

```jsx
const Didact = require("./didact.js");

function App() {
  const [count, setCount] = Didact.useState(0);
  return (
    <div id="main">
      <h1>Hello Didowser</h1>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}

module.exports = { App };
```

## Architecture

Didowser acts as a host environment for Didact:

- **BrowserEngine**: Manages the TUI rendering, input handling (Standard Input), and the centralized event loop.
- **DOM**: A lightweight pure-JS implementation of the DOM Standard required by React/Didact.
- **Runtime**: Leverages Bun to execute JavaScript/JSX directly without complex build steps.

## License

This project is licensed under the MIT License.
