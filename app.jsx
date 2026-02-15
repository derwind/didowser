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

const element = <App />
const container = document.getElementById("root");
Didact.render(element, container);

module.exports = { App };
